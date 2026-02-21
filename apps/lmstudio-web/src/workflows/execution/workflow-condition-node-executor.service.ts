import { Injectable } from '@nestjs/common';
import { WorkflowsService } from '../workflows.service';
import { SettingsService } from '../../settings/settings.service';
import { ChatEngineService } from '../../chats/chat-engine.service';

import type { WorkflowNodeExecutor, NodeExecutionArgs } from './node-executor.interface';
import type { LmMessage } from '../../common/types/llm.types';

import { renderTemplate, safeJsonParse, toPrettyText } from '../engine/template-renderer';
import { getPath, getString } from '@shared/index';
import { toJsonObject } from '../../utils/typed-access';

@Injectable()
export class WorkflowConditionNodeExecutorService implements WorkflowNodeExecutor {
  readonly type = 'workflow.condition';
  private readonly ownerKey = 'default';

  constructor(
    private readonly workflows: WorkflowsService,
    private readonly settings: SettingsService,
    private readonly engine: ChatEngineService,
  ) {}

  private buildMessages(systemPrompt: string, prompt: string): LmMessage[] {
    const msgs: LmMessage[] = [];
    const sys = (systemPrompt ?? '').trim();
    if (sys) msgs.push({ role: 'system', content: sys });
    msgs.push({ role: 'user', content: prompt });
    return msgs;
  }

  private toText(value: unknown): string {
    return toPrettyText(value);
  }

  async execute(args: NodeExecutionArgs): Promise<void> {
    const { runId, nodeId, node, ctx, iteration } = args;

    const profileName = getString(node.profileName).trim();
    const rawPrompt = getString(node.prompt).trim();

    if (!profileName) throw new Error(`Node ${nodeId} missing profileName`);
    if (!rawPrompt) throw new Error(`Node ${nodeId} missing prompt`);

    const profile = await this.settings.resolveProfile(this.ownerKey, profileName);
    if (!profile) throw new Error(`Settings profile not found: ${profileName}`);

    // Settings profiles are TypeORM entities (class instances). Our typed-access helpers only treat
    // plain objects as records, so `toJsonObject(profile)` would become {} and drop params.
    const profileAny = profile as any;
    const params: Record<string, unknown> = { ...(toJsonObject(profileAny?.params) ?? {}) };
    const modelKey = getString(params.modelKey).trim();
    if (!modelKey) throw new Error(`Profile "${profileName}" has no modelKey`);

    // Condition node must always enforce structured boolean output
    params.toolsEnabled = false;
    params.structuredOutput = {
      enabled: true,
      strict: true,
      name: 'workflow_condition',
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { result: { type: 'boolean' } },
        required: ['result'],
      },
    };

    const systemPrompt =
      typeof profileAny?.systemPrompt === 'string' ? profileAny.systemPrompt.trim() : '';

    ctx.__depsForRender = ctx.__depsForRender ?? new Set<string>();
    let renderedPrompt = renderTemplate(rawPrompt, ctx);

    const blocks: string[] = [];

    // Optional loop hint
    const loopLast = typeof ctx.loop?.last === 'string' ? ctx.loop.last.trim() : '';
    if (loopLast) {
      blocks.push(
        `You are in a loop. The text below is the output from the previous iteration.\n` +
          `---\nLAST_ITERATION_OUTPUT:\n${loopLast}\n---\n`,
      );
    }

    // Optional upstream hint (if input exists)
    const inputText = this.toText(ctx.input).trim();
    if (inputText) {
      blocks.push(
        `You are given upstream context from previous workflow steps.\n---\nUPSTREAM_INPUT:\n${inputText}\n---\n`,
      );
    }

    if (blocks.length) renderedPrompt = `${blocks.join('\n')}\n\n${renderedPrompt}`;

    const finalPrompt =
      `Decide whether the condition is satisfied.\n` +
      `Return ONLY a JSON object that matches this schema: {"result": true|false}.\n` +
      `Do not include any other keys, text, or explanation.\n\n` +
      renderedPrompt;

    await this.workflows.upsertNodeRun(runId, nodeId, {
      iteration,
      status: 'running',
      startedAt: new Date(),
      inputSnapshot: {
        profileName,
        modelKey,
        note: 'workflow.condition',
      },
      error: null,
    });

    const gen = this.engine.streamChat(
      `${runId}:${nodeId}:${iteration}`,
      this.buildMessages(systemPrompt, finalPrompt),
      params,
    );

    let full = '';
    while (true) {
      const { value, done } = await gen.next();
      if (done) break;
      if (value?.delta) full += value.delta;
    }

    const parsed = safeJsonParse(full.trim());
    if (!parsed.ok || !parsed.value || typeof parsed.value !== 'object') {
      throw new Error(
        `Condition did not return valid JSON: ${parsed.ok ? 'invalid object' : parsed.error}`,
      );
    }

    const result = getPath(parsed.value, 'result');
    if (typeof result !== 'boolean') {
      throw new Error(`Condition JSON missing boolean field "result"`);
    }

    const artifact = await this.workflows.createArtifact(runId, null, {
      kind: 'json',
      mimeType: 'application/json',
      contentJson: { result },
    });

    await this.workflows.upsertNodeRun(runId, nodeId, {
      iteration,
      status: 'completed',
      finishedAt: new Date(),
      outputText: String(result),
      outputJson: { result },
      primaryArtifactId: artifact.id,
      inputSnapshot: { note: 'workflow.condition' },
      error: null,
    });

    ctx.nodes[nodeId] = result;
  }
}
