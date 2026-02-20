import { ExternalServicesMonitorService } from './external-services-monitor.service';

describe('ExternalServicesMonitorService', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    // @ts-expect-error test env
    global.fetch = fetchMock;

    jest.spyOn(global, 'setInterval').mockImplementation(() => ({ unref: jest.fn() } as any));
    jest.spyOn(global, 'clearInterval').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('publishes only when status payload changes', async () => {
    const config = {
      get: jest.fn((k: string) => {
        if (k === 'LMSTUDIO_BASE_URL') return 'http://lm:1234';
        if (k === 'SEARXNG_BASE_URL') return ''; // disabled
        return null;
      }),
    } as any;

    const bus = { publish: jest.fn() } as any;

    // First check: LM ok
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', json: async () => ({}) });

    const svc = new ExternalServicesMonitorService(config, bus);

    await (svc as any).checkAllAndPublishIfChanged();
    expect(bus.publish).toHaveBeenCalledTimes(1);

    // Same result again -> no publish
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', json: async () => ({}) });
    await (svc as any).checkAllAndPublishIfChanged();
    expect(bus.publish).toHaveBeenCalledTimes(1);

    // LM goes down -> publish
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, statusText: 'ERR', json: async () => ({}) });
    await (svc as any).checkAllAndPublishIfChanged();
    expect(bus.publish).toHaveBeenCalledTimes(2);

    const lastPayload = bus.publish.mock.calls[1][0].payload;
    expect(lastPayload.services.find((s: any) => s.name === 'lmstudio').ok).toBe(false);
    expect(lastPayload.services.find((s: any) => s.name === 'searxng').enabled).toBe(false);
  });

  it('marks searxng disabled when base url not set', async () => {
    const config = {
      get: jest.fn((k: string) => {
        if (k === 'LMSTUDIO_BASE_URL') return 'http://lm:1234';
        if (k === 'SEARXNG_BASE_URL') return '';
        return null;
      }),
    } as any;

    const bus = { publish: jest.fn() } as any;

    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', json: async () => ({}) });

    const svc = new ExternalServicesMonitorService(config, bus);
    await (svc as any).checkAllAndPublishIfChanged();

    const snap = svc.getSnapshot();
    const searx = snap.find((s) => s.name === 'searxng')!;
    expect(searx.enabled).toBe(false);
    expect(searx.baseUrl).toBe(null);
  });
});
