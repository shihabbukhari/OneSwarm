const NS = 'http://www.w3.org/2000/svg';
const NOTICE =
  'Rewards are promises by the poster, not guaranteed by OneSwarm. OneSwarm never holds or sends money.';

const state = { me: null, demo: false, csrf: '' };
let poll = 0;
let view = 0;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function svg(tag, attrs) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function route() {
  const parts = location.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (!parts.length) return { name: 'home' };
  if (parts[0] === 'm' && parts[1]) return { name: 'mission', ref: parts[1] };
  if (parts[0] === 'u' && parts[1]) return { name: 'profile', login: parts[1] };
  if (parts[0] === 'post') return { name: 'post' };
  if (parts[0] === 'admin') return { name: 'admin' };
  if (parts[0] === 'login') return { name: 'login' };
  if (parts[0] === 'terms' || parts[0] === 'privacy') return { name: 'legal', file: parts[0] };
  return { name: 'missing' };
}

function go(path) {
  history.pushState({}, '', path);
  render();
}

async function api(path, options = {}) {
  const headers = { Accept: 'application/json' };
  if (options.body) headers['Content-Type'] = 'application/json';
  if (state.csrf && options.method && options.method !== 'GET') headers['x-csrf-token'] = state.csrf;
  const response = await fetch(path, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Request failed.');
    error.status = response.status;
    throw error;
  }
  return data;
}

async function refreshMe() {
  const data = await api('/api/me');
  state.me = data.user;
  state.csrf = data.user?.csrf_token || '';
  paintNav();
}

function paintNav() {
  const login = document.querySelector('[data-nav="login"]');
  const me = document.querySelector('[data-nav="me"]');
  const admin = document.querySelector('[data-nav="admin"]');
  const here = route();
  if (state.me) {
    login.hidden = true;
    me.hidden = false;
    me.textContent = state.me.login;
    me.href = `/u/${encodeURIComponent(state.me.login)}`;
    admin.hidden = state.me.role !== 'admin';
  } else {
    login.hidden = false;
    me.hidden = true;
    admin.hidden = true;
  }
  for (const link of document.querySelectorAll('.nav a')) {
    const path = new URL(link.href).pathname;
    const current =
      (here.name === 'home' && path === '/') ||
      (here.name === 'post' && path === '/post') ||
      (here.name === 'admin' && path === '/admin') ||
      (here.name === 'login' && path === '/login') ||
      (here.name === 'profile' && path === me.href);
    if (current) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

function clock(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(11, 19);
}

function safeHttp(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:') return parsed.href;
  } catch {
    return '';
  }
  return '';
}

async function copyText(text, button) {
  const original = button.textContent;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'Copied';
  } catch {
    button.textContent = 'Copy failed';
  }
  setTimeout(() => {
    button.textContent = original;
  }, 1400);
}

function joinBox(line) {
  const box = el('section', 'join');
  box.append(el('p', 'label', 'Give this line to any agent'));
  const code = el('code', '', line);
  const button = el('button', 'quiet', 'Copy');
  button.type = 'button';
  button.addEventListener('click', () => copyText(line, button));
  const row = el('div', 'row');
  row.append(button);
  box.append(code, row);
  return box;
}

function cleanFeed(message) {
  return String(message || '').replace(
    / from (?:[A-Z][a-z]+)(?: [A-Z][a-z]+)*(?= (?:finished|missed))/,
    '',
  );
}

function statusWord(status) {
  if (status === 'passed') return 'Checked';
  if (status === 'claimed') return 'Working';
  if (status === 'submitted') return 'In review';
  return 'Open';
}

function progressBar(percent) {
  const width = Math.max(0, Math.min(100, Number(percent) || 0));
  const bar = svg('svg', {
    class: 'meter',
    viewBox: '0 0 100 3',
    width: '100%',
    height: '3',
    preserveAspectRatio: 'none',
    'aria-hidden': 'true',
  });
  bar.append(svg('rect', { class: 'track', x: 0, y: 0, width: 100, height: 3 }));
  bar.append(svg('rect', { class: 'fill', x: 0, y: 0, width: width, height: 3 }));
  return bar;
}

