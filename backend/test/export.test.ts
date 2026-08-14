import { describe, expect, it } from 'vitest';
import { toCsv, toGpx, toKml } from '../src/export/formats';

const ordered: any[] = [
  { address: 'First, Street', label: null, lat: 1, lng: 2 },
  { address: 'Second', label: 'B', lat: 3, lng: 4 },
  { address: 'Third', label: null, lat: 5, lng: 6 },
];
const result: any = {
  legs: [{ distance_m: 1500 }, { distance_m: 2500 }],
};

describe('export formats', () => {
  it('generates CSV with quoted fields and cumulative distance', () => {
    const csv = toCsv(ordered, result);
    expect(csv).toContain('"First, Street"');
    expect(csv).toContain('order,address');
    const lines = csv.split('\n');
    // Row 2 shows the first leg (1.50 km); row 3 shows the cumulative total (4.00 km).
    expect(lines[2]).toContain('1.50');
    expect(lines[3]).toContain('4.00');
  });

  it('generates valid GPX with waypoints and track', () => {
    const gpx = toGpx(ordered, [[1, 2], [1.5, 2.5]]);
    expect(gpx).toContain('<gpx');
    expect(gpx).toContain('<wpt lat="1" lon="2">');
    expect(gpx).toContain('<trkpt lat="1" lon="2">');
  });

  it('generates valid KML with placemarks and linestring', () => {
    const kml = toKml(ordered, [[1, 2], [1.5, 2.5]]);
    expect(kml).toContain('<kml');
    expect(kml).toContain('<coordinates>2,1</coordinates>');
    expect(kml).toContain('<LineString>');
  });
});
