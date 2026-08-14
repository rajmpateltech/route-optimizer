import { pool } from '../db/pool';
import { config } from '../config';
import { normalizeAddress } from '../utils/geo';

export interface GeocodeResult {
  lat: number;
  lng: number;
  label?: string;
  confidence?: number;
  source: string;
}

/**
 * A tiny serial queue that guarantees a minimum delay between external
 * requests, so free public geocoders (Nominatim usage policy = 1 req/s)
 * are never hammered by concurrent workers.
 */
class ThrottledQueue {
  private chain: Promise<unknown> = Promise.resolve();

  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.chain.then(fn);
    // keep the chain alive with a delay, swallow errors into the chain
    this.chain = result.then(
      () => new Promise((r) => setTimeout(r, config.geocode.minDelayMs)),
      () => new Promise((r) => setTimeout(r, config.geocode.minDelayMs)),
    );
    return result;
  }
}

export const geocodeQueue = new ThrottledQueue();

/**
 * Most stop inputs look like "Business Name, 123 Street, City, ON".
 * Nominatim frequently fails on the combined string, so we build a ranked
 * list of candidate queries:
 *   1. the original string (exact POI match may win),
 *   2. the street-address portion (name stripped),
 *   3. the name alone.
 * The first candidate that yields a result wins. For inputs that are already
 * pure street addresses (no leading name), only the original is used so we
 * never drop the city context (which prevents cross-country false positives).
 */
export function geocodeCandidates(address: string): string[] {
  const parts = address
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const out = [address];

  if (parts.length >= 3) {
    const [first, ...rest] = parts;
    // A leading part is a street address only when it clearly *starts* with a
    // house number or a road prefix ("Hwy", "RR", "Concession"). A bare suffix
    // like "St." (Saint) or "Trail" inside a venue name must NOT be treated as
    // a street — doing so suppressed the address-only fallback below.
    const firstIsStreet = /^\d/.test(first) || /^(hwy|highway|rr|cr|con(cession)?|rte|road)\b/i.test(first);
    if (!firstIsStreet) {
      const addressOnly = rest.join(', ');
      const nameOnly = first;
      if (addressOnly) out.push(addressOnly);
      if (nameOnly) out.push(nameOnly);
    }
  }
  return out;
}

function countryFilter(country?: string): string {
  const cc = (country ?? config.geocode.countryCodes).trim();
  if (!cc) return '';
  // Nominatim accepts a comma-separated list of ISO 3166-1 alpha-2 codes.
  return cc
    .split(',')
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean)
    .join(',');
}

/**
 * Province/state abbreviations -> country. Used to honor a region mentioned in
 * an individual address even when it differs from the job's default country.
 */
const REGION_TO_COUNTRY: Record<string, string> = {
  // Canada (provinces + territories)
  ab: 'ca', bc: 'ca', mb: 'ca', nb: 'ca', nl: 'ca', ns: 'ca', nt: 'ca',
  nu: 'ca', on: 'ca', pe: 'ca', qc: 'ca', sk: 'ca', yt: 'ca',
  // United States (states + DC)
  al: 'us', ak: 'us', az: 'us', ar: 'us', ca: 'us', co: 'us', ct: 'us',
  de: 'us', fl: 'us', ga: 'us', hi: 'us', id: 'us', il: 'us', in: 'us',
  ia: 'us', ks: 'us', ky: 'us', la: 'us', me: 'us', md: 'us', ma: 'us',
  mi: 'us', mn: 'us', ms: 'us', mo: 'us', mt: 'us', ne: 'us', nv: 'us',
  nh: 'us', nj: 'us', nm: 'us', ny: 'us', nc: 'us', nd: 'us', oh: 'us',
  ok: 'us', or: 'us', pa: 'us', ri: 'us', sc: 'us', sd: 'us', tn: 'us',
  tx: 'us', ut: 'us', vt: 'us', va: 'us', wa: 'us', wv: 'us', wi: 'us',
  wy: 'us', dc: 'us',
  // UK, Australia, Ireland, etc.
  uk: 'gb', england: 'gb', scotland: 'gb', wales: 'gb',
  nsw: 'au', vic: 'au', qld: 'au', tas: 'au', sa: 'au', act: 'au',
  'northern territory': 'au',
  // NOTE: 'wa' is ambiguous (Washington state vs Western Australia) and is
  // deliberately excluded so a job-level country wins; 'ca' maps to California
  // (US) since that is the overwhelmingly common meaning in street addresses.
};