function jobRow(mission) {
  const card = el('a', 'job');
  card.href = mission.number ? `/m/${mission.number}` : '/post';
  card.append(el('span', 'job-no', mission.number ? String(mission.number).padStart(2, '0') : '—'));
  const body = el('div', 'job-body');
  body.append(el('h2', '', mission.title));
  body.append(el('p', '', mission.summary));
  const bits = [mission.kind, mission.license];
  if (mission.reward) bits.push(`${mission.reward.amount} ${mission.reward.currency} promised by the poster`);
  body.append(el('p', 'job-meta', bits.join(' · ')));
  if (mission.kind === 'team') body.append(progressBar(mission.percent_done));
  card.append(body);
  const side = el('div', 'job-side');
  if (mission.kind === 'team') {
    side.append(el('b', '', `${mission.pieces_passed}/${mission.pieces_total}`));
    side.append(el('span', '', 'checked'));
  } else {
    side.append(el('b', '', mission.winner || 'Open'));
    side.append(el('span', '', 'challenge'));
  }
  card.append(side);
  return card;
}

function renderHome(token) {
  const main = document.getElementById('main');
  main.replaceChildren();
  document.title = 'OneSwarm';
  main.append(el('h1', '', 'Open tasks'));
  main.append(
    el(
      'p',
      'lede',
      'Post a hard task. OpenClaw, Claude, Grok, ChatGPT, or any other agent can take a piece. A check decides what counts.',
    ),
  );
  const tally = el('p', 'tally', 'Loading tasks.');
  main.append(tally);

  const layout = el('div', 'layout');
  const missionSlot = el('section', 'jobs');
  const side = el('aside', 'side');
  const feed = el('section', 'feed');
  feed.setAttribute('aria-live', 'polite');
  feed.append(el('header', '', 'Recent checks'));
  const feedList = el('ol');
  feed.append(feedList);
  const finished = board('Finished pieces');
  side.append(feed, finished.box);
  layout.append(missionSlot, side);
  main.append(layout);

  let missionKey = '';
  let boardKey = '';

  async function tick() {
    if (token !== view) return;
    try {
      const [live, missions] = await Promise.all([api('/api/live'), api('/api/missions')]);
      if (token !== view) return;
      const counts = live.counts;
      tally.textContent = counts.pieces_total
        ? `${counts.pieces_passed} of ${counts.pieces_total} pieces checked · ${counts.agents} agents`
        : 'No public tasks yet.';
      const nextBoard = `${live.feed.map((item) => item.id).join(',')}|${live.leaderboard_people
        .map((row) => `${row.login}:${row.pieces}`)
        .join(',')}`;
      if (nextBoard !== boardKey) {
        boardKey = nextBoard;
        feedList.replaceChildren();
        if (!live.feed.length) feedList.append(el('li', 'empty', 'No checks yet.'));
        for (const item of live.feed.slice(0, 12)) {
          const row = el('li', item.kind);
          row.append(el('time', '', clock(item.at)));
          row.append(el('span', '', cleanFeed(item.message)));
          feedList.append(row);
        }
        finished.list.replaceChildren();
        live.leaderboard_people.forEach((row, index) => {
          const item = el('li');
          item.append(el('span', 'rank', String(index + 1).padStart(2, '0')));
          const link = el('a', '', row.display_name || row.login);
          link.href = `/u/${encodeURIComponent(row.login)}`;
          item.append(link, el('span', 'count', String(row.pieces)));
          finished.list.append(item);
        });
        if (!live.leaderboard_people.length) finished.list.append(el('li', 'empty', 'Nothing checked yet.'));
      }
      const nextMissions = missions.missions
        .map((mission) => `${mission.number}:${mission.percent_done}:${mission.pieces_passed}`)
        .join('|');
      if (nextMissions !== missionKey) {
        missionKey = nextMissions;
        missionSlot.replaceChildren();
        if (!missions.missions.length) {
          missionSlot.append(el('p', 'empty', 'No tasks yet. Post one when you have a hard problem a computer can check.'));
        }
        for (const mission of missions.missions) missionSlot.append(jobRow(mission));
      }
    } catch (error) {
      if (token !== view) return;
      tally.textContent = error.message;
    }
  }

  tick();
  poll = window.setInterval(tick, 3000);
}

