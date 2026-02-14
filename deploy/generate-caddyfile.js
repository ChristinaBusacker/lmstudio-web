const os = require('os');
const fs = require('fs');
const path = require('path');

function pickLanIPv4() {
  const nets = os.networkInterfaces();

  // Prefer common private ranges in a sensible order
  const preferredPrefixes = ['192.168.', '10.', '172.16.', '172.17.', '172.18.', '172.19.', '172.2', '172.3'];

  const candidates = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family !== 'IPv4') continue;
      if (net.internal) continue;
      const ip = net.address;
      if (!ip || ip.startsWith('169.254.')) continue; // APIPA
      candidates.push(ip);
    }
  }

  if (candidates.length === 0) return null;

  // Prefer typical LAN IPs
  for (const pref of preferredPrefixes) {
    const hit = candidates.find(ip => ip.startsWith(pref));
    if (hit) return hit;
  }

  // Otherwise just take the first one
  return candidates[0];
}

const lanIp = pickLanIPv4();
if (!lanIp) {
  console.error('[generate-caddyfile] No LAN IPv4 address found.');
  process.exit(1);
}

const tplPath = path.join(process.cwd(), 'Caddyfile.template');
const outPath = path.join(process.cwd(), 'Caddyfile.local');

if (!fs.existsSync(tplPath)) {
  console.error(`[generate-caddyfile] Missing template: ${tplPath}`);
  process.exit(1);
}

const tpl = fs.readFileSync(tplPath, 'utf8');
const out = tpl.replaceAll('{LAN_IP}', lanIp);
fs.writeFileSync(outPath, out, 'utf8');

console.log(`[generate-caddyfile] Wrote ${outPath} with LAN_IP=${lanIp}`);
