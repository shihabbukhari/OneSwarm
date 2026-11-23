const { escapeHtml } = require('../html.js');

exports.id = "p39";

exports.match = function match(markdown) {
  return /__[^_\n]+__/.test(markdown) ? 25 : 0;
};

exports.render = function render(markdown) {
const html = escapeHtml(markdown).replace(/__([A-Za-z]+)__/g, '<strong>$1</strong>');
      return '<p>' + html + '</p>\n';
};
