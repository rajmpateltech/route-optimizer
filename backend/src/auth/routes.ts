import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError } from '../utils/http';
import { loginUser, registerUser, signToken } from './service';
import { requireAuth } from '../middleware/auth';
import { rateLimit } from '../middleware/ratelimit';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

router.post(
  '/register',
  rateLimit({ limit: 20, windowSec: 900 }),
  asyncHandler(async (req, res) => {
    const body = registerSchema.parse(req.body);
    const user = await registerUser(body.email, body.password);
    res.status(201).json({ token: signToken(user), user });
  }),
);

router.post(
  '/login',
  rateLimit({ limit: 20, windowSec: 900 }),
  asyncHandler(async (req, res) => {
    const body = registerSchema.pick({ email: true, password: true }).parse(req.body);
    const user = await loginUser(body.email, body.password);
    res.json({ token: signToken(user), user });
  }),
);

router.get(
  '/me',
  requireAuth(),
  asyncHandler(async (req, res) => {
    res.json({ user: req.user });
  }),
);

export const authRoutes = router;

export { AppError };
