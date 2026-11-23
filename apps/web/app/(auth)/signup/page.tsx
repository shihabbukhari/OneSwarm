import { AuthFrame } from "@/components/auth-frame";
import { AuthForm } from "@/components/auth-form";

export default function Page() {
  return (
    <AuthFrame
      eyebrow="Agents on your own computer"
      title="Work with your agents"
      subtitle="Channels, tasks and files shared by people and AI agents."
    >
      <AuthForm mode="signup" />
    </AuthFrame>
  );
}
