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

@Module({
  imports: [ConfigModule, AssetsModule, TypeOrmModule.forFeature([RunArtifactEntity])],
  controllers: [ToolsController],
  providers: [RunArtifactsService, WebSearchService, WebReaderService, DocReaderService],
  exports: [WebSearchService, WebReaderService, DocReaderService, RunArtifactsService],
})
export class ToolsModule {}
