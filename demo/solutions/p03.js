const { escapeHtml } = require('../html.js');

exports.id = "p03";

exports.match = function match(markdown) {
  return /^[^\n]+\n\n[^\n]+$/.test(markdown) ? 10 : 0;
};

exports.render = function render(markdown) {
const parts = markdown.split('\n\n');
      return parts.map((part) => '<p>' + escapeHtml(part) + '</p>').join('\n') + '\n';
};
