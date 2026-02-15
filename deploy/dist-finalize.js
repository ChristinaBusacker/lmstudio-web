
const os = require('os');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');

const nestMainSrc = path.join(dist, 'apps', 'lmstudio-web', 'main.js');
const nestMainDst = path.join(dist, 'main.js');

if (!fs.existsSync(nestMainSrc)) {
  throw new Error(`Nest main.js not found at ${nestMainSrc}`);
}

fs.copyFileSync(nestMainSrc, nestMainDst);
//fs.rmdirSync(path.join(dist, 'apps'), { recursive: true, force: true })

// optional: copy sourcemap if present
const mapSrc = nestMainSrc + '.map';
const mapDst = nestMainDst + '.map';
if (fs.existsSync(mapSrc)) fs.copyFileSync(mapSrc, mapDst);

// ensure dist/data exists
fs.mkdirSync(path.join(dist, 'data'), { recursive: true });

// copy env template (if exists)
const envSrc = path.join(root, '.env.prod');
const envDst = path.join(dist, '.env');
if (fs.existsSync(envSrc)) fs.copyFileSync(envSrc, envDst);

// copy searxng script (if exists)
const searxngScript = path.join(root, 'scripts', 'start-searxng.mjs');
const searxngDst = path.join(dist, 'start-searxng.mjs');
if (fs.existsSync(searxngScript)) fs.copyFileSync(searxngScript, searxngDst);

// Create convenience start scripts inside dist so running from repo root still uses dist/.env
// (Windows + POSIX). These scripts also start SearXNG if SEARXNG_BASE_URL is set.
const startCmd = `@echo off\r\ncd /d %~dp0\r\nnode start-searxng.mjs\r\nnode main.js\r\n`;
fs.writeFileSync(path.join(dist, 'start.cmd'), startCmd, 'utf8');

const startSh = `#!/usr/bin/env sh\ncd "$(dirname "$0")"\nnode start-searxng.mjs\nnode main.js\n`;
fs.writeFileSync(path.join(dist, 'start.sh'), startSh, 'utf8');
try { fs.chmodSync(path.join(dist, 'start.sh'), 0o755); } catch {}

const esbuild = require('esbuild');

const migrationsSrcDir = path.join(root, 'apps', 'lmstudio-web', 'src', 'migrations');
const migrationsDstDir = path.join(dist, 'migrations');

fs.mkdirSync(migrationsDstDir, { recursive: true });

if (fs.existsSync(migrationsSrcDir)) {
  const files = fs.readdirSync(migrationsSrcDir).filter(f => f.endsWith('.ts') || f.endsWith('.js'));

  for (const file of files) {
    const src = path.join(migrationsSrcDir, file);

    if (file.endsWith('.js')) {
      // if you ever have prebuilt js migrations, just copy them
      fs.copyFileSync(src, path.join(migrationsDstDir, file));
      continue;
    }

    // compile .ts -> .js (CJS, because Nest/TypeORM runtime is CommonJS here)
    const outFile = path.join(migrationsDstDir, file.replace(/\.ts$/, '.js'));

    esbuild.buildSync({
      entryPoints: [src],
      outfile: outFile,
      platform: 'node',
      format: 'cjs',
      target: 'node18', // or node20; node24 is fine too
      sourcemap: false,
      bundle: false, // keep it simple; it's a single migration file
    });
  }
}

console.log('dist finalized');
