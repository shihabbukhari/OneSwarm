"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { AuthFrame, FormError } from "@/components/auth-frame";
import { AuthForm } from "@/components/auth-form";

export default function Page() {
  const { token } = useParams<{ token: string }>();
  const [invite, setInvite] = useState<{
    workspaceName: string;
    inviter: string;
    email: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ workspaceName: string; inviter: string; email: string }>(`/invites/${token}`).then(
      setInvite,
      (e: Error) => setError(e.message),
    );
  }, [token]);
  return (
    <AuthFrame
      eyebrow="You're invited"
      title={invite ? `Join ${invite.workspaceName}` : "Join a workspace"}
      subtitle={invite ? `${invite.inviter} invited you to OneSwarm.` : undefined}
    >
      {error ? (
        <FormError error={error} />
      ) : invite ? (
        <AuthForm mode="signup" inviteToken={token} defaultEmail={invite.email} />
      ) : null}
    </AuthFrame>
  );
}
