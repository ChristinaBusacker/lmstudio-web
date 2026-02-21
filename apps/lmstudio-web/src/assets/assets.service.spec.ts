import { AssetsService } from './assets.service';

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    promises: {
      mkdir: jest.fn(async () => undefined),
      writeFile: jest.fn(async () => undefined),
      readFile: jest.fn(async () => Buffer.from('file-bytes')),
    },
  };
});

describe('AssetsService', () => {
  const repo = {
    findOne: jest.fn(),
    create: jest.fn((x) => x),
    save: jest.fn(async (x) => ({ ...x, id: x.id ?? 'a1' })),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deduplicates uploads by sha256', async () => {
    const svc = new AssetsService(repo);

    repo.findOne.mockResolvedValueOnce({ id: 'existing', sha256: 'x', path: '/tmp/x' });

    const res = await svc.saveUpload({
      originalname: 'a.txt',
      mimetype: 'text/plain',
      size: 3,
      buffer: Buffer.from('abc'),
    } as any);

    expect(res.id).toBe('existing');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('writes file to disk and stores path for new upload', async () => {
    const svc = new AssetsService(repo);

    repo.findOne.mockResolvedValueOnce(null);
    // first save returns entity with id
    repo.save
      .mockResolvedValueOnce({
        id: 'a1',
        originalFilename: 'a.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 10,
        sha256: 'hash',
        path: '',
      })
      // second save persists path
      .mockImplementationOnce(async (x) => x);

    const res = await svc.saveUpload({
      originalname: 'a.pdf',
      mimetype: 'application/pdf',
      size: 10,
      buffer: Buffer.from('bytes'),
    } as any);

    expect(res.id).toBe('a1');
    expect(res.path).toContain('data');
    expect(res.path).toContain('assets');
    expect(res.path).toContain('a1');
  });

  it('readBytes reads the stored disk path', async () => {
    const svc = new AssetsService(repo);
    repo.findOne.mockResolvedValueOnce({ id: 'a1', path: '/tmp/a1.bin' });
    const buf = await svc.readBytes('a1');
    expect(buf.toString('utf8')).toBe('file-bytes');
  });
});
