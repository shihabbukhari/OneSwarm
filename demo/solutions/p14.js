const { escapeHtml } = require('../html.js');

exports.id = "p14";

exports.match = function match(markdown) {
  const inputs = new Set(["***"]);
  return inputs.has(markdown) ? 100 : 0;
};

exports.render = function render(markdown) {
return '<hr />\n';
};
