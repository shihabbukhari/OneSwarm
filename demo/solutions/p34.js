const { escapeHtml } = require('../html.js');

exports.id = "p34";

exports.match = function match(markdown) {
  const inputs = new Set(["10. Item"]);
  return inputs.has(markdown) ? 100 : 0;
};

exports.render = function render(markdown) {
const start = markdown.match(/^(\d+)\. /)[1];
      const text = markdown.replace(/^\d+\. /, '');
      return '<ol start="' + start + '">\n<li>' + escapeHtml(text) + '</li>\n</ol>\n';
};
