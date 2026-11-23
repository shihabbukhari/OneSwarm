import { describe, expect, it } from "vitest";
import {
  activeTrigger,
  mimeForFileName,
  normalizeChannelName,
  parseMentions,
  parseSlash,
  toHandle,
} from "../src/text";

describe("text helpers", () => {
  it("parses mentions once each, case-insensitively", () => {
    expect(parseMentions("@Mock hi @mock and (@sam)")).toEqual(["mock", "sam"]);
  });
  it("finds the trigger being typed", () => {
    expect(activeTrigger("hello @mo", 9)).toEqual({ kind: "mention", query: "mo", start: 6 });
    expect(activeTrigger("/ta", 3)).toEqual({ kind: "slash", query: "ta", start: 0 });
    expect(activeTrigger("a /ta", 5)).toBeNull();
  });
  it("parses slash commands", () => {
    expect(parseSlash("/task Ship it")).toEqual({ command: "task", rest: "Ship it" });
    expect(parseSlash("/assign @mock Write docs")).toEqual({
      command: "assign",
      rest: "@mock Write docs",
    });
    expect(parseSlash("/nope")).toBeNull();
  });
  it("normalizes names", () => {
    expect(normalizeChannelName("#Design Review!")).toBe("design-review");
    expect(toHandle("Claude Code")).toBe("claude-code");
  });
  it("only accepts known upload types", () => {
    expect(mimeForFileName("a.PNG")).toBe("image/png");
    expect(mimeForFileName("notes.md")).toBe("text/markdown");
    expect(mimeForFileName("run.exe")).toBeNull();
  });
});
