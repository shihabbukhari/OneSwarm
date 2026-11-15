const { escapeHtml } = require('../html.js');

exports.id = "p05";

exports.match = function match(markdown) {
  return /^## [^\n]*$/.test(markdown) ? 50 : 0;
};

exports.render = function render(markdown) {
const text = markdown.replace(/^## /, '');
      return '<h2>' + escapeHtml(text) + '</h2>\n';
};
