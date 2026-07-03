# scratch/kiro/ — delegation batch specs

One spec file per kiro batch (`<name>.md`): intent, donor sources (read-only), exact
deliverables, hard constraints, gates, and a `## Result` section appended by kiro on
completion. The spec IS the contract — a batch may only touch files on its
deliverables list, must leave `npm run verify` green, and never commits (the CEO
session reviews the diff against the spec and commits).

Invocation pattern (kiro-cli needs a PTY; see EXEC_PLAN.md ops lessons):
`script -q /dev/null kiro-cli chat --no-interactive --trust-all-tools --model claude-opus-4.8 --effort <low|medium|high> "<pointer to spec>"`
