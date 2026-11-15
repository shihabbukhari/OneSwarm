const { escapeHtml } = require('../html.js');

exports.id = "p23";

exports.match = function match(markdown) {
  return /^```\n[\s\S]*<[\s\S]*\n```$/.test(markdown) ? 40 : 0;
};

exports.render = function render(markdown) {
const inner = markdown.replace(/^```\n/, '').replace(/\n```$/, '');
      return '<pre><code>' + escapeHtml(inner) + '\n</code></pre>\n';
};
