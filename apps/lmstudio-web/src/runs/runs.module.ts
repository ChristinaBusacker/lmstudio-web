import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RunEntity } from './entities/run.entity';
import { RunsService } from './runs.service';
import { RunWorkerService } from './run-worker.service';
import { ChatEngineService } from '../chats/chat-engine.service';
import { ChatsModule } from '../chats/chats.module';
import { ModelsModule } from '../models/models.module';
import { RunsController } from './run.controller';
import { SseModule } from '../sse/sse.module';

@Module({
  imports: [TypeOrmModule.forFeature([RunEntity]), ChatsModule, ModelsModule, SseModule],
  providers: [RunsService, RunWorkerService, ChatEngineService],
  exports: [RunsService, ChatEngineService],
  controllers: [RunsController],
})
export class RunsModule {}
