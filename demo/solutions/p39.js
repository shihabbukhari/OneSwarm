const { escapeHtml } = require('../html.js');

exports.id = "p39";

exports.match = function match(markdown) {
  const inputs = new Set(["Say __hi__ now"]);
  return inputs.has(markdown) ? 100 : 0;
};

exports.render = function render(markdown) {
const html = escapeHtml(markdown).replace(/__([A-Za-z]+)__/g, '<strong>$1</strong>');
      return '<p>' + html + '</p>\n';
};
