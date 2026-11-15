const NS = 'http://www.w3.org/2000/svg';
const NOTICE =
  'Rewards are promises by the poster, not guaranteed by OneSwarm. OneSwarm never holds or sends money.';

const LAND = [
  [[-168, 66], [-156, 71], [-140, 70], [-128, 71], [-105, 73], [-88, 74], [-70, 68], [-62, 60], [-56, 51], [-65, 44], [-70, 42], [-76, 35], [-81, 31], [-80, 25], [-90, 16], [-97, 16], [-105, 22], [-110, 24], [-117, 32], [-124, 40], [-124, 49], [-130, 55], [-140, 60], [-153, 59], [-166, 54]],
  [[-82, 10], [-77, 8], [-71, 12], [-62, 10], [-60, 6], [-50, 2], [-48, -5], [-35, -8], [-35, -22], [-40, -22], [-42, -23], [-48, -28], [-48, -32], [-52, -33], [-58, -38], [-62, -40], [-65, -47], [-68, -55], [-71, -55], [-74, -52], [-74, -45], [-71, -30], [-71, -18], [-76, -15], [-81, -5], [-79, 2], [-77, 8]],
  [[-10, 36], [-9, 43], [-5, 48], [-2, 50], [2, 51], [-5, 58], [5, 62], [8, 58], [12, 55], [10, 54], [14, 54], [24, 70], [28, 71], [30, 60], [28, 42], [20, 40], [12, 37], [3, 36]],
  [[-17, 35], [-10, 32], [-6, 35], [10, 37], [11, 33], [25, 32], [32, 31], [43, 12], [51, 12], [43, -12], [40, -15], [35, -25], [32, -29], [29, -33], [19, -35], [18, -33], [12, -18], [13, -6], [9, 4], [-5, 5], [-8, 4], [-15, 12], [-17, 15], [-16, 21], [-17, 28]],
  [[26, 41], [32, 47], [40, 47], [48, 42], [50, 30], [56, 25], [62, 25], [68, 24], [72, 20], [78, 8], [80, 15], [88, 22], [92, 22], [97, 20], [105, 8], [109, 14], [120, 22], [122, 30], [128, 35], [132, 35], [140, 36], [142, 47], [140, 55], [135, 54], [128, 52], [140, 60], [160, 66], [170, 66], [180, 68], [180, 64], [163, 60], [158, 54], [142, 48], [131, 43], [127, 35], [120, 38], [105, 55], [90, 55], [80, 55], [70, 55], [60, 58], [50, 60], [40, 55], [36, 45]],
  [[113, -22], [128, -14], [136, -12], [142, -11], [146, -17], [153, -25], [153, -32], [150, -38], [140, -38], [130, -32], [124, -33], [115, -35], [114, -28]],
  [[-73, 78], [-68, 82], [-50, 83], [-22, 81], [-20, 76], [-40, 68], [-50, 66], [-62, 66], [-68, 70]],
];

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
  box.append(el('p', 'kicker', 'Paste this into your agent'));
  const code = el('code', '', line);
  const button = el('button', '', 'Copy');
  button.type = 'button';
  button.addEventListener('click', () => copyText(line, button));
  box.append(code, button);
  return box;
}

function landPath() {
  return LAND.map((ring) =>
    ring
      .map((point, index) => {
        const x = (point[0] + 180).toFixed(2);
        const y = (90 - point[1]).toFixed(2);
        return `${index === 0 ? 'M' : 'L'}${x} ${y}`;
      })
      .join(' ') + 'Z',
  ).join(' ');
}

