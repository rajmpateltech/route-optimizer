import { config } from '../config';
import { solveTSP } from './tsp';

export interface SolveResult {
  ordered: number[]; // indices into the stops array (row-major order)
  method: 'node' | 'ortools';
}

/**
 * Delegates to the OR-Tools microservice for everything above the in-process
 * threshold; solves tiny problems locally for instant responses.
 *
 * Stop index 0 is always the route start: either the user-provided start
 * address (inserted as stop #0) or the user's first listed stop.
 */
export async function optimizeOrder(
  jobId: string,
  durations: Float32Array,
  n: number,
): Promise<SolveResult> {
  if (n < 100) {
    return { ordered: solveTSP(durations, n, 0), method: 'node' };
  }

  const url = `${config.optimizer.baseUrl}/solve`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20 * 60 * 1000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ job_id: jobId, start_index: 0 }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`optimizer failed: HTTP ${res.status} ${text}`);
    }
    const json = (await res.json()) as { ordered: number[] };
    return { ordered: json.ordered, method: 'ortools' };
  } finally {
    clearTimeout(timer);
  }
}
