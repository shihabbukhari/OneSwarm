import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AGENTS, detectAgents } from "../src/registry";

function fakeBin(dir: string, name: string) {
  const path = join(dir, name);
  writeFileSync(path, "#!/bin/sh\n");
  chmodSync(path, 0o755);
}

describe("agent registry", () => {
  it("has one entry per agent with a login command", () => {
    expect(AGENTS.map((a) => a.key)).toEqual(
      expect.arrayContaining(["claude", "codex", "gemini", "mock"]),
    );
    expect(AGENTS.find((a) => a.key === "codex")?.loginCommand).toBe("codex login");
  });

  it("detects installed agents from PATH only", () => {
    const dir = mkdtempSync(join(tmpdir(), "osb-"));
    fakeBin(dir, "codex-acp");
    fakeBin(dir, "gemini");
    const found = detectAgents({ PATH: dir });
    expect(found.map((a) => a.spec.key)).toEqual(["codex", "gemini"]);
    expect(found[0]?.command).toBe(join(dir, "codex-acp"));
    expect(found[1]?.args).toEqual(["--experimental-acp"]);
  });

  it("falls back to npx for ACP adapters", () => {
    const dir = mkdtempSync(join(tmpdir(), "osb-"));
    fakeBin(dir, "claude");
    fakeBin(dir, "npx");
    const [claude] = detectAgents({ PATH: dir });
    expect(claude?.args).toEqual(["-y", "@agentclientprotocol/claude-agent-acp"]);
  });

  it("filters with ONESWARM_AGENTS and keeps the mock opt-in", () => {
    const dir = mkdtempSync(join(tmpdir(), "osb-"));
    fakeBin(dir, "gemini");
    fakeBin(dir, "oneswarm-mock-agent");
    expect(detectAgents({ PATH: dir }).map((a) => a.spec.key)).toEqual(["gemini"]);
    expect(detectAgents({ PATH: dir, ONESWARM_AGENTS: "mock" }).map((a) => a.spec.key)).toEqual([
      "mock",
    ]);
  });
});
