import { pool } from '../db/pool';
import { config } from '../config';
import { osrmTable, type Coord } from './osrm';
import { fallbackTravel, haversine } from '../utils/geo';

export interface TravelMatrix {
  n: number;
  distances: Float32Array; // meters, row-major
  durations: Float32Array; // seconds, row-major
}

export async function setJobProgress(
  jobId: string,
  status: string,
  phase: string,
  progress: number,
  message?: string,
): Promise<void> {
  await pool.query(
    `UPDATE jobs SET status = $2, phase = $3, progress = $4,
            message = COALESCE($5, message), updated_at = now()
     WHERE id = $1`,
    [jobId, status, phase, progress, message ?? null],
  );
}

function pairKey(c1: Coord, c2: Coord): string {
  return `${c1.lat.toFixed(5)},${c1.lng.toFixed(5)}|${c2.lat.toFixed(5)},${c2.lng.toFixed(5)}`;
}

async function cachedPair(c1: Coord, c2: Coord): Promise<{ d: number; t: number } | null> {
  const { rows } = await pool.query(
    `SELECT distance_m, duration_s FROM cache_matrix WHERE key = $1`,
    [pairKey(c1, c2)],
  );
  return rows[0] ? { d: rows[0].distance_m, t: rows[0].duration_s } : null;
}

async function storePair(
  c1: Coord,
  c2: Coord,
  d: number,
  t: number,
): Promise<void> {
  await pool.query(
    `INSERT INTO cache_matrix (key, distance_m, duration_s)
     VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE SET distance_m = EXCLUDED.distance_m,
       duration_s = EXCLUDED.duration_s, updated_at = now()`,
    [pairKey(c1, c2), d, t],
  );
}

/**
 * Builds the full travel matrix for a job's stops by chunking OSRM table
 * requests (n origins x n destinations). Unroutable pairs (ferries, gaps in
 * the road network) fall back to a haversine estimate.
 *
 * Progress is reported on the job (matrix phase maps to ~40..70% overall).
 */
export async function buildMatrix(jobId: string, coords: Coord[]): Promise<TravelMatrix> {
  const n = coords.length;
  const distances = new Float32Array(n * n);
  const durations = new Float32Array(n * n);

  const chunk = config.osrm.tableChunkSize;
  const totalBlocks = Math.ceil(n / chunk) ** 2;
  let doneBlocks = 0;

  for (let oi = 0; oi < n; oi += chunk) {
    for (let dj = 0; dj < n; dj += chunk) {
      const origins = coords.slice(oi, oi + chunk);
      const dests = coords.slice(dj, dj + chunk);

      const missing: { i: number; j: number }[] = [];
      for (let i = 0; i < origins.length; i++) {
        for (let j = 0; j < dests.length; j++) {
          const a = oi + i;
          const b = dj + j;
          if (a === b) {
            distances[a * n + b] = 0;
            durations[a * n + b] = 0;
          } else {
            missing.push({ i, j });
          }
        }
      }

      if (missing.length > 0) {
        // Build the destination sub-list used for the missing pairs.
        const destCoords: Coord[] = [];
        const destIndexMap: number[] = [];
        for (const { j } of missing) {
          const b = dj + j;
          if (!destIndexMap.includes(b)) destIndexMap.push(b);
        }
        for (const b of destIndexMap) destCoords.push(coords[b]);

        let table;
        try {
          table = await osrmTable(origins, destCoords);
        } catch (err) {
          // If a whole block fails, fall back to estimates rather than dying.
          // eslint-disable-next-line no-console
          console.error('OSRM table block failed, using estimates:', err);
          for (const { i, j } of missing) {
            const a = oi + i;
            const b = dj + j;
            const d = haversine(coords[a].lat, coords[a].lng, coords[b].lat, coords[b].lng);
            distances[a * n + b] = d;
            durations[a * n + b] = fallbackTravel(d);
          }
          doneBlocks++;
          continue;
        }

        for (const { i, j } of missing) {
          const a = oi + i;
          const b = dj + j;
          const destPos = destIndexMap.indexOf(b);
          const rawD = table.distances[i]?.[destPos];
          const rawT = table.durations[i]?.[destPos];
          let d: number;
          let t: number;
          if (rawD != null && rawT != null && rawD > 0) {
            d = rawD;
            t = rawT;
          } else {
            d = haversine(coords[a].lat, coords[a].lng, coords[b].lat, coords[b].lng);
            t = fallbackTravel(d);
          }
          distances[a * n + b] = d;
          durations[a * n + b] = t;
          void storePair(coords[a], coords[b], Math.round(d), Math.round(t));
        }
      }

      doneBlocks++;
      const pctOverall = Math.round(40 + (doneBlocks / totalBlocks) * 30);
      await setJobProgress(jobId, 'matrix', 'Building distance matrix', pctOverall);
    }
  }

  return { n, distances, durations };
}

export async function storeMatrix(
  jobId: string,
  matrix: TravelMatrix,
): Promise<void> {
  const bufD = Buffer.from(matrix.distances.buffer);
  const bufT = Buffer.from(matrix.durations.buffer);
  await pool.query(
    `DELETE FROM matrices WHERE job_id = $1`,
    [jobId],
  );
  await pool.query(
    `INSERT INTO matrices (job_id, n, distances, durations) VALUES ($1, $2, $3, $4)`,
    [jobId, matrix.n, bufD, bufT],
  );
}
