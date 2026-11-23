"use client";
import { useParams } from "next/navigation";
import { ChannelView } from "@/components/channel-view";
import { EmptyState } from "@/components/ui/bits";
import { useApp } from "@/lib/store";

export default function Page() {
  const { channel } = useParams<{ channel: string }>();
  const found = useApp((s) => s.boot?.channels.find((c) => c.name === decodeURIComponent(channel)));
  if (!found)
    return (
      <EmptyState
        eyebrow={`#${channel}`}
        title="Channel not found"
        body="It may have been renamed, or you may not have access."
      />
    );
  return <ChannelView key={found.id} channelId={found.id} />;
}
