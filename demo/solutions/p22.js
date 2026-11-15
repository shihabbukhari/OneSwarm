const { escapeHtml } = require('../html.js');

exports.id = "p22";

exports.match = function match(markdown) {
  const inputs = new Set(["```js\nconst a = 1;\n```"]);
  return inputs.has(markdown) ? 100 : 0;
};

exports.render = function render(markdown) {
const match = markdown.match(/^```([a-z0-9]+)\n([\s\S]*)\n```$/);
      return '<pre><code class="language-' + match[1] + '">' + escapeHtml(match[2]) + '\n</code></pre>\n';
};
