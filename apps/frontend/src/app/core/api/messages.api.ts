import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import type {
  ActivateVariantRequest,
  CreateVariantRequest,
  MessageVariant,
} from '@shared/contracts';

export type MessageVariantDto = MessageVariant;
export type CreateVariantDto = CreateVariantRequest;
export type ActivateVariantDto = ActivateVariantRequest;

@Injectable({ providedIn: 'root' })
export class MessagesApi {
  private readonly http = inject(HttpClient);

  listVariants(messageId: string): Observable<MessageVariantDto[]> {
    return this.http.get<MessageVariantDto[]>(
      `/api/messages/${encodeURIComponent(messageId)}/variants`,
    );
  }

  createVariant(messageId: string, dto: CreateVariantDto): Observable<MessageVariantDto> {
    return this.http.post<MessageVariantDto>(
      `/api/messages/${encodeURIComponent(messageId)}/variants`,
      dto,
    );
  }

  activateVariant(messageId: string, dto: ActivateVariantDto): Observable<MessageVariantDto> {
    return this.http.patch<MessageVariantDto>(
      `/api/messages/${encodeURIComponent(messageId)}/variants/active`,
      dto,
    );
  }

  softDelete(messageId: string): Observable<{ messageId: string; deletedAt: string }> {
    return this.http.delete<{ messageId: string; deletedAt: string }>(
      `/api/messages/${encodeURIComponent(messageId)}`,
    );
  }
}
