import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import type { ActivateHeadRequest } from '@shared/contracts';

export class ActivateHeadDto implements ActivateHeadRequest {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Message id to become new head. null resets the head.',
    example: null,
  })
  @IsOptional()
  @IsString()
  messageId?: string | null;
}
