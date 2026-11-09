#!/bin/sh
# ============================================================================
# SchoolDesk container entrypoint
#   1. Ensure the SQLite directory exists
#   2. If the database file is missing → `prisma db push` to create the schema
#      (and optionally seed demo data when SEED_DEMO_DATA=1)
#   3. Start the server (exec "$@")
# An existing database on a persistent volume is left untouched so that data
# survives container restarts. To sync schema drift manually:
#   docker compose exec app npx prisma db push --skip-generate
# ============================================================================
set -e

: "${DATABASE_URL:=file:/app/db/custom.db}"
export DATABASE_URL

# Strip the "file:" prefix → filesystem path; supports "file:/abs/path" and "file:./relative"
DB_FILE="${DATABASE_URL#file:}"
DB_DIR="$(dirname "$DB_FILE")"

echo "[entrypoint] DATABASE_URL=$DATABASE_URL"
mkdir -p "$DB_DIR"

if [ ! -f "$DB_FILE" ]; then
  echo "[entrypoint] No SQLite database found — creating schema with 'prisma db push'…"
  npx prisma db push --skip-generate

  if [ "$SEED_DEMO_DATA" = "1" ] || [ "$SEED_DEMO_DATA" = "true" ]; then
    echo "[entrypoint] SEED_DEMO_DATA enabled — seeding Nigerian demo school…"
    node prisma/seed.cjs
  else
    echo "[entrypoint] SEED_DEMO_DATA not set — skipping seed (empty database)."
  fi
else
  echo "[entrypoint] Existing database found — leaving schema and data untouched."
fi

echo "[entrypoint] Starting: $*"
exec "$@"
