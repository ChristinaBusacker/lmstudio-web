import type { ChatId, MessageId } from '../common/id.contract';
import type { IsoDateTimeString } from '../common/datetime.contract';
import type { PagedResponse, PageRequest } from '../common/pagination.contract';

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatListItem {
  id: ChatId;
  title: string | null;
  folderId: string | null;
  activeHeadMessageId: MessageId | null;
  defaultSettingsProfileId: string | null;

  deletedAt: IsoDateTimeString | null;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
}

export interface ChatMeta {
  id: ChatId;
  title: string | null;
  folderId: string | null;
  activeHeadMessageId: MessageId | null;
  deletedAt: IsoDateTimeString | null;
}

export interface ChatMessage {
  id: MessageId;
  chatId: ChatId;
  role: ChatRole;
  content: string;
  createdAt: IsoDateTimeString;

  /**
   * Optional metadata for tool calls, token usage, etc.
   * Keep this loose until you actually need strong typing here.
   */
  meta?: Record<string, unknown>;
}

export interface ChatDetail {
  id: ChatId;
  title: string;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
  messages: ChatMessage[];
}

/** Query params for listing chats. */
export interface ListChatsRequest extends Partial<PageRequest> {
  q?: string;
}

export type ListChatsResponse = PagedResponse<ChatListItem>;

export interface CreateChatRequest {
  title?: string;
  /**
   * Optional initial message (common UX).
   */
  firstMessage?: {
    role?: 'user' | 'system';
    content: string;
  };
}

export interface CreateChatResponse {
  chat: ChatDetail;
}

export interface UpdateChatRequest {
  title?: string;
}

export interface ChatSendMessageRequest {
  content: string;
  role?: 'user' | 'system';
}

export interface SendMessageResponse {
  message: ChatMessage;
  chat: Pick<ChatDetail, 'id' | 'updatedAt' | 'title'>;
}

export interface ListChatsQuery {
  limit?: number;

  /**
   * Cursor for pagination (e.g. updatedAt ISO string of last item).
   * Keep as string because it’s transmitted via query param.
   */
  cursor?: string;

  /**
   * Folder filter. Your API currently uses the literal "null" string
   * to represent "no folder", so the contract must allow it.
   */
  folderId?: string;

  includeDeleted?: boolean;
}
