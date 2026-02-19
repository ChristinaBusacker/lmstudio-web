import { Injectable, Inject, forwardRef } from '@nestjs/common';

import { WorkflowsService } from '../workflows.service';
import { SettingsService } from '../../settings/settings.service';
import { ChatEngineService } from '../../chats/chat-engine.service';

import type { WorkflowNodeExecutor, NodeExecutionArgs, LoopRange } from './node-executor.interface';

import { renderTemplate, safeJsonParse, toPrettyText } from '../engine/template-renderer';
import { getNumber, getPath, getString } from '@shared/index';
import { EMPTY_JSON_OBJECT } from '@shared/types/workflow-graph.types';
import { toJsonObject } from '../../utils/typed-access';

import {
  COND_FALSE_PORT,
  COND_TRUE_PORT,
  LOOP_END,
  LOOP_START,
  type LoopMode,
} from '../worker/workflow-worker.constants';

import { compareStringIds } from './workflow-executor.utils';
import { WorkflowNodeExecutorService } from './workflow-node-executor.service';

@Injectable()
export class WorkflowLoopStartExecutorService implements WorkflowNodeExecutor {
  readonly type = 'workflow.loopStart';
  private readonly ownerKey = 'default';

  constructor(
    private readonly workflows: WorkflowsService,
    private readonly settings: SettingsService,
    private readonly engine: ChatEngineService,
    @Inject(forwardRef(() => WorkflowNodeExecutorService))
    private readonly dispatcher: WorkflowNodeExecutorService,
  ) {}

  private toText(v: unknown): string {
    return toPrettyText(v);
  }

  private requireLoopRange(nodeId: string, range: LoopRange | undefined): LoopRange {
    if (!range) {
      throw new Error(
        `LoopStart ${nodeId} missing loopRange metadata. This should be precomputed by WorkflowWorkerService.`,
      );
    }
    return range;
  }

  async execute(args: NodeExecutionArgs): Promise<void> {
    const { runId, nodeId, node, nodeById, incoming, ctx } = args;

    const range = this.requireLoopRange(nodeId, args.loopRange);

    // --- Determine active incoming edges (condition branching) ---
    const edgesInAll = (incoming.get(nodeId) ?? []).slice();

    const edgesIn = edgesInAll.filter((e) => {
      const srcId = getString(e.source).trim();
      const srcNode = nodeById.get(srcId);
      const srcType = getString(srcNode?.type, 'lmstudio.llm');

      if (srcType !== 'workflow.condition') return true;

      const condOut = ctx.nodes?.[srcId];
      if (typeof condOut !== 'boolean') {
        throw new Error(`Missing/invalid condition output for node ${srcId}`);
      }

      const port = getString(e.sourcePort, COND_TRUE_PORT);
      return condOut ? port === COND_TRUE_PORT : port === COND_FALSE_PORT;
    });

    const activeSourcesSorted = edgesIn
      .map((e) => getString(e.source).trim())
      .filter(Boolean)
      .slice()
      .sort(compareStringIds);

    // If this node has incoming edges but none are active (inactive branch), skip.
    if (edgesInAll.length > 0 && activeSourcesSorted.length === 0) {
      const startedAt = new Date();
      await this.workflows.upsertNodeRun(runId, nodeId, {
        status: 'completed',
        startedAt,
        finishedAt: startedAt,
        outputText: '',
        outputJson: null,
        primaryArtifactId: null,
        inputSnapshot: { sources: [], note: 'skipped (inactive condition branch)' },
        error: null,
      });

      await this.workflows.upsertNodeRun(runId, range.endId, {
        status: 'completed',
        startedAt,
        finishedAt: startedAt,
        outputText: '',
        outputJson: null,
        primaryArtifactId: null,
        inputSnapshot: { sources: [nodeId], note: 'workflow.loopEnd (skipped structural)' },
        error: null,
      });

      ctx.nodes[nodeId] = '';
      ctx.nodes[range.endId] = '';
      return;
    }

    // Data-flow: only right->left edges become automatic input.
    const dataEdges = edgesIn.filter(
      (e) =>
        getString(e.sourcePort).trim() === 'port-right' &&
        getString(e.targetPort).trim() === 'port-left',
    );

    const sourcesSorted = dataEdges
      .map((e) => getString(e.source).trim())
      .filter(Boolean)
      .slice()
      .sort(compareStringIds);

    // Build ctx.input from upstream data deps (same semantics as normal nodes)
    if (sourcesSorted.length === 1) {
      const src = sourcesSorted[0];
      if (!(src in ctx.nodes)) {
        throw new Error(`Missing upstream output: ${src} required by ${nodeId}`);
      }
      ctx.input = ctx.nodes[src];
    } else if (sourcesSorted.length > 1) {
      const parts: string[] = [];
      for (const src of sourcesSorted) {
        if (!(src in ctx.nodes)) {
          throw new Error(`Missing upstream output: ${src} required by ${nodeId}`);
        }
        const t = this.toText(ctx.nodes[src]).trim();
        if (!t) continue;
        parts.push(`### Input from ${src}\n${t}`);
      }
      ctx.input = parts.join('\n\n---\n\n');
    } else {
      ctx.input = null;
    }

    // Dependency set for shortcut templating {{nodeId.*}}
    ctx.__depsForRender = new Set<string>(sourcesSorted);

    // --- Read loop config ---
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

    // loop condition must never use tools
    params.toolsEnabled = false;

    const modelKey = getString(params.modelKey).trim();
    if (!modelKey) throw new Error(`Profile "${profileName}" has no modelKey`);

    const systemPrompt = getString(profileObj.systemPrompt).trim();

    const startedAt = new Date();
    await this.workflows.upsertNodeRun(runId, nodeId, {
      status: 'running',
      startedAt,
      inputSnapshot: {
        sources: sourcesSorted,
        profileName,
        modelKey,
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

      // Execute body nodes for this iteration
      for (const bodyNodeId of range.body) {
        const bodyNode = nodeById.get(bodyNodeId);
        if (!bodyNode) continue;

        const bodyType = getString(bodyNode.type, 'lmstudio.llm');
        if (bodyType === LOOP_START || bodyType === LOOP_END) {
          throw new Error(`Nested loops are not supported (found ${bodyType} in loop body)`);
        }

        await this.dispatcher.executeNodeInternal({
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

      // WHILE/UNTIL: evaluate via LLM structured boolean output
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

    const joined = items.join(joiner);
    const loopOut = { items: items.slice(), joined };

    const artifact = await this.workflows.createArtifact(runId, null, {
      kind: 'text',
      mimeType: 'text/plain',
      contentText: joined,
    });

    await this.workflows.upsertNodeRun(runId, nodeId, {
      status: 'completed',
      finishedAt: new Date(),
      outputText: joined,
      outputJson: loopOut,
      primaryArtifactId: artifact.id,
      inputSnapshot: {
        sources: sourcesSorted,
        loop: { maxIterations, joiner, mode, count },
        note: 'workflow.loopStart',
      },
      error: null,
    });

    // loopEnd acts as the "output" node for downstream flow.
    await this.workflows.upsertNodeRun(runId, range.endId, {
      status: 'completed',
      startedAt,
      finishedAt: new Date(),
      outputText: joined,
      outputJson: loopOut,
      primaryArtifactId: artifact.id,
      inputSnapshot: { sources: [nodeId], note: 'workflow.loopEnd (structural)' },
      error: null,
    });

    ctx.nodes[nodeId] = loopOut;
    ctx.nodes[range.endId] = loopOut;
  }
}
