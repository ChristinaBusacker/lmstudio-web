import { ApiProperty } from '@nestjs/swagger';
import { JsonArray } from '@shared/index';
import { NodeDiagramModel } from '@shared/types/node-model.types';

export class ImportWorkflowBundleDto {
  @ApiProperty({ description: 'The exported workflow bundle JSON' })
  bundle!: {
    workflow: {
      name?: string;
      description?: string | null;
      graph?: NodeDiagramModel;
    };
    runs?: JsonArray;
    nodeRuns?: JsonArray;
    artifacts?: JsonArray;
  };

  @ApiProperty({ required: false, description: 'Optional override name for the imported workflow' })
  name?: string;
}
