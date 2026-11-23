const { escapeHtml } = require('../html.js');

exports.id = "p06";

exports.match = function match(markdown) {
  return /^### [^\n]*$/.test(markdown) ? 50 : 0;
};

exports.render = function render(markdown) {
const text = markdown.replace(/^### /, '');
      return '<h3>' + escapeHtml(text) + '</h3>\n';
};
