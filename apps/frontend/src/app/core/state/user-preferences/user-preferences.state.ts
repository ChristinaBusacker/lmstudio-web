// Comments in English as requested.

import { Injectable } from '@angular/core';
import { Action, Selector, State } from '@ngxs/store';
import type { StateContext } from '@ngxs/store';
import { Store } from '@ngxs/store';
import { LoadUserPreferences, UpdateUserPreferences } from './user-preferences.actions';
import type { ThemeName, UserPreferencesModel } from './user-preferences.model';
import { LoadI18n } from '../../i18n/i18n.actions';
import { getString, isRecord } from '../../utils/typed-access';

const STORAGE_KEY = 'lmstudio-web:userPreferences';

@State<UserPreferencesModel>({
  name: 'userPreferences',
  defaults: {
    language: 'de',
    theme: 'Dark',
  },
})
@Injectable()
export class UserPreferencesState {
  constructor(private readonly store: Store) {}
  @Selector()
  static language(s: UserPreferencesModel) {
    return s.language;
  }

  @Selector()
  static theme(s: UserPreferencesModel) {
    return s.theme;
  }

  @Action(LoadUserPreferences)
  load(ctx: StateContext<UserPreferencesModel>) {
    const fromStorage = this.readFromStorage();
    if (fromStorage) ctx.patchState(fromStorage);
  }

  @Action(UpdateUserPreferences)
  update(ctx: StateContext<UserPreferencesModel>, action: UpdateUserPreferences) {
    const s = ctx.getState();
    const next: UserPreferencesModel = {
      ...s,
      ...action.payload,
      // Always ensure default exists.
      theme: (action.payload.theme ?? s.theme ?? 'Dark') as ThemeName,
    };
    ctx.setState(next);
    this.writeToStorage(next);

    // When language changes, reload the language pack.
    if (next.language !== s.language) {
      this.store.dispatch(new LoadI18n(next.language));
    }
  }

  private readFromStorage(): Partial<UserPreferencesModel> | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;

      const parsed: unknown = JSON.parse(raw);
      if (!isRecord(parsed)) return null;

      const languageRaw = getString(parsed, 'language');
      const language = languageRaw === 'en' || languageRaw === 'fr' ? languageRaw : 'de';

      const themeRaw = getString(parsed, 'theme');
      const theme: ThemeName =
        themeRaw === 'Dark' || themeRaw === 'Light' || themeRaw === 'Glass' || themeRaw === 'Gaming'
          ? themeRaw
          : 'Dark';

      return { language, theme };
    } catch {
      return null;
    }
  }

  private writeToStorage(s: UserPreferencesModel): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch {
      // Ignore storage errors.
    }
  }
}
