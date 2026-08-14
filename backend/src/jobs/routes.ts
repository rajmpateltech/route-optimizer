import { Router } from 'express';
import multer from 'multer';
import { parse as parseCsv } from 'csv-parse/sync';
import { z } from 'zod';
import { pool } from '../db/pool';
import { config } from '../config';
import { asyncHandler } from '../utils/http';
import { requireAuth } from '../middleware/auth';
import { rateLimit } from '../middleware/ratelimit';
import { assertValidStops } from '../utils/geo';
import type { StopInput } from '../types';
import { startJob, getJobProgress } from '../jobs/service';
import { toCsv, toGpx, toKml } from '../export/formats';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.limits.maxFileBytes },
});

const stopSchema = z.object({
  address: z.string().min(1).max(500),
  label: z.string().max(200).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(200).default('Untitled route'),
  // ISO 3166-1 alpha-2 country code used as the geocoding region bias for all
  // stops (e.g. "ca"). Empty = global / auto-detect from each address.
  country: z.string().max(2).optional().default(''),
  // Optional start/origin address. When blank, the first stop is used as the
  // route start. When provided, it is added as stop #0 and the route begins
  // there.
  start_address: z.string().max(500).optional().default(''),
  stops: z.array(stopSchema).min(2).max(config.limits.maxStopsPerJob),
});

function parseCsvStops(text: string): StopInput[] {
  const records = parseCsv(text, { skip_empty_lines: true, relax_column_count: true }) as string[][];
  const header = records[0] ?? [];
  const lower = header.map((h) => h.trim().toLowerCase());
  const addrCol = lower.findIndex((h) =>
    ['address', 'street', 'adresse', 'location', 'stop', 'addr'].includes(h),
  );
  const labelCol = lower.findIndex((h) => ['label', 'name', 'nom', 'stopname'].includes(h));
  const latCol = lower.findIndex((h) => ['lat', 'latitude'].includes(h));
  const lngCol = lower.findIndex((h) => ['lng', 'lon', 'long', 'longitude'].includes(h));

  const rows = addrCol >= 0 ? records.slice(1) : records;
  const stops: StopInput[] = [];
  for (const row of rows) {
    if (!row.length) continue;
    const address = addrCol >= 0 ? row[addrCol] : row[0];
    if (!address?.trim()) continue;
    const lat = latCol >= 0 && row[latCol] ? Number(row[latCol]) : undefined;
    const lng = lngCol >= 0 && row[lngCol] ? Number(row[lngCol]) : undefined;
    stops.push({
      address: String(address).trim(),
      label: labelCol >= 0 && row[labelCol] ? String(row[labelCol]).trim() : undefined,
      lat: Number.isFinite(lat) ? lat : undefined,
      lng: Number.isFinite(lng) ? lng : undefined,
    });
  }
  return stops;
}

router.use(requireAuth());

// Create a job from raw stop objects (JSON).
router.post(
  '/',
  rateLimit({ limit: 30, windowSec: 900 }),
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const jobId = await createJob(
      req.user.id,
      body.name,
      body.stops,
      body.country,
      body.start_address,
    );
    await startJob(jobId);
    res.status(201).json({ id: jobId });
  }),
);

