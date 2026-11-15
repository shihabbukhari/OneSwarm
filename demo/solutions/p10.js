const { escapeHtml } = require('../html.js');

exports.id = "p10";

exports.match = function match(markdown) {
  return /^# [^\n]*\s#+$/.test(markdown) ? 60 : 0;
};

exports.render = function render(markdown) {
const text = markdown.replace(/^# /, '').replace(/ #+$/, '');
      return '<h1>' + escapeHtml(text) + '</h1>\n';
};
