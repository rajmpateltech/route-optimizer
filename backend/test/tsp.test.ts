import { describe, expect, it } from 'vitest';
import { solveTSP } from '../src/optimize/tsp';

function costOf(route: number[], d: Float32Array, n: number): number {
  let c = 0;
  for (let i = 0; i < route.length - 1; i++) c += d[route[i] * n + route[i + 1]];
  return c;
}

describe('solveTSP', () => {
  it('solves a straight line', () => {
    // Points on a line: 0-1-2-3. Costs along the line only.
    const n = 4;
    const d = new Float32Array(n * n).fill(1e9);
    const line = [1, 2, 3];
    for (let i = 0; i < n; i++) {
      d[i * n + i] = 0;
    }
    // 0 is one end; force adjacency along line
    d[0 * n + 1] = 1; d[1 * n + 0] = 1;
    d[1 * n + 2] = 1; d[2 * n + 1] = 1;
    d[2 * n + 3] = 1; d[3 * n + 2] = 1;
    const route = solveTSP(d, n);
    expect(route.length).toBe(n);
    const cost = costOf(route, d, n);
    // optimal open path cost = 3
    expect(cost).toBe(3);
  });

  it('respects a fixed asymmetric matrix (triangle inequality-ish)', () => {
    const n = 5;
    const coords: [number, number][] = [
      [0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0.5],
    ];
    const d = new Float32Array(n * n);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        d[i * n + j] = Math.hypot(
          coords[i][0] - coords[j][0],
          coords[i][1] - coords[j][1],
        );
      }
    }
    const route = solveTSP(d, n);
    expect(new Set(route).size).toBe(n);
    expect(route[0]).toBeGreaterThanOrEqual(0);
  });

  it('handles single node', () => {
    expect(solveTSP(new Float32Array(1), 1)).toEqual([0]);
  });

  it('pins the route to a fixed start node', () => {
    // 0 is far from the rest, so a free solve would not start there.
    const n = 4;
    const coords: [number, number][] = [
      [10, 10], [0, 0], [0, 1], [1, 0],
    ];
    const d = new Float32Array(n * n);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        d[i * n + j] = Math.hypot(
          coords[i][0] - coords[j][0],
          coords[i][1] - coords[j][1],
        );
      }
    }
    const route = solveTSP(d, n, 0);
    expect(route[0]).toBe(0);
    expect(new Set(route).size).toBe(n);
    // Start at (10,10) -> nearest of the three (~sqrt(181)) then the 2-edge
    // open path through the remaining two (1 + 1).
    expect(costOf(route, d, n)).toBeCloseTo(Math.sqrt(181) + 2, 5);
  });

  it('ignores an out-of-range fixed start', () => {
    const n = 3;
    const d = new Float32Array(n * n).fill(1);
    for (let i = 0; i < n; i++) d[i * n + i] = 0;
    const route = solveTSP(d, n, 99);
    expect(route.length).toBe(n);
  });

  it('never lets a middle stop overtake the fixed start during Or-opt', () => {
    // 0 is far from the other two; pulling 1 to the front is tempting
    // (1->0->2 is shorter than 0->1->2) but forbidden when 0 is pinned.
    const n = 3;
    const d = new Float32Array(n * n).fill(0);
    d[0 * n + 1] = 65; d[1 * n + 0] = 65;      // 0-1 close
    d[1 * n + 2] = 3100; d[2 * n + 1] = 3100;  // 1-2 far
    d[0 * n + 2] = 3000; d[2 * n + 0] = 3000;  // 0-2 far
    const route = solveTSP(d, n, 0);
    expect(route[0]).toBe(0);
    // The pinned optimum is 0 -> 1 -> 2 (65 + 3100), not 1 -> 0 -> 2.
    expect(route).toEqual([0, 1, 2]);
  });
});
