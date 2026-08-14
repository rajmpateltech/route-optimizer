export interface CountryOption {
  code: string;
  name: string;
}

export const COUNTRY_OPTIONS: CountryOption[] = [
  { code: '', name: 'Auto-detect (from province/state in addresses)' },
  { code: 'ca', name: 'Canada' },
  { code: 'us', name: 'United States' },
  { code: 'gb', name: 'United Kingdom' },
  { code: 'ie', name: 'Ireland' },
  { code: 'au', name: 'Australia' },
  { code: 'nz', name: 'New Zealand' },
  { code: 'de', name: 'Germany' },
  { code: 'fr', name: 'France' },
  { code: 'es', name: 'Spain' },
  { code: 'it', name: 'Italy' },
  { code: 'nl', name: 'Netherlands' },
  { code: 'be', name: 'Belgium' },
  { code: 'ch', name: 'Switzerland' },
  { code: 'at', name: 'Austria' },
  { code: 'pt', name: 'Portugal' },
  { code: 'se', name: 'Sweden' },
  { code: 'no', name: 'Norway' },
  { code: 'dk', name: 'Denmark' },
  { code: 'fi', name: 'Finland' },
  { code: 'pl', name: 'Poland' },
  { code: 'in', name: 'India' },
  { code: 'jp', name: 'Japan' },
  { code: 'br', name: 'Brazil' },
  { code: 'mx', name: 'Mexico' },
];

const REGION_TO_COUNTRY: Record<string, string> = {
  ab: 'ca', bc: 'ca', mb: 'ca', nb: 'ca', nl: 'ca', ns: 'ca', nt: 'ca',
  nu: 'ca', on: 'ca', pe: 'ca', qc: 'ca', sk: 'ca', yt: 'ca',
  al: 'us', ak: 'us', az: 'us', ar: 'us', ca: 'us', co: 'us', ct: 'us',
  de: 'us', fl: 'us', ga: 'us', hi: 'us', id: 'us', il: 'us', in: 'us',
  ia: 'us', ks: 'us', ky: 'us', la: 'us', me: 'us', md: 'us', ma: 'us',
  mi: 'us', mn: 'us', ms: 'us', mo: 'us', mt: 'us', ne: 'us', nv: 'us',
  nh: 'us', nj: 'us', nm: 'us', ny: 'us', nc: 'us', nd: 'us', oh: 'us',
  ok: 'us', or: 'us', pa: 'us', ri: 'us', sc: 'us', sd: 'us', tn: 'us',
  tx: 'us', ut: 'us', vt: 'us', va: 'us', wa: 'us', wv: 'us', wi: 'us',
  wy: 'us', dc: 'us',
  nsw: 'au', vic: 'au', qld: 'au', tas: 'au', sa: 'au', act: 'au',
};

const COUNTRY_NAMES: Record<string, string> = {
  canada: 'ca', usa: 'us', 'united states': 'us', 'united kingdom': 'gb',
  uk: 'gb', australia: 'au', ireland: 'ie', germany: 'de', france: 'fr',
  italy: 'it', spain: 'es', netherlands: 'nl', belgium: 'be', india: 'in',
  japan: 'jp', brazil: 'br', mexico: 'mx', 'new zealand': 'nz',
};

/**
 * Detect a country code (ISO-3166 alpha-2) from a list of address strings,
 * based on the province/state/country mentioned in each. Returns '' when
 * nothing conclusive is found, otherwise the most common detected code.
 *
 * Province/state codes live in the LAST comma-separated segment, so we check
 * the trailing segments first to avoid false positives like "50 IN Avenue"
 * matching Indiana.
 */
export function detectCountryCode(addresses: string[]): string {
  const votes = new Map<string, number>();
  for (const address of addresses) {
    const lower = ` ${address.toLowerCase()} `;
    let found = false;
    for (const name of Object.keys(COUNTRY_NAMES)) {
      if (lower.includes(` ${name} `)) {
        votes.set(COUNTRY_NAMES[name], (votes.get(COUNTRY_NAMES[name]) ?? 0) + 1);
        found = true;
        break;
      }
    }
    if (found) continue;

    const segments = address
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const tail = segments.slice(-2).join(' ');
    const tailMatch = tail.match(/\b[a-z]{2}\b/g) ?? [];
    let detected = '';
    for (const code of tailMatch) {
      if (REGION_TO_COUNTRY[code]) {
        detected = REGION_TO_COUNTRY[code];
        break;
      }
    }
    if (!detected) {
      const match = lower.match(/\b[a-z]{2}\b/g) ?? [];
      for (const code of match) {
        if (REGION_TO_COUNTRY[code]) {
          detected = REGION_TO_COUNTRY[code];
          break;
        }
      }
    }
    if (detected) {
      votes.set(detected, (votes.get(detected) ?? 0) + 1);
    }
  }
  if (votes.size === 0) return '';
  return [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
