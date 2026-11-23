const { escapeHtml } = require('../html.js');

exports.id = "p26";

exports.match = function match(markdown) {
  return /^> > [^\n]*$/.test(markdown) ? 60 : 0;
};

exports.render = function render(markdown) {
const text = markdown.replace(/^> > /, '');
      return '<blockquote>\n<blockquote>\n<p>' + escapeHtml(text) + '</p>\n</blockquote>\n</blockquote>\n';
};
