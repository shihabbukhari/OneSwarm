const { escapeHtml } = require('../html.js');

exports.id = "p49";

exports.match = function match(markdown) {
  return /^[^\n]*<[^\n]*$/.test(markdown) ? 5 : 0;
};

exports.render = function render(markdown) {
return '<p>' + escapeHtml(markdown) + '</p>\n';
};
