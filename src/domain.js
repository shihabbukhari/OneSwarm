import crypto from 'node:crypto';
import { REWARD_NOTICE, TIP_FIELDS } from './constants.js';
import { countryByCode, COUNTRIES } from './countries.js';
import { reviewDiff } from './merge-rules.js';
import { parseRepoUrl, validateMissionYaml } from './mission-spec.js';
import { clampText, httpError, id, isUniqueError, sha256, verifyWebhook } from './util.js';

function percent(passed, total) {
  const done = Number(passed) || 0;
  const all = Number(total) || 0;
  if (!all) return 0;
  return Math.round((done / all) * 1000) / 10;
}

function rewardView(mission) {
  if (!mission.reward_amount) return null;
  return {
    amount: mission.reward_amount,
    currency: mission.reward_currency,
    rules: mission.reward_rules,
    received: Boolean(mission.reward_received_at),
    notice: REWARD_NOTICE,
  };
}

function card(mission) {
  const total = Number(mission.piece_total ?? mission.pieces_total ?? 0);
  const passed = Number(mission.piece_passed ?? mission.pieces_passed ?? 0);
  return {
    number: Number(mission.public_number) || 0,
    id: mission.id,
    title: mission.title,
    summary: mission.summary,
    kind: mission.kind,
    license: mission.license,
    status: mission.status,
    pieces_total: total,
    pieces_passed: passed,
    percent_done: mission.kind === 'team' ? percent(passed, total) : 0,
    poster: mission.poster_login || '',
    poster_display: mission.poster_display || mission.poster_login || '',
    reward: rewardView(mission),
    deadline: mission.deadline || '',
    winner: mission.winner_login || '',
  };
}

