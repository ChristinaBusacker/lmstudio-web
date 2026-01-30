// Comments in English as requested.

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface SettingsProfile {
  id: string;
  ownerKey: string;
  name: string;
  params: Record<string, any>;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSettingsProfilePayload {
  name: string;
  params?: Record<string, any>;
  isDefault?: boolean;
}

export interface UpdateSettingsProfilePayload {
  name?: string;
  params?: Record<string, any>;
  isDefault?: boolean;
}

@Injectable({ providedIn: 'root' })
export class SettingsApiService {
  private readonly baseUrl = '/api/settings';

  constructor(private readonly http: HttpClient) {}

  listProfiles(): Observable<SettingsProfile[]> {
    return this.http.get<SettingsProfile[]>(`${this.baseUrl}/profiles`);
  }

  getProfile(id: string): Observable<SettingsProfile> {
    return this.http.get<SettingsProfile>(`${this.baseUrl}/profiles/${encodeURIComponent(id)}`);
  }

  createProfile(payload: CreateSettingsProfilePayload): Observable<SettingsProfile> {
    return this.http.post<SettingsProfile>(`${this.baseUrl}/profiles`, payload);
  }

  updateProfile(id: string, patch: UpdateSettingsProfilePayload): Observable<SettingsProfile> {
    return this.http.patch<SettingsProfile>(
      `${this.baseUrl}/profiles/${encodeURIComponent(id)}`,
      patch,
    );
  }

  deleteProfile(id: string) {
    return this.http.delete<SettingsProfile[]>(
      `${this.baseUrl}/profiles/${encodeURIComponent(id)}`,
    );
  }

  setDefaultProfile(id: string): Observable<SettingsProfile> {
    return this.http.post<SettingsProfile>(
      `${this.baseUrl}/profiles/${encodeURIComponent(id)}/default`,
      {},
    );
  }
}
