# web/lib/ — UI fixtures

- `demo.ts` — fixture inputs (`demoSynthInput`, `demoUniverse`, `demoCandidates`,
  `demoStory`, `demoDossiers`) that pages pass **through the real engine functions**.
  This makes the demo deterministic and proves the integration; it is replaced by live
  Prisma reads in the app-layer wiring tracked in `../../TASKS.md`.
