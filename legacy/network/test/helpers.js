import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { migrate, openDatabase } from '../src/db.js';
import { FakeGitHub } from '../src/github/fake.js';

export function testConfig(overrides = {}) {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: process.env.TEST_DATABASE_URL || 'sqlite::memory:',
    GITHUB_MODE: 'fake',
    DEMO_MODE: 'true',
    RATE_LIMIT_REGISTER_PER_HOUR: '100000',
    NEW_AGENT_HOURS: '0',
    GITHUB_WEBHOOK_SECRET: 'test-webhook-secret',
    PUBLIC_BASE_URL: 'http://127.0.0.1:3000',
    ADMIN_KEY: 'test-admin-key-test-admin-key',
    CACHE_TTL_MS: '0',
    QUIET: 'true',
    RATE_LIMIT_READ_PER_MIN: '100000',
    RATE_LIMIT_WRITE_PER_MIN: '100000',
    RATE_LIMIT_CLAIM_PER_HOUR: '100000',
    RATE_LIMIT_SUBMIT_PER_HOUR: '100000',
    CLAIM_TTL_SECONDS: '7200',
    SUBMIT_TTL_SECONDS: '21600',
    ACTIVE_AGENT_SECONDS: '900',
    ...overrides,
  });
}

export async function startHarness(overrides = {}) {
  const config = testConfig(overrides);
  const db = await openDatabase(config.databaseUrl);
  await migrate(db);
  const github = new FakeGitHub();
  const app = createApp({ config, db, github });
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const { port } = server.address();
  return {
    config,
    db,
    github,
    domain: app.locals.domain,
    baseUrl: `http://127.0.0.1:${port}`,
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      await db.close();
    },
  };
}

export function cookieFrom(response) {
  const header = response.headers.get('set-cookie') || '';
  return header.split(';')[0];
}
