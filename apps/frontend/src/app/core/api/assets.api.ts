import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface AssetDto {
  id: string;
  originalFilename: string;
  mimeType: string | null;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class AssetsApi {
  private readonly http = inject(HttpClient);

  upload(file: File): Observable<AssetDto> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<AssetDto>('/api/assets/upload', form);
  }
}
