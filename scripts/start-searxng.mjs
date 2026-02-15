import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Start local SearXNG via docker compose if SEARXNG_BASE_URL is set.
 *
 * Why:
 * - keeps "one click" DX (no manual SearXNG install)
 * - backend can still fall back to DuckDuckGo if SEARXNG_BASE_URL is unset
 *
 * Behavior:
 * - If SEARXNG_BASE_URL is not set -> do nothing
 * - If Docker is not available -> warn, do not fail app startup
 * - If container is already running -> do nothing
 * - Otherwise -> docker compose up -d
 */

// Best-effort .env loading.
// - In dev, env usually comes from the shell.
// - In dist builds, some setups copy .env into dist/.env.
//   People often run `node dist/...` from repo root or from dist/,
//   so we try loading a `.env` next to this script if SEARXNG_BASE_URL isn't already set.
function loadDotEnvIfNeeded() {
  if (process.env.SEARXNG_BASE_URL) return;

  const here = dirname(fileURLToPath(import.meta.url));
  const envPath = join(here, '.env');
  if (!existsSync(envPath)) return;

  const raw = readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;

    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();

    // Strip optional quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }

    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function resolveComposeCwd() {
  // Run compose from repo root if possible, but also support being executed from dist/.
  // If docker-compose.searxng.yml isn't found in CWD, try one level up (dist -> repo root).
  let cwd = process.cwd();
  if (
    !existsSync(join(cwd, 'docker-compose.searxng.yml')) &&
    existsSync(join(cwd, '..', 'docker-compose.searxng.yml'))
  ) {
    cwd = join(cwd, '..');
  }
  return cwd;
}

function isDockerAvailable(cwd) {
  const out = spawnSync('docker', ['--version'], { encoding: 'utf8', cwd });
  return !out.error && out.status === 0;
}

function isSearxngRunning(cwd) {
  // We rely on the container name from docker-compose.searxng.yml:
  // container_name: lmstudio-web-searxng
  const out = spawnSync(
    'docker',
    [
      'ps',
      '--filter',
      'name=lmstudio-web-searxng',
      '--filter',
      'status=running',
      '--format',
      '{{.ID}}',
    ],
    { encoding: 'utf8', cwd },
  );

  if (out.error || out.status !== 0) return false;
  return Boolean((out.stdout ?? '').trim());
}

function startSearxng(cwd) {
  const args = ['compose', '-f', 'docker-compose.searxng.yml', 'up', '-d'];
  return spawnSync('docker', args, { stdio: 'inherit', cwd });
}

// ---- main ----

loadDotEnvIfNeeded();

const baseUrl = (process.env.SEARXNG_BASE_URL ?? '').trim();

// Only auto-start when user opted in by setting SEARXNG_BASE_URL.
if (!baseUrl) {
  console.log('[tools] SEARXNG_BASE_URL not set. Skipping SearXNG startup (DuckDuckGo fallback).');
  process.exit(0);
}

const cwd = resolveComposeCwd();

if (!isDockerAvailable(cwd)) {
  console.warn(
    `\n[tools] SEARXNG_BASE_URL is set (${baseUrl}) but Docker is not available.\n` +
      `[tools] Install Docker (or start SearXNG manually) OR unset SEARXNG_BASE_URL to use DuckDuckGo fallback.\n`,
  );
  process.exit(0);
}

if (isSearxngRunning(cwd)) {
  console.log('[tools] SearXNG already running. Skipping docker compose up.');
  process.exit(0);
}

console.log('[tools] Starting SearXNG via docker compose...');
const out = startSearxng(cwd);

if (out.error) {
  console.warn(
    `\n[tools] Failed to execute Docker.\n` +
      `[tools] You can still run without SearXNG by unsetting SEARXNG_BASE_URL (DuckDuckGo fallback).\n`,
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

console.log('[tools] SearXNG started (or already healthy).');
process.exit(0);