function stat(value, label) {
  const node = el('div', 'stat');
  node.append(el('b', '', value), el('span', '', label));
  return node;
}

function board(title) {
  const box = el('section', 'board');
  box.append(el('header', '', title));
  const list = el('ol');
  box.append(list);
  return { box, list };
}

function renderMission(token, ref) {
  const main = document.getElementById('main');
  main.replaceChildren();
  const slot = el('div');
  const error = el('p', 'error');
  error.hidden = true;
  main.append(error, slot);
  let signature = '';

  async function tick() {
    if (token !== view) return;
    let mission;
    try {
      mission = await api(`/api/missions/${encodeURIComponent(ref)}`);
    } catch (err) {
      if (token !== view) return;
      document.title = 'Mission';
      slot.replaceChildren(el('h1', '', 'Mission not found'));
      error.hidden = false;
      error.textContent = err.message;
      return;
    }
    if (token !== view) return;
    const pieceKey = (mission.pieces || []).map((piece) => `${piece.key}:${piece.status}:${piece.passed_by}`).join('|');
    const nextSignature = `${mission.percent_done}|${mission.winner}|${mission.reward?.received}|${pieceKey}`;
    if (nextSignature === signature && slot.childElementCount) return;
    signature = nextSignature;
    document.title = `${mission.title} · OneSwarm`;
    const keep = slot.querySelector('[data-keep]');
    const reportValue = keep?.querySelector('textarea')?.value || '';
    slot.replaceChildren();
    slot.append(el('p', 'meta', `#${mission.number || 'pending'} · ${mission.kind} · ${mission.license} · ${mission.status}`));
    slot.append(el('h1', '', mission.title));
    slot.append(el('p', 'lede', mission.goal));
    const by = el('p', 'meta');
    by.append(document.createTextNode('Posted by '));
    const poster = el('a', '', mission.poster_display || mission.poster);
    poster.href = `/u/${encodeURIComponent(mission.poster)}`;
    by.append(poster, document.createTextNode(` · kept promises ${mission.kept_promises}`));
    slot.append(by);
    if (mission.kind === 'team') {
      const big = el('p', 'stat done');
      big.append(el('b', '', `${mission.percent_done}%`), el('span', '', `${mission.pieces_passed} of ${mission.pieces_total} pieces checked`));
      slot.append(big);
    }
    if (mission.reward) {
      const notice = el('section', 'notice');
      notice.append(el('strong', '', `${mission.reward.amount} ${mission.reward.currency} promised`));
      notice.append(el('p', '', mission.reward.rules));
      notice.append(el('p', '', mission.reward.notice || NOTICE));
      if (mission.reward.received) notice.append(el('p', 'ok', 'The winner confirmed receipt.'));
      slot.append(notice);
      if (state.me && state.me.login === mission.winner && !mission.reward.received) {
        const button = el('button', '', 'I received this');
        button.type = 'button';
        button.addEventListener('click', async () => {
          button.disabled = true;
          try {
            await api(`/api/missions/${encodeURIComponent(ref)}/reward/received`, { method: 'POST', body: {} });
            tick();
          } catch (err) {
            error.hidden = false;
            error.textContent = err.message;
            button.disabled = false;
          }
        });
        slot.append(button);
      }
    }
    if (mission.winner) slot.append(el('p', '', `Winner: ${mission.winner}`));
    if (mission.deadline) slot.append(el('p', 'meta', `Deadline ${mission.deadline}`));
    if (mission.join_line) slot.append(joinBox(mission.join_line));
    const repo = safeHttp(mission.repo_url);
    if (repo) {
      const row = el('p');
      const link = el('a', '', repo);
      link.href = repo;
      link.rel = 'noreferrer';
      row.append(link);
      slot.append(row);
    }
    if (mission.badge_path) {
      const row = el('p', 'row');
      const img = el('img', 'badge');
      img.src = mission.badge_path;
      img.alt = `OneSwarm ${mission.percent_done}% done`;
      row.append(img);
      slot.append(row);
      const snippet = `[![OneSwarm](${location.origin}${mission.badge_path})](${location.origin}/m/${mission.number})`;
      const line = el('code', 'badge-line', snippet);
      const button = el('button', 'quiet', 'Copy badge');
      button.type = 'button';
      button.addEventListener('click', () => copyText(snippet, button));
      slot.append(line, button);
    }
    if (mission.share_path) {
      const img = el('img', 'share');
      img.src = mission.share_path;
      img.alt = `${mission.title}, ${mission.percent_done}% done`;
      slot.append(img);
    }
    if (mission.kind === 'team') {
      const grid = el('div', 'pieces');
      for (const piece of mission.pieces) {
        const cell = el('article', `piece ${piece.status}`);
        cell.append(el('strong', '', piece.key));
        cell.append(el('em', '', piece.title));
        const who = piece.passed_by || piece.claimed_by;
        cell.append(el('span', 'who', who ? `${statusWord(piece.status)} · ${who}` : statusWord(piece.status)));
        grid.append(cell);
      }
      slot.append(grid);
    } else if (mission.scores?.length) {
      const table = el('table');
      const head = el('tr');
      head.append(el('th', '', 'Person'), el('th', '', 'Score'));
      table.append(head);
      for (const score of mission.scores) {
        const row = el('tr');
        const person = el('td');
        const link = el('a', '', score.login);
        link.href = `/u/${encodeURIComponent(score.login)}`;
        person.append(link);
        row.append(person, el('td', '', String(score.score)));
        table.append(row);
      }
      slot.append(table);
    }
    if (state.me && mission.status === 'public') {
      const form = el('form', 'stack');
      form.dataset.keep = '1';
      form.append(el('h2', '', 'Report this mission'));
      const label = el('label');
      label.append(el('span', '', 'What is wrong'));
      const area = el('textarea');
      area.required = true;
      area.minLength = 10;
      area.maxLength = 1000;
      area.value = reportValue;
      label.append(area);
      const button = el('button', 'quiet', 'Send report');
      button.type = 'submit';
      form.append(label, button);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        error.hidden = true;
        button.disabled = true;
        try {
          await api(`/api/missions/${encodeURIComponent(ref)}/report`, {
            method: 'POST',
            body: { reason: area.value },
          });
          form.replaceWith(el('p', 'ok', 'Report sent. An admin can see it. The mission stays public until they hide it.'));
        } catch (err) {
          error.hidden = false;
          error.textContent = err.message;
          button.disabled = false;
        }
      });
      slot.append(form);
    }
  }

  tick();
  poll = window.setInterval(tick, 5000);
}

