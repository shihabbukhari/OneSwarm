const { escapeHtml } = require('../html.js');

exports.id = "p09";

exports.match = function match(markdown) {
  return /^###### [^\n]*$/.test(markdown) ? 50 : 0;
};

exports.render = function render(markdown) {
const text = markdown.replace(/^###### /, '');
      return '<h6>' + escapeHtml(text) + '</h6>\n';
};
