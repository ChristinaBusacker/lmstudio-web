export type LanguageCode = 'de' | 'en';

export type ThemeName = 'LMStudio' | 'Dark' | 'Light' | 'Glass';

export interface UserPreferencesModel {
  language: LanguageCode;
  theme: ThemeName;
}
