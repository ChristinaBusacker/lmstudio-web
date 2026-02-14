import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AssetsModule } from '../assets/assets.module';
import { RunArtifactEntity } from './entities/run-artifact.entity';
import { RunArtifactsService } from './run-artifacts.service';
import { WebSearchService } from './web/web-search.service';
import { WebReaderService } from './web/web-reader.service';
import { DocReaderService } from './docs/doc-reader.service';
import { ToolsController } from './tools.controller';
import { ToolOrchestratorService } from './tool-orchestrator.service';
import { SseModule } from '../sse/sse.module';

@Module({
  imports: [ConfigModule, AssetsModule, TypeOrmModule.forFeature([RunArtifactEntity]), SseModule],
  controllers: [ToolsController],
  providers: [
    RunArtifactsService,
    WebSearchService,
    WebReaderService,
    DocReaderService,
    ToolOrchestratorService,
  ],
  exports: [
    WebSearchService,
    WebReaderService,
    DocReaderService,
    RunArtifactsService,
    ToolOrchestratorService,
  ],
})
export class ToolsModule {}
