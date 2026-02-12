import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { DIALOG_DATA } from './dialog.tokens';
import { DialogRef } from './dialog-ref';
import { DialogData, DialogResult } from './dialog.types';
import { DialogContext } from './dialog.context';

@Component({
  selector: 'app-dialog',
  standalone: true,
  templateUrl: './dialog.html',
  styleUrls: ['./dialog.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dialog<T = unknown> {
  private readonly dialogRef = inject<DialogRef<T>>(DialogRef);
  private readonly ctx = inject<DialogContext<T>>(DialogContext);

  // 👇 gemeinsames DialogData (title + labels)
  readonly data = inject<DialogData | null>(DIALOG_DATA, { optional: true }) ?? null;

  get title(): string | null {
    return this.data?.title ?? null;
  }

  get confirmLabel(): string | null {
    return this.data?.confirmLabel ?? 'Confirm';
  }

  get declineLabel(): string | null {
    return this.data?.declineLabel ?? null; // default hidden
  }

  get closeLabel(): string | null {
    return this.data?.closeLabel ?? 'Close';
  }

  confirm(): void {
    this.dialogRef.close({ action: 'confirm', data: this.ctx.result() } as DialogResult<T>);
  }

  decline(): void {
    this.dialogRef.close({ action: 'decline', data: this.ctx.result() } as DialogResult<T>);
  }

  close(): void {
    this.dialogRef.close({ action: 'close', data: this.ctx.result() } as DialogResult<T>);
  }
}
