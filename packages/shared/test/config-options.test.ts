import { describe, expect, it } from "vitest";
import type { ConfigOption } from "../src/acp-types";
import {
  applyConfigOptionUpdate,
  chipsFor,
  currentValueName,
  flattenSelectOptions,
  isValidValue,
  modelChipLabel,
  modelPickerItems,
  valuesOf,
  withValue,
} from "../src/config-options";
import { firstMentionedAgent } from "../src/text";

const options: ConfigOption[] = [
  {
    id: "model",
    name: "Model",
    category: "model",
    type: "select",
    currentValue: "opus",
    options: [
      { group: "fast", name: "Fast", options: [{ value: "haiku", name: "Claude Haiku" }] },
      {
        group: "smart",
        name: "Smart",
        options: [
          { value: "opus", name: "Claude Opus" },
          { value: "sonnet", name: "Claude Sonnet" },
        ],
      },
    ],
  },
  {
    id: "effort",
    name: "Effort",
    category: "thought_level",
    type: "select",
    currentValue: "high",
    options: [
      { value: "low", name: "Low" },
      { value: "high", name: "High" },
    ],
  },
  {
    id: "mode",
    name: "Mode",
    category: "mode",
    type: "select",
    currentValue: "ask",
    options: [
      { value: "ask", name: "Ask" },
      { value: "auto", name: "Auto" },
    ],
  },
  { id: "fast", name: "Fast mode", category: "model_config", type: "boolean", currentValue: false },
];

describe("chip logic", () => {
  it("shows a chip only for options the agent exposes", () => {
    const chips = chipsFor(options);
    expect(chips.model?.id).toBe("model");
    expect(chips.effort?.id).toBe("effort");
    expect(chips.mode?.id).toBe("mode");
    expect(chips.modelSettings.map((o) => o.id)).toEqual(["fast"]);
    const none = chipsFor([options[0]!]);
    expect(none.effort).toBeUndefined();
    expect(none.mode).toBeUndefined();
    expect(chipsFor(null).model).toBeUndefined();
  });

  it("labels the chip 'Agent · Model' without repeating the agent name", () => {
    expect(modelChipLabel("Claude", options)).toBe("Claude · Opus");
    expect(modelChipLabel("Mock", [])).toBe("Mock");
  });

  it("flattens grouped options", () => {
    const model = chipsFor(options).model!;
    expect(flattenSelectOptions(model).map((o) => `${o.group}:${o.value}`)).toEqual([
      "Fast:haiku",
      "Smart:opus",
      "Smart:sonnet",
    ]);
  });

  it("applies optimistic values and agent updates", () => {
    const optimistic = withValue(options, "model", "sonnet");
    expect(currentValueName(chipsFor(optimistic).model)).toBe("Claude Sonnet");
    expect(withValue(options, "fast", true).find((o) => o.id === "fast")?.currentValue).toBe(true);
    const update = withValue(options, "model", "haiku");
    expect(chipsFor(applyConfigOptionUpdate(optimistic, update)).model?.currentValue).toBe("haiku");
  });

  it("validates values against the agent's own options", () => {
    const model = chipsFor(options).model!;
    expect(isValidValue(model, "sonnet")).toBe(true);
    expect(isValidValue(model, "gpt-9")).toBe(false);
    expect(isValidValue(options[3]!, true)).toBe(true);
    expect(isValidValue(options[3]!, "yes")).toBe(false);
  });

  it("collects values to replay on a new session", () => {
    expect(valuesOf(options)).toEqual({ model: "opus", effort: "high", mode: "ask", fast: false });
  });

  it("groups picker items by agent and filters by search", () => {
    const agents = [
      { id: "a1", name: "Claude", status: "online" as const, configOptions: options },
      { id: "a2", name: "Gemini", status: "offline" as const, configOptions: null },
    ];
    const all = modelPickerItems(agents);
    expect(all).toHaveLength(3);
    expect(all.find((i) => i.selected)?.value).toBe("opus");
    expect(modelPickerItems(agents, "son").map((i) => i.value)).toEqual(["sonnet"]);
    expect(modelPickerItems(agents, "claude smart").map((i) => i.value)).toEqual([
      "opus",
      "sonnet",
    ]);
  });

  it("switches the chip to the first mentioned agent", () => {
    const agents = [{ handle: "claude" }, { handle: "codex" }];
    expect(firstMentionedAgent("hey @bob and @Codex then @claude", agents)?.handle).toBe("codex");
    expect(firstMentionedAgent("no mentions", agents)).toBeUndefined();
    expect(firstMentionedAgent("email me@claude.com", agents)).toBeUndefined();
  });
});
