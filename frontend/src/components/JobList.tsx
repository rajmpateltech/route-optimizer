import type { Job, JobStatus } from '../types';

const STATUS_STYLES: Record<JobStatus, string> = {
  uploaded: 'bg-slate-100 text-slate-700',
  geocoding: 'bg-amber-100 text-amber-800',
  geocoded: 'bg-amber-100 text-amber-800',
  matrix: 'bg-amber-100 text-amber-800',
  optimizing: 'bg-amber-100 text-amber-800',
  routing: 'bg-amber-100 text-amber-800',
  done: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-800',
  cancelled: 'bg-slate-100 text-slate-600',
};

export function StatusBadge({ status }: { status: JobStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}

export function JobList({
  jobs,
  selectedId,
  onSelect,
  onDelete,
}: {
  jobs: Job[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-800">Your routes</h2>
      </div>
      <ul className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto">
        {jobs.length === 0 && (
          <li className="px-4 py-6 text-sm text-slate-500">
            No routes yet. Create your first one above.
          </li>
        )}
        {jobs.map((job) => (
          <li
            key={job.id}
            className={`group flex cursor-pointer items-center justify-between px-4 py-3 ${
              selectedId === job.id ? 'bg-blue-50' : 'hover:bg-slate-50'
            }`}
            onClick={() => onSelect(job.id)}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-800">{job.name}</p>
              <p className="text-xs text-slate-500">
                {job.total_stops} stops
                {job.total_distance_km != null
                  ? ` · ${job.total_distance_km.toFixed(1)} km · ${(job.total_duration_min ?? 0).toFixed(0)} min`
                  : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={job.status} />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`Delete "${job.name}"?`)) onDelete(job.id);
                }}
                className="text-slate-400 opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
                title="Delete"
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
