import type { ConfigBoolean, ConfigOption, ConfigSelect, ConfigSelectOption } from "./acp-types";

/**
 * Model chips are never hardcoded: they are derived from an agent's ACP
 * `configOptions`. These helpers decide which chips show and what they say.
 */

export function isSelect(option: ConfigOption): option is ConfigSelect {
  return option.type === "select";
}

export function isBoolean(option: ConfigOption): option is ConfigBoolean {
  return option.type === "boolean";
}

/** Flatten grouped select options into one list, keeping the group name. */
export function flattenSelectOptions(
  option: ConfigSelect,
): Array<ConfigSelectOption & { group?: string }> {
  const out: Array<ConfigSelectOption & { group?: string }> = [];
  for (const entry of option.options) {
    if ("group" in entry && Array.isArray((entry as { options?: unknown }).options)) {
      for (const inner of entry.options) out.push({ ...inner, group: entry.name });
    } else {
      out.push(entry as ConfigSelectOption);
    }
  }
  return out;
}

export function findByCategory(
  options: readonly ConfigOption[] | null | undefined,
  category: string,
): ConfigOption | undefined {
  return (options ?? []).find((o) => o.category === category);
}

export interface ChipSet {
  model?: ConfigSelect;
  effort?: ConfigOption;
  mode?: ConfigSelect;
  /** Model-related settings shown at the bottom of the model picker. */
  modelSettings: ConfigOption[];
}

/** Decide which chips an agent gets. A chip shows only if the agent exposes that option. */
export function chipsFor(options: readonly ConfigOption[] | null | undefined): ChipSet {
  const list = options ?? [];
  const model = list.find((o) => o.category === "model" && isSelect(o)) as ConfigSelect | undefined;
  const effort = list.find((o) => o.category === "thought_level");
  const mode = list.find((o) => o.category === "mode" && isSelect(o)) as ConfigSelect | undefined;
  const modelSettings = list.filter((o) => o.category === "model_config");
  return { model, effort, mode, modelSettings };
}

/** Display name of the current value of a select option. */
export function currentValueName(option: ConfigOption | undefined): string | undefined {
  if (!option) return undefined;
  if (isBoolean(option)) return option.currentValue ? "On" : "Off";
  const match = flattenSelectOptions(option).find((o) => o.value === option.currentValue);
  return match?.name ?? option.currentValue;
}

/**
 * Text for the agent + model chip, e.g. "Claude · Opus". When a model name
 * starts with the agent name ("Claude Opus 4"), the repeated prefix is dropped.
 */
export function modelChipLabel(
  agentName: string,
  options: readonly ConfigOption[] | null | undefined,
): string {
  const { model } = chipsFor(options);
  const name = currentValueName(model);
  if (!name) return agentName;
  const trimmed = name.toLowerCase().startsWith(agentName.toLowerCase() + " ")
    ? name.slice(agentName.length + 1)
    : name;
  return `${agentName} · ${trimmed}`;
}

/** Replace options with the full list an agent sent in `config_option_update`. */
export function applyConfigOptionUpdate(
  _previous: readonly ConfigOption[] | null | undefined,
  update: readonly ConfigOption[],
): ConfigOption[] {
  return update.map((o) => ({ ...o }));
}

/** Locally apply a value before the agent confirms it (optimistic chip). */
export function withValue(
  options: readonly ConfigOption[],
  configId: string,
  value: string | boolean,
): ConfigOption[] {
  return options.map((o) => {
    if (o.id !== configId) return o;
    if (isBoolean(o)) return { ...o, currentValue: Boolean(value) };
    return { ...o, currentValue: String(value) };
  });
}

/** Is `value` allowed for this option? Used by the server before forwarding a change. */
export function isValidValue(option: ConfigOption, value: unknown): boolean {
  if (isBoolean(option)) return typeof value === "boolean";
  if (typeof value !== "string") return false;
  return flattenSelectOptions(option).some((o) => o.value === value);
}

/** Desired values keyed by config id, to replay on a new ACP session. */
export function valuesOf(
  options: readonly ConfigOption[] | null | undefined,
): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const o of options ?? []) out[o.id] = o.currentValue;
  return out;
}

export interface PickerAgent {
  id: string;
  name: string;
  status: "online" | "working" | "offline";
  configOptions: ConfigOption[] | null;
}

export interface PickerItem {
  agentId: string;
  agentName: string;
  online: boolean;
  configId: string;
  value: string;
  name: string;
  description?: string | null;
  group?: string;
  selected: boolean;
}

/** Items for the model picker: models grouped by agent, filtered by a search query. */
export function modelPickerItems(agents: readonly PickerAgent[], query = ""): PickerItem[] {
  const q = query.trim().toLowerCase();
  const items: PickerItem[] = [];
  for (const agent of agents) {
    const { model } = chipsFor(agent.configOptions);
    if (!model) continue;
    for (const opt of flattenSelectOptions(model)) {
      const hay = `${agent.name} ${opt.name} ${opt.value} ${opt.group ?? ""}`.toLowerCase();
      if (q && !q.split(/\s+/).every((part) => hay.includes(part))) continue;
      items.push({
        agentId: agent.id,
        agentName: agent.name,
        online: agent.status !== "offline",
        configId: model.id,
        value: opt.value,
        name: opt.name,
        description: opt.description,
        group: opt.group,
        selected: model.currentValue === opt.value,
      });
    }
  }
  return items;
}
