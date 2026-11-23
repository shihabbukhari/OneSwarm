/**
 * Seeds a demo workspace for local development. Safe to re-run: it does nothing
 * if the demo account already exists.
 *
 *   email:    demo@oneswarm.test
 *   password: oneswarm-demo
 */
import { eq } from "drizzle-orm";
import { env } from "../env";
import { hashPassword, newId } from "../security";
import { openDb } from "./client";
import {
  channelMembers,
  channels,
  messages,
  taskEvents,
  tasks,
  users,
  workspaceMembers,
  workspaces,
} from "./schema";

const EMAIL = "demo@oneswarm.test";
const PASSWORD = "oneswarm-demo";

const handle = await openDb(env.databaseUrl);
const { db } = handle;
const [existing] = await db.select().from(users).where(eq(users.email, EMAIL));
if (existing) {
  console.log(`[seed] ${EMAIL} already exists; nothing to do.`);
} else {
  const userId = newId();
  const teammateId = newId();
  const workspaceId = newId();
  const general = newId();
  const design = newId();
  await db.insert(users).values([
    { id: userId, email: EMAIL, name: "Demo Owner", passwordHash: await hashPassword(PASSWORD) },
    {
      id: teammateId,
      email: "teammate@oneswarm.test",
      name: "Sam Rivera",
      passwordHash: await hashPassword(PASSWORD),
    },
  ]);
  await db
    .insert(workspaces)
    .values({ id: workspaceId, name: "Demo Studio", ownerId: userId, taskCounter: 2 });
  await db.insert(workspaceMembers).values([
    { workspaceId, userId, role: "owner" },
    { workspaceId, userId: teammateId, role: "member" },
  ]);
  await db.insert(channels).values([
    {
      id: general,
      workspaceId,
      name: "general",
      topic: "Everyone, people and agents.",
      createdBy: userId,
    },
    {
      id: design,
      workspaceId,
      name: "design",
      topic: "Screens, flows and copy.",
      createdBy: userId,
    },
  ]);
  await db.insert(channelMembers).values([
    {
      channelId: general,
      workspaceId,
      memberType: "human",
      memberId: userId,
      lastReadAt: new Date(),
    },
    { channelId: general, workspaceId, memberType: "human", memberId: teammateId },
    {
      channelId: design,
      workspaceId,
      memberType: "human",
      memberId: userId,
      lastReadAt: new Date(),
    },
  ]);
  const t0 = Date.now() - 60 * 60 * 1000;
  await db.insert(messages).values([
    {
      id: newId(),
      workspaceId,
      channelId: general,
      authorType: "human",
      authorId: teammateId,
      body: "Morning! I put the launch checklist in #design.",
      createdAt: new Date(t0),
    },
    {
      id: newId(),
      workspaceId,
      channelId: general,
      authorType: "human",
      authorId: userId,
      body: "Thanks Sam. Once the bridge is connected, try `@Claude` here.",
      createdAt: new Date(t0 + 60_000),
    },
  ]);
  const taskA = newId();
  const taskB = newId();
  await db.insert(tasks).values([
    {
      id: taskA,
      workspaceId,
      number: 1,
      channelId: general,
      title: "Write the onboarding email",
      status: "todo",
      priority: "medium",
      createdBy: userId,
      assigneeType: "human",
      assigneeId: teammateId,
    },
    {
      id: taskB,
      workspaceId,
      number: 2,
      channelId: design,
      title: "Review the pricing page copy",
      status: "doing",
      priority: "high",
      createdBy: userId,
      assigneeType: "human",
      assigneeId: userId,
    },
  ]);
  await db.insert(taskEvents).values([
    {
      id: newId(),
      workspaceId,
      taskId: taskA,
      actorType: "human",
      actorId: userId,
      type: "created",
      data: {},
    },
    {
      id: newId(),
      workspaceId,
      taskId: taskB,
      actorType: "human",
      actorId: userId,
      type: "created",
      data: {},
    },
  ]);
  console.log(`[seed] Created ${EMAIL} / ${PASSWORD} in workspace "Demo Studio".`);
}
await handle.close();
