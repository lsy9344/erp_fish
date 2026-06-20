#!/usr/bin/env bash
set -euo pipefail

echo "start-database.sh is deprecated as a standalone database launcher."
echo "Using the documented Docker Compose database instead."

docker compose up -d "$@"
