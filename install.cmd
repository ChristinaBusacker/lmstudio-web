@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo.
echo === LMStudio WebUI – Install (Local) ===
echo.

REM --- Checks ---
where node >nul 2>nul || (
  echo [ERROR] Node.js nicht gefunden.
  pause
  exit /b 1
)

where npm >nul 2>nul || (
  echo [ERROR] npm nicht gefunden.
  pause
  exit /b 1
)

where caddy >nul 2>nul || (
  echo [ERROR] Caddy nicht gefunden.
  echo Installieren mit:
  echo   winget install CaddyServer.Caddy
  echo oder:
  echo   choco install caddy
  echo.
  pause
  exit /b 1
)

REM --- Build ---
echo Installing dependencies...
npm install
if errorlevel 1 (
  echo [ERROR] npm install fehlgeschlagen.
  pause
  exit /b 1
)

echo Building project...
npm run build
if errorlevel 1 (
  echo [ERROR] Build fehlgeschlagen.
  pause
  exit /b 1
)

REM --- Ensure dist exists ---
if not exist dist (
  echo [ERROR] dist/ fehlt nach Build.
  pause
  exit /b 1
)

REM --- Generate Caddy local CA by running a minimal TLS config ---
echo.
echo === Optional: HTTPS-Zertifikat vertrauen (Windows) ===

set "CADDY_CA=%APPDATA%\Caddy\pki\authorities\local\root.crt"

if exist "!CADDY_CA!" (
  echo CA existiert bereits:
  echo   !CADDY_CA!
) else (
  echo CA existiert noch nicht. Erzeuge CA durch kurzen Caddy-Start...

  REM Minimaler Caddyfile (TLS internal) in dist schreiben
  > dist\_caddy_bootstrap.caddyfile (
    echo localhost:9443 {
    echo   tls internal
    echo   respond "ok"
    echo }
  )

  REM Caddy kurz starten und danach beenden
  start "caddy-bootstrap" /MIN cmd /c "caddy run --config dist\_caddy_bootstrap.caddyfile"
  timeout /t 2 /nobreak >nul
  taskkill /IM caddy.exe /F >nul 2>nul

  del dist\_caddy_bootstrap.caddyfile >nul 2>nul
)

if exist "!CADDY_CA!" (
  echo Importiere Caddy Root CA in den Windows-Truststore...
  certutil -addstore -f "ROOT" "!CADDY_CA!" >nul 2>nul

  if errorlevel 1 (
    echo [WARN] Konnte Zertifikat nicht importieren.
    echo        Starte install.cmd ggf. einmal als Administrator.
  ) else (
    echo ✅ Zertifikat wurde importiert. HTTPS sollte ohne Warnung funktionieren.
  )
) else (
  echo [WARN] Caddy Root CA wurde nicht gefunden:
  echo   !CADDY_CA!
  echo Starte install.cmd ggf. einmal als Administrator.
)

echo.
echo ✅ Install fertig. Du kannst jetzt start.cmd ausfuehren.
echo.
pause
