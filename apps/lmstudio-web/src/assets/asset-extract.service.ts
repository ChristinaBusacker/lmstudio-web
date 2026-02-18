import { Injectable } from '@nestjs/common';
import { fileTypeFromBuffer } from 'file-type';
import mammoth from 'mammoth';
import { pdfBytesToText } from '@backend/src/utils/pdfBytesToText';
import { AssetsService } from './assets.service';
import { TesseractModule } from '@frontend/src/app/core/types/tesseract.types';
import { JsonObject } from '../workflows/engine/typed-access';

export type AssetExtractKind =
  | 'text'
  | 'json'
  | 'code'
  | 'html'
  | 'pdf'
  | 'docx'
  | 'image'
  | 'binary'
  | 'unknown';

export type AssetExtractStats = {
  bytes: number;
  chars: number;
  extractMs: number;
  ocr: boolean;
};

export type AssetExtractResult = {
  kind: AssetExtractKind;
  mimeType: string | null;
  filename: string;
  text: string | null;
  json: unknown | null;
  warnings: string[];
  stats: AssetExtractStats;
};

function bytesToUtf8(buf: Buffer): string {
  return buf.toString('utf8');
}

function looksLikeScannedPdf(text: string): boolean {
  // Heuristic: extracted PDF text is tiny or mostly whitespace.
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  return t.length < 40;
}

function normalizeTesseractModule(mod: unknown): TesseractModule {
  // dynamic import in TS/webpack/vite kann { default: ... } oder direkt das Export-Objekt liefern
  if (mod && typeof mod === 'object') {
    const m = mod as Record<string, unknown>;
    const candidate = (m['default'] ?? m) as unknown;
    return candidate as TesseractModule;
  }
  return mod as TesseractModule;
}

export async function importTesseract(): Promise<TesseractModule> {
  const modUnknown: unknown = await import('tesseract.js');
  return normalizeTesseractModule(modUnknown);
}

async function tryOcrImage(bytes: Buffer): Promise<{ text: string; warnings: string[] } | null> {
  if (process.env.LMSTUDIO_WEB_ENABLE_OCR !== 'true') return null;

  try {
    // Cause: Typescript isnt able to understand that this is typed now

    const Tesseract = await importTesseract(); // <- typed

    const lang = (process.env.LMSTUDIO_WEB_OCR_LANG ?? 'eng').trim() || 'eng';
    // Cause: see cause on top. Its a follow error

    const res = await Tesseract.recognize(bytes, lang);

    const text = String(res?.data?.text ?? '').trim();

    if (!text) return { text: '', warnings: ['OCR produced empty text'] };
    return { text, warnings: [] };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { text: '', warnings: [`OCR failed: ${msg}`] };
  }
}

@Injectable()
export class AssetExtractService {
  constructor(private readonly assets: AssetsService) {}

  async extractByAssetId(assetId: string): Promise<AssetExtractResult> {
    const asset = await this.assets.getById(assetId);
    const bytes = await this.assets.readBytes(assetId);
    return this.extractBytes(bytes, asset.originalFilename, asset.mimeType);
  }

