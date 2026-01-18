import { Module } from '@nestjs/common';
import { ChatsModule } from '../chats/chats.module';
import { RunsModule } from '../runs/runs.module';
import { SettingsModule } from '../settings/settings.module';
import { ChatRunsController } from './chat-runs.controller';
import { ChatRunsService } from './chat-runs.service';

@Module({
  imports: [ChatsModule, RunsModule, SettingsModule],
  controllers: [ChatRunsController],
  providers: [ChatRunsService],
  exports: [ChatRunsService],
})
export class ChatRunsModule {}
