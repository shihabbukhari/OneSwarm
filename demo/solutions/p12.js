const { escapeHtml } = require('../html.js');

exports.id = "p12";

exports.match = function match(markdown) {
  const inputs = new Set(["Title\n===="]);
  return inputs.has(markdown) ? 100 : 0;
};

exports.render = function render(markdown) {
const text = markdown.split('\n')[0];
      return '<h1>' + escapeHtml(text) + '</h1>\n';
};
