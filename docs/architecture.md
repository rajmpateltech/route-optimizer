# Architecture

## Pipeline

Every job goes through the same lifecycle; the backend orchestrates it and
writes progress to the `jobs` row, which the UI polls via `GET /api/jobs/:id`.

```
uploaded ──▶ geocoding ──▶ geocoded ──▶ matrix ──▶ optimizing ──▶ routing ──▶ done
   (0%)       (1..40%)      (40%)       (40..70)   (70..85)      (85..100)    (100%)
```

1. **Ingest** — `POST /api/jobs` (JSON) or `POST /api/jobs/upload` (CSV).
   Stops are validated (2..`MAX_STOPS_PER_JOB`), deduplicated client-side, and
   stored in `stops` with `input_index`.
2. **Geocoding** — a worker geocodes each pending stop. A global
   `cache_geocode` table (keyed by normalized address) means repeated
   addresses across any user/job are instant. All external requests flow
   through a serial queue that enforces `GEOCODE_DELAY_MS` (Nominatim policy:
   1 req/s). Stops that already carry lat/lng are marked `manual` and skipped.
3. **Matrix** — OSRM Table requests in `OSRM_TABLE_CHUNK`-sized blocks
   (default 100; raise to 500+ for self-hosted). Unroutable pairs fall back to
   haversine × ~40 km/h. The full N×N duration + distance matrix is stored as
   little-endian float32 bytea in `matrices`, so a 5,000-stop matrix is ~200 MB
   but serialized compactly. Per-pair results are cached in `cache_matrix` for
   cross-job reuse.
4. **Optimization** — for n < 100 the backend solves instantly in-process
   (nearest-neighbour from every start + 2-opt + Or-opt). Otherwise it calls
   the Python service `POST /optimizer/solve`, which reads the matrix directly
   from Postgres, runs OR-Tools, and reports progress back by updating the
   `jobs` row (only while status is `optimizing`).
5. **Routing** — the optimized order is split into legs of at most
   `OSRM_ROUTE_WAYPOINTS` (90 default) and each leg is routed with
   `steps=true`. Leg geometries are concatenated into one polyline; all
   step-by-step maneuvers are flattened into a single `steps` array with
   synthetic `arrive`/`depart` markers at each stop. Totals = sum of leg
   distance/duration.

## Scale strategy (1,500 – 5,000 stops)

A full-matrix OR-Tools solve is feasible to ~1,500 stops. Beyond that the
optimizer uses a hierarchical decomposition:

1. **k-means** clusters stops into groups of ~250 (so any per-cluster matrix is
   `250×250`).
2. The **cluster order** is solved as a small TSP over centroids (haversine).
3. Each cluster is solved as an **open-path TSP** with a forced entry point
   (nearest node to the previous cluster's exit), using the real duration
   matrix slice.
4. A **windowed 2-opt** pass around each cluster junction cleans up the seams.

This keeps memory bounded (never the full 25M-entry matrix) and runtime in
minutes for 5,000 stops. The result is a good heuristic solution — for
delivery/sales visits this is appropriate; exact optimality is impractical at
this scale (NP-hard).

## Data flow for matrices

```
backend ── OSRM Table (chunked) ──▶ matrices(job_id, n, distances bytea, durations bytea)
                                           │
optimizer (FastAPI) ── psycopg ──────────▶ reads bytea → numpy float32
      │
      └─ OR-Tools → ordered indices ──▶ HTTP response to backend
```

## Concurrency & correctness

- **Atomic job claim**: `UPDATE jobs SET status='geocoding' WHERE status='uploaded'`
  guarantees a job is only processed once even with multiple backend replicas.
- **Progress races**: the optimizer only writes progress while
  `status='optimizing'`, so it can never clobber the final `done` state.
- **Rate limiting**: Redis-backed fixed windows per user/IP when `REDIS_URL` is
  set, in-memory fallback otherwise.
- **Geocoding failures**: stops that fail geocoding are marked `failed`;
  the job aborts with a clear message listing the first offending addresses.

## Security notes

- Auth via bcrypt + JWT (HS256). All `/api/jobs*` endpoints require auth.
- Input validation with Zod (lengths, ranges, counts).
- OSRM and Postgres are never exposed publicly in the compose file
  (internal network); only nginx (80) is published.
- OSM tile usage: fine for typical internal deployments; large public traffic
  should point the tile URL at a self-hosted tile server.