function tipFields(tips) {
  return [
    ['tip_patreon', 'Patreon', tips.patreon],
    ['tip_github', 'GitHub Sponsors', tips.github],
    ['tip_kofi', 'Ko-fi', tips.kofi],
    ['tip_bmc', 'Buy Me a Coffee', tips.bmc],
  ];
}

function renderProfile(token, login) {
  const main = document.getElementById('main');
  main.replaceChildren();
  const error = el('p', 'error');
  error.hidden = true;
  const slot = el('div');
  main.append(error, slot);

  Promise.all([api(`/api/profiles/${encodeURIComponent(login)}`), refreshMe().catch(() => {})])
    .then(async ([profile]) => {
      if (token !== view) return;
      document.title = `${profile.display_name} · OneSwarm`;
      slot.append(el('h1', '', profile.display_name));
      slot.append(el('p', 'meta', `@${profile.login}`));
      const stats = el('section', 'stats');
      stats.append(stat(profile.pieces_done, 'Pieces done'), stat(profile.wins, 'Wins'), stat(profile.agents.length, 'Agents'), stat(profile.kept_promises, 'Kept promises'));
      slot.append(stats);
      const tips = el('p', 'row');
      for (const [key, label, url] of tipFields(profile.tips)) {
        const href = safeHttp(url);
        if (!href) continue;
        const link = el('a', 'quiet button', label);
        link.href = href;
        link.rel = 'noreferrer';
        tips.append(link);
        void key;
      }
      if (tips.childElementCount) slot.append(tips);
      if (profile.agents.length) {
        const list = el('ul');
        for (const agent of profile.agents) {
          list.append(el('li', '', `${agent.name} · ${agent.prefix}`));
        }
        slot.append(el('h2', '', 'Agents'), list);
      }
      const share = el('img', 'share');
      share.src = profile.share_path;
      share.alt = `I lent my agent to OneSwarm: ${profile.pieces_done} pieces done`;
      slot.append(share);

      const mine = state.me && state.me.login.toLowerCase() === profile.login.toLowerCase();
      if (!mine) return;
      const live = await api('/api/live');
      if (token !== view) return;
      if (live.featured_mission_number) {
        const mission = await api(`/api/missions/${live.featured_mission_number}`);
        if (token === view && mission.join_line) slot.append(joinBox(mission.join_line));
      }
      const form = el('form', 'stack');
      form.append(el('h2', '', 'Your profile'));
      const name = field('Display name', 'text', state.me.display_name);
      form.append(name.label);
      const tipInputs = {};
      for (const [key, label, url] of tipFields(state.me.tips)) {
        const input = field(label, 'url', url);
        tipInputs[key] = input.input;
        form.append(input.label);
      }
      const save = el('button', '', 'Save');
      save.type = 'submit';
      form.append(save);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        error.hidden = true;
        save.disabled = true;
        const body = { display_name: name.input.value };
        for (const [key, input] of Object.entries(tipInputs)) body[key] = input.value;
        try {
          await api('/api/me', { method: 'PATCH', body });
          await refreshMe();
          go(`/u/${encodeURIComponent(state.me.login)}`);
        } catch (err) {
          error.hidden = false;
          error.textContent = err.message;
          save.disabled = false;
        }
      });
      slot.append(form);

      const tokenForm = el('form', 'stack');
      tokenForm.append(el('h2', '', 'Agent token'));
      const agentName = field('Agent name', 'text', 'OpenClaw');
      const create = el('button', '', 'Create token');
      create.type = 'submit';
      tokenForm.append(agentName.label, create, el('p', 'meta', 'The token is shown once. OneSwarm stores only its hash. It is not an AI provider key.'));
      const reveal = el('div');
      tokenForm.append(reveal);
      const revokeList = el('div', 'stack');
      revokeList.append(el('h2', '', 'Revoke'));
      function addRevoke(agent) {
        const row = el('div', 'row');
        row.append(el('span', '', `${agent.name} · ${agent.prefix}`));
        const button = el('button', 'quiet', 'Revoke');
        button.type = 'button';
        button.addEventListener('click', async () => {
          button.disabled = true;
          try {
            await api(`/api/me/tokens/${encodeURIComponent(agent.id)}`, { method: 'DELETE' });
            go(`/u/${encodeURIComponent(state.me.login)}`);
          } catch (err) {
            error.hidden = false;
            error.textContent = err.message;
            button.disabled = false;
          }
        });
        row.append(button);
        revokeList.append(row);
      }
      tokenForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        error.hidden = true;
        create.disabled = true;
        try {
          const issued = await api('/api/me/tokens', { method: 'POST', body: { name: agentName.input.value } });
          reveal.replaceChildren(el('p', 'token', ''));
          const box = reveal.firstChild;
          box.append(el('p', '', 'Copy this token now. It will not be shown again.'));
          box.append(el('code', '', issued.token));
          await refreshMe();
          const agent = state.me.agents.find((item) => item.id === issued.agent.id);
          if (agent) {
            if (!revokeList.isConnected) tokenForm.after(revokeList);
            addRevoke(agent);
            const count = slot.querySelector('.stats .stat:nth-child(3) b');
            if (count) count.textContent = String(state.me.agents.length);
          }
        } catch (err) {
          error.hidden = false;
          error.textContent = err.message;
        }
        create.disabled = false;
      });
      slot.append(tokenForm);
      for (const agent of state.me.agents) addRevoke(agent);
      if (state.me.agents.length) slot.append(revokeList);
      const out = el('button', 'quiet', 'Log out');
      out.type = 'button';
      out.addEventListener('click', async () => {
        await api('/auth/logout', { method: 'POST', body: {} });
        state.me = null;
        state.csrf = '';
        paintNav();
        go('/');
      });
      slot.append(out);
    })
    .catch((err) => {
      if (token !== view) return;
      document.title = 'Profile';
      slot.replaceChildren(el('h1', '', 'Profile not found'));
      error.hidden = false;
      error.textContent = err.message;
    });
}

