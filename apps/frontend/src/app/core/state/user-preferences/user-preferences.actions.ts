import type { LanguageCode, ThemeName } from './user-preferences.model';

export class LoadUserPreferences {
  static readonly type = '[UserPreferences] Load';
}

export class UpdateUserPreferences {
  static readonly type = '[UserPreferences] Update';
  constructor(public payload: Partial<{ language: LanguageCode; theme: ThemeName }>) {}
}
