// Comments in English as requested.

import { inject, Pipe, type PipeTransform } from '@angular/core';
import { Store } from '@ngxs/store';
import type { Observable } from 'rxjs';
import { I18nState } from './i18n.state';

@Pipe({
  name: 'i18n',
  standalone: true,
  pure: true,
})
export class I18nPipe implements PipeTransform {
  private readonly store = inject(Store);

  transform(key: string): Observable<string> {
    return this.store.select<string>(I18nState.value(key));
  }
}
