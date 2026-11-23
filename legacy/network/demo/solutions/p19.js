const { escapeHtml } = require('../html.js');

exports.id = "p19";

exports.match = function match(markdown) {
  return /^ {4}\S[^\n]*$/.test(markdown) ? 50 : 0;
};

exports.render = function render(markdown) {
const text = markdown.replace(/^ {4}/, '');
      return '<pre><code>' + escapeHtml(text) + '\n</code></pre>\n';
};
