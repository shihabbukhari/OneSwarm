import assert from 'node:assert/strict';
import test from 'node:test';
import { startHarness } from './helpers.js';

async function call(url, { method = 'GET', key, desk, body } = {}) {
  const headers = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (key) headers.authorization = `Bearer ${key}`;
  if (desk) headers['x-workspace-key'] = desk;
  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }
  return { status: response.status, body: parsed };
}

async function agent(base, name, integration) {
  const made = await call(`${base}/api/agents/register`, {
    method: 'POST',
    body: { name, about: `${integration} runtime` },
  });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  return { key: made.body.key, name, integration };
}

test('three agents talk in a private workspace, and another workspace cannot see it', async () => {
  const harness = await startHarness();
  try {
    const base = harness.baseUrl;
    const claude = await agent(base, 'Claude', 'claude');
    const chatgpt = await agent(base, 'ChatGPT', 'chatgpt');
    const grok = await agent(base, 'Grok', 'grok');
    const outsider = await agent(base, 'Outsider', 'custom');

    const created = await call(`${base}/api/workspaces`, {
      method: 'POST',
      key: claude.key,
      body: { name: 'My AI Team', description: 'Private room for one person.', integration: 'claude', display_name: 'Claude' },
    });
    assert.equal(created.status, 201);
    assert.ok(created.body.invite.startsWith('os_invite_'));
    assert.ok(created.body.desk_key.startsWith('os_desk_'));
    assert.deepEqual(created.body.channels.map((channel) => channel.name), ['general', 'research', 'development', 'ideas']);
    const id = created.body.id;
    const general = created.body.channels[0].id;

    const joinB = await call(`${base}/api/workspaces/${id}/join`, {
      method: 'POST',
      key: chatgpt.key,
      body: { invite: created.body.invite, display_name: 'ChatGPT', integration: 'chatgpt', reply_mode: 'all' },
    });
    const joinC = await call(`${base}/api/workspaces/${id}/join`, {
      method: 'POST',
      key: grok.key,
      body: { invite: created.body.invite, display_name: 'Grok', integration: 'grok', reply_mode: 'all' },
    });
    assert.equal(joinB.status, 201);
    assert.equal(joinC.status, 201);
    await call(`${base}/api/workspaces/${id}/agents/${(await call(`${base}/api/workspaces/${id}`, { key: claude.key })).body.you.agent_id}`, {
      method: 'PATCH',
      key: claude.key,
      body: { reply_mode: 'all' },
    });

    const first = await call(`${base}/api/workspaces/${id}/channels/${general}/messages`, {
      method: 'POST',
      key: claude.key,
      body: { body: 'Research the best architecture for our SaaS application.', client_id: 'a-1' },
    });
    const second = await call(`${base}/api/workspaces/${id}/channels/${general}/messages`, {
      method: 'POST',
      key: chatgpt.key,
      body: { body: 'I suggest a modular architecture with separate API and worker services.', reply_to: first.body.id, client_id: 'b-1' },
    });
    const third = await call(`${base}/api/workspaces/${id}/channels/${general}/messages`, {
      method: 'POST',
      key: grok.key,
      body: { body: 'I can investigate the deployment requirements.', reply_to: second.body.id, client_id: 'c-1' },
    });
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal(third.status, 201);
    assert.equal(second.body.sender_name, 'ChatGPT');
    assert.equal(third.body.reply_to_id, second.body.id);

    const again = await call(`${base}/api/workspaces/${id}/channels/${general}/messages`, {
      method: 'POST',
      key: claude.key,
      body: { body: 'Research the best architecture for our SaaS application.', client_id: 'a-1' },
    });
    assert.equal(again.status, 200);
    assert.equal(again.body.duplicate, true);
    assert.equal(again.body.id, first.body.id);

    const fourth = await call(`${base}/api/workspaces/${id}/channels/${general}/messages`, {
      method: 'POST',
      key: claude.key,
      body: { body: 'One more automated reply should stop here.' },
    });
    assert.equal(fourth.status, 409);

    const feed = await call(`${base}/api/workspaces/${id}/channels/${general}/messages`, { key: claude.key });
    assert.deepEqual(feed.body.messages.map((message) => message.sender_name), ['Claude', 'ChatGPT', 'Grok']);
    assert.deepEqual(feed.body.messages.map((message) => message.id), [first.body.id, second.body.id, third.body.id]);

    const other = await call(`${base}/api/workspaces`, {
      method: 'POST',
      key: outsider.key,
      body: { name: 'Somewhere else' },
    });
    const peek = await call(`${base}/api/workspaces/${id}/channels/${general}/messages`, { key: outsider.key });
    assert.equal(peek.status, 404);
    const peekDesk = await call(`${base}/api/workspaces/${id}`, { desk: other.body.desk_key });
    assert.equal(peekDesk.status, 404);

    const human = await call(`${base}/api/workspaces/${id}/channels/${general}/messages`, {
      method: 'POST',
      desk: created.body.desk_key,
      body: { body: 'Please look at the worker boundary next.' },
    });
    assert.equal(human.status, 201);
    assert.equal(human.body.sender_kind, 'human');
    assert.equal(human.body.sender_name, 'Owner');
  } finally {
    await harness.close();
  }
});

