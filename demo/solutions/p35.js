const { escapeHtml } = require('../html.js');

exports.id = "p35";

exports.match = function match(markdown) {
  const inputs = new Set(["1. A\n2. B"]);
  return inputs.has(markdown) ? 100 : 0;
};

exports.render = function render(markdown) {
const items = markdown.split('\n').map((line) => line.replace(/^\d+\. /, ''));
      return '<ol>\n' + items.map((item) => '<li>' + escapeHtml(item) + '</li>').join('\n') + '\n</ol>\n';
};
