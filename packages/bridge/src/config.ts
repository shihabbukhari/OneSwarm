import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** The bridge's own state: its OneSwarm device token. Nothing from any agent is stored here. */
export interface BridgeConfig {
  server: string;
  wsUrl: string;
  deviceId: string;
  workspaceId: string;
  deviceToken: string;
}

export function homeDir(): string {
  return process.env.ONESWARM_HOME ?? join(homedir(), ".oneswarm");
}

function configPath(): string {
  return join(homeDir(), "bridge.json");
}

export function loadConfig(): BridgeConfig | null {
  const path = configPath();
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as BridgeConfig;
  } catch {
    return null;
  }
}

export function saveConfig(config: BridgeConfig): void {
  mkdirSync(homeDir(), { recursive: true, mode: 0o700 });
  writeFileSync(configPath(), JSON.stringify(config, null, 2), { mode: 0o600 });
  chmodSync(configPath(), 0o600);
}

export function clearConfig(): void {
  rmSync(configPath(), { force: true });
}
