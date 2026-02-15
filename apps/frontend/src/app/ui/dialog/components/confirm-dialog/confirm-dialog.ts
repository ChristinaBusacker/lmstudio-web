import { Component, inject, ChangeDetectionStrategy } from '@angular/core';

import { ConfirmDialogData } from './confirm-dialog.types';
import { Dialog } from '../../dialog';
import { DIALOG_DATA } from '../../dialog.tokens';
import { I18nPipe } from '../../../../core/i18n/i18n.pipe';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [Dialog, I18nPipe],
  templateUrl: './confirm-dialog.html',
  styleUrls: ['./confirm-dialog.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialog {
  readonly data = inject<ConfirmDialogData | null>(DIALOG_DATA, { optional: true }) ?? null;
}
