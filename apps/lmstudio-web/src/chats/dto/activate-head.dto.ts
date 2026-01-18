import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ActivateHeadDto {
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
