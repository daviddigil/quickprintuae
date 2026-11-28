#!/usr/bin/env sh
# Update an existing local QuickPrint install (Mac / Linux). Run after `git pull`. Keeps your data and reuses the running container's secrets.
set -e
cd "$(dirname "$0")"
command -v docker >/dev/null 2>&1 || { echo "Docker is not installed."; exit 1; }
docker info >/dev/null 2>&1 || { echo "Docker is not running."; exit 1; }
gen() { openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'; }
CID="$(docker ps -a --filter "label=com.docker.compose.service=web" --format '{{.ID}}' | head -n1)"
OLD=""; [ -n "$CID" ] && OLD="$(docker inspect "$CID" --format '{{range .Config.Env}}{{println .}}{{end}}')"
oldval() { printf '%s\n' "$OLD" | grep "^$1=" | head -n1 | cut -d= -f2-; }
touch .env
for K in AUTH_SECRET ENCRYPTION_KEY CRON_SECRET; do
  grep -q "^$K=." .env && continue
  V="$(oldval $K)"
  if [ -z "$V" ]; then
    if [ "$K" = "ENCRYPTION_KEY" ] && docker volume ls --format '{{.Name}}' | grep -q pgdata; then
      echo "STOP: the database exists but no ENCRYPTION_KEY could be recovered. A new key would make stored encrypted data unreadable."
      echo "Put the old key in .env as ENCRYPTION_KEY=..., or for throw-away test data run: docker compose down -v"; exit 1
    fi
    V="$(gen)"; echo "Created new $K"
  else echo "Reused $K from the running container"; fi
  echo "$K=$V" >> .env
done
for K in WEB_PORT PAYMENTS_FAKE DELIVERY_FAKE; do
  grep -q "^$K=." .env || { V="$(oldval $K)"; [ -z "$V" ] && [ "$K" = WEB_PORT ] && V=5050; [ -n "$V" ] && echo "$K=$V" >> .env; }
done
docker compose up -d --build
PORT="$(grep '^WEB_PORT=' .env | cut -d= -f2)"; PORT="${PORT:-5050}"
i=0; until curl -fs "http://localhost:$PORT/api/health" >/dev/null 2>&1; do i=$((i+1)); [ "$i" -gt 120 ] && { docker compose logs --tail=25 web; exit 1; }; sleep 2; done
echo "QuickPrint is updated and running: http://localhost:$PORT"
