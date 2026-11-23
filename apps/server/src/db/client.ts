import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface DbHandle {
  db: Db;
  kind: "postgres" | "pglite";
  migrate(): Promise<void>;
  close(): Promise<void>;
}

function migrationsFolder(): string {
  // Works from src/db (tsx) and from dist (bundled): look for ../drizzle or ../../drizzle.
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [resolve(here, "../../drizzle"), resolve(here, "../drizzle")]) {
    if (existsSync(resolve(candidate, "meta/_journal.json"))) return candidate;
  }
  throw new Error("Could not find the drizzle migrations folder. Run `pnpm db:generate`.");
}

/**
 * `postgres://…` uses node-postgres. `pglite://<dir>` or `pglite://memory` runs
 * Postgres in-process (used by the end-to-end tests and Docker-less setups).
 */
export async function openDb(url: string): Promise<DbHandle> {
  if (url.startsWith("pglite:")) {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const target = url.replace(/^pglite:(\/\/)?/, "");
    let client: InstanceType<typeof PGlite>;
    if (target === "memory" || target === "") {
      client = new PGlite();
    } else {
      const dir = resolve(process.cwd(), target);
      mkdirSync(dir, { recursive: true });
      client = new PGlite(dir);
    }
    const db = drizzle(client, { schema });
    return {
      db: db as unknown as Db,
      kind: "pglite",
      migrate: () => migrate(db, { migrationsFolder: migrationsFolder() }),
      close: () => client.close(),
    };
  }
  const pg = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const pool = new pg.default.Pool({ connectionString: url, max: 10 });
  const db = drizzle(pool, { schema });
  return {
    db: db as unknown as Db,
    kind: "postgres",
    migrate: () => migrate(db, { migrationsFolder: migrationsFolder() }),
    close: () => pool.end(),
  };
}
