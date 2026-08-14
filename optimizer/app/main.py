from pydantic import BaseModel
from fastapi import FastAPI, HTTPException

from . import db
from .solver import optimize

app = FastAPI(title="RouteOptimizer Optimizer", version="1.0.0")


class SolveRequest(BaseModel):
    job_id: str
    # Index of the stop the route must begin at (0 = user start address or the
    # first listed stop). OR-Tools pins this node as the route depot.
    start_index: int = 0


class SolveResponse(BaseModel):
    job_id: str
    ordered: list[int]
    method: str


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/solve", response_model=SolveResponse)
def solve(req: SolveRequest):
    try:
        n, _d, _t = db.load_matrix(req.job_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    if n < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 stops")

    method = "ortools-clustered" if n > 1500 else "ortools"
    try:
        ordered = optimize(
            req.job_id,
            start_index=req.start_index,
            progress=lambda p: db.set_progress(req.job_id, p),
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"optimization failed: {exc}")

    return SolveResponse(job_id=req.job_id, ordered=ordered, method=method)
