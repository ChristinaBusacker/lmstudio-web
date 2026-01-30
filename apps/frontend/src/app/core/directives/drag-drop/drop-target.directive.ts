import { Directive, ElementRef, HostBinding, Input, OnDestroy, OnInit } from '@angular/core';
import { DragDropService } from './drag-drop.service';

let targetSeq = 0;

@Directive({
  selector: '[dropTarget]',
  standalone: true,
})
export class DropTargetDirective implements OnInit, OnDestroy {
  @Input({ required: true }) dropTargetData!: unknown;
  @Input({ required: true }) dropTargetGroup!: string;
  @Input() dropTargetEnabled = true;

  readonly dropTargetId = `drop-target-${++targetSeq}`;
  readonly hostEl: HTMLElement;

  @HostBinding('class.dd-target') readonly baseClass = true;

  @HostBinding('class.dd-target-disabled') get disabledClass() {
    return !this.dropTargetEnabled;
  }

  @HostBinding('attr.data-drop-target-id') get dataId() {
    return this.dropTargetId;
  }

  private isOver = false;

  constructor(
    elRef: ElementRef<HTMLElement>,
    private readonly dnd: DragDropService,
  ) {
    this.hostEl = elRef.nativeElement;
  }

  ngOnInit(): void {
    this.dnd.registerTarget(this);
  }

  ngOnDestroy(): void {
    this.dnd.unregisterTarget(this);
  }

  // DOM toggle: immediate, works with zoneless, no CD required
  setHover(over: boolean): void {
    if (this.isOver === over) return;
    this.isOver = over;
    this.hostEl.classList.toggle('dd-target-over', over);
  }
}
