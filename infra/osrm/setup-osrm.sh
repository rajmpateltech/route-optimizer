#!/usr/bin/env bash
#
# Downloads an OpenStreetMap extract and builds OSRM data for self-hosted
# routing (the free, scalable option for large jobs).
#
# Usage:
#   ./infra/osrm/setup-osrm.sh [region]
#
# Region can be a named extract handled by Geofabrik (e.g. "europe",
# "north-america/us/california") or a direct URL to a .osm.pbf file.
# For truly global coverage use region "planet" (large: ~70GB download,
# needs ~32GB RAM to build). Most deployments start with a country or
# continent extract.
#
# Afterwards run:  docker compose --profile osrm up -d

set -euo pipefail

REGION="${1:-europe}"
DIR="$(cd "$(dirname "$0")/../.." && pwd)"
DATA_DIR="$DIR/osrm-data"
mkdir -p "$DATA_DIR"

PBF="$DATA_DIR/data.osm.pbf"
if [[ "$REGION" == http* ]]; then
  URL="$REGION"
else
  URL="https://download.geofabrik.de/${REGION}-latest.osm.pbf"
fi

echo "==> Downloading extract: $URL"
if [ ! -f "$PBF" ]; then
  curl -L --fail -o "$PBF" "$URL"
else
  echo "    data.osm.pbf already present, skipping download"
fi

echo "==> Building OSRM data (extract / partition / customize)"
docker run --rm -v "$DATA_DIR:/data" osrm/osrm-backend:v5.27.1 \
  osrm-extract -p /opt/car.lua /data/data.osm.pbf
docker run --rm -v "$DATA_DIR:/data" osrm/osrm-backend:v5.27.1 \
  osrm-partition /data/data.osrm
docker run --rm -v "$DATA_DIR:/data" osrm/osrm-backend:v5.27.1 \
  osrm-customize /data/data.osrm

echo "==> Done. Start OSRM with:  docker compose --profile osrm up -d"
echo "    Then set OSRM_MODE=selfhosted and OSRM_URL=http://localhost:5000"
