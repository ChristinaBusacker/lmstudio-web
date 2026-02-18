import { Signal } from '@angular/core';
import { NodeModelEdge, NodeModelNode } from '@shared/types/node-model.types';

export interface NodeModel {
  nodes: Signal<NodeModelNode[]>;
  edges: Signal<NodeModelEdge[]>;
}
