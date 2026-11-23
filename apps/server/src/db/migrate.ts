import { env } from "../env";
import { openDb } from "./client";

const handle = await openDb(env.databaseUrl);
await handle.migrate();
await handle.close();
console.log(`[oneswarm] migrations applied (${handle.kind})`);
