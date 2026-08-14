import { useRef, useState, type FormEvent } from 'react';
import { api, uploadCsv } from '../api';
import { parseCsvFile, parsePastedText, type StopInput } from '../lib/csv';
import { COUNTRY_OPTIONS, detectCountryCode } from '../lib/countries';

export function CreateJob({ onCreated }: { onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [startAddress, setStartAddress] = useState('');
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<StopInput[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function applyParsed(stops: StopInput[]) {
    setParsed(stops);
    // Default the route origin to the first parsed stop; the user can change
    // it below or clear it (blank = first stop is still the start).
    setStartAddress(stops[0]?.address ?? '');
    setError(null);
    autoDetectCountry(stops);
  }

  function parseText() {
    try {
      applyParsed(parsePastedText(text));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Parse failed');
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      applyParsed(await parseCsvFile(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CSV parse failed');
    }
  }

  function autoDetectCountry(stops: StopInput[]) {
    const code = detectCountryCode(stops.map((s) => s.address));
    if (code) setCountry(code);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!parsed || parsed.length < 2) {
      setError('Enter at least 2 stops');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { id } = await api.createJob(
        name.trim() || 'Untitled route',
        parsed,
        country,
        startAddress.trim(),
      );
      setParsed(null);
      setText('');
      setName('');
      setCountry('');
      setStartAddress('');
      onCreated(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create job');
    } finally {
      setBusy(false);
    }
  }

  async function submitUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const { id } = await uploadCsv(
        file,
        name.trim() || file.name.replace(/\.[^.]+$/, ''),
        country,
        startAddress.trim(),
      );
      if (fileRef.current) fileRef.current.value = '';
      setParsed(null);
      setName('');
      setCountry('');
      setStartAddress('');
      onCreated(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <form onSubmit={submit}>
        <div className="mb-3">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Route name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="e.g. Wednesday deliveries"
          />
        </div>

        <div className="mb-3">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Country (used for geocoding all addresses)
          </label>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {COUNTRY_OPTIONS.map((c) => (
              <option key={c.code || '__auto'} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            Auto-detect reads the province/state from each address (e.g. ON →
            Canada, CA → United States).
          </p>
        </div>

        <div className="mb-3">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Start address (optional)
          </label>
          <input
            value={startAddress}
            onChange={(e) => setStartAddress(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="e.g. 200 University Ave W, Waterloo, ON"
          />
          <p className="mt-1 text-xs text-slate-500">
            The route departs from here. Leave blank to use the first stop as
            the start.
          </p>
        </div>

        <div className="mb-3 grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Paste addresses
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              placeholder={'One address per line, e.g.\n1600 Amphitheatre Pkwy, Mountain View, CA\n1355 Market St, San Francisco, CA'}
            />
            <button
              type="button"
              onClick={parseText}
              className="mt-1 text-sm text-blue-600 hover:underline"
            >
              Parse addresses
            </button>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Or upload a CSV
            </label>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFile}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-slate-500">
              Columns: address, optional label, lat, lng. Header row auto-detected.
            </p>
            {parsed && fileRef.current?.files?.length ? (
              <button
                type="button"
                onClick={submitUpload}
                disabled={busy}
                className="mt-2 rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Upload {parsed.length} stops
              </button>
            ) : null}
          </div>
        </div>

        {parsed && (
          <div className="mb-3 flex items-center justify-between rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
            <span>
              {parsed.length} stop(s) parsed
              {parsed.length > 1
                ? ` · preview: ${parsed[0].address} → ${parsed[parsed.length - 1].address}`
                : ''}
            </span>
          </div>
        )}

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={busy || !parsed || parsed.length < 2}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? 'Creating…' : 'Optimize route'}
        </button>
      </form>
    </div>
  );
}
