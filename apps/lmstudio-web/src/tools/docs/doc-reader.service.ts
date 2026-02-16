import { Injectable } from '@nestjs/common';
import { fileTypeFromBuffer } from 'file-type';
import unzipper from 'unzipper';
import { AssetsService } from '../../assets/assets.service';
import { AssetExtractService } from '../../assets/asset-extract.service';
import { RunArtifactsService } from '../run-artifacts.service';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import sanitizeHtml from 'sanitize-html';

type ParsedFile = {
  name: string;
  mimeType: string | null;
  text: string | null;
  error: string | null;
};

async function detectMime(buf: Buffer, fallbackName?: string): Promise<string | null> {
  const ft = await fileTypeFromBuffer(buf);
  if (ft?.mime) return ft.mime;
  const name = (fallbackName ?? '').toLowerCase();
  if (name.endsWith('.md')) return 'text/markdown';
  if (name.endsWith('.txt')) return 'text/plain';
  if (name.endsWith('.json')) return 'application/json';
  if (name.endsWith('.js')) return 'text/javascript';
  if (name.endsWith('.ts')) return 'text/plain';
  if (name.endsWith('.html') || name.endsWith('.htm')) return 'text/html';
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.docx'))
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (name.endsWith('.zip')) return 'application/zip';
  return null;
}

export function htmlToText(html: string, urlForDom = 'about:blank'): string {
  const dom: JSDOM = new JSDOM(html, { url: urlForDom });

  // jsdom document is a real DOM Document (from the jsdom lib DOM types)
  const doc: Document = dom.window.document;

  const parsed = new Readability(doc).parse();
  const contentHtml: string = parsed?.content ?? html;

  const cleanHtml: string = sanitizeHtml(contentHtml, {
    allowedTags: ['p', 'br', 'ul', 'ol', 'li', 'pre', 'code', 'blockquote', 'h1', 'h2', 'h3', 'h4'],
    allowedAttributes: {},
  });

  return cleanHtml
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/?p\s*>/gi, '\n')
    .replace(/<\s*\/?h\d\s*>/gi, '\n')
    .replace(/<\s*\/?li\s*>/gi, '\n- ')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

@Injectable()
export class DocReaderService {
  constructor(
    private readonly assets: AssetsService,
    private readonly extract: AssetExtractService,
    private readonly artifacts: RunArtifactsService,
  ) {}

  async read(params: { url?: string; assetId?: string; runId?: string }): Promise<{
    sourceUrl: string | null;
    sourceAssetId: string | null;
    files: ParsedFile[];
    artifactId: string | null;
  }> {
    if (!params.url && !params.assetId) {
      throw new Error('Either url or assetId must be provided');
    }

    let bytes: Buffer;
    let sourceUrl: string | null = null;
    let sourceAssetId: string | null = null;
    let filenameHint: string | null = null;

    const extractUuid = (s: string): string | null => {
      const m = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(s);
      return m?.[1] ?? null;
    };

    // Normalize inputs: if the model passes an internal /assets URL, prefer reading via assetId.
    // This avoids failing fetches against the backend API and keeps tool usage consistent.
    if (params.url) {
      const urlUuid = extractUuid(params.url);
      if (params.assetId && urlUuid && params.assetId === urlUuid) {
        params.url = undefined;
      } else if (
        urlUuid &&
        (params.url.includes('/assets/') || params.url.includes('/api/assets/'))
      ) {
        params.assetId = params.assetId ?? urlUuid;
        params.url = undefined;
      }
    }

    if (params.url) {
      sourceUrl = params.url;
      const res = await fetch(params.url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'lmstudio-web/1.0 (+tool doc_read)' },
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Fetch failed: ${res.status} ${res.statusText} ${body}`);
      }
      const arr = new Uint8Array(await res.arrayBuffer());
      bytes = Buffer.from(arr);
      const cd = res.headers.get('content-disposition') ?? '';
      const m = /filename\*=UTF-8''([^;]+)/i.exec(cd) || /filename="?([^";]+)"?/i.exec(cd);
      filenameHint = m?.[1] ? decodeURIComponent(m[1]) : null;
    } else {
      sourceAssetId = params.assetId ?? null;
      const asset = await this.assets.getById(params.assetId!);
      filenameHint = asset.originalFilename;
      bytes = await this.assets.readBytes(params.assetId!);
    }

    const mime = await detectMime(bytes, filenameHint ?? undefined);
    const isZip = mime === 'application/zip' || (filenameHint ?? '').toLowerCase().endsWith('.zip');

    const files: ParsedFile[] = isZip
      ? await this.readZip(bytes)
      : [await this.readSingle(bytes, filenameHint ?? 'document', sourceUrl ?? 'about:blank')];

    let artifactId: string | null = null;
    if (params.runId) {
      const a = await this.artifacts.createJson({
        runId: params.runId,
        toolName: 'doc_read',
        filename: 'doc_read.json',
        json: {
          sourceUrl,
          sourceAssetId,
          readAt: new Date().toISOString(),
          files,
        },
      });
      artifactId = a.id;
    }

    return { sourceUrl, sourceAssetId, files, artifactId };
  }

  private async readZip(zipBytes: Buffer): Promise<ParsedFile[]> {
    const out: ParsedFile[] = [];
    const directory = await unzipper.Open.buffer(zipBytes);

    // Safety limits
    const MAX_FILES = 50;
    const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB per entry

    for (const entry of directory.files.slice(0, MAX_FILES)) {
      if (entry.type !== 'File') continue;

      const name = entry.path;
      try {
        if (entry.uncompressedSize > MAX_FILE_BYTES) {
          out.push({
            name,
            mimeType: await detectMime(Buffer.alloc(0), name),
            text: null,
            error: `Skipped (file too large: ${entry.uncompressedSize} bytes)`,
          });
          continue;
        }

        const buf = await entry.buffer();
        out.push(await this.readSingle(buf, name, 'about:blank'));
      } catch (e: any) {
        out.push({
          name,
          mimeType: await detectMime(Buffer.alloc(0), name),
          text: null,
          error: String(e?.message ?? e),
        });
      }
    }

    return out;
  }

  private async readSingle(bytes: Buffer, name: string, urlForHtml: string): Promise<ParsedFile> {
    try {
      const mimeType = await detectMime(bytes, name);

      // Run extraction (handles txt/json/js/ts/pdf/docx/images)
      const extracted = await this.extract.extractBytes(bytes, name, mimeType);

      if (extracted.kind === 'html' && extracted.text) {
        const text = htmlToText(extracted.text, urlForHtml);
        return { name, mimeType: extracted.mimeType ?? 'text/html', text, error: extracted.warning };
      }

      if (extracted.text) {
        return { name, mimeType: extracted.mimeType, text: extracted.text, error: extracted.warning };
      }

      return { name, mimeType: extracted.mimeType, text: null, error: extracted.warning ?? 'Unsupported file type' };
    } catch (e: any) {
      const mimeType = await detectMime(bytes, name);
      return { name, mimeType, text: null, error: String(e?.message ?? e) };
    }
  }
}
