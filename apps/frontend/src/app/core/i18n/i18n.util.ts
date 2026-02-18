// Comments in English as requested.

import { EnvironmentInjector, inject, runInInjectionContext } from '@angular/core';
import { Store } from '@ngxs/store';
import { I18nState } from './i18n.state';

let _envInjector: EnvironmentInjector | null = null;

/**
 * Set the EnvironmentInjector once during app bootstrap.
 */
export function setI18nInjector(injector: EnvironmentInjector): void {
  _envInjector = injector;
}

/**
 * Synchronous translation helper for TypeScript.
 * Works both inside and outside injection contexts.
 */
export function i18n(key: string): string {
  // If we have a global injector, we can always run inside an injection context.
  if (_envInjector) {
    return runInInjectionContext(_envInjector, () => {
      const store = inject(Store);
      return store.selectSnapshot<string>(I18nState.value(key));
    });
  }

  // Fallback: only works if the caller is already in an injection context.
  const store = inject(Store);
  return store.selectSnapshot<string>(I18nState.value(key));
}
