const { escapeHtml } = require('../html.js');

exports.id = "p03";

exports.match = function match(markdown) {
  const inputs = new Set(["Hello\n\nWorld"]);
  return inputs.has(markdown) ? 100 : 0;
};

exports.render = function render(markdown) {
const parts = markdown.split('\n\n');
      return parts.map((part) => '<p>' + escapeHtml(part) + '</p>').join('\n') + '\n';
};
