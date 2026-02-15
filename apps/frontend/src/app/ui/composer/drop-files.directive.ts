// Comments in English as requested.

import {
  Directive,
  ElementRef,
  EventEmitter,
  HostBinding,
  HostListener,
  Output,
  inject,
} from '@angular/core';

@Directive({
  selector: '[appDropFiles]',
  standalone: true,
})
export class DropFilesDirective {
  private readonly el = inject(ElementRef<HTMLElement>);

  @Output() filesDropped = new EventEmitter<File[]>();
  @Output() dragActiveChange = new EventEmitter<boolean>();

  @HostBinding('class.drop-active')
  isActive = false;

  private dragDepth = 0;

  @HostListener('dragenter', ['$event'])
  onDragEnter(ev: DragEvent): void {
    if (!this.hasFiles(ev)) return;
    ev.preventDefault();
    this.dragDepth++;
    this.setActive(true);
  }

  @HostListener('dragover', ['$event'])
  onDragOver(ev: DragEvent): void {
    if (!this.hasFiles(ev)) return;
    ev.preventDefault();
    ev.dataTransfer!.dropEffect = 'copy';
    this.setActive(true);
  }

  @HostListener('dragleave', ['$event'])
  onDragLeave(ev: DragEvent): void {
    if (!this.hasFiles(ev)) return;
    ev.preventDefault();

    // dragleave fires a lot (child elements). Track depth to avoid flicker.
    this.dragDepth = Math.max(0, this.dragDepth - 1);
    if (this.dragDepth === 0) this.setActive(false);
  }

  @HostListener('drop', ['$event'])
  onDrop(ev: DragEvent): void {
    if (!this.hasFiles(ev)) return;
    ev.preventDefault();

    const files = Array.from(ev.dataTransfer?.files ?? []).filter((f) => f && f.size >= 0);
    this.dragDepth = 0;
    this.setActive(false);
    if (files.length) this.filesDropped.emit(files);
  }

  private setActive(v: boolean): void {
    if (this.isActive === v) return;
    this.isActive = v;
    this.dragActiveChange.emit(v);

    // Ensure the host is focusable while dragging so keyboard users can still interact.
    const host = this.el.nativeElement;
    if (v) host.setAttribute('data-drop-active', 'true');
    else host.removeAttribute('data-drop-active');
  }

  private hasFiles(ev: DragEvent): boolean {
    const types = ev.dataTransfer?.types;
    return !!types && Array.from(types).includes('Files');
  }
}
