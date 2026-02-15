import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Output,
  ViewChild,
} from '@angular/core';

import { I18nPipe } from '../../core/i18n/i18n.pipe';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-cube-input',
  imports: [CommonModule, I18nPipe],
  templateUrl: './cube-input.html',
  styleUrl: './cube-input.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CubeInput {
  @ViewChild('inputEl') private inputEl?: ElementRef<HTMLInputElement>;

  @Output() valueChange = new EventEmitter<string>();
  @Output() confirmed = new EventEmitter<string>();

  isFlipped = false;
  value = '';

  flipToInput(): void {
    this.isFlipped = true;
    setTimeout(() => this.inputEl?.nativeElement.focus(), 250);
  }

  flipToButton(): void {
    this.isFlipped = false;
  }

  onInput(e: Event): void {
    const next = (e.target as HTMLInputElement).value;
    this.value = next;
    this.valueChange.emit(next);
  }

  onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.flipToButton();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      this.confirm();
    }
  }

  confirm(): void {
    this.confirmed.emit(this.value);
    this.flipToButton();
  }
}
