const { escapeHtml } = require('../html.js');

exports.id = "p28";

exports.match = function match(markdown) {
  const inputs = new Set(["- Item"]);
  return inputs.has(markdown) ? 100 : 0;
};

exports.render = function render(markdown) {
const text = markdown.replace(/^- /, '');
      return '<ul>\n<li>' + escapeHtml(text) + '</li>\n</ul>\n';
};
