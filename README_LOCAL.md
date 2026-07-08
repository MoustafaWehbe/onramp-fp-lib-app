# Local Setup Instructions

## Project Overview
This is a full-stack TypeScript monorepo with the following components:
- **Frontend**: React 18, Vite, Tailwind CSS, shadcn/ui (port 5173)
- **Backend**: Express, Sequelize, Zod (port 3000)
- **Background Jobs**: BullMQ, Redis
- **Database**: PostgreSQL
- **Monorepo**: Turborepo
- **Language**: TypeScript

## Prerequisites
- Node.js >= 20 (✓ Available: v24.13.0)
- Docker (✗ Missing - Required for PostgreSQL and Redis)

## Setup Steps

### 1. Install Docker
Since Docker is not installed, you'll need to install it first:
- Download Docker Desktop for Windows from https://www.docker.com/products/docker-desktop/
- Install and start Docker Desktop

### 2. Install Dependencies
```bash
cd onramp-project-starter-kit
npm install
```

### 3. Start Infrastructure
```bash
docker-compose up -d
```

### 4. Configure Environment
```bash
cp .env.example .env
# Edit .env with your values
```

### 5. Run Database Migrations
```bash
cd packages/api
npx sequelize-cli db:migrate
npx sequelize-cli db:seed:all   # optional sample data
```

### 6. Start Development Servers
```bash
# Start all packages in parallel
npm run dev

# Or start individually
cd packages/api && npm run dev     # API on :3000
cd packages/web && npm run dev     # Web on :5173
cd packages/workers && npm run dev # Workers
```

## Project Structure
```
packages/
  web/        → React + Vite frontend (port 5173)
  api/        → Express REST API (port 3000)
  workers/    → BullMQ background job processors
  shared/     → Shared utilities (auth, db models, queue, AI)
```

## Available Scripts (root)
| Command | Description |
|---------|-------------|
| `npm run dev` | Start all packages in watch mode |
| `npm run build` | Build all packages |
| `npm run test` | Run all test suites |
| `npm run lint` | Lint all packages |