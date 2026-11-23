"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { can, formatBytes, type ChannelDTO, type MemberDTO, type Role } from "@oneswarm/shared";
import { api } from "@/lib/api";
import { useAgents, useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { StatusDot } from "@/components/ui/bits";

const SECTIONS = [
  ["profile", "Profile"],
  ["members", "Members"],
  ["agents", "Agents & Bridge"],
  ["channels", "Channels"],
  ["limits", "Limits"],
] as const;

export default function Page() {
  const { section } = useParams<{ section: string }>();
  return (
    <section className="flex min-w-0 flex-1 flex-col" aria-label="Settings">
      <header className="flex h-12 shrink-0 items-center border-b border-hair px-5">
        <h1 className="text-[15px] font-medium">Settings</h1>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav className="w-48 shrink-0 space-y-px p-3" aria-label="Settings sections">
          {SECTIONS.map(([id, label]) => (
            <Link
              key={id}
              href={`/settings/${id}`}
              className={cn(
                "block rounded-[8px] px-3 py-1.5 text-[14px] text-fog hover:bg-lift-2 hover:text-paper",
                section === id && "bg-lift-2 text-paper",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="min-w-0 flex-1 overflow-y-auto px-8 py-6">
          <div className="max-w-[720px]">
            {section === "profile" ? <Profile /> : null}
            {section === "members" ? <Members /> : null}
            {section === "agents" ? <Agents /> : null}
            {section === "channels" ? <Channels /> : null}
            {section === "limits" ? <Limits /> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function Heading({ title, body }: { title: string; body?: string }) {
  return (
    <div className="mb-6">
      <h2 className="display text-[40px] leading-[1.2]">{title}</h2>
      {body ? <p className="mt-1 text-[14px] text-ash">{body}</p> : null}
    </div>
  );
}

function Profile() {
  const boot = useApp((s) => s.boot)!;
  const showToast = useApp((s) => s.showToast);
  const router = useRouter();
  const [name, setName] = useState(boot.user.name);
  const [wsName, setWsName] = useState(boot.workspace.name);
  return (
    <div className="space-y-8">
      <Heading title="Profile" />
      <form
        className="space-y-2"
        onSubmit={async (e) => {
          e.preventDefault();
          await api("/me", { method: "PATCH", body: { name } }).then(
            () => showToast("Saved."),
            (err: Error) => showToast(err.message),
          );
          void useApp.getState().load();
        }}
      >
        <Label htmlFor="p-name">Your name</Label>
        <div className="flex gap-2">
          <Input
            id="p-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
          />
          <Button type="submit">Save</Button>
        </div>
        <p className="text-[13px] text-ash">{boot.user.email}</p>
      </form>
      {boot.role === "owner" ? (
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            await api("/workspace", { method: "PATCH", body: { name: wsName } }).then(
              () => showToast("Saved."),
              (err: Error) => showToast(err.message),
            );
            void useApp.getState().load();
          }}
        >
          <Label htmlFor="p-ws">Workspace name</Label>
          <div className="flex gap-2">
            <Input
              id="p-ws"
              value={wsName}
              onChange={(e) => setWsName(e.target.value)}
              maxLength={60}
            />
            <Button type="submit">Save</Button>
          </div>
        </form>
      ) : null}
      <Button
        variant="dark"
        onClick={async () => {
          await api("/auth/logout", { method: "POST" }).catch(() => undefined);
          router.replace("/login");
          window.location.reload();
        }}
      >
        Sign out
      </Button>
    </div>
  );
}

function Members() {
  const boot = useApp((s) => s.boot)!;
  const set = useApp((s) => s.set);
  const showToast = useApp((s) => s.showToast);
  const owner = boot.role === "owner";
  return (
    <div>
      <Heading
        title="Members"
        body="Owners manage the workspace. Members do everything else. Guests only see channels they're added to."
      />
      {can(boot.role, "member.invite") ? (
        <Button variant="light" onClick={() => set({ invite: true })} data-testid="invite-button">
          Invite teammate
        </Button>
      ) : null}
      <ul className="mt-5 divide-y divide-hair">
        {boot.members.map((m: MemberDTO) => (
          <li key={m.userId} className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[14px]">{m.name}</p>
              <p className="text-[12px] text-ash">{m.email}</p>
            </div>
            {owner && m.userId !== boot.user.id ? (
              <>
                <Select
                  aria-label={`Role for ${m.name}`}
                  value={m.role}
                  onChange={(e) =>
                    void api(`/members/${m.userId}`, {
                      method: "PATCH",
                      body: { role: e.target.value as Role },
                    }).catch((err: Error) => showToast(err.message))
                  }
                >
                  <option value="owner">Owner</option>
                  <option value="member">Member</option>
                  <option value="guest">Guest</option>
                </Select>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void api(`/members/${m.userId}`, { method: "DELETE" }).catch((err: Error) =>
                      showToast(err.message),
                    )
                  }
                >
                  Remove
                </Button>
              </>
            ) : (
              <span className="eyebrow">{m.role}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Agents() {
  const boot = useApp((s) => s.boot)!;
  const agents = useAgents();
  const set = useApp((s) => s.set);
  const showToast = useApp((s) => s.showToast);
  const manage = can(boot.role, "agent.manage");
  const patchAgent = (id: string, body: Record<string, unknown>) =>
    api(`/agents/${id}`, { method: "PATCH", body }).catch((err: Error) => showToast(err.message));
  return (
    <div className="space-y-10">
      <div>
        <Heading
          title="Agents"
          body="Agents run on your computers through the bridge. Choose which channels each one is in and whether it can create tasks."
        />
        {agents.length === 0 ? <p className="text-[14px] text-ash">No agents yet.</p> : null}
        <ul className="divide-y divide-hair">
          {agents.map((a) => (
            <li key={a.id} className="py-4">
              <div className="flex items-center gap-2">
                <StatusDot status={a.status} />
                <Input
                  aria-label={`Name of ${a.name}`}
                  defaultValue={a.name}
                  disabled={!manage}
                  className="h-8 w-40"
                  onBlur={(e) =>
                    e.target.value !== a.name && void patchAgent(a.id, { name: e.target.value })
                  }
                />
                <span className="text-smoke">@</span>
                <Input
                  aria-label={`Handle of ${a.name}`}
                  defaultValue={a.handle}
                  disabled={!manage}
                  className="h-8 w-32 font-mono text-[13px]"
                  onBlur={(e) =>
                    e.target.value !== a.handle && void patchAgent(a.id, { handle: e.target.value })
                  }
                />
                <span className="ml-auto text-[12px] text-ash">on {a.deviceName}</span>
              </div>
              {!a.loggedIn && a.loginCommand ? (
                <p className="mt-2 text-[13px] text-fog">
                  Not logged in. Run{" "}
                  <code className="rounded bg-lift-2 px-1 font-mono">{a.loginCommand}</code> on{" "}
                  {a.deviceName}.
                </p>
              ) : null}
              <label className="mt-3 flex items-center gap-2 text-[13px] text-fog">
                <input
                  type="checkbox"
                  checked={a.canCreateTasks}
                  disabled={!manage}
                  onChange={(e) => void patchAgent(a.id, { canCreateTasks: e.target.checked })}
                />
                Can create tasks
              </label>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {boot.channels.map((c) => {
                  const on = a.channelIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      disabled={!manage}
                      aria-pressed={on}
                      onClick={() =>
                        void patchAgent(a.id, {
                          channelIds: on
                            ? a.channelIds.filter((x) => x !== c.id)
                            : [...a.channelIds, c.id],
                        })
                      }
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 text-[12px]",
                        on
                          ? "border-hair-strong bg-graphite text-paper"
                          : "border-hair text-ash hover:text-paper",
                      )}
                    >
                      #{c.name}
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="text-[22px] font-medium">Bridge devices</h3>
        <p className="mt-1 text-[14px] text-ash">
          Each computer running the bridge. Revoking a device disconnects it immediately.
        </p>
        {can(boot.role, "device.pair") ? (
          <Button className="mt-3" variant="light" onClick={() => set({ connect: true })}>
            Connect a computer
          </Button>
        ) : null}
        <ul className="mt-4 divide-y divide-hair">
          {boot.devices.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-3">
              <StatusDot status={d.connected ? "online" : "offline"} />
              <Input
                aria-label={`Name of device ${d.name}`}
                defaultValue={d.name}
                className="h-8 w-56"
                onBlur={(e) =>
                  e.target.value !== d.name &&
                  void api(`/devices/${d.id}`, {
                    method: "PATCH",
                    body: { name: e.target.value },
                  }).catch((err: Error) => showToast(err.message))
                }
              />
              <span className="text-[12px] text-ash">
                {d.platform} ·{" "}
                {d.connected
                  ? "connected"
                  : d.lastSeenAt
                    ? `last seen ${new Date(d.lastSeenAt).toLocaleString()}`
                    : "never connected"}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                onClick={() =>
                  void api(`/devices/${d.id}/revoke`, { method: "POST" }).catch((err: Error) =>
                    showToast(err.message),
                  )
                }
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Channels() {
  const boot = useApp((s) => s.boot)!;
  const set = useApp((s) => s.set);
  const showToast = useApp((s) => s.showToast);
  return (
    <div>
      <Heading title="Channels" />
      {can(boot.role, "channel.create") ? (
        <Button variant="light" onClick={() => set({ newChannel: true })}>
          New channel
        </Button>
      ) : null}
      <ul className="mt-5 divide-y divide-hair">
        {boot.channels.map((c: ChannelDTO) => (
          <li key={c.id} className="flex items-center gap-3 py-3">
            <span className="w-40 truncate text-[14px]">#{c.name}</span>
            <Input
              aria-label={`Topic of #${c.name}`}
              defaultValue={c.topic}
              placeholder="Topic"
              disabled={!can(boot.role, "channel.update")}
              onBlur={(e) =>
                e.target.value !== c.topic &&
                void api(`/channels/${c.id}`, {
                  method: "PATCH",
                  body: { topic: e.target.value },
                }).catch((err: Error) => showToast(err.message))
              }
            />
            <span className="w-24 text-right text-[12px] text-ash">{c.memberCount} members</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Limits() {
  const limits = useApp((s) => s.boot!.limits);
  const rows: Array<[string, string, string]> = [
    ["Largest file", formatBytes(limits.maxFileSizeBytes), "Per upload"],
    [
      "Storage",
      formatBytes(limits.workspaceStorageBytes),
      `${formatBytes(limits.storageUsedBytes)} used`,
    ],
    [
      "Agent messages",
      `${limits.agentMessagesPerHour} per hour`,
      `${limits.agentMessagesThisHour} in the last hour`,
    ],
  ];
  return (
    <div>
      <Heading
        title="Limits"
        body="Fair-use limits keep the service fast for everyone. OneSwarm never pays for AI: agents run on your own accounts."
      />
      <dl className="divide-y divide-hair">
        {rows.map(([label, value, note]) => (
          <div key={label} className="flex items-baseline gap-4 py-4">
            <dt className="w-40 text-[14px] text-fog">{label}</dt>
            <dd className="font-[family-name:var(--font-sans)] text-[30px] leading-none tracking-[-0.03em]">
              {value}
            </dd>
            <dd className="ml-auto text-[13px] text-ash">{note}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
