import { describe, expect, it } from "vitest";
import {
  agentCanCreateTask,
  agentCanUseChannel,
  can,
  canChangeRole,
  canSeeChannel,
  filesVisibleToAgent,
  invitableRoles,
} from "../src/permissions";

describe("role permissions", () => {
  it("lets owners do everything", () => {
    for (const action of [
      "workspace.update",
      "member.manage",
      "agent.manage",
      "approval.decide",
    ] as const) {
      expect(can("owner", action)).toBe(true);
    }
  });

  it("keeps workspace and member management with owners", () => {
    expect(can("member", "workspace.update")).toBe(false);
    expect(can("member", "member.manage")).toBe(false);
    expect(can("member", "member.invite")).toBe(true);
  });

  it("limits guests to talking and tasks", () => {
    expect(can("guest", "message.post")).toBe(true);
    expect(can("guest", "task.create")).toBe(true);
    expect(can("guest", "channel.create")).toBe(false);
    expect(can("guest", "approval.decide")).toBe(false);
    expect(can("guest", "device.pair")).toBe(false);
    expect(can("guest", "agent.configure")).toBe(false);
  });

  it("denies everything without a role", () => {
    expect(can(null, "message.post")).toBe(false);
    expect(can(undefined, "task.create")).toBe(false);
  });

  it("only lets owners invite owners", () => {
    expect(invitableRoles("owner")).toContain("owner");
    expect(invitableRoles("member")).toEqual(["member", "guest"]);
    expect(invitableRoles("guest")).toEqual([]);
  });

  it("never removes the last owner", () => {
    expect(
      canChangeRole({ actorRole: "owner", targetRole: "owner", nextRole: "member", ownerCount: 1 }),
    ).toBe(false);
    expect(
      canChangeRole({ actorRole: "owner", targetRole: "owner", nextRole: "member", ownerCount: 2 }),
    ).toBe(true);
    expect(
      canChangeRole({
        actorRole: "member",
        targetRole: "guest",
        nextRole: "member",
        ownerCount: 1,
      }),
    ).toBe(false);
  });
});

describe("channel visibility", () => {
  it("shows every channel to members, only joined ones to guests", () => {
    expect(canSeeChannel({ role: "member", isMember: false })).toBe(true);
    expect(canSeeChannel({ role: "guest", isMember: false })).toBe(false);
    expect(canSeeChannel({ role: "guest", isMember: true })).toBe(true);
  });
});

describe("agent permissions", () => {
  const agent = { channelIds: ["c1", "c2"], canCreateTasks: true };

  it("restricts agents to their channels", () => {
    expect(agentCanUseChannel(agent, "c1")).toBe(true);
    expect(agentCanUseChannel(agent, "c3")).toBe(false);
  });

  it("gates task creation on the flag and the channel", () => {
    expect(agentCanCreateTask(agent, "c1")).toBe(true);
    expect(agentCanCreateTask(agent, "c3")).toBe(false);
    expect(agentCanCreateTask({ ...agent, canCreateTasks: false }, "c1")).toBe(false);
  });

  it("exposes only files from the agent's channels", () => {
    const files = [
      { id: "a", channelId: "c1" },
      { id: "b", channelId: "c3" },
      { id: "c", channelId: null },
    ];
    expect(filesVisibleToAgent(agent, files).map((f) => f.id)).toEqual(["a"]);
  });
});
