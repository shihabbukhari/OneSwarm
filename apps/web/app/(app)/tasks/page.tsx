"use client";
import { useSearchParams } from "next/navigation";
import { TasksView } from "@/components/tasks-view";

export default function Page() {
  const f = useSearchParams().get("filter");
  return <TasksView filter={f === "mine" || f === "review" ? f : "all"} />;
}
