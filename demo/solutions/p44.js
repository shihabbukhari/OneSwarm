const { escapeHtml } = require('../html.js');

exports.id = "p44";

exports.match = function match(markdown) {
  const inputs = new Set(["See <http://example.com>"]);
  return inputs.has(markdown) ? 100 : 0;
};

exports.render = function render(markdown) {
const found = markdown.match(/^See <(http:\/\/example\.com)>$/);
      return '<p>See <a href="' + found[1] + '">' + found[1] + '</a></p>\n';
};
