import { hostname, platform } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AgentHost } from "./agent-host";
import { clearConfig, loadConfig, saveConfig, type BridgeConfig } from "./config";
import { BRIDGE_VERSION, ServerConnection } from "./connection";
import { runFilesServer } from "./mcp-files";
import { detectAgents } from "./registry";

const DEFAULT_SERVER = "https://oneswarm.online";

const HELP = `oneswarm-bridge ${BRIDGE_VERSION}

Connect the coding agents on this computer to your OneSwarm workspace.
Agents use their own existing logins. The bridge never reads or sends credentials
and never opens a listening port.

Usage
  npx oneswarm-bridge connect <code>   Pair this computer and start the bridge
  npx oneswarm-bridge connect          Start again with the saved pairing
  npx oneswarm-bridge agents           List agents found on this computer
  npx oneswarm-bridge logout           Forget this computer's pairing

Options
  --server <url>   OneSwarm server (default ${DEFAULT_SERVER})
  --name <name>    Device name shown in OneSwarm (default: this computer's name)
  --cwd <dir>      Folder agents work in (default: the current folder)
`;

function arg(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

const log = (line: string) => console.log(`${new Date().toLocaleTimeString()}  ${line}`);

async function pair(server: string, code: string, name: string): Promise<BridgeConfig> {
  const res = await fetch(`${server}/api/bridge/exchange`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, name, platform: platform() }),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, string>;
  if (!res.ok) throw new Error(body.error ?? `Pairing failed (${res.status}).`);
  return {
    server,
    wsUrl: body.wsUrl!,
    deviceId: body.deviceId!,
    workspaceId: body.workspaceId!,
    deviceToken: body.deviceToken!,
  };
}

async function connect(args: string[]): Promise<void> {
  const code = args.find((a, i) => i > 0 && !a.startsWith("--") && !args[i - 1]!.startsWith("--"));
  const server = (arg(args, "--server") ?? process.env.ONESWARM_SERVER ?? DEFAULT_SERVER).replace(
    /\/$/,
    "",
  );
  const name = arg(args, "--name") ?? hostname();
  const cwd = resolve(arg(args, "--cwd") ?? process.cwd());

  let config = loadConfig();
  if (code) {
    log(`Pairing with ${server}…`);
    config = await pair(server, code, name);
    saveConfig(config);
  } else if (!config) {
    console.error(
      "No saved pairing. Copy the command from OneSwarm's Connect screen: npx oneswarm-bridge connect <code>",
    );
    process.exit(1);
  }

  const detected = detectAgents();
  if (detected.length === 0) {
    log("No agents found on PATH. Install Claude Code, Codex or Gemini CLI, then run this again.");
  }
  const self = { command: process.execPath, args: [fileURLToPath(import.meta.url)] };
  const hosts = detected.map((d) => new AgentHost(d, { cwd, selfCommand: self, log }));
  await Promise.all(hosts.map((h) => h.start()));
  for (const h of hosts) {
    const info = h.info();
    if (info.loggedIn) log(`✓ ${info.name}${info.version ? ` ${info.version}` : ""}`);
    else
      log(
        `! ${info.name} isn't logged in.${info.loginCommand ? ` Run: ${info.loginCommand}` : ""}${info.error ? ` (${info.error})` : ""}`,
      );
  }

  const connection = new ServerConnection(config!, hosts, log, (reason) => {
    console.error(reason);
    for (const h of hosts) h.stop();
    process.exit(1);
  });
  connection.start();

  // Re-check agents that weren't logged in, so logging in later just works.
  setInterval(() => {
    for (const h of hosts) if (!h.info().loggedIn) void h.refresh();
  }, 30_000).unref();

  const shutdown = () => {
    connection.stop();
    for (const h of hosts) h.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  switch (args[0]) {
    case "connect":
      return connect(args);
    case "mcp-files":
      return runFilesServer();
    case "agents":
      for (const d of detectAgents())
        console.log(`${d.spec.name.padEnd(8)} ${d.command} ${d.args.join(" ")}`);
      return;
    case "logout":
      clearConfig();
      console.log(
        "Forgot this computer's pairing. Revoke it in OneSwarm → Settings → Agents & Bridge too.",
      );
      return;
    default:
      console.log(HELP);
  }
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
