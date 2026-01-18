import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ActivateHeadDto {
  @ApiPropertyOptional({
    description: 'Message id to become new head. null resets the head.',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  messageId?: string | null;
}
