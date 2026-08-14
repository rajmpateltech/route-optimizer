import { describe, expect, it } from 'vitest';
import { detectCountryCode, geocodeCandidates } from '../src/geocode';

describe('geocodeCandidates', () => {
  it('keeps pure street addresses as-is (only one candidate)', () => {
    expect(geocodeCandidates('12 Water St S, Cambridge, ON')).toEqual([
      '12 Water St S, Cambridge, ON',
    ]);
  });

  it('strips the name prefix and appends the address + name candidates', () => {
    expect(
      geocodeCandidates('Idea Exchange (Old Post Office), 12 Water St S, Cambridge, ON'),
    ).toEqual([
      'Idea Exchange (Old Post Office), 12 Water St S, Cambridge, ON',
      '12 Water St S, Cambridge, ON',
      'Idea Exchange (Old Post Office)',
    ]);
  });

  it('treats a leading address-looking part as not a name', () => {
    expect(geocodeCandidates('123 Main St, 456 Oak Ave, Toronto, ON')).toEqual([
      '123 Main St, 456 Oak Ave, Toronto, ON',
    ]);
  });

  it('handles single-part inputs', () => {
    expect(geocodeCandidates('Victoria Park')).toEqual(['Victoria Park']);
  });
});

describe('detectCountryCode', () => {
  it('maps Canadian provinces to ca', () => {
    expect(detectCountryCode('12 Water St S, Cambridge, ON')).toBe('ca');
    expect(detectCountryCode('200 University Ave W, Waterloo, ON')).toBe('ca');
  });

  it('maps US states to us', () => {
    expect(detectCountryCode('1600 Amphitheatre Pkwy, Mountain View, CA')).toBe('us');
    expect(detectCountryCode('350 5th Ave, New York, NY')).toBe('us');
  });

  it('maps explicit country names', () => {
    expect(detectCountryCode('1 Rue de la Paix, Paris, France')).toBe('fr');
    expect(detectCountryCode('10 Downing St, London, UK')).toBe('gb');
  });

  it('prefers the trailing province over 2-letter words in street names', () => {
    // "IN" appears in the street, but "ON" is the real province in the last
    // segment — must not be read as Indiana.
    expect(detectCountryCode('50 IN Avenue, Toronto, ON')).toBe('ca');
    expect(detectCountryCode('24 AL Dr, Kitchener, ON')).toBe('ca');
    expect(detectCountryCode('777 IN St, Cambridge, ON')).toBe('ca');
  });

  it('maps full province/state names', () => {
    expect(detectCountryCode('123 Main St, Toronto, Ontario')).toBe('ca');
    expect(detectCountryCode('1 Market St, San Francisco, California')).toBe('us');
  });

  it('resolves Ontario, CA as the California city (via CA code)', () => {
    expect(detectCountryCode('400 N Euclid Ave, Ontario, CA')).toBe('us');
  });

  it('returns empty when nothing is recognizable', () => {
    expect(detectCountryCode('Somewhere off the map')).toBe('');
  });
});
