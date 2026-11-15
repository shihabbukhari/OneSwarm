import fs from 'node:fs';
import path from 'node:path';

export function loadEnvFile(file = '.env') {
  const full = path.resolve(file);
  if (!fs.existsSync(full)) return;
  const text = fs.readFileSync(full, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function flag(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return value === 'true' || value === '1';
}

function integer(env, key, fallback) {
  const value = env[key];
  if (value === undefined || value === '') return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${key} must be a non-negative integer`);
  }
  return number;
}

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const githubMode = env.GITHUB_MODE || 'fake';
  if (!['fake', 'real', 'off'].includes(githubMode)) {
    throw new Error('GITHUB_MODE must be fake, real, or off');
  }
  const databaseUrl = env.DATABASE_URL || 'sqlite:./data/oneswarm.sqlite';
  const demoMode = flag(env.DEMO_MODE, githubMode === 'fake');
  const adminKey = String(env.ADMIN_KEY || (demoMode ? 'demo-admin-key' : ''));
  let webhookSecret = env.GITHUB_WEBHOOK_SECRET || '';
  if (!webhookSecret && githubMode === 'fake') webhookSecret = 'demo-webhook-secret';

  if (nodeEnv === 'production') {
    if (demoMode) throw new Error('DEMO_MODE must be false in production');
    if (githubMode === 'fake') throw new Error('GITHUB_MODE must be real or off in production');
    if (!/^(mysql|postgres|postgresql):\/\//.test(databaseUrl)) {
      throw new Error('Production DATABASE_URL must start with mysql://, postgres://, or postgresql://');
    }
    if (githubMode === 'real' && !webhookSecret) throw new Error('Set GITHUB_WEBHOOK_SECRET');
    if (adminKey && adminKey.length < 24) throw new Error('ADMIN_KEY must be at least 24 characters');
    if (!String(env.PUBLIC_BASE_URL || '').startsWith('https://')) {
      throw new Error('PUBLIC_BASE_URL must be https in production');
    }
  }

  const baseUrl = String(env.PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

  return {
    nodeEnv,
    port: integer(env, 'PORT', 3000),
    host: env.HOST || '0.0.0.0',
    databaseUrl,
    githubMode,
    demoMode,
    githubAppId: env.GITHUB_APP_ID || '',
    githubAppSlug: env.GITHUB_APP_SLUG || '',
    githubClientId: env.GITHUB_CLIENT_ID || '',
    githubClientSecret: env.GITHUB_CLIENT_SECRET || '',
    githubPrivateKey: String(env.GITHUB_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    webhookSecret,
    baseUrl,
    adminKey,
    rateRegisterPerHour: integer(env, 'RATE_LIMIT_REGISTER_PER_HOUR', 5),
    newAgentHours: integer(env, 'NEW_AGENT_HOURS', 24),
    claimTtlSeconds: integer(env, 'CLAIM_TTL_SECONDS', 7200),
    submitTtlSeconds: integer(env, 'SUBMIT_TTL_SECONDS', 21600),
    activeAgentSeconds: integer(env, 'ACTIVE_AGENT_SECONDS', 900),
    rateReadPerMin: integer(env, 'RATE_LIMIT_READ_PER_MIN', 600),
    rateWritePerMin: integer(env, 'RATE_LIMIT_WRITE_PER_MIN', 300),
    rateClaimPerHour: integer(env, 'RATE_LIMIT_CLAIM_PER_HOUR', 30),
    rateSubmitPerHour: integer(env, 'RATE_LIMIT_SUBMIT_PER_HOUR', 30),
    cacheTtlMs: integer(env, 'CACHE_TTL_MS', 2000),
    trustProxy: flag(env.TRUST_PROXY, false),
    quiet: flag(env.QUIET, false),
  };
}
