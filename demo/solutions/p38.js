const { escapeHtml } = require('../html.js');

exports.id = "p38";

exports.match = function match(markdown) {
  return /\*\*[^*\n]+\*\*/.test(markdown) ? 25 : 0;
};

exports.render = function render(markdown) {
const html = escapeHtml(markdown).replace(/\*\*([A-Za-z]+)\*\*/g, '<strong>$1</strong>');
      return '<p>' + html + '</p>\n';
};
