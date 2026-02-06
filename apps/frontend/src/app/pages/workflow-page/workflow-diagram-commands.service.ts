/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, inject, signal } from '@angular/core';
import {
  NgDiagramModelService,
  NgDiagramSelectionService,
  NgDiagramViewportService,
  type Edge,
  type Node,
  type Point,
} from 'ng-diagram';

import { shortId } from '../../core/utils/shortId.util';

type ClipboardMode = 'copy' | 'cut';

type ClipboardPayload = {
  mode: ClipboardMode;
  nodes: Array<Node<any>>;
  edges: Array<Edge<any>>;
};

/**
 * Provides clipboard-like commands for ngDiagram:
 * - copy / cut / paste selections
 *
 * Notes:
 * - Paste position is derived from last known mouse position.
 * - Copy creates new IDs to avoid collisions.
 * - Cut deletes selection and clears clipboard after paste to prevent re-pasting stale IDs.
 */
@Injectable()
export class WorkflowDiagramCommandsService {
  private readonly model = inject(NgDiagramModelService);
  private readonly selection = inject(NgDiagramSelectionService);
  private readonly viewport = inject(NgDiagramViewportService);

  private readonly lastClientPos = signal<Point | null>(null);
  private clipboard: ClipboardPayload | null = null;

  /**
   * Updates the last mouse position in client coordinates,
   * used as the anchor point for paste.
   */
  setLastMouseClientPosition(pos: Point): void {
    this.lastClientPos.set(pos);
  }

  /**
   * Copies currently selected nodes (and edges between them) to internal clipboard.
   */
  copy(): void {
    const sel = this.selection.selection();
    const selectedIds = sel.nodes.map((n) => n.id);
    if (selectedIds.length === 0) return;

    const json = this.safeDiagramJson();
    const idSet = new Set(selectedIds.map(String));

    const nodes = (json.nodes ?? []).filter((n) => idSet.has(String((n as any).id)));
    const edges = (json.edges ?? []).filter((e) => {
      const src = String((e as any).source);
      const tgt = String((e as any).target);
      return idSet.has(src) && idSet.has(tgt);
    });

    this.clipboard = {
      mode: 'copy',
      nodes: structuredClone(nodes) as Array<Node<any>>,
      edges: structuredClone(edges) as Array<Edge<any>>,
    };
  }

  /**
   * Cuts current selection:
   * - stores it to clipboard
   * - deletes selection from the diagram
   */
  cut(): void {
    const sel = this.selection.selection();
    const selectedIds = sel.nodes.map((n) => n.id);
    if (selectedIds.length === 0 && sel.edges.length === 0) return;

    const json = this.safeDiagramJson();
    const idSet = new Set(selectedIds.map(String));

    const nodes = (json.nodes ?? []).filter((n) => idSet.has(String((n as any).id)));
    const edges = (json.edges ?? []).filter((e) => {
      const src = String((e as any).source);
      const tgt = String((e as any).target);
      return idSet.has(src) && idSet.has(tgt);
    });

    this.clipboard = {
      mode: 'cut',
      nodes: structuredClone(nodes) as Array<Node<any>>,
      edges: structuredClone(edges) as Array<Edge<any>>,
    };

    this.selection.deleteSelection();
  }

  /**
   * Pastes clipboard content:
   * - copy: remaps node IDs, creates new edge IDs
   * - cut: keeps IDs, clears clipboard afterwards
   */
  paste(): void {
    if (!this.clipboard) return;

    const clientPos =
      this.lastClientPos() ??
      ({ x: window.innerWidth / 2, y: window.innerHeight / 2 } satisfies Point);

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

    const { dx, dy } = this.computePasteTranslation(payload.nodes as any[], flowPos);

    const newNodes = (payload.nodes as any[]).map((n) => {
      const oldId = String(n.id);
      const newId = idMap.get(oldId)!;

      return {
        id: newId,
        type: n.type,
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

    const newEdges = (payload.edges as any[]).map((e) => {
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

    if (payload.mode === 'cut') this.clipboard = null;
  }

  private computePasteTranslation(nodes: any[], flowPos: Point): { dx: number; dy: number } {
    const positions = nodes.map((n) => n.position).filter(Boolean) as Array<{
      x: number;
      y: number;
    }>;

    if (!positions.length) return { dx: 40, dy: 40 };

    const minX = Math.min(...positions.map((p) => p.x));
    const minY = Math.min(...positions.map((p) => p.y));

    return { dx: flowPos.x - minX, dy: flowPos.y - minY };
  }

  private uniqueId(existing: Set<string>): string {
    let id = shortId();
    while (existing.has(id)) id = shortId();
    return id;
  }

  private safeDiagramJson(): { nodes?: unknown[]; edges?: unknown[] } {
    try {
      return JSON.parse(this.model.toJSON()) as { nodes?: unknown[]; edges?: unknown[] };
    } catch {
      return {};
    }
  }
}
