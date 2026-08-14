import path from 'node:path';
import fs from 'node:fs';
import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config';
import { errorHandler, AppError } from './utils/http';
import { authRoutes } from './auth/routes';
import { jobRoutes } from './jobs/routes';
import { migrate } from './db/pool';

export function createApp(): Express {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json({ limit: '20mb' }));
  if (config.nodeEnv !== 'test') {
    app.use(morgan(config.isProd ? 'combined' : 'dev'));
  }

  app.get('/health', (_req, res) => {
    res.json({ ok: true, name: 'RouteOptimizer API' });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/jobs', jobRoutes);

  // Serve the built SPA when available.
  const staticDir =
    config.staticDir || path.join(__dirname, '../../frontend/dist');
  if (fs.existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  app.use((req, _res, next) => {
    next(new AppError(404, `Not found: ${req.method} ${req.path}`));
  });

  app.use(errorHandler);
  return app;
}

export async function runMigrations(): Promise<void> {
  await migrate();
}
