// Comments in English as requested.

import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

type LanguageCode = 'de' | 'en';

@Component({
  selector: 'app-user-preferences',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './user-preferences.html',
  styleUrl: './user-preferences.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserPreferences {
  // TODO: Replace with NGXS state + backend persistence.
  language: LanguageCode = 'de';

  onSave(): void {
    // TODO: Dispatch UpdateUserPreferences action.
    // For now: placeholder.
    console.log('Save preferences', { language: this.language });
  }
}
