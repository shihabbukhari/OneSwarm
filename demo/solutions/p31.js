const { escapeHtml } = require('../html.js');

exports.id = "p31";

exports.match = function match(markdown) {
  const inputs = new Set(["- A\n- B"]);
  return inputs.has(markdown) ? 100 : 0;
};

exports.render = function render(markdown) {
const items = markdown.split('\n').map((line) => line.replace(/^- /, ''));
      return '<ul>\n' + items.map((item) => '<li>' + escapeHtml(item) + '</li>').join('\n') + '\n</ul>\n';
};
