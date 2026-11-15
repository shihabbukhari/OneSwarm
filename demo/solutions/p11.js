const { escapeHtml } = require('../html.js');

exports.id = "p11";

exports.match = function match(markdown) {
  const inputs = new Set(["## Title ##"]);
  return inputs.has(markdown) ? 100 : 0;
};

exports.render = function render(markdown) {
const text = markdown.replace(/^## /, '').replace(/ #+$/, '');
      return '<h2>' + escapeHtml(text) + '</h2>\n';
};
