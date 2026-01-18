import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { ChatRunsService } from './chat-runs.service';
import { SendMessageDto } from './dto/send-message.dto';
import { RegenerateDto } from './dto/regenerate.dto';

@ApiTags('Chat Runs')
@Controller()
export class ChatRunsController {
  constructor(private readonly chatRuns: ChatRunsService) {}

  @Post('chats/:chatId/send')
  @ApiOperation({ summary: 'Send a message and enqueue a run (server-owned settings snapshot)' })
  @ApiParam({ name: 'chatId' })
  send(@Param('chatId') chatId: string, @Body() body: SendMessageDto) {
    return this.chatRuns.sendAndEnqueue({
      chatId,
      content: body.content,
      clientRequestId: body.clientRequestId,
      settingsProfileId: body.settingsProfileId,
      settingsSnapshot: body.settingsSnapshot,
    });
  }

  @Post('messages/:messageId/regenerate')
  @ApiOperation({ summary: 'Regenerate an assistant message (new active variant + queued run)' })
  regenerate(@Param('messageId') messageId: string, @Body() body: RegenerateDto) {
    return this.chatRuns.regenerate({
      messageId,
      clientRequestId: body.clientRequestId,
      settingsProfileId: body.settingsProfileId,
    });
  }
}
