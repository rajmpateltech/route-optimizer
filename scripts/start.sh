#!/usr/bin/env bash
#
# One-command start for the local RouteOptimizer stack that is resilient to
# .env being edited, reverted, or deleted (which previously caused 502s).
#
# It forces the running Postgres password to match the .env (or default),
# then starts everything and opens a public tunnel.
#
# Usage:  bash scripts/start.sh
set -euo pipefail
cd "$(dirname "$0")/.."

# Which password should the database use? (defaults match docker-compose.yml)
POSTGRES_PASSWORD="routeoptimizer"
if [ -f .env ] && grep -qE '^POSTGRES_PASSWORD=' .env; then
  POSTGRES_PASSWORD=$(grep -E '^POSTGRES_PASSWORD=' .env | cut -d= -f2)
fi

echo ">> Ensuring Postgres is running..."
docker compose up -d postgres >/dev/null 2>&1
for i in $(seq 1 30); do
  docker compose exec -T postgres pg_isready -U routeoptimizer >/dev/null 2>&1 && break
  sleep 1
done

echo ">> Syncing database password to .env (prevents 502 from drift)..."
docker compose exec -T postgres psql -U routeoptimizer -d routeoptimizer \
  -v ON_ERROR_STOP=1 -c "ALTER USER routeoptimizer WITH PASSWORD '$POSTGRES_PASSWORD';" >/dev/null 2>&1 || true

echo ">> Starting all services..."
docker compose up -d
sleep 8

echo ">> Health check:"
curl -s http://localhost/health && echo

echo ">> Opening public tunnel..."
pkill -f "cloudflared tunnel" 2>/dev/null || true
sleep 1
nohup cloudflared tunnel --url http://localhost:80 --no-autoupdate > /tmp/cloudflared.log 2>&1 &
sleep 12
URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' /tmp/cloudflared.log | head -1 || true)

echo ""
echo "=============================================================="
echo "  App is live:  http://localhost"
if [ -n "${URL:-}" ]; then
  echo "  Public URL:   $URL"
fi
echo "  Stop:         docker compose down"
echo "  Logs:         docker compose logs -f backend"
echo "=============================================================="
