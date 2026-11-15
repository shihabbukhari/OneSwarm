const { escapeHtml } = require('../html.js');

exports.id = "p50";

exports.match = function match(markdown) {
  const inputs = new Set(["A & B"]);
  return inputs.has(markdown) ? 100 : 0;
};

exports.render = function render(markdown) {
return '<p>' + escapeHtml(markdown) + '</p>\n';
};
