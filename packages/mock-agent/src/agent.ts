import * as acp from "@agentclientprotocol/sdk";

const { agent, methods } = acp;

/**
 * A deterministic ACP agent for tests and demos. It
 *  - streams its reply token by token,
 *  - exposes three models plus effort, mode and model settings as `configOptions`,
 *  - sends `config_option_update` when a change affects other options,
 *  - asks for one permission when the prompt asks it to edit or write something.
 */

const MODELS = [
  { value: "swift", name: "Mock Swift", description: "Fast and light" },
  { value: "sage", name: "Mock Sage", description: "Balanced" },
  { value: "titan", name: "Mock Titan", description: "Most capable" },
] as const;

interface SessionState {
  model: string;
  effort: string;
  mode: string;
  context: string;
  fast: boolean;
  permissionAsked: boolean;
  cancelled: boolean;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const TOKEN_DELAY = Number(process.env.MOCK_AGENT_DELAY_MS ?? 15);

function effortChoices(model: string): Array<{ value: string; name: string }> {
  // Swift has no high effort: switching to it narrows the effort list.
  const all = [
    { value: "low", name: "Low" },
    { value: "medium", name: "Medium" },
    { value: "high", name: "High" },
  ];
  return model === "swift" ? all.slice(0, 2) : all;
}

function configOptions(s: SessionState, booleans: boolean): acp.SessionConfigOption[] {
  const opts: acp.SessionConfigOption[] = [
    {
      id: "model",
      name: "Model",
      category: "model",
      type: "select",
      currentValue: s.model,
      options: MODELS.map((m) => ({ value: m.value, name: m.name, description: m.description })),
    },
    {
      id: "effort",
      name: "Effort",
      category: "thought_level",
      type: "select",
      currentValue: s.effort,
      options: effortChoices(s.model),
    },
    {
      id: "mode",
      name: "Mode",
      category: "mode",
      type: "select",
      currentValue: s.mode,
      options: [
        { value: "ask", name: "Ask", description: "Ask before changing anything" },
        { value: "auto", name: "Auto", description: "Edit without asking" },
        { value: "plan", name: "Plan", description: "Plan only, no edits" },
      ],
    },
    {
      id: "context",
      name: "Context size",
      category: "model_config",
      type: "select",
      currentValue: s.context,
      options: [
        { value: "200k", name: "200K tokens" },
        { value: "1m", name: "1M tokens" },
      ],
    },
  ];
  if (booleans) {
    opts.push({
      id: "fast",
      name: "Fast mode",
      category: "model_config",
      type: "boolean",
      currentValue: s.fast,
    });
  } else {
    opts.push({
      id: "fast",
      name: "Fast mode",
      category: "model_config",
      type: "select",
      currentValue: s.fast ? "on" : "off",
      options: [
        { value: "off", name: "Off" },
        { value: "on", name: "On" },
      ],
    });
  }
  return opts;
}

function promptText(prompt: acp.ContentBlock[]): string {
  return prompt
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("\n")
    .trim();
}

/** The actual request, without the channel context the bridge adds around it. */
function lastMessage(text: string): string {
  const match = /Message:\s*([\s\S]*)$/.exec(text);
  return (match ? match[1]! : text).trim();
}

export function createMockAgent(): acp.AgentApp {
  const sessions = new Map<string, SessionState>();
  let booleans = false;
  let counter = 0;

  return agent({ name: "oneswarm-mock-agent" })
    .onRequest(methods.agent.initialize, ({ params }) => {
      booleans = Boolean(
        (
          params.clientCapabilities as
            { session?: { configOptions?: { boolean?: unknown } | null } | null } | undefined
        )?.session?.configOptions?.boolean,
      );
      return {
        protocolVersion: acp.PROTOCOL_VERSION,
        agentCapabilities: {
          loadSession: false,
          promptCapabilities: { image: false, audio: false, embeddedContext: true },
        },
        agentInfo: { name: "mock", title: "Mock", version: "0.1.0" },
        authMethods: [],
      };
    })
    .onRequest(methods.agent.session.new, () => {
      if (process.env.MOCK_AGENT_LOGGED_OUT === "1") {
        throw acp.RequestError.authRequired();
      }
      const sessionId = `mock-${++counter}-${Date.now().toString(36)}`;
      const state: SessionState = {
        model: "sage",
        effort: "medium",
        mode: "ask",
        context: "200k",
        fast: false,
        permissionAsked: false,
        cancelled: false,
      };
      sessions.set(sessionId, state);
      return { sessionId, configOptions: configOptions(state, booleans) };
    })
    .onRequest(methods.agent.session.setConfigOption, async ({ params, client }) => {
      const s = sessions.get(params.sessionId);
      if (!s) throw acp.RequestError.resourceNotFound(params.sessionId);
      const value = (params as { value: string | boolean }).value;
      switch (params.configId) {
        case "model":
          if (!MODELS.some((m) => m.value === value))
            throw acp.RequestError.invalidParams({ value });
          s.model = String(value);
          if (!effortChoices(s.model).some((e) => e.value === s.effort)) s.effort = "medium";
          break;
        case "effort":
          if (!effortChoices(s.model).some((e) => e.value === value))
            throw acp.RequestError.invalidParams({ value });
          s.effort = String(value);
          break;
        case "mode":
          s.mode = String(value);
          break;
        case "context":
          s.context = String(value);
          break;
        case "fast":
          s.fast = value === true || value === "on";
          break;
        default:
          throw acp.RequestError.invalidParams({ configId: params.configId });
      }
      const options = configOptions(s, booleans);
      // Tell the client the full, possibly changed list (effort narrows on Swift).
      await client.notify(methods.client.session.update, {
        sessionId: params.sessionId,
        update: { sessionUpdate: "config_option_update", configOptions: options },
      });
      return { configOptions: options };
    })
    .onNotification(methods.agent.session.cancel, ({ params }) => {
      const s = sessions.get(params.sessionId);
      if (s) s.cancelled = true;
    })
    .onRequest(methods.agent.session.prompt, async ({ params, client }) => {
      const s = sessions.get(params.sessionId);
      if (!s) throw acp.RequestError.resourceNotFound(params.sessionId);
      s.cancelled = false;
      const sessionId = params.sessionId;
      const say = async (text: string) => {
        for (const token of text.match(/\S+\s*|\s+/g) ?? []) {
          if (s.cancelled) return;
          await client.notify(methods.client.session.update, {
            sessionId,
            update: {
              sessionUpdate: "agent_message_chunk",
              content: { type: "text", text: token },
            },
          });
          await delay(TOKEN_DELAY);
        }
      };
      const full = promptText(params.prompt);
      const message = lastMessage(full);
      const modelName = MODELS.find((m) => m.value === s.model)?.name ?? s.model;
      const task = /assigned Task (OS-\d+): (.+)/.exec(full);

      await client.notify(methods.client.session.update, {
        sessionId,
        update: {
          sessionUpdate: "tool_call",
          toolCallId: `read-${Date.now()}`,
          title: "Read channel context",
          kind: "read",
          status: "completed",
          locations: [{ path: "channel.md" }],
        },
      });

      if (task) {
        await say(`Working on **${task[1]}** with ${modelName}.\n\n`);
        await client.notify(methods.client.session.update, {
          sessionId,
          update: {
            sessionUpdate: "tool_call",
            toolCallId: `run-${Date.now()}`,
            title: "Run checks",
            kind: "execute",
            status: "completed",
            content: [{ type: "content", content: { type: "text", text: "All checks passed." } }],
          },
        });
        await say(`Done: ${task[2]!.trim()}. Everything is ready for review.`);
        return { stopReason: s.cancelled ? "cancelled" : "end_turn" };
      }

      const wantsEdit = /\b(edit|write|permission)\b/i.test(message);
      if (!wantsEdit) {
        await say(
          `Hello! I'm Mock running **${modelName}** (effort: ${s.effort}, mode: ${s.mode}). You said: “${message.slice(0, 200)}”`,
        );
        return { stopReason: s.cancelled ? "cancelled" : "end_turn" };
      }

      await say(`I'll update \`notes.md\` using ${modelName}. `);
      const toolCallId = `edit-${Date.now()}`;
      const diff = {
        type: "diff" as const,
        path: "notes.md",
        oldText: "# Notes\n",
        newText: "# Notes\n\n- Updated by Mock\n",
      };
      await client.notify(methods.client.session.update, {
        sessionId,
        update: {
          sessionUpdate: "tool_call",
          toolCallId,
          title: "Edit notes.md",
          kind: "edit",
          status: "pending",
          locations: [{ path: "notes.md" }],
          content: [diff],
        },
      });
      s.permissionAsked = true;
      const decision: acp.RequestPermissionResponse = await client.request(
        methods.client.session.requestPermission,
        {
          sessionId,
          toolCall: {
            toolCallId,
            title: "Edit notes.md",
            kind: "edit",
            locations: [{ path: "notes.md" }],
            content: [diff],
          },
          options: [
            { optionId: "allow", name: "Allow", kind: "allow_once" },
            { optionId: "reject", name: "Reject", kind: "reject_once" },
          ],
        },
      );
      const allowed =
        decision.outcome.outcome === "selected" && decision.outcome.optionId === "allow";
      await client.notify(methods.client.session.update, {
        sessionId,
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId,
          status: allowed ? "completed" : "failed",
        },
      });
      if (allowed) {
        await client.notify(methods.client.session.update, {
          sessionId,
          update: {
            sessionUpdate: "tool_call",
            toolCallId: `cmd-${Date.now()}`,
            title: "git diff --stat",
            kind: "execute",
            status: "completed",
            content: [{ type: "content", content: { type: "text", text: " notes.md | 2 ++" } }],
          },
        });
        await say("Done — I updated notes.md.");
      } else {
        await say("Okay, I left notes.md untouched.");
      }
      return { stopReason: s.cancelled ? "cancelled" : "end_turn" };
    });
}
