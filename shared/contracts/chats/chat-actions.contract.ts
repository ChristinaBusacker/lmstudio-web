export interface ActivateHeadRequest {
  messageId?: string | null;
}

export interface ActivateHeadResponse {
  chatId: string;
  activeHeadMessageId: string | null;
}

export interface SoftDeleteChatResponse {
  chatId: string;
  deletedAt: string;
}

export interface SoftDeleteMessageResponse {
  messageId: string;
  deletedAt: string;
}

export interface MoveChatRequest {
  folderId?: string | null;
}

export interface RenameChatRequest {
  title: string;
}

export interface ReorderChatRequest {
  beforeId?: string | null;
  afterId?: string | null;
}
