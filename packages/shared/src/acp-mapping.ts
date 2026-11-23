import type {
  ConfigOption,
  RawSessionUpdate,
  ToolActivity,
  ToolDiff,
  ToolKind,
  ToolStatus,
} from "./acp-types";

/**
 * Maps ACP `session/update` notifications to what OneSwarm shows in a channel:
 * streamed text, collapsed tool activity and config changes.
 */

export type RunEvent =
  | { type: "text"; text: string }
  | { type: "thought"; text: string }
  | { type: "tool"; tool: Partial<ToolActivity> & { id: string } }
  | { type: "config"; configOptions: ConfigOption[] }
  | { type: "plan"; entries: Array<{ content: string; status: string }> }
  | { type: "ignore" };

const TOOL_KINDS: readonly ToolKind[] = [
  "read",
  "edit",
  "delete",
  "move",
  "search",
  "execute",
  "think",
  "fetch",
  "switch_mode",
  "other",
];
const TOOL_STATUSES: readonly ToolStatus[] = ["pending", "in_progress", "completed", "failed"];

function textOf(content: unknown): string {
  if (!content || typeof content !== "object") return "";
  const c = content as { type?: string; text?: unknown; uri?: unknown; name?: unknown };
  if (c.type === "text" && typeof c.text === "string") return c.text;
  if (c.type === "resource_link" && typeof c.uri === "string")
    return `[${String(c.name ?? c.uri)}](${c.uri})`;
  return "";
}

function toolFields(update: RawSessionUpdate): Partial<ToolActivity> & { id: string } {
  const tool: Partial<ToolActivity> & { id: string } = { id: String(update.toolCallId ?? "") };
  if (typeof update.title === "string") tool.title = update.title;
  if (typeof update.kind === "string" && TOOL_KINDS.includes(update.kind as ToolKind)) {
    tool.kind = update.kind as ToolKind;
  }
  if (typeof update.status === "string" && TOOL_STATUSES.includes(update.status as ToolStatus)) {
    tool.status = update.status as ToolStatus;
  }
  if (Array.isArray(update.locations)) {
    tool.locations = update.locations
      .map((l) => (l && typeof l === "object" ? String((l as { path?: unknown }).path ?? "") : ""))
      .filter(Boolean);
  }
  if (Array.isArray(update.content)) {
    const diffs: ToolDiff[] = [];
    const outputs: string[] = [];
    for (const item of update.content as Array<Record<string, unknown>>) {
      if (item?.type === "diff" && typeof item.path === "string") {
        diffs.push({
          path: item.path,
          oldText: typeof item.oldText === "string" ? item.oldText : null,
          newText: typeof item.newText === "string" ? item.newText : "",
        });
      } else if (item?.type === "content") {
        const t = textOf(item.content);
        if (t) outputs.push(t);
      }
    }
    if (diffs.length) tool.diffs = diffs;
    if (outputs.length) tool.output = outputs.join("\n").slice(0, 20_000);
  }
  return tool;
}

export function mapSessionUpdate(update: RawSessionUpdate): RunEvent {
  switch (update.sessionUpdate) {
    case "agent_message_chunk":
      return { type: "text", text: textOf(update.content) };
    case "agent_thought_chunk":
      return { type: "thought", text: textOf(update.content) };
    case "tool_call":
    case "tool_call_update":
      return { type: "tool", tool: toolFields(update) };
    case "config_option_update":
      return Array.isArray(update.configOptions)
        ? { type: "config", configOptions: update.configOptions as ConfigOption[] }
        : { type: "ignore" };
    case "plan":
      return Array.isArray(update.entries)
        ? {
            type: "plan",
            entries: (update.entries as Array<Record<string, unknown>>).map((e) => ({
              content: String(e.content ?? ""),
              status: String(e.status ?? "pending"),
            })),
          }
        : { type: "ignore" };
    default:
      return { type: "ignore" };
  }
}

/** Merge a tool call or tool call update into the list stored on a message. */
export function mergeToolActivity(
  list: readonly ToolActivity[],
  patch: Partial<ToolActivity> & { id: string },
): ToolActivity[] {
  const index = list.findIndex((t) => t.id === patch.id);
  if (index === -1) {
    const created: ToolActivity = {
      id: patch.id,
      title: patch.title ?? "Tool call",
      kind: patch.kind ?? "other",
      status: patch.status ?? "pending",
      locations: patch.locations ?? [],
      diffs: patch.diffs ?? [],
      ...(patch.output ? { output: patch.output } : {}),
    };
    return [...list, created];
  }
  const prev = list[index]!;
  const next: ToolActivity = {
    ...prev,
    ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
  } as ToolActivity;
  const out = list.slice();
  out[index] = next;
  return out;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** One collapsed line for an agent's tool activity, e.g. "Edited 3 files · ran 2 commands". */
export function summarizeToolActivity(list: readonly ToolActivity[]): string {
  if (list.length === 0) return "";
  const editedFiles = new Set<string>();
  let edits = 0;
  let reads = 0;
  const readFiles = new Set<string>();
  let commands = 0;
  let searches = 0;
  let fetches = 0;
  let other = 0;
  for (const t of list) {
    switch (t.kind) {
      case "edit":
      case "delete":
      case "move": {
        const paths = [...t.locations, ...t.diffs.map((d) => d.path)];
        if (paths.length) paths.forEach((p) => editedFiles.add(p));
        else edits += 1;
        break;
      }
      case "read":
        if (t.locations.length) t.locations.forEach((p) => readFiles.add(p));
        else reads += 1;
        break;
      case "execute":
        commands += 1;
        break;
      case "search":
        searches += 1;
        break;
      case "fetch":
        fetches += 1;
        break;
      default:
        other += 1;
    }
  }
  const parts: string[] = [];
  const editCount = editedFiles.size + edits;
  if (editCount) parts.push(`edited ${plural(editCount, "file", "files")}`);
  const readCount = readFiles.size + reads;
  if (readCount) parts.push(`read ${plural(readCount, "file", "files")}`);
  if (commands) parts.push(`ran ${plural(commands, "command", "commands")}`);
  if (searches) parts.push(searches === 1 ? "searched once" : `searched ${searches} times`);
  if (fetches) parts.push(`fetched ${plural(fetches, "page", "pages")}`);
  if (other) parts.push(`used ${plural(other, "tool", "tools")}`);
  const line = parts.join(" · ");
  return line.charAt(0).toUpperCase() + line.slice(1);
}

/** Pick the option to send back for an Approve or Request changes decision. */
export function pickPermissionOption(
  options: ReadonlyArray<{ optionId: string; kind: string }>,
  decision: "approve" | "changes",
): string | null {
  const order =
    decision === "approve" ? ["allow_once", "allow_always"] : ["reject_once", "reject_always"];
  for (const kind of order) {
    const match = options.find((o) => o.kind === kind);
    if (match) return match.optionId;
  }
  return null;
}
