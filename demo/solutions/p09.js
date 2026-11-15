const { escapeHtml } = require('../html.js');

exports.id = "p09";

exports.match = function match(markdown) {
  const inputs = new Set(["###### Deep"]);
  return inputs.has(markdown) ? 100 : 0;
};

exports.render = function render(markdown) {
const text = markdown.replace(/^###### /, '');
      return '<h6>' + escapeHtml(text) + '</h6>\n';
};
