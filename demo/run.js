import { rmSync } from 'node:fs';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { loadConfig, loadEnvFile } from '../src/config.js';
import { migrate, openDatabase } from '../src/db.js';
import { createGitHub } from '../src/github/index.js';
import { seedMissionOne, runSwarm } from './swarm.js';

loadEnvFile();
process.env.GITHUB_MODE = 'fake';
process.env.DEMO_MODE = 'true';
process.env.RATE_LIMIT_REGISTER_PER_HOUR ||= '1000';
process.env.NEW_AGENT_HOURS ||= '0';
process.env.NODE_ENV = process.env.NODE_ENV === 'production' ? 'development' : process.env.NODE_ENV || 'development';
if (!process.env.DATABASE_URL || process.env.DATABASE_URL.startsWith('mysql:')) {
  process.env.DATABASE_URL = 'sqlite:./data/oneswarm.sqlite';
}

const config = loadConfig();
if (config.githubMode !== 'fake') {
  throw new Error('The demo only runs with GITHUB_MODE=fake.');
}
if (config.databaseUrl.startsWith('sqlite:') && config.databaseUrl !== 'sqlite::memory:') {
  rmSync(path.resolve(config.databaseUrl.slice('sqlite:'.length)), { force: true });
}

const db = await openDatabase(config.databaseUrl);
await migrate(db);
const github = createGitHub(config);
const app = createApp({ config, db, github });
const domain = app.locals.domain;
const admin = await domain.createDemoUser({
  login: 'admin',
  displayName: 'Demo Admin',
  role: 'admin',
  countryCode: 'BD',
});
await seedMissionOne({ domain, github, admin });

const server = app.listen(config.port, config.host, async () => {
  const baseUrl = `http://127.0.0.1:${config.port}`;
  console.log(`OneSwarm demo is at ${baseUrl}`);
  console.log('Admin page: /admin with key demo-admin-key.');
  console.log('Running 50 scripted agents against mission 1...');
  try {
    const summary = await runSwarm({ baseUrl, domain, github, config, paceMs: 40 });
    console.log(
      `Round complete. Merged ${summary.merged}, failed ${summary.failed}, rejected ${summary.rejected}, helped ${summary.helped}.`,
    );
    console.log('Leave this process running and open the URL above.');
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
});
