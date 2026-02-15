// Comments in English as requested.

import { Injectable } from '@angular/core';
import { Action, Selector, State } from '@ngxs/store';
import type { StateContext } from '@ngxs/store';
import { LoadUserPreferences, UpdateUserPreferences } from './user-preferences.actions';
import type { ThemeName, UserPreferencesModel } from './user-preferences.model';

const STORAGE_KEY = 'lmstudio-web:userPreferences';

@State<UserPreferencesModel>({
  name: 'userPreferences',
  defaults: {
    language: 'de',
    theme: 'LMStudio',
  },
})
@Injectable()
export class UserPreferencesState {
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
      theme: (action.payload.theme ?? s.theme ?? 'LMStudio') as ThemeName,
    };
    ctx.setState(next);
    this.writeToStorage(next);
  }

  private readFromStorage(): Partial<UserPreferencesModel> | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const json = JSON.parse(raw) as any;

      const language = json?.language === 'en' ? 'en' : 'de';
      const theme: ThemeName =
        json?.theme === 'Dark' || json?.theme === 'Light' || json?.theme === 'Glass'
          ? json.theme
          : 'LMStudio';

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
