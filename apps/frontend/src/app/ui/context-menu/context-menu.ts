import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type { ContextMenuItem, ContextMenuPosition } from './context-menu.types';
import { Icon } from '../icon/icon';

type Placement = 'tl' | 'tr' | 'bl' | 'br';

@Component({
  selector: 'app-context-menu',
  standalone: true,
  imports: [CommonModule, Icon],
  templateUrl: './context-menu.html',
  styleUrl: './context-menu.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContextMenu<TContext = unknown> implements AfterViewInit {
  private _pos: ContextMenuPosition = { x: 0, y: 0 };
  private viewReady = false;

  /** PAGE coords (MouseEvent.pageX/Y) */
  @Input({ required: true })
  set position(v: ContextMenuPosition) {
    this._pos = v ?? { x: 0, y: 0 };
    // sobald View ready ist: reposition nach Layout
    if (this.viewReady) {
      this.reposition();
    }
  }
  get position(): ContextMenuPosition {
    return this._pos;
  }

  @Input({ required: true }) items: Array<ContextMenuItem<TContext>> = [];
  @Input({ required: true }) context!: TContext;

  @Output() close = new EventEmitter<void>();
  @ViewChild('menuEl') private menuEl?: ElementRef<HTMLElement>;

  leftPx = 0;
  topPx = 0;
  placement: Placement = 'tl';

  ngAfterViewInit(): void {
    this.viewReady = true;
    requestAnimationFrame(() => requestAnimationFrame(() => this.reposition()));
  }

  onOverlayClick(): void {
    this.close.emit();
  }

  onKeydown(ev: KeyboardEvent): void {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      this.close.emit();
    }
  }

  async onItemClick(item: ContextMenuItem<TContext>, ev: MouseEvent): Promise<void> {
    ev.preventDefault();
    ev.stopPropagation();

    if (this.isHidden(item)) return;
    if (this.isDisabled(item)) return;

    await item.action(this.context);
    this.close.emit();
  }

  isDisabled(item: ContextMenuItem<TContext>): boolean {
    return typeof item.disabled === 'function' ? item.disabled(this.context) : !!item.disabled;
  }

  isHidden(item: ContextMenuItem<TContext>): boolean {
    return typeof item.hidden === 'function' ? item.hidden(this.context) : !!item.hidden;
  }

  trackById = (_: number, it: ContextMenuItem<TContext>) => it.id;

  private reposition(): void {
    const el = this.menuEl?.nativeElement;
    if (!el) return;

    // Menü ist position: fixed -> viewport coords
    const x = this.position.x - window.scrollX;
    const y = this.position.y - window.scrollY;

    const menuW = el.offsetWidth || 220;
    const menuH = el.offsetHeight || 140;

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const spaceRight = vw - x;
    const spaceLeft = x;
    const spaceBottom = vh - y;
    const spaceTop = y;

    const openRight = spaceRight >= menuW || spaceRight >= spaceLeft;
    const openDown = spaceBottom >= menuH || spaceBottom >= spaceTop;

    if (openRight && openDown) this.placement = 'tl';
    else if (!openRight && openDown) this.placement = 'tr';
    else if (openRight && !openDown) this.placement = 'bl';
    else this.placement = 'br';

    let left = x;
    let top = y;

    if (this.placement === 'tr' || this.placement === 'br') left = x - menuW;
    if (this.placement === 'bl' || this.placement === 'br') top = y - menuH;

    left = Math.max(8, Math.min(left, vw - menuW - 8));
    top = Math.max(8, Math.min(top, vh - menuH - 8));

    this.leftPx = left;
    this.topPx = top;

    if (this.menuEl) {
      this.menuEl.nativeElement.style.left = left + 'px';
      this.menuEl.nativeElement.style.top = top + 'px';
      this.menuEl.nativeElement.style.display = 'block';
    }
  }
}
