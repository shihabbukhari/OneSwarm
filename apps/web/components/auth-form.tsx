"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { FormError } from "./auth-frame";

export function AuthForm({
  mode,
  inviteToken,
  defaultEmail,
}: {
  mode: "login" | "signup";
  inviteToken?: string;
  defaultEmail?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api(`/auth/${mode}`, {
        body: {
          name: form.get("name") ?? undefined,
          email: form.get("email"),
          password: form.get("password"),
        },
      });
      if (inviteToken) {
        await api(`/invites/${inviteToken}/accept`, { method: "POST" });
        router.replace("/c/general");
        return;
      }
      const me = await api<{ workspace: unknown }>("/me");
      router.replace(me.workspace ? "/c/general" : "/onboarding");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {mode === "signup" ? (
        <div className="space-y-1">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" autoComplete="name" required autoFocus />
        </div>
      ) : null}
      <div className="space-y-1">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={defaultEmail}
          autoFocus={mode === "login"}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          minLength={mode === "signup" ? 8 : 1}
          required
        />
      </div>
      <FormError error={error} />
      <Button type="submit" variant="light" className="w-full" disabled={busy}>
        {busy ? "One moment…" : mode === "signup" ? "Create account" : "Sign in"}
      </Button>
      <p className="text-center text-[13px] text-ash">
        {mode === "signup" ? (
          <>
            Have an account?{" "}
            <Link
              className="text-paper underline-offset-4 hover:underline"
              href={inviteToken ? `/login?invite=${inviteToken}` : "/login"}
            >
              Sign in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link
              className="text-paper underline-offset-4 hover:underline"
              href={inviteToken ? `/invite/${inviteToken}` : "/signup"}
            >
              Create an account
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
