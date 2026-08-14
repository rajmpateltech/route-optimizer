import { config } from '../config';
import { osrmRoute, type Coord } from '../matrix/osrm';
import type { RouteLeg, RouteStep, StopRow } from '../types';

/**
 * Runs OSRM Route requests over the optimized order in chunks of <= N
 * waypoints (OSRM default cap is 100; Google-style 25 is not a constraint for
 * self-hosted OSRM). Concatenates leg geometry into one polyline and flattens
 * step-by-step turn instructions.
 */
export async function assembleRoute(
  ordered: StopRow[],
): Promise<{
  geometry: [number, number][];
  steps: RouteStep[];
  legs: RouteLeg[];
  totalDistanceKm: number;
  totalDurationMin: number;
}> {
  const maxWp = Math.max(2, config.osrm.routeMaxWaypoints);
  const geometry: [number, number][] = [];
  const steps: RouteStep[] = [];
  const legs: RouteLeg[] = [];
  let totalDistance = 0;
  let totalDuration = 0;

  steps.push({
    stop_index: 0,
    type: 'depart',
    instruction: 'Depart from stop 1',
    maneuver: 'depart',
  });

  // Chunk the sequence into requests of maxWp waypoints each.
  for (let offset = 0; offset < ordered.length - 1; offset += maxWp - 1) {
    const chunk = ordered.slice(offset, offset + maxWp);
    if (chunk.length < 2) continue;

    const coords: Coord[] = chunk.map((s) => ({ lat: s.lat!, lng: s.lng! }));
    const res = await osrmRoute(coords);

    // Append geometry (dedupe the shared joint point).
    if (geometry.length > 0 && res.geometry.length > 0) {
      const last = geometry[geometry.length - 1];
      const first = res.geometry[0];
      if (Math.abs(last[0] - first[0]) < 1e-7 && Math.abs(last[1] - first[1]) < 1e-7) {
        res.geometry.shift();
      }
    }
    geometry.push(...res.geometry);

    totalDistance += res.distance;
    totalDuration += res.duration;

    // Flatten steps across legs of this chunk.
    res.legs.forEach((leg, li) => {
      const fromIndex = offset + li;
      const toIndex = offset + li + 1;
      for (const step of leg.steps) {
        if (step.maneuver.type === 'depart') continue;
        steps.push({
          stop_index: fromIndex,
          type: 'turn',
          instruction:
            step.maneuver.instruction ||
            `${step.maneuver.type} on ${step.name || 'unnamed road'}`,
          name: step.name,
          distance_m: step.distance,
          duration_s: step.duration,
          maneuver: step.maneuver.type,
          modifier: step.maneuver.modifier,
        });
      }
      const legDur = leg.steps.reduce((acc, s) => acc + (s.duration || 0), 0);
      const legDist = leg.steps.reduce((acc, s) => acc + (s.distance || 0), 0);
      legs.push({
        from: fromIndex,
        to: toIndex,
        distance_m: legDist || leg.distance,
        duration_s: legDur || leg.duration,
      });
      steps.push({
        stop_index: toIndex,
        type: 'arrive',
        instruction: `Arrive at stop ${toIndex + 1}: ${ordered[toIndex].label || ordered[toIndex].address}`,
        distance_m: stepDistance(leg.steps),
        duration_s: stepDuration(leg.steps),
        maneuver: 'arrive',
      });
    });
  }

  return {
    geometry,
    steps,
    legs,
    totalDistanceKm: totalDistance / 1000,
    totalDurationMin: totalDuration / 60,
  };
}

function stepDistance(steps: { distance?: number }[]): number {
  return steps.reduce((acc, s) => acc + (s.distance || 0), 0);
}

function stepDuration(steps: { duration?: number }[]): number {
  return steps.reduce((acc, s) => acc + (s.duration || 0), 0);
}
