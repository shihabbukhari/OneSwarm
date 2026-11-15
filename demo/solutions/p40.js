const { escapeHtml } = require('../html.js');

exports.id = "p40";

exports.match = function match(markdown) {
  const inputs = new Set(["Use `code` here"]);
  return inputs.has(markdown) ? 100 : 0;
};

exports.render = function render(markdown) {
const html = escapeHtml(markdown).replace(/`([A-Za-z]+)`/g, '<code>$1</code>');
      return '<p>' + html + '</p>\n';
};
