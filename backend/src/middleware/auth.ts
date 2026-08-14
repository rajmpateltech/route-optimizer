import type { RequestHandler } from 'express';
import { verifyToken } from '../auth/service';
import { AppError } from '../utils/http';
import type { AuthUser } from '../types';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user: AuthUser;
    }
  }
}

export function requireAuth(): RequestHandler {
  return (req, _res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      next(new AppError(401, 'Authentication required'));
      return;
    }
    try {
      req.user = verifyToken(header.slice('Bearer '.length));
      next();
    } catch (err) {
      next(err);
    }
  };
}
