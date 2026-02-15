// Comments in English as requested.

import { Injectable } from '@angular/core';
import { Action, createSelector, Selector, State } from '@ngxs/store';
import type { StateContext } from '@ngxs/store';
import { LoadI18n } from './i18n.actions';
import { LanguageService } from './language.service';
import { LanguageCode } from '../state/user-preferences/user-preferences.model';

export type I18nDict = Record<string, string>;

export interface I18nModel {
  language: LanguageCode;
  dict: I18nDict;
}

@State<I18nModel>({
  name: 'i18n',
  defaults: {
    language: 'en',
    dict: {},
  },
})
@Injectable()
export class I18nState {
  @Selector()
  static language(s: I18nModel) {
    return s.language;
  }

  @Selector()
  static dict(s: I18nModel) {
    return s.dict;
  }

  static value(key: string) {
    return createSelector([I18nState.dict], (model: I18nModel) => model[key] ?? key);
  }

  constructor(private readonly languageService: LanguageService) {}

  @Action(LoadI18n)
  load(ctx: StateContext<I18nModel>, action: LoadI18n) {
    return this.languageService.load(action.language).subscribe({
      next: (dict) => {
        ctx.patchState({ language: action.language, dict });
      },
      error: () => {
        ctx.patchState({ language: action.language });
      },
    });
  }
}
