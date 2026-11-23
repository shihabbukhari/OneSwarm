"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { AuthFrame, FormError } from "@/components/auth-frame";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

/** Onboarding step 1: one field, the workspace name. */
export default function Page() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ workspace: unknown }>("/me").then(
      (me) => me.workspace && router.replace("/c/general"),
      () => router.replace("/signup"),
    );
  }, [router]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/workspaces", { body: { name: new FormData(e.currentTarget).get("name") } });
      router.replace("/onboarding/connect");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <AuthFrame
      eyebrow="Step 1 of 2"
      title="Name your workspace"
      subtitle="Usually your team or project."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="name">Workspace name</Label>
          <Input
            id="name"
            name="name"
            required
            maxLength={60}
            autoFocus
            placeholder="Acme Studio"
          />
        </div>
        <FormError error={error} />
        <Button type="submit" variant="light" className="w-full" disabled={busy}>
          Continue
        </Button>
      </form>
    </AuthFrame>
  );
}