const COUNTRY_NAMES: Record<string, string> = {
  canada: 'ca', usa: 'us', 'united states': 'us', 'united states of america': 'us',
  'u.s.a.': 'us', 'u.s.a': 'us', australia: 'au', 'united kingdom': 'gb',
  'great britain': 'gb', uk: 'gb', ireland: 'ie', germany: 'de', france: 'fr',
  italy: 'it', spain: 'es', netherlands: 'nl', belgium: 'be', switzerland: 'ch',
  austria: 'at', portugal: 'pt', sweden: 'se', norway: 'no', denmark: 'dk',
  finland: 'fi', poland: 'pl', brazil: 'br', mexico: 'mx', india: 'in',
  japan: 'jp', china: 'cn', 'new zealand': 'nz', 'south africa': 'za',
};

// Full province/state names. Deliberately checked AFTER trailing abbreviations
// so "Ontario, CA" (the California city) maps to US via "CA", while
// "Cambridge, Ontario" still maps to Canada.
const PROVINCE_NAMES: Record<string, string> = {
  ontario: 'ca', quebec: 'ca', 'british columbia': 'ca', alberta: 'ca',
  manitoba: 'ca', saskatchewan: 'ca', 'nova scotia': 'ca',
  'new brunswick': 'ca', 'newfoundland': 'ca', 'prince edward island': 'ca',
  california: 'us', texas: 'us', florida: 'us', 'new york': 'us',
  washington: 'us', illinois: 'us', 'new jersey': 'us', pennsylvania: 'us',
  massachusetts: 'us', 'north carolina': 'us', 'south carolina': 'us',
  virginia: 'us', ohio: 'us', michigan: 'us', georgia: 'us', arizona: 'us',
  colorado: 'us', nevada: 'us', oregon: 'us', 'new mexico': 'us',
  tennessee: 'us', kentucky: 'us', louisiana: 'us', maryland: 'us',
  minnesota: 'us', wisconsin: 'us', missouri: 'us', alabama: 'us',
  arkansas: 'us', connecticut: 'us', indiana: 'us', iowa: 'us',
  kansas: 'us', mississippi: 'us', montana: 'us', nebraska: 'us',
  'new hampshire': 'us', 'north dakota': 'us', 'south dakota': 'us',
  oklahoma: 'us', rhode: 'us', utah: 'us', vermont: 'us', wyoming: 'us',
  idaho: 'us', hawaii: 'us', alaska: 'us', delaware: 'us', maine: 'us',
};

/**
 * Look for an explicit country/province/state mention in an address. When one
 * is found, prefer it over the job-level default so mixed-region lists still
 * geocode correctly (e.g. a "Cambridge, MA" stop inside an otherwise-Canadian
 * job).
 *
 * Province/state codes almost always live in the LAST comma-separated segment
 * ("Cambridge, ON", "Mountain View, CA"). Scanning every 2-letter word in the
 * address produces false positives ("50 IN Avenue" would match Indiana), so we
 * check the trailing segments first and only fall back to a broad scan when
 * nothing conclusive was found.
 */
