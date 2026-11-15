import { createApp } from './app.js';
import { loadConfig, loadEnvFile } from './config.js';
import { migrate, openDatabase } from './db.js';
import { createGitHub } from './github/index.js';

loadEnvFile();
const config = loadConfig();
const db = await openDatabase(config.databaseUrl);
await migrate(db);
const github = createGitHub(config);
const app = createApp({ config, db, github });

const server = app.listen(config.port, config.host, () => {
  if (!config.quiet) {
    console.log(`OneSwarm listening on http://${config.host}:${config.port}`);
  }
});

server.on('error', (error) => {
  console.error(error);
  process.exit(1);
});
