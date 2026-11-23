const { escapeHtml } = require('../html.js');

exports.id = "p55";

exports.match = function match(markdown) {
  return /^- \*[^*\n]+\*$/.test(markdown) ? 60 : 0;
};

exports.render = function render(markdown) {
const text = markdown.replace(/^- /, '');
      const html = escapeHtml(text).replace(/\*([A-Za-z]+)\*/g, '<em>$1</em>');
      return '<ul>\n<li>' + html + '</li>\n</ul>\n';
};
