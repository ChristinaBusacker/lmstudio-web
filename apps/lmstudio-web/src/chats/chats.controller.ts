import { Body, Controller, Delete, Get, Param, ParseBoolPipe, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ChatsService } from './chats.service';
import { CreateChatDto } from './dto/create-chat.dto';
import { ChatThreadResponseDto } from './dto/thread.dto';
import { ChatThreadQueryService } from './chat-thread-query.service';
import { ChatBranchingService } from './chat-branching.service';
import { ActivateHeadDto } from './dto/activate-head.dto';

@ApiTags('Chats')
@Controller('chats')
export class ChatsController {
  constructor(
    private readonly chats: ChatsService,
    private readonly thread: ChatThreadQueryService,
    private readonly branching: ChatBranchingService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a chat' })
  createChat(@Body() body: CreateChatDto) {
    return this.chats.createChat(body.title);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get chat meta' })
  @ApiParam({ name: 'id', example: 'b7a1b0f7-9f2e-4d3f-9e5a-2b19a9c6e2dd' })
  getChat(@Param('id') id: string) {
    return this.chats.getChat(id);
  }

  @Get(':id/thread')
  @ApiOperation({ summary: 'Get chat all messages and message variants' })
  @ApiQuery({ name: 'includeReasoning', required: false, type: Boolean })
  @ApiOkResponse({ type: ChatThreadResponseDto })
  getThread(
    @Param('id') chatId: string,
    @Query('includeReasoning', new ParseBoolPipe({ optional: true })) includeReasoning?: boolean,
  ) {
    return this.thread.getThread(chatId, { includeReasoning });
  }

  @Post(':chatId/activate-head')
  @ApiOperation({ summary: 'Switch the active head message (branching)' })
  @ApiParam({ name: 'chatId' })
  activateHead(@Param('chatId') chatId: string, @Body() body: ActivateHeadDto) {
    return this.branching.activateHead(chatId, body.messageId ?? null);
  }

  @Delete(':chatId')
  @ApiOperation({ summary: 'Soft delete a chat' })
  @ApiParam({ name: 'chatId' })
  async softDelete(@Param('chatId') chatId: string) {
    await this.chats.softDeleteChat(chatId);
    return { chatId, deletedAt: new Date().toISOString() };
  }
}
