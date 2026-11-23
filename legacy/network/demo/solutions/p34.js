const { escapeHtml } = require('../html.js');

exports.id = "p34";

exports.match = function match(markdown) {
  return /^\d{2,}\. [^\n]*$/.test(markdown) ? 40 : 0;
};

exports.render = function render(markdown) {
const start = markdown.match(/^(\d+)\. /)[1];
      const text = markdown.replace(/^\d+\. /, '');
      return '<ol start="' + start + '">\n<li>' + escapeHtml(text) + '</li>\n</ol>\n';
};
