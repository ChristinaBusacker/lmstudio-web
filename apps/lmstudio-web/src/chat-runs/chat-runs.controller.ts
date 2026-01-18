/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Body, Controller, Param, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ChatRunsService } from './chat-runs.service';
import { SendMessageDto } from './dto/send-message.dto';
import { RegenerateDto } from './dto/regenerate.dto';
import { EnqueueRunResponseDto } from './dto/chat-run-responses.dto';

@ApiTags('Chat Runs')
@Controller()
export class ChatRunsController {
  constructor(private readonly chatRuns: ChatRunsService) {}

  @Post('chats/:chatId/send')
  @ApiOperation({
    summary: 'Send a message and enqueue a run (server-owned settings snapshot)',
    description:
      'Creates a user message + assistant placeholder, moves the chat head to the assistant placeholder, ' +
      'resolves a frozen settings snapshot (hard defaults + profile + optional overrides), and enqueues a run.',
  })
  @ApiParam({ name: 'chatId', description: 'Chat id' })
  @ApiCreatedResponse({ type: EnqueueRunResponseDto })
  @ApiNotFoundResponse({ description: 'Chat not found' })
  @ApiBadRequestResponse({
    description:
      'Invalid payload (e.g. empty content), missing modelKey after settings resolution, or other validation errors',
  })
  async send(
    @Param('chatId') chatId: string,
    @Body() body: SendMessageDto,
  ): Promise<EnqueueRunResponseDto> {
    const run = await this.chatRuns.sendAndEnqueue({
      chatId,
      content: body.content,
      clientRequestId: body.clientRequestId,
      settingsProfileId: body.settingsProfileId,
      settingsSnapshot: body.settingsSnapshot,
    });

    return this.toEnqueueRunResponse(run);
  }

  @Post('messages/:messageId/regenerate')
  @ApiOperation({
    summary: 'Regenerate an assistant message (new active variant + queued run)',
    description:
      'Creates a new active variant on the assistant message (empty content), sets chat head to that assistant message, ' +
      'resolves a frozen settings snapshot (hard defaults + profile), and enqueues a run that writes into the active variant.',
  })
  @ApiParam({ name: 'messageId', description: 'Assistant message id to regenerate' })
  @ApiCreatedResponse({ type: EnqueueRunResponseDto })
  @ApiNotFoundResponse({ description: 'Message not found' })
  @ApiBadRequestResponse({
    description:
      'Message is not an assistant, parent user message missing/deleted, or missing modelKey after settings resolution',
  })
  async regenerate(
    @Param('messageId') messageId: string,
    @Body() body: RegenerateDto,
  ): Promise<EnqueueRunResponseDto> {
    const run = await this.chatRuns.regenerate({
      messageId,
      clientRequestId: body.clientRequestId,
      settingsProfileId: body.settingsProfileId,
    });

    return this.toEnqueueRunResponse(run);
  }

  /**
   * Maps a run-like object (usually RunEntity) to a stable API response.
   * This keeps OpenAPI and UI contract stable even if the DB entity evolves.
   */
  private toEnqueueRunResponse(run: any): EnqueueRunResponseDto {
    return {
      runId: String(run.id),
      chatId: String(run.chatId),
      sourceMessageId: run.sourceMessageId ?? null,
      targetMessageId: run.targetMessageId ?? null,
      headMessageIdAtStart: run.headMessageIdAtStart ?? null,
      queueKey: String(run.queueKey ?? 'default'),
      status: run.status ?? 'queued',
      createdAt:
        run.createdAt instanceof Date
          ? run.createdAt.toISOString()
          : String(run.createdAt ?? new Date().toISOString()),
    };
  }
}
