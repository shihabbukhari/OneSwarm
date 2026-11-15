const { escapeHtml } = require('../html.js');

exports.id = "p35";

exports.match = function match(markdown) {
  return /^\d+\. [^\n]+\n\d+\. [^\n]+$/.test(markdown) ? 60 : 0;
};

exports.render = function render(markdown) {
const items = markdown.split('\n').map((line) => line.replace(/^\d+\. /, ''));
      return '<ol>\n' + items.map((item) => '<li>' + escapeHtml(item) + '</li>').join('\n') + '\n</ol>\n';
};
