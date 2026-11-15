const { escapeHtml } = require('../html.js');

exports.id = "p19";

exports.match = function match(markdown) {
  const inputs = new Set(["    code"]);
  return inputs.has(markdown) ? 100 : 0;
};

exports.render = function render(markdown) {
const text = markdown.replace(/^ {4}/, '');
      return '<pre><code>' + escapeHtml(text) + '\n</code></pre>\n';
};