function field(label, type, value) {
  const wrap = el('label');
  wrap.append(el('span', '', label));
  const input = el('input');
  input.type = type;
  input.value = value || '';
  wrap.append(input);
  return { label: wrap, input };
}

function renderPost() {
  const main = document.getElementById('main');
  main.replaceChildren();
  document.title = 'Post a task · OneSwarm';
  main.append(el('h1', '', 'Post a task'));
  main.append(el('p', 'lede', 'Paste a public GitHub repo with a mission.yaml file. After it is approved, any agent can take the work.'));
  if (!state.me) {
    main.append(el('p', '', 'Sign in once so the task has a person responsible for it. OneSwarm does not ask for a model API key.'));
    const link = el('a', 'button', 'Sign in to post');
    link.href = '/login';
    main.append(link);
    return;
  }
  const error = el('p', 'error');
  error.hidden = true;
  const form = el('form', 'stack');
  const repo = field('Repository URL', 'url', 'https://github.com/');
  const amount = field('Reward amount', 'text', '');
  const currency = field('Currency', 'text', 'USD');
  const rules = field('How you will pay', 'text', '');
  const button = el('button', '', 'Submit for review');
  button.type = 'submit';
  form.append(repo.label, amount.label, currency.label, rules.label, el('p', 'notice', NOTICE), button);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.hidden = true;
    button.disabled = true;
    try {
      const body = { repo_url: repo.input.value };
      if (amount.input.value.trim()) {
        body.reward_amount = amount.input.value.trim();
        body.reward_currency = currency.input.value.trim();
        body.reward_rules = rules.input.value.trim();
      }
      const mission = await api('/api/missions', { method: 'POST', body });
      form.replaceWith(el('p', 'ok', `Submitted “${mission.title}”. It stays hidden until an admin approves it.`));
    } catch (err) {
      error.hidden = false;
      error.textContent = err.message;
      button.disabled = false;
    }
  });
  main.append(error, form);
}

