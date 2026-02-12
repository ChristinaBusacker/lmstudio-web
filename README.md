# LM Studio Web UI

A local-network–first web application that exposes **LM Studio** through a browser-based UI.

This project bundles a **NestJS backend** and an **Angular single-page application (SPA)** into a single runnable server. The backend provides a REST/SSE API under `/api`, while the Angular UI is served under `/ui`. Data is stored locally using **SQLite**, and database schema changes are handled via **TypeORM migrations** that run automatically on startup.

The primary goal of this application is to **make LM Studio accessible over the local network** through a clean web interface, without requiring cloud services or external infrastructure.

---

## Features

- Angular SPA served under `/ui` (with proper deep-link reload support)
- NestJS API served under `/api`
- Local SQLite database (file-based)
- Automatic database initialization via TypeORM migrations on startup
- LM Studio integration via its local HTTP API
- Single-process deployment (one Node.js server)
- Production-ready `dist/` distribution folder

---

## Architecture Overview

- **Backend:** NestJS (Express)
- **Frontend:** Angular (SPA, no SSR)
- **Routing:**
  - Backend API: `/api/*`
  - Frontend UI: `/ui/*`
- **Database:** SQLite (`app.sqlite`)
- **ORM:** TypeORM
- **LLM Runtime:** LM Studio (local HTTP server)

The Angular application handles all client-side routing. On page reloads of deep links (e.g. `/ui/chat/<id>`), the NestJS server falls back to serving the Angular `index.html`.

---

## Requirements

### Mandatory

- **Node.js** (recommended: Node.js 22 LTS, Node 20+ should work)
- **npm** (comes with Node.js)
- **LM Studio**
  - Must be installed locally
  - The LM Studio HTTP server must be running
  - Default URL: `http://127.0.0.1:1234`

> This application is explicitly built **on top of LM Studio** and does not support other LLM backends.

### Network

- One free TCP port for the application (default: `3000`)
- Local network access if you want to expose the UI to other devices

---

## Environment Configuration

Configuration is done via environment variables.

A production-ready template is provided as `.env.prod`. For development, copy it to `.env`.

### Example `.env`

```
PORT=3000
HOST=0.0.0.0

DB_PATH=./data/app.sqlite

LMSTUDIO_BASE_URL=http://127.0.0.1:1234
LMSTUDIO_DEFAULT_MODEL=openai/gpt-oss-20b

NODE_ENV=production
```

### Variable Explanation

| Variable | Description |
|--------|------------|
| `PORT` | Port on which the NestJS server listens |
| `HOST` | Bind address (use `0.0.0.0` for LAN access) |
| `DB_PATH` | Path to the SQLite database file |
| `LMSTUDIO_BASE_URL` | Base URL of the LM Studio HTTP API |
| `LMSTUDIO_DEFAULT_MODEL` | Default model identifier |
| `NODE_ENV` | Runtime environment |

---

## Development Setup

### 1. Install Dependencies

```
npm install
```

### 2. Prepare Environment

```
cp .env.prod .env
```

(Windows PowerShell)
```
Copy-Item .env.prod .env
```

### 3. Start LM Studio

- Open LM Studio
- Start the local HTTP server
- Verify it is reachable at `LMSTUDIO_BASE_URL`

### 4. Start Development Mode

```
npm run dev
```

This starts:
- NestJS backend (watch mode)
- Angular dev server with proxy configuration

---

## Build & Production Distribution

### Build

```
npm run build
```

This will:

1. Build the NestJS backend
2. Build the Angular frontend
3. Finalize the `dist/` folder
   - Copy backend entry file
   - Include frontend assets
   - Include migration files
   - Create `data/` directory
   - Copy `.env.prod` to `dist/.env`

### Resulting `dist/` Layout

```
dist/
  main.js
  .env
  data/
    app.sqlite      (created on first start)
  migrations/
  ui/
    browser/
      index.html
      *.js
      *.css
```

---

## Running in Production

From the project root:

```
npm start
```

This runs:

```
node dist/main.js
```

### Available Endpoints

- **Web UI:** `http://localhost:3000/ui`
- **API:** `http://localhost:3000/api`
- **Swagger UI:** `http://localhost:3000/api/docs`
- **OpenAPI JSON:** `http://localhost:3000/api/openapi.json`

---

## Running on a Different Machine

### Option A: Run from Source

1. Install Node.js
2. Install LM Studio and start its HTTP server
3. Copy the repository
4. Install dependencies

```
npm install
```

5. Configure `.env`
6. Build and start

```
npm run build
npm start
```

---

### Option B: Distribute Only `dist/`

If you want to distribute only the compiled application:

Requirements on the target machine:
- Node.js installed
- LM Studio running

Steps:

1. Copy the entire `dist/` folder
2. Adjust `dist/.env` if necessary
3. Start the server:

```
node main.js
```

(from inside the `dist/` directory)

---

## Database & Migrations

- The SQLite database file is created automatically on first start
- TypeORM migrations are executed automatically (`migrationsRun: true`)
- If the database becomes inconsistent during development:
  - Stop the app
  - Delete `data/app.sqlite`
  - Restart the app

---

## Troubleshooting

### UI reload returns 404

Ensure you are running the production server (`node dist/main.js`). The SPA fallback is only active in the NestJS production setup.

### JavaScript/CSS not loading

This indicates that the SPA fallback is intercepting asset requests. Ensure static file serving is registered before the fallback middleware.

### `SQLITE_ERROR: no such table`

The database exists but migrations were not applied. Delete the database file and restart the application.

### Cannot connect to LM Studio

- Verify LM Studio is running
- Verify `LMSTUDIO_BASE_URL`
- Check firewall or network settings

---

## License

UNLICENSED

---

This project is designed as a **local-first, network-accessible interface for LM Studio**, focusing on simplicity, portability, and control over your local LLM runtime.

