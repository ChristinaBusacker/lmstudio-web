import type { JsonObject } from '@shared/types/json';

export type SettingsParams = {
  systemPrompt?: string;
  modelKey?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  /** Enables tool usage (e.g. web_search/web_read/doc_read) for runs using this profile. */
  toolsEnabled?: boolean;
  [k: string]: unknown;
};

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
