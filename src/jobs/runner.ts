// Job runner. The "jobs never crash" invariant: a job's failure is caught and
// recorded, never thrown into the scheduler. A chain runs its steps in order and
// a failed step never aborts the rest (failures are counted). Injected `record`
// makes it testable and lets the app persist JobRun rows.

export type JobResult = { job: string; ok: boolean; detail: string };
export type JobFn = () => Promise<string>; // resolves to a detail string on success

export async function runJob(name: string, fn: JobFn, record?: (r: JobResult) => void): Promise<JobResult> {
  let result: JobResult;
  try {
    result = { job: name, ok: true, detail: await fn() };
  } catch (e) {
    result = { job: name, ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
  record?.(result);
  return result;
}

export type ChainStep = { name: string; fn: JobFn };
export type ChainSummary = { results: JobResult[]; ok: number; failed: number };

/** Run steps in order; a failed step is recorded and the chain continues. */
export async function runChain(steps: ChainStep[], record?: (r: JobResult) => void): Promise<ChainSummary> {
  const results: JobResult[] = [];
  for (const step of steps) {
    results.push(await runJob(step.name, step.fn, record));
  }
  return {
    results,
    ok: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
  };
}
