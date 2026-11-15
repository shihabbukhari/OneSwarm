const { escapeHtml } = require('../html.js');

exports.id = "p16";

exports.match = function match(markdown) {
  const inputs = new Set(["___"]);
  return inputs.has(markdown) ? 100 : 0;
};

exports.render = function render(markdown) {
return '<hr />\n';
};
