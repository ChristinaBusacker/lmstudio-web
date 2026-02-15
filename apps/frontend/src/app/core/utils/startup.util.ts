import { Store } from '@ngxs/store';
import { SseService } from '../sse/sse.service';
import { LoadChats } from '../state/chats/chats.actions';
import { LoadFolders } from '../state/folders/folders.actions';
import { LoadLoadedModels, LoadModels } from '../state/models/models.actions';
import { LoadActiveRuns } from '../state/runs/runs.actions';
import { LoadWorkflows } from '../state/workflows/workflow.actions';
import { LoadProfiles } from '../state/settings/settings.actions';
import { LoadUserPreferences } from '../state/user-preferences/user-preferences.actions';
import { UserPreferencesState } from '../state/user-preferences/user-preferences.state';
import { LoadI18n } from '../i18n/i18n.actions';

export function startUpApplication(store: Store, sse: SseService): void {
  sse.connectGlobal();

  // Load preferences first (sync from localStorage), then load language pack.
  store.dispatch(new LoadUserPreferences()).subscribe(() => {
    const lang = store.selectSnapshot(UserPreferencesState.language);
    store.dispatch(new LoadI18n(lang));

    store.dispatch([
      new LoadFolders(),
      new LoadModels(),
      new LoadLoadedModels(),
      new LoadChats({ limit: 50, includeDeleted: false }),
      new LoadActiveRuns('default'),
      new LoadWorkflows(),
      new LoadProfiles(),
    ]);
  });
}
