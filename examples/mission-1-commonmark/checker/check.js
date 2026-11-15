const { spawnSync } = require('child_process');
const path = require('path');

function argument(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? '' : process.argv[index + 1] || '';
}

const piece = argument('--piece');
if (!/^p\d+$/.test(piece)) {
  console.error('Usage: node checker/check.js --piece p01');
  process.exit(2);
}

const root = path.resolve(argument('--root') || process.cwd());
const env = { ...process.env };
for (const key of Object.keys(env)) {
  if (key === 'NODE_CHANNEL_FD' || key.startsWith('NODE_TEST')) delete env[key];
}
const result = spawnSync(process.execPath, ['--test', path.join(root, 'tests', 'pieces', piece + '.test.js'), path.join(root, 'tests', 'integration.test.js')], {
  cwd: root,
  encoding: 'utf8',
  env,
});
const log = ((result.stdout || '') + '\n' + (result.stderr || '')).trim();
if (result.status !== 0) {
  console.error(log.slice(-4000));
  process.exit(result.status || 1);
}
console.log(JSON.stringify({ ok: true, piece }));
