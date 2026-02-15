// Comments in English as requested.

import { inject } from '@angular/core';
import { Store } from '@ngxs/store';
import { I18nState } from './i18n.state';

/**
 * Synchronous translation helper for TypeScript.
 * Note: this must be called from within an Angular injection context
 * (e.g. component/service constructors, methods, effects).
 */
export function i18n(key: string): string {
  const store = inject(Store);
  return store.selectSnapshot(I18nState.value(key));
}
