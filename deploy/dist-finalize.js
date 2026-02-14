
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

function getLanIPv4() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family !== 'IPv4') continue;
      if (net.internal) continue;
      const ip = net.address;
      if (ip.startsWith('169.254.')) continue; // APIPA
      // Prefer common private ranges, but accept any non-internal IPv4
      return ip;
    }
  }
  return null;
}

try {
  const lanIp = getLanIPv4() || '127.0.0.1';

  const tplPath = path.join(__dirname, 'Caddyfile.local.template');
  const outPath = path.join(process.cwd(), 'dist', 'Caddyfile.local');

  if (fs.existsSync(tplPath)) {
    const tpl = fs.readFileSync(tplPath, 'utf8');
    const out = tpl.replaceAll('{LAN_IP}', lanIp);
    fs.writeFileSync(outPath, out, 'utf8');
    console.log(`Caddyfile generated: ${outPath} (LAN_IP=${lanIp})`);
  } else {
    console.warn(`Caddy template not found: ${tplPath} (skipping)`);
  }
} catch (e) {
  console.warn('Failed to generate Caddyfile.local:', e);
}

console.log('dist finalized');
