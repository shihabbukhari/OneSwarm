const { escapeHtml } = require('../html.js');

exports.id = "p54";

exports.match = function match(markdown) {
  return /^# [^\n]*\*[^*\n]+\*[^\n]*$/.test(markdown) ? 60 : 0;
};

exports.render = function render(markdown) {
const text = markdown.replace(/^# /, '');
      const html = escapeHtml(text).replace(/\*([A-Za-z]+)\*/g, '<em>$1</em>');
      return '<h1>' + html + '</h1>\n';
};
