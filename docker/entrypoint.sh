#!/bin/sh
set -e
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "[entrypoint] applying database migrations"
  node /app/dist-scripts/migrate.js
fi
if [ "${RUN_SEED:-true}" = "true" ]; then
  echo "[entrypoint] seeding plans / superadmin (idempotent)"
  node /app/dist-scripts/seed.js
fi
exec "$@"
