// Comments in English as requested.

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, shareReplay } from 'rxjs/operators';
import type { Observable } from 'rxjs';
import type { LanguageCode } from '../state/user-preferences/user-preferences.model';
import type { I18nDict } from './i18n.state';

@Injectable({ providedIn: 'root' })
export class LanguageService {
  constructor(private readonly http: HttpClient) {}

  load(language: LanguageCode): Observable<I18nDict> {
    return this.http.get<Record<string, unknown>>(`/languages/${language}.json`).pipe(
      map((raw) => {
        const dict: I18nDict = {};
        for (const [k, v] of Object.entries(raw ?? {})) {
          if (typeof v === 'string') dict[k] = v;
        }
        return dict;
      }),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
  }
}
