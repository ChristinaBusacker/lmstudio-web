/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable } from '@nestjs/common';
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
   * Uses SearXNG JSON endpoint.
   * Configure via env: SEARXNG_BASE_URL (example: http://localhost:8080)
   */
  async search(params: { q: string; limit: number; runId?: string }): Promise<{
    query: string;
    results: WebSearchResultItem[];
    artifactId: string | null;
  }> {
    const base = (this.config.get<string>('SEARXNG_BASE_URL') ?? '').replace(/\/$/, '');
    if (!base) {
      throw new Error(
        'SEARXNG_BASE_URL is not configured. Set it to your SearXNG instance base URL (e.g. http://localhost:8080).',
      );
    }

    const limit = Math.max(1, Math.min(50, params.limit));
    const url = new URL(base + '/search');
    url.searchParams.set('q', params.q);
    url.searchParams.set('format', 'json');
    url.searchParams.set('language', 'all');
    url.searchParams.set('safesearch', '0');

    const res = await fetch(url, {
      headers: { 'User-Agent': 'lmstudio-web/1.0 (+tool web_search)' },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`SearXNG request failed: ${res.status} ${res.statusText} ${body}`);
    }

    const json: any = await res.json();
    const rawResults: any[] = Array.isArray(json?.results) ? json.results : [];

    const results: WebSearchResultItem[] = rawResults.slice(0, limit).map((r) => {
      const publishedRaw =
        r.publishedDate ?? r.published_date ?? r.published ?? r.pubDate ?? r.pub_date ?? null;
      const publishedAt = publishedRaw ? new Date(publishedRaw).toISOString() : null;

      return {
        title: String(r.title ?? '').trim() || String(r.url ?? ''),
        url: String(r.url ?? ''),
        snippet: (r.content ?? r.snippet ?? null) ? String(r.content ?? r.snippet) : null,
        publishedAt: Number.isNaN(Date.parse(publishedAt ?? '')) ? null : publishedAt,
        engine: r.engine ? String(r.engine) : null,
      };
    });

    let artifactId: string | null = null;
    if (params.runId) {
      const a = await this.artifacts.createJson({
        runId: params.runId,
        toolName: 'web_search',
        filename: 'web_search.json',
        json: {
          query: params.q,
          fetchedAt: new Date().toISOString(),
          provider: 'searxng',
          baseUrl: base,
          results,
        },
      });
      artifactId = a.id;
    }

    return { query: params.q, results, artifactId };
  }
}
