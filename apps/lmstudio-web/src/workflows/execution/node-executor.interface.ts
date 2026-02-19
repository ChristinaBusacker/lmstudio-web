import type { IncomingEdge, WorkflowGraphNode } from '../engine/graph-types';
import type { WorkflowRenderContext } from '../engine/template-renderer';

export type LoopRange = { body: string[]; endId: string };

export interface NodeExecutionArgs {
  runId: string;
  nodeId: string;
  node: WorkflowGraphNode;
  nodeById: Map<string, WorkflowGraphNode>;
  incoming: Map<string, IncomingEdge[]>;
  ctx: WorkflowRenderContext;
  iteration: number;

  /** Only set for workflow.loopStart execution. */
  loopRange?: LoopRange;
}

export interface WorkflowNodeExecutor {
  /** Node type key, e.g. "lmstudio.llm" */
  readonly type: string;
  execute(args: NodeExecutionArgs): Promise<void>;
}
