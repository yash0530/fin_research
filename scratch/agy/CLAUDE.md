# scratch/agy/ — agy delegation batch specs

One spec per agy (Antigravity CLI) batch, same contract as `scratch/kiro/`: intent,
exact deliverables, hard constraints with a do-NOT-touch wall, gates, and a
`## Result` appended on completion. agy is the volume lane (model `opus` = Claude
Opus 4.6 Thinking; fall back to `flash` = Gemini 3.5 Flash on usage limits); specs
here should be well-referenced and mechanical. Invoke via
`bash ~/.claude/plugins/agy/scripts/agy-run.sh ask --model <alias> "<pointer>"`.
Known failure mode: CLI response timeout on long single generations — split large
batches; a timed-out run leaves partial files on disk (inventory before relaunch).
