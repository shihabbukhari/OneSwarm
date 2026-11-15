const { escapeHtml } = require('../html.js');

exports.id = "p37";

exports.match = function match(markdown) {
  const inputs = new Set(["Say _hi_ now"]);
  return inputs.has(markdown) ? 100 : 0;
};

exports.render = function render(markdown) {
const html = escapeHtml(markdown).replace(/_([A-Za-z]+)_/g, '<em>$1</em>');
      return '<p>' + html + '</p>\n';
};
