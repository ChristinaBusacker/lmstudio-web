import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class RegenerateDto {
  @ApiProperty({
    description: 'Client-generated UUID for idempotency',
    example: 'c2b5c5b6-8b28-4c36-8c67-0c9e0d9a9f1b',
  })
  @IsUUID()
  clientRequestId!: string;

  @ApiPropertyOptional({
    example: '9c1f3f8a-2d3b-4baf-9dd6-3c1f0c2f4a11',
    description: 'Optional settings profile id. If omitted, the default profile is used.',
  })
  @IsOptional()
  @IsUUID()
  settingsProfileId?: string;
}
