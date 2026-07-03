import { readFileSync } from "node:fs";
import { parseCompanyFacts } from "../src/net/edgar-facts";
const json = JSON.parse(readFileSync("/tmp/mu-facts.json", "utf8"));
const rows = parseCompanyFacts("MU", json);
console.log("total quarterly rows:", rows.length);
console.log("date span:", rows[0]?.periodEnd, "→", rows[rows.length - 1]?.periodEnd);
const recent = rows.filter((r) => r.revenue != null).slice(-5);
for (const r of recent) {
  console.log(`${r.periodEnd}: rev=$${((r.revenue ?? 0) / 1e9).toFixed(2)}B gp=$${((r.grossProfit ?? 0) / 1e9).toFixed(2)}B ni=$${((r.netIncome ?? 0) / 1e9).toFixed(2)}B fcf=${r.fcf != null ? "$" + (r.fcf / 1e9).toFixed(2) + "B" : "—"} assets=$${((r.totalAssets ?? 0) / 1e9).toFixed(0)}B shares=${r.sharesOut != null ? (r.sharesOut / 1e6).toFixed(0) + "M" : "—"}`);
}
const withRev = rows.filter((r) => r.revenue != null).length;
console.log("rows with revenue:", withRev);
