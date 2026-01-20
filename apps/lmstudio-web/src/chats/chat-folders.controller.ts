/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
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
import { ChatFoldersService } from './chat-folders.service';
import { ChatFolderDto } from './dto/folders/folder.dto';
import { CreateChatFolderDto } from './dto/folders/create-folder.dto';
import { UpdateChatFolderDto } from './dto/folders/update-folder.dto';
import { DeleteChatFolderResponseDto } from './dto/folders/delete-folder-response.dto';

@ApiTags('Folders')
@Controller('folders')
export class FoldersController {
  constructor(private readonly folders: ChatFoldersService) {}

  @Get()
  @ApiOperation({ summary: 'List chat folders' })
  @ApiOkResponse({ type: [ChatFolderDto] })
  async list(): Promise<ChatFolderDto[]> {
    const list = await this.folders.list();
    return list.map(this.toDto);
  }

  @Post()
  @ApiOperation({ summary: 'Create a folder' })
  @ApiCreatedResponse({ type: ChatFolderDto })
  @ApiBadRequestResponse({ description: 'Invalid payload' })
  async create(@Body() dto: CreateChatFolderDto): Promise<ChatFolderDto> {
    const f = await this.folders.create(dto.name);
    return this.toDto(f);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename a folder' })
  @ApiParam({ name: 'id', description: 'Folder id' })
  @ApiOkResponse({ type: ChatFolderDto })
  @ApiNotFoundResponse({ description: 'Folder not found' })
  async update(@Param('id') id: string, @Body() dto: UpdateChatFolderDto): Promise<ChatFolderDto> {
    const f = await this.folders.update(id, { name: dto.name });
    if (!f) throw new NotFoundException('Folder not found');
    return this.toDto(f);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete a folder (moves chats out)' })
  @ApiParam({ name: 'id', description: 'Folder id' })
  @ApiOkResponse({ type: DeleteChatFolderResponseDto })
  @ApiNotFoundResponse({ description: 'Folder not found' })
  async softDelete(@Param('id') id: string): Promise<DeleteChatFolderResponseDto> {
    const res = await this.folders.softDelete(id);
    if (!res.folder) throw new NotFoundException('Folder not found');

    return {
      folderId: id,
      deletedAt: res.folder.deletedAt
        ? res.folder.deletedAt.toISOString()
        : new Date().toISOString(),
      affectedChats: res.affectedChats,
    };
  }

  private toDto = (f: any): ChatFolderDto => ({
    id: String(f.id),
    name: String(f.name),
    createdAt: f.createdAt instanceof Date ? f.createdAt.toISOString() : String(f.createdAt),
    updatedAt: f.updatedAt instanceof Date ? f.updatedAt.toISOString() : String(f.updatedAt),
    deletedAt: f.deletedAt
      ? f.deletedAt instanceof Date
        ? f.deletedAt.toISOString()
        : String(f.deletedAt)
      : null,
  });
}
