/**
 * Runs once when the server starts. In REAL production (see src/lib/runtime.ts) it refuses to boot with unsafe settings
 * (missing/weak CRON_SECRET, AUTH_SECRET, ENCRYPTION_KEY) and logs loud warnings for risky ones (fake mode, default passwords, demo shop).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { fatalProductionProblems, productionWarnings } = await import("./lib/runtime");
  const fatal = fatalProductionProblems();
  if (fatal.length) {
    for (const f of fatal) console.error(`[startup] FATAL: ${f}`);
    throw new Error(`Refusing to start: ${fatal.length} unsafe production setting(s). See the log above.`);
  }
  for (const w of productionWarnings()) console.error(`[startup] WARNING: ${w}`);
}
