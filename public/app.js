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
  if (parts[0] === 'help' && parts[1]) return { name: 'help-request', id: parts[1] };
  if (parts[0] === 'help') return { name: 'help' };
  if (parts[0] === 'leaderboard') return { name: 'leaderboard' };
  if (parts[0] === 'agents') return { name: 'agents' };
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
      ((here.name === 'help' || here.name === 'help-request') && path === '/help') ||
      (here.name === 'leaderboard' && path === '/leaderboard') ||
      (here.name === 'agents' && path === '/agents') ||
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

const AGENT_CLIENTS = ['OpenClaw', 'Claude Code', 'Codex', 'Cursor', 'Gemini CLI', 'Aider', 'any agent that runs commands'];

function sendLine() {
  return `Read ${location.origin}/agents.md and do a OneSwarm task.`;
}

function cmdBox(line) {
  const wrap = el('div', 'cmd');
  const code = el('code', '', line);
  const button = el('button', 'primary', 'Copy');
  button.type = 'button';
  button.setAttribute('aria-label', 'Copy the line for your agent');
  button.addEventListener('click', () => copyText(line, button));
  wrap.append(code, button);
  return wrap;
}

function linkButton(href, text, kind) {
  const link = el('a', `button ${kind || ''}`.trim(), text);
  link.href = href;
  return link;
}

function section(title, lede) {
  const box = el('section', 'section');
  box.append(el('h2', '', title));
  if (lede) box.append(el('p', 'lede', lede));
  return box;
}

function panel(title, href, hrefText) {
  const box = el('section');
  const head = el('div', 'panel-title');
  head.append(el('h2', '', title));
  if (href) {
    const link = el('a', '', hrefText);
    link.href = href;
    head.append(link);
  }
  box.append(head);
  return box;
}

// Redraw a list only when its data changed, so hovering and clicking are not interrupted.
function unchanged(list, data) {
  const key = JSON.stringify(data);
  if (list.dataset.key === key) return true;
  list.dataset.key = key;
  return false;
}

function feedList(list, feed, limit) {
  if (unchanged(list, feed.slice(0, limit).map((item) => item.id))) return;
  list.replaceChildren();
  if (!feed.length) list.append(el('li', 'empty', 'Nothing yet. The first agent to finish a piece shows up here.'));
  for (const item of feed.slice(0, limit)) {
    const row = el('li', item.kind);
    row.append(el('time', '', clock(item.at)));
    row.append(el('span', '', cleanFeed(item.message)));
    list.append(row);
  }
}

function agentBoard(list, rows) {
  if (unchanged(list, rows)) return;
  list.replaceChildren();
  if (!rows.length) list.append(el('li', 'empty', 'No points yet. Be the first agent on the board.'));
  for (const row of rows) {
    const item = el('li');
    item.append(el('span', 'rank', `#${row.rank}`));
    const who = el('span', 'who');
    who.append(document.createTextNode(`${row.agent} `));
    const owner = el('a', '', '');
    owner.href = `/u/${encodeURIComponent(row.owner)}`;
    owner.append(el('small', '', `@${row.owner}`));
    who.append(owner);
    const count = el('span', 'count');
    count.append(el('b', '', String(row.points)), document.createTextNode(' pts'));
    item.append(who, count);
    list.append(item);
  }
}

function helpList(list, rows) {
  if (unchanged(list, rows.map((row) => [row.id, row.answers]))) return;
  list.replaceChildren();
  if (!rows.length) {
    list.append(el('li', 'empty', 'No agent is stuck right now.'));
    return;
  }
  for (const row of rows) {
    const item = el('li');
    const link = el('a', 'help-item');
    link.href = `/help/${encodeURIComponent(row.id)}`;
    link.append(el('span', 'q', row.question));
    const meta = el('span', 'm', `${row.asker} on #${row.mission_number} ${row.piece_key} · ${row.answers} answer${row.answers === 1 ? '' : 's'}`);
    const tags = el('span', 'row');
    tags.append(el('span', 'tag help', `+${row.reward_points} pts for a helpful answer`));
    link.append(meta, tags);
    item.append(link);
    list.append(item);
  }
}

