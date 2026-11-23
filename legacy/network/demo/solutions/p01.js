const { escapeHtml } = require('../html.js');

exports.id = "p01";

exports.match = function match(markdown) {
  return /^$/.test(markdown) ? 100 : 0;
};

exports.render = function render(markdown) {
return '';
};
