// Comments in English as requested.

import type { LanguageCode } from '../state/user-preferences/user-preferences.model';

export class LoadI18n {
  static readonly type = '[I18n] Load';
  constructor(public language: LanguageCode) {}
}
