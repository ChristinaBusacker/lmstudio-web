import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import type { ChatRunSendMessageRequest } from '@shared/contracts';

export class SendMessageDto implements ChatRunSendMessageRequest {
  @ApiProperty({ example: 'Explain NestJS modules briefly.' })
  @IsString()
  @MinLength(1)
  content!: string;

  @ApiProperty({
    description: 'Client-generated UUID for idempotency',
    example: 'c2b5c5b6-8b28-4c36-8c67-0c9e0d9a9f1b',
  })
  @IsUUID()
  clientRequestId!: string;

  @ApiPropertyOptional({
    description: 'Settings profile id (preferred). Server resolves and freezes snapshot.',
    example: '9c1f3f8a-2d3b-4baf-9dd6-3c1f0c2f4a11',
  })
  @IsOptional()
  @IsUUID()
  settingsProfileId?: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description:
      'Optional override snapshot (dev / power user). Server will merge with defaults and freeze.',
    example: { temperature: 0.7, maxTokens: 800, topP: 0.9, modelKey: 'qwen2.5-7b-instruct' },
  })
  @IsOptional()
  @IsObject()
  settingsSnapshot?: Record<string, any>;
}
