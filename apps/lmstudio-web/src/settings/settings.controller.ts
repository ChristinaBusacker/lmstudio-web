/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Body, Controller, Get, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import {
  CreateSettingsProfileDto,
  SettingsProfileDto,
  UpdateSettingsProfileDto,
} from './dto/settings.dto';

@ApiTags('Settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('profiles')
  @ApiOperation({ summary: 'List all settings profiles (ownerKey="default")' })
  @ApiOkResponse({ type: [SettingsProfileDto] })
  async listProfiles() {
    const list = await this.settings.list();
    return list.map((p) => this.toDto(p));
  }

  @Get('profiles/:id')
  @ApiOperation({ summary: 'Get a settings profile by id' })
  @ApiParam({ name: 'id', description: 'Profile id' })
  @ApiOkResponse({ type: SettingsProfileDto })
  @ApiNotFoundResponse({ description: 'Profile not found' })
  async getById(@Param('id') id: string) {
    const p = await this.settings.getById(id);
    if (!p) throw new NotFoundException('Profile not found');
    return this.toDto(p);
  }

  @Post('profiles')
  @ApiOperation({ summary: 'Create a new settings profile (ownerKey="default")' })
  @ApiCreatedResponse({ type: SettingsProfileDto })
  @ApiBadRequestResponse({ description: 'Invalid payload' })
  async create(@Body() dto: CreateSettingsProfileDto) {
    const p = await this.settings.create(dto);
    return this.toDto(p);
  }

  @Patch('profiles/:id')
  @ApiOperation({ summary: 'Update a settings profile' })
  @ApiParam({ name: 'id', description: 'Profile id' })
  @ApiOkResponse({ type: SettingsProfileDto })
  @ApiBadRequestResponse({ description: 'Invalid payload' })
  @ApiNotFoundResponse({ description: 'Profile not found' })
  async update(@Param('id') id: string, @Body() dto: UpdateSettingsProfileDto) {
    const p = await this.settings.update(id, dto);
    return this.toDto(p);
  }

  @Post('profiles/:id/default')
  @ApiOperation({
    summary: 'Set this profile as default (ownerKey-scoped)',
    description:
      'Unsets any existing default profile for the same ownerKey, then marks this one as default.',
  })
  @ApiParam({ name: 'id', description: 'Profile id' })
  @ApiOkResponse({ type: SettingsProfileDto })
  @ApiNotFoundResponse({ description: 'Profile not found' })
  async setDefault(@Param('id') id: string) {
    const p = await this.settings.setDefaultById(id);
    return this.toDto(p);
  }

  private toDto(p: any): SettingsProfileDto {
    return {
      id: String(p.id),
      ownerKey: String(p.ownerKey),
      name: String(p.name),
      params: (p.params ?? {}) as Record<string, any>,
      isDefault: Boolean(p.isDefault),
      createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt),
      updatedAt: p.updatedAt instanceof Date ? p.updatedAt.toISOString() : String(p.updatedAt),
    };
  }
}
