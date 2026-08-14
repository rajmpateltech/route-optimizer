# RouteOptimizer — Runbook

Step-by-step guide to run the application, run the tests, and troubleshoot.

---

## 0. What the stack is

| Service | Port | What it does |
| --- | --- | --- |
| `postgres` | 5432 | Stores users, jobs, stops, matrices, results, caches |
| `redis` | 6379 | Cross-instance rate limiting (optional) |
| `optimizer` | 8090 | OR-Tools TSP optimization (Python / FastAPI) |
| `backend` | 8080 | REST API + pipeline (Node / Express / TypeScript) |
| `web` | 80 | nginx: serves the React app, proxies `/api` to backend |
| `osrm` | 5000 | Self-hosted router (optional profile; free public demo used by default) |

---

## 1. Prerequisites

- **Node.js 20+** (tested with 22)
- **Python 3.10–3.14** (tested with 3.12 and 3.14)
- **Docker + Docker Compose** (recommended path) **OR** a local **PostgreSQL 16**
- Internet access for: OSM tiles (map), geocoding (Nominatim), and the public OSRM
  demo server (default mode)

---

## 2. Option A — Docker Compose (recommended for production)

```bash
# 1) Clone/copy the project, then configure
cd MapOptimizer
cp .env.example .env

# 2) Edit .env — CHANGE THE SECRET
#    JWT_SECRET=generate-a-long-random-string

# 3) Start everything (builds images on first run)
docker compose up -d --build

# 4) Open the app
open http://localhost
```

Verify:

```bash
curl http://localhost/health        # -> {"ok":true,...}
docker compose ps                   # all services "running"/"healthy"
```

### Self-host OSRM for large jobs (optional, recommended for 1,000–5,000 stops)

```bash
# download + build routing data (country/continent extract, e.g. "europe")
./infra/osrm/setup-osrm.sh europe

docker compose --profile osrm up -d          # start the router on :5000

# edit .env and restart:
#   OSRM_MODE=selfhosted
#   OSRM_URL=http://localhost:5000
#   OSRM_TABLE_CHUNK=500
#   OSRM_THROTTLE_MS=0
docker compose up -d --build backend web
```

### Stop / update

```bash
docker compose down                # stop
docker compose down -v             # stop + wipe the database
docker compose up -d --build       # rebuild after code changes
```

---

## 3. Option B — Local development (no Docker)

Everything below is what is **currently running** on this machine.

### B1. PostgreSQL

```bash
# macOS / Homebrew
brew install postgresql@16
# run it (pick ONE):
brew services start postgresql@16
#   or, if brew services fails:
/opt/homebrew/opt/postgresql@16/bin/postgres -D /opt/homebrew/var/postgresql@16 -p 5432 &

# create the database (adjust user to your OS user, e.g. `devine`)
createdb routeoptimizer
```

### B2. Optimizer service (Python)

```bash
cd optimizer
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# start it (note the DATABASE_URL for your local setup)
DATABASE_URL="postgres://<your-user>@localhost:5432/routeoptimizer" \
  uvicorn app.main:app --host 127.0.0.1 --port 8090
```

Verify: `curl http://localhost:8090/health` → `{"ok":true}`

### B3. Backend API (Node)

```bash
cd backend
npm install

# start with your local DB (migrations run automatically on boot)
DATABASE_URL="postgres://<your-user>@localhost:5432/routeoptimizer" \
OSRM_MODE=hosted \
OSRM_URL=https://router.project-osrm.org \
OPTIMIZER_URL=http://localhost:8090 \
JWT_SECRET=local-dev-secret \
npm run dev            # or: npm run build && node dist/server.js
```

Verify: `curl http://localhost:8080/health` → `{"ok":true,...}`

### B4. Frontend (React dev server)

```bash
cd frontend
npm install
npm run dev          # -> http://localhost:5173 (proxies /api to :8080)
```

> Tip: after `npm run build` in `frontend/`, the backend also serves the SPA at
> `http://localhost:8080`.

---

## 4. Using the app (end to end)

1. Open the app (`http://localhost:8080` if backend-served, or `http://localhost:5173` in dev).
2. Create an account → sign in.
3. Give the route a name, then either:
   - **Paste** addresses (one per line) and click **Parse addresses**, or
   - **Upload a CSV** (`address` column; optional `label`, `lat`, `lng` columns).
4. Click **Optimize route**.
5. Watch live progress: *Geocoding → Building distance matrix → Solving route order → Building route geometry*.
6. When done you get:
   - Stats (total km + total time, both metrics)
   - Interactive map with numbered stops and the drawn route line
   - Optimized stop-order table
   - Turn-by-turn directions (load more as needed)
   - Export buttons: **CSV / GPX / KML / JSON**

---

## 5. Running the tests

### Backend — 14 unit tests (Vitest)

```bash
cd backend
npm install
npm test                # run all tests
npm run typecheck       # TypeScript check
npm run build           # compile + copy schema.sql to dist
```

Coverage:
- `tsp.test.ts` — in-process TSP solver (straight-line optimum, asymmetric matrix, single node)
- `geo.test.ts` — address normalization, haversine, travel-time fallback, input validation, percentage math
- `export.test.ts` — CSV (quoting + cumulative distance), GPX, KML output

### Optimizer — 3 unit tests (pytest)

```bash
cd optimizer
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
python -m pytest -q     # or: python -m pytest -v
```

Coverage:
- `haversine_matrix` — zero diagonal, ~1111 km per 10° latitude
- `open_tsp_order` — OR-Tools open-path solver finds the optimal line tour
- `refine_junctions` — windowed 2-opt never worsens a tour and fixes bad seams

### Frontend — build-time checks (no unit tests configured)

```bash
cd frontend
npm install
npm run build           # typecheck + production bundle
```

### End-to-end smoke tests (needs a running backend + optimizer + Postgres)

```bash
cd MapOptimizer
node scripts/e2e/e2e-smoke.mjs      # 4 real addresses: geocode -> matrix -> optimize -> route -> exports
node scripts/e2e/e2e-ortools.mjs    # 120-stop job: exercises the OR-Tools service
```

### CI

GitHub Actions (`.github/workflows/ci.yml`) runs backend typecheck+tests, optimizer
pytest, frontend build, and Docker image builds on every push/PR.

---

## 6. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Cannot connect to the Docker daemon` | Start Docker Desktop, wait for "Engine running", retry |
| `role "postgres" does not exist` | Set `DATABASE_URL` to your OS user: `postgres://<user>@localhost:5432/routeoptimizer` |
| `URL string malformed` from OSRM | The public demo server only supports GET — keep `OSRM_USE_POST=false` (default); self-hosted servers can enable POST |
| Geocoding is slow / "geocoded" stalls | Nominatim public API is ~1 req/s by design; raise `GEOCODE_DELAY_MS` to be polite, or self-host Photon/Nominatim |
| 5,000-stop jobs are slow | Self-host OSRM and set `OSRM_TABLE_CHUNK=500`, `OSRM_THROTTLE_MS=0` |
| 429 Too Many Requests | Rate limiter — Redis (`REDIS_URL`) shares it across instances; otherwise in-memory per instance |
| Map tiles don't load | Needs internet to OpenStreetMap tiles; for heavy traffic self-host tiles and change the URL in `frontend/src/components/RouteMap.tsx` |
| Reset everything locally | `docker compose down -v` (Docker) or drop+recreate the DB (local) — tables are recreated by migrations on backend boot |
