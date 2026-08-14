import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import type { RouteStep, Stop } from '../types';

function fmtDist(m?: number): string {
  if (m == null) return '';
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

function fmtDur(s?: number): string {
  if (s == null) return '';
  const min = s / 60;
  return min >= 60 ? `${Math.floor(min / 60)}h ${Math.round(min % 60)}m` : `${Math.round(min)} min`;
}

export function StopsTable({ ordered }: { ordered: (Stop & { order: number })[] }) {
  const rows = useMemo(() => ordered.sort((a, b) => a.order - b.order), [ordered]);
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-800">Optimized stop order</h3>
      </div>
      <div className="max-h-[480px] overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Address</th>
              <th className="px-3 py-2">Lat</th>
              <th className="px-3 py-2">Lng</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="px-3 py-2 font-medium text-slate-700">{s.order + 1}</td>
                <td className="max-w-md truncate px-3 py-2">
                  <span className="text-slate-800">{s.label || s.address}</span>
                  {s.label ? <span className="ml-2 text-slate-400">{s.address}</span> : null}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-slate-500">{s.lat?.toFixed(5)}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-500">{s.lng?.toFixed(5)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const PAGE = 300;

export function TurnList({ jobId }: { jobId: string }) {
  const [steps, setSteps] = useState<RouteStep[]>([]);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(PAGE);
  const [legs, setLegs] = useState<{ from: number; to: number; distance_m: number; duration_s: number }[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.getSteps(jobId, 0, PAGE).then((r) => {
      if (cancelled) return;
      setSteps(r.steps);
      setTotal(r.total);
      setLegs(r.legs);
    });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  async function loadMore() {
    const r = await api.getSteps(jobId, loaded, PAGE);
    setSteps((prev) => [...prev, ...r.steps]);
    setLoaded((prev) => prev + r.steps.length);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-800">
          Turn-by-turn directions <span className="font-normal text-slate-400">({total} steps)</span>
        </h3>
      </div>
      <ul className="max-h-[480px] divide-y divide-slate-100 overflow-auto">
        {steps.map((s, i) => (
          <li key={i} className={`flex items-start gap-3 px-4 py-2 text-sm ${s.type === 'arrive' ? 'bg-emerald-50/60' : ''}`}>
            <span className="mt-0.5 w-6 shrink-0 text-center">
              {s.type === 'arrive' ? '📍' : s.type === 'depart' ? '🚩' : '➡️'}
            </span>
            <div className="min-w-0 flex-1">
              <p className={s.type === 'arrive' ? 'font-medium text-emerald-900' : 'text-slate-700'}>
                {s.instruction}
              </p>
              {s.name && <p className="text-xs text-slate-400">{s.name}</p>}
            </div>
            <div className="shrink-0 text-right text-xs text-slate-500">
              <p>{fmtDist(s.distance_m)}</p>
              <p>{fmtDur(s.duration_s)}</p>
            </div>
          </li>
        ))}
        {steps.length === 0 && <li className="px-4 py-6 text-sm text-slate-500">No steps loaded.</li>}
      </ul>
      {loaded < total && (
        <div className="border-t border-slate-100 p-3 text-center">
          <button onClick={loadMore} className="rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-700 hover:bg-slate-200">
            Load more ({total - loaded} remaining)
          </button>
        </div>
      )}
      {legs.length > 0 && (
        <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
          {legs.length} legs · avg leg {fmtDist(legs.reduce((a, l) => a + l.distance_m, 0) / legs.length)}
        </div>
      )}
    </div>
  );
}
