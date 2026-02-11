import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type {
  ChatFolder,
  CreateChatFolderRequest,
  UpdateChatFolderRequest,
  DeleteChatFolderResponse,
} from '@shared/contracts';

export type ChatFolderDto = ChatFolder;

export type CreateChatFolderDto = CreateChatFolderRequest;

export type UpdateChatFolderDto = UpdateChatFolderRequest;

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

  delete(id: string): Observable<DeleteChatFolderResponse> {
    return this.http.delete<DeleteChatFolderResponse>(`/api/folders/${id}`);
  }
}
