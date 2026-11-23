const { escapeHtml } = require('../html.js');

exports.id = "p36";

exports.match = function match(markdown) {
  return /(^|[^*])\*[^*\s][^*\n]*\*(?!\*)/.test(markdown) ? 20 : 0;
};

exports.render = function render(markdown) {
const html = escapeHtml(markdown).replace(/\*([A-Za-z]+)\*/g, '<em>$1</em>');
      return '<p>' + html + '</p>\n';
};
