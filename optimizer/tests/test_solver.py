import numpy as np
import pytest

from app.solver import (
    haversine_matrix,
    refine_junctions,
    open_tsp_order,
    solve_flat,
    solve_clustered,
)


def _dist_matrix(coords):
    return np.linalg.norm(coords[:, None, :] - coords[None, :, :], axis=2)


def test_haversine_matrix_diagonal_zero():
    coords = np.array([[0.0, 0.0], [10.0, 0.0]])
    m = haversine_matrix(coords)
    assert m[0, 0] == pytest.approx(0)
    assert m[1, 1] == pytest.approx(0)
    # 10 degrees latitude ~= 1111 km
    assert 1_100_000 < m[0, 1] < 1_130_000


def test_open_tsp_on_line():
    # 4 nodes on a line, costs = distance along line
    coords = np.array([[0.0], [1.0], [2.0], [3.0]])
    d = np.abs(coords - coords.T)
    order = open_tsp_order(d, start=0, budget_s=5)
    assert sorted(order) == [0, 1, 2, 3]
    # optimal open path cost = 3
    cost = sum(d[order[i], order[i + 1]] for i in range(len(order) - 1))
    assert cost == pytest.approx(3.0)


def test_refine_junctions_improves_seam():
    n = 8
    rng = np.random.default_rng(7)
    coords = rng.uniform(0, 1, (n, 2))
    d = np.linalg.norm(coords[:, None, :] - coords[None, :, :], axis=2)
    order = list(range(n))
    # Force a bad seam: swap two nodes across the boundary
    bad = [1, 0, 3, 2, 4, 5, 7, 6]
    cost_before = sum(d[bad[i], bad[i + 1]] for i in range(n - 1))
    improved = refine_junctions(bad, d, junctions=[2, 4, 6], window=6)
    cost_after = sum(d[improved[i], improved[i + 1]] for i in range(n - 1))
    assert cost_after <= cost_before


def test_solve_flat_pins_start():
    rng = np.random.default_rng(3)
    coords = rng.uniform(0, 1, (20, 2))
    d = _dist_matrix(coords)
    order = solve_flat(d, coords, start=7)
    assert order[0] == 7
    assert sorted(order) == list(range(20))


def test_solve_clustered_pins_start():
    rng = np.random.default_rng(11)
    coords = rng.uniform(0, 1, (300, 2))
    d = _dist_matrix(coords)
    order = solve_clustered(d, coords, start=42)
    assert order[0] == 42
    assert sorted(order) == list(range(300))
