"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/lib/api";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    api<{ workspace: unknown }>("/me").then(
      (me) => router.replace(me.workspace ? "/c/general" : "/onboarding"),
      () => router.replace("/login"),
    );
  }, [router]);
  return <main className="h-dvh bg-onyx" />;
}
