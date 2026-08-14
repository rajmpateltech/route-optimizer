import 'dotenv/config';

function num(v: string | undefined, d: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
}

export const config = {
  port: num(process.env.PORT, 8080),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',

  databaseUrl:
    process.env.DATABASE_URL ||
    'postgres://postgres:postgres@localhost:5432/routeoptimizer',
  redisUrl: process.env.REDIS_URL || '',

  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173').split(','),

  // Served SPA assets (empty in dev; set in production when the frontend build
  // is copied next to the backend dist).
  staticDir: process.env.STATIC_DIR || '',

  osrm: {
    mode: (process.env.OSRM_MODE || 'hosted') as 'hosted' | 'selfhosted',
    baseUrl: process.env.OSRM_URL || 'https://router.project-osrm.org',
    tableChunkSize: num(process.env.OSRM_TABLE_CHUNK, 100),
    routeMaxWaypoints: num(process.env.OSRM_ROUTE_WAYPOINTS, 90),
    // The public demo server only accepts GET (coordinates in the URL path).
    // Self-hosted OSRM also supports POST, which is preferable for very large
    // chunks. Default GET works everywhere within URL length limits.
    usePost: process.env.OSRM_USE_POST === 'true',
    // Respect the public demo server; self-hosted deployments can set 0.
    throttleMs: num(process.env.OSRM_THROTTLE_MS, 700),
  },

  geocode: {
    provider: (process.env.GEOCODER || 'nominatim') as
      | 'nominatim'
      | 'photon'
      | 'manual',
    nominatimBase:
      process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org',
    photonBase: process.env.PHOTON_URL || 'https://photon.komoot.io',
    // ISO-3166-1 alpha-2 country code(s) to bias results (e.g. "ca"). Empty = global.
    countryCodes: process.env.GEOCODER_COUNTRY_CODES || '',
    minDelayMs: num(process.env.GEOCODE_DELAY_MS, 1100),
    timeoutMs: num(process.env.GEOCODE_TIMEOUT_MS, 12000),
    maxRetries: num(process.env.GEOCODE_RETRIES, 2),
  },

  optimizer: {
    baseUrl: process.env.OPTIMIZER_URL || 'http://localhost:8090',
  },

  limits: {
    maxStopsPerJob: num(process.env.MAX_STOPS_PER_JOB, 5000),
    maxJobsPerUser: num(process.env.MAX_JOBS_PER_USER, 100),
    maxFileBytes: num(process.env.MAX_FILE_BYTES, 10 * 1024 * 1024),
  },
} as const;

export type Config = typeof config;
