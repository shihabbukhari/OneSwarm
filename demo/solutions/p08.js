const { escapeHtml } = require('../html.js');

exports.id = "p08";

exports.match = function match(markdown) {
  const inputs = new Set(["##### Note"]);
  return inputs.has(markdown) ? 100 : 0;
};

exports.render = function render(markdown) {
const text = markdown.replace(/^##### /, '');
      return '<h5>' + escapeHtml(text) + '</h5>\n';
};
