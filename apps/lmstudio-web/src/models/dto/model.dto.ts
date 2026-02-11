import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';
import type {
  LmModelState,
  LmModelListItem,
  LmModelDetails,
  LoadModelRequest,
  UnloadModelRequest,
  LoadedModelInstance,
  LoadModelResponse,
  UnloadModelResponse,
} from '@shared/contracts';

export class ModelListItemDto implements LmModelListItem {
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

export class ModelDetailsDto extends ModelListItemDto implements LmModelDetails {
  @ApiPropertyOptional() compatibilityType?: string;
}

export class LoadModelDto implements LoadModelRequest {
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
    description: 'GPU offload setting. We keep it as string and pass through when supported.',
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

export class UnloadModelDto implements UnloadModelRequest {
  @ApiPropertyOptional({
    description:
      'Optional instance identifier. If provided, unload exactly this instance. ' +
      'If omitted, unload the first loaded instance matching the model id.',
  })
  @IsOptional()
  @IsString()
  identifier?: string;
}

export class LoadedModelInstanceDto implements LoadedModelInstance {
  @ApiProperty({ description: 'Model id / key' })
  id!: string;

  @ApiPropertyOptional({ description: 'Instance identifier (if any)' })
  identifier?: string;

  @ApiPropertyOptional({ description: 'Model type (llm, embeddings, ...)' })
  type?: string;
}

export class LoadModelResponseDto implements LoadModelResponse {
  @ApiProperty() id!: string;
  @ApiPropertyOptional() identifier?: string;
  @ApiProperty({ enum: ['loaded'] }) state!: 'loaded';
}

export class UnloadModelResponseDto implements UnloadModelResponse {
  @ApiProperty() id!: string;
  @ApiPropertyOptional() identifier?: string;
  @ApiProperty({ enum: ['not-loaded'] }) state!: 'not-loaded';
}
