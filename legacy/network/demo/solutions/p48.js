const { escapeHtml } = require('../html.js');

exports.id = "p48";

exports.match = function match(markdown) {
  return /\\[*_`\\]/.test(markdown) ? 20 : 0;
};

exports.render = function render(markdown) {
const text = markdown.replace(/\\\*/g, '*');
      return '<p>' + escapeHtml(text) + '</p>\n';
};
