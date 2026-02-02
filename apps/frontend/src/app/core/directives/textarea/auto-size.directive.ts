import { Directive, ElementRef, HostListener, AfterViewInit } from '@angular/core';

@Directive({
  selector: 'textarea[autoResize]',
})
export class AutoResizeDirective implements AfterViewInit {
  constructor(private readonly el: ElementRef<HTMLTextAreaElement>) {}

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.adjust();
    }, 200);
  }

  @HostListener('input')
  onInput(): void {
    this.adjust();
  }

  private adjust(): void {
    const textarea = this.el.nativeElement;

    textarea.style.height = 'auto';
    textarea.style.overflowY = 'hidden';
    textarea.style.height = textarea.scrollHeight + 'px';

    console.log(textarea.scrollHeight);
  }
}
