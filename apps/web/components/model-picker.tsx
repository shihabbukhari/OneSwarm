"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import {
  chipsFor,
  currentValueName,
  flattenSelectOptions,
  isBoolean,
  modelChipLabel,
  modelPickerItems,
  type AgentDTO,
  type ConfigOption,
  type ConfigSelect,
} from "@oneswarm/shared";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Kbd, StatusDot } from "./ui/bits";

const chipClass =
  "inline-flex h-7 max-w-[240px] items-center gap-1.5 rounded-full border border-transparent px-2.5 text-[13px] text-fog transition-colors duration-[120ms] ease-out hover:border-hair hover:bg-lift-2 hover:text-paper data-[state=open]:border-hair data-[state=open]:bg-lift-2 data-[state=open]:text-paper";

/**
 * Agent + model chip with an upward popover: search, models grouped by agent
 * (with each agent's online state), keyboard navigation, and model settings
 * (context size, fast mode…) at the bottom. Everything comes from the agents'
 * ACP configOptions; nothing is hardcoded.
 */
export function ModelChip({
  agent,
  agents,
  open,
  onOpenChange,
  onPickAgent,
}: {
  agent: AgentDTO;
  agents: AgentDTO[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPickAgent: (agentId: string) => void;
}) {
  const effectiveOptions = useApp((s) => s.effectiveOptions);
  const pending = useApp((s) => s.pendingConfig);
  const withOptions = useMemo(
    () => agents.map((a) => ({ ...a, configOptions: effectiveOptions(a) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agents, pending, effectiveOptions],
  );
  const current = withOptions.find((a) => a.id === agent.id) ?? agent;
  const label = modelChipLabel(agent.name, current.configOptions);
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        className={chipClass}
        data-testid="model-chip"
        aria-label={`Agent and model: ${label}`}
      >
        <StatusDot status={agent.status} />
        <span className="truncate">{label}</span>
        <ChevronDown className="size-3 shrink-0 opacity-60" />
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-[320px] p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <PickerBody
          agent={agent}
          agents={agents}
          withOptions={withOptions}
          onDone={() => onOpenChange(false)}
          onPickAgent={onPickAgent}
        />
      </PopoverContent>
    </Popover>
  );
}

/** Mounted only while the picker is open, so search and selection start fresh. */
function PickerBody({
  agent,
  agents,
  withOptions,
  onDone,
  onPickAgent,
}: {
  agent: AgentDTO;
  agents: AgentDTO[];
  withOptions: AgentDTO[];
  onDone: () => void;
  onPickAgent: (agentId: string) => void;
}) {
  const setConfig = useApp((s) => s.setConfig);
  const [query, setQuery] = useState("");
  const [rawActive, setActive] = useState(() =>
    Math.max(
      0,
      modelPickerItems(withOptions, "").findIndex((i) => i.agentId === agent.id && i.selected),
    ),
  );
  const listRef = useRef<HTMLDivElement>(null);
  const items = useMemo(() => modelPickerItems(withOptions, query), [withOptions, query]);
  const active = Math.min(rawActive, Math.max(0, items.length - 1));
  const current = withOptions.find((a) => a.id === agent.id) ?? agent;
  const settings = chipsFor(current.configOptions).modelSettings;
  const headers = items.map((item, i) => i === 0 || items[i - 1]!.agentId !== item.agentId);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function choose(index: number) {
    const item = items[index];
    if (!item) return;
    const target = agents.find((a) => a.id === item.agentId);
    if (!target) return;
    onPickAgent(target.id);
    if (!item.selected) void setConfig(target, item.configId, item.value);
    onDone();
  }

  return (
    <>
      <div className="flex items-center gap-2 border-b border-hair px-3">
        <Search className="size-3.5 text-smoke" />
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive(Math.min(items.length - 1, active + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive(Math.max(0, active - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              choose(active);
            }
          }}
          placeholder="Search models"
          aria-label="Search models"
          className="h-10 flex-1 bg-transparent text-[14px] outline-none placeholder:text-smoke"
        />
        <Kbd>esc</Kbd>
      </div>
      <div
        ref={listRef}
        role="listbox"
        aria-label="Models"
        className="max-h-[300px] overflow-y-auto p-1"
      >
        {items.length === 0 ? (
          <p className="px-3 py-5 text-center text-[13px] text-ash">No models match.</p>
        ) : null}
        {items.map((item, index) => {
          const a = withOptions.find((x) => x.id === item.agentId)!;
          return (
            <div key={`${item.agentId}:${item.value}`}>
              {headers[index] ? (
                <div className="flex items-center gap-2 px-3 pt-2 pb-1">
                  <span className="eyebrow !text-paper">{item.agentName}</span>
                  <StatusDot status={a.status} />
                  <span className="eyebrow">{a.status}</span>
                </div>
              ) : null}
              <button
                type="button"
                role="option"
                aria-selected={index === active}
                data-index={index}
                data-testid="model-option"
                onMouseMove={() => setActive(index)}
                onClick={() => choose(index)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-[10px] px-3 py-1.5 text-left text-[14px] text-fog",
                  index === active && "bg-lift-2 text-paper",
                  !item.online && "opacity-50",
                )}
              >
                <span className="flex-1">
                  <span className="block">{item.name}</span>
                  {item.description ? (
                    <span className="block text-[12px] text-smoke">{item.description}</span>
                  ) : null}
                </span>
                {item.selected ? <Check className="size-3.5 text-paper" /> : null}
              </button>
            </div>
          );
        })}
      </div>
      {settings.length ? (
        <div className="space-y-1 border-t border-hair p-2" data-testid="model-settings">
          {settings.map((opt) => (
            <SettingRow
              key={opt.id}
              option={opt}
              onChange={(v) => void setConfig(agent, opt.id, v)}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}

function SettingRow({
  option,
  onChange,
}: {
  option: ConfigOption;
  onChange: (v: string | boolean) => void;
}) {
  if (isBoolean(option)) {
    return (
      <label className="flex items-center justify-between rounded-[10px] px-2 py-1 text-[13px] text-fog">
        {option.name}
        <button
          type="button"
          role="switch"
          aria-checked={option.currentValue}
          onClick={() => onChange(!option.currentValue)}
          className={cn(
            "relative h-4 w-7 rounded-full transition-colors duration-[120ms]",
            option.currentValue ? "bg-paper" : "bg-graphite",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 size-3 rounded-full transition-[left] duration-[120ms] ease-out",
              option.currentValue ? "left-3.5 bg-obsidian" : "left-0.5 bg-ash",
            )}
          />
        </button>
      </label>
    );
  }
  const values = flattenSelectOptions(option);
  return (
    <div className="flex items-center justify-between gap-2 rounded-[10px] px-2 py-1 text-[13px] text-fog">
      <span>{option.name}</span>
      <div className="flex gap-0.5 rounded-full bg-void p-0.5">
        {values.map((v) => (
          <button
            key={v.value}
            type="button"
            onClick={() => onChange(v.value)}
            aria-pressed={option.currentValue === v.value}
            className={cn(
              "rounded-full px-2 py-0.5 text-[12px]",
              option.currentValue === v.value
                ? "bg-graphite text-paper"
                : "text-ash hover:text-paper",
            )}
          >
            {v.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Effort and mode chips: a small upward list of the option's values. */
export function OptionChip({
  agent,
  option,
  testId,
}: {
  agent: AgentDTO;
  option: ConfigOption;
  testId: string;
}) {
  const setConfig = useApp((s) => s.setConfig);
  const [open, setOpen] = useState(false);
  if (isBoolean(option)) {
    return (
      <button
        type="button"
        className={chipClass}
        data-testid={testId}
        onClick={() => void setConfig(agent, option.id, !option.currentValue)}
      >
        {option.name}: {option.currentValue ? "On" : "Off"}
      </button>
    );
  }
  const select = option as ConfigSelect;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={chipClass}
        data-testid={testId}
        aria-label={`${option.name}: ${currentValueName(option)}`}
      >
        <span className="truncate">{currentValueName(option)}</span>
        <ChevronDown className="size-3 opacity-60" />
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-[220px]">
        <div className="eyebrow px-2.5 pt-1">{option.name}</div>
        {flattenSelectOptions(select).map((v) => (
          <button
            key={v.value}
            type="button"
            onClick={() => {
              setOpen(false);
              if (v.value !== select.currentValue) void setConfig(agent, select.id, v.value);
            }}
            className="flex w-full items-center gap-2 rounded-[10px] px-2.5 py-1.5 text-left text-[14px] text-fog hover:bg-lift-2 hover:text-paper"
          >
            <span className="flex-1">
              {v.name}
              {v.description ? (
                <span className="block text-[12px] text-smoke">{v.description}</span>
              ) : null}
            </span>
            {v.value === select.currentValue ? <Check className="size-3.5" /> : null}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
