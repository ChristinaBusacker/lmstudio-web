import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type {
  SettingsProfile as SettingsProfileContract,
  CreateSettingsProfileRequest,
  UpdateSettingsProfileRequest,
  SettingsProfileExportBundle,
  ImportSettingsProfileRequest,
} from '@shared/contracts';

export type SettingsProfile = SettingsProfileContract;

export type CreateSettingsProfilePayload = CreateSettingsProfileRequest;

export type UpdateSettingsProfilePayload = UpdateSettingsProfileRequest;

export type SettingsProfileExport = SettingsProfileExportBundle;
export type SettingsProfileImportPayload = ImportSettingsProfileRequest;

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

  exportProfile(id: string): Observable<SettingsProfileExport> {
    return this.http.get<SettingsProfileExport>(
      `${this.baseUrl}/profiles/${encodeURIComponent(id)}/export`,
    );
  }

  importProfile(bundle: SettingsProfileImportPayload): Observable<SettingsProfile> {
    return this.http.post<SettingsProfile>(`${this.baseUrl}/profiles/import`, bundle);
  }
}
