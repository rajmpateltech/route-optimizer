import type { JobResult, StopRow } from '../types';

export function csvEscape(v: unknown): string {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(
  ordered: StopRow[],
  result: JobResult,
): string {
  const header = ['order', 'address', 'label', 'lat', 'lng', 'leg_distance_km', 'cumulative_distance_km'];
  const rows: string[][] = [header];
  let cumulative = 0;
  ordered.forEach((s, i) => {
    const legKm = i > 0 ? (result.legs[i - 1]?.distance_m ?? 0) / 1000 : 0;
    cumulative += legKm;
    rows.push([
      String(i + 1),
      s.address,
      s.label ?? '',
      s.lat != null ? String(s.lat) : '',
      s.lng != null ? String(s.lng) : '',
      legKm.toFixed(2),
      cumulative.toFixed(2),
    ]);
  });
  return rows.map((r) => r.map(csvEscape).join(',')).join('\n');
}

export function toGpx(
  ordered: StopRow[],
  geometry: [number, number][],
): string {
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<gpx version="1.1" creator="RouteOptimizer" xmlns="http://www.topografix.com/GPX/1/1">');
  for (const [i, s] of ordered.entries()) {
    lines.push(`  <wpt lat="${s.lat}" lon="${s.lng}"><name>Stop ${i + 1}</name><desc>${xml(s.address)}</desc></wpt>`);
  }
  lines.push('  <trk><name>Optimized route</name><trkseg>');
  for (const [lat, lng] of geometry) {
    lines.push(`    <trkpt lat="${lat}" lon="${lng}"></trkpt>`);
  }
  lines.push('  </trkseg></trk>');
  lines.push('</gpx>');
  return lines.join('\n');
}

export function toKml(
  ordered: StopRow[],
  geometry: [number, number][],
): string {
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<kml xmlns="http://www.opengis.net/kml/2.2"><Document>');
  for (const [i, s] of ordered.entries()) {
    lines.push(`  <Placemark><name>Stop ${i + 1}</name><description>${xml(s.address)}</description><Point><coordinates>${s.lng},${s.lat}</coordinates></Point></Placemark>`);
  }
  lines.push('  <Placemark><name>Optimized route</name><LineString><coordinates>');
  for (const [lat, lng] of geometry) {
    lines.push(`    ${lng},${lat}`);
  }
  lines.push('  </coordinates></LineString></Placemark>');
  lines.push('</Document></kml>');
  return lines.join('\n');
}

function xml(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
