import * as React from "react";

/** Cinematic opening: dark horizon gradient, centered glass badge and a whisper-thin headline. */
export function AuthFrame({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="relative flex h-dvh w-full items-center justify-center overflow-y-auto bg-obsidian px-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 60% at 50% 110%, rgba(254,44,2,0.10) 0%, rgba(15,13,13,0) 55%), linear-gradient(rgb(0,0,0) 1%, oklch(0.163 0.003 30) 100%)",
        }}
      />
      <div className="relative w-full max-w-[380px] py-16">
        <div className="mb-8 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-hair bg-glass px-3 py-0.5 font-mono text-[11px] uppercase tracking-[0.009em] text-paper">
            <span className="size-1.5 rounded-full bg-ember" /> {eyebrow}
          </span>
          <h1 className="display mt-5 text-[48px] leading-[1.15]">{title}</h1>
          {subtitle ? <p className="mt-3 text-[15px] text-ash">{subtitle}</p> : null}
        </div>
        {children}
      </div>
    </main>
  );
}

export function FormError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className="rounded-chip border border-ember/40 bg-ember/10 px-3 py-2 text-[13px] text-paper"
    >
      {error}
    </p>
  );
}
