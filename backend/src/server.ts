import { createApp, runMigrations } from './app';
import { config } from './config';
import { closePool } from './db/pool';

async function main(): Promise<void> {
  await runMigrations();
  const app = createApp();
  const server = app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`RouteOptimizer API listening on :${config.port} (${config.nodeEnv})`);
  });

  const shutdown = async (signal: string) => {
    // eslint-disable-next-line no-console
    console.log(`${signal} received, shutting down...`);
    server.close(async () => {
      await closePool();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal startup error:', err);
  process.exit(1);
});
