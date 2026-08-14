import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import type { Stop } from '../types';

function numberedIcon(index: number, total: number): L.DivIcon {
  const cls =
    index === 0 ? 'marker-num marker-num--start' : index === total - 1 ? 'marker-num marker-num--end' : 'marker-num';
  return L.divIcon({
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    html: `<div class="${cls}">${index + 1}</div>`,
  });
}

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 0) {
      map.fitBounds(positions as L.LatLngBoundsExpression, { padding: [40, 40] });
    }
  }, [map, positions]);
  return null;
}

export function RouteMap({
  geometry,
  orderedStops,
}: {
  geometry: [number, number][];
  orderedStops: (Stop & { order: number })[];
}) {
  const bounds: [number, number][] = useMemo(() => {
    const b: [number, number][] = [];
    for (const s of orderedStops) if (s.lat != null && s.lng != null) b.push([s.lat, s.lng]);
    return b;
  }, [orderedStops]);

  const ordered = useMemo(
    () =>
      [...orderedStops]
        .sort((a, b) => a.order - b.order)
        .filter((s) => s.lat != null && s.lng != null) as (Stop & { order: number; lat: number; lng: number })[],
    [orderedStops],
  );

  return (
    <div className="h-[480px] overflow-hidden rounded-xl border border-slate-200 shadow-sm">
      <MapContainer
        center={bounds[0] || [0, 0]}
        zoom={5}
        scrollWheelZoom
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds positions={bounds} />
        {geometry.length > 1 && (
          <Polyline positions={geometry as [number, number][]} pathOptions={{ color: '#2563eb', weight: 4, opacity: 0.85 }} />
        )}
        {ordered.map((s, i) => (
          <Marker key={s.id} position={[s.lat, s.lng]} icon={numberedIcon(i, ordered.length)} />
        ))}
      </MapContainer>
    </div>
  );
}
