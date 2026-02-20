import { WebReaderService } from './web-reader.service';

jest.mock('@mozilla/readability', () => {
  return {
    Readability: class {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      constructor(_doc: any) {}
      parse() {
        return {
          title: 'Readable Title',
          byline: 'Readable Author',
          content: '<p>Hello</p><script>evil()</script><ul><li>Item</li></ul>',
        };
      }
    },
  };
});

describe('WebReaderService', () => {
  const artifacts = { createJson: jest.fn(async () => ({ id: 'art1' })) } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('extracts meta + readable text and stores artifact when runId provided', async () => {
    (global as any).fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => `<!doctype html>
        <html lang="en">
          <head>
            <title>Fallback Title</title>
            <meta property="og:site_name" content="SiteName" />
            <meta property="article:published_time" content="2020-01-02T03:04:05Z" />
          </head>
          <body>
            <article><h1>Hi</h1><p>Body</p></article>
          </body>
        </html>`,
    }));

    const svc = new WebReaderService(artifacts);
    const res = await svc.read({ url: 'https://example.com/a', runId: 'r1' });

    expect(res.url).toBe('https://example.com/a');
    expect(res.meta.title).toBe('Readable Title');
    expect(res.meta.author).toBe('Readable Author');
    expect(res.meta.siteName).toBe('SiteName');
    expect(res.meta.lang).toBe('en');
    expect(res.meta.publishedAt).toBe('2020-01-02T03:04:05.000Z');
    expect(res.text).toContain('Hello');
    expect(res.text).toContain('- Item');
    expect(res.artifactId).toBe('art1');
    expect(artifacts.createJson).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'r1', toolName: 'web_read', filename: 'web_read.json' }),
    );
  });
});
