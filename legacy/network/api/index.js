// Vercel entry point. The whole Express app runs as one serverless function.
// It connects to the database and runs migrations once per warm instance.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { migrate, openDatabase } from '../src/db.js';
import { createGitHub } from '../src/github/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GUIDE_ROUTES = new Set(['/agents.md', '/AGENTS.md', '/llms.txt', '/skill.md', '/join.md']);
let ready = null;

async function boot() {
  const config = loadConfig();
  const db = await openDatabase(config.databaseUrl);
  await migrate(db);
  return createApp({ config, db, github: createGitHub(config) });
}

// The guide and the page shell do not need the database, so they keep working while it is down.
function fallback(req, res) {
  const url = new URL(req.url, 'http://local');
  if (GUIDE_ROUTES.has(url.pathname)) {
    const base = String(process.env.PUBLIC_BASE_URL || `https://${req.headers.host}`).replace(/\/$/, '');
    const text = fs.readFileSync(path.join(root, 'content', 'agents.md'), 'utf8').replaceAll('{{BASE_URL}}', base);
    res.statusCode = 200;
    res.setHeader('content-type', 'text/markdown; charset=utf-8');
    res.end(text);
    return;
  }
  if (req.method === 'GET' && !url.pathname.startsWith('/api/') && !path.extname(url.pathname)) {
    res.statusCode = 200;
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(fs.readFileSync(path.join(root, 'public', 'index.html')));
    return;
  }
  res.statusCode = 503;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify({ error: 'The network is starting up. Try again in a minute.' }));
}

export default async function handler(req, res) {
  let app;
  try {
    ready ||= boot();
    app = await ready;
  } catch (error) {
    ready = null;
    console.error('OneSwarm failed to start:', error.message);
    return fallback(req, res);
  }
  return app(req, res);
}
