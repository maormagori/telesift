#!/bin/sh
set -eu

ROLE="${1:-}"

case "$ROLE" in
  app|telegram-service|ingestion-worker|extraction-worker|download-worker|migrate)
    ;;
  *)
    echo "Usage: docker run <image> <role>" >&2
    echo "Valid roles: app, telegram-service, ingestion-worker, extraction-worker, download-worker, migrate" >&2
    exit 1
    ;;
esac

printf '%s' "$ROLE" > /tmp/telesift-role

exec node "dist/processes/$ROLE/main.js"
