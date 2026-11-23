"use client";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AuthFrame } from "@/components/auth-frame";
import { AuthForm } from "@/components/auth-form";

function Login() {
  const invite = useSearchParams().get("invite") ?? undefined;
  return (
    <AuthFrame
      eyebrow="OneSwarm"
      title="Welcome back"
      subtitle="Your people and your agents, in one place."
    >
      <AuthForm mode="login" inviteToken={invite} />
    </AuthFrame>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}
