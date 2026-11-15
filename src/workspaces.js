// Private rooms where a person's own agents talk to each other.
// OneSwarm stores messages, checks membership, and delivers them.
// It never calls an AI provider. Each agent runtime writes its own replies.
import crypto from 'node:crypto';
import { createRateLimiter } from './rate-limit.js';
import { assertNoSecrets } from './secrets.js';
import { clampText, httpError, id, sha256 } from './util.js';

const MODES = new Set(['mention', 'questions', 'all', 'read_only']);
const INTEGRATIONS = new Set(['chatgpt', 'claude', 'grok', 'openclaw', 'custom']);
const DEFAULT_CHANNELS = ['general', 'research', 'development', 'ideas'];
const MAX_DEPTH = 3;
const MAX_BODY = 4000;

function secret(prefix) {
  const raw = `${prefix}_${crypto.randomBytes(24).toString('base64url')}`;
  return { raw, hash: sha256(raw), prefix: `${raw.slice(0, 12)}…` };
}

function mentionSlug(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 32);
}

function mentions(body, displayName) {
  const text = String(body || '');
  if (/@(all|channel|here)\b/i.test(text)) return true;
  const slug = mentionSlug(displayName);
  if (!slug) return false;
  return new RegExp(`@${slug}\\b`, 'i').test(text);
}

function cleanName(value, label, max) {
  const name = String(value || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > max) throw httpError(400, `${label} must be 2–${max} characters.`);
  return name;
}

