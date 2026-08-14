import { config } from '../config';

export interface Coord {
  lat: number;
  lng: number;
}

/** Serialized queue honoring the configured throttle for external OSRM. */
class OSRMQueue {
  private chain: Promise<unknown> = Promise.resolve();

  run<T>(fn: () => Promise<T>): Promise<T> {
    const delay = () =>
      config.osrm.throttleMs > 0
        ? new Promise((r) => setTimeout(r, config.osrm.throttleMs))
        : Promise.resolve();
    const result = this.chain.then(() =>
      Promise.all([fn(), delay()]).then(([r]) => r as T),
    );
    this.chain = result.catch(() => undefined);
    return result;
  }
}

const queue = new OSRMQueue();

async function httpJson(url: string, body?: unknown): Promise<any> {
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`OSRM request failed: HTTP ${res.status} ${await res.text()}`);
  }
  return res.json();
}

function coordPath(coords: Coord[]): string {
  return coords.map((c) => `${c.lng},${c.lat}`).join(';');
}

export interface TableResponse {
  distances: (number | null)[][];
  durations: (number | null)[][];
}

/**
 * OSRM table request. Public OSRM servers only support GET (coordinates in the
 * path); self-hosted servers can additionally use POST for larger chunks.
 */
export async function osrmTable(
  origins: Coord[],
  destinations: Coord[],
): Promise<TableResponse> {
  const all = [...origins, ...destinations];
  const sources = origins.map((_, i) => i).join(',');
  const destIdx = destinations
    .map((_, i) => origins.length + i)
    .join(',');
  const url = `${config.osrm.baseUrl}/table/v1/driving/${coordPath(all)}?sources=${sources}&destinations=${destIdx}&annotations=duration,distance`;

  const json = await queue.run(() =>
    config.osrm.usePost
      ? httpJson(`${config.osrm.baseUrl}/table/v1/driving`, {
          coordinates: all.map((c) => [c.lng, c.lat]),
          sources: sources.split(',').map(Number),
          destinations: destIdx.split(',').map(Number),
          annotations: ['duration', 'distance'],
        })
      : httpJson(url),
  );
  return { distances: json.distances, durations: json.durations };
}

export interface OsrmLeg {
  distance: number;
  duration: number;
  steps: Array<{
    name: string;
    distance: number;
    duration: number;
    maneuver: {
      type: string;
      modifier?: string;
      instruction?: string;
      bearing_before?: number;
      bearing_after?: number;
    };
  }>;
}

export interface OsrmRouteResult {
  distance: number;
  duration: number;
  geometry: [number, number][]; // [lat, lng] pairs
  legs: OsrmLeg[];
}

export async function osrmRoute(coords: Coord[]): Promise<OsrmRouteResult> {
  const path = coordPath(coords);
  const base = `${config.osrm.baseUrl}/route/v1/driving`;

  const json = await queue.run(() =>
    config.osrm.usePost
      ? httpJson(base, {
          coordinates: coords.map((c) => [c.lng, c.lat]),
          steps: true,
          overview: 'simplified',
          geometries: 'geojson',
        })
      : httpJson(`${base}/${path}?steps=true&overview=simplified&geometries=geojson`),
  );

  const route = json.routes?.[0];
  if (!route) throw new Error('OSRM returned no route');
  const geometry = (route.geometry?.coordinates ?? []).map(
    ([lng, lat]: [number, number]) => [lat, lng] as [number, number],
  );
  return {
    distance: route.distance,
    duration: route.duration,
    geometry,
    legs: route.legs,
  };
}
