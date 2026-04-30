#!/usr/bin/env bash
# Run ON THE SERVER inside the repo (after SSH): pulls latest Git and rebuilds containers.
#
#   chmod +x deploy/server-update.sh
#   ./deploy/server-update.sh              # frontend + backend (safest after any change)
#   ./deploy/server-update.sh frontend     # UI/CSS only — faster
#   ./deploy/server-update.sh backend      # Python/API changes only
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

git pull

if [[ $# -eq 0 ]]; then
  docker compose up -d --build
else
  docker compose up -d --build "$@"
fi

docker compose ps