export function createDomain({ db, github, config, clock }) {
  const now = () => (clock ? clock() : new Date());
  const nowIso = () => now().toISOString();
  let liveCache = null;

  function bust() {
    liveCache = null;
  }

  async function addEvent(runner, event) {
    await runner.run(
      `INSERT INTO events (id, mission_id, user_id, agent_id, country_code, kind, message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id(),
        event.missionId || '',
        event.userId || '',
        event.agentId || '',
        event.country || '',
        event.kind,
        clampText(event.message, 400),
        nowIso(),
      ],
    );
  }

  async function releaseExpired() {
    const stamp = nowIso();
    await db.run(
      `UPDATE pieces SET status = 'open', claim_user_id = '', claim_agent_id = '', claim_expires_at = ''
       WHERE status = 'claimed' AND claim_expires_at <> '' AND claim_expires_at < ?`,
      [stamp],
    );
    await db.run(
      `UPDATE pieces SET status = 'open', claim_user_id = '', claim_agent_id = '', claim_expires_at = '', submit_expires_at = ''
       WHERE status = 'submitted' AND submit_expires_at <> '' AND submit_expires_at < ?`,
      [stamp],
    );
  }

  async function userById(userId) {
    return db.get('SELECT * FROM users WHERE id = ?', [userId]);
  }

  async function userByLogin(login) {
    return db.get('SELECT * FROM users WHERE login_lower = ?', [String(login || '').toLowerCase()]);
  }

  async function agentByToken(token) {
    if (!token) return null;
    return db.get('SELECT * FROM agents WHERE token_hash = ?', [sha256(token)]);
  }

  async function touchAgent(agentId) {
    await db.run('UPDATE agents SET last_used_at = ? WHERE id = ?', [nowIso(), agentId]);
  }

  async function sessionById(sessionId) {
    const session = await db.get('SELECT * FROM sessions WHERE id = ?', [sessionId]);
    if (!session) return null;
    if (session.expires_at < nowIso()) {
      await db.run('DELETE FROM sessions WHERE id = ?', [sessionId]);
      return null;
    }
    return session;
  }

  async function createSession(user) {
    const session = {
      id: crypto.randomBytes(32).toString('hex'),
      csrf: crypto.randomBytes(24).toString('hex'),
      expires: new Date(now().getTime() + config.sessionTtlSeconds * 1000).toISOString(),
    };
    await db.run(
      `INSERT INTO sessions (id, user_id, csrf_token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`,
      [session.id, user.id, session.csrf, session.expires, nowIso()],
    );
    return session;
  }

  async function destroySession(sessionId) {
    if (sessionId) await db.run('DELETE FROM sessions WHERE id = ?', [sessionId]);
  }

  async function upsertGitHubUser(profile) {
    const login = String(profile.login || '').trim();
    const loginLower = login.toLowerCase();
    if (!loginLower) throw httpError(401, 'GitHub did not return a username.');
    const existing = await db.get('SELECT * FROM users WHERE github_id = ? OR login_lower = ?', [
      String(profile.id),
      loginLower,
    ]);
    if (existing?.banned_at) throw httpError(403, 'This account is banned.');
    const role = config.adminLogins.includes(loginLower) ? 'admin' : 'user';
    if (!existing) {
      const user = {
        id: id(),
        github_id: String(profile.id),
        login,
        login_lower: loginLower,
        display_name: clampText(profile.name || login, 40),
        avatar_url: clampText(profile.avatar || '', 500),
        role,
        created_at: nowIso(),
      };
      await db.run(
        `INSERT INTO users (id, github_id, login, login_lower, display_name, avatar_url, role, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [user.id, user.github_id, user.login, user.login_lower, user.display_name, user.avatar_url, user.role, user.created_at],
      );
      return userById(user.id);
    }
    const display =
      existing.display_name === existing.login ? clampText(profile.name || login, 40) : existing.display_name;
    await db.run(
      `UPDATE users SET login = ?, login_lower = ?, display_name = ?, avatar_url = ?, role = ?, github_id = ? WHERE id = ?`,
      [login, loginLower, display, clampText(profile.avatar || '', 500), role, String(profile.id), existing.id],
    );
    return userById(existing.id);
  }

  async function createDemoUser({ login, displayName, countryCode = '', role = 'user', githubId }) {
    if (!config.demoMode) throw httpError(404, 'Not found.');
    const loginLower = String(login || '').toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(loginLower)) throw httpError(400, 'Invalid demo login.');
    const existing = await userByLogin(loginLower);
    if (existing) return existing;
    const userId = id();
    await db.run(
      `INSERT INTO users (id, github_id, login, login_lower, display_name, country_code, role, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        githubId || `demo-${userId}`,
        loginLower,
        loginLower,
        clampText(displayName || loginLower, 40),
        countryByCode(countryCode) ? countryCode.toUpperCase() : '',
        role === 'admin' ? 'admin' : 'user',
        nowIso(),
      ],
    );
    return userById(userId);
  }

  function cleanTip(field, value) {
    const text = String(value ?? '').trim();
    if (!text) return '';
    let url;
    try {
      url = new URL(text);
    } catch {
      throw httpError(400, 'Tip links must be https URLs.');
    }
    if (url.protocol !== 'https:') throw httpError(400, 'Tip links must be https URLs.');
    const rule = TIP_FIELDS.find((item) => item.key === field);
    if (!rule || !rule.hosts.includes(url.hostname.toLowerCase())) {
      throw httpError(400, 'Tip links must be Patreon, GitHub Sponsors, Ko-fi, or Buy Me a Coffee.');
    }
    if (rule.sponsors && !url.pathname.startsWith('/sponsors')) {
      throw httpError(400, 'GitHub tip links must be GitHub Sponsors URLs.');
    }
    return url.toString().slice(0, 300);
  }

  async function updateProfile(user, input) {
    const next = {
      display_name: user.display_name,
      country_code: user.country_code,
      tip_patreon: user.tip_patreon,
      tip_github: user.tip_github,
      tip_kofi: user.tip_kofi,
      tip_bmc: user.tip_bmc,
    };
    if (input.display_name !== undefined) {
      const name = String(input.display_name).trim();
      if (name.length < 1 || name.length > 40 || /[\u0000-\u001f]/.test(name)) {
        throw httpError(400, 'Display name must be 1–40 characters.');
      }
      next.display_name = name;
    }
    if (input.country_code !== undefined) {
      const code = String(input.country_code || '').trim().toUpperCase();
      if (code && !countryByCode(code)) throw httpError(400, 'Choose a country from the list.');
      next.country_code = code;
    }
    for (const field of TIP_FIELDS) {
      if (input[field.key] !== undefined) next[field.key] = cleanTip(field.key, input[field.key]);
    }
    await db.run(
      `UPDATE users SET display_name = ?, country_code = ?, tip_patreon = ?, tip_github = ?, tip_kofi = ?, tip_bmc = ? WHERE id = ?`,
      [next.display_name, next.country_code, next.tip_patreon, next.tip_github, next.tip_kofi, next.tip_bmc, user.id],
    );
    bust();
    return userById(user.id);
  }

  async function createAgentToken(user, nameInput) {
    const name = String(nameInput || '').trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,39}$/.test(name)) {
      throw httpError(400, 'Agent name must be 1–40 letters, numbers, spaces, dots, or hyphens.');
    }
    const count = await db.get(
      `SELECT COUNT(*) AS n FROM agents WHERE user_id = ? AND revoked_at = ''`,
      [user.id],
    );
    if (Number(count?.n || 0) >= 10) throw httpError(400, 'You can have at most 10 agents.');
    const raw = `os_live_${crypto.randomBytes(32).toString('base64url')}`;
    const agentId = id();
    await db.run(
      `INSERT INTO agents (id, user_id, name, token_hash, token_prefix, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [agentId, user.id, name, sha256(raw), `${raw.slice(0, 12)}…`, nowIso()],
    );
    bust();
    return { token: raw, agent: { id: agentId, name, prefix: `${raw.slice(0, 12)}…` } };
  }

  async function revokeAgentToken(user, agentId) {
    const result = await db.run(
      `UPDATE agents SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at = ''`,
      [nowIso(), agentId, user.id],
    );
    if (!result.changes) throw httpError(404, 'Agent not found.');
    bust();
  }

  async function listAgents(userId, { publicView = false } = {}) {
    const rows = await db.all(
      `SELECT id, name, token_prefix, created_at, last_used_at FROM agents
       WHERE user_id = ? AND revoked_at = '' ORDER BY created_at ASC`,
      [userId],
    );
    return rows.map((row) =>
      publicView
        ? { name: row.name, prefix: row.token_prefix, created_at: row.created_at }
        : {
            id: row.id,
            name: row.name,
            prefix: row.token_prefix,
            created_at: row.created_at,
            last_used_at: row.last_used_at,
          },
    );
  }

  function meView(user, agents, csrf) {
    return {
      login: user.login,
      display_name: user.display_name,
      country_code: user.country_code,
      role: user.role,
      tips: {
        patreon: user.tip_patreon,
        github: user.tip_github,
        kofi: user.tip_kofi,
        bmc: user.tip_bmc,
      },
      csrf_token: csrf || '',
      agents,
    };
  }

  async function missionRows(whereSql, params) {
    return db.all(
      `SELECT m.*, u.login AS poster_login, u.display_name AS poster_display, w.login AS winner_login,
        (SELECT COUNT(*) FROM pieces p WHERE p.mission_id = m.id) AS piece_total,
        (SELECT COUNT(*) FROM pieces p WHERE p.mission_id = m.id AND p.status = 'passed') AS piece_passed
       FROM missions m
       JOIN users u ON u.id = m.poster_user_id
       LEFT JOIN users w ON w.id = m.winner_user_id
       ${whereSql}
       ORDER BY m.public_number ASC, m.created_at ASC`,
      params,
    );
  }

  async function findMission(ref) {
    if (/^\d+$/.test(String(ref))) {
      const number = Number(ref);
      if (!number) return null;
      const rows = await missionRows('WHERE m.public_number = ?', [number]);
      return rows[0] || null;
    }
    if (!/^[a-f0-9]{32}$/.test(String(ref))) return null;
    const rows = await missionRows('WHERE m.id = ?', [ref]);
    return rows[0] || null;
  }

  function canSee(mission, user) {
    if (!mission) return false;
    if (mission.status === 'public') return true;
    if (!user) return false;
    if (user.role === 'admin') return true;
    return mission.status === 'pending' && mission.poster_user_id === user.id;
  }

  async function piecesOf(missionId) {
    const rows = await db.all(
      `SELECT p.*, cu.login AS claimed_login, pu.login AS passed_login
       FROM pieces p
       LEFT JOIN users cu ON cu.id = p.claim_user_id
       LEFT JOIN users pu ON pu.id = p.passed_by_user_id
       WHERE p.mission_id = ?
       ORDER BY p.piece_key ASC`,
      [missionId],
    );
    return rows.map((row) => ({
      key: row.piece_key,
      title: row.title,
      description: row.description,
      status: row.status,
      paths: JSON.parse(row.paths_json),
      claimed_by: row.status === 'claimed' || row.status === 'submitted' ? row.claimed_login || '' : '',
      passed_by: row.status === 'passed' ? row.passed_login || '' : '',
    }));
  }

  async function scoresOf(mission) {
    const rows = await db.all(
      `SELECT s.score, s.pr_url, u.login, s.created_at FROM submissions s
       JOIN users u ON u.id = s.user_id
       WHERE s.mission_id = ? AND s.status = 'scored' AND s.score <> ''`,
      [mission.id],
    );
    const higher = mission.score_order !== 'lower';
    rows.sort((a, b) => {
      const delta = Number(a.score) - Number(b.score);
      if (delta) return higher ? -delta : delta;
      return a.created_at < b.created_at ? -1 : 1;
    });
    return rows.slice(0, 20).map((row) => ({ login: row.login, score: row.score, pr_url: row.pr_url }));
  }

  async function settleChallenge(mission) {
    if (mission.kind !== 'challenge' || !mission.deadline || mission.reward_received_at) return mission;
    if (mission.deadline > nowIso()) return mission;
    const scores = await scoresOf(mission);
    if (!scores.length) return mission;
    const winner = await userByLogin(scores[0].login);
    if (!winner || winner.id === mission.winner_user_id) return mission;
    await db.run(`UPDATE missions SET winner_user_id = ? WHERE id = ? AND reward_received_at = ''`, [
      winner.id,
      mission.id,
    ]);
    bust();
    return findMission(mission.public_number || mission.id);
  }

  async function keptFor(userId) {
    const row = await db.get(
      `SELECT
         SUM(CASE WHEN reward_amount <> '' THEN 1 ELSE 0 END) AS promised,
         SUM(CASE WHEN reward_amount <> '' AND reward_received_at <> '' THEN 1 ELSE 0 END) AS kept
       FROM missions WHERE poster_user_id = ?`,
      [userId],
    );
    return { promised: Number(row?.promised || 0), kept: Number(row?.kept || 0) };
  }

  async function missionDetail(mission, user) {
    if (!canSee(mission, user)) throw httpError(404, 'Mission not found.');
    const settled = mission.kind === 'challenge' ? await settleChallenge(mission) : mission;
    const pieces = settled.kind === 'team' ? await piecesOf(settled.id) : [];
    const scores = settled.kind === 'challenge' ? await scoresOf(settled) : [];
    const posterStats = await keptFor(settled.poster_user_id);
    const base = card(settled);
    const spec = JSON.parse(settled.spec_json);
    return {
      ...base,
      goal: settled.goal,
      repo_url: settled.repo_url,
      checker: spec.checker,
      pieces,
      scores,
      join_line: settled.public_number
        ? `Read ${config.baseUrl}/join.md and join mission ${settled.public_number}.`
        : '',
      badge_path: settled.public_number ? `/badge/${settled.public_number}.svg` : '',
      share_path: settled.public_number ? `/share/m/${settled.public_number}.svg` : '',
      kept_promises: posterStats.kept,
      poster_display: settled.poster_display,
    };
  }

  function cleanReward(input) {
    const amount = String(input.reward_amount || '').trim();
    const currency = String(input.reward_currency || '').trim().toUpperCase();
    const rules = String(input.reward_rules || '').trim().slice(0, 500);
    if (!amount && !currency && !rules) return { amount: '', currency: '', rules: '' };
    if (!/^\d{1,9}(\.\d{1,2})?$/.test(amount)) throw httpError(400, 'Reward amount must be a number.');
    if (!/^[A-Z]{3}$/.test(currency)) throw httpError(400, 'Reward currency must be three letters.');
    if (rules.length < 3) throw httpError(400, 'Say how you will pay the winner.');
    return { amount, currency, rules };
  }

  async function loadSpecFromRepo(owner, repo) {
    const info = await github.getRepo(owner, repo);
    if (info.private) throw httpError(400, 'The repository must be public.');
    let file;
    try {
      file = await github.getFile(owner, repo, 'mission.yaml', info.defaultBranch);
    } catch {
      throw httpError(400, 'That public repo has no mission.yaml on the default branch.');
    }
    const parsed = validateMissionYaml(file.content);
    if (!parsed.ok) throw httpError(400, parsed.errors[0]);
    return { info, spec: parsed.spec };
  }

  async function submitMission(user, input) {
    if (user.banned_at) throw httpError(403, 'This account is banned.');
    const parsedUrl = parseRepoUrl(input.repo_url);
    if (!parsedUrl) throw httpError(400, 'Paste a public https://github.com/owner/repo URL.');
    const reward = cleanReward(input);
    const { info, spec } = await loadSpecFromRepo(parsedUrl.owner, parsedUrl.repo);
    const existing = await db.get(
      `SELECT id FROM missions WHERE repo_owner = ? AND repo_name = ? AND status <> 'rejected'`,
      [parsedUrl.owner, parsedUrl.repo],
    );
    if (existing) throw httpError(409, 'That repo is already submitted.');
    const missionId = id();
    await db.run(
      `INSERT INTO missions (
        id, public_number, title, summary, goal, license, kind, repo_owner, repo_name, repo_url, default_branch,
        checker_workflow, checker_name, status, poster_user_id, reward_amount, reward_currency, reward_rules,
        deadline, score_order, problem, spec_json, created_at
      ) VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        missionId,
        spec.title,
        spec.summary,
        spec.goal,
        spec.license,
        spec.kind,
        parsedUrl.owner,
        parsedUrl.repo,
        `https://github.com/${parsedUrl.owner}/${parsedUrl.repo}`,
        info.defaultBranch,
        spec.checker.workflow,
        spec.checker.name,
        user.id,
        reward.amount,
        reward.currency,
        reward.rules,
        spec.deadline,
        spec.score_order,
        spec.problem || '',
        JSON.stringify(spec),
        nowIso(),
      ],
    );
    const mission = await findMission(missionId);
    return card(mission);
  }

  async function approveMission(actor, ref) {
    if (actor.role !== 'admin') throw httpError(403, 'Admin only.');
    const mission = await findMission(ref);
    if (!mission || mission.status !== 'pending') throw httpError(404, 'No pending mission with that id.');
    const { spec } = await loadSpecFromRepo(mission.repo_owner, mission.repo_name);
    const approved = await db.transaction(async (tx) => {
      const current = await tx.get(`SELECT * FROM missions WHERE id = ? AND status = 'pending'`, [mission.id]);
      if (!current) throw httpError(409, 'That mission is no longer pending.');
      const max = await tx.get(`SELECT COALESCE(MAX(public_number), 0) AS n FROM missions`);
      const publicNumber = Number(max.n) + 1;
      await tx.run(`DELETE FROM pieces WHERE mission_id = ?`, [mission.id]);
      for (const piece of spec.pieces) {
        await tx.run(
          `INSERT INTO pieces (id, mission_id, piece_key, title, description, paths_json, status)
           VALUES (?, ?, ?, ?, ?, ?, 'open')`,
          [id(), mission.id, piece.id, piece.title, piece.description, JSON.stringify(piece.paths)],
        );
      }
      await tx.run(
        `UPDATE missions SET status = 'public', public_number = ?, approved_at = ?, spec_json = ?, title = ?, summary = ?, goal = ?,
          license = ?, kind = ?, checker_workflow = ?, checker_name = ?, deadline = ?, score_order = ?, problem = ?, default_branch = ?
         WHERE id = ?`,
        [
          publicNumber,
          nowIso(),
          JSON.stringify(spec),
          spec.title,
          spec.summary,
          spec.goal,
          spec.license,
          spec.kind,
          spec.checker.workflow,
          spec.checker.name,
          spec.deadline,
          spec.score_order,
          spec.problem || '',
          mission.default_branch,
          mission.id,
        ],
      );
      await addEvent(tx, {
        missionId: mission.id,
        kind: 'mission_public',
        message: `Mission ${publicNumber} is public: ${spec.title}`,
      });
      return publicNumber;
    });
    bust();
    return missionDetail(await findMission(approved), actor);
  }

  async function setMissionStatus(actor, ref, status) {
    if (actor.role !== 'admin') throw httpError(403, 'Admin only.');
    const mission = await findMission(ref);
    if (!mission) throw httpError(404, 'Mission not found.');
    if (status === 'hidden' && mission.status === 'pending') {
      await db.run(`UPDATE missions SET status = 'hidden' WHERE id = ?`, [mission.id]);
    } else if (status === 'hidden' && mission.status === 'public') {
      await db.run(`UPDATE missions SET status = 'hidden' WHERE id = ?`, [mission.id]);
    } else if (status === 'rejected' && mission.status === 'pending') {
      await db.run(`UPDATE missions SET status = 'rejected' WHERE id = ?`, [mission.id]);
    } else {
      throw httpError(409, 'That status change is not allowed.');
    }
    bust();
    return { ok: true };
  }

  async function setBan(actor, login, banned) {
    if (actor.role !== 'admin') throw httpError(403, 'Admin only.');
    const user = await userByLogin(login);
    if (!user) throw httpError(404, 'User not found.');
    await db.run(`UPDATE users SET banned_at = ? WHERE id = ?`, [banned ? nowIso() : '', user.id]);
    if (banned) await db.run(`DELETE FROM sessions WHERE user_id = ?`, [user.id]);
    bust();
    return { ok: true, login: user.login, banned };
  }

  async function claimPiece(user, agent, ref) {
    if (user.banned_at) throw httpError(403, 'This account is banned.');
    await releaseExpired();
    const mission = await findMission(ref);
    if (!mission || mission.status !== 'public') throw httpError(404, 'Mission not found.');
    if (mission.kind !== 'team') throw httpError(400, 'This mission has no pieces to claim.');
    const result = await db.transaction(async (tx) => {
      const held = await tx.get(
        `SELECT * FROM pieces WHERE mission_id = ? AND claim_agent_id = ? AND status IN ('claimed', 'submitted')`,
        [mission.id, agent.id],
      );
      if (held) return { piece: held, already: true };
      const open = await tx.get(
        `SELECT * FROM pieces WHERE mission_id = ? AND status = 'open' ORDER BY piece_key ASC LIMIT 1`,
        [mission.id],
      );
      if (!open) throw httpError(409, 'No open pieces right now.');
      const expires = new Date(now().getTime() + config.claimTtlSeconds * 1000).toISOString();
      const updated = await tx.run(
        `UPDATE pieces SET status = 'claimed', claim_user_id = ?, claim_agent_id = ?, claim_expires_at = ?
         WHERE id = ? AND status = 'open'`,
        [user.id, agent.id, expires, open.id],
      );
      if (!updated.changes) throw httpError(409, 'That piece was just claimed.');
      return { piece: await tx.get('SELECT * FROM pieces WHERE id = ?', [open.id]), already: false };
    });
    return {
      mission_number: Number(mission.public_number),
      repo_url: mission.repo_url,
      default_branch: mission.default_branch,
      already: result.already,
      piece: {
        key: result.piece.piece_key,
        title: result.piece.title,
        description: result.piece.description,
        paths: JSON.parse(result.piece.paths_json),
        claim_expires_at: result.piece.claim_expires_at,
      },
      instructions:
        'Change only the allowed paths. Do not edit tests, the checker, mission.yaml, or workflow files. Open a pull request to the default branch, then report the pull request number.',
    };
  }

  async function installationId(owner, repo) {
    const row = await db.get(
      `SELECT installation_id FROM installations WHERE repo_owner = ? AND repo_name = ?`,
      [owner, repo],
    );
    return row?.installation_id || '';
  }

  async function rememberInstallations(payload) {
    const installation = payload.installation?.id;
    if (!installation) return;
    const repos = [];
    if (payload.repository?.name) repos.push(payload.repository);
    for (const repo of payload.repositories || []) repos.push(repo);
    for (const repo of payload.repositories_added || []) repos.push(repo);
    for (const repo of repos) {
      const full = String(repo.full_name || '');
      const owner = String(repo.owner?.login || full.split('/')[0] || '').toLowerCase();
      const name = String(repo.name || full.split('/')[1] || '').toLowerCase();
      if (!owner || !name) continue;
      await db.transaction(async (tx) => {
        await tx.run(`DELETE FROM installations WHERE repo_owner = ? AND repo_name = ?`, [owner, name]);
        await tx.run(
          `INSERT INTO installations (repo_owner, repo_name, installation_id) VALUES (?, ?, ?)`,
          [owner, name, String(installation)],
        );
      });
    }
  }

  function specOf(mission) {
    try {
      return JSON.parse(mission.spec_json);
    } catch {
      return { protected: [], pieces: [], checker: { name: mission.checker_name, workflow: mission.checker_workflow } };
    }
  }

  async function releasePiece(tx, mission, submission) {
    if (!submission.piece_key) return;
    await tx.run(
      `UPDATE pieces SET status = 'open', claim_user_id = '', claim_agent_id = '', claim_expires_at = '', submit_expires_at = ''
       WHERE mission_id = ? AND piece_key = ? AND claim_agent_id = ? AND status IN ('claimed', 'submitted')`,
      [mission.id, submission.piece_key, submission.agent_id],
    );
  }

  async function reportSubmission(user, agent, ref, input) {
    if (user.banned_at) throw httpError(403, 'This account is banned.');
    await releaseExpired();
    const mission = await findMission(ref);
    if (!mission || mission.status !== 'public') throw httpError(404, 'Mission not found.');
    const prNumber = Number(input.pr_number);
    if (!Number.isInteger(prNumber) || prNumber < 1) throw httpError(400, 'pr_number must be a positive integer.');
    const pieceKey = String(input.piece_key || '').trim();
    let piece = null;
    if (mission.kind === 'team') {
      if (!pieceKey) throw httpError(400, 'piece_key is required.');
      piece = await db.get(`SELECT * FROM pieces WHERE mission_id = ? AND piece_key = ?`, [mission.id, pieceKey]);
      if (!piece) throw httpError(404, 'Piece not found.');
      if (piece.status !== 'claimed' || piece.claim_agent_id !== agent.id) {
        throw httpError(409, 'Claim this piece before reporting a pull request.');
      }
      if (piece.claim_expires_at < nowIso()) throw httpError(409, 'The claim expired.');
    } else if (pieceKey) {
      throw httpError(400, 'Challenge missions do not use pieces.');
    }
    const install = await installationId(mission.repo_owner, mission.repo_name);
    const pull = await github.getPull(mission.repo_owner, mission.repo_name, prNumber, install);
    if (pull.merged) throw httpError(400, 'That pull request is already merged.');
    const files = await github.listPullFiles(mission.repo_owner, mission.repo_name, prNumber, install);
    const allowed = piece ? JSON.parse(piece.paths_json) : files.map((file) => file.filename);
    const review = mission.kind === 'team'
      ? reviewDiff({ files, protectedPatterns: specOf(mission).protected, allowedPaths: allowed })
      : reviewDiff({
          files,
          protectedPatterns: specOf(mission).protected,
          allowedPaths: files.map((file) => file.filename).filter((name) => !specOf(mission).protected.includes(name)),
        });
    const submissionId = id();
    const stamp = nowIso();
    if (mission.kind === 'team' && !review.ok) {
      await db.transaction(async (tx) => {
        await tx.run(
          `INSERT INTO submissions (id, mission_id, piece_key, user_id, agent_id, pr_number, pr_url, head_sha, status, rejection_reason, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'rejected', ?, ?, ?)`,
          [submissionId, mission.id, pieceKey, user.id, agent.id, prNumber, pull.url, pull.headSha, review.reason.slice(0, 500), stamp, stamp],
        );
        await releasePiece(tx, mission, { piece_key: pieceKey, agent_id: agent.id });
        await addEvent(tx, {
          missionId: mission.id,
          userId: user.id,
          agentId: agent.id,
          country: user.country_code,
          kind: 'rejected',
          message:
            review.code === 'protected'
              ? `Submission on ${pieceKey} was rejected — it edits protected files`
              : `Submission on ${pieceKey} was rejected`,
        });
      });
      try {
        await github.comment({
          owner: mission.repo_owner,
          repo: mission.repo_name,
          number: prNumber,
          installationId: install,
          body: `OneSwarm rejected this pull request. ${review.reason}`,
        });
        await github.closePull({
          owner: mission.repo_owner,
          repo: mission.repo_name,
          number: prNumber,
          installationId: install,
        });
      } catch {
        // The local rejection stands even if GitHub cannot be reached.
      }
      bust();
      return { id: submissionId, status: 'rejected', reason: review.reason };
    }
    if (mission.kind === 'challenge') {
      const protectedHit = reviewDiff({
        files,
        protectedPatterns: specOf(mission).protected,
        allowedPaths: files
          .map((file) => file.filename)
          .filter((name) => {
            const patterns = specOf(mission).protected;
            return !patterns.some((pattern) => pattern === name);
          }),
      });
      if (!protectedHit.ok && protectedHit.code === 'protected') {
        throw httpError(400, protectedHit.reason);
      }
    }
    const submitExpires = new Date(now().getTime() + config.submitTtlSeconds * 1000).toISOString();
    await db.transaction(async (tx) => {
      await tx.run(
        `INSERT INTO submissions (id, mission_id, piece_key, user_id, agent_id, pr_number, pr_url, head_sha, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'reported', ?, ?)`,
        [submissionId, mission.id, pieceKey, user.id, agent.id, prNumber, pull.url, pull.headSha, stamp, stamp],
      );
      if (piece) {
        await tx.run(
          `UPDATE pieces SET status = 'submitted', submit_expires_at = ? WHERE id = ? AND claim_agent_id = ? AND status = 'claimed'`,
          [submitExpires, piece.id, agent.id],
        );
      }
    });
    bust();
    return { id: submissionId, status: 'reported', reason: '' };
  }

  function pullNumbers(payload) {
    const numbers = new Set();
    for (const group of [
      payload.workflow_run?.pull_requests,
      payload.check_suite?.pull_requests,
      payload.check_run?.pull_requests,
    ]) {
      if (!Array.isArray(group)) continue;
      for (const pull of group) {
        if (Number.isInteger(pull?.number)) numbers.add(pull.number);
      }
    }
    if (Number.isInteger(payload.pull_request?.number)) numbers.add(payload.pull_request.number);
    return [...numbers];
  }

  function signedConclusion(eventName, payload) {
    if (payload.action !== 'completed') return '';
    if (eventName === 'workflow_run') return payload.workflow_run?.conclusion || '';
    if (eventName === 'check_suite') return payload.check_suite?.conclusion || '';
    if (eventName === 'check_run') return payload.check_run?.conclusion || '';
    return '';
  }

  async function finishFailure(mission, submission, reason, kind) {
    const agent = submission.agent_id
      ? await db.get('SELECT name FROM agents WHERE id = ?', [submission.agent_id])
      : null;
    const who = agent?.name || 'An agent';
    const user = await userById(submission.user_id);
    await db.transaction(async (tx) => {
      await tx.run(
        `UPDATE submissions SET status = ?, rejection_reason = ?, updated_at = ? WHERE id = ? AND status IN ('reported', 'failed')`,
        [kind === 'rejected' ? 'rejected' : 'failed', reason.slice(0, 500), nowIso(), submission.id],
      );
      await releasePiece(tx, mission, submission);
      await addEvent(tx, {
        missionId: mission.id,
        userId: submission.user_id,
        agentId: submission.agent_id,
        country: user?.country_code || '',
        kind,
        message:
          kind === 'rejected'
            ? `Submission on ${submission.piece_key || 'a challenge'} was rejected — it edits protected files`
            : `${who} missed ${submission.piece_key || 'the challenge'} — check failed`,
      });
    });
    bust();
  }

  async function applyCheck(eventName, payload) {
    const repo = payload.repository;
    if (!repo?.name || !repo.owner?.login) return { ok: true, ignored: true };
    const owner = repo.owner.login.toLowerCase();
    const name = repo.name.toLowerCase();
    await rememberInstallations(payload);
    const mission = await db.get(
      `SELECT * FROM missions WHERE repo_owner = ? AND repo_name = ? AND status = 'public'`,
      [owner, name],
    );
    if (!mission) return { ok: true, ignored: true };
    const numbers = pullNumbers(payload);
    if (!numbers.length) return { ok: true, ignored: true };
    const conclusion = signedConclusion(eventName, payload);
    if (!conclusion) return { ok: true, ignored: true };
    for (const number of numbers) {
      const submission = await db.get(
        `SELECT * FROM submissions WHERE mission_id = ? AND pr_number = ? ORDER BY created_at DESC LIMIT 1`,
        [mission.id, number],
      );
      if (!submission) continue;
      if (submission.status === 'merged' || submission.status === 'rejected') return { ok: true, already: true };
      const install = await installationId(owner, name);
      if (github.mode === 'real' && !install) return { ok: true, pending_install: true };
      const pull = await github.getPull(owner, name, number, install);
      const runs = await github.listCheckRuns(owner, name, pull.headSha, install);
      const matched = runs.filter((run) => run.name === mission.checker_name && run.headSha === pull.headSha);
      const passed = conclusion === 'success' && matched.some((run) => run.conclusion === 'success');
      if (!passed) {
        if (conclusion === 'failure' || conclusion === 'cancelled' || conclusion === 'timed_out' || matched.some((run) => run.conclusion && run.conclusion !== 'success')) {
          await finishFailure(mission, submission, 'The checker did not pass.', 'failed');
          return { ok: true, status: 'failed' };
        }
        return { ok: true, waiting: true };
      }
      const files = await github.listPullFiles(owner, name, number, install);
      if (mission.kind === 'challenge') {
        const review = reviewDiff({
          files,
          protectedPatterns: specOf(mission).protected,
          allowedPaths: files.map((file) => file.filename),
        });
        if (!review.ok && review.code === 'protected') {
          await finishFailure(mission, submission, review.reason, 'rejected');
          return { ok: true, status: 'rejected' };
        }
        const summary = matched.map((run) => run.summary).join('\n');
        const scoreMatch = summary.match(/score:\s*(-?\d+(?:\.\d+)?)/i);
        if (!scoreMatch) {
          await finishFailure(mission, submission, 'Checker did not report score:<number>.', 'failed');
          return { ok: true, status: 'failed' };
        }
        await db.run(
          `UPDATE submissions SET status = 'scored', score = ?, head_sha = ?, updated_at = ? WHERE id = ?`,
          [scoreMatch[1], pull.headSha, nowIso(), submission.id],
        );
        await settleChallenge(await findMission(mission.id));
        bust();
        return { ok: true, status: 'scored' };
      }
      const piece = await db.get(`SELECT * FROM pieces WHERE mission_id = ? AND piece_key = ?`, [
        mission.id,
        submission.piece_key,
      ]);
      if (!piece || piece.status === 'passed') return { ok: true, already: true };
      if (piece.claim_agent_id !== submission.agent_id) {
        await finishFailure(mission, submission, 'The claim is no longer held by this agent.', 'failed');
        return { ok: true, status: 'failed' };
      }
      const review = reviewDiff({
        files,
        protectedPatterns: specOf(mission).protected,
        allowedPaths: JSON.parse(piece.paths_json),
      });
      if (!review.ok) {
        await finishFailure(mission, submission, review.reason, 'rejected');
        try {
          await github.comment({
            owner,
            repo: name,
            number,
            installationId: install,
            body: `OneSwarm rejected this pull request. ${review.reason}`,
          });
          await github.closePull({ owner, repo: name, number, installationId: install });
        } catch {
          // Rejection is already stored.
        }
        return { ok: true, status: 'rejected' };
      }
      try {
        await github.mergePull({
          owner,
          repo: name,
          number,
          sha: pull.headSha,
          installationId: install,
          title: `${piece.piece_key}: ${piece.title}`,
        });
      } catch (error) {
        if (error.status === 409) return { ok: true, waiting: true };
        const again = await github.getPull(owner, name, number, install);
        if (!again.merged) throw error;
      }
      const user = await userById(submission.user_id);
      const agent = await db.get('SELECT name FROM agents WHERE id = ?', [submission.agent_id]);
      const who = agent?.name || 'An agent';
      await db.transaction(async (tx) => {
        const fresh = await tx.get(`SELECT status FROM pieces WHERE id = ?`, [piece.id]);
        if (!fresh || fresh.status === 'passed') return;
        await tx.run(
          `UPDATE pieces SET status = 'passed', passed_at = ?, passed_by_user_id = ?, passed_country = ? WHERE id = ? AND status <> 'passed'`,
          [nowIso(), submission.user_id, user?.country_code || '', piece.id],
        );
        await tx.run(`UPDATE submissions SET status = 'merged', head_sha = ?, updated_at = ? WHERE id = ?`, [
          pull.headSha,
          nowIso(),
          submission.id,
        ]);
        await addEvent(tx, {
          missionId: mission.id,
          userId: submission.user_id,
          agentId: submission.agent_id,
          country: user?.country_code || '',
          kind: 'passed',
          message: `${who} finished ${piece.piece_key} ${piece.title} ✔ checked`,
        });
      });
      bust();
      return { ok: true, status: 'merged' };
    }
    return { ok: true, ignored: true };
  }

  async function handleWebhook({ rawBody, signature, delivery, eventName }) {
    if (!verifyWebhook(config.webhookSecret, rawBody, signature)) {
      throw httpError(401, 'Bad webhook signature.');
    }
    if (!delivery || delivery.length > 80 || !/^[A-Za-z0-9._:-]+$/.test(delivery)) {
      throw httpError(400, 'Missing delivery id.');
    }
    let payload;
    try {
      payload = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody));
    } catch {
      throw httpError(400, 'Webhook body is not JSON.');
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw httpError(400, 'Webhook body is not an object.');
    }
    try {
      await db.run(`INSERT INTO webhook_deliveries (id, event_name, received_at) VALUES (?, ?, ?)`, [
        delivery,
        String(eventName || '').slice(0, 80),
        nowIso(),
      ]);
    } catch (error) {
      if (isUniqueError(error)) return { ok: true, duplicate: true };
      throw error;
    }
    try {
      if (eventName === 'ping') return { ok: true, pong: true };
      await rememberInstallations(payload);
      if (eventName === 'installation' || eventName === 'installation_repositories') return { ok: true };
      return await applyCheck(eventName, payload);
    } catch (error) {
      await db.run('DELETE FROM webhook_deliveries WHERE id = ?', [delivery]);
      throw error;
    }
  }

  async function getSubmission(ref, submissionId) {
    const mission = await findMission(ref);
    if (!mission || mission.status !== 'public') throw httpError(404, 'Mission not found.');
    const row = await db.get(`SELECT * FROM submissions WHERE id = ? AND mission_id = ?`, [submissionId, mission.id]);
    if (!row) throw httpError(404, 'Submission not found.');
    return {
      id: row.id,
      status: row.status,
      reason: row.rejection_reason,
      pr_number: Number(row.pr_number),
      piece_key: row.piece_key,
      score: row.score,
    };
  }

  async function reportMission(user, ref, reasonInput) {
    if (user.banned_at) throw httpError(403, 'This account is banned.');
    const mission = await findMission(ref);
    if (!mission || mission.status !== 'public') throw httpError(404, 'Mission not found.');
    const reason = String(reasonInput || '').trim();
    if (reason.length < 10 || reason.length > 1000) {
      throw httpError(400, 'Say what is wrong in 10 to 1000 characters.');
    }
    await db.run(
      `INSERT INTO reports (id, mission_id, reporter_user_id, reason, created_at) VALUES (?, ?, ?, ?, ?)`,
      [id(), mission.id, user.id, reason, nowIso()],
    );
    return { ok: true };
  }

  async function confirmReward(user, ref) {
    const mission = await findMission(ref);
    if (!mission || mission.status !== 'public') throw httpError(404, 'Mission not found.');
    const settled = await settleChallenge(mission);
    if (!settled.reward_amount) throw httpError(400, 'This mission has no reward promise.');
    if (settled.winner_user_id !== user.id) throw httpError(403, 'Only the recorded winner can confirm receipt.');
    if (settled.reward_received_at) return { ok: true, already: true };
    await db.run(`UPDATE missions SET reward_received_at = ? WHERE id = ? AND reward_received_at = ''`, [
      nowIso(),
      settled.id,
    ]);
    bust();
    return { ok: true };
  }

  async function publicProfile(login) {
    const user = await userByLogin(login);
    if (!user || user.banned_at) throw httpError(404, 'Profile not found.');
    const pieces = await db.get(
      `SELECT COUNT(*) AS n FROM pieces WHERE passed_by_user_id = ? AND status = 'passed'`,
      [user.id],
    );
    const wins = await db.get(
      `SELECT COUNT(*) AS n FROM missions WHERE winner_user_id = ? AND status = 'public'`,
      [user.id],
    );
    const kept = await keptFor(user.id);
    const country = countryByCode(user.country_code);
    return {
      login: user.login,
      display_name: user.display_name,
      country_code: user.country_code,
      country_name: country?.name || '',
      tips: {
        patreon: user.tip_patreon,
        github: user.tip_github,
        kofi: user.tip_kofi,
        bmc: user.tip_bmc,
      },
      agents: await listAgents(user.id, { publicView: true }),
      pieces_done: Number(pieces?.n || 0),
      wins: Number(wins?.n || 0),
      kept_promises: kept.kept,
      rewards_promised: kept.promised,
      share_path: `/share/u/${user.login}.svg`,
    };
  }

  function jitter(agentId, country) {
    const sample = Number.parseInt(String(agentId).slice(0, 8), 16) || 0;
    const jx = ((sample % 1000) / 1000 - 0.5) * 6;
    const jy = ((Math.floor(sample / 1000) % 1000) / 1000 - 0.5) * 3;
    return {
      lat: Math.round((country.lat + jy) * 100) / 100,
      lng: Math.round((((country.lng + jx + 540) % 360) - 180) * 100) / 100,
    };
  }

  async function computeLive() {
    await releaseExpired();
    const cutoff = new Date(now().getTime() - config.activeAgentSeconds * 1000).toISOString();
    const agents = await db.get(`SELECT COUNT(*) AS n FROM agents WHERE revoked_at = ''`);
    const people = await db.get(
      `SELECT COUNT(*) AS n FROM users u WHERE EXISTS (
        SELECT 1 FROM agents a WHERE a.user_id = u.id AND a.revoked_at = ''
      )`,
    );
    const countryCount = await db.get(
      `SELECT COUNT(DISTINCT u.country_code) AS n FROM users u
       WHERE u.country_code <> '' AND EXISTS (
         SELECT 1 FROM agents a WHERE a.user_id = u.id AND a.revoked_at = ''
       )`,
    );
    const pieces = await db.get(
      `SELECT
         SUM(CASE WHEN p.status = 'passed' THEN 1 ELSE 0 END) AS passed,
         COUNT(*) AS total
       FROM pieces p JOIN missions m ON m.id = p.mission_id
       WHERE m.status = 'public' AND m.kind = 'team'`,
    );
    const active = await db.all(
      `SELECT a.id, a.name, u.login, u.country_code
       FROM agents a JOIN users u ON u.id = a.user_id
       WHERE a.revoked_at = '' AND (
         (a.last_used_at <> '' AND a.last_used_at >= ?)
         OR EXISTS (
           SELECT 1 FROM pieces p WHERE p.claim_agent_id = a.id AND p.status IN ('claimed', 'submitted')
         )
       )`,
      [cutoff],
    );
    const dots = [];
    for (const agent of active) {
      const country = countryByCode(agent.country_code);
      if (!country) continue;
      const point = jitter(agent.id, country);
      dots.push({
        agent_id: agent.id,
        name: agent.name,
        login: agent.login,
        country: country.code,
        country_name: country.name,
        lat: point.lat,
        lng: point.lng,
      });
    }
    const feed = await db.all(
      `SELECT id, message, created_at, kind FROM events ORDER BY created_at DESC, id DESC LIMIT 30`,
    );
    const peopleBoard = await db.all(
      `SELECT u.login, u.display_name, u.country_code AS country, COUNT(*) AS pieces
       FROM pieces p
       JOIN users u ON u.id = p.passed_by_user_id
       JOIN missions m ON m.id = p.mission_id
       WHERE p.status = 'passed' AND m.status = 'public'
       GROUP BY u.id, u.login, u.display_name, u.country_code
       ORDER BY pieces DESC, u.login ASC
       LIMIT 10`,
    );
    const countryBoard = await db.all(
      `SELECT p.passed_country AS country, COUNT(*) AS pieces
       FROM pieces p JOIN missions m ON m.id = p.mission_id
       WHERE p.status = 'passed' AND m.status = 'public' AND p.passed_country <> ''
       GROUP BY p.passed_country
       ORDER BY pieces DESC, p.passed_country ASC
       LIMIT 10`,
    );
    const featuredRows = await db.all(
      `SELECT m.public_number AS number,
        (SELECT COUNT(*) FROM pieces p WHERE p.mission_id = m.id) AS total,
        (SELECT COUNT(*) FROM pieces p WHERE p.mission_id = m.id AND p.status = 'passed') AS passed
       FROM missions m WHERE m.status = 'public' AND m.kind = 'team' ORDER BY m.public_number ASC`,
    );
    const featured =
      featuredRows.find((row) => Number(row.passed) < Number(row.total)) || featuredRows[0] || null;
    return {
      generated_at: nowIso(),
      counts: {
        agents: Number(agents?.n || 0),
        active_agents: active.length,
        people: Number(people?.n || 0),
        countries: Number(countryCount?.n || 0),
        pieces_passed: Number(pieces?.passed || 0),
        pieces_total: Number(pieces?.total || 0),
        percent_done: percent(pieces?.passed, pieces?.total),
      },
      dots,
      feed: feed.map((row) => ({ id: row.id, message: row.message, at: row.created_at, kind: row.kind })),
      leaderboard_people: peopleBoard.map((row) => ({
        login: row.login,
        display_name: row.display_name,
        country: row.country,
        pieces: Number(row.pieces),
      })),
      leaderboard_countries: countryBoard.map((row) => ({
        country: row.country,
        name: countryByCode(row.country)?.name || row.country,
        pieces: Number(row.pieces),
      })),
      featured_mission_number: featured ? Number(featured.number) : 0,
    };
  }

  async function getLive() {
    const at = Date.now();
    if (liveCache && at - liveCache.at < config.cacheTtlMs) return liveCache.value;
    const value = await computeLive();
    liveCache = { at, value };
    return value;
  }

  async function adminOverview() {
    const pending = await missionRows(`WHERE m.status = 'pending'`, []);
    const reports = await db.all(
      `SELECT r.id, r.reason, r.created_at, u.login, m.public_number
       FROM reports r
       JOIN users u ON u.id = r.reporter_user_id
       JOIN missions m ON m.id = r.mission_id
       ORDER BY r.created_at DESC LIMIT 100`,
    );
    const users = await db.all(
      `SELECT u.login, u.role, u.banned_at,
        (SELECT COUNT(*) FROM agents a WHERE a.user_id = u.id AND a.revoked_at = '') AS agents
       FROM users u ORDER BY u.created_at DESC LIMIT 200`,
    );
    return {
      pending: pending.map(card),
      reports: reports.map((row) => ({
        id: row.id,
        mission_number: Number(row.public_number) || 0,
        login: row.login,
        reason: row.reason,
        at: row.created_at,
      })),
      users: users.map((row) => ({
        login: row.login,
        banned: Boolean(row.banned_at),
        agents: Number(row.agents),
        role: row.role,
      })),
    };
  }

  return {
    nowIso,
    bust,
    userById,
    userByLogin,
    agentByToken,
    touchAgent,
    sessionById,
    createSession,
    destroySession,
    upsertGitHubUser,
    createDemoUser,
    updateProfile,
    createAgentToken,
    revokeAgentToken,
    listAgents,
    meView,
    listPublicMissions: async () => (await missionRows(`WHERE m.status = 'public'`, [])).map(card),
    missionDetail: async (ref, user) => {
      const mission = await findMission(ref);
      if (!mission) throw httpError(404, 'Mission not found.');
      return missionDetail(mission, user);
    },
    submitMission,
    approveMission,
    hideMission: (actor, ref) => setMissionStatus(actor, ref, 'hidden'),
    rejectMission: (actor, ref) => setMissionStatus(actor, ref, 'rejected'),
    setBan,
    claimPiece,
    reportSubmission,
    handleWebhook,
    getSubmission,
    reportMission,
    confirmReward,
    publicProfile,
    getLive,
    adminOverview,
    countries: () => COUNTRIES.map(({ code, name }) => ({ code, name })),
    shareMission: async (ref) => {
      const mission = await findMission(ref);
      if (!mission || mission.status !== 'public') throw httpError(404, 'Mission not found.');
      return card(mission);
    },
    shareProfile: async (login) => publicProfile(login),
  };
}
