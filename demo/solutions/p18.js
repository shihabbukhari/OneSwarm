const { escapeHtml } = require('../html.js');

exports.id = "p18";

exports.match = function match(markdown) {
  return /^\*{4,}$/.test(markdown) ? 50 : 0;
};

exports.render = function render(markdown) {
return '<hr />\n';
};
