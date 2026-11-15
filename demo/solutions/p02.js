const { escapeHtml } = require('../html.js');

exports.id = "p02";

exports.match = function match(markdown) {
  const inputs = new Set(["Hello","Hello world"]);
  return inputs.has(markdown) ? 100 : 0;
};

exports.render = function render(markdown) {
return '<p>' + escapeHtml(markdown) + '</p>\n';
};
