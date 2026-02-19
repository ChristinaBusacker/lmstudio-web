import { forwardRef, Inject, Injectable } from '@nestjs/common';
import type { IncomingEdge, WorkflowGraphNode } from '../engine/graph-types';
import type { WorkflowRenderContext } from '../engine/template-renderer';
import type { NodeExecutionArgs } from './node-executor.interface';
import { WorkflowNodeExecutorService } from './workflow-node-executor.service';

@Injectable()
export class WorkflowExecutionFacade {
  constructor(
    @Inject(forwardRef(() => WorkflowNodeExecutorService))
    private readonly dispatcher: WorkflowNodeExecutorService,
  ) {}

  async executeNode(args: NodeExecutionArgs): Promise<void> {
    // Dispatcher exposes this wrapper so loop executor can execute body nodes
    return this.dispatcher.executeNodeInternal(args);
  }

  async executeTopLevel(args: {
    runId: string;
    nodeId: string;
    node: WorkflowGraphNode;
    nodeById: Map<string, WorkflowGraphNode>;
    incoming: Map<string, IncomingEdge[]>;
    ctx: WorkflowRenderContext;
  }): Promise<void> {
    return this.dispatcher.executeNodeTopLevel(args);
  }
}
