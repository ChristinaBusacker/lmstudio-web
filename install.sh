#!/usr/bin/env bash
set -euo pipefail

echo
echo "=== LMStudio WebUI – Install (Local) ==="
echo

# --- Checks ---
command -v node >/dev/null 2>&1 || { echo "[ERROR] node not found. Please install Node.js (>= 22)."; exit 1; }
command -v npm  >/dev/null 2>&1 || { echo "[ERROR] npm not found."; exit 1; }
command -v caddy >/dev/null 2>&1 || {
  echo "[ERROR] caddy not found."
  echo "Install via:"
  echo "  macOS:  brew install caddy"
  echo "  Debian/Ubuntu: sudo apt install -y caddy   (or use official repo)"
  echo "  Fedora: sudo dnf install -y caddy"
  exit 1
}

# --- Build ---
echo "Installing dependencies..."
npm install

echo
echo "Building project..."
npm run build

if [[ ! -d "dist" ]]; then
  echo "[ERROR] dist/ missing after build."
  exit 1
fi

echo
echo "=== Optional: Trust local HTTPS CA ==="
echo
echo "Caddy uses an internal CA for tls internal."
echo "Browsers will warn until the CA is trusted."
echo
echo "You can start the app now with: ./start.sh"
echo
