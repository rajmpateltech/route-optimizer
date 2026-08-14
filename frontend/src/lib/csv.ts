import Papa from 'papaparse';

export interface StopInput {
  address: string;
  label?: string;
  lat?: number;
  lng?: number;
}

export function parsePastedText(text: string): StopInput[] {
  return text
    .split(/\n|;/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((address) => ({ address }));
}

export function parseCsvFile(file: File): Promise<StopInput[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<unknown>(file, {
      header: false,
      skipEmptyLines: true,
      complete: (result) => {
        try {
          resolve(rowsToStops(result.data as unknown[][]));
        } catch (err) {
          reject(err);
        }
      },
      error: reject,
    });
  });
}

function rowsToStops(rows: unknown[][]): StopInput[] {
  if (!rows.length) return [];
  const header = (rows[0] ?? []).map((c) => String(c).trim().toLowerCase());
  const addrCol = header.findIndex((h) =>
    ['address', 'street', 'location', 'stop', 'addr', 'adresse'].includes(h),
  );
  const labelCol = header.findIndex((h) =>
    ['label', 'name', 'stopname', 'nom'].includes(h),
  );
  const latCol = header.findIndex((h) => ['lat', 'latitude'].includes(h));
  const lngCol = header.findIndex((h) =>
    ['lng', 'lon', 'long', 'longitude'].includes(h),
  );

  const hasHeader =
    addrCol >= 0 ||
    labelCol >= 0 ||
    latCol >= 0 ||
    (header.length > 1 &&
      header.some((h) => h.length > 0 && /^[a-z]/.test(h)));

  const dataRows = hasHeader ? rows.slice(1) : rows;
  const stops: StopInput[] = [];
  for (const row of dataRows) {
    const cells = (row ?? []).map((c) => String(c ?? '').trim());
    if (!cells.length || !cells[0]) continue;
    const address = addrCol >= 0 ? cells[addrCol] : cells[0];
    if (!address) continue;
    const lat = latCol >= 0 ? Number(cells[latCol]) : NaN;
    const lng = lngCol >= 0 ? Number(cells[lngCol]) : NaN;
    stops.push({
      address,
      label: labelCol >= 0 && cells[labelCol] ? cells[labelCol] : undefined,
      lat: Number.isFinite(lat) ? lat : undefined,
      lng: Number.isFinite(lng) ? lng : undefined,
    });
  }
  return stops;
}
