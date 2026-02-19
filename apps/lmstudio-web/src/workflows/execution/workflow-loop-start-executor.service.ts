import { Injectable } from '@nestjs/common';
import { WorkflowsService } from '../workflows.service';
import { SettingsService } from '../../settings/settings.service';
import { ChatEngineService } from '../../chats/chat-engine.service';

import type { WorkflowNodeExecutor, NodeExecutionArgs } from './node-executor.interface';
import { renderTemplate, safeJsonParse, toPrettyText } from '../engine/template-renderer';
import { getNumber, getPath, getString } from '@shared/index';
import { EMPTY_JSON_OBJECT } from '@shared/types/workflow-graph.types';
import { toJsonObject } from '../../utils/typed-access';
import { WorkflowExecutionFacade } from './workflow-execution.facade';
import { LOOP_END, LOOP_START, type LoopMode } from '../worker/workflow-worker.constants';

export type LoopRange = { body: string[]; endId: string };

@Injectable()
export class WorkflowLoopStartExecutorService implements WorkflowNodeExecutor {
  readonly type = 'workflow.loopStart';
  private readonly ownerKey = 'default';

  constructor(
    private readonly workflows: WorkflowsService,
    private readonly settings: SettingsService,
    private readonly engine: ChatEngineService,
    private readonly exec: WorkflowExecutionFacade, // to execute body nodes
  ) {}

  private toText(v: unknown): string {
    return toPrettyText(v);
  }

