export interface SettingsProfile {
  id: string;
  ownerKey: string;
  name: string;
  params: Record<string, any>;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSettingsProfileRequest {
  name: string;
  params?: Record<string, any>;
  isDefault?: boolean;
}

export interface UpdateSettingsProfileRequest {
  name?: string;
  params?: Record<string, any>;
  isDefault?: boolean;
}
