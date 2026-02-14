#!/usr/bin/env bash
set -euo pipefail

APP_PORT="${APP_PORT:-3000}"
HTTPS_PORT="${HTTPS_PORT:-8443}"
HTTP_PORT="${HTTP_PORT:-8080}"

echo
echo "=== LMStudio WebUI – HTTPS Local ==="
echo

# --- Checks ---
command -v node >/dev/null 2>&1 || { echo "[ERROR] node not found."; exit 1; }
command -v caddy >/dev/null 2>&1 || { echo "[ERROR] caddy not found."; exit 1; }

if [[ ! -f "dist/main.js" ]]; then
  echo "[ERROR] dist/main.js missing."
  echo "Please run ./install.sh first."
  exit 1
fi

if [[ ! -f "Caddyfile.template" ]]; then
  echo "[ERROR] Caddyfile.template missing."
  exit 1
fi

echo "Generating Caddyfile.local with current LAN IP..."
node deploy/generate-caddyfile.js

# --- Start backend (background) ---
echo "Starting backend..."
NODE_ENV=production HOST=0.0.0.0 PORT="$APP_PORT" node dist/main.js >/tmp/lmstudio-web-backend.log 2>&1 &
BACKEND_PID=$!

cleanup() {
  echo
  echo "Stopping backend (pid=$BACKEND_PID)..."
  kill "$BACKEND_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# --- Print URLs ---
LAN_IP="$(node -e "const os=require('os');const nets=os.networkInterfaces();let ips=[];for(const n of Object.keys(nets)){for(const net of nets[n]||[]){if(net.family==='IPv4'&&!net.internal&&!net.address.startsWith('169.254.')) ips.push(net.address)}};const pref=['192.168.','10.','172.'];let ip=ips.find(i=>pref.some(p=>i.startsWith(p)))||ips[0]||'';process.stdout.write(ip)")"

echo
echo "URLs:"
echo "  Local: https://localhost:${HTTPS_PORT}/ui"
if [[ -n "$LAN_IP" ]]; then
  echo "  LAN:   https://${LAN_IP}:${HTTPS_PORT}/ui"
fi
echo
echo "Note: The first time you open the HTTPS URL, your browser will likely show a certificate warning."
echo "      That's normal for 'tls internal' until the local CA is trusted."
echo

# --- Start Caddy (foreground) ---
echo "Starting Caddy (HTTPS)..."
echo "Stop with Ctrl+C"
echo
caddy run --config Caddyfile.local