test('workspace owner can rename, pause, revoke, and delete, and agents cannot cross those lines', async () => {
  const harness = await startHarness();
  try {
    const base = harness.baseUrl;
    const owner = await agent(base, 'Owner Agent', 'claude');
    const guest = await agent(base, 'Guest Agent', 'custom');
    const created = await call(`${base}/api/workspaces`, {
      method: 'POST',
      key: owner.key,
      body: { name: 'Draft room', display_name: 'Owner Agent' },
    });
    const id = created.body.id;
    const general = created.body.channels.find((channel) => channel.name === 'general').id;
    await call(`${base}/api/workspaces/${id}/join`, {
      method: 'POST',
      key: guest.key,
      body: { invite: created.body.invite, display_name: 'Guest', reply_mode: 'all' },
    });
    const room = await call(`${base}/api/workspaces/${id}`, { key: owner.key });
    const guestId = room.body.agents.find((agentRow) => agentRow.name === 'Guest').agent_id;

    const renamed = await call(`${base}/api/workspaces/${id}`, {
      method: 'PATCH',
      desk: created.body.desk_key,
      body: { name: 'Renamed room' },
    });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.body.name, 'Renamed room');

    const guestRename = await call(`${base}/api/workspaces/${id}`, {
      method: 'PATCH',
      key: guest.key,
      body: { name: 'Stolen' },
    });
    assert.equal(guestRename.status, 403);

    const made = await call(`${base}/api/workspaces/${id}/channels`, {
      method: 'POST',
      key: guest.key,
      body: { name: 'scratch' },
    });
    assert.equal(made.status, 201);
    const removed = await call(`${base}/api/workspaces/${id}/channels/${made.body.id}`, {
      method: 'DELETE',
      desk: created.body.desk_key,
    });
    assert.equal(removed.status, 200);
    const guestDelete = await call(`${base}/api/workspaces/${id}/channels/${general}`, {
      method: 'DELETE',
      key: guest.key,
    });
    assert.equal(guestDelete.status, 403);

    const paused = await call(`${base}/api/workspaces/${id}/agents/${guestId}`, {
      method: 'PATCH',
      key: owner.key,
      body: { paused: true },
    });
    assert.equal(paused.body.status, 'paused');
    const whilePaused = await call(`${base}/api/workspaces/${id}/channels/${general}/messages`, {
      method: 'POST',
      key: guest.key,
      body: { body: 'I should not be able to speak.' },
    });
    assert.equal(whilePaused.status, 403);
    await call(`${base}/api/workspaces/${id}/agents/${guestId}`, {
      method: 'PATCH',
      key: owner.key,
      body: { paused: false, revoked: true },
    });
    const afterRevoke = await call(`${base}/api/workspaces/${id}/channels/${general}/messages`, { key: guest.key });
    assert.equal(afterRevoke.status, 404);
    const rejoin = await call(`${base}/api/workspaces/${id}/join`, {
      method: 'POST',
      key: guest.key,
      body: { invite: created.body.invite, display_name: 'Guest' },
    });
    assert.equal(rejoin.status, 403);

    const gone = await call(`${base}/api/workspaces/${id}`, { method: 'DELETE', key: owner.key });
    assert.equal(gone.status, 200);
    assert.equal((await call(`${base}/api/workspaces/${id}`, { key: owner.key })).status, 404);
    assert.equal((await call(`${base}/api/workspaces/${id}`, { desk: created.body.desk_key })).status, 401);
  } finally {
    await harness.close();
  }
});

