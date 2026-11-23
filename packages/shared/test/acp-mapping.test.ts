import { describe, expect, it } from "vitest";
import {
  mapSessionUpdate,
  mergeToolActivity,
  pickPermissionOption,
  summarizeToolActivity,
} from "../src/acp-mapping";
import type { ToolActivity } from "../src/acp-types";

describe("mapSessionUpdate", () => {
  it("maps streamed text and thoughts", () => {
    expect(
      mapSessionUpdate({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Hi" },
      }),
    ).toEqual({ type: "text", text: "Hi" });
    expect(
      mapSessionUpdate({
        sessionUpdate: "agent_thought_chunk",
        content: { type: "text", text: "hmm" },
      }),
    ).toEqual({ type: "thought", text: "hmm" });
  });

  it("maps a tool call with locations and a diff", () => {
    const event = mapSessionUpdate({
      sessionUpdate: "tool_call",
      toolCallId: "t1",
      title: "Edit a.ts",
      kind: "edit",
      status: "pending",
      locations: [{ path: "a.ts" }],
      content: [
        { type: "diff", path: "a.ts", oldText: "a", newText: "b" },
        { type: "content", content: { type: "text", text: "ok" } },
      ],
    });
    expect(event).toEqual({
      type: "tool",
      tool: {
        id: "t1",
        title: "Edit a.ts",
        kind: "edit",
        status: "pending",
        locations: ["a.ts"],
        diffs: [{ path: "a.ts", oldText: "a", newText: "b" }],
        output: "ok",
      },
    });
  });

  it("ignores unknown tool kinds and statuses instead of trusting them", () => {
    const event = mapSessionUpdate({
      sessionUpdate: "tool_call_update",
      toolCallId: "t1",
      kind: "rm -rf",
      status: "weird",
    });
    expect(event).toEqual({ type: "tool", tool: { id: "t1" } });
  });

  it("maps config_option_update", () => {
    const configOptions = [
      { id: "model", name: "Model", type: "select", currentValue: "a", options: [] },
    ];
    expect(mapSessionUpdate({ sessionUpdate: "config_option_update", configOptions })).toEqual({
      type: "config",
      configOptions,
    });
  });

  it("ignores updates OneSwarm does not show", () => {
    expect(mapSessionUpdate({ sessionUpdate: "available_commands_update" })).toEqual({
      type: "ignore",
    });
    expect(mapSessionUpdate({ sessionUpdate: "config_option_update" })).toEqual({ type: "ignore" });
  });
});

describe("tool activity", () => {
  it("creates then updates a tool call", () => {
    let list: ToolActivity[] = [];
    list = mergeToolActivity(list, {
      id: "t1",
      title: "Run tests",
      kind: "execute",
      status: "in_progress",
    });
    list = mergeToolActivity(list, { id: "t1", status: "completed", output: "passed" });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      title: "Run tests",
      kind: "execute",
      status: "completed",
      output: "passed",
    });
  });

  const tool = (p: Partial<ToolActivity>): ToolActivity => ({
    id: Math.random().toString(),
    title: "",
    kind: "other",
    status: "completed",
    locations: [],
    diffs: [],
    ...p,
  });

  it("summarises edits, commands and searches in one line", () => {
    const line = summarizeToolActivity([
      tool({ kind: "edit", locations: ["a.ts"] }),
      tool({ kind: "edit", diffs: [{ path: "b.ts", newText: "" }] }),
      tool({ kind: "edit", locations: ["a.ts"] }),
      tool({ kind: "edit", locations: ["c.ts"] }),
      tool({ kind: "execute" }),
      tool({ kind: "execute" }),
    ]);
    expect(line).toBe("Edited 3 files · ran 2 commands");
  });

  it("uses singular forms", () => {
    expect(
      summarizeToolActivity([tool({ kind: "read", locations: ["x"] }), tool({ kind: "search" })]),
    ).toBe("Read 1 file · searched once");
    expect(summarizeToolActivity([])).toBe("");
  });
});

describe("permission decisions", () => {
  const options = [
    { optionId: "always", kind: "allow_always" },
    { optionId: "once", kind: "allow_once" },
    { optionId: "no", kind: "reject_once" },
  ];
  it("prefers a one-time allow for Approve", () => {
    expect(pickPermissionOption(options, "approve")).toBe("once");
  });
  it("rejects for Request changes", () => {
    expect(pickPermissionOption(options, "changes")).toBe("no");
    expect(pickPermissionOption([{ optionId: "a", kind: "allow_once" }], "changes")).toBeNull();
  });
});
