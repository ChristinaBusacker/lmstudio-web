import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettingsModule } from '../settings/settings.module';
import { ChatsModule } from '../chats/chats.module';
import { RunsModule } from '../runs/runs.module';
import { SseModule } from '../sse/sse.module';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';
import { WorkflowWorkerService } from './workflow-worker.service';
import { WorkflowEntity } from './entities/workflow.entity';
import { WorkflowRunEntity } from './entities/workflow-run.entity';
import { WorkflowNodeRunEntity } from './entities/workflow-node-run.entity';
import { ArtifactEntity } from './entities/artifact.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WorkflowEntity,
      WorkflowRunEntity,
      WorkflowNodeRunEntity,
      ArtifactEntity,
    ]),
    RunsModule,
    SettingsModule,
    ChatsModule,
    SseModule,
  ],
  controllers: [WorkflowsController],
  providers: [WorkflowsService, WorkflowWorkerService],
  exports: [WorkflowsService],
})
export class WorkflowsModule {}
