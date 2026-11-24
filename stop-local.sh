#!/usr/bin/env sh
# Stops QuickPrint and frees its port. Your data is kept (add -v to the command below to delete it too).
cd "$(dirname "$0")"
docker compose down
echo "QuickPrint stopped."
