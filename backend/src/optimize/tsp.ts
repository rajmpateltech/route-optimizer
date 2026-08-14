/**
 * Fast nearest-neighbour + 2-opt + Or-opt TSP solver for small problem sizes
 * (< ~100 stops). Used as an instant fallback so small jobs never need to
 * wait for the Python/OR-Tools service.
 *
 * When `fixedStart >= 0` the route is forced to begin at that node (used when
 * a start address is configured, which is always stop index 0). Otherwise the
 * best start is picked automatically.
 */
export function solveTSP(
  durations: Float32Array,
  n: number,
  fixedStart: number = -1,
): number[] {
  if (n === 0) return [];
  if (n === 1) return [0];

  let best: number[] | null = null;
  let bestCost = Infinity;

  // Nearest neighbour. With a fixed start only that start is tried; otherwise
  // every possible start is considered (n is small, this is cheap).
  const starts = fixedStart >= 0 && fixedStart < n ? [fixedStart] : range(n);
  for (const start of starts) {
    const route = [start];
    const visited = new Uint8Array(n);
    visited[start] = 1;
    let cost = 0;
    let cur = start;
    for (let k = 1; k < n; k++) {
      let bestNext = -1;
      let bestD = Infinity;
      const base = cur * n;
      for (let j = 0; j < n; j++) {
        if (!visited[j]) {
          const d = durations[base + j];
          if (d < bestD) {
            bestD = d;
            bestNext = j;
          }
        }
      }
      route.push(bestNext);
      visited[bestNext] = 1;
      cost += bestD;
      cur = bestNext;
    }
    if (cost < bestCost) {
      bestCost = cost;
      best = route.slice();
    }
  }

  if (!best) return [0];

  // 2-opt local search.
  twoOpt(best, durations, n);

  // Or-opt: relocate short chains of nodes (length 1..3). With a fixed start,
  // never detach the head segment so the start node stays put.
  orOpt(best, durations, n, fixedStart >= 0);

  return best;
}

function range(n: number): number[] {
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) out[i] = i;
  return out;
}

function routeCost(route: number[], durations: Float32Array, n: number): number {
  let cost = 0;
  for (let i = 0; i < route.length - 1; i++) {
    cost += durations[route[i] * n + route[i + 1]];
  }
  return cost;
}

function twoOpt(route: number[], durations: Float32Array, n: number): void {
  const m = route.length;
  let improved = true;
  let passes = 0;
  while (improved && passes < 40) {
    improved = false;
    passes++;
    for (let i = 0; i < m - 1; i++) {
      const a = route[i];
      const b = route[i + 1];
      for (let j = i + 2; j < m - 1; j++) {
        const c = route[j];
        const d = route[j + 1];
        const before = durations[a * n + b] + durations[c * n + d];
        const after = durations[a * n + c] + durations[b * n + d];
        if (after < before) {
          // reverse segment i+1..j
          for (let lo = i + 1, hi = j; lo < hi; lo++, hi--) {
            [route[lo], route[hi]] = [route[hi], route[lo]];
          }
          improved = true;
        }
      }
    }
  }
}

function orOpt(
  route: number[],
  durations: Float32Array,
  n: number,
  keepHead: boolean,
): void {
  const m = route.length;
  for (let segLen = 1; segLen <= 3; segLen++) {
    let improved = true;
    let guard = 0;
    while (improved && guard < 10) {
      improved = false;
      guard++;
      for (let i = 0; i <= m - segLen - 1; i++) {
        // Detaching the head segment would move the fixed start node.
        if (keepHead && i === 0) continue;
        const seg = route.slice(i, i + segLen);
        const before = route.slice(0, i).concat(route.slice(i + segLen));
        for (let j = 0; j <= before.length; j++) {
          if (j === i) continue;
          // Inserting before the head also displaces the fixed start node.
          if (keepHead && j === 0) continue;
          const candidate = before
            .slice(0, j)
            .concat(seg)
            .concat(before.slice(j));
          if (routeCost(candidate, durations, n) < routeCost(route, durations, n)) {
            route.splice(0, route.length, ...candidate);
            improved = true;
            break;
          }
        }
      }
    }
  }
}

export { routeCost };
