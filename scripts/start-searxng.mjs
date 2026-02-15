import { spawnSync } from 'node:child_process';

/**
 * Start local SearXNG via docker compose if SEARXNG_BASE_URL is set.
 *
 * Why:
 * - keeps "one click" DX (no manual SearXNG install)
 * - backend can still fall back to DuckDuckGo if SEARXNG_BASE_URL is unset
 */

const baseUrl = (process.env.SEARXNG_BASE_URL ?? '').trim();

// Only auto-start when user opted in by setting SEARXNG_BASE_URL.
if (!baseUrl) {
  console.warn('Searxing base URL not found. Searxing init is skipped');
  process.exit(0);
}

// Best-effort: do not fail the whole app start if docker isn't available.
const args = ['compose', '-f', 'docker-compose.searxng.yml', 'up', '-d'];
const out = spawnSync('docker', args, { stdio: 'inherit' });

if (out.error) {
  console.warn(
    `\n[tools] SEARXNG_BASE_URL is set (${baseUrl}) but Docker could not be executed.\n` +
      `[tools] Install Docker (or start SearXNG manually) OR unset SEARXNG_BASE_URL to use DuckDuckGo fallback.\n`,
  );
  process.exit(0);
}

if (out.status !== 0) {
  console.warn(
    `\n[tools] Failed to start SearXNG via docker compose (exit ${out.status}).\n` +
      `[tools] You can still run without it by unsetting SEARXNG_BASE_URL (DuckDuckGo fallback).\n`,
  );
  process.exit(0);
}
