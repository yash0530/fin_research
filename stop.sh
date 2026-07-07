#!/bin/bash

# ANSI Color Codes for beautiful terminal styling
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color
BOLD='\033[1m'

echo -e "${BOLD}${RED}==================================================${NC}"
echo -e "${BOLD}${RED}      ENGINE — Shutdown Orchestrator (macOS)      ${NC}"
echo -e "${BOLD}${RED}==================================================${NC}"

WEB_PID_FILE=".web.pid"
SCHEDULER_PID_FILE=".scheduler.pid" # legacy — killed defensively if present

kill_service() {
  local name=$1
  local pid_file=$2
  if [ -f "$pid_file" ]; then
    local pid=$(cat "$pid_file")
    echo -e "Stopping $name (PID: $pid)..."
    if kill "$pid" 2>/dev/null; then
      for i in {1..5}; do kill -0 "$pid" 2>/dev/null || break; sleep 1; done
      if kill -0 "$pid" 2>/dev/null; then
        echo -e "  Process did not exit, force-killing (SIGKILL)..."
        kill -9 "$pid" 2>/dev/null
      fi
      echo -e "  $name: ${RED}■ STOPPED${NC}"
    else
      echo -e "  Process $pid already dead or permission denied."
    fi
    rm -f "$pid_file"
  else
    echo -e "  $name: ${YELLOW}○ NOT RUNNING${NC} (No $pid_file found)"
  fi
}

# 1. Stop Web UI
echo -e "\n${BOLD}Stopping Web UI...${NC}"
kill_service "Web UI" "$WEB_PID_FILE"

# 2. Defensively stop any legacy scheduler daemon (should not exist anymore)
echo -e "\n${BOLD}Ensuring no scheduler daemon lingers...${NC}"
kill_service "Scheduler Daemon (legacy)" "$SCHEDULER_PID_FILE"
pkill -f "scripts/scheduler.ts" 2>/dev/null && echo -e "  Killed a stray scheduler.ts process." || true

# 3. Kill any llama-server so RAM is freed (a stuck on-demand run may have orphaned it)
echo -e "\n${BOLD}Freeing the model (llama-server) if resident...${NC}"
if pkill -f "llama-server -m" 2>/dev/null; then
  echo -e "  llama-server: ${RED}■ STOPPED${NC} (RAM freed)"
else
  echo -e "  llama-server: ${GREEN}○ not running${NC} (expected)"
fi
rm -f data/run.lock 2>/dev/null

# 4. Clean up any orphaned process on the Web UI port
echo -e "\n${BOLD}Cleaning up any orphaned process on port 3000...${NC}"
PORT_3000_PID=$(lsof -t -i:3000 2>/dev/null)
if [ -n "$PORT_3000_PID" ]; then
  echo -e "  Found active process on port 3000 (PID: $PORT_3000_PID). Stopping..."
  kill $PORT_3000_PID 2>/dev/null; sleep 0.5; kill -9 $PORT_3000_PID 2>/dev/null
fi

echo -e "\n${BOLD}${GREEN}Shutdown complete! All services stopped, RAM freed.${NC}"
echo -e "${BOLD}${RED}==================================================${NC}"
