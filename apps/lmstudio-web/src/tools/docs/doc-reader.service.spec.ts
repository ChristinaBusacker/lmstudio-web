import { DocReaderService, htmlToText } from './doc-reader.service';

jest.mock('file-type', () => ({
  fileTypeFromBuffer: jest.fn(),
}));

jest.mock('unzipper', () => ({
  __esModule: true,
  default: {
    Open: {
      buffer: jest.fn(),
    },
  },
}));

jest.mock('sanitize-html', () => ({
  __esModule: true,
  default: (html: string) => html,
}));

jest.mock('@mozilla/readability', () => {
  const ReadabilityMock = jest.fn().mockImplementation(() => ({
    parse: jest.fn(() => ({
      title: 'T',
      byline: 'A',
      content: '<p>Hello <b>World</b></p><p>Second</p>',
    })),
  }));

  return {
    __esModule: true,
    Readability: ReadabilityMock,
    default: ReadabilityMock,
  };
});

const { fileTypeFromBuffer } = jest.requireMock('file-type') as {
  fileTypeFromBuffer: jest.Mock;
};

const unzipper = (jest.requireMock('unzipper') as any).default as {
  Open: { buffer: jest.Mock };
};

describe('DocReaderService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('htmlToText uses readability+sanitize and produces readable plain text', () => {
    const out = htmlToText('<html><body><article><p>X</p></article></body></html>', 'https://x');
    expect(out).toContain('Hello World');
    expect(out).toContain('Second');
  });

  it('throws when assetId is missing', async () => {
    const svc = new DocReaderService({} as any, {} as any, {} as any);
    await expect(svc.read({} as any)).rejects.toThrow(/requires assetId/i);
  });

  it('reads a single HTML asset and stores run artifact when runId is provided', async () => {
    fileTypeFromBuffer.mockResolvedValue(null);
    const assets = {
      getById: jest.fn().mockResolvedValue({ originalFilename: 'doc.html' }),
      readBytes: jest.fn().mockResolvedValue(Buffer.from('<p>ignored</p>', 'utf8')),
    } as any;

    const extract = {
      extractBytes: jest.fn().mockResolvedValue({
        kind: 'html',
        mimeType: 'text/html',
        filename: 'doc.html',
        text: '<p>Hello <b>World</b></p><p>Second</p>',
        json: null,
        warnings: [],
        stats: { bytes: 10, chars: 2, extractMs: 1, ocr: false },
      }),
    } as any;

    const artifacts = {
      createJson: jest.fn().mockResolvedValue({ id: 'a1' }),
    } as any;

    const svc = new DocReaderService(assets, extract, artifacts);
    const res = await svc.read({ assetId: 'id1', runId: 'r1' });

    expect(res.entries).toHaveLength(1);
    expect(res.entries[0].kind).toBe('html');
    expect(res.entries[0].content.text).toContain('Hello World');
    expect(res.artifactId).toBe('a1');

    expect(artifacts.createJson).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'r1',
        toolName: 'doc_read',
      }),
    );
  });

  it('reads zip entries, enforces file count/size limits, and keeps going on errors', async () => {
    // treat as zip
    fileTypeFromBuffer.mockResolvedValue({ mime: 'application/zip' });

    const assets = {
      getById: jest.fn().mockResolvedValue({ originalFilename: 'bundle.zip' }),
      readBytes: jest.fn().mockResolvedValue(Buffer.from([1, 2, 3])),
    } as any;

    const extract = {
      extractBytes: jest.fn().mockImplementation(async (_b: Buffer, name: string) => {
        if (name.endsWith('.json')) {
          return {
            kind: 'json',
            mimeType: 'application/json',
            filename: name,
            text: '{"a":1}',
            json: { a: 1 },
            warnings: [],
            stats: { bytes: 1, chars: 1, extractMs: 1, ocr: false },
          };
        }
        return {
          kind: 'text',
          mimeType: 'text/plain',
          filename: name,
          text: 'hi',
          json: null,
          warnings: [],
          stats: { bytes: 1, chars: 2, extractMs: 1, ocr: false },
        };
      }),
    } as any;

    const artifacts = { createJson: jest.fn() } as any;

    unzipper.Open.buffer.mockResolvedValue({
      files: [
        { type: 'Directory', path: 'dir/' },
        {
          type: 'File',
          path: 'a.json',
          uncompressedSize: 10,
          buffer: jest.fn().mockResolvedValue(Buffer.from('{"a":1}', 'utf8')),
        },
        {
          type: 'File',
          path: 'too-big.bin',
          uncompressedSize: 6 * 1024 * 1024,
          buffer: jest.fn(),
        },
        {
          type: 'File',
          path: 'broken.txt',
          uncompressedSize: 10,
          buffer: jest.fn().mockRejectedValue(new Error('boom')),
        },
      ],
    });

    const svc = new DocReaderService(assets, extract, artifacts);
    const res = await svc.read({ assetId: 'id1' });

    expect(res.entries.length).toBe(3); // directory skipped
    expect(res.entries[0].name).toBe('a.json');
    expect(res.entries[0].content.json).toEqual({ a: 1 });

    const big = res.entries.find((e) => e.name === 'too-big.bin')!;
    expect(big.warnings.join(' ')).toContain('too large');
    expect(big.kind).toBe('binary');

    const broken = res.entries.find((e) => e.name === 'broken.txt')!;
    expect(broken.kind).toBe('unknown');
    expect(broken.warnings.join(' ')).toContain('boom');
  });
});
