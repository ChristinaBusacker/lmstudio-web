/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
import {
  Directive,
  ElementRef,
  EventEmitter,
  HostBinding,
  Input,
  NgZone,
  OnDestroy,
  Output,
  Renderer2,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { DragDropService } from './drag-drop.service';
import type { DropOnTargetResult, DropOrientation, DropResult } from './drag-drop.types';
import { DragItemDirective } from './drag-item.directive';

import { DragPreviewService } from './drag-preview.service';
import { DropTargetDirective } from './drop-target.directive';

let containerSeq = 0;

@Directive({
  selector: '[dropContainer]',
  standalone: true,
})
export class DropContainerDirective implements OnDestroy {
  @Input() dropGroup!: string;
  @Input() dropOrientation: DropOrientation = 'vertical';
  @Input() dropDisabled = false;

  @Input() containerId = `drop-container-${++containerSeq}`;

  @Output() itemDropped = new EventEmitter<DropResult>();
  @Output() itemDroppedOnTarget = new EventEmitter<DropOnTargetResult>();
  @Output() itemEntered = new EventEmitter<void>();
  @Output() itemLeft = new EventEmitter<void>();

  @HostBinding('class.dd-container') readonly baseClass = true;
  @HostBinding('class.dd-over') isOver = false;
  @HostBinding('attr.data-drop-container-id') get dataId() {
    return this.containerId;
  }

  private readonly hostEl: HTMLElement;
  private readonly subs = new Subscription();

  private items = new Set<DragItemDirective>();

  private placeholderEl: HTMLElement | null = null;
  private currentInsertIndex: number | null = null;

  private currentTarget: DropTargetDirective | null = null;

  private pointerMoveUnlisten: (() => void) | null = null;
  private pointerUpUnlisten: (() => void) | null = null;
  private pointerCancelUnlisten: (() => void) | null = null;

  constructor(
    elRef: ElementRef<HTMLElement>,
    private readonly zone: NgZone,
    private readonly renderer: Renderer2,
    private readonly dnd: DragDropService,
    private readonly preview: DragPreviewService,
  ) {
    this.hostEl = elRef.nativeElement;

    // If drag ends externally (cancel, etc.), cleanup local UI.
    this.subs.add(
      this.dnd.activeDrag$.subscribe((drag) => {
        if (!drag) {
          this.cleanupUi();
          this.stopGlobalListeners();
          this.preview.stop();
        }
      }),
    );
  }

  // Called by DragItemDirective
  registerItem(item: DragItemDirective): void {
    this.items.add(item);
  }

  unregisterItem(item: DragItemDirective): void {
    this.items.delete(item);
  }

  // Called by DragItemDirective on drag start
  notifyDragStart(): void {
    this.ensureGlobalListeners();
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.stopGlobalListeners();
    this.preview.stop();
    this.removePlaceholder();
    this.items.clear();
  }

  getItemElements(excludeDragItemId?: string): HTMLElement[] {
    const elems = Array.from(this.items)
      .filter((it) => it.dragItemId !== excludeDragItemId)
      .map((it) => it.hostEl)
      .filter((el) => el && el.isConnected);

    elems.sort((a, b) => {
      if (a === b) return 0;
      const pos = a.compareDocumentPosition(b);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });

    return elems;
  }

  // --------------------------------------------------------------------------

  private ensureGlobalListeners(): void {
    if (this.pointerMoveUnlisten || this.pointerUpUnlisten || this.pointerCancelUnlisten) return;

    this.zone.runOutsideAngular(() => {
      this.pointerMoveUnlisten = this.renderer.listen(
        'document',
        'pointermove',
        (ev: PointerEvent) => this.onGlobalPointerMove(ev),
      );

      // Use window for reliability with pointer capture
      this.pointerUpUnlisten = this.renderer.listen('window', 'pointerup', () =>
        this.onGlobalPointerUp(),
      );

      this.pointerCancelUnlisten = this.renderer.listen('window', 'pointercancel', () =>
        this.onGlobalPointerUp(),
      );
    });
  }

  private stopGlobalListeners(): void {
    this.pointerMoveUnlisten?.();
    this.pointerMoveUnlisten = null;

    this.pointerUpUnlisten?.();
    this.pointerUpUnlisten = null;

    this.pointerCancelUnlisten?.();
    this.pointerCancelUnlisten = null;
  }

  private onGlobalPointerMove(ev: PointerEvent): void {
    const drag = this.dnd.activeDrag;
    if (!drag) return;

    // Move preview always while dragging
    this.preview.move(ev.clientX, ev.clientY);

    if (this.dropDisabled) return;

    // Only one container should react to this group (but multiple can exist)
    if (!this.dropGroup || drag.group !== this.dropGroup) return;

    // 1) Global target hover (works cross-container)
    const target = this.findTargetUnderPointer(ev.clientX, ev.clientY, drag.group);
    if (target) {
      this.currentInsertIndex = null;
      this.removePlaceholder();

      if (this.currentTarget !== target) {
        this.currentTarget?.setHover(false);
        this.currentTarget = target;
        this.currentTarget.setHover(true);
      }

      if (this.isOver) {
        this.isOver = false;
        this.zone.run(() => this.itemLeft.emit());
      }
      return;
    }

    // Not on any target
    this.clearTargetHover();

    // 2) Inside THIS container -> show reorder placeholder
    const rect = this.hostEl.getBoundingClientRect();
    const inside =
      ev.clientX >= rect.left &&
      ev.clientX <= rect.right &&
      ev.clientY >= rect.top &&
      ev.clientY <= rect.bottom;

    if (!inside) {
      if (this.isOver) {
        this.isOver = false;
        this.removePlaceholder();
        this.currentInsertIndex = null;
        this.zone.run(() => this.itemLeft.emit());
      }
      return;
    }

    if (!this.isOver) {
      this.isOver = true;
      this.zone.run(() => this.itemEntered.emit());
    }

    const insertIndex = this.computeInsertIndex(ev.clientX, ev.clientY, drag.dragItemId);
    this.currentInsertIndex = insertIndex;
    this.ensurePlaceholder(drag.dragElement, insertIndex, drag.dragItemId);
  }

  private onGlobalPointerUp(): void {
    const drag = this.dnd.activeDrag;
    if (!drag) return;

    const canDrop =
      !this.dropDisabled &&
      drag.group === this.dropGroup &&
      (this.isOver || this.currentTarget != null);

    if (canDrop) {
      // Drop on target (folder)
      if (this.currentTarget) {
        const res: DropOnTargetResult = {
          group: drag.group,
          item: drag.item,
          from: { containerId: drag.sourceContainerId, index: drag.sourceIndex },
          target: {
            containerId: this.containerId,
            data: this.currentTarget.dropTargetData,
            element: this.currentTarget.hostEl,
          },
        };

        this.zone.run(() => this.itemDroppedOnTarget.emit(res));
      }
      // Drop between items (reorder/insert)
      else if (this.currentInsertIndex != null) {
        const result: DropResult = {
          group: drag.group,
          item: drag.item,
          from: { containerId: drag.sourceContainerId, index: drag.sourceIndex },
          to: { containerId: this.containerId, index: this.currentInsertIndex },
          sameContainer: drag.sourceContainerId === this.containerId,
        };

        this.zone.run(() => this.itemDropped.emit(result));
      }
    }

    // End drag session + cleanup
    this.cleanupUi();
    this.preview.stop();
    this.dnd.endDrag();
  }

  private findTargetUnderPointer(
    clientX: number,
    clientY: number,
    group: string,
  ): DropTargetDirective | null {
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const target = this.dnd.resolveTargetFromElement(el);
    if (!target) return null;
    if (!target.dropTargetEnabled) return null;
    if (target.dropTargetGroup !== group) return null;
    return target;
  }

  private clearTargetHover(): void {
    this.currentTarget?.setHover(false);
    this.currentTarget = null;
  }

  private cleanupUi(): void {
    this.isOver = false;
    this.currentInsertIndex = null;
    this.clearTargetHover();
    this.removePlaceholder();
  }

  // --- Insert index + placeholder -------------------------------------------

  private computeInsertIndex(pointerX: number, pointerY: number, activeDragItemId: string): number {
    const ordered = this.getOrderedItemElements(activeDragItemId);

    if (ordered.length === 0) return 0;

    if (this.dropOrientation === 'horizontal') {
      for (let i = 0; i < ordered.length; i++) {
        const r = ordered[i].getBoundingClientRect();
        const mid = r.left + r.width / 2;
        if (pointerX < mid) return i;
      }
      return ordered.length;
    }

    for (let i = 0; i < ordered.length; i++) {
      const r = ordered[i].getBoundingClientRect();
      const mid = r.top + r.height / 2;
      if (pointerY < mid) return i;
    }
    return ordered.length;
  }

  private getOrderedItemElements(activeDragItemId: string): HTMLElement[] {
    const elems = Array.from(this.items)
      .filter((it) => it.dragItemId !== activeDragItemId)
      .map((it) => it.hostEl)
      .filter((el) => el && el.isConnected);

    elems.sort((a, b) => {
      if (a === b) return 0;
      const pos = a.compareDocumentPosition(b);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });

    return elems;
  }

  private ensurePlaceholder(
    dragEl: HTMLElement,
    insertIndex: number,
    activeDragItemId: string,
  ): void {
    if (!this.placeholderEl) {
      this.placeholderEl = this.renderer.createElement('div') as HTMLElement;
      this.renderer.addClass(this.placeholderEl, 'dd-placeholder');

      const r = dragEl.getBoundingClientRect();
      this.renderer.setStyle(this.placeholderEl, 'width', `${Math.max(1, r.width)}px`);
      this.renderer.setStyle(this.placeholderEl, 'height', `${Math.max(1, r.height)}px`);
    }

    const referenceElements = this.getOrderedItemElements(activeDragItemId);
    const beforeEl = referenceElements[insertIndex] ?? null;

    if (beforeEl && beforeEl.parentElement === this.hostEl) {
      this.hostEl.insertBefore(this.placeholderEl, beforeEl);
    } else {
      if (this.placeholderEl.parentElement !== this.hostEl) {
        this.hostEl.appendChild(this.placeholderEl);
      } else if (this.hostEl.lastElementChild !== this.placeholderEl) {
        this.hostEl.appendChild(this.placeholderEl);
      }
    }
  }

  private removePlaceholder(): void {
    if (!this.placeholderEl) return;
    this.placeholderEl.parentElement?.removeChild(this.placeholderEl);
    this.placeholderEl = null;
  }
}
