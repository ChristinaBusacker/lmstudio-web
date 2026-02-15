import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { ExternalServiceStatus } from '@shared/contracts';
import { ExternalServicesMonitorService } from './external-services-monitor.service';

@ApiTags('System')
@Controller('system')
export class SystemController {
  constructor(private readonly monitor: ExternalServicesMonitorService) {}

  @Get('external-status')
  @ApiOkResponse({
    description: 'Current reachability status for external dependencies (LM Studio, SearXNG).',
  })
  getExternalStatus(): { services: ExternalServiceStatus[] } {
    return { services: this.monitor.getSnapshot() };
  }
}
