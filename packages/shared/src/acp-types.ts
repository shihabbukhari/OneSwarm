/**
 * The small subset of Agent Client Protocol (ACP) shapes that OneSwarm passes
 * between the bridge, the server and the browser. They mirror
 * `@agentclientprotocol/sdk` v1 so the web app does not depend on the SDK.
 */

export type ConfigCategory = "mode" | "model" | "model_config" | "thought_level" | (string & {});

export interface ConfigSelectOption {
  value: string;
  name: string;
  description?: string | null;
}

export interface ConfigSelectGroup {
  group: string;
  name: string;
  options: ConfigSelectOption[];
}

interface ConfigOptionBase {
  id: string;
  name: string;
  description?: string | null;
  category?: ConfigCategory | null;
}

export interface ConfigSelect extends ConfigOptionBase {
  type: "select";
  currentValue: string;
  options: ConfigSelectOption[] | ConfigSelectGroup[];
}

export interface ConfigBoolean extends ConfigOptionBase {
  type: "boolean";
  currentValue: boolean;
}

export type ConfigOption = ConfigSelect | ConfigBoolean;

export type ToolKind =
  | "read"
  | "edit"
  | "delete"
  | "move"
  | "search"
  | "execute"
  | "think"
  | "fetch"
  | "switch_mode"
  | "other";

export type ToolStatus = "pending" | "in_progress" | "completed" | "failed";

export interface ToolDiff {
  path: string;
  oldText?: string | null;
  newText: string;
}

/** A tool call as OneSwarm stores it on an agent message. */
export interface ToolActivity {
  id: string;
  title: string;
  kind: ToolKind;
  status: ToolStatus;
  locations: string[];
  diffs: ToolDiff[];
  output?: string;
}

export interface PermissionOption {
  optionId: string;
  name: string;
  kind: "allow_once" | "allow_always" | "reject_once" | "reject_always";
}

/** Raw ACP `session/update` payload as forwarded by the bridge. */
export interface RawSessionUpdate {
  sessionUpdate: string;
  [key: string]: unknown;
}
