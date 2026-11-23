const { escapeHtml } = require('../html.js');

exports.id = "p14";

exports.match = function match(markdown) {
  return /^\*\*\*$/.test(markdown) ? 50 : 0;
};

exports.render = function render(markdown) {
return '<hr />\n';
};
