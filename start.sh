#!/bin/bash

# ANSI Color Codes for beautiful terminal styling
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color
BOLD='\033[1m'

echo -e "${BOLD}${CYAN}==================================================${NC}"
echo -e "${BOLD}${CYAN}      ENGINE — Web UI Launcher (on-demand)        ${NC}"
echo -e "${BOLD}${CYAN}==================================================${NC}"

# On-demand model: there is NO scheduler daemon and llama-server is NOT kept resident.
# This script only starts the Web UI. Runs are triggered by BUTTONS in the UI (Run
# deep-dive / Refresh digest / Refresh data) — each boots llama-server for that run and
# kills it when done. Nothing runs or holds RAM until you click.

mkdir -p data/logs
WEB_PID_FILE=".web.pid"

check_process_alive() {
  local pid_file=$1
  if [ -f "$pid_file" ]; then
    local pid=$(cat "$pid_file")
    if kill -0 "$pid" 2>/dev/null; then echo "$pid"; return 0; fi
  fi
  return 1
}

# Informational llama probe (should normally be OFFLINE — it boots per run).
echo -e "\n${BOLD}Probing Local Llama Server...${NC}"
if curl -s -m 3 http://localhost:8000/health | grep -q "ok" 2>/dev/null; then
  echo -e "  Llama Server: ${YELLOW}● ACTIVE${NC} — a run is likely in progress, or a manual server is up."
else
  echo -e "  Llama Server: ${GREEN}○ OFFLINE${NC} (expected — it boots on-demand per run and frees RAM after)."
fi

# Start Web UI
echo -e "\n${BOLD}Managing Web UI...${NC}"
WEB_PID=$(check_process_alive "$WEB_PID_FILE")
if [ -n "$WEB_PID" ]; then
  echo -e "  Web UI is ${GREEN}already running${NC} (PID: $WEB_PID)"
else
  echo -e "  Starting Web UI in the background..."
  cd web
  nohup npm run dev >> ../data/logs/web.log 2>&1 &
  echo $! > "../$WEB_PID_FILE"
  cd ..
  sleep 1.5
  NEW_PID=$(check_process_alive "$WEB_PID_FILE")
  if [ -n "$NEW_PID" ]; then
    echo -e "  Web UI: ${GREEN}● STARTED${NC} (PID: $NEW_PID)"
    echo -e "  URL:  ${CYAN}http://localhost:3000${NC}"
    echo -e "  Logs: tail -f data/logs/web.log"
  else
    echo -e "  Web UI: ${RED}✗ FAILED TO START${NC} (Check data/logs/web.log)"
  fi
fi

echo -e "\n${BOLD}${GREEN}Ready. Trigger work from the UI — the model boots per run.${NC}"
echo -e "${BOLD}${CYAN}==================================================${NC}"
