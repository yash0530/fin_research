# web/app/story/[id]/ — Story page (dynamic)

`page.tsx` (async `params` per Next 15) renders `demoStory()`: hero + verdict badge,
stat tape, cycle strip, deterministic bear/base/bull scenario prices (`scenarioPrices`),
the client `ScenarioEstimator`, callouts, and footnotes. Data is frozen at build; a live
quote is shown alongside `priceAtBuild`.
