#!/usr/bin/env bash
set -e

echo "Starting MongoDB in Docker..."
docker compose up -d mongo

echo "Waiting for MongoDB to become ready..."
until docker compose exec -T mongo mongosh --quiet --eval "db.adminCommand('ping')" >/dev/null 2>&1; do
  sleep 1
done
echo "MongoDB is ready and accepting connections."
