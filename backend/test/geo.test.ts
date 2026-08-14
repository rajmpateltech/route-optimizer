import { describe, expect, it } from 'vitest';
import { normalizeAddress, haversine, fallbackTravel, assertValidStops, pct } from '../src/utils/geo';

describe('normalizeAddress', () => {
  it('normalizes case and whitespace', () => {
    expect(normalizeAddress('  1600 Amphitheatre  Pkwy ')).toBe('1600 amphitheatre pkwy');
  });
});

describe('haversine', () => {
  it('returns ~0 for identical points', () => {
    expect(haversine(12.34, 56.78, 12.34, 56.78)).toBeCloseTo(0, 0);
  });
  it('returns ~111km for 1 degree latitude', () => {
    const d = haversine(0, 0, 1, 0);
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });
});

describe('fallbackTravel', () => {
  it('computes ~9 minutes for 6km', () => {
    // 6000 m at 40 km/h = 540 s
    expect(fallbackTravel(6000)).toBe(540);
  });
});

describe('assertValidStops', () => {
  it('rejects fewer than 2 stops', () => {
    expect(() => assertValidStops([{ address: 'a' }], 10)).toThrow();
  });
  it('rejects over the limit', () => {
    const stops = Array.from({ length: 11 }, (_, i) => ({ address: `addr ${i}` }));
    expect(() => assertValidStops(stops, 10)).toThrow();
  });
  it('accepts valid input', () => {
    expect(() => assertValidStops([{ address: 'a' }, { address: 'b' }], 10)).not.toThrow();
  });
});

describe('pct', () => {
  it('computes percentages', () => {
    expect(pct(1, 4)).toBe(25);
    expect(pct(0, 0)).toBe(0);
  });
});
