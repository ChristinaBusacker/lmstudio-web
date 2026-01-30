import { Directive, ElementRef, Input, OnChanges, Renderer2, SimpleChanges } from '@angular/core';

type DateTimeFormatOptions = Intl.DateTimeFormatOptions;

@Directive({
  selector: '[appLocalizedTime]',
  standalone: true,
})
export class LocalizedTimeDirective implements OnChanges {
  @Input('appLocalizedTime') value!: string | Date | null | undefined;

  @Input() appLocalizedTimeOptions: DateTimeFormatOptions = {
    dateStyle: 'medium',
    timeStyle: 'short',
  };

  @Input() appLocalizedTimeUseLocalTimezone = true;

  constructor(
    private readonly el: ElementRef<HTMLElement>,
    private readonly renderer: Renderer2,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (
      'value' in changes ||
      'appLocalizedTimeOptions' in changes ||
      'appLocalizedTimeUseLocalTimezone' in changes
    ) {
      this.render();
    }
  }

  private render(): void {
    const text = this.format(this.value);
    this.renderer.setProperty(this.el.nativeElement, 'textContent', text);
  }

  private format(input: string | Date | null | undefined): string {
    if (!input) return '';

    const date = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(date.getTime())) return '';

    const options: DateTimeFormatOptions = {
      ...this.appLocalizedTimeOptions,
      ...(this.appLocalizedTimeUseLocalTimezone ? {} : { timeZone: 'UTC' }),
    };

    // <- kein locale übergeben => Browser/OS Locale
    return new Intl.DateTimeFormat(undefined, options).format(date);
  }
}
