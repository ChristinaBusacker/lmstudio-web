import { WebReaderService } from './web-reader.service';

jest.mock('@mozilla/readability', () => ({
  Readability: jest.fn().mockImplementation(() => ({
    parse: () => ({
      title: 'Readable Title',
      byline: 'Readable Author',
      content: '<p>Hello <b>World</b></p><p>Second</p>',
    }),
  })),
}));

describe('WebReaderService', () => {
  beforeEach(() => {
    // @ts-expect-error test env
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('extracts meta + readable text and stores artifact when runId provided', async () => {
    const html = `
      <html lang="en">
        <head>
          <title>Fallback Title</title>
          <meta property="og:title" content="OG Title" />
          <meta name="author" content="Meta Author" />
          <meta property="article:published_time" content="2020-01-01T00:00:00.000Z" />
          <meta property="og:site_name" content="Example Site" />
        </head>
        <body>
          <article><p>Hello World</p></article>
        </body>
      </html>
    `;

    const fetchMock = global.fetch as unknown as jest.Mock;
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => html,
    });

    const artifacts = {
      createJson: jest.fn().mockResolvedValue({ id: 'a1' }),
    } as any;

    const svc = new WebReaderService(artifacts);
    const res = await svc.read({ url: 'https://example.com/x', runId: 'r1' });

    expect(res.url).toBe('https://example.com/x');
    expect(res.meta.lang).toBe('en');

    // Readability mocked: should win over meta/title fallback
    expect(res.meta.title).toBe('Readable Title');
    expect(res.meta.author).toBe('Readable Author');
    expect(res.meta.publishedAt).toContain('2020-01-01');
    expect(res.meta.siteName).toBe('Example Site');

    expect(res.text).toContain('Hello World');
    expect(res.text).toContain('Second');
    expect(res.artifactId).toBe('a1');

    expect(artifacts.createJson).toHaveBeenCalledTimes(1);
    const call = artifacts.createJson.mock.calls[0][0];
    expect(call.runId).toBe('r1');
    expect(call.toolName).toBe('web_read');
    expect(call.json.meta.title).toBe('Readable Title');
  });

  it('does not create artifact when runId not provided', async () => {
    const fetchMock = global.fetch as unknown as jest.Mock;
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => '<html><body><p>x</p></body></html>',
    });

    const artifacts = { createJson: jest.fn() } as any;
    const svc = new WebReaderService(artifacts);
    const res = await svc.read({ url: 'https://example.com/x' });

    expect(res.artifactId).toBe(null);
    expect(artifacts.createJson).not.toHaveBeenCalled();
  });
});
