const { escapeHtml } = require('../html.js');

exports.id = "p07";

exports.match = function match(markdown) {
  const inputs = new Set(["#### Detail"]);
  return inputs.has(markdown) ? 100 : 0;
};

exports.render = function render(markdown) {
const text = markdown.replace(/^#### /, '');
      return '<h4>' + escapeHtml(text) + '</h4>\n';
};
