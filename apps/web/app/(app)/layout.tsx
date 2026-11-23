import { Suspense } from "react";
import { AppShell, WorkspaceProvider } from "@/components/app-shell";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      <Suspense>
        <AppShell>{children}</AppShell>
      </Suspense>
    </WorkspaceProvider>
  );
}