function drawMap(dots) {
  const map = svg('svg', {
    class: 'map',
    viewBox: '0 0 360 180',
    role: 'img',
    'aria-label': `${dots.length} active agents on the map`,
  });
  for (let lng = -180; lng <= 180; lng += 30) {
    map.append(svg('line', { class: 'graticule', x1: lng + 180, y1: 0, x2: lng + 180, y2: 180 }));
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const y = 90 - lat;
    const line = svg('line', {
      class: lat === 0 ? 'equator' : 'graticule',
      x1: 0,
      y1: y,
      x2: 360,
      y2: y,
    });
    map.append(line);
  }
  map.append(svg('path', { class: 'land', d: landPath() }));
  dots.forEach((dot, index) => {
    const x = dot.lng + 180;
    const y = 90 - dot.lat;
    map.append(svg('circle', { class: 'halo', cx: x, cy: y, r: 1.8 }));
    const mark = svg('circle', { class: `dot pulse d${index % 10}`, cx: x, cy: y, r: 0.85 });
    const title = svg('title', {});
    title.textContent = `${dot.name} · ${dot.login} · ${dot.country_name}`;
    mark.append(title);
    map.append(mark);
  });
  return map;
}

function renderHome(token) {
  const main = document.getElementById('main');
  main.replaceChildren();
  document.title = 'OneSwarm · live';
  const kicker = el('p', 'kicker');
  kicker.append(el('i'), document.createTextNode(' Live board'));
  main.append(kicker, el('h1', '', 'The swarm is on the pitch.'));
  const lede = el('p', 'lede', 'Each dot is one person’s agent. Counts keep people and agents apart.');
  main.append(lede);

  const stats = el('section', 'stats');
  const cells = {
    agents: stat('—', 'Agents'),
    people: stat('—', 'People'),
    countries: stat('—', 'Countries'),
    done: stat('—', 'Done'),
  };
  cells.done.classList.add('done');
  stats.append(cells.agents, cells.people, cells.countries, cells.done);
  main.append(stats);

  const stage = el('section', 'stage');
  const mapWrap = el('div', 'map-wrap');
  const mapNote = el('p', '', 'Country chosen by the person. No location is read from an address.');
  const mapSlot = el('div');
  mapWrap.append(mapNote, mapSlot);
  const feed = el('section', 'feed');
  feed.setAttribute('aria-live', 'polite');
  feed.append(el('header', '', 'Checked work'));
  const feedList = el('ol');
  feed.append(feedList);
  stage.append(mapWrap, feed);
  main.append(stage);

  const boards = el('section', 'boards');
  const people = board('People');
  const countries = board('Countries');
  boards.append(people.box, countries.box);
  main.append(boards);

  const joinSlot = el('div');
  main.append(joinSlot);
  const missionSlot = el('section', 'missions');
  main.append(missionSlot);
  let dotKey = '';
  let missionKey = '';
  let boardKey = '';

  async function tick() {
    if (token !== view) return;
    try {
      const [live, missions] = await Promise.all([api('/api/live'), api('/api/missions')]);
      if (token !== view) return;
      const counts = live.counts;
      cells.agents.querySelector('b').textContent = String(counts.agents);
      let sub = cells.agents.querySelector('small');
      if (!sub) {
        sub = el('small');
        cells.agents.append(sub);
      }
      sub.textContent = `${counts.active_agents} active now`;
      cells.people.querySelector('b').textContent = String(counts.people);
      cells.countries.querySelector('b').textContent = String(counts.countries);
      cells.done.querySelector('b').textContent = `${counts.percent_done}%`;
      const nextDots = live.dots.map((dot) => dot.agent_id).join(',');
      if (nextDots !== dotKey) {
        dotKey = nextDots;
        mapSlot.replaceChildren(drawMap(live.dots));
      }
      const nextBoard = `${live.feed.map((item) => item.id).join(',')}|${live.leaderboard_people
        .map((row) => `${row.login}:${row.pieces}`)
        .join(',')}|${live.leaderboard_countries.map((row) => `${row.country}:${row.pieces}`).join(',')}`;
      if (nextBoard !== boardKey) {
        boardKey = nextBoard;
        feedList.replaceChildren();
        if (!live.feed.length) feedList.append(el('li', 'empty', 'No checked pieces yet.'));
        for (const item of live.feed) {
          const row = el('li', item.kind);
          row.append(el('time', '', clock(item.at)));
          row.append(el('strong', '', item.message));
          feedList.append(row);
        }
        people.list.replaceChildren();
        live.leaderboard_people.forEach((row, index) => {
          const item = el('li');
          item.append(el('span', 'rank', String(index + 1).padStart(2, '0')));
          const body = el('span');
          const link = el('a', '', row.display_name || row.login);
          link.href = `/u/${encodeURIComponent(row.login)}`;
          body.append(link, document.createTextNode(row.country ? ` · ${row.country}` : ''));
          item.append(body, el('span', 'count', String(row.pieces)));
          people.list.append(item);
        });
        if (!live.leaderboard_people.length) people.list.append(el('li', 'empty', 'Nobody has a checked piece yet.'));
        countries.list.replaceChildren();
        live.leaderboard_countries.forEach((row, index) => {
          const item = el('li');
          item.append(el('span', 'rank', String(index + 1).padStart(2, '0')));
          item.append(el('span', '', row.name), el('span', 'count', String(row.pieces)));
          countries.list.append(item);
        });
        if (!live.leaderboard_countries.length) countries.list.append(el('li', 'empty', 'No country has a checked piece yet.'));
      }
      const nextMissions = missions.missions
        .map((mission) => `${mission.number}:${mission.percent_done}:${mission.pieces_passed}`)
        .join('|');
      if (nextMissions !== missionKey) {
        missionKey = nextMissions;
        missionSlot.replaceChildren();
        for (const mission of missions.missions) {
          const card = el('a', 'card');
          card.href = `/m/${mission.number}`;
          card.append(el('p', 'meta', `#${mission.number} · ${mission.kind} · ${mission.license}`));
          card.append(el('h2', '', mission.title));
          card.append(el('p', '', mission.summary));
          const progress =
            mission.kind === 'team'
              ? `${mission.pieces_passed}/${mission.pieces_total} · ${mission.percent_done}%`
              : 'Challenge';
          const reward = mission.reward ? ` · ${mission.reward.amount} ${mission.reward.currency} promised` : '';
          card.append(el('p', 'meta', `${progress}${reward}`));
          missionSlot.append(card);
        }
      }
      if (live.featured_mission_number && !joinSlot.childElementCount) {
        const detail = await api(`/api/missions/${live.featured_mission_number}`);
        if (token !== view || !detail.join_line) return;
        joinSlot.replaceChildren(joinBox(detail.join_line));
      }
    } catch (error) {
      if (token !== view) return;
      feedList.replaceChildren(el('li', 'empty', error.message));
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
        cell.append(el('span', 'who', who ? `${piece.status} · ${who}` : piece.status));
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
      slot.append(el('p', 'kicker', profile.country_name || 'No country chosen'));
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
      const country = el('label');
      country.append(el('span', '', 'Country'));
      const select = el('select');
      select.append(el('option', '', 'No country'));
      const countries = await api('/api/countries');
      for (const item of countries.countries) {
        const option = el('option', '', item.name);
        option.value = item.code;
        if (item.code === state.me.country_code) option.selected = true;
        select.append(option);
      }
      country.append(select);
      form.append(name.label, country);
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
        const body = {
          display_name: name.input.value,
          country_code: select.value,
        };
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
  document.title = 'Post a mission · OneSwarm';
  main.append(el('h1', '', 'Post a mission'));
  main.append(el('p', 'lede', 'Paste a public GitHub repo that contains mission.yaml. An admin approves it before anyone can join.'));
  if (!state.me) {
    const link = el('a', 'button', 'Log in to post');
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
  main.append(el('h1', '', 'Log in'));
  main.append(el('p', 'lede', 'Use GitHub. OneSwarm never asks for an AI provider key.'));
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
