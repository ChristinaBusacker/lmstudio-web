import {
  Directive,
  ElementRef,
  HostBinding,
  HostListener,
  Inject,
  Input,
  NgZone,
  OnDestroy,
  OnInit,
  Optional,
  Renderer2,
} from '@angular/core';
import { DragDropService } from './drag-drop.service';
import type { DragStart } from './drag-drop.types';
import { DropContainerDirective } from './drop-container.directive';
import { DragPreviewService } from './drag-preview.service';

let itemSeq = 0;

@Directive({
  selector: '[dragItem]',
  standalone: true,
})
export class DragItemDirective implements OnInit, OnDestroy {
  @Input({ required: true }) dragData: unknown;
  @Input() dragDisabled = false;
  @Input() dragHandleSelector?: string;

  @HostBinding('class.dd-item') readonly baseClass = true;
  @HostBinding('class.dd-dragging') isDragging = false;
  @HostBinding('style.touchAction') readonly touchAction = 'none';

  readonly dragItemId = `drag-item-${++itemSeq}`;
  readonly hostEl: HTMLElement;

  private pointerId: number | null = null;
  private unlistenLostCapture: (() => void) | null = null;

  constructor(
    elRef: ElementRef<HTMLElement>,
    private readonly renderer: Renderer2,
    private readonly zone: NgZone,
    private readonly dnd: DragDropService,
    private readonly preview: DragPreviewService,
    @Optional() @Inject(DropContainerDirective) private readonly container?: DropContainerDirective,
  ) {
    this.hostEl = elRef.nativeElement;
  }

  ngOnInit(): void {
    this.container?.registerItem(this);
  }

  ngOnDestroy(): void {
    this.container?.unregisterItem(this);
    this.unlistenLostCapture?.();
    this.unlistenLostCapture = null;

    if (this.dnd.activeDrag?.dragItemId === this.dragItemId) {
      // safety: container normally ends the drag
      this.preview.stop();
      this.dnd.endDrag();
    }
  }

  @HostListener('pointerdown', ['$event'])
  onPointerDown(ev: PointerEvent): void {
    if (this.dragDisabled) return;
    if (!this.container) return;

    if (this.dragHandleSelector) {
      const handle = (ev.target as HTMLElement | null)?.closest(this.dragHandleSelector);
      if (!handle || !this.hostEl.contains(handle)) return;
    }

    if (ev.pointerType === 'mouse' && ev.button !== 0) return;

    ev.preventDefault();

    this.pointerId = ev.pointerId;
    this.hostEl.setPointerCapture(ev.pointerId);

    const sourceIndex = this.containerIndex();

    const ctx: DragStart = {
      group: this.container.dropGroup,
      item: this.dragData,
      sourceContainerId: this.container.containerId,
      sourceIndex,
      dragElement: this.hostEl,
      dragItemId: this.dragItemId,
    };

    this.isDragging = true;
    this.renderer.addClass(this.hostEl, 'dd-drag-source');
    this.renderer.addClass(this.hostEl, 'dd-drag-source-hidden');

    this.dnd.startDrag(ctx);
    this.preview.start(this.hostEl, ev.clientX, ev.clientY);

    this.container.notifyDragStart();

    // If browser interrupts capture, abort safely
    this.zone.runOutsideAngular(() => {
      this.unlistenLostCapture?.();
      this.unlistenLostCapture = this.renderer.listen(this.hostEl, 'lostpointercapture', () => {
        this.unlistenLostCapture?.();
        this.unlistenLostCapture = null;
        this.finishDragFallback();
      });
    });
  }

  @HostListener('pointerup', ['$event'])
  onPointerUp(ev: PointerEvent): void {
    // IMPORTANT: container handles drop + endDrag
    ev.preventDefault();
  }

  @HostListener('pointercancel')
  onPointerCancel(): void {
    this.finishDragFallback();
  }

  /** Fallback only (cancel/interrupt). Normal end happens in DropContainerDirective. */
  private finishDragFallback(): void {
    if (!this.isDragging) return;

    this.isDragging = false;
    this.renderer.removeClass(this.hostEl, 'dd-drag-source');
    this.renderer.removeClass(this.hostEl, 'dd-drag-source-hidden');

    if (this.pointerId != null) {
      try {
        this.hostEl.releasePointerCapture(this.pointerId);
      } catch {
        // ignore
      }
      this.pointerId = null;
    }

    this.preview.stop();
    this.dnd.endDrag();
  }

  private containerIndex(): number {
    if (!this.container) return -1;
    const siblings = this.container.getItemElements(this.dragItemId);
    return siblings.indexOf(this.hostEl);
  }
}
