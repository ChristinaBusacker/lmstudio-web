/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RunArtifactsService } from '../run-artifacts.service';

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
  }): Promise<{ results: WebSearchResultItem[]; provider: string; providerMeta: any }> {
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
    } catch (e: any) {
      throw new ServiceUnavailableException({
        code: 'SEARXNG_UNREACHABLE',
        message: 'SearXNG is configured but not reachable.',
        baseUrl: params.base,
        detail: String(e?.message ?? e),
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

    const json: any = await res.json();
    const rawResults: any[] = Array.isArray(json?.results) ? json.results : [];

    const results: WebSearchResultItem[] = rawResults.slice(0, params.limit).map((r) => {
      const publishedRaw =
        r.publishedDate ?? r.published_date ?? r.published ?? r.pubDate ?? r.pub_date ?? null;
      const publishedAt = publishedRaw ? new Date(publishedRaw).toISOString() : null;

      return {
        title: String(r.title ?? '').trim() || String(r.url ?? ''),
        url: String(r.url ?? ''),
        snippet: (r.content ?? r.snippet ?? null) ? String(r.content ?? r.snippet) : null,
        publishedAt: Number.isNaN(Date.parse(publishedAt ?? '')) ? null : publishedAt,
        engine: r.engine ? String(r.engine) : 'google',
      };
    });

    return {
      results,
      provider: 'searxng',
      providerMeta: { baseUrl: params.base, engines: ['google'] },
    };
  }

  private async searchViaDuckDuckGo(params: {
    q: string;
    limit: number;
  }): Promise<{ results: WebSearchResultItem[]; provider: string; providerMeta: any }> {
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

    const json: any = await res.json();

    // RelatedTopics can contain nested "Topics" arrays.
    const flatten: any[] = [];
    const walk = (items: any[]) => {
      for (const it of items) {
        if (!it) continue;
        if (Array.isArray(it.Topics)) {
          walk(it.Topics);
        } else {
          flatten.push(it);
        }
      }
    };
    walk(Array.isArray(json?.RelatedTopics) ? json.RelatedTopics : []);

    const results: WebSearchResultItem[] = flatten
      .filter((x) => x.FirstURL && x.Text)
      .slice(0, params.limit)
      .map((x) => {
        const text = String(x.Text ?? '').trim();
        const title = text.split(' - ')[0] || text;
        return {
          title,
          url: String(x.FirstURL),
          snippet: text || null,
          publishedAt: null,
          engine: 'duckduckgo',
        };
      });

    // As a fallback, surface the abstract if there are no related topics.
    if (!results.length) {
      const abstractText = String(json?.AbstractText ?? '').trim();
      const abstractUrl = String(json?.AbstractURL ?? '').trim();
      if (abstractText && abstractUrl) {
        results.push({
          title: String(json?.Heading ?? params.q),
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
      providerMeta: { api: 'instant_answer' },
    };
  }
}
