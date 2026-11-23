const { escapeHtml } = require('../html.js');

exports.id = "p31";

exports.match = function match(markdown) {
  return /^- [^\n]+\n- [^\n]+$/.test(markdown) ? 60 : 0;
};

exports.render = function render(markdown) {
const items = markdown.split('\n').map((line) => line.replace(/^- /, ''));
      return '<ul>\n' + items.map((item) => '<li>' + escapeHtml(item) + '</li>').join('\n') + '\n</ul>\n';
};
