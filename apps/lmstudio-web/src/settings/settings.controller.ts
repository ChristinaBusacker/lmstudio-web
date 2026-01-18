import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SettingsService } from './settings.service';

@ApiTags('Settings')
@Controller('settings-profiles')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  list(@Query('ownerKey') ownerKey?: string) {
    return this.settings.list(ownerKey ?? 'default');
  }

  @Post()
  create(@Body() body: { ownerKey?: string; name: string; params: any; makeDefault?: boolean }) {
    return this.settings.create(
      body.ownerKey ?? 'default',
      body.name,
      body.params ?? {},
      body.makeDefault ?? false,
    );
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: { name?: string; params?: any; isDefault?: boolean },
  ) {
    return this.settings.update(id, body);
  }
}
