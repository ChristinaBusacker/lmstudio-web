export interface CreateVariantRequest {
  content: string;
}

export interface ActivateVariantRequest {
  variantId: string;
}

export interface MessageVariant {
  id: string;
  messageId: string;
  variantIndex: number;
  isActive: boolean;
  content: string;
  reasoning: string | null;
  stats: any;
  createdAt: string;
}

export interface ThreadVariant {
  id: string;
  variantIndex: number;
  isActive: boolean;
  content: string;
  reasoning?: string | null;
  stats?: any;
  createdAt: string;
}

export interface ThreadMessage {
  id: string;
  chatId: string;
  role: 'system' | 'user' | 'assistant';
  parentMessageId?: string | null;

  deletedAt?: string | null;
  editedAt?: string | null;

  variantsCount: number;
  createdAt: string;

  activeVariant: ThreadVariant;
}

export interface ChatThreadResponse {
  chatId: string;
  title?: string | null;
  folderId?: string | null;
  activeHeadMessageId?: string | null;
  messages: ThreadMessage[];
}
