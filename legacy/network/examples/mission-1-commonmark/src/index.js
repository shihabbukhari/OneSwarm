const fs = require('fs');
const path = require('path');

function loadPieces() {
  const dir = path.join(__dirname, 'pieces');
  return fs
    .readdirSync(dir)
    .filter((name) => /^p\d+\.js$/.test(name))
    .sort()
    .map((name) => require(path.join(dir, name)));
}

function markdownToHtml(markdown) {
  const pieces = loadPieces().filter((piece) => piece && piece.STUB !== true && typeof piece.match === 'function');
  let bestScore = 0;
  const best = [];
  for (const piece of pieces) {
    const score = Number(piece.match(markdown)) || 0;
    if (score > bestScore) {
      bestScore = score;
      best.length = 0;
      best.push(piece);
    } else if (score === bestScore && score > 0) {
      best.push(piece);
    }
  }
  if (best.length !== 1) {
    const error = new Error('no unique piece for input');
    error.code = 'AMBIGUOUS';
    throw error;
  }
  return best[0].render(markdown);
}

module.exports = { markdownToHtml, loadPieces };
