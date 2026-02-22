# LM Studio Web UI

A **local-first, LAN-accessible Web UI for LM Studio**.

This project provides a browser-based interface for **LM Studio**, designed to run entirely on your local machine while being **accessible from any device in your home network** (phone, tablet, laptop, desktop).

It is **not a cloud service**, **not a hosted LLM**, and **not a replacement for LM Studio**.
It builds on top of LM Studio’s local runtime and exposes it through a structured, inspectable web interface.

> This project exists because LM Studio is excellent at running local models, and a robust, network-friendly UI on top makes local usage more convenient.

---

## Project status

- CI: `/.github/workflows/ci.yml`
- License: MIT
- Node: recommended recent LTS - (tested with v24.12.0)

---

## What This Project Is (and Is Not)

### What it **is**

- Local web interface for LM Studio
- Runs entirely on your own machine
- Accessible via local network (LAN)
- Backend orchestrates runs and tools deterministically
- Includes chats, reusable settings profiles, and workflows

### What it **is not**

- No cloud account system
- No hosted models
- No vendor lock-in
- No “black magic” agent execution (tools are explicit and inspectable)

---

## Architecture Overview

- **Frontend:** Angular (SPA)
- **Backend:** NestJS
- **Persistence:** SQLite (local file)
- **Communication:** REST + SSE (Server-Sent Events) for live updates

The backend is responsible for:

- creating and managing runs
- streaming and persisting chat messages
- executing tool calls in a controlled environment
- reading uploaded documents (assets)
- optionally querying external services (web search)

The frontend focuses on:

- a responsive chat UI
- profiles + workflows UX
- live updates via SSE
- theming + localization

---

## Core Features

### Chat & Runs

- Chat threads with message variants and streaming output
- Deterministic “run” concept (requests are traceable and inspectable)
- Auto-title generation from the first user message (works for `Untitled`, `Untitled (1)` etc.)

### Settings Profiles

- Multiple profiles for model settings (temperature, tokens, etc.)
- Import/export profiles as JSON bundles
- “Set default” behavior for quick switching

### Workflows

- Workflow definitions stored locally
- Import/export workflow bundles
- Workflow execution via node-based steps (including tool nodes)

### External service health

- Live status for connected services (e.g. LM Studio / SearXNG) via SSE
- UI shows connection state so it’s obvious when something is offline

---

## Theming

The UI supports multiple themes via CSS variables (semantic tokens) and a body class:

- `theme-Dark` (default)
- `theme-Light`
- `theme-Glass` (light glassmorphism style)
- `theme-Gaming` (neon / background-driven style)

Themes are built around **semantic CSS variables** like:

- `--bg`, `--surface-1`, `--text`, `--border`
- `--primary`, `--focus-ring`
- component-level tokens (e.g. chat bubbles, hover states)

This makes it possible to evolve the UI look without scattering hardcoded colors across components.

---

## Localization (i18n)

The UI is available in:

- **German (de)**
- **English (en)**
- **French (fr)**

Language is stored in user preferences and applied instantly.

---

## Tools (Agent Capabilities)

This project uses an explicit **tool orchestration system**.
Tools are exposed to the model via structured schemas and executed by the backend.

### Available Tools (Tool Orchestrator)

#### `current_time`

Return the current date/time with timezone info.
Useful before interpreting relative phrases like “yesterday”.

#### `resolve_relative_date`

Resolve human time expressions (e.g. “next Friday 5pm”) into ISO datetimes.

#### `date_math`

Deterministic date math (add/subtract, startOf/endOf, rounding) in a timezone.

#### `math`

Evaluate mathematical expressions deterministically.

#### `json_validate`

Validate JSON against a JSON Schema and return detailed errors.

#### `json_repair`

Repair “JSON-ish” text (single quotes, trailing commas, unquoted keys) into valid JSON when possible.

#### `web_search`

Search the web and return a list of results.
Typically backed by **SearXNG** when configured.

#### `web_read`

Fetch a webpage and extract the main readable text and metadata.

#### `doc_read`

Read a document from an uploaded `assetId`.
Supports ZIP archives (returns multiple entries).
Returns structured extraction (text/json/code/pdf/docx/image) depending on content.

---

## File Upload & Document Support

Documents are handled via the **assets system**:

- Upload → receive `assetId`
- Tools refer to assets by `assetId` (not raw URLs)

ZIP uploads are supported and extracted into multiple entries.

---

## Requirements

- Node.js (recommended: recent LTS)
- LM Studio running locally
- (Optional) SearXNG for web search

---

## Environment Configuration

The backend can be configured via `.env` variables (examples):

- `LMSTUDIO_BASE_URL` (default `http://127.0.0.1:1234`)
- `SEARXNG_BASE_URL` (optional)
- `DB_PATH` (SQLite file location)

For production builds, configuration is read from .env.prod.

---

## Web Search Setup (Optional)

For best results, configure a local SearXNG instance and set:

- `SEARXNG_BASE_URL=http://<host>:<port>`

If SearXNG is not configured, web search falls back to duckduckgo api.

---

## Running the Application

From the repository root:

```bash
# install deps
npm install

# create your build
npm run build

# start the application
npm start
```

Then open the UI in your browser.

---

## Database & Persistence

Data is stored locally in SQLite:

- chats
- runs
- messages and variants
- settings profiles
- workflows
- assets (metadata)

This project is intentionally local-first: if you delete the DB file, you reset the app.

---

## Design Philosophy

- **Local-first** by default
- **Inspectability** over magic
- **Explicit tools** with schemas and deterministic execution
- **UI clarity**: show status and progress instead of hiding latency
- **Safe defaults**: validation + API payload whitelisting

---

## License

**MIT**.

Why MIT:

- It makes the repository usable for others (and recruiters) without ambiguity
- It’s permissive and portfolio-friendly

If you include paid/licensed images in the repo, ensure you have redistribution rights or keep those assets out of public source control.
