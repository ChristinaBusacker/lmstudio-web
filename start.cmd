@echo off
chcp 65001 >nul
setlocal

echo.
echo === LMStudio WebUI – HTTPS Local ===
echo.

where node >nul 2>nul || (
  echo [ERROR] Node.js nicht gefunden.
  pause
  exit /b 1
)

where caddy >nul 2>nul || (
  echo [ERROR] Caddy nicht gefunden.
  echo Installieren mit:
  echo   winget install CaddyServer.Caddy
  echo oder:
  echo   choco install caddy
  pause
  exit /b 1
)

if not exist dist\main.js (
  echo [ERROR] dist\main.js fehlt.
  echo Bitte zuerst install.cmd ausfuehren. ^(npm run build^)
  pause
  exit /b 1
)

if not exist Caddyfile.template (
  echo [ERROR] Caddyfile.template fehlt.
  pause
  exit /b 1
)

echo Generiere Caddyfile.local mit aktueller LAN-IP...
node deploy/generate-caddyfile.js
if errorlevel 1 (
  echo [ERROR] Konnte Caddyfile.local nicht generieren.
  pause
  exit /b 1
)

echo Starte Backend...
start "LMStudio Web Backend" /MIN node dist\main.js

echo Starte Caddy ^(HTTPS^)...
echo.

set "CADDY_CA=%APPDATA%\Caddy\pki\authorities\local\root.crt"
if exist "%CADDY_CA%" (
  certutil -addstore -f "ROOT" "%CADDY_CA%" >nul 2>nul
)

caddy run --config Caddyfile.local

pause
