# FAQ

## Safety & Scope

**Can ENGINE place trades?**
No. There is no broker integration and there never will be. ENGINE is strictly a research and decision-support tool. You must manually execute any trades in your own brokerage account. This is a permanent architectural boundary.

**Is this financial advice?**
No. ENGINE is a personal research tool. All output is the result of computed deterministic synthesis or a local model reasoning over evidence. It is not financial advice, and ENGINE's operators are not licensed advisors. You own 100% of your investment decisions.

**Why does it keep sizing everything at 2%?**
This is the calibration governor doing its job. Until a conviction tier has achieved a verified track record of **≥5 resolved calls** with a **≥50% favorable** resolution rate, it is capped at **2%** of capital. This prevents the model from deploying large sums based on unproven strategies.

## Cost & Local Model

**What does it cost to run?**
Roughly **$0/month**. ENGINE runs a local Qwen 3.6 27B model on your machine and utilizes free data sources. Paid cloud APIs are only configured as a backup connectivity fallback if your local model server is down.

**How is the local model managed?**
The local Qwen model is served via `llama-server` at `http://localhost:8000`. In macOS, it runs as a system daemon managed by launchd via the label `com.local.llamacpp`. A scheduler watchdog monitors the server and automatically restarts it if it goes down.

**How do I troubleshoot or restart the local model?**
- **Check Health:** Visit `http://localhost:8000/health` in your browser.
- **Restart manually:**
  ```bash
  launchctl kickstart -k gui/$(id -u)/com.local.llamacpp
  ```
  *(Or unload/load the plist from `~/Library/LaunchAgents/com.local.llamacpp.plist`)*
- **Watchdog:** If the server crashes, the scheduler watchdog will detect it and auto-restart it on its next poll cycle.

**Can I run a second model?**
Yes. You can configure a second model by defining a new profile in `PROVIDER_PROFILES` and updating your role settings. However, note that a standard machine (e.g. 64 GB RAM) cannot hold two large Q8 models resident in memory simultaneously. The second model must be run at a smaller quantization size, on a separate port, or swapped on demand.

## Data & Output

**Why did a specific claim disappear from my dossier?**
Because of the "no naked numbers" rule. Every claim in a dossier must be traced to a specific tool or a paste evidence item (e.g., `paste:{id}`). If a model makes a claim or references a number that does not carry explicit, validated provenance, it is dropped from the report before it is displayed.

**My dossier completed but says HOLD/LOW with an error note — why?**
If the local model fails to output valid JSON for its final judgment, the engine does not crash. It falls back to a safe `HOLD/LOW` verdict and notes the parsing error. You can resume or re-run the dossier to retry the final step.

**How long do dossiers take to run?**
Expect **~20–45 minutes** per dossier on the local Qwen model. ENGINE prioritizes depth and correctness over speed.

**Will running a dossier delay my morning digest?**
No. While there is only one local model (meaning LLM requests are serialized), the scheduled morning digest job always takes priority. Dossiers are queued and run in the background when no higher-priority jobs are active.

**A ticker shows a 90% single-day crash in the charts — is it real?**
It is almost certainly a bad data tick. To prevent bad data from triggering false signals, every price read path is **despiked** using a rolling median. Wild outliers are replaced, keeping your charts and metrics clean.

## Developers

**Where is the developer documentation?**
For architecture details, invariants, and instructions on adding tools or agents, see the [Developer Guide](../dev_guide.md). The master checklist of completed and pending items is in [`TASKS.md`](../../TASKS.md).
