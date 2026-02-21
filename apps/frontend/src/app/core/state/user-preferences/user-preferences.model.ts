export type LanguageCode = 'de' | 'en' | 'fr';

export type ThemeName = 'Dark' | 'Light' | 'Glass' | 'Gaming';

export interface UserPreferencesModel {
  language: LanguageCode;
  theme: ThemeName;
}
