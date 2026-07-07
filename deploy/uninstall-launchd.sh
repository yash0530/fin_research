#!/usr/bin/env bash
# Remove ALL always-on ENGINE automation so the platform is fully on-demand:
#   - boots out + deletes the scheduler agent (com.engine.scheduler)
#   - boots out + disables the always-resident model agent (com.local.llamacpp)
#   - kills any lingering scheduler / llama-server processes
#
# After this, nothing runs or holds RAM at login. Work happens only when you click a
# button in the web UI (or run `npm run job -- <name> --manage-llama`), which boots
# llama-server for that run and kills it on completion. Safe + idempotent to re-run.
#
#   bash deploy/uninstall-launchd.sh
set -euo pipefail

UID_NUM="$(id -u)"
DOMAIN="gui/${UID_NUM}"
LA="${HOME}/Library/LaunchAgents"

echo "→ booting out launchd agents (ignore 'not loaded')"
launchctl bootout "${DOMAIN}/com.engine.scheduler" 2>/dev/null || true
launchctl bootout "${DOMAIN}/com.local.llamacpp" 2>/dev/null || true

echo "→ removing scheduler plist; disabling llama KeepAlive plist"
rm -f "${LA}/com.engine.scheduler.plist"
# Keep the llama plist as a disabled .bak reference (its args live in src/config/llama.ts now).
if [[ -f "${LA}/com.local.llamacpp.plist" ]]; then
  mv -f "${LA}/com.local.llamacpp.plist" "${LA}/com.local.llamacpp.plist.bak"
fi

echo "→ killing any lingering processes"
pkill -f "scripts/scheduler.ts" 2>/dev/null || true
pkill -f "llama-server -m" 2>/dev/null || true

echo "✓ automation removed. The platform is on-demand only."
echo "  Nothing auto-starts at login; llama-server boots per run and is killed after."
