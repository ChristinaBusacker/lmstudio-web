import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  ElementRef,
  input,
  model,
  signal,
  ViewChild,
} from '@angular/core';

@Component({
  selector: 'app-accordion',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './accordion.html',
  styleUrls: ['./accordion.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Accordion {
  readonly title = input<string>('Details');
  readonly id = input<string>('collapsible');
  readonly open = model<boolean>(true);

  @ViewChild('inner', { static: true })
  private readonly innerEl!: ElementRef<HTMLElement>;

  private readonly contentHeight = signal<number>(0);

  /** Closed => 0, Open => measured height */
  readonly maxHeightPx = computed(() => (this.open() ? this.contentHeight() : 0));

  private ro?: ResizeObserver;
  private mo?: MutationObserver;

  // prevent measurement storms
  private raf1 = 0;
  private raf2 = 0;
  private pending = false;

  constructor(private readonly cdr: ChangeDetectorRef) {
    effect(() => {
      this.open();
      this.scheduleMeasure();
    });
  }

  contentId(): string {
    return `collapsible-panel-${this.id()}`;
  }

  toggle(): void {
    this.open.set(!this.open());
  }

  ngAfterViewInit(): void {
    // initial measure (after first paint)
    this.scheduleMeasure();

    // measure on open/close (after DOM settles)

    // observe inner (content) size changes
    this.ro = new ResizeObserver(() => this.scheduleMeasure());
    this.ro.observe(this.innerEl.nativeElement);

    // observe DOM mutations (async insertions, text changes, attribute changes)
    this.mo = new MutationObserver(() => this.scheduleMeasure());
    this.mo.observe(this.innerEl.nativeElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });
  }

  ngOnDestroy(): void {
    this.ro?.disconnect();
    this.mo?.disconnect();
    if (this.raf1) cancelAnimationFrame(this.raf1);
    if (this.raf2) cancelAnimationFrame(this.raf2);
  }

  private scheduleMeasure(): void {
    if (this.pending) return;
    this.pending = true;

    // Two rAFs = very reliable for "content just changed" + layout calculation
    this.raf1 = requestAnimationFrame(() => {
      this.raf2 = requestAnimationFrame(() => {
        this.pending = false;
        this.measureNow();
      });
    });
  }

  private measureNow(): void {
    const el = this.innerEl.nativeElement;

    // Important: scrollHeight of *inner* is usually the best "natural content height"
    const next = el.scrollHeight;

    // avoid pointless signal updates
    if (next !== this.contentHeight()) {
      this.contentHeight.set(next);

      // OnPush: ensure template sees updated maxHeightPx
      this.cdr.markForCheck();
    }
  }
}
