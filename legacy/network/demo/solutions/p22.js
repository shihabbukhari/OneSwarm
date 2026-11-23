const { escapeHtml } = require('../html.js');

exports.id = "p22";

exports.match = function match(markdown) {
  return /^```\w+\n[\s\S]*\n```$/.test(markdown) ? 40 : 0;
};

exports.render = function render(markdown) {
const match = markdown.match(/^```([a-z0-9]+)\n([\s\S]*)\n```$/);
      return '<pre><code class="language-' + match[1] + '">' + escapeHtml(match[2]) + '\n</code></pre>\n';
};
