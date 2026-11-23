"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Bot,
  CheckSquare,
  Hash,
  ListTodo,
  PanelLeft,
  PanelRight,
  Plug,
  Plus,
  Sparkles,
  Upload,
  UserPlus,
} from "lucide-react";
import {
  modelChipLabel,
  normalizeChannelName,
  TASK_PRIORITIES,
  type ChannelDTO,
  type TaskDTO,
} from "@oneswarm/shared";
import { api } from "@/lib/api";
import { useAgents, useApp } from "@/lib/store";
import { mod } from "@/lib/utils";
import { ConnectBridge } from "./connect-bridge";
import { Button } from "./ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { Input, Label, Select, Textarea } from "./ui/input";
import { Kbd, StatusDot } from "./ui/bits";
import { FormError } from "./auth-frame";

export function CommandPalette() {
  const open = useApp((s) => s.palette);
  const set = useApp((s) => s.set);
  return (
    <Dialog open={open} onOpenChange={(o) => set({ palette: o })}>
      <DialogContent
        label="Command palette"
        className="top-[14vh] w-[min(600px,calc(100vw-32px))] overflow-hidden p-0"
      >
        <PaletteBody />
      </DialogContent>
    </Dialog>
  );
}

/** Mounted only while the palette is open, so its query starts empty each time. */
function PaletteBody() {
  const boot = useApp((s) => s.boot);
  const recent = useApp((s) => s.recent);
  const agents = useAgents();
  const set = useApp((s) => s.set);
  const router = useRouter();
  const [query, setQuery] = useState("");
  if (!boot) return null;

  const prefix = /^[#@>!]/.test(query) ? query[0] : "";
  const search = prefix ? query.slice(1) : query;
  const show = (kind: string) => !prefix || prefix === kind;
  const close = () => set({ palette: false });
  const run = (fn: () => void) => () => {
    close();
    fn();
  };
  const channelName = (id: string) => boot.channels.find((c) => c.id === id)?.name;
  const firstChannel = () => boot.channels.find((c) => c.name === "general") ?? boot.channels[0];
  const askAgent = (handle: string) => {
    const ch = useApp.getState().activeChannelId ?? firstChannel()?.id;
    const name = boot.channels.find((c) => c.id === ch)?.name ?? "general";
    set({ composerSeed: { channelId: ch ?? "", text: `@${handle} ` } });
    router.push(`/c/${name}`);
  };

  const actions = [
    {
      id: "new-task",
      label: "New task",
      icon: ListTodo,
      fn: () => set({ newTask: { open: true } }),
    },
    { id: "new-channel", label: "New channel", icon: Plus, fn: () => set({ newChannel: true }) },
    { id: "ask", label: "Ask agent…", icon: Sparkles, fn: () => setQuery("@") },
    {
      id: "model",
      label: "Switch model…",
      icon: Bot,
      fn: () => setTimeout(() => set({ modelPicker: true }), 50),
    },
    {
      id: "upload",
      label: "Upload file",
      icon: Upload,
      fn: () => document.querySelector<HTMLInputElement>('[data-testid="file-input"]')?.click(),
    },
    { id: "invite", label: "Invite teammate", icon: UserPlus, fn: () => set({ invite: true }) },
    { id: "connect", label: "Connect bridge", icon: Plug, fn: () => set({ connect: true }) },
    {
      id: "left",
      label: "Toggle left panel",
      icon: PanelLeft,
      fn: () => useApp.getState().toggleLeft(),
    },
    {
      id: "right",
      label: "Toggle right panel",
      icon: PanelRight,
      fn: () => useApp.getState().toggleRight(),
    },
  ];

  return (
    <>
      <Command
        shouldFilter
        label="Command palette"
        filter={(value, s) => (value.toLowerCase().includes(s.toLowerCase()) ? 1 : 0)}
      >
        <div className="border-b border-hair">
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search or type # channels, @ agents, > actions, ! tasks"
          />
        </div>
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          {!query && recent.length ? (
            <CommandGroup heading="Recent">
              {recent.map((r) => {
                if (r.kind === "channel") {
                  const name = channelName(r.id);
                  return name ? (
                    <CommandItem
                      key={`r-${r.id}`}
                      value={`recent #${name}`}
                      onSelect={run(() => router.push(`/c/${name}`))}
                    >
                      <Hash /> {name}
                    </CommandItem>
                  ) : null;
                }
                const t = boot.tasks.find((x) => x.id === r.id);
                return t ? (
                  <CommandItem
                    key={`r-${r.id}`}
                    value={`recent OS-${t.number} ${t.title}`}
                    onSelect={run(() => useApp.getState().openTask(t.id))}
                  >
                    <CheckSquare /> {t.title}
                  </CommandItem>
                ) : null;
              })}
            </CommandGroup>
          ) : null}
          {show("#") ? (
            <CommandGroup heading="Channels">
              {boot.channels.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`${prefix ? search : ""}#${c.name} ${c.topic}`.trim()}
                  keywords={[c.name]}
                  onSelect={run(() => router.push(`/c/${c.name}`))}
                >
                  <Hash /> {c.name}
                  {c.unread ? (
                    <span className="ml-auto font-mono text-[11px]">{c.unread}</span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {show("@") ? (
            <CommandGroup heading="Agents">
              {agents.map((a) => (
                <CommandItem
                  key={a.id}
                  value={`@${a.handle} ${a.name} ask`}
                  onSelect={run(() => askAgent(a.handle))}
                >
                  <StatusDot status={a.status} /> Ask {a.name}
                  <span className="ml-auto text-[12px] text-smoke">
                    {modelChipLabel(a.name, a.configOptions)}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {show("!") ? (
            <CommandGroup heading="Tasks">
              {boot.tasks.slice(-50).map((t) => (
                <CommandItem
                  key={t.id}
                  value={`!OS-${t.number} ${t.title}`}
                  onSelect={run(() => useApp.getState().openTask(t.id))}
                >
                  <CheckSquare />{" "}
                  <span className="font-mono text-[12px] text-smoke">OS-{t.number}</span> {t.title}
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {show(">") ? (
            <CommandGroup heading="Actions">
              {actions.map((a) => (
                <CommandItem
                  key={a.id}
                  value={`>${a.label}`}
                  onSelect={a.id === "ask" ? a.fn : run(a.fn)}
                >
                  <a.icon /> {a.label}
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
        </CommandList>
      </Command>
    </>
  );
}

const SHORTCUTS: Array<[string[], string]> = [
  [["⌘", "K"], "Command palette"],
  [["⌘", "/"], "Model picker"],
  [["⌘", "B"], "Toggle left panel"],
  [["⌘", "I"], "Toggle right panel"],
  [["⏎"], "Send"],
  [["⇧", "⏎"], "New line"],
  [["⌘", "⏎"], "Send and create task"],
  [["⌥", "↑ / ↓"], "Previous / next channel"],
  [["E"], "Approve"],
  [["R"], "Request changes"],
  [["Esc"], "Close any popover"],
  [["?"], "Show shortcuts"],
];

export function ShortcutsDialog() {
  const open = useApp((s) => s.shortcuts);
  const set = useApp((s) => s.set);
  return (
    <Dialog open={open} onOpenChange={(o) => set({ shortcuts: o })}>
      <DialogContent>
        <DialogTitle>Keyboard shortcuts</DialogTitle>
        <ul className="mt-4 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {SHORTCUTS.map(([keys, label]) => (
            <li
              key={label}
              className="flex items-center justify-between gap-3 text-[13px] text-fog"
            >
              {label}
              <span className="flex gap-0.5">
                {keys.map((k) => (
                  <Kbd key={k}>{k === "⌘" ? mod() : k}</Kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

export function NewTaskDialog() {
  const state = useApp((s) => s.newTask);
  const set = useApp((s) => s.set);
  return (
    <Dialog open={state.open} onOpenChange={(o) => set({ newTask: o ? state : { open: false } })}>
      <DialogContent>
        <DialogTitle>New task</DialogTitle>
        <NewTaskForm state={state} />
      </DialogContent>
    </Dialog>
  );
}

function NewTaskForm({ state }: { state: ReturnType<typeof useApp.getState>["newTask"] }) {
  const boot = useApp((s) => s.boot);
  const agents = useAgents();
  const activeChannelId = useApp((s) => s.activeChannelId);
  const set = useApp((s) => s.set);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!boot) return null;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const [type, id] = String(form.get("assignee") ?? "").split(":");
    setBusy(true);
    try {
      const res = await api<{ task: TaskDTO }>("/tasks", {
        body: {
          title: form.get("title"),
          description: form.get("description") || undefined,
          priority: form.get("priority"),
          dueDate: form.get("due") || null,
          assigneeType: type || null,
          assigneeId: id || null,
          channelId: form.get("channel") || activeChannelId || null,
          sourceMessageId: state.sourceMessageId ?? null,
        },
      });
      useApp.getState().applyEvent({ t: "task.updated", task: res.task });
      set({ newTask: { open: false } });
      useApp.getState().openTask(res.task.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-3">
      <Input
        name="title"
        aria-label="Title"
        placeholder="Task title"
        required
        maxLength={200}
        autoFocus
        defaultValue={state.title}
      />
      <Textarea
        name="description"
        aria-label="Description"
        rows={3}
        placeholder="Details (optional)"
        defaultValue={state.description}
      />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="nt-assignee">Assignee</Label>
          <Select
            id="nt-assignee"
            name="assignee"
            className="mt-1 w-full"
            defaultValue={state.assignee ?? ""}
            data-testid="new-task-assignee"
          >
            <option value="">Unassigned</option>
            <optgroup label="Agents">
              {agents.map((a) => (
                <option key={a.id} value={`agent:${a.id}`}>
                  {a.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="People">
              {boot.members.map((m) => (
                <option key={m.userId} value={`human:${m.userId}`}>
                  {m.name}
                </option>
              ))}
            </optgroup>
          </Select>
        </div>
        <div>
          <Label htmlFor="nt-priority">Priority</Label>
          <Select id="nt-priority" name="priority" className="mt-1 w-full" defaultValue="none">
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p === "none" ? "No priority" : p[0]!.toUpperCase() + p.slice(1)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="nt-channel">Channel</Label>
          <Select
            id="nt-channel"
            name="channel"
            className="mt-1 w-full"
            defaultValue={activeChannelId ?? boot.channels.find((c) => c.name === "general")?.id}
          >
            {boot.channels.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="nt-due">Due</Label>
          <Input id="nt-due" name="due" type="date" className="mt-1 h-8" />
        </div>
      </div>
      <FormError error={error} />
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={() => set({ newTask: { open: false } })}>
          Cancel
        </Button>
        <Button type="submit" variant="light" disabled={busy} data-testid="create-task">
          Create task
        </Button>
      </div>
    </form>
  );
}

export function NewChannelDialog() {
  const open = useApp((s) => s.newChannel);
  const set = useApp((s) => s.set);
  return (
    <Dialog open={open} onOpenChange={(o) => set({ newChannel: o })}>
      <DialogContent>
        <DialogTitle>New channel</DialogTitle>
        <NewChannelForm />
      </DialogContent>
    </Dialog>
  );
}

function NewChannelForm() {
  const set = useApp((s) => s.set);
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const topic = new FormData(e.currentTarget).get("topic");
    try {
      const res = await api<{ channel: ChannelDTO }>("/channels", { body: { name, topic } });
      useApp.getState().applyEvent({ t: "channel.created", channel: res.channel });
      set({ newChannel: false });
      router.push(`/c/${res.channel.name}`);
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-3">
      <div className="flex items-center gap-2 rounded-chip border border-hair bg-void pl-3 focus-within:border-white/25">
        <Hash className="size-3.5 text-smoke" />
        <input
          aria-label="Channel name"
          value={name}
          onChange={(e) => setName(normalizeChannelName(e.target.value))}
          required
          autoFocus
          placeholder="design-review"
          className="h-9 flex-1 bg-transparent text-[14px] outline-none placeholder:text-smoke"
        />
      </div>
      <Input
        name="topic"
        aria-label="Topic"
        placeholder="What's it for? (optional)"
        maxLength={250}
      />
      <FormError error={error} />
      <div className="flex justify-end">
        <Button type="submit" variant="light">
          Create channel
        </Button>
      </div>
    </form>
  );
}

export function InviteDialog() {
  const open = useApp((s) => s.invite);
  const set = useApp((s) => s.set);
  return (
    <Dialog open={open} onOpenChange={(o) => set({ invite: o })}>
      <DialogContent>
        <DialogTitle>Invite a teammate</DialogTitle>
        <InviteForm />
      </DialogContent>
    </Dialog>
  );
}

function InviteForm() {
  const role = useApp((s) => s.boot?.role);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      const res = await api<{ url: string }>("/invites", {
        body: { email: form.get("email"), role: form.get("role") },
      });
      setLink(res.url);
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <>
      <p className="mt-1 text-[13px] text-ash">
        They get a link to join this workspace. Links work once and last 7 days.
      </p>
      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <div className="flex gap-2">
          <Input
            name="email"
            type="email"
            required
            aria-label="Email"
            placeholder="name@company.com"
            autoFocus
          />
          <Select name="role" aria-label="Role" defaultValue="member" className="h-9">
            {role === "owner" ? <option value="owner">Owner</option> : null}
            <option value="member">Member</option>
            <option value="guest">Guest</option>
          </Select>
        </div>
        <FormError error={error} />
        {link ? (
          <div className="rounded-image border border-hair bg-void p-2.5">
            <span className="eyebrow">Invite link</span>
            <code
              data-testid="invite-link"
              className="mt-0.5 block break-all font-mono text-[12px]"
            >
              {link}
            </code>
            <Button
              size="sm"
              variant="dark"
              className="mt-2"
              onClick={() => void navigator.clipboard?.writeText(link).catch(() => undefined)}
            >
              Copy link
            </Button>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button type="submit" variant="light">
              Create invite link
            </Button>
          </div>
        )}
      </form>
    </>
  );
}

export function ConnectDialog() {
  const open = useApp((s) => s.connect);
  const set = useApp((s) => s.set);
  return (
    <Dialog open={open} onOpenChange={(o) => set({ connect: o })}>
      <DialogContent className="w-[min(600px,calc(100vw-32px))]">
        <DialogTitle>Connect your agents</DialogTitle>
        <div className="mt-4">{open ? <ConnectBridge /> : null}</div>
      </DialogContent>
    </Dialog>
  );
}
