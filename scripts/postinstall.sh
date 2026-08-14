#!/usr/bin/env bash
# Make the OSRM setup script executable after clone/checkout.
set -euo pipefail
chmod +x "$(dirname "$0")/infra/osrm/setup-osrm.sh"
echo "infra/osrm/setup-osrm.sh is executable"
