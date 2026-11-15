const { escapeHtml } = require('../html.js');

exports.id = "p43";

exports.match = function match(markdown) {
  return /\[[^\]\n]+\]\([^)\s]+ "[^"\n]*"\)/.test(markdown) ? 25 : 0;
};

exports.render = function render(markdown) {
const found = markdown.match(/^(.*)\[([A-Za-z]+)\]\((https?:\/\/[^)\s]+) "([^"]+)"\)(.*)$/);
      return (
        '<p>' +
        escapeHtml(found[1]) +
        '<a href="' +
        found[3] +
        '" title="' +
        escapeHtml(found[4]) +
        '">' +
        escapeHtml(found[2]) +
        '</a>' +
        escapeHtml(found[5]) +
        '</p>\n'
      );
};
