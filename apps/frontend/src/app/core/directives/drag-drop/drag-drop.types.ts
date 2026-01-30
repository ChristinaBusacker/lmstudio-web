export type DropOrientation = 'vertical' | 'horizontal';

export interface DropResult<T = unknown> {
  group: string;
  item: T;

  from: {
    containerId: string;
    index: number;
  };

  to: {
    containerId: string;
    index: number;
  };

  sameContainer: boolean;
}

export interface DragStart<T = unknown> {
  group: string;
  item: T;
  sourceContainerId: string;
  sourceIndex: number;
  dragElement: HTMLElement;
  dragItemId: string;
}

export interface DropOnTargetResult<TDrag = unknown, TTarget = unknown> {
  group: string;
  item: TDrag;

  from: { containerId: string; index: number };

  target: {
    containerId: string;
    data: TTarget;
    element: HTMLElement;
  };
}