export function detectCountryCode(address: string): string {
  const lower = ` ${address.toLowerCase()} `;
  for (const name of Object.keys(COUNTRY_NAMES)) {
    if (lower.includes(` ${name} `)) return COUNTRY_NAMES[name];
  }

  const segments = address
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  // Prefer the last 1-2 segments ("City, ST" / "City, Province").
  const tail = segments.slice(-2).join(' ');
  const tailMatch = tail.match(/\b([a-z]{2})\b/g) ?? [];
  for (const code of tailMatch) {
    if (REGION_TO_COUNTRY[code]) return REGION_TO_COUNTRY[code];
  }
  // Full province/state names in the trailing segments ("Cambridge, Ontario").
  for (const name of Object.keys(PROVINCE_NAMES)) {
    if (tail.includes(` ${name} `) || tail.endsWith(` ${name}`)) {
      return PROVINCE_NAMES[name];
    }
  }

  // Fall back: a standalone 2-letter code anywhere (e.g. "Toronto ON").
  const match = lower.match(/\b([a-z]{2})\b/g) ?? [];
  for (const code of match) {
    if (REGION_TO_COUNTRY[code]) return REGION_TO_COUNTRY[code];
  }
  return '';
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.geocode.timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'RouteOptimizer/1.0 (self-hosted route optimization)',
      },
    });
    if (!res.ok) throw new Error(`geocoder HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function geocodeNominatim(
  address: string,
  country?: string,
): Promise<GeocodeResult | null> {
  const cc = countryFilter(country);
  const url = `${config.geocode.nominatimBase}/search?format=jsonv2&limit=1&q=${encodeURIComponent(address)}&addressdetails=1${cc ? `&countrycodes=${cc}` : ''}`;
  const data = (await fetchJson(url)) as Array<{
    lat: string;
    lon: string;
    display_name: string;
    importance: number;
  }>;
  const hit = data[0];
  if (!hit) return null;
  return {
    lat: Number(hit.lat),
    lng: Number(hit.lon),
    label: hit.display_name,
    confidence: Math.round(hit.importance * 100) / 100,
    source: 'nominatim',
  };
}

export async function geocodePhoton(
  address: string,
  country?: string,
): Promise<GeocodeResult | null> {
  const cc = (country ?? config.geocode.countryCodes).trim().split(',')[0]?.trim().toLowerCase();
  const url = `${config.geocode.photonBase}/api/?q=${encodeURIComponent(address)}&limit=1${cc ? `&countrycode=${cc}` : ''}`;
  const data = (await fetchJson(url)) as {
    features: Array<{
      geometry: { coordinates: [number, number] };
      properties: { name?: string; label?: string; score?: number };
    }>;
  };
  const hit = data.features?.[0];
  if (!hit) return null;
  return {
    lat: hit.geometry.coordinates[1],
    lng: hit.geometry.coordinates[0],
    label: hit.properties.label || hit.properties.name,
    confidence: hit.properties.score,
    source: 'photon',
  };
}

function cacheKey(address: string, country?: string): string {
  const norm = normalizeAddress(address);
  const cc = (country ?? config.geocode.countryCodes).trim().toLowerCase();
  return cc ? `${cc}|${norm}` : norm;
}

export async function lookupCache(
  address: string,
  country?: string,
): Promise<GeocodeResult | null> {
  const { rows } = await pool.query(
    `SELECT lat, lng, label, confidence, source FROM cache_geocode WHERE normalized_address = $1`,
    [cacheKey(address, country)],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    lat: r.lat,
    lng: r.lng,
    label: r.label ?? undefined,
    confidence: r.confidence ?? undefined,
    source: r.source,
  };
}

export async function storeCache(
  address: string,
  result: GeocodeResult,
  country?: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO cache_geocode (normalized_address, lat, lng, label, confidence, source)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (normalized_address) DO UPDATE
       SET lat = EXCLUDED.lat, lng = EXCLUDED.lng, label = EXCLUDED.label,
           confidence = EXCLUDED.confidence, source = EXCLUDED.source,
           updated_at = now()`,
    [
      cacheKey(address, country),
      result.lat,
      result.lng,
      result.label ?? null,
      result.confidence ?? null,
      result.source,
    ],
  );
}

export async function geocodeAddress(
  address: string,
  country?: string,
): Promise<GeocodeResult | null> {
  // An explicit province/state in the address (e.g. ", ON" or ", CA" for
  // California) takes precedence over the job-level default so mixed-region
  // lists geocode correctly.
  const detected = detectCountryCode(address);
  const bias = detected || country;

  const cached = await lookupCache(address, bias);
  if (cached) return cached;

  // Primary provider, then the other one as a cross-provider fallback: their
  // coverage differs (e.g. Photon resolves many small Canadian POIs that
  // Nominatim has no record for).
  const providers: Array<(q: string, c?: string) => Promise<GeocodeResult | null>> =
    config.geocode.provider === 'photon'
      ? [geocodePhoton, geocodeNominatim]
      : [geocodeNominatim, geocodePhoton];

  for (const candidate of geocodeCandidates(address)) {
    for (const attempt of providers) {
      let lastErr: unknown;
      let exhausted = false;
      for (let i = 0; i <= config.geocode.maxRetries; i++) {
        try {
          const result = await geocodeQueue.run(() => attempt(candidate, bias));
          if (result) {
            // Cache under the original address so future jobs skip the fallback work.
            await storeCache(address, result, bias);
            return result;
          }
          break; // provider returned "not found" for this candidate -> try next
        } catch (err) {
          lastErr = err;
          if (i === config.geocode.maxRetries) exhausted = true;
          if (i < config.geocode.maxRetries) {
            await new Promise((r) => setTimeout(r, 800 * (i + 1)));
          }
        }
      }
      if (exhausted) {
        // Network/provider error: don't mask it as "not found" — surface it.
        throw lastErr;
      }
    }
  }
  return null; // every candidate came back empty from every provider
}
