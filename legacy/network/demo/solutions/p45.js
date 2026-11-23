const { escapeHtml } = require('../html.js');

exports.id = "p45";

exports.match = function match(markdown) {
  return /!\[[^\]\n]*\]\([^)\s]+\)/.test(markdown) ? 30 : 0;
};

exports.render = function render(markdown) {
const found = markdown.match(/^(.*)!\[([A-Za-z]+)\]\((https?:\/\/[^)\s]+)\)$/);
      return '<p>' + escapeHtml(found[1]) + '<img src="' + found[3] + '" alt="' + escapeHtml(found[2]) + '" /></p>\n';
};
