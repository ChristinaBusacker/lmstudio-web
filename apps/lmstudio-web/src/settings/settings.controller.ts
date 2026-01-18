import { Body, Controller, Get, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
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
  @ApiOperation({ summary: 'List all settings profiles' })
  @ApiOkResponse({ type: [SettingsProfileDto] })
  listProfiles() {
    return this.settings.list(); // should return profiles
  }

  @Get('profiles/:id')
  @ApiOperation({ summary: 'Get a settings profile by id' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ type: SettingsProfileDto })
  @ApiNotFoundResponse({ description: 'Profile not found' })
  async getById(@Param('id') id: string) {
    const p = await this.settings.getById(id);
    if (!p) throw new NotFoundException('Profile not found');
    return p;
  }

  @Post('profiles')
  @ApiOperation({ summary: 'Create a new settings profile' })
  @ApiOkResponse({ type: SettingsProfileDto })
  @ApiBadRequestResponse({ description: 'Invalid payload' })
  create(@Body() dto: CreateSettingsProfileDto) {
    return this.settings.create(dto);
  }

  @Patch('profiles/:id')
  @ApiOperation({ summary: 'Update a settings profile' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ type: SettingsProfileDto })
  @ApiNotFoundResponse({ description: 'Profile not found' })
  update(@Param('id') id: string, @Body() dto: UpdateSettingsProfileDto) {
    return this.settings.update(id, dto);
  }

  @Post('profiles/:id/default')
  @ApiOperation({ summary: 'Set this profile as default' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ type: SettingsProfileDto })
  setDefault(@Param('id') id: string) {
    return this.settings.setDefaultById(id);
  }
}
