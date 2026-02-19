import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettingsModule } from '../settings/settings.module';
import { ChatsModule } from '../chats/chats.module';
import { RunsModule } from '../runs/runs.module';
import { AssetsModule } from '../assets/assets.module';
import { SseModule } from '../sse/sse.module';
import { ToolsModule } from '../tools/tools.module';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';
import { WorkflowWorkerService } from './workflow-worker.service';
import { WorkflowNodeExecutorService } from './execution/workflow-node-executor.service';
import { WorkflowEntity } from './entities/workflow.entity';
import { WorkflowRunEntity } from './entities/workflow-run.entity';
import { WorkflowNodeRunEntity } from './entities/workflow-node-run.entity';
import { ArtifactEntity } from './entities/artifact.entity';
import { WorkflowToolNodeExecutorService } from './execution/workflow-tool-node-executor.service';
import { LlmNodeExecutorService } from './execution/llm-node-executor.service';
import { WorkflowConditionNodeExecutorService } from './execution/workflow-condition-node-executor.service';
import { WorkflowLoopStartExecutorService } from './execution/workflow-loop-start-executor.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WorkflowEntity,
      WorkflowRunEntity,
      WorkflowNodeRunEntity,
      ArtifactEntity,
    ]),
    RunsModule,
    AssetsModule,
    SettingsModule,
    ChatsModule,
    SseModule,
    ToolsModule,
  ],
  controllers: [WorkflowsController],
  providers: [
    WorkflowsService,
    WorkflowNodeExecutorService,
    WorkflowWorkerService,
    WorkflowToolNodeExecutorService,
    LlmNodeExecutorService,
    WorkflowConditionNodeExecutorService,
    WorkflowLoopStartExecutorService,
  ],
  exports: [WorkflowsService],
})
export class WorkflowsModule {}
