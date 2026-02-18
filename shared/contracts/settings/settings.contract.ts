import { SettingsParams } from '@frontend/src/app/core/utils/settings-params.util';
import type { JsonObject } from '@shared/types/json';

export interface SettingsProfile {
  id: string;
  ownerKey: string;
  name: string;
  params: JsonObject;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSettingsProfileRequest {
  name: string;
  params?: SettingsParams;
  isDefault?: boolean;
}

export interface UpdateSettingsProfileRequest {
  name?: string;
  params?: SettingsParams;
  isDefault?: boolean;
}
