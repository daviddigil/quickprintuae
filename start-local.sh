#!/usr/bin/env sh
# One-command local start for QuickPrint (Mac / Linux). Creates secrets automatically, builds, starts and opens your browser.
set -e
cd "$(dirname "$0")"
PORT="${WEB_PORT:-5050}"

command -v docker >/dev/null 2>&1 || { echo "Docker is not installed. Install Docker Desktop first: https://www.docker.com/products/docker-desktop/"; exit 1; }
docker info >/dev/null 2>&1 || { echo "Docker is installed but not running. Open Docker Desktop, wait until it says it is running, then run ./start-local.sh again."; exit 1; }

if [ ! -f .env ]; then
  gen() { openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'; }
  {
    echo "# Created by start-local.sh — LOCAL TRIAL ONLY (simulated payment + courier)."
    echo "AUTH_SECRET=$(gen)"
    echo "ENCRYPTION_KEY=$(gen)"
    echo "CRON_SECRET=$(gen)"
    echo "WEB_PORT=$PORT"
    echo "PAYMENTS_FAKE=1"
    echo "DELIVERY_FAKE=1"
  } > .env
  echo "Created .env with fresh secrets."
fi

echo "Building and starting QuickPrint (first time takes 3-5 minutes)..."
docker compose up -d --build

PORT="$(grep '^WEB_PORT=' .env | cut -d= -f2)"; PORT="${PORT:-5050}"
URL="http://localhost:$PORT"
printf "Waiting for the app to be ready"
i=0
until curl -fs "$URL/api/health" >/dev/null 2>&1; do
  i=$((i+1)); [ "$i" -gt 120 ] && { echo; echo "Not ready after 4 minutes. Last log lines:"; docker compose logs --tail=25 web; exit 1; }
  printf "."; sleep 2
done
echo
echo "QuickPrint is running:  $URL/s/demo"
echo "  Shop owner login : $URL/login   owner@demo.ae / owner12345"
echo "  Superadmin login : $URL/login   admin@quickprint.ae / change-me-now"
echo "  Stop it later    : ./stop-local.sh"
(command -v open >/dev/null 2>&1 && open "$URL/s/demo") || (command -v xdg-open >/dev/null 2>&1 && xdg-open "$URL/s/demo") || true
