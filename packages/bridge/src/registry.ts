import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";

/**
 * Every agent the bridge knows how to find. Adding an agent means adding one
 * entry here: how to detect it, how to start it over ACP (stdio), and the
 * command a person runs to log it in.
 *
 * Detection only looks at executables on PATH. The bridge never opens
 * credential files; whether an agent is logged in is learned from the agent
 * itself over ACP (an `auth_required` error on `session/new`).
 */
export interface AgentSpec {
  key: string;
  name: string;
  /** Any of these on PATH means the agent is installed. */
  detect: string[];
  /** How to start the agent's ACP server. `which` resolves binaries on PATH. */
  launch(which: (bin: string) => string | null): { command: string; args: string[] } | null;
  loginCommand: string | null;
  /** Only used when explicitly enabled (e.g. tests). */
  optIn?: boolean;
}

export const AGENTS: AgentSpec[] = [
  {
    key: "claude",
    name: "Claude",
    detect: ["claude-agent-acp", "claude"],
    launch: (which) => {
      const direct = which("claude-agent-acp");
      if (direct) return { command: direct, args: [] };
      const npx = which("npx");
      return npx ? { command: npx, args: ["-y", "@agentclientprotocol/claude-agent-acp"] } : null;
    },
    loginCommand: "claude /login",
  },
  {
    key: "codex",
    name: "Codex",
    detect: ["codex-acp", "codex"],
    launch: (which) => {
      const direct = which("codex-acp");
      if (direct) return { command: direct, args: [] };
      const npx = which("npx");
      return npx ? { command: npx, args: ["-y", "@zed-industries/codex-acp"] } : null;
    },
    loginCommand: "codex login",
  },
  {
    key: "gemini",
    name: "Gemini",
    detect: ["gemini"],
    launch: (which) => {
      const bin = which("gemini");
      return bin ? { command: bin, args: ["--experimental-acp"] } : null;
    },
    loginCommand: "gemini",
  },
  {
    key: "mock",
    name: "Mock",
    detect: ["oneswarm-mock-agent"],
    optIn: true,
    launch: (which) => {
      const custom = process.env.ONESWARM_MOCK_AGENT_CMD;
      if (custom) {
        const [command, ...args] = custom.split(" ").filter(Boolean);
        return command ? { command, args } : null;
      }
      const bin = which("oneswarm-mock-agent");
      return bin ? { command: bin, args: [] } : null;
    },
    loginCommand: null,
  },
];

export function which(bin: string, path = process.env.PATH ?? ""): string | null {
  const exts =
    process.platform === "win32" ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";") : [""];
  for (const dir of path.split(delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = join(dir, bin + ext);
      try {
        accessSync(candidate, constants.X_OK);
        return candidate;
      } catch {
        // keep looking
      }
    }
  }
  return null;
}

export interface DetectedAgent {
  spec: AgentSpec;
  command: string;
  args: string[];
}

/**
 * Agents installed on this computer. `ONESWARM_AGENTS=claude,mock` limits the
 * list; opt-in agents (the mock) appear only when named or configured.
 */
export function detectAgents(env: NodeJS.ProcessEnv = process.env): DetectedAgent[] {
  const only = env.ONESWARM_AGENTS?.split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const lookup = (bin: string) => which(bin, env.PATH ?? "");
  const out: DetectedAgent[] = [];
  for (const spec of AGENTS) {
    if (only && !only.includes(spec.key)) continue;
    if (
      spec.optIn &&
      !only?.includes(spec.key) &&
      !(spec.key === "mock" && env.ONESWARM_MOCK_AGENT_CMD)
    )
      continue;
    const installed =
      spec.key === "mock" && env.ONESWARM_MOCK_AGENT_CMD
        ? true
        : spec.detect.some((b) => lookup(b));
    if (!installed) continue;
    const launch = spec.launch(lookup);
    if (launch) out.push({ spec, ...launch });
  }
  return out;
}
