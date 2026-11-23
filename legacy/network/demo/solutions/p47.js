const { escapeHtml } = require('../html.js');

exports.id = "p47";

exports.match = function match(markdown) {
  return /^!\[[^\]\n]*&[^\]\n]*\]\([^)\s]+\)$/.test(markdown) ? 40 : 0;
};

exports.render = function render(markdown) {
const found = markdown.match(/^!\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
      return '<p><img src="' + found[2] + '" alt="' + escapeHtml(found[1]) + '" /></p>\n';
};
