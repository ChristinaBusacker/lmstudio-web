import { Injectable } from '@nestjs/common';
import type { LMStudioClient } from '@lmstudio/sdk';
import { LmStudioClientFactory } from '../infra/lmstudio/lmstudio-client.factory';

type ModelHandle = Awaited<ReturnType<LMStudioClient['llm']['model']>>;

@Injectable()
export class ModelsService {
  private readonly cache = new Map<string, Promise<ModelHandle>>();
  private defaultModelKey: string | undefined;

  constructor(private readonly factory: LmStudioClientFactory) {}

  setDefaultModelKey(modelKey?: string) {
    this.defaultModelKey = modelKey;
  }

  async getModel(modelKey?: string): Promise<ModelHandle> {
    const key = modelKey ?? this.defaultModelKey ?? '__default__';

    let p = this.cache.get(key);
    if (!p) {
      const client = this.factory.getClient();
      // If "__default__", pass undefined to let SDK decide default model
      p = client.llm.model(key === '__default__' ? (undefined as any) : (key as any));
      this.cache.set(key, p);
    }
    return p;
  }
}
