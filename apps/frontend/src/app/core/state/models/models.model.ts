import type { LoadedModelInstanceDto, ModelListItemDto } from '../../api/models.api';

export interface ModelsStateModel {
  models: Record<string, ModelListItemDto>;
  loadedInstances: LoadedModelInstanceDto[];

  /** Busy flags for UI button disabling and progress indicators */
  busy: Record<string, boolean>;

  lastSyncAt: string | null;
  loading: boolean;
}
