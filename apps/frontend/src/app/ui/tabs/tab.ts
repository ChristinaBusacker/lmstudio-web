import { Component, TemplateRef, ViewChild, input } from '@angular/core';

@Component({
  selector: 'app-tab',
  standalone: false,
  template: `
    <ng-template #tpl>
      <ng-content />
    </ng-template>
  `,
})
export class Tab {
  label = input.required<string>();
  disabled = input<boolean>(false);

  ariaLabel = input<string | null>(null);

  @ViewChild('tpl', { read: TemplateRef, static: true })
  readonly template!: TemplateRef<unknown>;
}
