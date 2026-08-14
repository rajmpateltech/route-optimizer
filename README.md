# RouteOptimizer

A production-ready, fully **free & self-hosted** web application that accepts a
large number of stops (350+ today, architected toward **1,000–5,000**), computes
realistic driving times, finds an optimized visit order (TSP), and renders one
route across all stops with turn-by-turn directions.

![Stack](https://img.shields.io/badge/stack-Node%2022%20%2B%20FastAPI%20%2B%20React%20%2B%20OSRM-1d4ed8)

## Features

- **Paste or CSV upload** of hundreds of addresses (lat/lng override supported).
- **Free geocoding** via Nominatim or Photon, with a global cache (repeat
  addresses across users/jobs never hit the provider again) and polite
  1 req/s throttling.
- **Realistic driving matrix** from self-hosted **OSRM** (distance + duration
  per pair), chunked, cached, resumable, with haversine fallback for
  unroutable pairs.
- **Optimization** with **Google OR-Tools**:
  - ≤1,500 stops: full matrix, Guided Local Search.
  - >1,500 stops: hierarchical k-means decomposition + junction refinement,
    bounded memory and runtime up to ~5,000 stops.
  - <100 stops: instant in-process nearest-neighbour + 2-opt.
- **One route** across all stops: drawn polyline, numbered markers, live
  progress, and **turn-by-turn directions** assembled from OSRM route legs.
- **Both metrics** shown: total distance (km) and driving time (min).
- **Exports**: CSV, GPX, KML, JSON.
- **Multi-user**: JWT auth, per-user jobs and quotas, rate limiting.

## Architecture

```
Browser (React SPA, Leaflet)
   │
   ▼
nginx ──► backend (Node 22 / Express / TypeScript)
              │  ├─ geocoder (Nominatim / Photon)  ──► cache (Postgres)
              │  ├─ matrix builder (OSRM Table)    ──► matrices (bytea)
              │  ├─ optimizer client               ──► optimizer (FastAPI + OR-Tools)
              │  └─ route assembler (OSRM Route)   ──► results
              │
   ┌──────────┴───────────────┐
PostgreSQL                 Redis (rate limits)
   ▲                           
optimizer (Python / OR-Tools) reads matrices from Postgres directly
```

## Quick start (Docker)

```bash
cp .env.example .env
# edit JWT_SECRET in .env
docker compose up -d --build
# open http://localhost
```

Default `OSRM_MODE=hosted` uses the public OSRM demo server — fine for trying
it out and for small jobs. For production / big jobs, self-host OSRM:

```bash
# download + build routing data (e.g. europe; or a country extract)
./infra/osrm/setup-osrm.sh europe
docker compose --profile osrm up -d
# then in .env:  OSRM_MODE=selfhosted  OSRM_URL=http://localhost:5000
# and restart:   docker compose up -d --build backend web
```

Recommended `.env` for large deployments (self-hosted OSRM):

```
OSRM_MODE=selfhosted
OSRM_URL=http://osrm:5000
OSRM_TABLE_CHUNK=500
OSRM_ROUTE_WAYPOINTS=90
OSRM_THROTTLE_MS=0
```

## Local development (no Docker)

Requires: Node 22, Python 3.12, a running Postgres.

```bash
# 1. Postgres (example)
createdb routeoptimizer

# 2. Backend
cd backend && npm install && npm run dev          # :8080 (runs migrations on boot)

# 3. Optimizer
cd optimizer
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --port 8090                   # :8090

# 4. Frontend (dev server proxies /api -> :8080)
cd frontend && npm install && npm run dev          # :5173
```

## Environment variables

See [.env.example](.env.example). Key ones:

| Variable | Default | Purpose |
| --- | --- | --- |
| `JWT_SECRET` | (dev) | Secret for auth tokens — **change in production** |
| `DATABASE_URL` | local | Postgres connection string |
| `REDIS_URL` | (empty) | Redis for cross-instance rate limiting |
| `OSRM_MODE` | `hosted` | `hosted` (public demo) or `selfhosted` |
| `OSRM_URL` | project-osrm.org | OSRM base URL |
| `OSRM_TABLE_CHUNK` | `100` | Matrix table request size (raise to 500+ self-hosted) |
| `GEOCODER` | `nominatim` | `nominatim` / `photon` / `manual` |
| `MAX_STOPS_PER_JOB` | `5000` | Hard cap per job |

## Scale guidance

| Stops | Approach | Notes |
| --- | --- | --- |
| 2 – 100 | In-process NN + 2-opt | Instant |
| 100 – 1,500 | OR-Tools full matrix | Seconds to ~1 min |
| 1,500 – 5,000 | OR-Tools k-means + junction 2-opt | Minutes; use self-hosted OSRM |

For 5,000 stops the full duration matrix is ~100 MB (stored as float32 bytea);
build time is dominated by OSRM table calls — with `OSRM_TABLE_CHUNK=500` a
5,000-stop matrix is ~100 chunked requests.

## Tests

```bash
cd backend && npm test
cd optimizer && python -m pytest -q
cd frontend && npm run build   # typecheck + bundle
```

### End-to-end smoke tests (needs a running stack)

```bash
# after starting backend (:8080) + optimizer (:8090) + Postgres
node scripts/e2e/e2e-smoke.mjs     # 4 real addresses through the full pipeline
node scripts/e2e/e2e-ortools.mjs   # 120-stop job through OR-Tools
```

## Docs

- [docs/architecture.md](docs/architecture.md) — detailed design decisions
- [docs/api.md](docs/api.md) — HTTP API reference
- [docs/osm-setup.md](docs/osm-setup.md) — OSRM data builds and sizing

## License

Apache-2.0. Routing data © OpenStreetMap contributors (ODbL). OSRM, OR-Tools,
Nominatim, Photon, and OSM tiles are all free / self-hostable.
