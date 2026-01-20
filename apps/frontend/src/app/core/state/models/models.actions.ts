import type { LoadModelDto, UnloadModelDto } from '../../api/models.api';

export class LoadModels {
  static readonly type = '[Models] Load Models';
}

export class LoadLoadedModels {
  static readonly type = '[Models] Load Loaded Models';
}

export class LoadModel {
  static readonly type = '[Models] Load Model';
  constructor(
    public readonly id: string,
    public readonly dto: LoadModelDto = {},
  ) {}
}

export class UnloadModel {
  static readonly type = '[Models] Unload Model';
  constructor(
    public readonly id: string,
    public readonly dto: UnloadModelDto = {},
  ) {}
}

/**
 * Dispatched from SSE when the server says: "model state changed".
 * V1 approach: do a REST resync (server is source of truth).
 */
export class ModelsChanged {
  static readonly type = '[Models] Models Changed (SSE)';
}
