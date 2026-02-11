import { IsOptional, IsUUID } from 'class-validator';
import type { ReorderChatRequest } from '@shared/contracts';

export class ReorderChatDto implements ReorderChatRequest {
  @IsOptional()
  @IsUUID()
  beforeId?: string | null;

  @IsOptional()
  @IsUUID()
  afterId?: string | null;
}
