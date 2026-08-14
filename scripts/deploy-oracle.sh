#!/usr/bin/env bash
#
# One-command deployer for RouteOptimizer on a single always-free VM
# (Oracle Cloud "Always Free" ARM instance, Ubuntu 24.04). Runs the ENTIRE
# stack — Postgres, Redis, optimizer, backend, frontend — with one command.
#
# Usage on the VM:
#   Option A (recommended):  scp/rsync this project up to the VM, then
#       cd MapOptimizer && bash scripts/deploy-oracle.sh
#   Option B (from GitHub):  bash scripts/deploy-oracle.sh https://github.com/YOU/MapOptimizer.git
#
set -euo pipefail

REPO_URL="${1:-}"

# ---- 1. Install Docker (if missing) -------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  echo ">> Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  sudo systemctl enable --now docker || true
fi

# ---- 2. Docker Compose plugin -------------------------------------------
if ! sudo docker compose version >/dev/null 2>&1; then
  echo ">> Installing Docker Compose plugin..."
  sudo apt-get update -qq
  sudo apt-get install -y -qq docker-compose-plugin
fi

# ---- 3. Get the code -----------------------------------------------------
if [ -n "$REPO_URL" ]; then
  APP_DIR="$HOME/MapOptimizer"
  if [ ! -d "$APP_DIR" ]; then
    echo ">> Cloning $REPO_URL"
    git clone "$REPO_URL" "$APP_DIR"
  fi
  cd "$APP_DIR"
else
  echo ">> No REPO_URL given — using the current directory."
  cd "$(dirname "$0")/.."
fi

# ---- 4. Generate .env with strong secrets --------------------------------
if [ ! -f .env ]; then
  echo ">> Creating .env from .env.example"
  cp .env.example .env
fi
if [ "$(grep -E '^POSTGRES_PASSWORD=' .env | cut -d= -f2)" = "routeoptimizer" ]; then
  echo ">> Generating POSTGRES_PASSWORD..."
  sed -i.bak "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 16)|" .env
fi
if grep -q 'JWT_SECRET=please-change-me-to-a-long-random-string' .env; then
  echo ">> Generating JWT_SECRET..."
  sed -i.bak "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|" .env
fi

# ---- 5. Start the whole stack -------------------------------------------
echo ">> Building and starting all services (first build takes a few minutes)..."
sudo docker compose up -d --build

echo ""
echo "============================================================"
echo "  DONE. Your app is live at:"
echo "    http://$(curl -4 -s --max-time 5 ifconfig.me || true)"
echo "  (also reachable on the VM's private IP.)"
echo "============================================================"
echo "  Verify:  curl http://localhost/health   ->  {\"ok\":true,...}"
echo "  Logs:    sudo docker compose logs -f"
echo "  Update:  git pull && sudo docker compose up -d --build"
