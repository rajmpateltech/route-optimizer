import os

import numpy as np
import psycopg

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgres://postgres:postgres@localhost:5432/routeoptimizer",
)


def connect():
    return psycopg.connect(DATABASE_URL)


def load_matrix(job_id: str):
    """Load the NxN travel matrix (float32 little-endian bytea)."""
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT n, distances, durations FROM matrices WHERE job_id = %s",
            (job_id,),
        )
        row = cur.fetchone()
        if row is None:
            raise ValueError(f"no matrix for job {job_id}")
        n, dist_bytes, dur_bytes = row
        distances = np.frombuffer(dist_bytes, dtype="<f4").reshape(n, n)
        durations = np.frombuffer(dur_bytes, dtype="<f4").reshape(n, n)
        return n, distances, durations


def load_stops(job_id: str):
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT id, input_index, lat, lng FROM stops "
            "WHERE job_id = %s ORDER BY input_index",
            (job_id,),
        )
        rows = cur.fetchall()
    ids = [r[0] for r in rows]
    coords = np.asarray([[r[2], r[3]] for r in rows], dtype=np.float64)
    return ids, coords


def set_progress(job_id: str, pct: float):
    try:
        with connect() as conn, conn.cursor() as cur:
            cur.execute(
                "UPDATE jobs SET progress = %s, phase = 'Solving route order', "
                "updated_at = now() WHERE id = %s AND status = 'optimizing'",
                (int(pct), job_id),
            )
    except Exception:
        # Progress reporting must never fail an optimization.
        pass
