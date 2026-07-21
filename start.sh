#!/usr/bin/env bash
# Start the app. No backend required — app runs fully on-device.

ROOT="$(cd "$(dirname "$0")" && pwd)"

B='\033[1m'; G='\033[0;32m'; N='\033[0m'

echo -e "${B}Starting app...${N}"
(cd "$ROOT/app" && npx expo start)
