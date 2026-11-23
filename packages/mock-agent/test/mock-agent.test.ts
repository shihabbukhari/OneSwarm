import * as acp from "@agentclientprotocol/sdk";
import { describe, expect, it } from "vitest";
import { createMockAgent } from "../src/agent";

const { client, methods } = acp;

describe("mock ACP agent", () => {
  it("exposes 3 models, streams a reply, updates config and asks one permission", async () => {
    process.env.MOCK_AGENT_DELAY_MS = "0";
    const updates: Array<{ sessionUpdate: string; [k: string]: unknown }> = [];
    const permissions: acp.RequestPermissionRequest[] = [];
    const app = client({ name: "test" })
      .onNotification(methods.client.session.update, ({ params }) => {
        updates.push(params.update as never);
      })
      .onRequest(methods.client.session.requestPermission, ({ params }) => {
        permissions.push(params);
        return { outcome: { outcome: "selected", optionId: "allow" } };
      });

    await app.connectWith(createMockAgent(), async (agent) => {
      await agent.request(methods.agent.initialize, {
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: {},
      });
      const session = await agent.request(methods.agent.session.new, {
        cwd: "/tmp",
        mcpServers: [],
      });
      const model = session.configOptions?.find((o) => o.category === "model") as
        { options: unknown[] } | undefined;
      expect(model?.options).toHaveLength(3);

      const set = await agent.request(methods.agent.session.setConfigOption, {
        sessionId: session.sessionId,
        configId: "model",
        value: "titan",
      });
      expect(set.configOptions.find((o) => o.id === "model")?.currentValue).toBe("titan");
      expect(updates.some((u) => u.sessionUpdate === "config_option_update")).toBe(true);

      const hello = await agent.request(methods.agent.session.prompt, {
        sessionId: session.sessionId,
        prompt: [{ type: "text", text: "Message: hello" }],
      });
      expect(hello.stopReason).toBe("end_turn");
      const text = updates
        .filter((u) => u.sessionUpdate === "agent_message_chunk")
        .map((u) => (u.content as { text: string }).text)
        .join("");
      expect(text).toContain("Mock Titan");
      expect(permissions).toHaveLength(0);

      await agent.request(methods.agent.session.prompt, {
        sessionId: session.sessionId,
        prompt: [{ type: "text", text: "Message: please edit notes" }],
      });
      expect(permissions).toHaveLength(1);
      expect(permissions[0]?.options.map((o) => o.kind)).toEqual(["allow_once", "reject_once"]);
    });
  });

  it("narrows effort choices when switching to the fast model", async () => {
    const app = client({ name: "test" });
    await app.connectWith(createMockAgent(), async (agent) => {
      await agent.request(methods.agent.initialize, {
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: {},
      });
      const s = await agent.request(methods.agent.session.new, { cwd: "/tmp", mcpServers: [] });
      await agent.request(methods.agent.session.setConfigOption, {
        sessionId: s.sessionId,
        configId: "effort",
        value: "high",
      });
      const res = await agent.request(methods.agent.session.setConfigOption, {
        sessionId: s.sessionId,
        configId: "model",
        value: "swift",
      });
      const effort = res.configOptions.find((o) => o.id === "effort") as {
        currentValue: string;
        options: unknown[];
      };
      expect(effort.currentValue).toBe("medium");
      expect(effort.options).toHaveLength(2);
    });
  });
});
