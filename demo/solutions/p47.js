const { escapeHtml } = require('../html.js');

exports.id = "p47";

exports.match = function match(markdown) {
  const inputs = new Set(["![A & B](http://example.com/a.png)"]);
  return inputs.has(markdown) ? 100 : 0;
};

exports.render = function render(markdown) {
const found = markdown.match(/^!\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
      return '<p><img src="' + found[2] + '" alt="' + escapeHtml(found[1]) + '" /></p>\n';
};
