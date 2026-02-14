/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable } from '@nestjs/common';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import sanitizeHtml from 'sanitize-html';
import { RunArtifactsService } from '../run-artifacts.service';

function pickMeta(doc: Document, name: string): string | null {
  const el = doc.querySelector(`meta[name="${name}"]`) as HTMLMetaElement;
  const v = el?.content?.trim();
  return v || null;
}

function pickMetaProp(doc: Document, prop: string): string | null {
  const el = doc.querySelector(`meta[property="${prop}"]`) as HTMLMetaElement;
  const v = el?.content?.trim();
  return v || null;
}

function normalizeIsoDate(s: string | null): string | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

@Injectable()
export class WebReaderService {
  constructor(private readonly artifacts: RunArtifactsService) {}

  async read(params: { url: string; runId?: string }): Promise<{
    url: string;
    meta: {
      title: string | null;
      author: string | null;
      publishedAt: string | null;
      siteName: string | null;
      lang: string | null;
    };
    text: string;
    artifactId: string | null;
  }> {
    const res = await fetch(params.url, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'lmstudio-web/1.0 (+tool web_read)',
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Fetch failed: ${res.status} ${res.statusText} ${body}`);
    }

    const html = await res.text();
    const dom = new JSDOM(html, { url: params.url });
    const doc = dom.window.document;

    const reader = new Readability(doc);
    const parsed = reader.parse();

    const title =
      parsed?.title?.trim() ||
      pickMetaProp(doc, 'og:title') ||
      doc.querySelector('title')?.textContent?.trim() ||
      null;

    const author =
      (parsed?.byline?.trim() || null) ??
      pickMeta(doc, 'author') ??
      pickMetaProp(doc, 'article:author');

    const publishedAt = normalizeIsoDate(
      pickMetaProp(doc, 'article:published_time') ??
        pickMeta(doc, 'date') ??
        pickMeta(doc, 'pubdate') ??
        (doc.querySelector('time[datetime]') as HTMLTimeElement | null)?.dateTime ??
        null,
    );

    const siteName = pickMetaProp(doc, 'og:site_name') ?? null;
    const lang = doc.documentElement?.getAttribute('lang')?.trim() || null;

    // Readability gives us HTML content; sanitize and turn into plain-ish text.
    const contentHtml = parsed?.content ?? '';
    const cleanHtml = sanitizeHtml(contentHtml, {
      allowedTags: [
        'p',
        'br',
        'ul',
        'ol',
        'li',
        'pre',
        'code',
        'blockquote',
        'h1',
        'h2',
        'h3',
        'h4',
      ],
      allowedAttributes: {},
    });

    // Convert HTML to text (simple): keep newlines for block tags.
    const text = cleanHtml
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\s*\/?p\s*>/gi, '\n')
      .replace(/<\s*\/?h\d\s*>/gi, '\n')
      .replace(/<\s*\/?li\s*>/gi, '\n- ')
      .replace(/<[^>]+>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    let artifactId: string | null = null;
    if (params.runId) {
      const a = await this.artifacts.createJson({
        runId: params.runId,
        toolName: 'web_read',
        filename: 'web_read.json',
        json: {
          url: params.url,
          fetchedAt: new Date().toISOString(),
          meta: { title, author, publishedAt, siteName, lang },
          text,
        },
      });
      artifactId = a.id;
    }

    return {
      url: params.url,
      meta: { title, author, publishedAt, siteName, lang },
      text,
      artifactId,
    };
  }
}
