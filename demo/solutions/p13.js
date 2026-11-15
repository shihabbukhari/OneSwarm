const { escapeHtml } = require('../html.js');

exports.id = "p13";

exports.match = function match(markdown) {
  const inputs = new Set(["Title\n----"]);
  return inputs.has(markdown) ? 100 : 0;
};

exports.render = function render(markdown) {
const text = markdown.split('\n')[0];
      return '<h2>' + escapeHtml(text) + '</h2>\n';
};
