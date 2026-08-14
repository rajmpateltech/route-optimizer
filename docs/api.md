# HTTP API

Base path: `/api`. All `/api/jobs*` routes require `Authorization: Bearer <token>`.

## Auth

| Method | Path | Body | Description |
| --- | --- | --- | --- |
| POST | `/auth/register` | `{ email, password }` | Create account → `{ token, user }` |
| POST | `/auth/login` | `{ email, password }` | Login → `{ token, user }` |
| GET | `/auth/me` | — | Current user |

## Jobs

| Method | Path | Description |
| --- | --- | --- |
| POST | `/jobs` | Create + start. Body: `{ name, stops: [{ address, label?, lat?, lng? }] }` → `{ id }` |
| POST | `/jobs/upload` | Multipart `file` (CSV) + optional `name` → `{ id }` |
| GET | `/jobs` | List user's jobs (status, totals) |
| GET | `/jobs/:id` | Job + its stops |
| GET | `/jobs/:id/events` | Server-Sent Events live progress stream |
| GET | `/jobs/:id/result` | Optimized result `{ status, result? }` |
| GET | `/jobs/:id/steps?offset&limit` | Paginated turn-by-turn steps |
| DELETE | `/jobs/:id` | Delete job |
| GET | `/jobs/:id/export/:format` | `csv` / `gpx` / `kml` / `json` download |

## Job status lifecycle

`uploaded → geocoding → geocoded → matrix → optimizing → routing → done`

Failures move the job to `failed` with an `error` message. `progress` is 0–100.

## Result shape (`/jobs/:id/result`)

```jsonc
{
  "status": "done",
  "result": {
    "ordered_stops": [{ "stopId": "uuid", "order": 0 }],
    "geometry": [[lat, lng], [lat, lng], "..."],
    "steps": [{ "stop_index": 0, "type": "turn|arrive|depart",
                "instruction": "…", "distance_m": 0, "duration_s": 0 }],
    "legs": [{ "from": 0, "to": 1, "distance_m": 0, "duration_s": 0 }],
    "total_distance_km": 0,
    "total_duration_min": 0,
    "stops": [ "… full stop rows …" ]
  }
}
```

## Errors

All errors are JSON `{ "error": "message" }` with an appropriate HTTP status
(`400`, `401`, `404`, `409`, `429`, `500`). Zod validation failures return
`details` with the offending fields.
