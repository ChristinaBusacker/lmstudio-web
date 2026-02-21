import { Test } from '@nestjs/testing';
import { SystemController } from './system.controller';
import { ExternalServicesMonitorService } from './external-services-monitor.service';
import type { ExternalServiceStatus } from '@shared/contracts';

type MonitorMock = Pick<ExternalServicesMonitorService, 'getSnapshot'>;

describe('SystemController', () => {
  let controller: SystemController;
  let monitor: jest.Mocked<MonitorMock>;

  beforeEach(async () => {
    const snapshot: ExternalServiceStatus[] = [
      { name: 'lmstudio', ok: true, checkedAt: '2026-01-01T00:00:00.000Z', enabled: true },
    ];

    monitor = {
      getSnapshot: jest.fn(() => snapshot),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [SystemController],
      providers: [{ provide: ExternalServicesMonitorService, useValue: monitor }],
    }).compile();

    controller = moduleRef.get(SystemController);
  });

  it('getExternalStatus() returns snapshot wrapped in {services: ...}', () => {
    expect(controller.getExternalStatus()).toEqual({
      services: [{ key: 'lmstudio', ok: true, checkedAt: '2026-01-01T00:00:00.000Z' }],
    });
    expect(monitor.getSnapshot).toHaveBeenCalledTimes(1);
  });
});
