import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type {
  SettingsProfile as SettingsProfileContract,
  CreateSettingsProfileRequest,
  UpdateSettingsProfileRequest,
} from '@shared/contracts';

export type SettingsProfile = SettingsProfileContract;

export type CreateSettingsProfilePayload = CreateSettingsProfileRequest;

export type UpdateSettingsProfilePayload = UpdateSettingsProfileRequest;

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
