jest.mock('tesseract.js', () => ({
  __esModule: true,
  recognize: jest.fn(async () => ({ data: { text: ' OCR TEXT ' } })),
  default: {
    recognize: jest.fn(async () => ({ data: { text: ' OCR TEXT ' } })),
  },
}));

import { AssetExtractService } from './asset-extract.service';

jest.mock('file-type', () => ({
  fileTypeFromBuffer: jest.fn(),
}));

jest.mock('mammoth', () => ({
  __esModule: true,
  default: {
    extractRawText: jest.fn(),
  },
}));

jest.mock('@backend/src/utils/pdfBytesToText', () => ({
  pdfBytesToText: jest.fn(),
}));

const { fileTypeFromBuffer } = jest.requireMock('file-type') as {
  fileTypeFromBuffer: jest.Mock;
};

const mammoth = (jest.requireMock('mammoth') as any).default as {
  extractRawText: jest.Mock;
};

const { pdfBytesToText } = jest.requireMock('@backend/src/utils/pdfBytesToText') as {
  pdfBytesToText: jest.Mock;
};

describe('AssetExtractService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.LMSTUDIO_WEB_ENABLE_OCR;
    delete process.env.LMSTUDIO_WEB_OCR_LANG;
  });

  it('extracts plain text and code based on extension/mime', async () => {
    fileTypeFromBuffer.mockResolvedValue(null);

    const assets = { getById: jest.fn(), readBytes: jest.fn() } as any;
    const svc = new AssetExtractService(assets);

    const r1 = await svc.extractBytes(Buffer.from('hello', 'utf8'), 'a.txt', 'text/plain');
    expect(r1.kind).toBe('text');
    expect(r1.text).toBe('hello');

    const r2 = await svc.extractBytes(Buffer.from('console.log(1)', 'utf8'), 'a.ts', null);
    expect(r2.kind).toBe('code');
    expect(r2.mimeType).toBe('text/plain');
  });

  it('parses JSON when valid and returns warnings when invalid', async () => {
    fileTypeFromBuffer.mockResolvedValue(null);
    const assets = { getById: jest.fn(), readBytes: jest.fn() } as any;
    const svc = new AssetExtractService(assets);

    const ok = await svc.extractBytes(Buffer.from('{"a":1}', 'utf8'), 'a.json', 'application/json');
    expect(ok.kind).toBe('json');
    expect(ok.json).toEqual({ a: 1 });
    expect(ok.warnings).toEqual([]);

    const bad = await svc.extractBytes(Buffer.from('{oops}', 'utf8'), 'a.json', 'application/json');
    expect(bad.kind).toBe('json');
    expect(bad.json).toBe(null);
    expect(bad.warnings.join(' ')).toContain('Invalid JSON');
  });

  it('extracts PDF text and warns when it looks like a scanned PDF', async () => {
    fileTypeFromBuffer.mockResolvedValue({ mime: 'application/pdf' });
    pdfBytesToText.mockResolvedValue('   ');

    const svc = new AssetExtractService({} as any);
    const r = await svc.extractBytes(Buffer.from('%PDF', 'utf8'), 'doc.pdf', null);
    expect(r.kind).toBe('pdf');
    expect(r.mimeType).toBe('application/pdf');
    expect(r.warnings.join(' ')).toContain('scanned PDF');
  });

  it('extracts DOCX via mammoth and surfaces mammoth warnings', async () => {
    fileTypeFromBuffer.mockResolvedValue({
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    mammoth.extractRawText.mockResolvedValue({
      value: ' Hello DOCX ',
      messages: [{ type: 'warning', message: 'x' }],
    });

    const svc = new AssetExtractService({} as any);
    const r = await svc.extractBytes(Buffer.from('docx', 'utf8'), 'a.docx', null);
    expect(r.kind).toBe('docx');
    expect(r.text).toBe('Hello DOCX');
    expect(r.warnings.join(' ')).toContain('DOCX extraction warnings');
  });

  it('handles images: warns when OCR disabled and runs OCR when enabled', async () => {
    fileTypeFromBuffer.mockResolvedValue({ mime: 'image/png' });

    const svc = new AssetExtractService({} as any);

    // disabled
    process.env.LMSTUDIO_WEB_ENABLE_OCR = 'false';
    const r1 = await svc.extractBytes(Buffer.from([1, 2, 3]), 'a.png', null);
    expect(r1.kind).toBe('image');
    expect(r1.stats.ocr).toBe(false);
    expect(r1.warnings.join(' ')).toContain('OCR is disabled');

    // enabled
    process.env.LMSTUDIO_WEB_ENABLE_OCR = 'true';
    process.env.LMSTUDIO_WEB_OCR_LANG = 'eng';

    const r2 = await svc.extractBytes(Buffer.from([9, 8, 7]), 'b.png', null);

    expect(r2.kind).toBe('image');
    expect(r2.stats.ocr).toBe(true);
    expect(r2.text).toBe('OCR TEXT');
    expect(r2.warnings).toEqual([]);

    const tess = require('tesseract.js');

    // depending on normalizeTesseractModule / default handling, recognize can live on default or top-level
    const top = tess?.recognize as jest.Mock | undefined;
    const def = tess?.default?.recognize as jest.Mock | undefined;

    expect((top?.mock?.calls?.length ?? 0) + (def?.mock?.calls?.length ?? 0)).toBeGreaterThan(0);
  });
});
