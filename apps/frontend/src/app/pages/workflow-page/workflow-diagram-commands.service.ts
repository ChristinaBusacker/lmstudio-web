/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// workflow-diagram-commands.service.ts
import { Injectable, inject, signal } from '@angular/core';
import {
  NgDiagramModelService,
  NgDiagramSelectionService,
  NgDiagramViewportService,
  type Point,
  type Node,
  type Edge,
} from 'ng-diagram';
import { shortId } from '../../core/utils/shortId.util';

type ClipboardMode = 'copy' | 'cut';

type ClipboardPayload = {
  mode: ClipboardMode;
  nodes: Array<Node<any>>;
  edges: Array<Edge<any>>;
};

@Injectable()
export class WorkflowDiagramCommandsService {
  private readonly model = inject(NgDiagramModelService);
  private readonly selection = inject(NgDiagramSelectionService);
  private readonly viewport = inject(NgDiagramViewportService);

  private readonly lastClientPos = signal<Point | null>(null);
  private clipboard: ClipboardPayload | null = null;

  setLastMouseClientPosition(pos: Point) {
    this.lastClientPos.set(pos);
  }

  copy() {
    const sel = this.selection.selection();
    const selectedIds = sel.nodes.map((n) => n.id);
    if (selectedIds.length === 0) return;

    const json = JSON.parse(this.model.toJSON());
    const idSet = new Set(selectedIds);

    const nodes = (json.nodes ?? []).filter((n: any) => idSet.has(String(n.id)));
    const edges = (json.edges ?? []).filter(
      (e: any) => idSet.has(String(e.source)) && idSet.has(String(e.target)),
    );

    this.clipboard = {
      mode: 'copy',
      nodes: structuredClone(nodes),
      edges: structuredClone(edges),
    };
  }

  cut() {
    const sel = this.selection.selection();
    const selectedIds = sel.nodes.map((n) => n.id);
    if (selectedIds.length === 0 && sel.edges.length === 0) return;

    const json = JSON.parse(this.model.toJSON());
    const idSet = new Set(selectedIds);

    const nodes = (json.nodes ?? []).filter((n: any) => idSet.has(String(n.id)));
    const edges = (json.edges ?? []).filter(
      (e: any) => idSet.has(String(e.source)) && idSet.has(String(e.target)),
    );

    this.clipboard = {
      mode: 'cut',
      nodes: structuredClone(nodes),
      edges: structuredClone(edges),
    };

    this.selection.deleteSelection();
  }

  paste() {
    if (!this.clipboard) return;

    const clientPos = this.lastClientPos() ?? {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    };
    const flowPos = this.viewport.clientToFlowPosition(clientPos);

    const existingIds = new Set(this.model.nodes().map((n) => n.id));
    const payload = structuredClone(this.clipboard);

    const idMap = new Map<string, string>();

    if (payload.mode === 'copy') {
      for (const n of payload.nodes) {
        const newId = this.uniqueId(existingIds);
        idMap.set(String(n.id), newId);
        existingIds.add(newId);
      }
    } else {
      for (const n of payload.nodes) idMap.set(String(n.id), String(n.id));
    }

    const { dx, dy } = this.computePasteTranslation(payload.nodes, flowPos);

    const newNodes = payload.nodes.map((n: any) => {
      const oldId = String(n.id);
      const newId = idMap.get(oldId)!;

      return {
        id: newId,
        type: n.type, // wichtig für Template
        position: n.position
          ? { x: n.position.x + dx, y: n.position.y + dy }
          : { x: flowPos.x, y: flowPos.y },
        data: n.data
          ? {
              ...n.data,
              ...(payload.mode === 'copy' ? { label: newId } : {}),
            }
          : {},
      };
    });

    const newEdges = payload.edges.map((e: any) => {
      const newEdgeId = payload.mode === 'copy' ? this.uniqueId(existingIds) : String(e.id);
      if (payload.mode === 'copy') existingIds.add(newEdgeId);

      return {
        id: newEdgeId,
        source: idMap.get(String(e.source))!,
        target: idMap.get(String(e.target))!,
        sourcePort: e.sourcePort ?? 'port-right',
        targetPort: e.targetPort ?? 'port-left',
        data: e.data ?? {},
      };
    });

    this.model.addNodes(newNodes);
    if (newEdges.length) this.model.addEdges(newEdges);

    // Cut-Clipboard nach Paste leeren, sonst würdest du beim 2. Paste ID-Konflikte bekommen
    if (payload.mode === 'cut') this.clipboard = null;
  }

  private computePasteTranslation(nodes: any[], flowPos: Point) {
    const positions = nodes.map((n) => n.position).filter(Boolean) as Array<{
      x: number;
      y: number;
    }>;
    if (!positions.length) return { dx: 40, dy: 40 };

    const minX = Math.min(...positions.map((p) => p.x));
    const minY = Math.min(...positions.map((p) => p.y));

    return { dx: flowPos.x - minX, dy: flowPos.y - minY };
  }

  private uniqueId(existing: Set<string>) {
    let id = shortId();
    while (existing.has(id)) id = shortId();
    return id;
  }
}
