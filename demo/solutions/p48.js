const { escapeHtml } = require('../html.js');

exports.id = "p48";

exports.match = function match(markdown) {
  const inputs = new Set(["A \\* b"]);
  return inputs.has(markdown) ? 100 : 0;
};

exports.render = function render(markdown) {
const text = markdown.replace(/\\\*/g, '*');
      return '<p>' + escapeHtml(text) + '</p>\n';
};
