// src/search/search.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SearchController } from './search.controller';
import { SearchService } from './search.service';

import { ChatEntity } from '../chats/entities/chat.entity';
// If you later want to query Message/Variant repositories directly, add them here too:
import { MessageEntity } from '../chats/entities/message.entity';
import { MessageVariantEntity } from '../chats/entities/message-variant.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ChatEntity, MessageEntity, MessageVariantEntity])],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService], // optional, but handy if other modules want search
})
export class SearchModule {}