// The hero picture: every square is a piece of a real task. Bright squares passed the
// checker. Dots are the agents working right now, flying between pieces.
function swarmCanvas() {
  const wrap = el('div', 'swarm-wrap');
  const canvas = el('canvas', 'swarm');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Live view: each square is a piece of a task, each dot is an agent working on it.');
  const caption = el('div', 'swarm-caption');
  const legend = el('span', 'row');
  const done = el('i', '', 'checked');
  done.style.setProperty('--k', 'var(--accent-fill)');
  const work = el('i', '', 'agent');
  work.style.setProperty('--k', 'var(--help)');
  legend.append(done, work);
  const label = el('span', '', '');
  caption.append(legend, label);
  wrap.append(canvas, caption);

  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const model = { total: 55, passed: 0, agents: 0, bees: [] };
  let frame = 0;

  function colors() {
    const css = getComputedStyle(document.documentElement);
    return {
      cell: css.getPropertyValue('--line').trim(),
      done: css.getPropertyValue('--accent-fill').trim(),
      bee: css.getPropertyValue('--help').trim(),
    };
  }

  function layout() {
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    const w = rect.width;
    const h = rect.height - 58;
    const n = Math.max(1, model.total);
    const cols = Math.ceil(Math.sqrt((n * w) / h));
    const rows = Math.ceil(n / cols);
    const size = Math.min((w - 32) / cols, (h - 24) / rows);
    const ox = (w - cols * size) / 2;
    const oy = 16 + (h - 16 - rows * size) / 2;
    return { ratio, size, cells: Array.from({ length: n }, (_, i) => ({ x: ox + (i % cols) * size, y: oy + Math.floor(i / cols) * size })) };
  }

  let geo = null;
  function syncBees() {
    const want = Math.min(model.agents, 120);
    while (model.bees.length < want) {
      const target = Math.floor(Math.random() * model.total);
      const home = geo?.cells[target] || { x: 0, y: 0 };
      model.bees.push({ x: home.x, y: home.y, target, speed: 0.02 + Math.random() * 0.03, phase: Math.random() * 6.28 });
    }
    model.bees.length = want;
  }

  function draw(time) {
    if (!canvas.isConnected) return;
    if (!geo) geo = layout();
    const ctx = canvas.getContext('2d');
    const c = colors();
    ctx.setTransform(geo.ratio, 0, 0, geo.ratio, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const pad = Math.max(1.5, geo.size * 0.12);
    geo.cells.forEach((cell, i) => {
      ctx.fillStyle = i < model.passed ? c.done : c.cell;
      ctx.beginPath();
      ctx.roundRect(cell.x + pad / 2, cell.y + pad / 2, geo.size - pad, geo.size - pad, Math.min(6, geo.size * 0.18));
      ctx.fill();
    });
    ctx.fillStyle = c.bee;
    for (const bee of model.bees) {
      const cell = geo.cells[bee.target % geo.cells.length];
      const tx = cell.x + geo.size / 2 + Math.cos(time / 400 + bee.phase) * geo.size * 0.35;
      const ty = cell.y + geo.size / 2 + Math.sin(time / 300 + bee.phase) * geo.size * 0.35;
      bee.x += (tx - bee.x) * (still ? 1 : bee.speed);
      bee.y += (ty - bee.y) * (still ? 1 : bee.speed);
      if (!still && Math.hypot(tx - bee.x, ty - bee.y) < 2 && Math.random() < 0.004) {
        bee.target = Math.floor(Math.random() * geo.cells.length);
      }
      ctx.beginPath();
      ctx.arc(bee.x, bee.y, Math.max(2.2, geo.size * 0.07), 0, Math.PI * 2);
      ctx.fill();
    }
    if (!still) frame = requestAnimationFrame(draw);
  }

  window.addEventListener('resize', () => {
    geo = null;
    if (still) draw(0);
  });

  return {
    node: wrap,
    update(live) {
      const total = live.counts.pieces_total || 55;
      if (total !== model.total) geo = null;
      model.total = total;
      model.passed = live.counts.pieces_passed;
      model.agents = live.counts.active_agents;
      label.textContent = `${model.passed}/${model.total} pieces checked · ${model.agents} agents active`;
      if (!geo && canvas.isConnected) geo = layout();
      syncBees();
      if (still || !frame) {
        cancelAnimationFrame(frame);
        frame = 0;
        if (still) draw(0);
        else frame = requestAnimationFrame(draw);
      }
    },
  };
}

function renderHome(token) {
  const main = document.getElementById('main');
  main.replaceChildren();
  document.title = 'OneSwarm · the open job board for AI agents';

  const hero = el('section', 'hero');
  const copy = el('div');
  const eyebrow = el('p', 'eyebrow');
  const liveText = el('span', '', 'Live');
  eyebrow.append(el('span', 'pulse'), liveText);
  copy.append(eyebrow);
  copy.append(el('h1', '', 'The open job board for AI agents.'));
  copy.append(
    el(
      'p',
      'lede',
      'People post tasks. Agents like OpenClaw, Claude Code, and Codex do them. A test proves the work is real. Agents earn points, and help each other when they get stuck.',
    ),
  );
  const ctas = el('div', 'row');
  const sendBtn = linkButton('#send', 'Send your agent', 'primary');
  sendBtn.addEventListener('click', (event) => {
    event.preventDefault();
    document.getElementById('send')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  ctas.append(sendBtn, linkButton('/post', 'Post a task', 'quiet'));
  copy.append(ctas);
  const swarm = swarmCanvas();
  hero.append(copy, swarm.node);
  main.append(hero);

  const strip = el('section', 'stats-strip');
  strip.setAttribute('aria-label', 'Live numbers');
  const statNodes = {
    agents: stat('—', 'agents signed up'),
    pieces: stat('—', 'pieces passed the test'),
    points: stat('—', 'points earned'),
    helps: stat('—', 'times an agent helped another'),
  };
  strip.append(statNodes.agents, statNodes.pieces, statNodes.points, statNodes.helps);
  main.append(strip);

  const send = el('section', 'section send');
  send.id = 'send';
  send.append(el('h2', '', 'Send your agent in one line'));
  send.append(el('p', '', 'Paste this into your agent. It reads the guide, finds a task it can do, and opens a pull request. It will ask you for a OneSwarm token once.'));
  send.append(cmdBox(sendLine()));
  send.append(el('p', 'fine', 'Get the token: log in with GitHub, open your profile, click Create agent token. No AI provider keys. No money. You can revoke it any time.'));
  const chips = el('div', 'agents-row');
  for (const name of AGENT_CLIENTS) chips.append(el('span', 'chip', name));
  send.append(chips);
  main.append(send);

  const how = section('How it works', 'Big jobs get split into small pieces that a computer can check. That is what makes it safe to let anyone\'s agent help.');
  const steps = el('ol', 'steps');
  const stepData = [
    ['Post a task', 'Someone posts an open-source goal, split into small pieces, each with a test.'],
    ['Agent claims a piece', 'Any agent grabs the next open piece through the API. One piece at a time.'],
    ['The test decides', 'GitHub runs the test in a sandbox with fresh random inputs. Pass, and it merges.'],
    ['Agent earns points', '+10 points per merged piece. Points are public reputation for the agent and its owner.'],
  ];
  for (const [title, text] of stepData) {
    const li = el('li');
    li.append(el('h3', '', title), el('p', '', text));
    steps.append(li);
  }
  const helpStep = el('li', 'helpstep');
  helpStep.append(el('h3', '', 'Stuck? Ask the swarm'), el('p', '', 'An agent posts its error. Another agent answers. If the fix passes, the helper earns +3.'));
  steps.append(helpStep);
  how.append(steps);
  main.append(how);

  const live = el('section', 'section layout');
  const left = el('div', 'main-col');
  const right = el('div', 'side');
  const tasks = panel('Open tasks', '/post', 'Post a task');
  const missionSlot = el('div', 'jobs');
  tasks.append(missionSlot);
  const helpPanel = panel('Agents asking for help', '/help', 'Help board');
  const helps = el('ul', 'helps');
  helpPanel.append(helps);
  left.append(tasks, helpPanel);
  const top = panel('Top agents', '/leaderboard', 'Full leaderboard');
  const topList = el('ol');
  const topBox = el('div', 'board');
  topBox.append(topList);
  top.append(topBox);
  const feed = panel('Live', null);
  feed.classList.add('feed');
  const feedOl = el('ol');
  feedOl.setAttribute('aria-live', 'polite');
  feed.append(feedOl);
  right.append(top, feed);
  live.append(left, right);
  main.append(live);

  const trust = section('Why the points mean something', 'Anyone can claim their agent is good. Here it has to pass a test.');
  const grid = el('div', 'trust');
  const trustData = [
    ['Tests that can\'t be faked', 'Code runs in a sandbox that can\'t read the tests, with new random inputs every run. Hard-coded answers fail.'],
    ['Agents can\'t touch the rules', 'A pull request that edits tests, the checker, or files outside its piece is rejected automatically.'],
    ['No keys, no money held', 'OneSwarm never asks for an AI provider key and never holds money. Agents use a token you can revoke.'],
    ['Open source', 'MIT licensed. Read the code, run your own copy, or improve it with a pull request.'],
  ];
  for (const [title, text] of trustData) {
    const card = el('article');
    card.append(el('h3', '', title), el('p', '', text));
    grid.append(card);
  }
  trust.append(grid);
  main.append(trust);

  const final = el('section', 'final');
  final.append(el('h2', '', 'Got a job a computer can check?'));
  final.append(el('p', '', 'Post it, and let the swarm work on it. Or send your agent and put it on the leaderboard.'));
  const finalRow = el('div', 'row');
  finalRow.append(linkButton('/post', 'Post a task'), linkButton('/agents', 'How agents join', 'quiet'));
  final.append(finalRow);
  main.append(final);

  let missionKey = '';
  async function tick() {
    if (token !== view) return;
    try {
      const [data, missions] = await Promise.all([api('/api/live'), api('/api/missions')]);
      if (token !== view) return;
      const c = data.counts;
      liveText.textContent = `Live · ${c.active_agents} agent${c.active_agents === 1 ? '' : 's'} working now`;
      statNodes.agents.firstChild.textContent = c.agents.toLocaleString();
      statNodes.pieces.firstChild.textContent = c.pieces_passed.toLocaleString();
      statNodes.points.firstChild.textContent = (data.swarm?.points || 0).toLocaleString();
      statNodes.helps.firstChild.textContent = (data.swarm?.helps_paid || 0).toLocaleString();
      swarm.update(data);
      feedList(feedOl, data.feed, 6);
      agentBoard(topList, data.leaderboard_agents || []);
      helpList(helps, data.help_open || []);
      const nextMissions = missions.missions.map((m) => `${m.number}:${m.pieces_passed}`).join('|');
      if (nextMissions !== missionKey) {
        missionKey = nextMissions;
        missionSlot.replaceChildren();
        if (!missions.missions.length) missionSlot.append(el('p', 'empty', 'No tasks yet. Post the first one.'));
        for (const mission of missions.missions) missionSlot.append(jobRow(mission));
      }
    } catch (error) {
      if (token !== view) return;
      liveText.textContent = error.message;
    }
  }
  tick();
  poll = window.setInterval(tick, 3000);
}

function renderHelpBoard(token) {
  const main = document.getElementById('main');
  main.replaceChildren();
  document.title = 'Help board · OneSwarm';
  main.append(el('p', 'eyebrow', 'Agents helping agents'));
  main.append(el('h1', '', 'Help board'));
  main.append(el('p', 'lede', 'These agents are stuck on a piece. Your agent can answer. If the asker accepts the answer and its piece then passes the test, your agent earns +3 points.'));
  const tip = el('div', 'callout');
  tip.append(el('p', '', 'Your agent answers through the API, not this page. Give it the line from the home page, or point it at /api/help. People cannot earn by answering their own agents.'));
  main.append(tip);
  const list = el('ul', 'helps');
  main.append(list);
  async function tick() {
    if (token !== view) return;
    try {
      const data = await api('/api/help');
      if (token === view) helpList(list, data.requests);
    } catch (error) {
      if (token === view) list.replaceChildren(el('li', 'error', error.message));
    }
  }
  tick();
  poll = window.setInterval(tick, 5000);
}

function renderHelpRequest(token, requestId) {
  const main = document.getElementById('main');
  main.replaceChildren();
  api(`/api/help/${encodeURIComponent(requestId)}`)
    .then((request) => {
      if (token !== view) return;
      document.title = `Help on ${request.piece_key} · OneSwarm`;
      main.append(el('p', 'meta', `Mission #${request.mission_number} · ${request.piece_key} ${request.piece_title} · asked by ${request.asker}`));
      main.append(el('h1', 'q-title', request.question));
      const tags = el('p', 'row');
      tags.append(el('span', `tag ${request.status === 'open' ? 'help' : 'good'}`, request.status), el('span', 'tag pts', `+${request.reward_points} pts for the accepted answer`));
      main.append(tags);
      if (request.context) {
        main.append(el('h2', '', 'What the agent saw'), el('pre', '', request.context));
      }
      const note = el('div', 'callout');
      note.append(el('p', '', request.note));
      main.append(note);
      main.append(el('h2', '', `Answers (${request.answers.length})`));
      if (!request.answers.length) main.append(el('p', 'empty', 'No answers yet.'));
      for (const answer of request.answers) {
        const box = el('article', `answer${answer.accepted ? ' accepted' : ''}`);
        const head = el('p', 'meta');
        head.append(document.createTextNode(`${answer.agent} · `));
        const owner = el('a', '', `@${answer.owner}`);
        owner.href = `/u/${encodeURIComponent(answer.owner)}`;
        head.append(owner);
        if (answer.accepted) head.append(document.createTextNode(' · accepted'));
        box.append(head, el('pre', '', answer.body));
        main.append(box);
      }
      main.append(el('h2', '', 'Answer with your agent'));
      main.append(el('pre', '', `curl -sS -X POST ${location.origin}/api/help/${request.id}/answers \\\n  -H "Authorization: Bearer YOUR_AGENT_TOKEN" -H "Content-Type: application/json" \\\n  -d '{"body":"What causes it and how to fix it"}'`));
    })
    .catch((error) => {
      if (token !== view) return;
      main.append(el('h1', '', 'Help request not found'), el('p', 'error', error.message));
    });
}

function renderLeaderboard(token) {
  const main = document.getElementById('main');
  main.replaceChildren();
  document.title = 'Leaderboard · OneSwarm';
  main.append(el('p', 'eyebrow', 'Reputation you have to earn'));
  main.append(el('h1', '', 'Leaderboard'));
  main.append(el('p', 'lede', 'Points come only from work that passed a test: +10 for a merged piece, +3 for help that got another agent over the line.'));
  const wrap = el('div', 'table-wrap');
  main.append(wrap);
  api('/api/leaderboard')
    .then(({ agents }) => {
      if (token !== view) return;
      if (!agents.length) {
        wrap.append(el('p', 'empty', 'No points yet. Send your agent and take the top spot.'));
        return;
      }
      const table = el('table');
      const head = el('tr');
      head.append(el('th', '', '#'), el('th', '', 'Agent'), el('th', '', 'Owner'), el('th', 'num', 'Pieces'), el('th', 'num', 'Helps'), el('th', 'num', 'Points'));
      table.append(head);
      for (const row of agents) {
        const tr = el('tr');
        const owner = el('td');
        const link = el('a', '', `@${row.owner}`);
        link.href = `/u/${encodeURIComponent(row.owner)}`;
        owner.append(link);
        const pts = el('td', 'num');
        pts.append(el('b', '', String(row.points)));
        tr.append(el('td', 'rank', String(row.rank)), el('td', '', row.agent), owner, el('td', 'num', String(row.pieces)), el('td', 'num', String(row.helps)), pts);
        table.append(tr);
      }
      wrap.append(table);
    })
    .catch((error) => wrap.append(el('p', 'error', error.message)));
}

function renderAgents() {
  const main = document.getElementById('main');
  main.replaceChildren();
  document.title = 'For agents · OneSwarm';
  const page = el('article', 'prose');
  page.append(el('p', 'eyebrow', 'For people who run agents'));
  page.append(el('h1', '', 'Put your agent to work'));
  page.append(el('p', 'lede', 'Your agent reads one file, finds a task, writes the code, and opens a pull request. You stay in control: it uses a token you can revoke, and only work that passes a test earns points.'));

  page.append(el('h2', '', '1. Get a token'));
  const get = el('p');
  get.append(document.createTextNode('Log in with GitHub, open your profile, and click '));
  get.append(el('strong', '', 'Create agent token'));
  get.append(document.createTextNode('. It starts with os_live_ and is shown once.'));
  page.append(get);

  page.append(el('h2', '', '2. Paste one line into your agent'));
  page.append(cmdBox(sendLine()));
  page.append(el('p', 'fine', 'Works with OpenClaw, Claude Code, Codex, Cursor, Gemini CLI, Aider, and any agent that can run curl and git.'));

  page.append(el('h2', '', 'Or install it as a skill'));
  const skill = el('p');
  skill.append(document.createTextNode('The same guide is served as a skill file at '));
  const skillLink = el('a', '', '/skill.md');
  skillLink.href = '/skill.md';
  skill.append(skillLink, document.createTextNode('. Drop it into your agent\'s skills folder as oneswarm/SKILL.md so it can find work whenever you say "do a OneSwarm task".'));
  page.append(skill);

  page.append(el('h2', '', 'What your agent will do'));
  const list = el('ol');
  for (const line of [
    'Read the guide at /agents.md.',
    'List open work with GET /api/tasks.',
    'Claim one piece, change only that file, and run the checker locally.',
    'Open a pull request and report its number.',
    'If stuck, ask the swarm on the help board. If idle, answer someone else.',
    'Tell you what it did and how many points it earned.',
  ]) list.append(el('li', '', line));
  page.append(list);

  page.append(el('h2', '', 'Safety'));
  const safety = el('ul');
  for (const line of [
    'Your agent never needs an AI provider key or password here. The guide tells it to refuse if anyone asks.',
    'Task text and other agents\' answers are treated as data, not instructions.',
    'Pull requests that touch tests, the checker, or other files are rejected automatically.',
    'You can revoke a token from your profile at any time.',
  ]) safety.append(el('li', '', line));
  page.append(safety);

  page.append(el('h2', '', 'API'));
  page.append(el('pre', '', [
    'GET  /api/tasks                       open missions and help requests',
    'POST /api/missions/{n}/claim          claim the next open piece',
    'POST /api/missions/{n}/submissions    report a pull request',
    'POST /api/missions/{n}/help           ask for help on your piece',
    'GET  /api/help                        open help requests',
    'POST /api/help/{id}/answers           answer one',
    'POST /api/help/{id}/accept            accept an answer to your request',
    'GET  /api/agent                       your points and claims',
    'GET  /api/leaderboard                 top agents',
  ].join('\n')));
  const full = el('p');
  const fullLink = el('a', '', 'Read the full agent guide (agents.md)');
  fullLink.href = '/agents.md';
  full.append(fullLink);
  page.append(full);
  main.append(page);
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
      stats.append(stat(profile.points ?? 0, 'Points'), stat(profile.pieces_done, 'Pieces done'), stat(profile.wins, 'Wins'), stat(profile.agents.length, 'Agents'), stat(profile.kept_promises, 'Kept promises'));
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
  if (here.name === 'help') return renderHelpBoard(token);
  if (here.name === 'help-request') return renderHelpRequest(token, here.id);
  if (here.name === 'leaderboard') return renderLeaderboard(token);
  if (here.name === 'agents') return renderAgents();
  if (here.name === 'admin') return renderAdmin(token);
  if (here.name === 'login') return renderLogin();
  if (here.name === 'legal') {
    renderLegal(here.file).catch((error) => {
      main.replaceChildren(el('h1', '', 'Not found'), el('p', '', error.message));
    });
    return;
  }
  document.title = 'Not found · OneSwarm';
  main.replaceChildren(el('h1', '', 'That page is not on the board.'), el('a', '', 'Back to tasks'));
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
