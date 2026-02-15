// Comments in English as requested.

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from './toast.service';
import { Icon } from '../icon/icon';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule, Icon],
  templateUrl: './toast-container.html',
  styleUrl: './toast-container.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastContainer {
  readonly toast = inject(ToastService);
}
