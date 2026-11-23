const { escapeHtml } = require('../html.js');

exports.id = "p16";

exports.match = function match(markdown) {
  return /^___$/.test(markdown) ? 50 : 0;
};

exports.render = function render(markdown) {
return '<hr />\n';
};
