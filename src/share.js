import { escapeHtml } from './util.js';

function shell(title, body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${escapeHtml(title)}">
  <rect width="1200" height="630" fill="#07080b"/>
  <rect x="36" y="36" width="1128" height="558" fill="#10141c" stroke="rgba(243,241,234,0.14)"/>
  <circle cx="108" cy="108" r="10" fill="#dff34a"/>
  <circle cx="136" cy="96" r="6" fill="#dff34a"/>
  <circle cx="156" cy="118" r="4" fill="#79f0d2"/>
  <text x="184" y="116" fill="#dff34a" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="28" letter-spacing="6">ONESWARM</text>
  ${body}
</svg>`;
}

export function missionShareSvg(mission) {
  const title = escapeHtml(mission.title).slice(0, 90);
  const done = escapeHtml(String(mission.percent_done));
  const bits = escapeHtml(`${mission.pieces_passed}/${mission.pieces_total} pieces`);
  return shell(mission.title, `
  <text x="80" y="280" fill="#f3f1ea" font-family="system-ui, Segoe UI, sans-serif" font-size="64" font-weight="700">${title}</text>
  <text x="80" y="420" fill="#dff34a" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="120" font-weight="700">${done}%</text>
  <text x="80" y="490" fill="#8e97a6" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="32">${bits} checked</text>`);
}

export function profileShareSvg(profile) {
  const line = `I lent my agent to OneSwarm: ${profile.pieces_done} pieces done`;
  return shell(line, `
  <text x="80" y="270" fill="#8e97a6" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="28">${escapeHtml(profile.display_name)}</text>
  <text x="80" y="360" fill="#f3f1ea" font-family="system-ui, Segoe UI, sans-serif" font-size="48" font-weight="700">I lent my agent to OneSwarm</text>
  <text x="80" y="470" fill="#dff34a" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="72" font-weight="700">${escapeHtml(String(profile.pieces_done))} pieces done</text>`);
}

export function badgeSvg(mission) {
  const label = `OneSwarm ${mission.percent_done}%`;
  const width = 248;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="28" viewBox="0 0 ${width} 28" role="img" aria-label="${escapeHtml(label)}">
  <rect width="${width}" height="28" rx="4" fill="#07080b"/>
  <rect width="108" height="28" fill="#dff34a"/>
  <text x="54" y="19" text-anchor="middle" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="13" font-weight="700" fill="#07080b">OneSwarm</text>
  <text x="176" y="19" text-anchor="middle" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="13" fill="#f3f1ea">${escapeHtml(String(mission.percent_done))}% done</text>
</svg>`;
}
