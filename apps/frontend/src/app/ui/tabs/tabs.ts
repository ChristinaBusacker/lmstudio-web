import {
  AfterContentInit,
  AfterViewInit,
  Component,
  computed,
  contentChildren,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  model,
  QueryList,
  signal,
  untracked,
  ViewChildren,
} from '@angular/core';
import { Tab } from './tab';

export type HeaderPosition = 'above' | 'below';

@Component({
  selector: 'app-tabs',
  templateUrl: './tabs.html',
  styleUrl: './tabs.scss',
  standalone: false,
})
export class Tabs implements AfterContentInit, AfterViewInit {
  private readonly hostEl = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  selectedIndex = model<number>(0);

  headerPosition = signal<HeaderPosition>('above');

  private readonly _tabs = contentChildren(Tab);
  tabs = computed(() => this._tabs());

  @ViewChildren('tabBtn', { read: ElementRef })
  private tabButtons!: QueryList<ElementRef<HTMLButtonElement>>;

  inkLeft = signal(0);
  inkWidth = signal(0);

  private focusedIndex = signal(0);

  ngAfterContentInit(): void {
    effect(
      () => {
        const list = this.tabs();
        if (!list.length) return;

        const desired = this.selectedIndex();
        const clamped = this.clampToEnabled(desired);

        if (clamped !== desired) {
          untracked(() => this.selectedIndex.set(clamped));
        }

        untracked(() => this.focusedIndex.set(this.selectedIndex()));
      },
      { injector: this.injector },
    );
  }

  ngAfterViewInit(): void {
    const ro = new ResizeObserver(() => this.updateInkbar());
    ro.observe(this.hostEl.nativeElement);

    effect(
      () => {
        this.selectedIndex();
        queueMicrotask(() => this.updateInkbar());
        queueMicrotask(() => this.scrollTabIntoView(this.selectedIndex()));
      },
      { injector: this.injector },
    );

    this.destroyRef.onDestroy(() => ro.disconnect());
    queueMicrotask(() => this.updateInkbar());
  }

  selectIndex(index: number): void {
    const list = this.tabs();
    if (!list[index] || list[index].disabled()) return;

    this.selectedIndex.set(index);
    this.focusedIndex.set(index);
    queueMicrotask(() => this.focusButton(index));
  }

  onKeydown(ev: KeyboardEvent, index: number): void {
    const key = ev.key;

    if (key === 'ArrowRight' || key === 'ArrowLeft' || key === 'Home' || key === 'End') {
      ev.preventDefault();

      const list = this.tabs();
      if (!list.length) return;

      let next = index;

      if (key === 'Home') next = 0;
      if (key === 'End') next = list.length - 1;
      if (key === 'ArrowRight') next = index + 1;
      if (key === 'ArrowLeft') next = index - 1;

      next = this.wrapIndex(next, list.length);
      next = this.findNextEnabled(next, key === 'ArrowLeft' ? -1 : +1);

      this.focusedIndex.set(next);
      this.focusButton(next);
      return;
    }

    if (key === 'Enter' || key === ' ') {
      ev.preventDefault();
      this.selectIndex(index);
    }
  }

  tabIndexFor(i: number): number {
    return i === this.focusedIndex() ? 0 : -1;
  }

  tabId(i: number): string {
    return `app-tab-${this.uid()}-${i}`;
  }

  panelId(i: number): string {
    return `app-tabpanel-${this.uid()}-${i}`;
  }

  private _uid = `${Math.random().toString(36).slice(2)}`;
  private uid(): string {
    return this._uid;
  }

  private updateInkbar(): void {
    const btns = this.tabButtons?.toArray() ?? [];
    const i = this.selectedIndex();

    const btn = btns[i]?.nativeElement;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const header = this.hostEl.nativeElement.querySelector('.tabs__header') as HTMLElement | null;
    if (!btn || !header) return;

    const headerRect = header.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();

    const left = btnRect.left - headerRect.left;
    const width = btnRect.width;

    this.inkLeft.set(left);
    this.inkWidth.set(width);
  }

  private focusButton(i: number): void {
    const btn = this.tabButtons?.toArray()[i]?.nativeElement;
    btn?.focus();
  }

  private scrollTabIntoView(i: number): void {
    const btn = this.tabButtons?.toArray()[i]?.nativeElement;
    btn?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  private clampToEnabled(i: number): number {
    const list = this.tabs();
    if (!list.length) return 0;

    const idx = Math.max(0, Math.min(i, list.length - 1));
    if (!list[idx].disabled()) return idx;

    for (let step = 1; step < list.length; step++) {
      const r = idx + step;
      if (r < list.length && !list[r].disabled()) return r;
      const l = idx - step;
      if (l >= 0 && !list[l].disabled()) return l;
    }
    return 0;
  }

  private wrapIndex(i: number, len: number): number {
    if (i < 0) return len - 1;
    if (i >= len) return 0;
    return i;
  }

  private findNextEnabled(start: number, dir: -1 | 1): number {
    const list = this.tabs();
    if (!list.length) return 0;

    let i = start;
    for (let tries = 0; tries < list.length; tries++) {
      if (!list[i].disabled()) return i;
      i = this.wrapIndex(i + dir, list.length);
    }
    return start;
  }
}
