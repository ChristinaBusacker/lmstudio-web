import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { JsonArray } from '@shared/index';
import { NodeDiagramModel } from '@shared/types/node-model.types';

// NOTE:
// This DTO is used with ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }).
// Therefore we must use class-validator decorators so properties are not rejected.

class ImportWorkflowWorkflowDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ownerKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  createdAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  updatedAt?: string;

  // …existing fields…
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  graph?: NodeDiagramModel;
}

class ImportWorkflowBundleInnerDto {
  @ApiProperty({ type: ImportWorkflowWorkflowDto })
  @ValidateNested()
  @Type(() => ImportWorkflowWorkflowDto)
  workflow!: ImportWorkflowWorkflowDto;

  @ApiPropertyOptional()
  @IsOptional()
  runs?: JsonArray;

  @ApiPropertyOptional()
  @IsOptional()
  nodeRuns?: JsonArray;

  @ApiPropertyOptional()
  @IsOptional()
  artifacts?: JsonArray;
}

export class ImportWorkflowBundleDto {
  @ApiProperty({
    description: 'The exported workflow bundle JSON',
    type: ImportWorkflowBundleInnerDto,
  })
  @ValidateNested()
  @Type(() => ImportWorkflowBundleInnerDto)
  bundle!: ImportWorkflowBundleInnerDto;

  @ApiPropertyOptional({ description: 'Optional override name for the imported workflow' })
  @IsOptional()
  @IsString()
  name?: string;
}