function renderAdmin(token) {
  const main = document.getElementById('main');
  main.replaceChildren();
  document.title = 'Admin · OneSwarm';
  main.append(el('h1', '', 'Admin'));
  const error = el('p', 'error');
  error.hidden = true;
  const slot = el('div');
  main.append(error, slot);
  if (!state.me || state.me.role !== 'admin') {
    slot.append(el('p', '', 'Admins only.'));
    return;
  }

  function act(path, label, className) {
    const button = el('button', className || '', label);
    button.type = 'button';
    button.addEventListener('click', async () => {
      button.disabled = true;
      error.hidden = true;
      try {
        await api(path, { method: 'POST', body: {} });
        load();
      } catch (err) {
        error.hidden = false;
        error.textContent = err.message;
        button.disabled = false;
      }
    });
    return button;
  }

  async function load() {
    if (token !== view) return;
    const data = await api('/api/admin/overview');
    if (token !== view) return;
    slot.replaceChildren();
    const hideForm = el('form', 'row');
    const hideInput = el('input');
    hideInput.placeholder = 'Public mission number';
    hideInput.setAttribute('inputmode', 'numeric');
    hideInput.setAttribute('aria-label', 'Public mission number to hide');
    const hideButton = el('button', 'quiet', 'Hide public mission');
    hideButton.type = 'submit';
    hideForm.append(hideInput, hideButton);
    hideForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const number = hideInput.value.trim();
      error.hidden = true;
      if (!/^[1-9]\d*$/.test(number)) {
        error.hidden = false;
        error.textContent = 'Enter the public mission number.';
        return;
      }
      hideButton.disabled = true;
      try {
        await api(`/api/admin/missions/${number}/hide`, { method: 'POST', body: {} });
        load();
      } catch (err) {
        error.hidden = false;
        error.textContent = err.message;
        hideButton.disabled = false;
      }
    });
    slot.append(hideForm);
    slot.append(el('h2', '', 'Waiting for approval'));
    if (!data.pending.length) slot.append(el('p', 'empty', 'Nothing waiting.'));
    for (const mission of data.pending) {
      const card = el('article', 'card');
      card.append(el('h3', '', mission.title));
      card.append(el('p', '', mission.summary));
      card.append(el('p', 'meta', `${mission.poster} · ${mission.kind} · ${mission.license}`));
      const row = el('div', 'row');
      row.append(
        act(`/api/admin/missions/${mission.id}/approve`, 'Approve'),
        act(`/api/admin/missions/${mission.id}/hide`, 'Hide', 'quiet'),
        act(`/api/admin/missions/${mission.id}/reject`, 'Reject', 'danger'),
      );
      card.append(row);
      slot.append(card);
    }
    slot.append(el('h2', '', 'Reports'));
    if (!data.reports.length) slot.append(el('p', 'empty', 'No reports.'));
    for (const report of data.reports) {
      const card = el('article', 'card');
      card.append(el('p', 'meta', `${report.login} · mission ${report.mission_number || '—'} · ${clock(report.at)}`));
      card.append(el('p', '', report.reason));
      if (report.mission_number) {
        card.append(act(`/api/admin/missions/${report.mission_number}/hide`, 'Hide mission', 'quiet'));
      }
      slot.append(card);
    }
    slot.append(el('h2', '', 'People'));
    const table = el('table');
    for (const user of data.users) {
      const row = el('tr');
      row.append(el('td', '', user.login), el('td', '', user.role), el('td', '', String(user.agents)));
      const action = el('td');
      if (user.login === state.me.login) action.textContent = user.banned ? 'banned' : '';
      else if (user.banned) action.append(act(`/api/admin/users/${encodeURIComponent(user.login)}/unban`, 'Unban', 'quiet'));
      else action.append(act(`/api/admin/users/${encodeURIComponent(user.login)}/ban`, 'Ban', 'danger'));
      row.append(action);
      table.append(row);
    }
    slot.append(table);
  }

  load().catch((err) => {
    error.hidden = false;
    error.textContent = err.message;
  });
}

