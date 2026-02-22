import { ModelsService } from './models.service';

describe('ModelsService', () => {
  const sse = { publish: jest.fn() } as any;
  const config = {
    get: jest.fn((key: string, def?: any) => {
      if (key === 'LMSTUDIO_BASE_URL') return 'http://127.0.0.1:1234/';
      if (key === 'LMSTUDIO_API_TOKEN') return 'token123';
      return def;
    }),
  } as any;

  const mockFetch = (impl: (url: string, init?: any) => Promise<any>) => {
    (global as any).fetch = jest.fn((url: any, init: any) => impl(String(url), init));
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('listModels maps REST models into DTOs', async () => {
    mockFetch(async (url) => {
      expect(url).toBe('http://127.0.0.1:1234/api/v1/models');
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          models: [
            {
              key: 'm1',
              type: 'llm',
              publisher: 'pub',
              architecture: 'arch',
              quantization: { name: 'q4' },
              state: 'loaded',
              max_context_length: 8192,
              loaded_instances: [{ id: 'inst1' }],
            },
          ],
        }),
      };
    });

    const svc = new ModelsService(sse, config);
    const models = await svc.listModels();
    expect(models).toEqual([
      {
        id: 'm1',
        type: 'llm',
        publisher: 'pub',
        arch: 'arch',
        quantization: 'q4',
        state: 'loaded',
        maxContextLength: 8192,
        toolUse: false,
        vision: false,
      },
    ]);
  });

  it('getModel throws NotFoundException when model is missing', async () => {
    mockFetch(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ models: [] }),
    }));
    const svc = new ModelsService(sse, config);
    await expect(svc.getModel('nope')).rejects.toThrow('Model not found');
  });

  it('listLoaded returns loaded instance identifiers only', async () => {
    mockFetch(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        models: [
          { key: 'm1', type: 'llm', state: 'loaded', loaded_instances: [{ id: 'i1' }, {}] },
          { key: 'm2', type: 'embedding', state: 'loaded', loaded_instances: null },
        ],
      }),
    }));

    const svc = new ModelsService(sse, config);
    const loaded = await svc.listLoaded();
    expect(loaded).toEqual([{ id: 'm1', identifier: 'i1', type: 'llm' }]);
  });

  it('loadModel publishes events and maps to REST payload', async () => {
    const calls: Array<{ url: string; init?: any }> = [];
    mockFetch(async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith('/api/v1/models')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            models: [{ key: 'm1', type: 'llm', state: 'not-loaded', max_context_length: 1 }],
          }),
        };
      }
      if (url.endsWith('/api/v1/models/load')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ instance_id: 'inst42' }),
        };
      }
      throw new Error('Unexpected url: ' + url);
    });

    const svc = new ModelsService(sse, config);
    const res = await svc.loadModel('m1', { contextLength: 123 } as any);
    expect(res).toEqual({
      id: 'm1',
      identifier: 'inst42',
      state: 'loaded',
    });

    // Authorization header is attached when token present
    const loadCall = calls.find((c) => c.url.endsWith('/api/v1/models/load'))!;
    expect(loadCall.init.headers.Authorization).toContain('Bearer');
    expect(JSON.parse(loadCall.init.body)).toEqual({
      model: 'm1',
      echo_load_config: true,
      context_length: 123,
    });

    expect(sse.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'models.changed',
        payload: expect.objectContaining({ reason: 'model-loading-started' }),
      }),
    );
    expect(sse.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'models.changed',
        payload: expect.objectContaining({ reason: 'model-loaded' }),
      }),
    );
  });

  it('unloadModel is idempotent when there is no loaded instance', async () => {
    mockFetch(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        models: [{ key: 'm1', type: 'llm', state: 'not-loaded', loaded_instances: [] }],
      }),
    }));

    const svc = new ModelsService(sse, config);
    const res = await svc.unloadModel('m1', {} as any);
    expect(res).toEqual({ id: 'm1', identifier: undefined, state: 'not-loaded' });
    expect(sse.publish).not.toHaveBeenCalled();
  });
});
