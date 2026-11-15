const { escapeHtml } = require('../html.js');

exports.id = "p02";

exports.match = function match(markdown) {
  return /^[^\n]+$/.test(markdown) ? 1 : 0;
};

exports.render = function render(markdown) {
return '<p>' + escapeHtml(markdown) + '</p>\n';
};
