# LM Studio Web UI

A **local-first, LAN-ready Web UI for LM Studio**.

This project provides a browser-based interface for **LM Studio**, designed to run entirely on your local machine while being **accessible from any device in your home network** (phone, tablet, laptop, desktop).

It is **not a cloud service**, **not a hosted LLM**, and **not a replacement for LM Studio**.
It builds on top of LM Studio’s local runtime and exposes it through a structured, inspectable web interface.

> This project exists because LM Studio is excellent at running local models — and we wanted a robust, network-friendly UI on top of it.

---

## What This Project Is (and Is Not)

### What it **is**

- Local web interface for LM Studio
- Runs entirely on your own machine
- Accessible via local network (LAN)
- No accounts, no telemetry, no cloud
- Deterministic execution with inspectable state
- Explicit tool usage and clear boundaries

### What it **is not**

- Not a hosted LLM service
- Not a replacement for LM Studio
- Not intended for public internet exposure
- Not a general-purpose OpenAI-compatible server

---

## Architecture Overview

```
Browser (any device)
        ↓
   Angular Web UI
        ↓
   NestJS Backend
        ↓
 LM Studio HTTP API
```

- **Frontend:** Angular SPA
- **Backend:** NestJS
- **Database:** SQLite (local file)
- **ORM:** TypeORM (automatic migrations)
- **LLM Runtime:** LM Studio

Routes:

- `/ui` – Web UI
- `/api` – Backend API
- `/api/docs` – Swagger / OpenAPI

In production, the backend serves the frontend so the system runs as **a single local application**.

---

## Core Features

- Browser-based UI for LM Studio
- Works on desktop, tablet, and phone
- Local SQLite persistence
- Automatic DB migrations
- Deterministic chat and workflow execution
- Tool-based agent loop (no hidden magic)
- LAN-ready by design

---

## Tools (Agent Capabilities)

This project uses an explicit **tool orchestration system**.  
Tools are exposed to the model via structured schemas and executed by the backend.

### Available Tools

#### `web_search`

Search the web.

- Uses **SearXNG** if configured (recommended)
- Falls back to DuckDuckGo Instant Answers if not

#### `web_read`

Fetches and extracts readable text from a public web page.

- Uses Readability-style extraction
- Intended for articles and documentation
- Not a general crawler

#### `doc_read`

Reads uploaded documents and provides their textual contents to the model.

- Operates on uploaded **assets**
- Uses `assetId` as the canonical reference
- URLs are discouraged and sanitized if misused by the model

Supported file types are listed below.

#### (Planned) `vision_read`

Planned extension for **image-capable models**.
Will allow models with vision support to analyze uploaded images.

---

## File Upload & Document Support

### Supported Formats

The system is intentionally **text-first** and deterministic.

#### Fully Supported

- `.txt`
- `.md`
- `.json`
- `.yaml`, `.yml`
- `.csv`
- `.log`
- `.xml`

#### ZIP Archives

- `.zip`
- Extracted server-side
- Each contained text file is processed individually
- Binary files inside ZIPs are ignored

#### PDF (Limited)

- Text-based PDFs only
- No OCR
- Scanned PDFs will likely produce no content

#### Not Supported (stored but not readable)

- Images (`.png`, `.jpg`, …)
- Office documents (`.docx`, `.xlsx`, `.pptx`)
- Audio / video
- Arbitrary binaries

This strict boundary prevents the model from hallucinating file contents.

---

## Vision Models (Important Note)

LM Studio supports **vision-capable models** (VLMs).
However, **this Web UI currently treats images as binary assets only**.

Image understanding requires:

- A vision-capable model loaded in LM Studio
- A dedicated `vision_read` tool path

This is planned but not enabled by default to avoid undefined behavior.

---

## Requirements

### Mandatory

- **Node.js** (22 LTS recommended, 20+ should work)
- **npm**
- **LM Studio**
  - Installed locally
  - HTTP server enabled
  - Default URL: `http://127.0.0.1:1234`

### Optional

- **Docker** (for SearXNG web search)
- **Caddy** (for local HTTPS)

---

## Environment Configuration

Configuration is handled via environment variables.
A production template is provided as `.env.prod`.

Example:

```env
HOST=0.0.0.0
PORT=3000

DB_PATH=./data/app.sqlite

LMSTUDIO_BASE_URL=http://127.0.0.1:1234
LMSTUDIO_DEFAULT_MODEL=openai/gpt-oss-20b

# Optional web search provider
SEARXNG_BASE_URL=http://localhost:8080

NODE_ENV=production
```

---

## Web Search Setup (Optional)

### Recommended: Local SearXNG via Docker

1. Install Docker
2. Set `SEARXNG_BASE_URL`
3. Start the app

The startup scripts will automatically run:

```bash
docker compose -f docker-compose.searxng.yml up -d
```

If not configured, the system falls back to DuckDuckGo Instant Answers.

---

## Running the Application

### Development / Local Use

```bash
npm install
npm run build
npm start
```

Access:

```
http://localhost:3000/ui
```

LAN access:

```
http://<your-lan-ip>:3000/ui
```

---

## Build Output

After build:

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

Run with:

```bash
node dist/main.js
```

---

## Database & Persistence

- SQLite database created automatically
- Schema migrations run on startup
- Reset local state:
  - Stop the app
  - Delete `data/app.sqlite`
  - Restart

---

## Design Philosophy

This project is intentionally:

- Local-first
- Deterministic
- Transparent
- Tool-driven
- User-controlled

There is no hidden execution, no implicit web access, and no silent data flow.

---

## License

UNLICENSED
