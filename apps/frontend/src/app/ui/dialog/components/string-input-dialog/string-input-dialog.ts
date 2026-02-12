import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { StringInputDialogData } from './string-input-dialog.types';
import { Dialog } from '../../dialog';
import { DialogContext } from '../../dialog.context';
import { DIALOG_DATA } from '../../dialog.tokens';

@Component({
  selector: 'app-string-input-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, Dialog],
  templateUrl: './string-input-dialog.html',
  styleUrls: ['./string-input-dialog.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StringInputDialog {
  private readonly ctx = inject<DialogContext<string>>(DialogContext);
  private readonly destroyRef = inject(DestroyRef);
  readonly data = inject<StringInputDialogData | null>(DIALOG_DATA, { optional: true }) ?? null;

  readonly input = new FormControl<string>(this.data?.initialValue ?? '', { nonNullable: true });

  constructor() {
    this.ctx.setResult(this.input.value);

    this.input.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((value) => {
      this.ctx.setResult(value);
    });
  }
}