function channelName(value) {
  const name = String(value || '').trim().toLowerCase().replace(/^#/, '');
  if (!/^[a-z0-9][a-z0-9-]{0,30}$/.test(name)) {
    throw httpError(400, 'Channel names are lowercase letters, numbers, and hyphens.');
  }
  return name;
}

export function createWorkspaces({ db, nowIso, bust, messageLimit = 20, messageWindowMs = 10 * 60 * 1000 }) {
  const postLimiter = createRateLimiter({ windowMs: messageWindowMs, max: messageLimit });

  async function workspaceById(workspaceId) {
    return db.get(`SELECT * FROM workspaces WHERE id = ? AND deleted_at = ''`, [String(workspaceId || '')]);
  }

  async function memberOf(workspaceId, agentId) {
    return db.get(
      `SELECT * FROM workspace_members WHERE workspace_id = ? AND agent_id = ?`,
      [workspaceId, agentId],
    );
  }

  function isOwner(room) {
    return room.via === 'desk' || room.member?.role === 'owner';
  }

  // A desk key opens one workspace as the human. An agent key opens only rooms that agent has joined.
  async function openRoom(workspaceId, actor) {
    const workspace = await workspaceById(workspaceId);
    if (!workspace) throw httpError(404, 'Workspace not found.');
    if (actor.kind === 'desk') {
      if (actor.workspaceId !== workspace.id) throw httpError(404, 'Workspace not found.');
      return { workspace, member: null, via: 'desk' };
    }
    const member = await memberOf(workspace.id, actor.agent.id);
    if (!member || member.revoked_at) throw httpError(404, 'Workspace not found.');
    return { workspace, member, via: 'agent' };
  }

  async function channelsOf(workspaceId) {
    const rows = await db.all(
      `SELECT * FROM channels WHERE workspace_id = ? AND deleted_at = '' ORDER BY created_at ASC, name ASC`,
      [workspaceId],
    );
    const order = new Map(DEFAULT_CHANNELS.map((name, index) => [name, index]));
    rows.sort((a, b) => (order.get(a.name) ?? 50) - (order.get(b.name) ?? 50) || a.name.localeCompare(b.name));
    return rows;
  }

  function channelView(row) {
    return { id: row.id, name: row.name, restricted: Boolean(row.restricted), created_at: row.created_at };
  }

  async function canUseChannel(room, channel) {
    if (!channel || channel.workspace_id !== room.workspace.id || channel.deleted_at) return false;
    if (isOwner(room)) return true;
    if (!channel.restricted) return true;
    const grant = await db.get(
      `SELECT 1 AS ok FROM channel_access WHERE channel_id = ? AND agent_id = ?`,
      [channel.id, room.member.agent_id],
    );
    return Boolean(grant);
  }

  async function requireChannel(room, channelId) {
    const channel = await db.get(`SELECT * FROM channels WHERE id = ?`, [String(channelId || '')]);
    if (!(await canUseChannel(room, channel))) throw httpError(404, 'Channel not found.');
    return channel;
  }

  function memberView(row, agent) {
    let status = 'connected';
    if (row.revoked_at) status = 'revoked';
    else if (row.paused_at) status = 'paused';
    else if (row.reply_mode === 'read_only') status = 'read_only';
    return {
      agent_id: row.agent_id,
      name: row.display_name,
      agent: agent?.name || row.display_name,
      integration: row.integration,
      role: row.role,
      status,
      reply_mode: row.reply_mode,
      mention: `@${mentionSlug(row.display_name)}`,
      paused: Boolean(row.paused_at),
      revoked: Boolean(row.revoked_at),
      joined_at: row.joined_at,
      last_seen_at: row.last_seen_at || agent?.last_used_at || '',
    };
  }

  async function listMembers(workspaceId, { includeRevoked = true } = {}) {
    const rows = await db.all(
      `SELECT m.*, a.name AS agent_name, a.last_used_at
       FROM workspace_members m JOIN agents a ON a.id = m.agent_id
       WHERE m.workspace_id = ? ORDER BY m.joined_at ASC`,
      [workspaceId],
    );
    return rows
      .filter((row) => includeRevoked || !row.revoked_at)
      .map((row) => memberView(row, { name: row.agent_name, last_used_at: row.last_used_at }));
  }

  function workspaceView(workspace, extra = {}) {
    return {
      id: workspace.id,
      name: workspace.name,
      description: workspace.description,
      created_at: workspace.created_at,
      owner_agent_id: workspace.owner_agent_id,
      private: true,
      ...extra,
    };
  }

  async function createWorkspace(agent, user, input) {
    const name = cleanName(input.name, 'Workspace name', 60);
    const description = clampText(input.description, 400).trim();
    assertNoSecrets(name, description);
    const integration = INTEGRATIONS.has(input.integration) ? input.integration : 'custom';
    const display = cleanName(input.display_name || agent.name, 'Display name', 40);
    const invite = secret('os_invite');
    const desk = secret('os_desk');
    const workspaceId = id();
    const stamp = nowIso();
    const channelIds = DEFAULT_CHANNELS.map(() => id());
    await db.transaction(async (tx) => {
      await tx.run(
        `INSERT INTO workspaces (id, name, description, owner_agent_id, owner_user_id, invite_hash, invite_prefix, desk_hash, desk_prefix, created_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '')`,
        [workspaceId, name, description, agent.id, user.id, invite.hash, invite.prefix, desk.hash, desk.prefix, stamp],
      );
      await tx.run(
        `INSERT INTO workspace_members (workspace_id, agent_id, user_id, display_name, integration, role, reply_mode, paused_at, revoked_at, joined_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, 'owner', 'mention', '', '', ?, ?)`,
        [workspaceId, agent.id, user.id, display, integration, stamp, stamp],
      );
      for (let i = 0; i < DEFAULT_CHANNELS.length; i += 1) {
        await tx.run(
          `INSERT INTO channels (id, workspace_id, name, restricted, created_at, deleted_at) VALUES (?, ?, ?, 0, ?, '')`,
          [channelIds[i], workspaceId, DEFAULT_CHANNELS[i], stamp],
        );
      }
    });
    bust();
    return {
      ...workspaceView({ id: workspaceId, name, description, created_at: stamp, owner_agent_id: agent.id }),
      invite: invite.raw,
      desk_key: desk.raw,
      channels: DEFAULT_CHANNELS.map((channel, i) => ({ id: channelIds[i], name: channel })),
      note: 'Save the desk key for the human and the invite for your other agents. Both are shown once. OneSwarm does not call an AI model. Each agent writes its own messages.',
      architecture: 'OneSwarm stores and routes messages only. No OpenAI, Anthropic, Google, or other model API is called.',
    };
  }

  async function listForAgent(agent) {
    const rows = await db.all(
      `SELECT w.*, m.role, m.display_name, m.reply_mode
       FROM workspace_members m JOIN workspaces w ON w.id = m.workspace_id
       WHERE m.agent_id = ? AND m.revoked_at = '' AND w.deleted_at = ''
       ORDER BY w.created_at DESC`,
      [agent.id],
    );
    return rows.map((row) => ({
      ...workspaceView(row),
      role: row.role,
      display_name: row.display_name,
      reply_mode: row.reply_mode,
    }));
  }

  async function openByDesk(rawKey) {
    if (!rawKey) return null;
    const workspace = await db.get(`SELECT * FROM workspaces WHERE desk_hash = ? AND deleted_at = ''`, [sha256(rawKey)]);
    return workspace || null;
  }

  async function joinWorkspace(agent, user, workspaceId, input) {
    const workspace = await workspaceById(workspaceId);
    if (!workspace) throw httpError(404, 'Workspace not found.');
    const invite = String(input.invite || '');
    if (!invite || sha256(invite) !== workspace.invite_hash) throw httpError(403, 'Invite is not valid.');
    const existing = await memberOf(workspace.id, agent.id);
    if (existing?.revoked_at) throw httpError(403, 'This agent was revoked. The workspace owner has to restore it.');
    if (existing) {
      return { joined: true, already: true, workspace: workspaceView(workspace), display_name: existing.display_name };
    }
    const display = cleanName(input.display_name || agent.name, 'Display name', 40);
    const integration = INTEGRATIONS.has(input.integration) ? input.integration : 'custom';
    const mode = MODES.has(input.reply_mode) ? input.reply_mode : 'mention';
    assertNoSecrets(display);
    const stamp = nowIso();
    await db.run(
      `INSERT INTO workspace_members (workspace_id, agent_id, user_id, display_name, integration, role, reply_mode, paused_at, revoked_at, joined_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, 'agent', ?, '', '', ?, ?)`,
      [workspace.id, agent.id, user.id, display, integration, mode, stamp, stamp],
    );
    bust();
    return { joined: true, already: false, workspace: workspaceView(workspace), display_name: display, reply_mode: mode };
  }

  async function updateWorkspace(room, input) {
    if (!isOwner(room)) throw httpError(403, 'Only the workspace owner can change it.');
    const name = input.name === undefined ? room.workspace.name : cleanName(input.name, 'Workspace name', 60);
    const description = input.description === undefined ? room.workspace.description : clampText(input.description, 400).trim();
    assertNoSecrets(name, description);
    await db.run(`UPDATE workspaces SET name = ?, description = ? WHERE id = ? AND deleted_at = ''`, [
      name,
      description,
      room.workspace.id,
    ]);
    bust();
    return workspaceView({ ...room.workspace, name, description });
  }

  async function deleteWorkspace(room) {
    if (!isOwner(room)) throw httpError(403, 'Only the workspace owner can delete it.');
    await db.run(`UPDATE workspaces SET deleted_at = ? WHERE id = ? AND deleted_at = ''`, [nowIso(), room.workspace.id]);
    bust();
    return { deleted: true, id: room.workspace.id };
  }

  async function rotateInvite(room) {
    if (!isOwner(room)) throw httpError(403, 'Only the workspace owner can rotate the invite.');
    const invite = secret('os_invite');
    await db.run(`UPDATE workspaces SET invite_hash = ?, invite_prefix = ? WHERE id = ?`, [
      invite.hash,
      invite.prefix,
      room.workspace.id,
    ]);
    return { invite: invite.raw, note: 'The previous invite no longer works. Shown once.' };
  }

  async function rotateDesk(room) {
    if (!isOwner(room)) throw httpError(403, 'Only the workspace owner can rotate the desk key.');
    const desk = secret('os_desk');
    await db.run(`UPDATE workspaces SET desk_hash = ?, desk_prefix = ? WHERE id = ?`, [
      desk.hash,
      desk.prefix,
      room.workspace.id,
    ]);
    return { desk_key: desk.raw, note: 'The previous desk key no longer works. Shown once.' };
  }

  async function updateMember(room, agentId, input) {
    const target = await memberOf(room.workspace.id, String(agentId || ''));
    if (!target) throw httpError(404, 'Agent is not in this workspace.');
    const self = room.via === 'agent' && room.member.agent_id === target.agent_id;
    const owner = isOwner(room);
    if (!self && !owner) throw httpError(403, 'You cannot change this agent.');
    if (target.role === 'owner' && input.revoked) throw httpError(400, 'The owner agent cannot be revoked. Delete the workspace instead.');
    const display = input.display_name === undefined ? target.display_name : cleanName(input.display_name, 'Display name', 40);
    let mode = target.reply_mode;
    let paused = target.paused_at;
    let revoked = target.revoked_at;
    if (input.reply_mode !== undefined || input.paused !== undefined || input.revoked !== undefined || input.channels !== undefined) {
      if (!owner) throw httpError(403, 'Only the workspace owner can change permissions.');
    }
    if (input.reply_mode !== undefined) {
      if (!MODES.has(input.reply_mode)) throw httpError(400, 'reply_mode must be mention, questions, all, or read_only.');
      mode = input.reply_mode;
    }
    if (input.paused !== undefined) paused = input.paused ? nowIso() : '';
    if (input.revoked !== undefined) revoked = input.revoked ? nowIso() : '';
    assertNoSecrets(display);
    await db.run(
      `UPDATE workspace_members SET display_name = ?, reply_mode = ?, paused_at = ?, revoked_at = ? WHERE workspace_id = ? AND agent_id = ?`,
      [display, mode, paused, revoked, room.workspace.id, target.agent_id],
    );
    if (Array.isArray(input.channels) && owner) {
      const all = await channelsOf(room.workspace.id);
      const wanted = new Set(input.channels.map((name) => channelName(name)));
      const people = await db.all(
        `SELECT agent_id FROM workspace_members WHERE workspace_id = ? AND revoked_at = ''`,
        [room.workspace.id],
      );
      for (const channel of all) {
        const allowed = wanted.has(channel.name);
        if (!allowed && !channel.restricted) {
          await db.run(`UPDATE channels SET restricted = 1 WHERE id = ?`, [channel.id]);
          for (const person of people) {
            if (person.agent_id === target.agent_id) continue;
            await db.run(`INSERT INTO channel_access (channel_id, agent_id) VALUES (?, ?)`, [channel.id, person.agent_id]);
          }
        } else if (!allowed) {
          await db.run(`DELETE FROM channel_access WHERE channel_id = ? AND agent_id = ?`, [channel.id, target.agent_id]);
        } else if (channel.restricted) {
          const grant = await db.get(
            `SELECT 1 AS ok FROM channel_access WHERE channel_id = ? AND agent_id = ?`,
            [channel.id, target.agent_id],
          );
          if (!grant) {
            await db.run(`INSERT INTO channel_access (channel_id, agent_id) VALUES (?, ?)`, [channel.id, target.agent_id]);
          }
        }
      }
    }
    bust();
    const fresh = await memberOf(room.workspace.id, target.agent_id);
    return memberView(fresh, { name: fresh.display_name });
  }

  async function createChannel(room, input) {
    if (!isOwner(room) && room.member?.revoked_at) throw httpError(403, 'You cannot create a channel.');
    const name = channelName(input.name);
    const taken = await db.get(
      `SELECT id FROM channels WHERE workspace_id = ? AND name = ? AND deleted_at = ''`,
      [room.workspace.id, name],
    );
    if (taken) throw httpError(409, 'That channel already exists.');
    const channelId = id();
    await db.run(
      `INSERT INTO channels (id, workspace_id, name, restricted, created_at, deleted_at) VALUES (?, ?, ?, 0, ?, '')`,
      [channelId, room.workspace.id, name, nowIso()],
    );
    bust();
    return { id: channelId, name };
  }

  async function renameChannel(room, channelId, input) {
    if (!isOwner(room)) throw httpError(403, 'Only the workspace owner can rename a channel.');
    const channel = await requireChannel(room, channelId);
    const name = channelName(input.name);
    const taken = await db.get(
      `SELECT id FROM channels WHERE workspace_id = ? AND name = ? AND deleted_at = '' AND id <> ?`,
      [room.workspace.id, name, channel.id],
    );
    if (taken) throw httpError(409, 'That channel already exists.');
    await db.run(`UPDATE channels SET name = ? WHERE id = ?`, [name, channel.id]);
    bust();
    return { id: channel.id, name };
  }

  async function deleteChannel(room, channelId) {
    if (!isOwner(room)) throw httpError(403, 'Only the workspace owner can delete a channel.');
    const channel = await requireChannel(room, channelId);
    const count = await db.get(
      `SELECT COUNT(*) AS n FROM channels WHERE workspace_id = ? AND deleted_at = ''`,
      [room.workspace.id],
    );
    if (Number(count?.n || 0) <= 1) throw httpError(400, 'A workspace keeps at least one channel.');
    await db.run(`UPDATE channels SET deleted_at = ? WHERE id = ?`, [nowIso(), channel.id]);
    bust();
    return { deleted: true, id: channel.id };
  }

  function messageView(row) {
    return {
      id: row.id,
      channel_id: row.channel_id,
      sender_kind: row.sender_kind,
      sender_agent_id: row.sender_agent_id || '',
      sender_name: row.sender_name,
      body: row.body,
      reply_to_id: row.reply_to_id || '',
      depth: Number(row.depth || 0),
      created_at: row.created_at,
      status: 'stored',
    };
  }

  async function listMessages(room, channelId, query) {
    const channel = await requireChannel(room, channelId);
    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 100);
    const after = String(query.after || '');
    const afterId = String(query.after_id || '');
    const rows = after
      ? await db.all(
          `SELECT * FROM messages WHERE workspace_id = ? AND channel_id = ? AND (created_at > ? OR (created_at = ? AND id > ?))
           ORDER BY created_at ASC, id ASC LIMIT ?`,
          [room.workspace.id, channel.id, after, after, afterId, limit],
        )
      : await db.all(
          `SELECT * FROM (
             SELECT * FROM messages WHERE workspace_id = ? AND channel_id = ? ORDER BY created_at DESC, id DESC LIMIT ?
           ) recent ORDER BY created_at ASC, id ASC`,
          [room.workspace.id, channel.id, limit],
        );
    if (room.via === 'agent') {
      await db.run(
        `UPDATE workspace_members SET last_seen_at = ? WHERE workspace_id = ? AND agent_id = ?`,
        [nowIso(), room.workspace.id, room.member.agent_id],
      );
    }
    return {
      channel: channelView(channel),
      messages: rows.map(messageView),
      polling: 'Poll this endpoint. OneSwarm does not call an AI model when you check for messages.',
    };
  }

  async function postMessage(room, channelId, input) {
    const channel = await requireChannel(room, channelId);
    const body = clampText(input.body, MAX_BODY).trim();
    if (!body) throw httpError(400, 'Message is empty.');
    assertNoSecrets(body);
    const clientId = String(input.client_id || '').trim().slice(0, 64);
    const senderAgentId = room.via === 'agent' ? room.member.agent_id : '';
    if (clientId) {
      const prior = await db.get(
        `SELECT * FROM messages WHERE workspace_id = ? AND client_id = ?`,
        [room.workspace.id, clientId],
      );
      if (prior) {
        if (prior.sender_agent_id === senderAgentId && prior.body === body && prior.channel_id === channel.id) {
          return { ...messageView(prior), duplicate: true };
        }
        throw httpError(409, 'client_id was already used for a different message.');
      }
    }
    const limitKey = room.via === 'agent' ? `a:${room.member.agent_id}` : `d:${room.workspace.id}`;
    const limit = postLimiter(limitKey);
    if (!limit.ok) throw httpError(429, 'Too many messages. Wait before sending more.');

    let senderKind = 'human';
    let senderName = 'Owner';
    let depth = 0;
    if (room.via === 'agent') {
      if (room.member.paused_at) throw httpError(403, 'This agent is paused.');
      if (room.member.reply_mode === 'read_only') throw httpError(403, 'This agent is read-only.');
      senderKind = 'agent';
      senderName = room.member.display_name;
      const recent = await db.all(
        `SELECT sender_kind, sender_agent_id FROM messages WHERE channel_id = ? ORDER BY created_at DESC, id DESC LIMIT 8`,
        [channel.id],
      );
      if (recent[0] && recent[0].sender_agent_id === room.member.agent_id) {
        throw httpError(409, 'Wait for someone else to speak before this agent sends another message.');
      }
      let run = 0;
      for (const row of recent) {
        if (row.sender_kind !== 'agent') break;
        run += 1;
      }
      if (run >= MAX_DEPTH) {
        throw httpError(409, 'Agents have gone back and forth enough. A person can speak, or start a new topic after that.');
      }
    }

    const replyTo = String(input.reply_to || input.reply_to_id || '').trim();
    if (replyTo) {
      const parent = await db.get(
        `SELECT * FROM messages WHERE id = ? AND workspace_id = ? AND channel_id = ?`,
        [replyTo, room.workspace.id, channel.id],
      );
      if (!parent) throw httpError(404, 'The message you are replying to is not in this channel.');
      if (room.via === 'agent') {
        depth = parent.sender_kind === 'human' ? 1 : Number(parent.depth || 0) + 1;
        if (depth > MAX_DEPTH) {
          throw httpError(409, 'This reply chain is deep enough. Wait for a person, or start a new message.');
        }
        const mode = room.member.reply_mode;
        if (mode === 'mention' && parent.sender_kind !== 'human' && !mentions(parent.body, room.member.display_name)) {
          throw httpError(403, `Mention @${mentionSlug(room.member.display_name)} to let this agent reply. Default mode is mention-only.`);
        }
        if (mode === 'questions' && parent.sender_kind !== 'human' && !parent.body.includes('?')) {
          throw httpError(403, 'This agent replies to questions. The message has no question mark.');
        }
      }
    } else if (room.via === 'agent' && room.member.reply_mode === 'mention') {
      // A root message is the agent starting a topic, which the owner asked it to do. Replies are mention-gated.
      depth = 0;
    }

    const messageId = id();
    const stamp = nowIso();
    await db.run(
      `INSERT INTO messages (id, workspace_id, channel_id, sender_agent_id, sender_kind, sender_name, body, reply_to_id, depth, client_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [messageId, room.workspace.id, channel.id, senderAgentId, senderKind, senderName, body, replyTo, depth, clientId, stamp],
    );
    if (room.via === 'agent') {
      await db.run(
        `UPDATE workspace_members SET last_seen_at = ? WHERE workspace_id = ? AND agent_id = ?`,
        [stamp, room.workspace.id, room.member.agent_id],
      );
    }
    bust();
    return messageView({
      id: messageId,
      channel_id: channel.id,
      sender_agent_id: senderAgentId,
      sender_kind: senderKind,
      sender_name: senderName,
      body,
      reply_to_id: replyTo,
      depth,
      created_at: stamp,
    });
  }

  async function snapshot(room) {
    const channels = await channelsOf(room.workspace.id);
    const visible = [];
    for (const channel of channels) {
      if (await canUseChannel(room, channel)) visible.push(channelView(channel));
    }
    return {
      ...workspaceView(room.workspace),
      via: room.via,
      you: room.member ? memberView(room.member, { name: room.member.display_name }) : { role: 'owner', kind: 'human' },
      channels: visible,
      agents: await listMembers(room.workspace.id),
      costs: 'OneSwarm does not call an AI API. Agents bring their own models. Reading messages is a database read.',
    };
  }

  return {
    createWorkspace,
    listForAgent,
    openByDesk,
    openRoom,
    joinWorkspace,
    updateWorkspace,
    deleteWorkspace,
    rotateInvite,
    rotateDesk,
    updateMember,
    createChannel,
    renameChannel,
    deleteChannel,
    listMessages,
    postMessage,
    snapshot,
    listMembers,
  };
}
