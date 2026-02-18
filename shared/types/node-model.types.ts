export interface NodePosition {
  x: number;
  y: number;
}

export interface NodeSize {
  width: number;
  height: number;
}

export interface ToolConfig {
  name: string;
  args: {
    url: string;
  };
}

export interface ExportConfig {
  filename: string;
}

export interface NodeConfig {
  tool?: ToolConfig;
  export?: ExportConfig;
}

export interface NodeModelNode {
  id: string;
  type: string;
  profileName: string;
  prompt: string;
  config: NodeConfig;
  inputFrom: string | null;
  position: NodePosition;
  size: NodeSize;
  autoSize?: boolean;
}

export interface NodeModelEdge {
  id: string;
  source: string;
  target: string;
  sourcePort: string;
  targetPort: string;
  data: Record<string, unknown>;
  computedZIndex: number;
}

export interface NodeDiagramModel {
  nodes: NodeModelNode[];
  edges: NodeModelEdge[];
}
