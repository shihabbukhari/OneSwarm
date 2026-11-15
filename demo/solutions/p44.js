const { escapeHtml } = require('../html.js');

exports.id = "p44";

exports.match = function match(markdown) {
  return /<https?:[^>\s]+>/.test(markdown) ? 30 : 0;
};

exports.render = function render(markdown) {
const found = markdown.match(/^(.*)<(https?:\/\/[^>\s]+)>(.*)$/);
      return '<p>' + escapeHtml(found[1]) + '<a href="' + found[2] + '">' + found[2] + '</a>' + escapeHtml(found[3]) + '</p>\n';
};
