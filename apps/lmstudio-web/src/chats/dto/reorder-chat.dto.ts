import { IsOptional, IsUUID } from 'class-validator';

export class ReorderChatDto {
  @IsOptional()
  @IsUUID()
  beforeId?: string | null;

  @IsOptional()
  @IsUUID()
  afterId?: string | null;
}
