import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ExternalServiceStatus } from '@shared/contracts';
import { SseBusService } from '../sse/sse-bus.service';

type ServiceKey = 'lmstudio' | 'searxng';

@Injectable()
export class ExternalServicesMonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(ExternalServicesMonitorService.name);

  private timer: NodeJS.Timeout | null = null;
  private lastSerialized: string | null = null;

  private state: Record<ServiceKey, ExternalServiceStatus> = {
    lmstudio: {
      name: 'lmstudio',
      enabled: true,
      ok: false,
      baseUrl: null,
      checkedAt: new Date(0).toISOString(),
      error: 'Not checked yet',
    },
    searxng: {
      name: 'searxng',
      enabled: false,
      ok: false,
      baseUrl: null,
      checkedAt: new Date(0).toISOString(),
      error: null,
    },
  };

  constructor(
    private readonly config: ConfigService,
    private readonly bus: SseBusService,
  ) {}

  onModuleInit(): void {
    // First check quickly, then keep polling.
    void this.checkAllAndPublishIfChanged();
    this.timer = setInterval(() => void this.checkAllAndPublishIfChanged(), 30_000);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  getSnapshot(): ExternalServiceStatus[] {
    return [this.state.lmstudio, this.state.searxng];
  }

  private async checkAllAndPublishIfChanged(): Promise<void> {
    const lmBase = (
      this.config.get<string>('LMSTUDIO_BASE_URL') ?? 'http://127.0.0.1:1234'
    ).replace(/\/$/, '');
    const searxBase = (this.config.get<string>('SEARXNG_BASE_URL') ?? '').replace(/\/$/, '');

    const nextLm = await this.checkLmStudio(lmBase);
    const nextSearx = await this.checkSearxng(searxBase);

    this.state = {
      lmstudio: nextLm,
      searxng: nextSearx,
    };

    const payload = { services: this.getSnapshot() };
    const serialized = JSON.stringify(payload);
    if (serialized === this.lastSerialized) return;
    this.lastSerialized = serialized;

    // Log only on transitions (helps debugging without noisy logs).
    this.log.log(
      `External status changed: lmstudio=${nextLm.ok ? 'ok' : 'down'}; searxng=${
        nextSearx.enabled ? (nextSearx.ok ? 'ok' : 'down') : 'disabled'
      }`,
    );

    this.bus.publish({ type: 'external.status', payload });
  }

  private async checkLmStudio(baseUrl: string): Promise<ExternalServiceStatus> {
    const checkedAt = new Date().toISOString();

    // Always "enabled": the whole app revolves around it.
    const enabled = true;

    try {
      // /v1/models is cheap and exists on OpenAI-compatible APIs.
      const url = new URL(baseUrl + '/v1/models');
      const res = await this.fetchWithTimeout(url.toString(), 2_000);
      if (!res.ok) {
        return {
          name: 'lmstudio',
          enabled,
          ok: false,
          baseUrl,
          checkedAt,
          error: `HTTP ${res.status} ${res.statusText}`,
        };
      }
      // Make sure it is actually JSON.
      await res.json().catch(() => {
        throw new Error('Invalid JSON response');
      });

      return { name: 'lmstudio', enabled, ok: true, baseUrl, checkedAt, error: null };
    } catch (e: any) {
      return {
        name: 'lmstudio',
        enabled,
        ok: false,
        baseUrl,
        checkedAt,
        error: String(e?.message ?? e),
      };
    }
  }

  private async checkSearxng(baseUrl: string): Promise<ExternalServiceStatus> {
    const checkedAt = new Date().toISOString();
    const enabled = !!baseUrl;

    if (!enabled) {
      return {
        name: 'searxng',
        enabled: false,
        ok: false,
        baseUrl: null,
        checkedAt,
        error: null,
      };
    }

    try {
      // Lightweight: ask for a tiny JSON response.
      const url = new URL(baseUrl + '/search');
      url.searchParams.set('q', 'healthcheck');
      url.searchParams.set('format', 'json');
      url.searchParams.set('language', 'all');
      url.searchParams.set('safesearch', '0');
      url.searchParams.set('engines', 'google');

      const res = await this.fetchWithTimeout(url.toString(), 2_500);
      if (!res.ok) {
        return {
          name: 'searxng',
          enabled,
          ok: false,
          baseUrl,
          checkedAt,
          error: `HTTP ${res.status} ${res.statusText}`,
        };
      }
      await res.json().catch(() => {
        throw new Error('Invalid JSON response');
      });

      return { name: 'searxng', enabled, ok: true, baseUrl, checkedAt, error: null };
    } catch (e: any) {
      return {
        name: 'searxng',
        enabled,
        ok: false,
        baseUrl,
        checkedAt,
        error: String(e?.message ?? e),
      };
    }
  }

  private async fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'lmstudio-web/1.0 (+healthcheck)' },
      });
    } finally {
      clearTimeout(t);
    }
  }
}
