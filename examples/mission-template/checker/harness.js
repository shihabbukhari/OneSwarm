// Runs submitted piece code inside Node's permission sandbox.
// It can read src/ and this file only. It cannot read tests/, start processes, or open workers.
// It only reports what the code returned. The checker compares results in a different process.
const path = require('path');

const root = path.resolve(__dirname, '..');
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  raw += chunk;
});
process.stdin.on('end', () => {
  const job = JSON.parse(raw);
  const results = { direct: [], dispatched: [] };
  let piece = null;
  let lib = null;
  try {
    piece = require(path.join(root, 'src', 'pieces', `${job.piece}.js`));
    lib = require(path.join(root, 'src', 'index.js'));
  } catch (error) {
    results.loadError = String(error && error.message ? error.message : error).slice(0, 300);
  }
  const run = (fn, input) => {
    try {
      const value = fn(input);
      return typeof value === 'string' ? { value } : { error: 'returned a non-string' };
    } catch (error) {
      return { error: String(error && error.message ? error.message : error).slice(0, 200) };
    }
  };
  if (!results.loadError) {
    for (const input of job.direct) results.direct.push(run((md) => piece.render(md), input));
    for (const input of job.dispatched) results.dispatched.push(run((md) => lib.markdownToHtml(md), input));
  }
  process.stdout.write(`\n${job.marker}${JSON.stringify(results)}\n`);
});
