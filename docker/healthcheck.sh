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
  ingestion-worker|extraction-worker|download-worker)
    exec node "dist/processes/$ROLE/main.js" --healthcheck
    ;;
  *)
    exit 0
    ;;
esac
