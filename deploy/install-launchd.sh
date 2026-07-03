#!/usr/bin/env bash
# Install (or reinstall) the ENGINE scheduler as a per-user launchd agent.
# Idempotent: safe to re-run — it boots out any existing instance, refreshes the
# plist in ~/Library/LaunchAgents, bootstraps it into the gui domain, and prints
# the resulting status. RunAtLoad + KeepAlive keep the daemon alive across logins.
#
#   bash deploy/install-launchd.sh
#
# The plist's WorkingDirectory / paths are pinned to this checkout; edit
# deploy/com.engine.scheduler.plist if you move the repo.
set -euo pipefail

LABEL="com.engine.scheduler"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_PLIST="${REPO_ROOT}/deploy/${LABEL}.plist"
DEST_DIR="${HOME}/Library/LaunchAgents"
DEST_PLIST="${DEST_DIR}/${LABEL}.plist"
UID_NUM="$(id -u)"
DOMAIN="gui/${UID_NUM}"

if [[ ! -f "${SRC_PLIST}" ]]; then
  echo "✗ missing ${SRC_PLIST}" >&2
  exit 1
fi

echo "→ ensuring log dir + LaunchAgents dir"
mkdir -p "${REPO_ROOT}/data/logs" "${DEST_DIR}"

echo "→ installing ${LABEL}.plist → ${DEST_PLIST}"
cp "${SRC_PLIST}" "${DEST_PLIST}"

# Boot out an existing instance first so the copy takes effect (ignore "not loaded").
echo "→ booting out any existing instance (ignore errors if not loaded)"
launchctl bootout "${DOMAIN}/${LABEL}" 2>/dev/null || true

echo "→ bootstrapping ${DOMAIN}"
launchctl bootstrap "${DOMAIN}" "${DEST_PLIST}"

# KickStart so it runs immediately without waiting for the next RunAtLoad.
launchctl kickstart -k "${DOMAIN}/${LABEL}" 2>/dev/null || true

echo "→ status:"
launchctl print "${DOMAIN}/${LABEL}" 2>/dev/null | grep -E "state|program|arguments|path" || \
  launchctl list | grep "${LABEL}" || true

echo "✓ ${LABEL} installed. Logs: ${REPO_ROOT}/data/logs/scheduler.log"
echo "  Uninstall: launchctl bootout ${DOMAIN}/${LABEL} && rm ${DEST_PLIST}"
