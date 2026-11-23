const { escapeHtml } = require('../html.js');

exports.id = "p27";

exports.match = function match(markdown) {
  return /^> [^\n]*\n> [^\n]*$/.test(markdown) ? 60 : 0;
};

exports.render = function render(markdown) {
const text = markdown
        .split('\n')
        .map((line) => line.replace(/^> /, ''))
        .join('\n');
      return '<blockquote>\n<p>' + escapeHtml(text) + '</p>\n</blockquote>\n';
};
