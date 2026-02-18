import { ApiProperty } from '@nestjs/swagger';
import { NodeDiagramModel } from '@shared/types/node-model.types';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateWorkflowDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  graph?: NodeDiagramModel;
}
