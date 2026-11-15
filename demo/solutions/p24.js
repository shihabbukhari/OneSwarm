const { escapeHtml } = require('../html.js');

exports.id = "p24";

exports.match = function match(markdown) {
  const inputs = new Set(["```\n* * *\n```"]);
  return inputs.has(markdown) ? 100 : 0;
};

exports.render = function render(markdown) {
const inner = markdown.replace(/^```\n/, '').replace(/\n```$/, '');
      return '<pre><code>' + escapeHtml(inner) + '\n</code></pre>\n';
};
