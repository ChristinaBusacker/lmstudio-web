import { ApiProperty } from '@nestjs/swagger';

export class ImportWorkflowBundleDto {
  @ApiProperty({ description: 'The exported workflow bundle JSON' })
  bundle!: {
    workflow: {
      name?: string;
      description?: string | null;
      graph?: any;
    };
    runs?: any[];
    nodeRuns?: any[];
    artifacts?: any[];
  };

  @ApiProperty({ required: false, description: 'Optional override name for the imported workflow' })
  name?: string;
}
