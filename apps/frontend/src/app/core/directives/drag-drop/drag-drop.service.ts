import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import type { DragStart } from './drag-drop.types';
import { DropTargetDirective } from './drop-target.directive';

@Injectable({ providedIn: 'root' })
export class DragDropService {
  private readonly _activeDrag$ = new BehaviorSubject<DragStart | null>(null);
  readonly activeDrag$ = this._activeDrag$.asObservable();

  get activeDrag(): DragStart | null {
    return this._activeDrag$.value;
  }

  startDrag(ctx: DragStart): void {
    this._activeDrag$.next(ctx);
  }

  endDrag(): void {
    this._activeDrag$.next(null);
  }

  // --- Global drop targets registry -----------------------------------------
  private readonly targetsByEl = new WeakMap<HTMLElement, DropTargetDirective>();

  registerTarget(target: DropTargetDirective): void {
    this.targetsByEl.set(target.hostEl, target);
  }

  unregisterTarget(target: DropTargetDirective): void {
    this.targetsByEl.delete(target.hostEl);
  }

  resolveTargetFromElement(el: HTMLElement | null): DropTargetDirective | null {
    if (!el) return null;

    const targetEl = el.closest('[data-drop-target-id]') as HTMLElement;
    if (!targetEl) return null;

    let dir = this.targetsByEl.get(targetEl) ?? null;

    if (!dir) {
      let p: HTMLElement | null = targetEl.parentElement;
      let hops = 0;
      while (p && hops < 8) {
        dir = this.targetsByEl.get(p) ?? null;
        if (dir) break;
        p = p.parentElement;
        hops++;
      }
    }

    return dir;
  }
}
