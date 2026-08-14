export function ProgressPanel({
  phase,
  progress,
  message,
}: {
  phase: string | null;
  progress: number;
  message: string | null;
}) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium text-amber-900">{phase || 'Working…'}</span>
        <span className="font-semibold text-amber-800">{progress}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-amber-100">
        <div
          className="h-full rounded-full bg-amber-500 transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
      {message && <p className="mt-2 text-xs text-amber-800">{message}</p>}
    </div>
  );
}
