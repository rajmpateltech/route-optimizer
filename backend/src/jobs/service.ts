import { pool } from '../db/pool';
import type { JobProgress, JobStatus, StopRow } from '../types';
import { geocodeAddress } from '../geocode';
import { buildMatrix, setJobProgress, storeMatrix } from '../matrix/builder';
import { optimizeOrder } from '../optimize/client';
import { assembleRoute } from '../route/assembler';

const statuses = new Set<string>([
  'geocoding',
  'geocoded',
  'matrix',
  'optimizing',
  'routing',
]);

export async function loadJobCountry(jobId: string): Promise<string> {
  const { rows } = await pool.query('SELECT country FROM jobs WHERE id = $1', [
    jobId,
  ]);
  return rows[0]?.country ?? '';
}

/**
 * Atomic claim: only one backend instance processes a job (status must still
 * be 'uploaded' to transition to 'geocoding').
 */
export async function startJob(jobId: string): Promise<boolean> {
  const claimed = await pool.query(
    `UPDATE jobs SET status = 'geocoding', phase = 'Geocoding addresses',
            updated_at = now()
     WHERE id = $1 AND status = 'uploaded' RETURNING id`,
    [jobId],
  );
  if (!claimed.rowCount) return false;

  // Run pipeline detached so the HTTP handler can return immediately.
  void runPipeline(jobId).catch(async (err) => {
    // eslint-disable-next-line no-console
    console.error(`Job ${jobId} failed:`, err);
    await pool.query(
      `UPDATE jobs SET status = 'failed', error = $2, updated_at = now()
       WHERE id = $1`,
      [jobId, err instanceof Error ? err.message : String(err)],
    );
  });
  return true;
}

async function runPipeline(jobId: string): Promise<void> {
  // ---- 1. Geocode (0..40) ----
  const country = await loadJobCountry(jobId);
  const stops = await loadStops(jobId);
  const pending = stops.filter((s) => s.geocode_status !== 'ok' && s.geocode_status !== 'manual');
  if (pending.length > 0) {
    let done = 0;
    for (const stop of pending) {
      try {
        const result = await geocodeAddress(stop.address, country);
        if (result) {
          await pool.query(
            `UPDATE stops SET lat = $2, lng = $3, geocode_status = 'ok',
                    geocode_confidence = $4 WHERE id = $1`,
            [stop.id, result.lat, result.lng, result.confidence ?? null],
          );
        } else {
          await pool.query(
            `UPDATE stops SET geocode_status = 'not_found' WHERE id = $1`,
            [stop.id],
          );
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`Geocode failed for ${stop.address}:`, err);
        await pool.query(
          `UPDATE stops SET geocode_status = 'failed' WHERE id = $1`,
          [stop.id],
        );
      }
      done++;
      setJobProgress(jobId, 'geocoding', 'Geocoding addresses', Math.round((done / pending.length) * 40)).catch(() => undefined);
    }
  }

  const finalized = await loadStops(jobId);
  const withCoords = finalized.filter((s) => s.lat != null && s.lng != null);
  const bad = finalized.filter((s) => s.lat == null);
  if (bad.length > 0) {
    throw new Error(
      `Could not geocode ${bad.length} stop(s): ${bad
        .slice(0, 3)
        .map((s) => s.address)
        .join('; ')}${bad.length > 3 ? '…' : ''}. Fix the address and re-run.`,
    );
  }

  await setJobProgress(jobId, 'geocoded', 'Addresses resolved', 40);

  // ---- 2. Distance matrix (40..70) ----
  const coords = withCoords.map((s) => ({ lat: s.lat!, lng: s.lng! }));
  const matrix = await buildMatrix(jobId, coords);
  await storeMatrix(jobId, matrix);
  await setJobProgress(jobId, 'optimizing', 'Solving route order', 70);

  // ---- 3. Optimize (70..85) ----
  const solve = await optimizeOrder(jobId, matrix.durations, matrix.n);
  await setJobProgress(jobId, 'routing', 'Building route geometry', 85);

  // ---- 4. Assemble route + turn-by-turn (85..100) ----
  const ordered = solve.ordered.map((idx) => withCoords[idx]);
  const assembled = await assembleRoute(ordered);

  const orderedStops = solve.ordered.map((idx, order) => ({
    stopId: withCoords[idx].id,
    order,
  }));

  await pool.query(
    `INSERT INTO results (job_id, ordered_stops, geometry, steps, legs,
                          total_distance_km, total_duration_min)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      jobId,
      JSON.stringify(orderedStops),
      JSON.stringify(assembled.geometry),
      JSON.stringify(assembled.steps),
      JSON.stringify(assembled.legs),
      assembled.totalDistanceKm,
      assembled.totalDurationMin,
    ],
  );

  await pool.query(
    `UPDATE jobs SET status = 'done', phase = 'Complete', progress = 100,
            message = 'Route ready', total_distance_km = $2,
            total_duration_min = $3, updated_at = now()
     WHERE id = $1`,
    [jobId, assembled.totalDistanceKm, assembled.totalDurationMin],
  );
}

async function loadStops(jobId: string): Promise<StopRow[]> {
  const { rows } = await pool.query(
    `SELECT id, job_id, input_index, label, address, lat, lng,
            geocode_status, geocode_confidence
     FROM stops WHERE job_id = $1 ORDER BY input_index`,
    [jobId],
  );
  return rows;
}

export async function getJobProgress(jobId: string): Promise<JobProgress | null> {
  const { rows } = await pool.query(
    `SELECT status, phase, progress, message, error,
            total_distance_km, total_duration_min
     FROM jobs WHERE id = $1`,
    [jobId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    status: r.status,
    phase: r.phase,
    progress: r.progress,
    message: r.message,
    error: r.error,
    total_distance_km: r.total_distance_km,
    total_duration_min: r.total_duration_min,
  };
}

export function isActiveStatus(status: string): boolean {
  return statuses.has(status);
}
