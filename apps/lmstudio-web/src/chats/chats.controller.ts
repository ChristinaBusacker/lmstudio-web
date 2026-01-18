import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseBoolPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ChatsService } from './chats.service';
import { CreateChatDto } from './dto/create-chat.dto';
import { ChatThreadResponseDto } from './dto/thread.dto';
import { ChatThreadQueryService } from './chat-thread-query.service';
import { ChatBranchingService } from './chat-branching.service';
import { ActivateHeadDto } from './dto/activate-head.dto';
import {
  ActivateHeadResponseDto,
  ChatMetaDto,
  SoftDeleteChatResponseDto,
} from './dto/chat-meta.dto';

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
  @ApiCreatedResponse({ type: ChatMetaDto })
  @ApiBadRequestResponse({ description: 'Invalid payload' })
  async createChat(@Body() body: CreateChatDto) {
    // If title optional, service handles trim/null logic
    return this.chats.createChat(body.title);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get chat meta (no messages)' })
  @ApiParam({ name: 'id', example: 'b7a1b0f7-9f2e-4d3f-9e5a-2b19a9c6e2dd' })
  @ApiOkResponse({ type: ChatMetaDto })
  @ApiNotFoundResponse({ description: 'Chat not found' })
  async getChat(@Param('id') id: string) {
    const chat = await this.chats.getChat(id);
    if (!chat) throw new NotFoundException('Chat not found');
    return chat;
  }

  @Get(':id/thread')
  @ApiOperation({
    summary: 'Get active thread (active variants only + variantsCount)',
    description:
      'Returns the active message chain based on chat.activeHeadMessageId. ' +
      'For each message, only the active variant is returned. ' +
      'Use /messages/:id/variants to fetch all variants.',
  })
  @ApiParam({ name: 'id', description: 'Chat id' })
  @ApiQuery({
    name: 'includeReasoning',
    required: false,
    type: Boolean,
    description:
      'If true, includes reasoning for active variants (never used for context by default).',
  })
  @ApiOkResponse({ type: ChatThreadResponseDto })
  @ApiNotFoundResponse({ description: 'Chat not found' })
  getThread(
    @Param('id') chatId: string,
    @Query('includeReasoning', new ParseBoolPipe({ optional: true }))
    includeReasoning?: boolean,
  ) {
    return this.thread.getThread(chatId, { includeReasoning });
  }

  @Post(':chatId/activate-head')
  @ApiOperation({
    summary: 'Switch the active head message (branching)',
    description:
      'Sets chat.activeHeadMessageId. The next /chats/:chatId/send will attach the new user message to this head.',
  })
  @ApiParam({ name: 'chatId', description: 'Chat id' })
  @ApiCreatedResponse({ type: ActivateHeadResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid messageId or message does not belong to chat' })
  @ApiNotFoundResponse({ description: 'Chat or message not found' })
  activateHead(@Param('chatId') chatId: string, @Body() body: ActivateHeadDto) {
    return this.branching.activateHead(chatId, body.messageId ?? null);
  }

  @Delete(':chatId')
  @ApiOperation({ summary: 'Soft delete a chat' })
  @ApiParam({ name: 'chatId', description: 'Chat id' })
  @ApiOkResponse({ type: SoftDeleteChatResponseDto })
  @ApiNotFoundResponse({ description: 'Chat not found' })
  async softDelete(@Param('chatId') chatId: string) {
    const chat = await this.chats.getChat(chatId);
    if (!chat) throw new NotFoundException('Chat not found');

    await this.chats.softDeleteChat(chatId);

    return { chatId, deletedAt: new Date().toISOString() };
  }
}
