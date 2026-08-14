# Self-hosting OSRM (routing engine)

OSRM is the free, unlimited routing backend behind the distance matrix and the
turn-by-turn route. The public demo server (`router.project-osrm.org`) is only
for quick starts — it is rate limited and not for production use.

## Build routing data

```bash
./infra/osrm/setup-osrm.sh <region>
```

`<region>` is a Geofabrik path, e.g.:

- `europe` (large, good global-ish coverage)
- `north-america/us/california`
- `asia/india`
- a direct `https://…osm.pbf` URL

The script downloads the `.osm.pbf`, then runs `osrm-extract`,
`osrm-partition`, `osrm-customize` with the car profile, all inside the
official `osrm/osrm-backend` image.

> Full planet (`planet`) is ~70 GB download and needs ~32 GB RAM to build.
> A continent or country extract covers the vast majority of route-planning
> workloads and fits on typical cloud VMs.

## Run the router

```bash
docker compose --profile osrm up -d
# -> http://localhost:5000  (osrm-routed, MLD, max-table-size 2000)
```

Then set in `.env`:

```
OSRM_MODE=selfhosted
OSRM_URL=http://localhost:5000     # or http://osrm:5000 inside compose
OSRM_TABLE_CHUNK=500               # larger chunks = far fewer requests
OSRM_THROTTLE_MS=0                 # no need to throttle a local server
```

and restart the stack.

## Sizing

| Workload | Suggested VM |
| --- | --- |
| Country/state extract, ≤1,000 stops | 2 vCPU / 4 GB |
| Continent extract, ≤5,000 stops | 4 vCPU / 8–16 GB |
| Planet | 8 vCPU / 32 GB+ and ~150 GB disk |

## Alternatives

- **Valhalla** — another free self-hostable router with a matrix API; a
  drop-in for OSRM if you prefer it (adapt `src/matrix/osrm.ts` + config).
- **Tiles** — the UI uses OpenStreetMap public tiles. For heavy production
  traffic, self-host tiles (e.g. `tileserver-gl` with OpenMapTiles) and change
  the `TileLayer` URL in `frontend/src/components/RouteMap.tsx`.
