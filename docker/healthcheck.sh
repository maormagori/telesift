#!/bin/sh
set -eu

ROLE="$(cat /tmp/telesift-role 2>/dev/null || echo "")"

case "$ROLE" in
  app)
    exec node -e "fetch('http://127.0.0.1:'+(process.env.APP_PORT||4000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
    ;;
  telegram-service)
    exec node -e "fetch('http://127.0.0.1:'+(process.env.TELEGRAM_SERVICE_PORT||4001)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
    ;;
  ingestion-worker)
    exec node docker/healthcheck-worker.mjs "${INGESTION_WORKER_LOCK_PATH:-./data/ingestion-worker.lock}"
    ;;
  extraction-worker)
    exec node docker/healthcheck-worker.mjs "${EXTRACTION_WORKER_LOCK_PATH:-./data/extraction-worker.lock}"
    ;;
  download-worker)
    exec node docker/healthcheck-worker.mjs "${DOWNLOAD_WORKER_LOCK_PATH:-./data/download-worker.lock}"
    ;;
  *)
    exit 0
    ;;
esac
