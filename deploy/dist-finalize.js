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
fs.rmdirSync(path.join(dist, 'apps'), { recursive: true, force: true })

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

console.log('dist finalized');
