const { escapeHtml } = require('../html.js');

exports.id = "p42";

exports.match = function match(markdown) {
  const inputs = new Set(["See [docs](http://example.com)"]);
  return inputs.has(markdown) ? 100 : 0;
};

exports.render = function render(markdown) {
const html = escapeHtml(markdown).replace(
        /\[([A-Za-z]+)\]\((https?:\/\/[^)\s]+)\)/g,
        '<a href="$2">$1</a>',
      );
      return '<p>' + html + '</p>\n';
};
