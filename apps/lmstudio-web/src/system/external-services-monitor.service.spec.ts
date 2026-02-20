import { ExternalServicesMonitorService } from './external-services-monitor.service';

const flush = () => new Promise((r) => setImmediate(r));

describe('ExternalServicesMonitorService', () => {
  const config = { get: jest.fn() } as any;
  const bus = { publish: jest.fn() } as any;

  const mockFetch = (impl: (url: string, init?: any) => Promise<any>) => {
    (global as any).fetch = jest.fn((url: any, init: any) => impl(String(url), init));
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('publishes only when status payload changes', async () => {
    config.get.mockImplementation((k: string) => {
      if (k === 'LMSTUDIO_BASE_URL') return 'http://lm:1234';
      if (k === 'SEARXNG_BASE_URL') return ''; // disabled
      return undefined;
    });

    let ok = true;
    mockFetch(async (url) => {
      if (url.includes('/v1/models')) {
        return {
          ok,
          status: ok ? 200 : 503,
          statusText: ok ? 'OK' : 'Down',
          json: async () => ({ data: [] }),
        };
      }
      throw new Error('unexpected url ' + url);
    });

    const svc = new ExternalServicesMonitorService(config, bus);

    svc.onModuleInit();
    await flush();
    // first check publishes
    expect(bus.publish).toHaveBeenCalledTimes(1);

    // next interval with same status should not publish
    jest.advanceTimersByTime(30_000);
    await flush();
    expect(bus.publish).toHaveBeenCalledTimes(1);

    // change LM status to down => publish again
    ok = false;
    jest.advanceTimersByTime(30_000);
    await flush();
    expect(bus.publish).toHaveBeenCalledTimes(2);

    svc.onModuleDestroy();
  });

  it('marks searxng disabled when base url not set', async () => {
    config.get.mockImplementation((k: string) => {
      if (k === 'LMSTUDIO_BASE_URL') return 'http://lm:1234';
      if (k === 'SEARXNG_BASE_URL') return '';
      return undefined;
    });
    mockFetch(async () => ({ ok: true, status: 200, statusText: 'OK', json: async () => ({}) }));

    const svc = new ExternalServicesMonitorService(config, bus);
    svc.onModuleInit();
    await flush();

    const snap = svc.getSnapshot();
    const searx = snap.find((x) => x.name === 'searxng')!;
    expect(searx.enabled).toBe(false);
    expect(searx.baseUrl).toBeNull();
  });
});