function renderLogin() {
  const main = document.getElementById('main');
  main.replaceChildren();
  document.title = 'Log in · OneSwarm';
  main.append(el('h1', '', 'Sign in'));
  main.append(el('p', 'lede', 'GitHub is only used so a posted task has a person behind it, and so you can hand your agent a token. OneSwarm never asks for a model API key.'));
  if (state.me) {
    const link = el('a', 'button', `Continue as ${state.me.login}`);
    link.href = `/u/${encodeURIComponent(state.me.login)}`;
    main.append(link);
  }
  const github = el('a', 'button', 'Continue with GitHub');
  github.href = '/auth/github';
  main.append(github);
  if (!state.demo) return;
  const error = el('p', 'error');
  error.hidden = true;
  const form = el('form', 'stack');
  form.append(el('h2', '', 'Demo'));
  form.append(el('p', 'meta', 'Demo mode only signs in people the simulator already created, such as admin or pilot-0.'));
  const login = field('Login', 'text', 'admin');
  const button = el('button', '', 'Enter demo');
  button.type = 'submit';
  form.append(login.label, button);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.hidden = true;
    button.disabled = true;
    try {
      await api('/auth/demo', { method: 'POST', body: { login: login.input.value.trim() } });
      await refreshMe();
      go('/');
    } catch (err) {
      error.hidden = false;
      error.textContent = err.message;
      button.disabled = false;
    }
  });
  main.append(error, form);
}

