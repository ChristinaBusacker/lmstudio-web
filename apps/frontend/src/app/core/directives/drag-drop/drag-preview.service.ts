import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class DragPreviewService {
  private root: HTMLElement | null = null;
  private previewEl: HTMLElement | null = null;

  private offsetX = 0;
  private offsetY = 0;

  private rafPending = false;
  private nextX = 0;
  private nextY = 0;

  // Optional: replicate context classes (theme/sidebar) so CSS selectors still match
  private rootClassList: string[] = [];

  setRootClasses(classes: string[]): void {
    this.rootClassList = classes;
    if (this.root) {
      this.root.className = 'dd-preview-root';
      for (const c of classes) this.root.classList.add(c);
    }
  }

  start(sourceEl: HTMLElement, clientX: number, clientY: number): void {
    this.stop();

    const rect = sourceEl.getBoundingClientRect();
    this.offsetX = rect.left - clientX;
    this.offsetY = rect.top - clientY;

    const root = this.ensureRoot();

    const clone = sourceEl.cloneNode(true) as HTMLElement;
    clone.classList.add('dd-drag-preview');

    // Size lock (prevents reflow weirdness)
    clone.style.width = `${Math.max(1, rect.width)}px`;
    clone.style.height = `${Math.max(1, rect.height)}px`;
    clone.style.boxSizing = 'border-box';

    // Performance + no lag due to transitions
    clone.style.pointerEvents = 'none';
    clone.style.willChange = 'transform';
    clone.style.transition = 'none';
    clone.style.animation = 'none';

    // Copy key computed styles (pragmatic set)
    this.copyEssentialComputedStyles(sourceEl, clone);

    root.appendChild(clone);
    this.previewEl = clone;

    // Place immediately
    this.setTransform(clientX, clientY);
  }

  move(clientX: number, clientY: number): void {
    if (!this.previewEl) return;

    this.nextX = clientX + this.offsetX;
    this.nextY = clientY + this.offsetY;

    if (this.rafPending) return;
    this.rafPending = true;

    requestAnimationFrame(() => {
      this.rafPending = false;
      if (!this.previewEl) return;
      this.previewEl.style.transform = `translate3d(${this.nextX}px, ${this.nextY}px, 0)`;
    });
  }

  stop(): void {
    if (this.previewEl?.parentElement) {
      this.previewEl.parentElement.removeChild(this.previewEl);
    }
    this.previewEl = null;
    this.rafPending = false;
  }

  private ensureRoot(): HTMLElement {
    if (this.root && document.body.contains(this.root)) return this.root;

    const root = document.createElement('div');
    root.className = 'dd-preview-root';
    root.style.position = 'fixed';
    root.style.left = '0';
    root.style.top = '0';
    root.style.zIndex = '999999';
    root.style.pointerEvents = 'none';
    root.style.width = '0';
    root.style.height = '0';

    for (const c of this.rootClassList) root.classList.add(c);

    document.body.appendChild(root);
    this.root = root;
    return root;
  }

  private setTransform(clientX: number, clientY: number): void {
    if (!this.previewEl) return;
    const x = clientX + this.offsetX;
    const y = clientY + this.offsetY;
    this.previewEl.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }

  private copyEssentialComputedStyles(sourceEl: HTMLElement, cloneEl: HTMLElement): void {
    const cs = window.getComputedStyle(sourceEl);

    // Curated list: good visuals without copying 300 props
    const props = [
      'display',
      'background',
      'background-color',
      'color',
      'border',
      'border-radius',
      'box-shadow',
      'padding',
      'font',
      'font-family',
      'font-size',
      'font-weight',
      'line-height',
      'letter-spacing',
      'text-transform',
      'text-align',
      'opacity',
    ];

    for (const p of props) {
      cloneEl.style.setProperty(p, cs.getPropertyValue(p));
    }
  }
}
