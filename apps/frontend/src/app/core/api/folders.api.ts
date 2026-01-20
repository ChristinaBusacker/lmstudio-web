import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ChatFolderDto {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface CreateChatFolderDto {
  name: string;
}

export interface UpdateChatFolderDto {
  name?: string;
}

@Injectable({ providedIn: 'root' })
export class FoldersApi {
  constructor(private readonly http: HttpClient) {}

  list(): Observable<ChatFolderDto[]> {
    return this.http.get<ChatFolderDto[]>('/api/folders');
  }

  create(dto: CreateChatFolderDto): Observable<ChatFolderDto> {
    return this.http.post<ChatFolderDto>('/api/folders', dto);
  }

  update(id: string, dto: UpdateChatFolderDto): Observable<ChatFolderDto> {
    return this.http.patch<ChatFolderDto>(`/api/folders/${id}`, dto);
  }

  delete(id: string): Observable<{ folderId: string; deletedAt: string; affectedChats: number }> {
    return this.http.delete<{ folderId: string; deletedAt: string; affectedChats: number }>(
      `/api/folders/${id}`,
    );
  }
}
