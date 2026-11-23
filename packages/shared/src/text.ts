/** Mention, slash-command and naming helpers shared by the composer and the server. */

const MENTION_RE = /(^|[\s(])@([a-zA-Z0-9][a-zA-Z0-9_-]{0,39})/g;

/** Handles mentioned in a message, in order of appearance, without duplicates. */
export function parseMentions(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of text.matchAll(MENTION_RE)) {
    const handle = match[2]!.toLowerCase();
    if (!seen.has(handle)) {
      seen.add(handle);
      out.push(handle);
    }
  }
  return out;
}

/** The first agent mentioned in `text`, if any. Drives the composer's agent chip. */
export function firstMentionedAgent<T extends { handle: string }>(
  text: string,
  agents: readonly T[],
): T | undefined {
  for (const handle of parseMentions(text)) {
    const agent = agents.find((a) => a.handle.toLowerCase() === handle);
    if (agent) return agent;
  }
  return undefined;
}

/** The token being typed at the caret, for the @ and / pickers. */
export function activeTrigger(
  text: string,
  caret: number,
): { kind: "mention" | "slash"; query: string; start: number } | null {
  const before = text.slice(0, caret);
  const mention = /(^|\s)@([a-zA-Z0-9_-]*)$/.exec(before);
  if (mention)
    return { kind: "mention", query: mention[2]!, start: caret - mention[2]!.length - 1 };
  const slash = /^\/([a-z]*)$/.exec(before);
  if (slash) return { kind: "slash", query: slash[1]!, start: 0 };
  return null;
}

export const SLASH_COMMANDS = [
  { name: "task", hint: "Create a task from this message", usage: "/task <title>" },
  { name: "assign", hint: "Create a task and assign it", usage: "/assign @someone <title>" },
  { name: "upload", hint: "Attach a file", usage: "/upload" },
] as const;
export type SlashCommand = (typeof SLASH_COMMANDS)[number]["name"];

export function parseSlash(text: string): { command: SlashCommand; rest: string } | null {
  const m = /^\/(task|assign|upload)\b\s*([\s\S]*)$/.exec(text.trim());
  if (!m) return null;
  return { command: m[1] as SlashCommand, rest: m[2]!.trim() };
}

/** Channel names: lowercase, digits and dashes. */
export function normalizeChannelName(input: string): string {
  return input
    .toLowerCase()
    .replace(/^#/, "")
    .replace(/[^a-z0-9-_ ]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40);
}

/** Mention handles for agents: lowercase letters, digits and dashes. */
export function toHandle(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || "agent"
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

export const ALLOWED_UPLOAD_TYPES: Record<string, readonly string[]> = {
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/gif": [".gif"],
  "image/webp": [".webp"],
  "application/pdf": [".pdf"],
  "text/plain": [".txt", ".log"],
  "text/markdown": [".md", ".markdown"],
  "text/csv": [".csv"],
  "application/json": [".json"],
  "application/zip": [".zip"],
  "text/x-typescript": [".ts", ".tsx"],
  "text/javascript": [".js", ".jsx", ".mjs"],
  "text/x-python": [".py"],
  "text/html": [".html"],
  "text/css": [".css"],
  "application/yaml": [".yml", ".yaml"],
};

/** Resolve a safe MIME type from the file name. Unknown extensions are rejected. */
export function mimeForFileName(name: string): string | null {
  const lower = name.toLowerCase();
  for (const [mime, exts] of Object.entries(ALLOWED_UPLOAD_TYPES)) {
    if (exts.some((ext) => lower.endsWith(ext))) return mime;
  }
  return null;
}

export function isTextMime(mime: string): boolean {
  return mime.startsWith("text/") || mime === "application/json" || mime === "application/yaml";
}
