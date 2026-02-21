import { ServiceUnavailableException } from '@nestjs/common';
import { WebSearchService } from './web-search.service';

describe('WebSearchService', () => {
  const config = { get: jest.fn() } as any;
  const artifacts = { createJson: jest.fn(async () => ({ id: 'art1' })) } as any;

  const mockFetch = (impl: (url: string) => Promise<any>) => {
    (global as any).fetch = jest.fn((url: any) => impl(String(url)));
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses searxng when configured and stores artifact when runId provided', async () => {
    config.get.mockImplementation((k: string) =>
      k === 'SEARXNG_BASE_URL' ? 'http://sx' : undefined,
    );

    mockFetch(async (url) => {
      expect(url).toContain('http://sx/search');
      expect(url).toContain('format=json');
      expect(url).toContain('engines=google');
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          results: [
            {
              title: 'T',
              url: 'https://e',
              content: 'S',
              engine: 'google',
              publishedDate: '2020-01-01',
            },
          ],
        }),
      };
    });

    const svc = new WebSearchService(config, artifacts);
    const res = await svc.search({ q: 'hi', limit: 5, runId: 'r1' });

    expect(res.query).toBe('hi');
    expect(res.results[0]).toEqual(
      expect.objectContaining({ title: 'T', url: 'https://e', snippet: 'S', engine: 'google' }),
    );
    expect(res.artifactId).toBe('art1');
    expect(artifacts.createJson).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'r1', toolName: 'web_search', filename: 'web_search.json' }),
    );
  });

  it('throws ServiceUnavailableException when searxng configured but unreachable', async () => {
    config.get.mockImplementation((k: string) =>
      k === 'SEARXNG_BASE_URL' ? 'http://sx' : undefined,
    );
    (global as any).fetch = jest.fn(async () => {
      throw new Error('connection refused');
    });

    const svc = new WebSearchService(config, artifacts);
    await expect(svc.search({ q: 'x', limit: 3 })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('falls back to DuckDuckGo when searxng not configured', async () => {
    config.get.mockImplementation(() => '');

    mockFetch(async (url) => {
      expect(url).toContain('https://api.duckduckgo.com/');
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          RelatedTopics: [
            { Text: 'Example - Something', FirstURL: 'https://ddg.example' },
            { Topics: [{ Text: 'Nested - Topic', FirstURL: 'https://ddg.nested' }] },
          ],
        }),
      };
    });

    const svc = new WebSearchService(config, artifacts);
    const res = await svc.search({ q: 'q', limit: 2 });
    expect(res.results).toHaveLength(2);
    expect(res.results[0].engine).toBe('duckduckgo');
  });
});
