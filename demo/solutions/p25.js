const { escapeHtml } = require('../html.js');

exports.id = "p25";

exports.match = function match(markdown) {
  return /^> [^>\n][^\n]*$/.test(markdown) ? 50 : 0;
};

exports.render = function render(markdown) {
const text = markdown.replace(/^> /, '');
      return '<blockquote>\n<p>' + escapeHtml(text) + '</p>\n</blockquote>\n';
};
