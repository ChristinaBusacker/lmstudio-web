import {
  ApplicationConfig,
  provideAppInitializer,
  inject,
  provideBrowserGlobalErrorListeners,
  EnvironmentInjector,
} from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { withNgxsReduxDevtoolsPlugin } from '@ngxs/devtools-plugin';
import { provideStore, Store } from '@ngxs/store';
import { provideHttpClient } from '@angular/common/http';
import { withInterceptors } from '@angular/common/http';
import { ErrorHandler } from '@angular/core';
import { ChatsApi } from './core/api/chats.api';
import { FoldersApi } from './core/api/folders.api';
import { ModelsApi } from './core/api/models.api';
import { RunsApiService } from './core/api/runs.api';
import { ChatsState } from './core/state/chats/chats.state';
import { FoldersState } from './core/state/folders/folders.state';
import { ModelsState } from './core/state/models/models.state';
import { RunsState } from './core/state/runs/runs.state';
import { ChatDetailState } from './core/state/chat-detail/chat-detail.state';
import { IconRegistryService } from './core/services/icons/icon-registry-service';
import { provideMarkdown } from 'ngx-markdown';
import { SettingsApiService } from './core/api/settings.api';
import { SettingsState } from './core/state/settings/settings.state';
import { DialogService } from './ui/dialog/dialog.service';
import { ChatSearchApiService } from './core/api/search.api';
import { ChatSearchState } from './core/state/chat-search/chat-search.state';
import { WorkflowsState } from './core/state/workflows/workflow.state';
import { WorkflowApiService } from './core/api/workflow-api.service';
import { SseService } from './core/sse/sse.service';
import { startUpApplication } from './core/utils/startup.util';
import { GlobalErrorHandler } from './core/errors/global-error-handler';
import { httpErrorToastInterceptor } from './core/http/http-error-toast.interceptor';
import { UserPreferencesState } from './core/state/user-preferences/user-preferences.state';
import { I18nState } from './core/i18n/i18n.state';
import { SystemState } from './core/state/system/system.state';
import { LanguageService } from './core/i18n/language.service';
import { firstValueFrom } from 'rxjs';
import { setI18nInjector } from './core/i18n/i18n.util';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    provideRouter(routes),
    provideAppInitializer(() => {
      const store = inject(Store);
      const sse = inject(SseService);
      startUpApplication(store, sse);
    }),

    provideStore(
      [
        ChatsState,
        FoldersState,
        ModelsState,
        RunsState,
        ChatDetailState,
        SettingsState,
        ChatSearchState,
        WorkflowsState,
        UserPreferencesState,
        I18nState,
        SystemState,
      ],
      withNgxsReduxDevtoolsPlugin(),
    ),
    provideHttpClient(withInterceptors([httpErrorToastInterceptor])),
    provideMarkdown(),
    provideAppInitializer(() => {
      const store = inject(Store);
      const languageService = inject(LanguageService);

      const envInjector = inject(EnvironmentInjector);
      setI18nInjector(envInjector);

      const language = store.selectSnapshot(UserPreferencesState.language);

      // Wichtig: Angular wartet auf Promise/Observable completion.
      return firstValueFrom(languageService.load(language));
    }),
    ChatsApi,
    FoldersApi,
    ModelsApi,
    RunsApiService,
    IconRegistryService,
    SettingsApiService,
    DialogService,
    ChatSearchApiService,
    WorkflowApiService,
  ],
};
