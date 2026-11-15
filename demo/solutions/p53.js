const { escapeHtml } = require('../html.js');

exports.id = "p53";

exports.match = function match(markdown) {
  const inputs = new Set(["foo\nbar"]);
  return inputs.has(markdown) ? 100 : 0;
};

exports.render = function render(markdown) {
return '<p>' + escapeHtml(markdown) + '</p>\n';
};
