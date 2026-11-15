const { escapeHtml } = require('../html.js');

exports.id = "p37";

exports.match = function match(markdown) {
  return /(^|[^_])_[^_\s][^_\n]*_(?!_)/.test(markdown) ? 20 : 0;
};

exports.render = function render(markdown) {
const html = escapeHtml(markdown).replace(/_([A-Za-z]+)_/g, '<em>$1</em>');
      return '<p>' + html + '</p>\n';
};