  async execute(args: NodeExecutionArgs): Promise<void> {
    const { runId, nodeId, node, nodeById, incoming, ctx } = args;

    // LoopStart is structural: iteration is always 0 for the start node itself
    // Body nodes run with iteration=index
    const loopCfgRaw = getPath(node, 'config.loop');
    const loopCfg = toJsonObject(loopCfgRaw) ?? EMPTY_JSON_OBJECT;

    const mode = getString(loopCfg.mode, 'until') as LoopMode;

    const joiner = getString(loopCfg.joiner, '\n\n');

    const maxItRaw = getNumber(loopCfg.maxIterations) ?? 10;
    const maxIterations = Math.max(1, Math.min(1000, maxItRaw));

    const countRaw = getNumber(loopCfg.count);
    const count = countRaw === null ? null : Math.max(0, Math.floor(countRaw));

    const conditionPrompt = getString(loopCfg.conditionPrompt).trim();

    if (mode !== 'while' && mode !== 'until' && mode !== 'count') {
      throw new Error(`LoopStart ${nodeId} has invalid mode: ${getString(loopCfg.mode)}`);
    }
    if (mode === 'count') {
      if (count === null) throw new Error(`LoopStart ${nodeId} mode=count requires loop.count`);
    } else {
      if (!conditionPrompt) throw new Error(`LoopStart ${nodeId} missing loop.conditionPrompt`);
    }

    // Resolve profile for condition evaluation (only if needed)
    const profileName = getString(node.profileName).trim();
    if (!profileName) throw new Error(`LoopStart ${nodeId} missing profileName`);

    const profile = await this.settings.resolveProfile(this.ownerKey, profileName);
    if (!profile) throw new Error(`Settings profile not found: ${profileName}`);
    const profileObj = toJsonObject(profile as unknown) ?? EMPTY_JSON_OBJECT;

    const params: Record<string, unknown> = {
      ...(toJsonObject(profileObj.params) ?? EMPTY_JSON_OBJECT),
    };
    params.toolsEnabled = false; // loop condition must never use tools

    const systemPrompt = getString(profileObj.systemPrompt).trim();

    // Find loop end + body range (you already have this computed somewhere today)
    // If your worker already computes a range and passes it into executeLoopStart:
    // then change the interface to pass it in, or store it in node.config.loop.range.
    const range = this.findLoopRangeOrThrow(nodeId, nodeById); // implement based on your existing worker logic

    const startedAt = new Date();
    await this.workflows.upsertNodeRun(runId, nodeId, {
      status: 'running',
      startedAt,
      inputSnapshot: {
        loop: { maxIterations, joiner, mode, count },
        note: 'workflow.loopStart',
      },
      error: null,
    });

    const items: string[] = [];
    const lastBodyId = range.body.length ? range.body[range.body.length - 1] : null;

    const limit = mode === 'count' ? Math.min(maxIterations, count ?? 0) : maxIterations;

    let index = 0;
    while (index < limit) {
      ctx.loop = {
        index,
        iteration: index + 1,
        last: items.length ? items[items.length - 1] : '',
        items: items.slice(),
        joined: items.join(joiner),
      };

      // Execute body nodes
      for (const bodyNodeId of range.body) {
        const bodyNode = nodeById.get(bodyNodeId);
        if (!bodyNode) continue;

        const bodyType = getString(bodyNode.type, 'lmstudio.llm');
        if (bodyType === LOOP_START || bodyType === LOOP_END) {
          throw new Error(`Nested loops not supported (found ${bodyType} in loop body)`);
        }

        await this.exec.executeNode({
          runId,
          nodeId: bodyNodeId,
          node: bodyNode,
          nodeById,
          incoming,
          ctx,
          iteration: index,
        });
      }

      const produced = lastBodyId ? this.toText(ctx.nodes[lastBodyId]) : '';
      items.push(produced);

      // COUNT MODE: deterministic. No LLM call.
      if (mode === 'count') {
        index++;
        continue;
      }

      // WHILE/UNTIL: evaluate via LLM structured output
      params.structuredOutput = {
        enabled: true,
        strict: true,
        name: 'workflow_loop_condition',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: { result: { type: 'boolean' } },
          required: ['result'],
        },
      };

      const loopState = {
        index,
        iteration: index + 1,
        produced,
        items: items.slice(),
        joined: items.join(joiner),
      };

      const condInputText = this.toText({ upstream: ctx.input, loop: loopState });
      const renderedCond = renderTemplate(conditionPrompt, { ...ctx, input: loopState });

      const question =
        mode === 'until'
          ? 'Decide whether the stop condition is satisfied.'
          : 'Decide whether the continue condition is satisfied.';

      const finalPrompt =
        `${question}\n` +
        `Return ONLY a JSON object that matches this schema: {"result": true|false}.\n` +
        `Do not include any other keys, text, or explanation.\n\n` +
        `---\nUPSTREAM_INPUT:\n${condInputText}\n---\n\n` +
        renderedCond;

      const gen = this.engine.streamChat(
        `${runId}:${nodeId}:loop-condition:${index}`,
        [
          ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
          { role: 'user' as const, content: finalPrompt },
        ],
        params,
      );

      let full = '';
      while (true) {
        const { value, done } = await gen.next();
        if (done) break;
        if (value?.delta) full += value.delta;
      }

      const parsed = safeJsonParse(full.trim());
      const result = parsed.ok ? getPath(parsed.value, 'result') : null;
      if (typeof result !== 'boolean') {
        throw new Error(`Loop condition JSON missing boolean field "result"`);
      }

      const shouldContinue = mode === 'while' ? result === true : result === false;
      if (!shouldContinue) break;

      index++;
    }

    const text = items.join(joiner);
    const artifact = await this.workflows.createArtifact(runId, null, {
      kind: 'text',
      mimeType: 'text/plain',
      contentText: text,
    });

    await this.workflows.upsertNodeRun(runId, nodeId, {
      status: 'completed',
      finishedAt: new Date(),
      outputText: text,
      outputJson: null,
      primaryArtifactId: artifact.id,
      inputSnapshot: { loop: { maxIterations, joiner, mode, count }, note: 'workflow.loopStart' },
      error: null,
    });

    // Mark loopEnd structural node completed
    await this.workflows.upsertNodeRun(runId, range.endId, {
      status: 'completed',
      startedAt,
      finishedAt: new Date(),
      outputText: '',
      outputJson: null,
      primaryArtifactId: null,
      inputSnapshot: { sources: [nodeId], note: 'workflow.loopEnd (structural)' },
      error: null,
    });

    ctx.nodes[nodeId] = text;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private findLoopRangeOrThrow(_loopStartId: string, _nodeById: Map<string, any>): LoopRange {
    // Use your existing WorkflowWorker range finder here.
    // I’m not inventing it because you already have it.
    throw new Error('Loop range resolver not wired yet.');
  }
}
