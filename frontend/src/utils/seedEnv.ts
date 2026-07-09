/**
 * Whether the running frontend is in an environment where seeding test data is
 * offered. Mirrors the backend's closed-by-default allow-list (development /
 * staging). This only controls button visibility — the real gate is the
 * backend endpoint, which 404s everywhere else.
 */
export function isSeedEnvironment(): boolean {
  const env = (import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined)?.toLowerCase();
  if (env) return env === 'development' || env === 'staging';
  // No explicit env set → treat Vite dev mode as development.
  return import.meta.env.DEV === true;
}
