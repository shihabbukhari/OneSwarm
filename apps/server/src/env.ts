import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Load the repo-root .env (if any) without overriding real environment variables. */
function loadEnvFile(): void {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const candidate = resolve(dir, ".env");
    if (existsSync(candidate) && existsSync(resolve(dir, "pnpm-workspace.yaml"))) {
      loadDotenv({ path: candidate, quiet: true });
      return;
    }
    dir = resolve(dir, "..");
  }
}
loadEnvFile();

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a non-negative number`);
  return n;
}

const nodeEnv = process.env.NODE_ENV ?? "development";
const port = int("SERVER_PORT", int("PORT", 4000));
const appSecret =
  process.env.APP_SECRET ??
  (nodeEnv === "production" ? "" : "dev-secret-not-for-production-use-000");
if (appSecret.length < 32) {
  throw new Error(
    "APP_SECRET must be at least 32 characters. Generate one with: openssl rand -base64 32",
  );
}

export const env = {
  nodeEnv,
  isProd: nodeEnv === "production",
  port,
  host: process.env.SERVER_HOST ?? "0.0.0.0",
  databaseUrl: process.env.DATABASE_URL ?? "pglite://./.pglite/dev",
  appSecret,
  publicWsUrl: process.env.PUBLIC_WS_URL ?? `ws://localhost:${port}/ws`,
  publicServerUrl: process.env.PUBLIC_SERVER_URL ?? `http://localhost:${port}`,
  publicAppUrl: process.env.PUBLIC_APP_URL ?? "http://localhost:3000",
  defaultBridgeServer: process.env.DEFAULT_BRIDGE_SERVER ?? "https://oneswarm.online",
  storageDriver: (process.env.STORAGE_DRIVER ?? "local") as "local" | "s3",
  storageDir: process.env.STORAGE_DIR ?? "./.storage",
  s3: {
    endpoint: process.env.S3_ENDPOINT ?? "",
    region: process.env.S3_REGION ?? "auto",
    bucket: process.env.S3_BUCKET ?? "",
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  },
  limits: {
    maxFileSizeBytes: int("MAX_FILE_SIZE_MB", 25) * 1024 * 1024,
    workspaceStorageBytes: int("WORKSPACE_STORAGE_GB", 10) * 1024 * 1024 * 1024,
    agentMessagesPerHour: int("AGENT_MESSAGES_PER_HOUR", 300),
  },
  authRateLimitPerMin: int("AUTH_RATE_LIMIT_PER_MIN", 20),
  migrateOnStart: process.env.MIGRATE_ON_START === "1",
  trustProxy: process.env.TRUST_PROXY === "true",
};
