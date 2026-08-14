function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="text-lg font-semibold text-slate-900">{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

export function StatsPanel({
  stops,
  totalDistanceKm,
  totalDurationMin,
  legs,
}: {
  stops: number;
  totalDistanceKm: number;
  totalDurationMin: number;
  legs: { distance_m: number; duration_s: number }[];
}) {
  const totalLegKm = legs.reduce((a, l) => a + l.distance_m / 1000, 0);
  const avgSpeed = totalDurationMin > 0 ? totalDistanceKm / (totalDurationMin / 60) : 0;
  const avgLegKm = legs.length ? totalLegKm / legs.length : 0;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Stat label="Total distance" value={`${totalDistanceKm.toFixed(1)} km`} sub="driving distance" />
      <Stat label="Total time" value={fmtDuration(totalDurationMin)} sub="estimated driving" />
      <Stat label="Stops" value={String(stops)} sub="in one route" />
      <Stat
        label="Avg speed"
        value={avgSpeed.toFixed(0) + ' km/h'}
        sub={`${avgLegKm.toFixed(2)} km avg leg`}
      />
    </div>
  );
}
