# Dossier transcript review — findings for M3-C (CEO analysis, month 3)

Reviewed the 4 real dossiers (MU/NVDA/AVGO/TSM). What the eval + prompt iteration
should target:

1. **QoE runs on shallow data (FIXABLE NOW — highest-value).** NVDA's bear cited:
   "The accrual proxy relies on an FCF substitute with missing canonical inputs,
   rendering the [earnings-quality] read unreliable." That's because these dossiers
   ran BEFORE M2's EDGAR-facts backfill (fundamentals were ~7 quarters, missing CFO/
   capex canon). Now there are 35k fundamental rows w/ 20y history. **Action: re-run a
   dossier and confirm QoE stops complaining — a concrete, measurable data→quality
   win.** The eval's citation/quality check should flag "missing inputs" admissions.

2. **Persistent bearishness (4/4 non-BUY: 2 AVOID, 2 HOLD) in a hot sector.** Could be
   discipline OR over-caution. The eval must NOT reward BUYs — it should test that the
   critique revises *when the evidence warrants* and holds firm otherwise. Guard
   against a reflexive "downgrade to HOLD" critique (NVDA + MU both got the same
   "value trap, downgrade" critique move — check it's reasoning, not a template).

3. **Catalyst starvation as a bear point.** "Zero upcoming catalysts in 45 days" was
   used as a NVDA bear negative. Check the catalysts tool window/coverage — a thin
   feed shouldn't read as a bear signal. Possibly widen or annotate "no data" vs
   "no catalysts".

4. **Tool coverage is strong** (10 distinct tools, 0 errors on NVDA; citations dense,
   every bull/bear point carried evidence_refs). The debate MACHINERY works; the gap
   is INPUT DEPTH (#1) and calibration of tone (#2).

## Eval design implications (for the M3-C agy spec)
- Golden FakeProvider debates asserting: every bull/bear point has ≥1 evidence_ref;
  judge emits ≥3 falsifiability conditions; critique's revise-decision matches a
  scripted evidence scenario (revise when a bear point is unaddressed; hold when
  addressed) — i.e. test the critique is responsive, not reflexive.
- A "quality smell" detector over real transcripts: flag verdicts whose evidence
  admits "missing/unavailable/substitute" inputs (data-gap signal) so we can see
  input-depth improve run-over-run.
- promptVersion bump only after re-running ≥3 dossiers on deep fundamentals and
  showing the QoE data-gap admissions drop.
