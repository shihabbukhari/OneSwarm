const { escapeHtml } = require('../html.js');

exports.id = "p25";

exports.match = function match(markdown) {
  const inputs = new Set(["> Quote"]);
  return inputs.has(markdown) ? 100 : 0;
};

exports.render = function render(markdown) {
const text = markdown.replace(/^> /, '');
      return '<blockquote>\n<p>' + escapeHtml(text) + '</p>\n</blockquote>\n';
};
