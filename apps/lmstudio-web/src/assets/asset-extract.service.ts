import { Injectable } from '@nestjs/common';
import { fileTypeFromBuffer } from 'file-type';
import mammoth from 'mammoth';
import { pdfBytesToText } from '@backend/src/utils/pdfBytesToText';
import { AssetsService } from './assets.service';

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

export type AssetExtractResult = {
  kind: AssetExtractKind;
  mimeType: string | null;
  filename: string;
  text: string | null;
  json: unknown | null;
  warning: string | null;
};

function bytesToUtf8(buf: Buffer): string {
  return buf.toString('utf8');
}

function looksLikeScannedPdf(text: string): boolean {
  // Heuristic: extracted PDF text is tiny or mostly whitespace.
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  return t.length < 40;
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
    const lower = (filename ?? '').toLowerCase();

    const ft = await fileTypeFromBuffer(bytes).catch(() => null);
    const mimeType = mimeTypeHint ?? ft?.mime ?? null;

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

      if (lower.endsWith('.json') || mimeType === 'application/json') {
        try {
          const parsed = JSON.parse(text);
          return {
            kind: 'json',
            mimeType: mimeType ?? 'application/json',
            filename,
            text,
            json: parsed,
            warning: null,
          };
        } catch (e: any) {
          return {
            kind: 'json',
            mimeType: mimeType ?? 'application/json',
            filename,
            text,
            json: null,
            warning: `Invalid JSON: ${String(e?.message ?? e)}`,
          };
        }
      }

      if (lower.endsWith('.js') || lower.endsWith('.ts')) {
        return {
          kind: 'code',
          mimeType: mimeType ?? 'text/plain',
          filename,
          text,
          json: null,
          warning: null,
        };
      }

      if (lower.endsWith('.html') || lower.endsWith('.htm') || mimeType === 'text/html') {
        return {
          kind: 'html',
          mimeType: mimeType ?? 'text/html',
          filename,
          text,
          json: null,
          warning: null,
        };
      }

      return {
        kind: 'text',
        mimeType: mimeType ?? 'text/plain',
        filename,
        text,
        json: null,
        warning: null,
      };
    }

    // PDF
    if (mimeType === 'application/pdf' || lower.endsWith('.pdf')) {
      const text = await pdfBytesToText(bytes);
      const warning = looksLikeScannedPdf(text)
        ? 'PDF text extraction returned very little content. This likely is a scanned PDF. OCR is not implemented yet.'
        : null;
      return { kind: 'pdf', mimeType: 'application/pdf', filename, text, json: null, warning };
    }

    // DOCX
    if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      lower.endsWith('.docx')
    ) {
      const r = await mammoth.extractRawText({ buffer: bytes });
      const text = (r.value ?? '').trim();
      const warning = r.messages?.length
        ? `DOCX extraction warnings: ${r.messages.map((m) => m.message).join(' | ')}`
        : null;
      return {
        kind: 'docx',
        mimeType:
          mimeType ?? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        filename,
        text,
        json: null,
        warning,
      };
    }

    // Images
    if (
      (mimeType?.startsWith('image/') ?? false) ||
      lower.match(/\.(png|jpg|jpeg|webp|gif|bmp|tiff)$/)
    ) {
      // NOTE: "Interpreting" images properly requires OCR or a vision model.
      // For now, we expose metadata so the workflow can pass assetId to tools/models later.
      return {
        kind: 'image',
        mimeType: mimeType ?? ft?.mime ?? 'image/*',
        filename,
        text: null,
        json: null,
        warning:
          'Image interpretation (OCR/vision) is not implemented yet. Use the assetId with a vision-capable model/tool.',
      };
    }

    return {
      kind: 'binary',
      mimeType,
      filename,
      text: null,
      json: null,
      warning: 'Unsupported binary file type',
    };
  }
}
