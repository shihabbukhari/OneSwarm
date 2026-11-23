const { escapeHtml } = require('../html.js');

exports.id = "p53";

exports.match = function match(markdown) {
  return /^[^\n]+\n[^\n]+$/.test(markdown) ? 3 : 0;
};

exports.render = function render(markdown) {
return '<p>' + escapeHtml(markdown) + '</p>\n';
};
