import { env } from "./env";
import { buildApp } from "./app";
import { BridgeHub } from "./bridge-hub";
import { openDb } from "./db/client";
import { RealtimeHub } from "./realtime";
import { createStorage } from "./storage";

async function main(): Promise<void> {
  const handle = await openDb(env.databaseUrl);
  if (env.migrateOnStart || handle.kind === "pglite") await handle.migrate();
  const ctx = {
    db: handle.db,
    hub: new RealtimeHub(),
    bridges: new BridgeHub(),
    storage: createStorage(),
  };
  const app = await buildApp(ctx);
  await app.listen({ port: env.port, host: env.host });
  console.log(`[oneswarm] server on http://localhost:${env.port} (db: ${handle.kind})`);

  const shutdown = async () => {
    await app.close();
    await handle.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
