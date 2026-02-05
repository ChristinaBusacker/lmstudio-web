import { Store } from '@ngxs/store';
import { SseService } from '../sse/sse.service';
import { LoadChats } from '../state/chats/chats.actions';
import { LoadFolders } from '../state/folders/folders.actions';
import { LoadLoadedModels, LoadModels } from '../state/models/models.actions';
import { LoadActiveRuns } from '../state/runs/runs.actions';
import { LoadWorkflows } from '../state/workflows/workflow.actions';
import { LoadProfiles } from '../state/settings/settings.actions';

export function startUpApplication(store: Store, sse: SseService) {
  sse.connectGlobal();

  store.dispatch([
    new LoadFolders(),
    new LoadModels(),
    new LoadLoadedModels(),
    new LoadChats({ limit: 50, includeDeleted: false }),
    new LoadActiveRuns('default'),
    new LoadWorkflows(),
    new LoadProfiles(),
  ]);
}
