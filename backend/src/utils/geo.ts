import { AppError } from '../utils/http';

export function normalizeAddress(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function haversine(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371e3;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Order-of-magnitude estimate used when OSRM cannot route a pair. */
export function fallbackTravel(distanceMeters: number): number {
  // assume ~40 km/h average
  return Math.round(distanceMeters / (40 * 1000) * 3600);
}

export function assertValidStops(inputs: { address: string }[], max: number): void {
  if (inputs.length < 2) {
    throw new AppError(400, 'At least 2 stops are required');
  }
  if (inputs.length > max) {
    throw new AppError(
      400,
      `Too many stops (${inputs.length}); the limit is ${max} per job`,
    );
  }
  for (const s of inputs) {
    if (!s.address?.trim()) {
      throw new AppError(400, 'Every stop must have a non-empty address');
    }
    if (s.address.length > 500) {
      throw new AppError(400, 'Addresses must be 500 characters or fewer');
    }
  }
}

export function pct(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}
