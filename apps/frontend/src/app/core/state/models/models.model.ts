import type { LmModelListItem, LoadedModelInstance } from '@shared/contracts';

export interface ModelsStateModel {
  models: Record<string, LmModelListItem>;
  loadedInstances: LoadedModelInstance[];

  /** Busy flags for UI button disabling and progress indicators */
  busy: Record<string, boolean>;

  lastSyncAt: string | null;
  loading: boolean;
}
