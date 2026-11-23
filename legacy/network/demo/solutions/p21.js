const { escapeHtml } = require('../html.js');

exports.id = "p21";

exports.match = function match(markdown) {
  return /^~~~\n[\s\S]*\n~~~$/.test(markdown) ? 30 : 0;
};

exports.render = function render(markdown) {
const inner = markdown.replace(/^~~~\n/, '').replace(/\n~~~$/, '');
      return '<pre><code>' + escapeHtml(inner) + '\n</code></pre>\n';
};
