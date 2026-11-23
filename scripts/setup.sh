#!/usr/bin/env bash
set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Ensure Bun is in PATH
if ! command -v bun >/dev/null 2>&1; then
  if [ -x "$HOME/.bun/bin/bun" ]; then
    export PATH="$HOME/.bun/bin:$PATH"
  fi
fi

echo "=========================================================="
echo "  DCL Season 5 Scoreboard — Monorepo Bootstrap Setup"
echo "=========================================================="

# 1. Environment files
echo "1. Checking environment files..."
if [ ! -f .env ]; then
  echo "   Creating root .env from .env.example..."
  cp .env.example .env
fi
if [ ! -f apps/backend/.env ]; then
  echo "   Creating apps/backend/.env from apps/backend/.env.example..."
  cp apps/backend/.env.example apps/backend/.env
fi

# 2. Start MongoDB in Docker
echo "2. Starting MongoDB Docker container..."
docker compose up -d mongo

echo "   Waiting for MongoDB container to be healthy..."
max_attempts=30
attempt=0
until docker compose exec -T mongo mongosh --quiet --eval "db.adminCommand('ping')" >/dev/null 2>&1 || [ $attempt -ge $max_attempts ]; do
  attempt=$((attempt + 1))
  sleep 1
done

if [ $attempt -ge $max_attempts ]; then
  echo "❌ MongoDB did not become ready in time."
  exit 1
fi
echo "   MongoDB is healthy and ready!"

# 3. Backend Python Virtual Environment
echo "3. Setting up Python virtual environment in apps/backend/.venv..."
PYTHON_BIN="python3.14"
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  PYTHON_BIN="python3"
fi

if [ ! -d "apps/backend/.venv" ]; then
  echo "   Creating virtualenv with $PYTHON_BIN..."
  "$PYTHON_BIN" -m venv apps/backend/.venv
fi

echo "   Installing backend dependencies..."
./apps/backend/.venv/bin/pip install --upgrade pip -q
./apps/backend/.venv/bin/pip install -r apps/backend/requirements-dev.txt -q

# 4. Install Bun workspace dependencies
echo "4. Installing Bun workspace dependencies..."
bun install

# 5. Database migrations
echo "5. Running database migrations..."
(cd apps/backend && ./.venv/bin/python -m app.migrations.runner)

# 6. Seed initial tournament data
echo "6. Seeding initial tournament data..."
(cd apps/backend && ./.venv/bin/python -m app.scripts.seed_data)

echo ""
echo "=========================================================="
echo "  Setup Complete! 🚀"
echo "=========================================================="
echo "To start development (MongoDB + Backend + Frontend):"
echo "   bun run dev"
echo ""
echo "To run tests:"
echo "   bun run test"
echo "=========================================================="
