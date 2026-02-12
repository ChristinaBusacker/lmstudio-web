import { Component, inject, ChangeDetectionStrategy } from '@angular/core';

import { ConfirmDialogData } from './confirm-dialog.types';
import { Dialog } from '../../dialog';
import { DIALOG_DATA } from '../../dialog.tokens';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [Dialog],
  templateUrl: './confirm-dialog.html',
  styleUrls: ['./confirm-dialog.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialog {
  readonly data = inject<ConfirmDialogData | null>(DIALOG_DATA, { optional: true }) ?? null;
}
