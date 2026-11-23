"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { useAgents } from "@/lib/store";
import { Button } from "./ui/button";
import { Skeleton, StatusDot } from "./ui/bits";

/** One copyable command, plus the live list of agents as the bridge detects them. */
export function ConnectBridge() {
  const agents = useAgents();
  const [command, setCommand] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const request = useCallback(() => {
    api<{ command: string }>("/bridge/pairing-codes", { method: "POST" }).then(
      (r) => {
        setCommand(r.command);
        setError(null);
      },
      (e: Error) => setError(e.message),
    );
  }, []);
  useEffect(() => {
    request();
  }, [request]);
  const fresh = () => {
    setCommand(null);
    request();
  };

  return (
    <div className="space-y-5">
      <div>
        <span className="eyebrow">Run this on the computer where your agents are installed</span>
        <div className="mt-1.5 flex items-center gap-2 rounded-image border border-hair bg-void p-1.5 pl-3">
          {command ? (
            <code
              data-testid="connect-command"
              className="min-w-0 flex-1 truncate font-mono text-[13px] text-paper"
            >
              {command}
            </code>
          ) : error ? (
            <span className="flex-1 text-[13px] text-ember">{error}</span>
          ) : (
            <Skeleton className="h-4 flex-1" />
          )}
          <Button
            size="sm"
            variant="light"
            disabled={!command}
            onClick={() => {
              if (!command) return;
              void navigator.clipboard?.writeText(command).catch(() => undefined);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
          </Button>
          <Button size="icon" variant="ghost" aria-label="New code" onClick={fresh}>
            <RefreshCw />
          </Button>
        </div>
        <p className="mt-1.5 text-[12px] text-smoke">
          The code works once and expires in 15 minutes. Agents keep their own logins; OneSwarm
          never sees or stores provider credentials.
        </p>
      </div>
      <div>
        <span className="eyebrow">Agents</span>
        <ul
          className="mt-1 divide-y divide-hair rounded-image border border-hair"
          data-testid="connect-agents"
        >
          {agents.length === 0 ? (
            <li className="flex items-center gap-2 px-3 py-3 text-[13px] text-ash">
              <span className="size-1.5 animate-pulse-dot rounded-full bg-ember" /> Waiting for the
              bridge…
            </li>
          ) : null}
          {agents.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-2.5 px-3 py-2.5"
              data-testid={`connect-agent-${a.handle}`}
            >
              <StatusDot status={a.status} />
              <span className="text-[14px]">{a.name}</span>
              <span className="text-[12px] text-smoke">{a.deviceName}</span>
              <span className="ml-auto text-[12px] text-ash">
                {a.loggedIn ? (
                  a.status === "offline" ? (
                    "offline"
                  ) : (
                    "ready"
                  )
                ) : (
                  <>
                    Not logged in · run{" "}
                    <code className="rounded bg-lift-2 px-1 font-mono text-paper">
                      {a.loginCommand}
                    </code>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