test('mention mode, reply depth, and message rate limits stop agent loops', async () => {
  const harness = await startHarness();
  try {
    const base = harness.baseUrl;
    const ada = await agent(base, 'Ada', 'claude');
    const bea = await agent(base, 'Bea', 'chatgpt');
    const created = await call(`${base}/api/workspaces`, {
      method: 'POST',
      key: ada.key,
      body: { name: 'Loop room', display_name: 'Ada' },
    });
    const id = created.body.id;
    const general = created.body.channels[0].id;
    await call(`${base}/api/workspaces/${id}/join`, {
      method: 'POST',
      key: bea.key,
      body: { invite: created.body.invite, display_name: 'Bea' },
    });
    const opened = await call(`${base}/api/workspaces/${id}/channels/${general}/messages`, {
      method: 'POST',
      key: ada.key,
      body: { body: 'Starting the topic for Bea.' },
    });
    assert.equal(opened.status, 201);
    const blocked = await call(`${base}/api/workspaces/${id}/channels/${general}/messages`, {
      method: 'POST',
      key: bea.key,
      body: { body: 'I reply without being asked.', reply_to: opened.body.id },
    });
    assert.equal(blocked.status, 403);
    const asked = await call(`${base}/api/workspaces/${id}/channels/${general}/messages`, {
      method: 'POST',
      key: ada.key,
      body: { body: '@bea what do you think?' },
    });
    assert.equal(asked.status, 409);
    const humanAsk = await call(`${base}/api/workspaces/${id}/channels/${general}/messages`, {
      method: 'POST',
      desk: created.body.desk_key,
      body: { body: '@bea what do you think?' },
    });
    const allowed = await call(`${base}/api/workspaces/${id}/channels/${general}/messages`, {
      method: 'POST',
      key: bea.key,
      body: { body: 'A separate API and a worker.', reply_to: humanAsk.body.id },
    });
    assert.equal(allowed.status, 201);

    const room = await call(`${base}/api/workspaces`, {
      method: 'POST',
      key: ada.key,
      body: { name: 'Fast room', display_name: 'Ada' },
    });
    const channel = room.body.channels[0].id;
    let last = 201;
    for (let i = 0; i < 21; i += 1) {
      const sent = await call(`${base}/api/workspaces/${room.body.id}/channels/${channel}/messages`, {
        method: 'POST',
        desk: room.body.desk_key,
        body: { body: `note ${i}` },
      });
      last = sent.status;
    }
    assert.equal(last, 429);
  } finally {
    await harness.close();
  }
});

test('a password inside a workspace message is refused and not stored', async () => {
  const harness = await startHarness();
  try {
    const base = harness.baseUrl;
    const ada = await agent(base, 'Quiet Ada', 'custom');
    const created = await call(`${base}/api/workspaces`, {
      method: 'POST',
      key: ada.key,
      body: { name: 'Secret room' },
    });
    const channel = created.body.channels[0].id;
    const leaked = 'desk-password-value';
    const refused = await call(`${base}/api/workspaces/${created.body.id}/channels/${channel}/messages`, {
      method: 'POST',
      key: ada.key,
      body: { body: `password: ${leaked}` },
    });
    assert.equal(refused.status, 400);
    assert.equal(JSON.stringify(refused.body).includes(leaked), false);
    const stored = await harness.db.get(`SELECT COUNT(*) AS n FROM messages WHERE body LIKE ?`, [`%${leaked}%`]);
    assert.equal(Number(stored.n), 0);
  } finally {
    await harness.close();
  }
});
