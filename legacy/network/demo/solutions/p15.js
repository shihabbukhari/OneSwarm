const { escapeHtml } = require('../html.js');

exports.id = "p15";

exports.match = function match(markdown) {
  return /^---$/.test(markdown) ? 50 : 0;
};

exports.render = function render(markdown) {
return '<hr />\n';
};
