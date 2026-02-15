// Comments in English as requested.

import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Store } from '@ngxs/store';
import { UserPreferencesState } from '@frontend/src/app/core/state/user-preferences/user-preferences.state';
import type {
  LanguageCode,
  ThemeName,
} from '@frontend/src/app/core/state/user-preferences/user-preferences.model';
import { UpdateUserPreferences } from '@frontend/src/app/core/state/user-preferences/user-preferences.actions';
import { ToastService } from '@frontend/src/app/ui/toast/toast.service';
import { I18nPipe } from '@frontend/src/app/core/i18n/i18n.pipe';
import { i18n } from '@frontend/src/app/core/i18n/i18n.util';

@Component({
  selector: 'app-user-preferences',
  standalone: true,
  imports: [CommonModule, FormsModule, I18nPipe],
  templateUrl: './user-preferences.html',
  styleUrl: './user-preferences.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserPreferences {
  private readonly store = inject(Store);
  private readonly toast = inject(ToastService);

  language: LanguageCode = this.store.selectSnapshot(UserPreferencesState.language);
  theme: ThemeName = this.store.selectSnapshot(UserPreferencesState.theme);

  onSave(): void {
    this.store.dispatch(new UpdateUserPreferences({ language: this.language, theme: this.theme }));
    this.toast.success(i18n('toast.saved'), i18n('toast.userPrefsUpdated'));
  }
}
