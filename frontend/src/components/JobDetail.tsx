import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, downloadFile } from '../api';
import type { Job, JobResult, Stop } from '../types';
import { ProgressPanel } from './ProgressPanel';
import { StatsPanel } from './StatsPanel';
import { RouteMap } from './RouteMap';
import { StopsTable, TurnList } from './ResultViews';

const ACTIVE = new Set(['geocoding', 'geocoded', 'matrix', 'optimizing', 'routing', 'uploaded']);

function ExportMenu({ jobId }: { jobId: string }) {
  const formats = ['csv', 'gpx', 'kml', 'json'] as const;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-slate-500">Export:</span>
      {formats.map((f) => (
        <button
          key={f}
          onClick={() => downloadFile(jobId, f)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          {f.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

export function JobDetail({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<Job | null>(null);
  const [result, setResult] = useState<JobResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const detail = await api.getJob(jobId);
      setJob(detail.job);
      setError(detail.job.error);
      if (detail.job.status === 'done') {
        const r = await api.getResult(jobId);
        if (r.result) setResult(r.result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load job');
    }
  }, [jobId]);

  useEffect(() => {
    void refresh();
    if (job && ACTIVE.has(job.status)) {
      const t = setInterval(() => void refresh(), 2000);
      return () => clearInterval(t);
    }
  }, [jobId, job?.status, refresh]);

  const orderedStops: (Stop & { order: number })[] = useMemo(() => {
    if (!result) return [];
    const byId = new Map(result.stops.map((s) => [s.id, s]));
    return result.ordered_stops.map((o) => ({ ...byId.get(o.stopId), ...byId.get(o.stopId)!, order: o.order }));
  }, [result]);

  if (!job) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        {error ? <span className="text-red-600">{error}</span> : 'Loading…'}
      </div>
    );
  }

  const active = ACTIVE.has(job.status);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{job.name}</h1>
          <p className="text-sm text-slate-500">
            {job.total_stops} stops · created {new Date(job.created_at).toLocaleString()}
          </p>
        </div>
        {job.status === 'done' && <ExportMenu jobId={job.id} />}
      </div>

      {error && job.status === 'failed' && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
      )}

      {active && <ProgressPanel phase={job.phase} progress={job.progress} message={job.message} />}

      {job.status === 'done' && result && (
        <>
          <StatsPanel
            stops={job.total_stops}
            totalDistanceKm={result.total_distance_km}
            totalDurationMin={result.total_duration_min}
            legs={result.legs}
          />
          <RouteMap geometry={result.geometry} orderedStops={orderedStops} />
          <div className="grid gap-4 lg:grid-cols-2">
            <StopsTable ordered={orderedStops} />
            <TurnList jobId={job.id} />
          </div>
        </>
      )}
    </div>
  );
}
