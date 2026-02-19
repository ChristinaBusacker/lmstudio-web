import { Injectable } from '@nestjs/common';
import { WorkflowsService } from '../workflows.service';
import { ToolOrchestratorService } from '../../tools/tool-orchestrator.service';

import type { WorkflowNodeExecutor, NodeExecutionArgs } from './node-executor.interface';
import { renderTemplate } from '../engine/template-renderer';
import { getPath, getString } from '@shared/index';
import { toJsonValue } from '../../utils/typed-access';
import { WorkflowToolConfig } from '@shared/types/workflow-graph.types';

@Injectable()
export class WorkflowToolNodeExecutorService implements WorkflowNodeExecutor {
  readonly type = 'workflow.tool';

  constructor(
    private readonly workflows: WorkflowsService,
    private readonly toolOrchestrator: ToolOrchestratorService,
  ) {}

  async execute(args: NodeExecutionArgs): Promise<void> {
    const { runId, nodeId, node, ctx, iteration } = args;

    const config = node.config as WorkflowToolConfig | undefined;
    const toolConfig = config?.tool;
    const toolName = getString(toolConfig?.name).trim();
    if (!toolName) throw new Error(`workflow.tool missing config.tool.name (node ${nodeId})`);

    const rawArgs = getPath(node, 'config.tool.args');

    // Render templates inside args (strings)
    ctx.__depsForRender = ctx.__depsForRender ?? new Set<string>();

    const isPlainObject = (v: unknown): v is Record<string, unknown> =>
      typeof v === 'object' && v !== null && !Array.isArray(v);

    const renderAny = (v: unknown): unknown => {
      if (typeof v === 'string') return renderTemplate(v, ctx);
      if (Array.isArray(v)) return v.map((x) => renderAny(x));
      if (isPlainObject(v)) {
        const out: Record<string, unknown> = {};
        for (const [k, vv] of Object.entries(v)) out[k] = renderAny(vv);
        return out;
      }
      return v;
    };

    const renderedArgs = renderAny(rawArgs);
    const toolArgs: Record<string, unknown> = isPlainObject(renderedArgs) ? renderedArgs : {};

    await this.workflows.upsertNodeRun(runId, nodeId, {
      iteration,
      status: 'running',
      startedAt: new Date(),
      inputSnapshot: {
        toolName,
        toolArgs: toJsonValue(toolArgs),
        note: 'workflow.tool',
      },
      error: null,
    });

    const { result, artifactId } = await this.toolOrchestrator.executeToolDirect({
      runId,
      toolName,
      toolArgs,
    });

    const outputText = typeof result === 'string' ? result : JSON.stringify(result, null, 2);

    let primaryArtifactId: string | null = artifactId ? String(artifactId) : null;

    if (!primaryArtifactId) {
      const artifact =
        typeof result === 'string'
          ? await this.workflows.createArtifact(runId, null, {
              kind: 'text',
              mimeType: 'text/plain',
              contentText: result,
            })
          : await this.workflows.createArtifact(runId, null, {
              kind: 'json',
              mimeType: 'application/json',
              contentJson: result,
            });
      primaryArtifactId = artifact.id;
    }

    await this.workflows.upsertNodeRun(runId, nodeId, {
      iteration,
      status: 'completed',
      finishedAt: new Date(),
      outputText,
      outputJson: typeof result === 'string' ? null : result,
      primaryArtifactId,
      inputSnapshot: { toolName, note: 'workflow.tool' },
      error: null,
    });

    ctx.nodes[nodeId] = result;
  }
}
