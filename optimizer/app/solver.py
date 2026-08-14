"""TSP optimization on a travel-time matrix using Google OR-Tools.

For up to ~1500 stops the full matrix is solved directly. Beyond that the
problem is decomposed hierarchically (k-means clusters -> cluster order ->
per-cluster open TSP -> junction refinement), which keeps memory bounded and
runtime reasonable for up to 5000 stops.
"""
import math

import numpy as np
from ortools.constraint_solver import pywrapcp, routing_enums_pb2

# Above this size we decompose the problem instead of solving the full matrix.
CLUSTER_THRESHOLD = 1500
# Target stops per cluster.
TARGET_CLUSTER_SIZE = 250


def open_tsp_order(durations: np.ndarray, start: int = 0, budget_s: int = 20) -> list[int]:
    """Open-path TSP via OR-Tools. A dummy sink node makes the tour a path."""
    n = int(durations.shape[0])
    dummy = n
    manager = pywrapcp.RoutingIndexManager(n + 1, 1, [start], [dummy])
    routing = pywrapcp.RoutingModel(manager)
    durations_i = durations.astype(np.int64)

    def transit(from_idx: int, to_idx: int) -> int:
        f = manager.IndexToNode(from_idx)
        t = manager.IndexToNode(to_idx)
        if f == dummy or t == dummy:
            return 0
        return int(durations_i[f, t])

    cb = routing.RegisterTransitCallback(transit)
    routing.SetArcCostEvaluatorOfAllVehicles(cb)

    params = pywrapcp.DefaultRoutingSearchParameters()
    params.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    )
    params.local_search_metaheuristic = (
        routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    )
    params.time_limit.seconds = max(1, int(budget_s))

    solution = routing.SolveWithParameters(params)
    if solution is None:
        raise RuntimeError("OR-Tools returned no solution")

    order: list[int] = []
    index = routing.Start(0)
    while not routing.IsEnd(index):
        node = manager.IndexToNode(index)
        if node != dummy:
            order.append(int(node))
        index = solution.Value(routing.NextVar(index))
    return order


def haversine_matrix(coords: np.ndarray) -> np.ndarray:
    """Pairwise great-circle distance matrix (meters)."""
    lat = np.radians(coords[:, 0])
    lng = np.radians(coords[:, 1])
    dlat = lat[:, None] - lat[None, :]
    dlng = lng[:, None] - lng[None, :]
    a = (
        np.sin(dlat / 2) ** 2
        + np.cos(lat[:, None]) * np.cos(lat[None, :]) * np.sin(dlng / 2) ** 2
    )
    R = 6371000.0
    return R * 2 * np.arctan2(np.sqrt(a), np.sqrt(1 - a))


def _distance(a, b) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def solve_flat(
    durations: np.ndarray,
    coords: np.ndarray,
    start: int = 0,
    progress=None,
) -> list[int]:
    n = int(durations.shape[0])
    budget = 15 if n <= 300 else (30 if n <= 800 else 60)
    # The route always begins at the pinned start node (user start address or
    # first listed stop).
    order = open_tsp_order(durations, start=int(start), budget_s=budget)
    if progress:
        progress(85)
    return order


def solve_clustered(
    durations: np.ndarray,
    coords: np.ndarray,
    start: int = 0,
    progress=None,
) -> list[int]:
    from sklearn.cluster import KMeans

    n = int(durations.shape[0])
    k = max(2, min(n, math.ceil(n / TARGET_CLUSTER_SIZE)))
    kmeans = KMeans(n_clusters=k, n_init=10, random_state=42).fit(coords)
    labels = kmeans.labels_
    centers = kmeans.cluster_centers_

    # Order the clusters themselves (haversine is fine at this scale).
    d_centers = haversine_matrix(centers)
    cluster_order = open_tsp_order(d_centers, start=0, budget_s=10)
    # Force the cluster containing the pinned start node to be visited first.
    start_cluster = int(labels[start])
    cluster_order = [start_cluster] + [
        c for c in cluster_order if c != start_cluster
    ]

    members: dict[int, list[int]] = {}
    for c in range(k):
        members[c] = np.where(labels == c)[0].tolist()

    global_centroid = coords.mean(axis=0)
    full_order: list[int] = []
    junctions: list[int] = []
    prev_exit: int | None = None

    for ci, c in enumerate(cluster_order):
        cluster_members = members[c]
        if not cluster_members:
            continue
        sub = np.asarray(cluster_members, dtype=np.int64)
        if prev_exit is None:
            if c == start_cluster:
                # Enter the first cluster exactly at the pinned start node.
                entry_local = int(np.where(sub == int(start))[0][0])
            else:
                entry_local = int(
                    np.argmin(np.sum((coords[sub] - global_centroid) ** 2, axis=1))
                )
        else:
            entry_local = int(
                np.argmin(
                    np.sum((coords[sub] - coords[prev_exit]) ** 2, axis=1)
                )
            )
        sub_matrix = durations[np.ix_(sub, sub)]
        cluster_budget = 10 + len(sub) // 10
        path_local = open_tsp_order(
            sub_matrix, start=entry_local, budget_s=min(30, cluster_budget)
        )
        path = [int(sub[i]) for i in path_local]
        if not full_order:
            junctions.append(len(path))
        else:
            junctions.append(len(full_order) + len(path))
        full_order.extend(path)
        prev_exit = path[-1]
        if progress:
            progress(70 + int(15 * (ci + 1) / len(cluster_order)))

    if progress:
        progress(85)
    return refine_junctions(full_order, durations, junctions)


def refine_junctions(
    order: list[int],
    durations: np.ndarray,
    junctions: list[int],
    window: int = 24,
) -> list[int]:
    """Windowed 2-opt around cluster boundaries to fix suboptimal seams."""
    order = order[:]
    n = len(order)
    improved = True
    guard = 0
    while improved and guard < 3:
        improved = False
        guard += 1
        for jc in junctions:
            lo = max(0, jc - window)
            hi = min(n - 1, jc + window)
            for i in range(lo, hi - 1):
                a = order[i]
                b = order[i + 1]
                for j in range(i + 2, hi):
                    c = order[j]
                    d = order[j + 1]
                    cur = durations[a, b] + durations[c, d]
                    new = durations[a, c] + durations[b, d]
                    if new < cur:
                        order[i + 1 : j + 1] = reversed(order[i + 1 : j + 1])
                        improved = True
    return order


def optimize(job_id: str, start_index: int = 0, progress=None) -> list[int]:
    from . import db

    n, distances, durations = db.load_matrix(job_id)
    ids, coords = db.load_stops(job_id)
    if n >= 2 and coords.shape[0] != n:
        raise ValueError("matrix/stop count mismatch")
    if not (0 <= start_index < n):
        raise ValueError("start_index out of range")

    if n <= CLUSTER_THRESHOLD:
        order = solve_flat(durations, coords, start=start_index, progress=progress)
        method = "ortools"
    else:
        order = solve_clustered(durations, coords, start=start_index, progress=progress)
        method = "ortools-clustered"

    if len(order) != n:
        raise RuntimeError(f"optimizer returned {len(order)} of {n} stops")
    return order
