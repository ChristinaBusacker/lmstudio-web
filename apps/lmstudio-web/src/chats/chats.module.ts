import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatEntity } from './entities/chat.entity';
import { MessageEntity } from './entities/message.entity';
import { ChatsService } from './chats.service';
import { ChatsController } from './chats.controller';
import { SettingsModule } from '../settings/settings.module';
import { ChatContextBuilder } from './chat-context.builder';
import { ChatFolderEntity } from './entities/chat-folder.entity';
import { MessageVariantEntity } from './entities/message-variant.entity';
import { MessageVariantsService } from './message-variants.service';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';
import { ChatThreadQueryService } from './chat-thread-query.service';
import { ChatBranchingService } from './chat-branching.service';
import { ChatFoldersService } from './chat-folders.service';
import { FoldersController } from './chat-folders.controller';
import { SseModule } from '../sse/sse.module';
import { ChatImportExportService } from './chat-import-export.service';
import { ChatImportExportController } from './chat-import-export.controller';
import { ChatForkService } from './chat-fork.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatEntity, MessageEntity, ChatFolderEntity, MessageVariantEntity]),
    SettingsModule,
    SseModule,
  ],
  providers: [
    ChatsService,
    ChatContextBuilder,
    MessageVariantsService,
    MessagesService,
    ChatThreadQueryService,
    ChatBranchingService,
    ChatFoldersService,
    ChatImportExportService,
    ChatForkService,
  ],
  controllers: [ChatsController, MessagesController, FoldersController, ChatImportExportController],
  exports: [
    ChatsService,
    ChatContextBuilder,
    MessageVariantsService,
    MessagesService,
    ChatThreadQueryService,
    ChatBranchingService,
    ChatFoldersService,
    ChatImportExportService,
    ChatForkService,
  ],
})
export class ChatsModule {}
