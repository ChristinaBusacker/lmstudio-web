import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { withNgxsReduxDevtoolsPlugin } from '@ngxs/devtools-plugin';
import { provideStore } from '@ngxs/store';
import { provideHttpClient } from '@angular/common/http';
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

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideStore(
      [
        ChatsState,
        FoldersState,
        ModelsState,
        RunsState,
        ChatDetailState,
        SettingsState,
        ChatSearchState,
      ],
      withNgxsReduxDevtoolsPlugin(),
    ),
    provideHttpClient(),
    provideMarkdown(),
    ChatsApi,
    FoldersApi,
    ModelsApi,
    RunsApiService,
    IconRegistryService,
    SettingsApiService,
    DialogService,
    ChatSearchApiService,
  ],
};