// Create a job from a CSV upload.
router.post(
  '/upload',
  rateLimit({ limit: 30, windowSec: 900 }),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new Error('Missing file field');
    const name = req.body?.name?.trim() || req.file.originalname.replace(/\.[^.]+$/, '');
    const country = String(req.body?.country ?? '').trim().toLowerCase().slice(0, 2);
    const startAddress = String(req.body?.start_address ?? '').trim();
    const stops = parseCsvStops(req.file.buffer.toString('utf8'));
    assertValidStops(stops, config.limits.maxStopsPerJob);
    const jobId = await createJob(req.user.id, name, stops, country, startAddress);
    await startJob(jobId);
    res.status(201).json({ id: jobId });
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, name, country, start_address, status, phase, progress, message, error, total_stops,
              total_distance_km, total_duration_min, created_at, updated_at
       FROM jobs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200`,
      [req.user.id],
    );
    res.json({ jobs: rows });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const job = await getOwnedJob(req.user.id, req.params.id);
    const { rows } = await pool.query(
      `SELECT id, input_index, label, address, lat, lng, geocode_status,
              geocode_confidence
       FROM stops WHERE job_id = $1 ORDER BY input_index`,
      [job.id],
    );
    res.json({ job, stops: rows });
  }),
);

// Live progress stream (Server-Sent Events).
router.get(
  '/:id/events',
  asyncHandler(async (req, res) => {
    const job = await getOwnedJob(req.user.id, req.params.id);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 2000\n\n');

    const send = async () => {
      const progress = await getJobProgress(job.id);
      if (!progress) return;
      res.write(`data: ${JSON.stringify(progress)}\n\n`);
      if (!['geocoding', 'geocoded', 'matrix', 'optimizing', 'routing'].includes(progress.status)) {
        clearInterval(timer);
        res.end();
      }
    };
    const timer = setInterval(() => {
      send().catch(() => {
        clearInterval(timer);
        res.end();
      });
    }, 1500);
    void send();
    req.on('close', () => {
      clearInterval(timer);
    });
  }),
);

router.get(
  '/:id/result',
  asyncHandler(async (req, res) => {
    const job = await getOwnedJob(req.user.id, req.params.id);
    if (job.status !== 'done') {
      res.json({ status: job.status, result: null });
      return;
    }
    const { rows } = await pool.query(
      `SELECT ordered_stops, geometry, steps, legs, total_distance_km,
              total_duration_min
       FROM results WHERE job_id = $1`,
      [job.id],
    );
    const { rows: stopRows } = await pool.query(
      `SELECT id, input_index, label, address, lat, lng, geocode_status
       FROM stops WHERE job_id = $1`,
      [job.id],
    );
    res.json({
      status: job.status,
      result: {
        ...rows[0],
        stops: stopRows,
        total_distance_km: rows[0].total_distance_km,
        total_duration_min: rows[0].total_duration_min,
      },
    });
  }),
);

// Paginated turn-by-turn steps (avoids shipping huge payloads for big jobs).
router.get(
  '/:id/steps',
  asyncHandler(async (req, res) => {
    const job = await getOwnedJob(req.user.id, req.params.id);
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
    const { rows } = await pool.query(
      `SELECT steps, legs, total_distance_km, total_duration_min FROM results WHERE job_id = $1`,
      [job.id],
    );
    if (!rows[0]) {
      res.json({ steps: [], legs: [], total: 0, offset, limit });
      return;
    }
    const steps = rows[0].steps as unknown[];
    res.json({
      steps: steps.slice(offset, offset + limit),
      legs: rows[0].legs,
      total: steps.length,
      total_distance_km: rows[0].total_distance_km,
      total_duration_min: rows[0].total_duration_min,
      offset,
      limit,
    });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await getOwnedJob(req.user.id, req.params.id);
    await pool.query('DELETE FROM jobs WHERE id = $1 AND user_id = $2', [
      req.params.id,
      req.user.id,
    ]);
    res.status(204).end();
  }),
);

// Exports: csv | gpx | kml | json
router.get(
  '/:id/export/:format',
  asyncHandler(async (req, res) => {
    const job = await getOwnedJob(req.user.id, req.params.id);
    const format = req.params.format;
    if (job.status !== 'done') throw new Error('Job has no result yet');
    const { rows } = await pool.query(
      `SELECT ordered_stops, geometry, steps, legs, total_distance_km, total_duration_min
       FROM results WHERE job_id = $1`,
      [job.id],
    );
    const result = rows[0];
    const ordered = (result.ordered_stops as { stopId: string; order: number }[])
      .sort((a, b) => a.order - b.order);
    const { rows: stopRows } = await pool.query(
      `SELECT id, input_index, label, address, lat, lng FROM stops WHERE job_id = $1`,
      [job.id],
    );
    const stopsById = new Map(stopRows.map((s: { id: string }) => [s.id, s]));
    const orderedStops = ordered.map((o) => stopsById.get(o.stopId)).filter(Boolean);

    const filename = `${job.name.replace(/[^a-z0-9]+/gi, '-')}.${format}`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    switch (format) {
      case 'csv': {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.send(toCsv(orderedStops as never[], result as never));
        return;
      }
      case 'gpx': {
        res.setHeader('Content-Type', 'application/gpx+xml');
        res.send(toGpx(orderedStops as never[], result.geometry as never));
        return;
      }
      case 'kml': {
        res.setHeader('Content-Type', 'application/vnd.google-earth.kml+xml');
        res.send(toKml(orderedStops as never[], result.geometry as never));
        return;
      }
      case 'json': {
        res.setHeader('Content-Type', 'application/json');
        res.send(result);
        return;
      }
      default:
        throw new Error('Unsupported format');
    }
  }),
);

async function createJob(
  userId: string,
  name: string,
  stops: StopInput[],
  country: string = '',
  startAddress: string = '',
): Promise<string> {
  const { rows: count } = await pool.query(
    'SELECT count(*)::int AS n FROM jobs WHERE user_id = $1',
    [userId],
  );
  if (count[0].n >= config.limits.maxJobsPerUser) {
    throw new Error('Job limit reached for this account');
  }

  const hasStart = startAddress.trim().length > 0;
  const totalStops = stops.length + (hasStart ? 1 : 0);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO jobs (user_id, name, country, start_address, total_stops)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [userId, name, country.toLowerCase(), startAddress.trim(), totalStops],
    );
    const jobId = rows[0].id as string;

    // The start address (when provided) becomes stop #0 so the optimizer can
    // always pin the route start to index 0. When blank, the user's first stop
    // naturally occupies index 0 and is the start.
    let index = 0;
    if (hasStart) {
      await client.query(
        `INSERT INTO stops (job_id, input_index, label, address, lat, lng, geocode_status)
         VALUES ($1, 0, 'Start', $2, NULL, NULL, 'pending')`,
        [jobId, startAddress.trim()],
      );
      index = 1;
    }
    for (let i = 0; i < stops.length; i++) {
      const s = stops[i];
      const hasCoords = s.lat != null && s.lng != null;
      await client.query(
        `INSERT INTO stops (job_id, input_index, label, address, lat, lng, geocode_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          jobId,
          index + i,
          s.label ?? null,
          s.address,
          hasCoords ? s.lat : null,
          hasCoords ? s.lng : null,
          hasCoords ? 'manual' : 'pending',
        ],
      );
    }
    await client.query('COMMIT');
    return jobId;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getOwnedJob(userId: string, jobId: string) {
  const { rows } = await pool.query(
    `SELECT id, name, country, start_address, status, phase, progress, message, error, total_stops,
            total_distance_km, total_duration_min, created_at, updated_at
     FROM jobs WHERE id = $1 AND user_id = $2`,
    [jobId, userId],
  );
  if (!rows[0]) throw new Error('Job not found');
  return rows[0];
}

export const jobRoutes = router;
