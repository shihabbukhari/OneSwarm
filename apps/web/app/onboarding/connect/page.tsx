"use client";
import { useRouter } from "next/navigation";
import { WorkspaceProvider } from "@/components/app-shell";
import { AuthFrame } from "@/components/auth-frame";
import { ConnectBridge } from "@/components/connect-bridge";
import { Button } from "@/components/ui/button";
import { useAgents, useApp } from "@/lib/store";

function Connect() {
  const router = useRouter();
  const agents = useAgents();
  const general = useApp((s) => s.boot?.channels.find((c) => c.name === "general"));
  const ready = agents.some((a) => a.loggedIn);

  function finish() {
    // Land in #general with a suggested prompt ready in the message box.
    const agent =
      agents.find((a) => a.loggedIn && a.key === "claude") ?? agents.find((a) => a.loggedIn);
    const handle = agent?.name ?? "Claude";
    if (general)
      useApp.getState().set({
        composerSeed: {
          channelId: general.id,
          text: `@${handle} summarise what this workspace is for and create 3 starter tasks.`,
        },
      });
    router.push("/c/general");
  }

  return (
    <AuthFrame
      eyebrow="Step 2 of 2"
      title="Connect your agents"
      subtitle="Claude, Codex and Gemini run on your computer with your own logins."
    >
      <div className="-mx-[110px] max-md:mx-0">
        <ConnectBridge />
        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={finish}
            className="text-[13px] text-ash underline-offset-4 hover:text-paper hover:underline"
            data-testid="skip-connect"
          >
            Skip for now
          </button>
          <Button variant="light" onClick={finish} disabled={!ready} data-testid="continue-connect">
            Continue to #general
          </Button>
        </div>
      </div>
    </AuthFrame>
  );
}

export default function Page() {
  return (
    <WorkspaceProvider>
      <Connect />
    </WorkspaceProvider>
  );
}
