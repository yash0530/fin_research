import { execSync } from "node:child_process";
import { type SqlDb } from "../db/migrate";

export type ExecLike = (cmd: string) => string;
export type SleepLike = (ms: number) => Promise<void>;

/**
 * Checks system thermal limits and battery status on macOS to prevent overheating or draining.
 * Throws an error if battery is under 25% on battery power.
 * Pauses for 30 seconds if CPU_Speed_Limit is below 50.
 */
export async function checkHardwareThrottling(
  db: SqlDb,
  runId: string,
  opts: {
    execImpl?: ExecLike;
    sleepImpl?: SleepLike;
    platform?: string;
  } = {},
): Promise<void> {
  const platform = opts.platform ?? process.platform;
  if (platform !== "darwin") {
    // No-op off macOS
    return;
  }

  const exec = opts.execImpl ?? ((cmd: string) => execSync(cmd, { encoding: "utf8" }));
  const sleep = opts.sleepImpl ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));

  // Check thermals via pmset -g therm
  let cpuSpeedLimit = 100;
  try {
    const thermalOut = exec("pmset -g therm");
    // match "CPU_Speed_Limit = 50" or "CPU_Speed_Limit: 50"
    const match = thermalOut.match(/CPU_Speed_Limit\s*[:=]\s*(\d+)/i);
    if (match) {
      cpuSpeedLimit = parseInt(match[1], 10);
    }
  } catch (err) {
    // ignore command failures if pmset doesn't support the flags
  }

  if (cpuSpeedLimit < 50) {
    console.warn(`System thermal warning: CPU_Speed_Limit is ${cpuSpeedLimit}%. Inserting cooling cycle.`);
    try {
      db.prepare('UPDATE "ResearchRun" SET "errorMessage" = ? WHERE "id" = ?')
        .run(`Throttling: Cool-down active (CPU_Speed_Limit: ${cpuSpeedLimit}%)`, runId);
    } catch {
      // ignore database update failures in isolation/tests
    }
    await sleep(30000);
  }

  // Check battery via pmset -g batt
  let isOnBattery = false;
  let batteryPercent = 100;
  try {
    const battOut = exec("pmset -g batt");
    if (battOut.toLowerCase().includes("battery power") || battOut.toLowerCase().includes("discharging")) {
      isOnBattery = true;
    }
    const pctMatch = battOut.match(/(\d+)%/);
    if (pctMatch) {
      batteryPercent = parseInt(pctMatch[1], 10);
    }
  } catch (err) {
    // ignore
  }

  if (isOnBattery && batteryPercent < 25) {
    throw new Error(`Research run aborted: Battery below 25% (${batteryPercent}%) and device not connected to power.`);
  }
}
