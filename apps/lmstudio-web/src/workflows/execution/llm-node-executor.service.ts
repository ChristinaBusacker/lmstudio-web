import { Injectable, Logger } from '@nestjs/common';
import { WorkflowsService } from '../workflows.service';
import { SettingsService } from '../../settings/settings.service';
import { ChatEngineService } from '../../chats/chat-engine.service';

import type { WorkflowNodeExecutor, NodeExecutionArgs } from './node-executor.interface';
import type { LmMessage } from '../../common/types/llm.types';
import { renderTemplate, safeJsonParse, toPrettyText } from '../engine/template-renderer';
import { getPath, getString, isJsonObject } from '@shared/index';
import { isRecord, toJsonObject, toJsonValue } from '../../utils/typed-access';

@Injectable()
export class LlmNodeExecutorService implements WorkflowNodeExecutor {
  readonly type = 'lmstudio.llm';

  private readonly logger = new Logger(LlmNodeExecutorService.name);
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

    const rawPrompt = getString(node.prompt).trim();
    const profileName = getString(node.profileName).trim();

    if (!profileName) throw new Error(`Node ${nodeId} missing profileName`);
    if (!rawPrompt) throw new Error(`Node ${nodeId} missing prompt`);

    // Render prompt with workflow context
    ctx.__depsForRender = ctx.__depsForRender ?? new Set<string>();
    const renderedPrompt = renderTemplate(rawPrompt, ctx);

    const profile = await this.settings.resolveProfile(this.ownerKey, profileName);
    if (!profile) throw new Error(`Settings profile not found: ${profileName}`);

    // NOTE:
    // Settings profiles are TypeORM entities (class instances). Our typed-access helpers intentionally
    // treat ONLY plain objects as records, so `toJsonObject(profile)` would return {} and drop params.
    // Therefore we read `params` directly and normalize it.
    const profileAny = profile as any;
    const params: Record<string, unknown> = {
      ...(toJsonObject(profileAny?.params) ?? {}),
    };

    const modelKey = getString(params.modelKey).trim();
    if (!modelKey) throw new Error(`Profile "${profileName}" has no modelKey`);

    // Node-level structured output:
    // IMPORTANT: In workflows, LLM nodes never call tools. So structured output must be honored.
    const nodeStructured = getPath(node, 'config.llm.structuredOutput');
    const nodeStructuredObj = toJsonObject(nodeStructured);
    if (nodeStructuredObj?.enabled === true) {
      params.structuredOutput = {
        enabled: true,
        strict: nodeStructuredObj.strict === false ? false : true,
        name: getString(nodeStructuredObj.name, 'node_structured_output'),
        schema: isJsonObject(nodeStructuredObj.schema)
          ? nodeStructuredObj.schema
          : { type: 'object' },
      };
    }

    // Enforce: no tool calls in workflow LLM nodes
    params.toolsEnabled = false;

    const systemPrompt =
      typeof profileAny?.systemPrompt === 'string' ? profileAny.systemPrompt.trim() : '';

    await this.workflows.upsertNodeRun(runId, nodeId, {
      iteration,
      status: 'running',
      startedAt: new Date(),
      inputSnapshot: {
        profileName,
        modelKey,
        note: 'lmstudio.llm',
      },
      error: null,
    });

    const streamId = `${runId}:${nodeId}:${iteration}`;
    const messages = this.buildMessages(systemPrompt, renderedPrompt);

    this.logger.log(
      `Workflow LLM node ${nodeId}: tools=OFF structured=${getPath(params, 'structuredOutput.enabled') === true}`,
    );

    const gen = this.engine.streamChat(streamId, messages, params);

    let full = '';
    while (true) {
      const { value, done } = await gen.next();
      if (done) break;
      if (value?.delta) full += value.delta;
    }

    const structuredEnabled = getPath(params, 'structuredOutput.enabled') === true;
    const parsed = safeJsonParse(full.trim());

    if (structuredEnabled && !parsed.ok) {
      throw new Error(
        `Structured output is enabled for node ${nodeId}, but the model did not return valid JSON: ${parsed.error}`,
      );
    }

    if (parsed.ok) {
      if (structuredEnabled && !isRecord(parsed.value)) {
        throw new Error(
          `Structured output is enabled for node ${nodeId}, but the model returned non-object JSON.`,
        );
      }

      const parsedObj = isRecord(parsed.value)
        ? toJsonObject(parsed.value)
        : toJsonObject({ value: toJsonValue(parsed.value) });

      const artifact = await this.workflows.createArtifact(runId, null, {
        kind: 'json',
        mimeType: 'application/json',
        contentJson: parsedObj,
      });

      await this.workflows.upsertNodeRun(runId, nodeId, {
        iteration,
        status: 'completed',
        finishedAt: new Date(),
        outputText: null,
        outputJson: parsedObj,
        primaryArtifactId: artifact.id,
        inputSnapshot: { note: 'lmstudio.llm (json)' },
        error: null,
      });

      ctx.nodes[nodeId] = parsedObj;
      return;
    }

    // Fallback to plain text
    const artifact = await this.workflows.createArtifact(runId, null, {
      kind: 'text',
      mimeType: 'text/plain',
      contentText: full,
    });

    await this.workflows.upsertNodeRun(runId, nodeId, {
      iteration,
      status: 'completed',
      finishedAt: new Date(),
      outputText: full,
      outputJson: null,
      primaryArtifactId: artifact.id,
      inputSnapshot: { note: 'lmstudio.llm (text)' },
      error: null,
    });

    ctx.nodes[nodeId] = full;
  }
}