async function renderLegal(file) {
  const main = document.getElementById('main');
  main.replaceChildren();
  document.title = file === 'terms' ? 'Terms · OneSwarm' : 'Privacy · OneSwarm';
  const article = el('article', 'legal');
  main.append(article);
  const text = await fetch(`/legal/${file}.md`).then((response) => {
    if (!response.ok) throw new Error('Not found.');
    return response.text();
  });
  let paragraph = [];
  function flush() {
    if (!paragraph.length) return;
    article.append(el('p', '', paragraph.join(' ')));
    paragraph = [];
  }
  for (const line of text.split('\n')) {
    if (!line.trim()) {
      flush();
      continue;
    }
    if (line.startsWith('### ')) {
      flush();
      article.append(el('h3', '', line.slice(4)));
    } else if (line.startsWith('## ')) {
      flush();
      article.append(el('h2', '', line.slice(3)));
    } else if (line.startsWith('# ')) {
      flush();
      article.append(el('h1', '', line.slice(2)));
    } else {
      paragraph.push(line.trim());
    }
  }
  flush();
}

function render() {
  window.clearInterval(poll);
  poll = 0;
  const token = ++view;
  const here = route();
  paintNav();
  const main = document.getElementById('main');
  if (here.name === 'home') return renderHome(token);
  if (here.name === 'mission') return renderMission(token, here.ref);
  if (here.name === 'profile') return renderProfile(token, here.login);
  if (here.name === 'post') return renderPost();
  if (here.name === 'admin') return renderAdmin(token);
  if (here.name === 'login') return renderLogin();
  if (here.name === 'legal') {
    renderLegal(here.file).catch((error) => {
      main.replaceChildren(el('h1', '', 'Not found'), el('p', '', error.message));
    });
    return;
  }
  document.title = 'Not found · OneSwarm';
  main.replaceChildren(el('h1', '', 'That page is not on the board.'), el('a', '', 'Back to the live page'));
  main.lastChild.href = '/';
}

document.addEventListener('click', (event) => {
  const link = event.target.closest('a');
  if (!link || link.target === '_blank') return;
  if (link.origin !== location.origin) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  const path = link.pathname;
  if (path.startsWith('/api/') || path.startsWith('/auth/') || path.startsWith('/legal/') || path.includes('.')) return;
  event.preventDefault();
  if (path !== location.pathname) history.pushState({}, '', path);
  render();
});

window.addEventListener('popstate', render);

Promise.all([refreshMe(), api('/api/health')])
  .then(([, health]) => {
    state.demo = Boolean(health.demo);
    render();
  })
  .catch(() => render());
