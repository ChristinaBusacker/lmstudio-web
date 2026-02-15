export type LanguageCode = 'de' | 'en' | 'fr';

export type ThemeName = 'LMStudio' | 'Dark' | 'Light' | 'Glass';

export interface UserPreferencesModel {
  language: LanguageCode;
  theme: ThemeName;
}
