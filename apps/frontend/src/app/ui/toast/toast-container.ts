// Comments in English as requested.

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from './toast.service';
import { Icon } from '../icon/icon';
import { I18nPipe } from '../../core/i18n/i18n.pipe';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule, Icon, I18nPipe],
  templateUrl: './toast-container.html',
  styleUrl: './toast-container.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastContainer {
  readonly toast = inject(ToastService);
}