  async extractBytes(
    bytes: Buffer,
    filename: string,
    mimeTypeHint: string | null = null,
  ): Promise<AssetExtractResult> {
    const started = Date.now();
    const lower = (filename ?? '').toLowerCase();

    const ft = await fileTypeFromBuffer(bytes).catch(() => null);
    const mimeType = mimeTypeHint ?? ft?.mime ?? null;
    const baseStats: AssetExtractStats = {
      bytes: bytes.length,
      chars: 0,
      extractMs: 0,
      ocr: false,
    };

    // Plain text + code
    const isTextLike =
      (mimeType?.startsWith('text/') ?? false) ||
      lower.endsWith('.md') ||
      lower.endsWith('.txt') ||
      lower.endsWith('.log') ||
      lower.endsWith('.csv') ||
      lower.endsWith('.yml') ||
      lower.endsWith('.yaml') ||
      lower.endsWith('.json') ||
      lower.endsWith('.js') ||
      lower.endsWith('.ts');

    if (isTextLike) {
      const text = bytesToUtf8(bytes);
      baseStats.chars = text.length;

      if (lower.endsWith('.json') || mimeType === 'application/json') {
        try {
          const parsed = JSON.parse(text) as JsonObject;
          baseStats.extractMs = Date.now() - started;
          return {
            kind: 'json',
            mimeType: mimeType ?? 'application/json',
            filename,
            text,
            json: parsed,
            warnings: [],
            stats: baseStats,
          };
        } catch (e: any) {
          baseStats.extractMs = Date.now() - started;
          return {
            kind: 'json',
            mimeType: mimeType ?? 'application/json',
            filename,
            text,
            json: null,
            warnings: [`Invalid JSON: ${String(e?.message ?? e)}`],
            stats: baseStats,
          };
        }
      }

      if (lower.endsWith('.js') || lower.endsWith('.ts')) {
        baseStats.extractMs = Date.now() - started;
        return {
          kind: 'code',
          mimeType: mimeType ?? 'text/plain',
          filename,
          text,
          json: null,
          warnings: [],
          stats: baseStats,
        };
      }

      if (lower.endsWith('.html') || lower.endsWith('.htm') || mimeType === 'text/html') {
        baseStats.extractMs = Date.now() - started;
        return {
          kind: 'html',
          mimeType: mimeType ?? 'text/html',
          filename,
          text,
          json: null,
          warnings: [],
          stats: baseStats,
        };
      }

      baseStats.extractMs = Date.now() - started;
      return {
        kind: 'text',
        mimeType: mimeType ?? 'text/plain',
        filename,
        text,
        json: null,
        warnings: [],
        stats: baseStats,
      };
    }

    // PDF
    if (mimeType === 'application/pdf' || lower.endsWith('.pdf')) {
      const text = await pdfBytesToText(bytes);
      baseStats.chars = (text ?? '').length;
      baseStats.extractMs = Date.now() - started;
      const warnings: string[] = [];
      if (looksLikeScannedPdf(text)) {
        warnings.push(
          'PDF text extraction returned very little content. This likely is a scanned PDF. OCR is not enabled/implemented for PDFs.',
        );
      }
      return {
        kind: 'pdf',
        mimeType: 'application/pdf',
        filename,
        text,
        json: null,
        warnings,
        stats: baseStats,
      };
    }

    // DOCX
    if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      lower.endsWith('.docx')
    ) {
      const r = await mammoth.extractRawText({ buffer: bytes });
      const text = (r.value ?? '').trim();
      baseStats.chars = text.length;
      baseStats.extractMs = Date.now() - started;
      const warnings = r.messages?.length
        ? [`DOCX extraction warnings: ${r.messages.map((m) => m.message).join(' | ')}`]
        : [];
      return {
        kind: 'docx',
        mimeType:
          mimeType ?? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        filename,
        text,
        json: null,
        warnings,
        stats: baseStats,
      };
    }

    // Images
    if (
      (mimeType?.startsWith('image/') ?? false) ||
      lower.match(/\.(png|jpg|jpeg|webp|gif|bmp|tiff)$/)
    ) {
      const warnings: string[] = [];
      let text: string | null = null;

      const ocr = await tryOcrImage(bytes);
      if (ocr) {
        baseStats.ocr = true;
        text = ocr.text || null;
        warnings.push(...ocr.warnings);
      } else {
        warnings.push(
          'Image OCR is disabled. Set LMSTUDIO_WEB_ENABLE_OCR=true to enable built-in OCR for images, or use a vision-capable model/tool.',
        );
      }

      baseStats.chars = (text ?? '').length;
      baseStats.extractMs = Date.now() - started;
      return {
        kind: 'image',
        mimeType: mimeType ?? ft?.mime ?? 'image/*',
        filename,
        text,
        json: null,
        warnings,
        stats: baseStats,
      };
    }

    baseStats.extractMs = Date.now() - started;
    return {
      kind: 'binary',
      mimeType,
      filename,
      text: null,
      json: null,
      warnings: ['Unsupported binary file type'],
      stats: baseStats,
    };
  }
}
