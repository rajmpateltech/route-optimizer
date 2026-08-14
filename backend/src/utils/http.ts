import type { NextFunction, Request, RequestHandler, Response } from 'express';

export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }
  const message = err instanceof Error ? err.message : 'Internal server error';
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: 'Internal server error', message });
}
