import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export type LmModelState = 'loaded' | 'not-loaded' | 'unknown';

/**
 * Mirrors LM Studio REST model info (subset) + keeps it stable for your frontend.
 * Source: GET /api/v0/models
 */
export class ModelListItemDto {
  @ApiProperty() id!: string;

  @ApiPropertyOptional({ description: 'Model type (llm, embeddings, vlm, ...)' })
  type?: string;

  @ApiPropertyOptional() publisher?: string;
  @ApiPropertyOptional() arch?: string;
  @ApiPropertyOptional() quantization?: string;

  @ApiProperty({ enum: ['loaded', 'not-loaded', 'unknown'] })
  state!: LmModelState;

  @ApiPropertyOptional({ description: 'Max context length reported by LM Studio' })
  maxContextLength?: number;
}

/**
 * Response DTO for GET /models/:id
 */
export class ModelDetailsDto extends ModelListItemDto {
  @ApiPropertyOptional() compatibilityType?: string;
}

/**
 * Load config for LM Studio SDK.
 * Keep it minimal and extensible; UI can start simple.
 */
export class LoadModelDto {
  @ApiPropertyOptional({
    description: 'Optional instance identifier (advanced). If omitted, LM Studio generates one.',
    example: 'chat-default',
  })
  @IsOptional()
  @IsString()
  identifier?: string;

  @ApiPropertyOptional({
    description: 'Idle time-to-live in seconds. After last use, model may unload.',
    example: 300,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  ttl?: number;

  @ApiPropertyOptional({
    description: 'Context length to load with (tokens).',
    example: 8192,
  })
  @IsOptional()
  @IsInt()
  @Min(256)
  contextLength?: number;

  @ApiPropertyOptional({
    description:
      'GPU offload setting. LM Studio CLI uses 0-1/off/max; SDK supports config too. ' +
      'We keep it as string and pass through when supported.',
    example: 'max',
  })
  @IsOptional()
  @IsString()
  gpu?: string;

  @ApiPropertyOptional({
    description:
      'If true, loads a new instance even if one is already loaded. If false, ensures it is loaded.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  forceNewInstance?: boolean;
}

export class UnloadModelDto {
  @ApiPropertyOptional({
    description:
      'Optional instance identifier. If provided, unload exactly this instance. ' +
      'If omitted, unload the first loaded instance matching the model id.',
  })
  @IsOptional()
  @IsString()
  identifier?: string;
}

export class LoadedModelInstanceDto {
  @ApiProperty({ description: 'Model id / key' })
  id!: string;

  @ApiPropertyOptional({ description: 'Instance identifier (if any)' })
  identifier?: string;

  @ApiPropertyOptional({ description: 'Model type (llm, embeddings, ...)' })
  type?: string;
}

export class LoadModelResponseDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional() identifier?: string;
  @ApiProperty({ enum: ['loaded'] }) state!: 'loaded';
}

export class UnloadModelResponseDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional() identifier?: string;
  @ApiProperty({ enum: ['not-loaded'] }) state!: 'not-loaded';
}
