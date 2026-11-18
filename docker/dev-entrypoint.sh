#!/bin/sh
set -eu

ROLE="${1:-}"

case "$ROLE" in
  app|telegram-service|ingestion-worker|extraction-worker|download-worker)
    printf '%s' "$ROLE" > /tmp/telesift-role
    exec node_modules/.bin/tsx watch --clear-screen=false "src/processes/$ROLE/main.ts"
    ;;
  migrate)
    exec node_modules/.bin/tsx src/processes/migrate/main.ts
    ;;
  app-web)
    exec node_modules/.bin/vite --config src/processes/app/web/vite.config.ts --host 0.0.0.0 --port 5173 --strictPort
    ;;
  *)
    echo "Usage: docker run <dev image> <role>" >&2
    echo "Valid roles: app, app-web, telegram-service, ingestion-worker, extraction-worker, download-worker, migrate" >&2
    exit 1
    ;;
esac
