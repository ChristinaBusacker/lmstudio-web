import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import type { ChatMeta } from '@shared/contracts';

import { ChatImportExportService } from './chat-import-export.service';
import { ChatExportBundleDto } from './dto/chat-export.dto';

@ApiTags('Chats')
@Controller('chats')
export class ChatImportExportController {
  constructor(private readonly ie: ChatImportExportService) {}

  @Get(':chatId/export')
  @ApiOperation({ summary: 'Export a chat (messages + variants) as a JSON bundle' })
  @ApiParam({ name: 'chatId', description: 'Chat id' })
  @ApiOkResponse({ type: ChatExportBundleDto })
  export(@Param('chatId') chatId: string) {
    return this.ie.exportChat(chatId);
  }

  @Post('import')
  @ApiOperation({ summary: 'Import a chat JSON bundle (creates a new chat)' })
  @ApiCreatedResponse({ description: 'Chat meta of the created chat' })
  @ApiBadRequestResponse({ description: 'Invalid bundle' })
  async import(@Body() body: ChatExportBundleDto): Promise<ChatMeta> {
    const chat = await this.ie.importChat(body);
    return {
      id: chat.id,
      title: chat.title,
      folderId: chat.folderId,
      activeHeadMessageId: chat.activeHeadMessageId,
      deletedAt: chat.deletedAt ? chat.deletedAt.toISOString() : null,
    };
  }
}
