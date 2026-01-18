import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Delete,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { MessageVariantsService } from './message-variants.service';
import { MessagesService } from './messages.service';

import { ActivateVariantDto, CreateVariantDto } from './dto/message-variants.dto';

@ApiTags('Messages')
@Controller('messages')
export class MessagesController {
  constructor(
    private readonly messages: MessagesService,
    private readonly variants: MessageVariantsService,
  ) {}

  @Get(':messageId/variants')
  @ApiOperation({ summary: 'List all variants for a message' })
  @ApiParam({ name: 'messageId' })
  async list(@Param('messageId') messageId: string) {
    const msg = await this.messages.getById(messageId);
    if (!msg) throw new NotFoundException(`Message not found: ${messageId}`);
    return this.variants.list(messageId);
  }

  @Post(':messageId/variants')
  @ApiOperation({ summary: 'Create a new variant and activate it (marks message edited)' })
  @ApiParam({ name: 'messageId' })
  async create(@Param('messageId') messageId: string, @Body() body: CreateVariantDto) {
    const msg = await this.messages.getById(messageId);
    if (!msg) throw new NotFoundException(`Message not found: ${messageId}`);
    if (msg.deletedAt) throw new BadRequestException('Cannot add variants to a deleted message');

    const content = body.content.trim();
    if (!content) throw new BadRequestException('content must not be empty');

    const v = await this.variants.createAndActivate({ messageId, content });
    await this.messages.markEdited(messageId);
    return v;
  }

  @Patch(':messageId/variants/active')
  @ApiOperation({ summary: 'Activate an existing variant for a message (marks message edited)' })
  @ApiParam({ name: 'messageId' })
  async activate(@Param('messageId') messageId: string, @Body() body: ActivateVariantDto) {
    const msg = await this.messages.getById(messageId);
    if (!msg) throw new NotFoundException(`Message not found: ${messageId}`);
    if (msg.deletedAt)
      throw new BadRequestException('Cannot activate variants for a deleted message');

    const active = await this.variants.activate(messageId, body.variantId);
    if (!active) throw new NotFoundException('Variant not found');

    await this.messages.markEdited(messageId);
    return active;
  }

  @Delete(':messageId')
  @ApiOperation({ summary: 'Soft delete a message (repairs chat head if needed)' })
  @ApiParam({ name: 'messageId' })
  softDelete(@Param('messageId') messageId: string) {
    return this.messages.softDeleteMessage(messageId);
  }
}
