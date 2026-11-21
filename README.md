# Startexel Monorepo

`startexel` is a modern polyglot monorepo scaffold managed with **pnpm workspaces** and **Turborepo**, backed by **Docker Compose** for local infrastructure.

---

## Architecture Overview

```
startexel/
├── apps/
│   ├── web/          # Next.js 14 (App Router) + Tailwind CSS (Port 3000)
│   ├── api/          # NestJS API (Port 4000)
│   └── ai/           # FastAPI Python service (Port 8000)
├── packages/
│   └── shared/       # Shared TypeScript package (@startexel/shared)
├── docker-compose.yml# PostgreSQL (pgvector), Redis, and MinIO
├── pnpm-workspace.yaml
├── turbo.json
├── .env.example
└── README.md
```

---

## Prerequisites

Ensure the following tools are installed on your machine:

- **Node.js**: `v18.0.0` or higher
- **pnpm**: `v9.0.0` or higher (`npm install -g pnpm`)
- **Python**: `3.10` or higher
- **Docker & Docker Compose**: Docker Desktop or Docker Engine

---

## Getting Started

### 1. Environment Setup

Copy `.env.example` to `.env` in the root (and customize any credentials/placeholders):

```bash
# Windows PowerShell
Copy-Item .env.example .env

# Bash
cp .env.example .env
```

*(Optional)* You can also create app-specific `.env` files in `apps/web`, `apps/api`, and `apps/ai` based on their respective `.env.example` templates.

---

### 2. Start Infrastructure (Docker Compose)

Launch PostgreSQL with `pgvector`, Redis, and MinIO:

```bash
docker compose up -d
```

This starts:
- **PostgreSQL (pgvector)**: `localhost:5432` (Health check: `pg_isready`, named volume: `startexel_postgres_data`)
- **Redis**: `localhost:6379` (Health check: `redis-cli ping`, named volume: `startexel_redis_data`)
- **MinIO S3 API**: `http://localhost:9000` (Health check: HTTP endpoint, named volume: `startexel_minio_data`)
- **MinIO Web Console**: `http://localhost:9001`

Verify service health:
```bash
docker compose ps
```

To stop containers:
```bash
docker compose down
```

---

### 3. Install JavaScript/TypeScript Dependencies

From the repository root, install dependencies for all workspaces using `pnpm`:

```bash
pnpm install
```

---

### 4. Run Development Servers

#### Option A: Run TypeScript Apps via Turborepo
From the repository root, run:
```bash
pnpm dev
```
This runs `apps/web` on port `3000` and `apps/api` on port `4000`.

#### Option B: Run Apps Individually

##### Next.js Web (`apps/web`):
```bash
cd apps/web
pnpm dev
# Visit http://localhost:3000
```

##### NestJS API (`apps/api`):
```bash
cd apps/api
pnpm dev
# Visit http://localhost:4000
```

##### FastAPI AI Service (`apps/ai`):
```bash
cd apps/ai

# Create & activate a Python virtual environment:
# Windows:
python -m venv .venv
.venv\Scripts\activate

# macOS/Linux:
# python3 -m venv .venv
# source .venv/bin/activate

# Install dependencies:
pip install -r requirements.txt

# Run the FastAPI server:
uvicorn app.main:app --reload --port 8000

# Visit http://localhost:8000
# OpenAPI Swagger documentation: http://localhost:8000/docs
```

---

## Monorepo Scripts

The following root commands orchestrate tasks across the monorepo via Turborepo:

| Command | Description |
|---|---|
| `pnpm dev` | Start development servers across packages |
| `pnpm build` | Build all packages and applications |
| `pnpm lint` | Run linter and type-checks |
| `pnpm clean` | Clean build artifacts and caches |

---

## Service URLs Summary

| Service | Technology | Default URL |
|---|---|---|
| Web Frontend | Next.js + Tailwind | [http://localhost:3000](http://localhost:3000) |
| API Backend | NestJS | [http://localhost:4000](http://localhost:4000) |
| AI Service | FastAPI | [http://localhost:8000](http://localhost:8000) |
| AI Swagger Docs | Swagger / OpenAPI | [http://localhost:8000/docs](http://localhost:8000/docs) |
| PostgreSQL | pgvector/pgvector | `localhost:5432` |
| Redis | Redis 7 Alpine | `localhost:6379` |
| MinIO Console | MinIO | [http://localhost:9001](http://localhost:9001) |
