#!/bin/sh
set -e

echo "Waiting for database..."
until echo "SELECT 1;" | npx prisma db execute --stdin > /dev/null 2>&1; do
  sleep 1
done
echo "Database is up."

npx prisma db push --skip-generate --accept-data-loss

if [ "$SEED_ON_START" = "true" ]; then
  echo "Seeding database..."
  node dist/prisma/seed.js || true
fi

exec "$@"
