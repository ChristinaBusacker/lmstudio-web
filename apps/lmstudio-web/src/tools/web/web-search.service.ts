import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RunArtifactsService } from '../run-artifacts.service';

import type { JsonObject } from '@shared/types/json';
import { getArray, isRecord, toJsonObject } from '../../utils/typed-access';

export interface WebSearchResultItem {
  title: string;
  url: string;
  snippet: string | null;
  publishedAt: string | null;
  engine: string | null;
}

@Injectable()
export class WebSearchService {
  constructor(
    private readonly config: ConfigService,
    private readonly artifacts: RunArtifactsService,
  ) {}

  /**
   * Web search provider selection:
   * - If SEARXNG_BASE_URL is set: uses SearXNG JSON endpoint (and forces Google engine).
   * - Otherwise: falls back to DuckDuckGo Instant Answer API (limited results).
   *
   * Configure via env:
   * - SEARXNG_BASE_URL (example: http://localhost:8080)
   */
  async search(params: { q: string; limit: number; runId?: string }): Promise<{
    query: string;
    results: WebSearchResultItem[];
    artifactId: string | null;
  }> {
    const limit = Math.max(1, Math.min(50, params.limit));
    const base = (this.config.get<string>('SEARXNG_BASE_URL') ?? '').replace(/\/$/, '');

    const { results, provider, providerMeta } = base
      ? await this.searchViaSearxng({ base, q: params.q, limit })
      : await this.searchViaDuckDuckGo({ q: params.q, limit });

    let artifactId: string | null = null;
    if (params.runId) {
      const a = await this.artifacts.createJson({
        runId: params.runId,
        toolName: 'web_search',
        filename: 'web_search.json',
        json: {
          query: params.q,
          fetchedAt: new Date().toISOString(),
          provider,
          providerMeta,
          results,
        },
      });
      artifactId = a.id;
    }

    return { query: params.q, results, artifactId };
  }

  private async searchViaSearxng(params: {
    base: string;
    q: string;
    limit: number;
  }): Promise<{ results: WebSearchResultItem[]; provider: string; providerMeta: JsonObject }> {
    const url = new URL(params.base + '/search');
    url.searchParams.set('q', params.q);
    url.searchParams.set('format', 'json');
    url.searchParams.set('language', 'all');
    url.searchParams.set('safesearch', '0');

    // Requirement: SearXNG should use Google.
    // This also works even if other engines are enabled server-side.
    url.searchParams.set('engines', 'google');

    let res: Response;
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': 'lmstudio-web/1.0 (+tool web_search searxng)' },
      });
    } catch (e: unknown) {
      throw new ServiceUnavailableException({
        code: 'SEARXNG_UNREACHABLE',
        message: 'SearXNG is configured but not reachable.',
        baseUrl: params.base,
        detail: e instanceof Error ? e.message : String(e),
      });
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new ServiceUnavailableException({
        code: 'SEARXNG_ERROR',
        message: `SearXNG responded with ${res.status} ${res.statusText}.`,
        baseUrl: params.base,
        detail: body,
      });
    }

    const jsonUnknown: unknown = await res.json();
    const rawResults = getArray(jsonUnknown, 'results') ?? [];

    const results: WebSearchResultItem[] = rawResults.slice(0, params.limit).map((r) => {
      const rec = isRecord(r) ? r : {};
      const publishedRaw =
        rec['publishedDate'] ??
        rec['published_date'] ??
        rec['published'] ??
        rec['pubDate'] ??
        rec['pub_date'] ??
        null;
      const publishedAt = publishedRaw ? new Date(String(publishedRaw)).toISOString() : null;

      const title = String(rec['title'] ?? '').trim() || String(rec['url'] ?? '');
      const urlStr = String(rec['url'] ?? '');
      const snippetRaw = rec['content'] ?? rec['snippet'] ?? null;
      const engine = rec['engine'] ? String(rec['engine']) : 'google';

      return {
        title,
        url: urlStr,
        snippet: snippetRaw ? String(snippetRaw) : null,
        publishedAt: Number.isNaN(Date.parse(publishedAt ?? '')) ? null : publishedAt,
        engine,
      };
    });

    return {
      results,
      provider: 'searxng',
      providerMeta: toJsonObject({ baseUrl: params.base, engines: ['google'] }),
    };
  }

  private async searchViaDuckDuckGo(params: {
    q: string;
    limit: number;
  }): Promise<{ results: WebSearchResultItem[]; provider: string; providerMeta: JsonObject }> {
    // DuckDuckGo Instant Answer API (limited). No auth, JSON, stable-ish.
    const url = new URL('https://api.duckduckgo.com/');
    url.searchParams.set('q', params.q);
    url.searchParams.set('format', 'json');
    url.searchParams.set('no_redirect', '1');
    url.searchParams.set('no_html', '1');
    url.searchParams.set('t', 'lmstudio-web');

    const res = await fetch(url, {
      headers: { 'User-Agent': 'lmstudio-web/1.0 (+tool web_search ddg)' },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`DuckDuckGo request failed: ${res.status} ${res.statusText} ${body}`);
    }

    const jsonUnknown: unknown = await res.json();

    // RelatedTopics can contain nested "Topics" arrays.
    const flatten: Array<Record<string, unknown>> = [];
    const walk = (items: unknown[]) => {
      for (const it of items) {
        if (!isRecord(it)) continue;
        const topics = it['Topics'];
        if (Array.isArray(topics)) {
          walk(topics);
        } else {
          flatten.push(it);
        }
      }
    };
    const related = getArray(jsonUnknown, 'RelatedTopics') ?? [];
    walk(related);

    const results: WebSearchResultItem[] = flatten
      .filter((x) => x['FirstURL'] && x['Text'])
      .slice(0, params.limit)
      .map((x) => {
        const text = String(x['Text'] ?? '').trim();
        const title = text.split(' - ')[0] || text;
        return {
          title,
          url: String(x['FirstURL']),
          snippet: text || null,
          publishedAt: null,
          engine: 'duckduckgo',
        };
      });

    // As a fallback, surface the abstract if there are no related topics.
    if (!results.length) {
      const abstractText = isRecord(jsonUnknown)
        ? String(jsonUnknown['AbstractText'] ?? '').trim()
        : '';
      const abstractUrl = isRecord(jsonUnknown)
        ? String(jsonUnknown['AbstractURL'] ?? '').trim()
        : '';
      if (abstractText && abstractUrl) {
        results.push({
          title: isRecord(jsonUnknown) ? String(jsonUnknown['Heading'] ?? params.q) : params.q,
          url: abstractUrl,
          snippet: abstractText,
          publishedAt: null,
          engine: 'duckduckgo',
        });
      }
    }

    return {
      results,
      provider: 'duckduckgo',
      providerMeta: toJsonObject({ api: 'instant_answer' }),
    };
  }
}
