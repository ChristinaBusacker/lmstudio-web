import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import type { CreateWorkflowRequest } from '@shared/contracts';

export class CreateWorkflowDto implements CreateWorkflowRequest {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ description: 'Blueprint graph JSON' })
  @IsObject()
  graph!: any;
}
