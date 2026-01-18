/* eslint-disable @typescript-eslint/no-unsafe-member-access */
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
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { MessageVariantsService } from './message-variants.service';
import { MessagesService } from './messages.service';

import {
  ActivateVariantDto,
  CreateVariantDto,
  MessageVariantDto,
} from './dto/message-variants.dto';

import { SoftDeleteMessageResponseDto } from './dto/delete-message-response.dto';

@ApiTags('Messages')
@Controller('messages')
export class MessagesController {
  constructor(
    private readonly messages: MessagesService,
    private readonly variants: MessageVariantsService,
  ) {}

  @Get(':messageId/variants')
  @ApiOperation({ summary: 'List all variants for a message' })
  @ApiParam({ name: 'messageId', description: 'Message id' })
  @ApiOkResponse({ type: [MessageVariantDto] })
  @ApiNotFoundResponse({ description: 'Message not found' })
  async list(@Param('messageId') messageId: string) {
    const msg = await this.messages.getById(messageId);
    if (!msg) throw new NotFoundException(`Message not found: ${messageId}`);

    const variants = await this.variants.list(messageId);
    return variants.map((v) => this.toVariantDto(v));
  }

  @Post(':messageId/variants')
  @ApiOperation({ summary: 'Create a new variant and activate it (marks message edited)' })
  @ApiParam({ name: 'messageId', description: 'Message id' })
  @ApiCreatedResponse({ type: MessageVariantDto })
  @ApiBadRequestResponse({ description: 'Invalid payload or message deleted' })
  @ApiNotFoundResponse({ description: 'Message not found' })
  async create(@Param('messageId') messageId: string, @Body() body: CreateVariantDto) {
    const msg = await this.messages.getById(messageId);
    if (!msg) throw new NotFoundException(`Message not found: ${messageId}`);
    if (msg.deletedAt) throw new BadRequestException('Cannot add variants to a deleted message');

    const content = body.content.trim();
    if (!content) throw new BadRequestException('content must not be empty');

    const v = await this.variants.createAndActivate({ messageId, content });
    await this.messages.markEdited(messageId);

    return this.toVariantDto(v);
  }

  @Patch(':messageId/variants/active')
  @ApiOperation({ summary: 'Activate an existing variant for a message (marks message edited)' })
  @ApiParam({ name: 'messageId', description: 'Message id' })
  @ApiOkResponse({ type: MessageVariantDto })
  @ApiBadRequestResponse({ description: 'Message deleted or invalid payload' })
  @ApiNotFoundResponse({ description: 'Message or variant not found' })
  async activate(@Param('messageId') messageId: string, @Body() body: ActivateVariantDto) {
    const msg = await this.messages.getById(messageId);
    if (!msg) throw new NotFoundException(`Message not found: ${messageId}`);
    if (msg.deletedAt)
      throw new BadRequestException('Cannot activate variants for a deleted message');

    const active = await this.variants.activate(messageId, body.variantId);
    if (!active) throw new NotFoundException('Variant not found');

    await this.messages.markEdited(messageId);
    return this.toVariantDto(active);
  }

  @Delete(':messageId')
  @ApiOperation({ summary: 'Soft delete a message (repairs chat head if needed)' })
  @ApiParam({ name: 'messageId', description: 'Message id' })
  @ApiOkResponse({ type: SoftDeleteMessageResponseDto })
  @ApiNotFoundResponse({ description: 'Message not found' })
  softDelete(@Param('messageId') messageId: string) {
    // Ensure your MessagesService.softDeleteMessage returns { messageId, deletedAt }
    return this.messages.softDeleteMessage(messageId);
  }

  /**
   * Maps an entity-like object to a stable API DTO.
   * Keeps OpenAPI honest and decouples DB columns from API contract.
   */
  private toVariantDto(v: any): MessageVariantDto {
    return {
      id: String(v.id),
      messageId: String(v.messageId),
      variantIndex: Number(v.variantIndex),
      isActive: Boolean(v.isActive),
      content: String(v.content ?? ''),
      reasoning: v.reasoning ?? null,
      stats: v.stats ?? null,
      createdAt: v.createdAt instanceof Date ? v.createdAt.toISOString() : String(v.createdAt),
    };
  }
}
