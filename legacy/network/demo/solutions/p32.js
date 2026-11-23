const { escapeHtml } = require('../html.js');

exports.id = "p32";

exports.match = function match(markdown) {
  return /^1\. [^\n]*$/.test(markdown) ? 40 : 0;
};

exports.render = function render(markdown) {
const text = markdown.replace(/^\d+\. /, '');
      return '<ol>\n<li>' + escapeHtml(text) + '</li>\n</ol>\n';
};
