import { TimeToolsService } from './time-tools.service';

describe('TimeToolsService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-20T12:34:56.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('currentTime falls back to Europe/Berlin for invalid timezone', () => {
    const svc = new TimeToolsService();
    const r = svc.currentTime({ timezone: 'Not/A_TimeZone' });
    expect(r.timezone).toBe('Europe/Berlin');
    expect(typeof r.nowIso).toBe('string');
    expect(typeof r.nowUtcIso).toBe('string');
  });

  it('dateMath adds days and can round to hour', () => {
    const svc = new TimeToolsService();
    const r = svc.dateMath({
      base: '2026-02-20T12:34:56.000Z',
      timezone: 'UTC',
      add: { days: 1 },
      roundTo: 'hour',
    });
    expect(r.ok).toBe(true);
    expect(r.resultUtcIso).toBe('2026-02-21T13:00:00.000Z');
  });

  it('dateMath supports startOf and endOf', () => {
    const svc = new TimeToolsService();

    const start = svc.dateMath({
      base: '2026-02-20T12:34:56.000Z',
      timezone: 'UTC',
      startOf: 'day',
    });
    expect(start.resultUtcIso).toBe('2026-02-20T00:00:00.000Z');

    const endOfMonth = svc.dateMath({
      base: '2026-02-20T12:34:56.000Z',
      timezone: 'UTC',
      endOf: 'month',
    });
    // 2026-02 has 28 days
    expect(endOfMonth.resultUtcIso).toBe('2026-02-28T23:59:59.000Z');
  });
});
