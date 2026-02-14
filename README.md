# LM Studio Web UI

A **local-first, LAN-ready Web UI for LM Studio**.

This project provides a browser-based interface for **LM Studio**, designed to run entirely on your local machine while being **accessible from any device in your home network** — phone, tablet, laptop, or desktop.

It is **not a cloud service**, **not a hosted LLM**, and **not a replacement for LM Studio**.  
Instead, it builds *on top of LM Studio’s excellent local runtime* and exposes it through a carefully designed web interface.

> 💙 We deeply respect and appreciate the work of the LM Studio team.  
> This project exists because LM Studio is great — and we wanted to make it even more convenient to use around the house.

---

## What This Project Is (and Is Not)

### ✅ What it **is**
- A **local web interface** for LM Studio
- Runs fully on **your own machine**
- Accessible over the **local network**
- Works with **any browser**
- No cloud, no tracking, no accounts
- Deterministic, inspectable, reproducible execution

### ❌ What it is **not**
- Not a hosted LLM service
- Not a replacement for LM Studio
- Not intended for public internet exposure
- Not a general-purpose OpenAI-compatible server

---

## High-Level Architecture

```
Browser (any device)
        ↓
   Web UI (Angular)
        ↓
   Backend (NestJS)
        ↓
 LM Studio HTTP API
```

- **Frontend:** Angular SPA
- **Backend:** NestJS (Node.js)
- **Database:** SQLite (local file)
- **ORM:** TypeORM (automatic migrations)
- **LLM Runtime:** LM Studio (local HTTP server)

Routing:
- `/ui` → Web UI  
- `/api` → Backend API  
- `/api/docs` → Swagger UI  

The backend also serves the frontend in production, so the entire system runs as **one local application**.

---

## Features

- Clean browser-based UI for LM Studio
- Works on desktop, tablet, and phone
- Local SQLite database (no external dependencies)
- Automatic database migrations
- Deterministic message & workflow handling
- One-command startup (with optional HTTPS)
- LAN-ready by design

---

## Requirements

### Mandatory
- **Node.js** (recommended: Node.js 22 LTS, 20+ should work)
- **npm**
- **LM Studio**
  - Installed locally
  - HTTP server enabled  
  - Default URL: `http://127.0.0.1:1234`

### Optional (for HTTPS / LAN comfort)
- **Caddy** (used as a local HTTPS reverse proxy)

---

## Environment Configuration

Configuration is handled via environment variables.

A production template is provided as `.env.prod`.  
During build, this is copied to `dist/.env`.

### Example `.env`

```env
HOST=0.0.0.0
PORT=3000

DB_PATH=./data/app.sqlite

LMSTUDIO_BASE_URL=http://127.0.0.1:1234
LMSTUDIO_DEFAULT_MODEL=openai/gpt-oss-20b

NODE_ENV=production
```

---

## Two Ways to Run the Application

You can choose **one of two modes**, depending on your needs.

---

# Option 1: Simple Mode (No HTTPS)

**Best for:**  
- Local development  
- Quick testing  
- Single-device usage  

### Works on
- Windows
- macOS
- Linux

### Steps

```bash
npm install
npm run build
npm start
```

The app will be available at:

```
http://localhost:3000/ui
```

If `HOST=0.0.0.0`, it is also reachable from other devices:

```
http://<your-lan-ip>:3000/ui
```

No HTTPS, no certificates, no extra tools.

---

# Option 2: LAN Mode with HTTPS (Recommended)

**Best for:**  
- Using LM Studio from phones & tablets  
- Sharing access inside your home network  
- A “real app” feeling  

This mode uses **Caddy** to provide **local HTTPS**, including:
- Automatic LAN IP detection
- Automatic certificate generation
- Optional automatic trust (Windows)

---

## Windows (HTTPS + LAN)

### Requirements
- Node.js
- npm
- Caddy

### Install

```powershell
install.cmd
```

> On first run, Windows may ask for permission to trust a local certificate.
> This is required for HTTPS inside your LAN.

### Start

```powershell
start.cmd
```

### Result
- `https://localhost:8443/ui`
- `https://<your-lan-ip>:8443/ui`

---

## macOS / Linux (HTTPS + LAN)

### Requirements
- Node.js
- npm
- Caddy

Install Caddy:
- macOS: `brew install caddy`
- Linux: use your distro’s package manager or official repo

### Install

```bash
./install.sh
```

### Start

```bash
./start.sh
```

### Result
- `https://localhost:8443/ui`
- `https://<your-lan-ip>:8443/ui`

> ⚠️ Browsers will show a certificate warning on first access.  
> This is expected for local HTTPS.

---

## Build Output (`dist/`)

After `npm run build`:

```
dist/
  main.js
  .env
  data/
    app.sqlite
  ui/
    browser/
      index.html
      *.js
      *.css
```

The entire application can be started with:

```bash
node dist/main.js
```

---

## Database & Persistence

- SQLite database is created automatically
- Schema migrations run automatically on startup
- To reset local state during development:
  - Stop the app
  - Delete `data/app.sqlite`
  - Restart

---

## Philosophy

This project is intentionally:

- **Local-first**
- **Network-friendly**
- **Deterministic**
- **Transparent**
- **User-controlled**

It exists because **local LLMs matter**, and because LM Studio makes them accessible.  
This Web UI simply makes that power available **everywhere in your home**, without compromising control or privacy.

---

## License

UNLICENSED

