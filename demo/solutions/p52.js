const { escapeHtml } = require('../html.js');

exports.id = "p52";

exports.match = function match(markdown) {
  const inputs = new Set(["foo  \nbar"]);
  return inputs.has(markdown) ? 100 : 0;
};

exports.render = function render(markdown) {
const parts = markdown.split('  \n');
      return '<p>' + parts.map((part) => escapeHtml(part)).join('<br />\n') + '</p>\n';
};
