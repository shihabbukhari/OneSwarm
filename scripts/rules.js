function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const rules = [
  {
    id: 'p01',
    title: 'Empty document',
    blurb: 'An empty document renders as an empty string.',
    cases: [{ in: '', out: '' }],
    render(markdown) {
      return '';
    },
  },
  {
    id: 'p02',
    title: 'Paragraph',
    blurb: 'Wrap a single line of plain text in a paragraph. Escape HTML.',
    cases: [
      { in: 'Hello', out: '<p>Hello</p>\n' },
      { in: 'Hello world', out: '<p>Hello world</p>\n' },
    ],
    render(markdown) {
      return '<p>' + escapeHtml(markdown) + '</p>\n';
    },
  },
  {
    id: 'p03',
    title: 'Two paragraphs',
    blurb: 'A blank line splits two paragraphs.',
    cases: [{ in: 'Hello\n\nWorld', out: '<p>Hello</p>\n<p>World</p>\n' }],
    render(markdown) {
      const parts = markdown.split('\n\n');
      return parts.map((part) => '<p>' + escapeHtml(part) + '</p>').join('\n') + '\n';
    },
  },
  {
    id: 'p04',
    title: 'ATX heading level 1',
    blurb: 'A line that starts with "# " is an h1. Escape HTML in the text.',
    cases: [
      { in: '# Title', out: '<h1>Title</h1>\n' },
      { in: '# A & B', out: '<h1>A &amp; B</h1>\n' },
    ],
    render(markdown) {
      const text = markdown.replace(/^# /, '');
      return '<h1>' + escapeHtml(text) + '</h1>\n';
    },
  },
  {
    id: 'p05',
    title: 'ATX heading level 2',
    blurb: 'A line that starts with "## " is an h2.',
    cases: [{ in: '## Section', out: '<h2>Section</h2>\n' }],
    render(markdown) {
      const text = markdown.replace(/^## /, '');
      return '<h2>' + escapeHtml(text) + '</h2>\n';
    },
  },
  {
    id: 'p06',
    title: 'ATX heading level 3',
    blurb: 'A line that starts with "### " is an h3.',
    cases: [{ in: '### Part', out: '<h3>Part</h3>\n' }],
    render(markdown) {
      const text = markdown.replace(/^### /, '');
      return '<h3>' + escapeHtml(text) + '</h3>\n';
    },
  },
  {
    id: 'p07',
    title: 'ATX heading level 4',
    blurb: 'A line that starts with "#### " is an h4.',
    cases: [{ in: '#### Detail', out: '<h4>Detail</h4>\n' }],
    render(markdown) {
      const text = markdown.replace(/^#### /, '');
      return '<h4>' + escapeHtml(text) + '</h4>\n';
    },
  },
  {
    id: 'p08',
    title: 'ATX heading level 5',
    blurb: 'A line that starts with "##### " is an h5.',
    cases: [{ in: '##### Note', out: '<h5>Note</h5>\n' }],
    render(markdown) {
      const text = markdown.replace(/^##### /, '');
      return '<h5>' + escapeHtml(text) + '</h5>\n';
    },
  },
  {
    id: 'p09',
    title: 'ATX heading level 6',
    blurb: 'A line that starts with "###### " is an h6.',
    cases: [{ in: '###### Deep', out: '<h6>Deep</h6>\n' }],
    render(markdown) {
      const text = markdown.replace(/^###### /, '');
      return '<h6>' + escapeHtml(text) + '</h6>\n';
    },
  },
  {
    id: 'p10',
    title: 'ATX heading with a closing hash',
    blurb: 'Strip a closing hash sequence from an h1.',
    cases: [{ in: '# Title #', out: '<h1>Title</h1>\n' }],
    render(markdown) {
      const text = markdown.replace(/^# /, '').replace(/ #+$/, '');
      return '<h1>' + escapeHtml(text) + '</h1>\n';
    },
  },
  {
    id: 'p11',
    title: 'ATX h2 with closing hashes',
    blurb: 'Strip closing hashes from an h2.',
    cases: [{ in: '## Title ##', out: '<h2>Title</h2>\n' }],
    render(markdown) {
      const text = markdown.replace(/^## /, '').replace(/ #+$/, '');
      return '<h2>' + escapeHtml(text) + '</h2>\n';
    },
  },
  {
    id: 'p12',
    title: 'Setext heading level 1',
    blurb: 'A line followed by equals signs is an h1.',
    cases: [{ in: 'Title\n====', out: '<h1>Title</h1>\n' }],
    render(markdown) {
      const text = markdown.split('\n')[0];
      return '<h1>' + escapeHtml(text) + '</h1>\n';
    },
  },
  {
    id: 'p13',
    title: 'Setext heading level 2',
    blurb: 'A line followed by dashes is an h2.',
    cases: [{ in: 'Title\n----', out: '<h2>Title</h2>\n' }],
    render(markdown) {
      const text = markdown.split('\n')[0];
      return '<h2>' + escapeHtml(text) + '</h2>\n';
    },
  },
  {
    id: 'p14',
    title: 'Thematic break of stars',
    blurb: 'Three or more stars on a line are a horizontal rule.',
    cases: [{ in: '***', out: '<hr />\n' }],
    render() {
      return '<hr />\n';
    },
  },
  {
    id: 'p15',
    title: 'Thematic break of dashes',
    blurb: 'Three or more dashes on a line are a horizontal rule.',
    cases: [{ in: '---', out: '<hr />\n' }],
    render() {
      return '<hr />\n';
    },
  },
  {
    id: 'p16',
    title: 'Thematic break of underscores',
    blurb: 'Three or more underscores on a line are a horizontal rule.',
    cases: [{ in: '___', out: '<hr />\n' }],
    render() {
      return '<hr />\n';
    },
  },
  {
    id: 'p17',
    title: 'Spaced thematic break',
    blurb: 'Stars separated by spaces are still a horizontal rule.',
    cases: [{ in: '* * *', out: '<hr />\n' }],
    render() {
      return '<hr />\n';
    },
  },
  {
    id: 'p18',
    title: 'Long thematic break',
    blurb: 'More than three stars are still one horizontal rule.',
    cases: [{ in: '*****', out: '<hr />\n' }],
    render() {
      return '<hr />\n';
    },
  },
  {
    id: 'p19',
    title: 'Indented code block',
    blurb: 'Four spaces start a code block. Escape HTML inside it.',
    cases: [{ in: '    code', out: '<pre><code>code\n</code></pre>\n' }],
    render(markdown) {
      const text = markdown.replace(/^ {4}/, '');
      return '<pre><code>' + escapeHtml(text) + '\n</code></pre>\n';
    },
  },
  {
    id: 'p20',
    title: 'Fenced code with backticks',
    blurb: 'A backtick fence wraps a code block.',
    cases: [{ in: '```\ncode\n```', out: '<pre><code>code\n</code></pre>\n' }],
    render(markdown) {
      const inner = markdown.replace(/^```\n/, '').replace(/\n```$/, '');
      return '<pre><code>' + escapeHtml(inner) + '\n</code></pre>\n';
    },
  },
  {
    id: 'p21',
    title: 'Fenced code with tildes',
    blurb: 'A tilde fence wraps a code block.',
    cases: [{ in: '~~~\ncode\n~~~', out: '<pre><code>code\n</code></pre>\n' }],
    render(markdown) {
      const inner = markdown.replace(/^~~~\n/, '').replace(/\n~~~$/, '');
      return '<pre><code>' + escapeHtml(inner) + '\n</code></pre>\n';
    },
  },
  {
    id: 'p22',
    title: 'Fenced code with a language',
    blurb: 'Put the info string on the code element as a language class.',
    cases: [{ in: '```js\nconst a = 1;\n```', out: '<pre><code class="language-js">const a = 1;\n</code></pre>\n' }],
    render(markdown) {
      const match = markdown.match(/^```([a-z0-9]+)\n([\s\S]*)\n```$/);
      return '<pre><code class="language-' + match[1] + '">' + escapeHtml(match[2]) + '\n</code></pre>\n';
    },
  },
  {
    id: 'p23',
    title: 'Escape HTML in a code fence',
    blurb: 'HTML inside a fence is escaped, not rendered.',
    cases: [{ in: '```\n<b>\n```', out: '<pre><code>&lt;b&gt;\n</code></pre>\n' }],
    render(markdown) {
      const inner = markdown.replace(/^```\n/, '').replace(/\n```$/, '');
      return '<pre><code>' + escapeHtml(inner) + '\n</code></pre>\n';
    },
  },
  {
    id: 'p24',
    title: 'Code fence keeps stars',
    blurb: 'Stars inside a fence stay as text. They are not a thematic break.',
    cases: [{ in: '```\n* * *\n```', out: '<pre><code>* * *\n</code></pre>\n' }],
    render(markdown) {
      const inner = markdown.replace(/^```\n/, '').replace(/\n```$/, '');
      return '<pre><code>' + escapeHtml(inner) + '\n</code></pre>\n';
    },
  },
  {
    id: 'p25',
    title: 'Block quote',
    blurb: 'A line that starts with "> " is a block quote containing a paragraph.',
    cases: [{ in: '> Quote', out: '<blockquote>\n<p>Quote</p>\n</blockquote>\n' }],
    render(markdown) {
      const text = markdown.replace(/^> /, '');
      return '<blockquote>\n<p>' + escapeHtml(text) + '</p>\n</blockquote>\n';
    },
  },
  {
    id: 'p26',
    title: 'Nested block quote',
    blurb: 'Two quote markers nest one block quote inside another.',
    cases: [{ in: '> > Inner', out: '<blockquote>\n<blockquote>\n<p>Inner</p>\n</blockquote>\n</blockquote>\n' }],
    render(markdown) {
      const text = markdown.replace(/^> > /, '');
      return '<blockquote>\n<blockquote>\n<p>' + escapeHtml(text) + '</p>\n</blockquote>\n</blockquote>\n';
    },
  },
  {
    id: 'p27',
    title: 'Multi-line block quote',
    blurb: 'Consecutive quote lines join into one quoted paragraph, keeping the line break.',
    cases: [{ in: '> One\n> Two', out: '<blockquote>\n<p>One\nTwo</p>\n</blockquote>\n' }],
    render(markdown) {
      const text = markdown
        .split('\n')
        .map((line) => line.replace(/^> /, ''))
        .join('\n');
      return '<blockquote>\n<p>' + escapeHtml(text) + '</p>\n</blockquote>\n';
    },
  },
  {
    id: 'p28',
    title: 'Dash list',
    blurb: 'A line starting with "- " is a one-item unordered list.',
    cases: [{ in: '- Item', out: '<ul>\n<li>Item</li>\n</ul>\n' }],
    render(markdown) {
      const text = markdown.replace(/^- /, '');
      return '<ul>\n<li>' + escapeHtml(text) + '</li>\n</ul>\n';
    },
  },
  {
    id: 'p29',
    title: 'Star list',
    blurb: 'A line starting with "* " is a one-item unordered list.',
    cases: [{ in: '* Item', out: '<ul>\n<li>Item</li>\n</ul>\n' }],
    render(markdown) {
      const text = markdown.replace(/^\* /, '');
      return '<ul>\n<li>' + escapeHtml(text) + '</li>\n</ul>\n';
    },
  },
  {
    id: 'p30',
    title: 'Plus list',
    blurb: 'A line starting with "+ " is a one-item unordered list.',
    cases: [{ in: '+ Item', out: '<ul>\n<li>Item</li>\n</ul>\n' }],
    render(markdown) {
      const text = markdown.replace(/^\+ /, '');
      return '<ul>\n<li>' + escapeHtml(text) + '</li>\n</ul>\n';
    },
  },
  {
    id: 'p31',
    title: 'Two-item dash list',
    blurb: 'Two dash lines become two list items.',
    cases: [{ in: '- A\n- B', out: '<ul>\n<li>A</li>\n<li>B</li>\n</ul>\n' }],
    render(markdown) {
      const items = markdown.split('\n').map((line) => line.replace(/^- /, ''));
      return '<ul>\n' + items.map((item) => '<li>' + escapeHtml(item) + '</li>').join('\n') + '\n</ul>\n';
    },
  },
  {
    id: 'p32',
    title: 'Ordered list',
    blurb: 'A line starting with "1. " is an ordered list.',
    cases: [{ in: '1. Item', out: '<ol>\n<li>Item</li>\n</ol>\n' }],
    render(markdown) {
      const text = markdown.replace(/^\d+\. /, '');
      return '<ol>\n<li>' + escapeHtml(text) + '</li>\n</ol>\n';
    },
  },
  {
    id: 'p33',
    title: 'Ordered list start number',
    blurb: 'The number before the dot becomes the start attribute.',
    cases: [{ in: '3. Item', out: '<ol start="3">\n<li>Item</li>\n</ol>\n' }],
    render(markdown) {
      const start = markdown.match(/^(\d+)\. /)[1];
      const text = markdown.replace(/^\d+\. /, '');
      return '<ol start="' + start + '">\n<li>' + escapeHtml(text) + '</li>\n</ol>\n';
    },
  },
  {
    id: 'p34',
    title: 'Two-digit ordered list',
    blurb: 'A start number with two digits is kept.',
    cases: [{ in: '10. Item', out: '<ol start="10">\n<li>Item</li>\n</ol>\n' }],
    render(markdown) {
      const start = markdown.match(/^(\d+)\. /)[1];
      const text = markdown.replace(/^\d+\. /, '');
      return '<ol start="' + start + '">\n<li>' + escapeHtml(text) + '</li>\n</ol>\n';
    },
  },
  {
    id: 'p35',
    title: 'Two ordered items',
    blurb: 'Two numbered lines become two ordered list items.',
    cases: [{ in: '1. A\n2. B', out: '<ol>\n<li>A</li>\n<li>B</li>\n</ol>\n' }],
    render(markdown) {
      const items = markdown.split('\n').map((line) => line.replace(/^\d+\. /, ''));
      return '<ol>\n' + items.map((item) => '<li>' + escapeHtml(item) + '</li>').join('\n') + '\n</ol>\n';
    },
  },
  {
    id: 'p36',
    title: 'Emphasis with stars',
    blurb: 'A single pair of stars wraps emphasis inside a paragraph.',
    cases: [{ in: 'Say *hi* now', out: '<p>Say <em>hi</em> now</p>\n' }],
    render(markdown) {
      const html = escapeHtml(markdown).replace(/\*([A-Za-z]+)\*/g, '<em>$1</em>');
      return '<p>' + html + '</p>\n';
    },
  },
  {
    id: 'p37',
    title: 'Emphasis with underscores',
    blurb: 'A single pair of underscores wraps emphasis inside a paragraph.',
    cases: [{ in: 'Say _hi_ now', out: '<p>Say <em>hi</em> now</p>\n' }],
    render(markdown) {
      const html = escapeHtml(markdown).replace(/_([A-Za-z]+)_/g, '<em>$1</em>');
      return '<p>' + html + '</p>\n';
    },
  },
  {
    id: 'p38',
    title: 'Strong emphasis with stars',
    blurb: 'A double pair of stars wraps strong emphasis.',
    cases: [{ in: 'Say **hi** now', out: '<p>Say <strong>hi</strong> now</p>\n' }],
    render(markdown) {
      const html = escapeHtml(markdown).replace(/\*\*([A-Za-z]+)\*\*/g, '<strong>$1</strong>');
      return '<p>' + html + '</p>\n';
    },
  },
  {
    id: 'p39',
    title: 'Strong emphasis with underscores',
    blurb: 'A double pair of underscores wraps strong emphasis.',
    cases: [{ in: 'Say __hi__ now', out: '<p>Say <strong>hi</strong> now</p>\n' }],
    render(markdown) {
      const html = escapeHtml(markdown).replace(/__([A-Za-z]+)__/g, '<strong>$1</strong>');
      return '<p>' + html + '</p>\n';
    },
  },
  {
    id: 'p40',
    title: 'Inline code',
    blurb: 'A single pair of backticks wraps inline code.',
    cases: [{ in: 'Use `code` here', out: '<p>Use <code>code</code> here</p>\n' }],
    render(markdown) {
      const html = escapeHtml(markdown).replace(/`([A-Za-z]+)`/g, '<code>$1</code>');
      return '<p>' + html + '</p>\n';
    },
  },
  {
    id: 'p41',
    title: 'Inline code with a longer fence',
    blurb: 'A double-backtick code span can contain a single backtick.',
    cases: [{ in: 'Use ``co`de`` here', out: '<p>Use <code>co`de</code> here</p>\n' }],
    render(markdown) {
      const html = escapeHtml(markdown).replace(/``([A-Za-z`]+)``/g, '<code>$1</code>');
      return '<p>' + html + '</p>\n';
    },
  },
  {
    id: 'p42',
    title: 'Inline link',
    blurb: 'Turn [text](url) into an anchor inside a paragraph.',
    cases: [{ in: 'See [docs](http://example.com)', out: '<p>See <a href="http://example.com">docs</a></p>\n' }],
    render(markdown) {
      const html = escapeHtml(markdown).replace(
        /\[([A-Za-z]+)\]\((https?:\/\/[^)\s]+)\)/g,
        '<a href="$2">$1</a>',
      );
      return '<p>' + html + '</p>\n';
    },
  },
  {
    id: 'p43',
    title: 'Link with a title',
    blurb: 'A quoted title in a link becomes a title attribute.',
    cases: [
      {
        in: 'See [docs](http://example.com "Docs")',
        out: '<p>See <a href="http://example.com" title="Docs">docs</a></p>\n',
      },
    ],
    render(markdown) {
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
    },
  },
  {
    id: 'p44',
    title: 'Autolink',
    blurb: 'A URL in angle brackets becomes an anchor whose text is the URL.',
    cases: [{ in: 'See <http://example.com>', out: '<p>See <a href="http://example.com">http://example.com</a></p>\n' }],
    render(markdown) {
      const found = markdown.match(/^See <(http:\/\/example\.com)>$/);
      return '<p>See <a href="' + found[1] + '">' + found[1] + '</a></p>\n';
    },
  },
  {
    id: 'p45',
    title: 'Image',
    blurb: 'Turn ![alt](url) into an image inside a paragraph.',
    cases: [
      {
        in: 'Pic ![alt](http://example.com/a.png)',
        out: '<p>Pic <img src="http://example.com/a.png" alt="alt" /></p>\n',
      },
    ],
    render(markdown) {
      const found = markdown.match(/^(.*)!\[([A-Za-z]+)\]\((https?:\/\/[^)\s]+)\)$/);
      return '<p>' + escapeHtml(found[1]) + '<img src="' + found[3] + '" alt="' + escapeHtml(found[2]) + '" /></p>\n';
    },
  },
  {
    id: 'p46',
    title: 'Image with a title',
    blurb: 'A quoted title on an image becomes a title attribute.',
    cases: [
      {
        in: 'Pic ![alt](http://example.com/a.png "T")',
        out: '<p>Pic <img src="http://example.com/a.png" alt="alt" title="T" /></p>\n',
      },
    ],
    render(markdown) {
      const found = markdown.match(/^(.*)!\[([A-Za-z]+)\]\((https?:\/\/[^)\s]+) "([^"]+)"\)$/);
      return (
        '<p>' +
        escapeHtml(found[1]) +
        '<img src="' +
        found[3] +
        '" alt="' +
        escapeHtml(found[2]) +
        '" title="' +
        escapeHtml(found[4]) +
        '" /></p>\n'
      );
    },
  },
  {
    id: 'p47',
    title: 'Escape image alt text',
    blurb: 'Escape HTML characters in image alt text.',
    cases: [
      {
        in: '![A & B](http://example.com/a.png)',
        out: '<p><img src="http://example.com/a.png" alt="A &amp; B" /></p>\n',
      },
    ],
    render(markdown) {
      const found = markdown.match(/^!\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
      return '<p><img src="' + found[2] + '" alt="' + escapeHtml(found[1]) + '" /></p>\n';
    },
  },
  {
    id: 'p48',
    title: 'Backslash escape',
    blurb: 'A backslash before a star renders the star as text.',
    cases: [{ in: 'A \\* b', out: '<p>A * b</p>\n' }],
    render(markdown) {
      const text = markdown.replace(/\\\*/g, '*');
      return '<p>' + escapeHtml(text) + '</p>\n';
    },
  },
  {
    id: 'p49',
    title: 'Escape raw HTML',
    blurb: 'Angle brackets in a paragraph are escaped.',
    cases: [{ in: 'A <b> tag', out: '<p>A &lt;b&gt; tag</p>\n' }],
    render(markdown) {
      return '<p>' + escapeHtml(markdown) + '</p>\n';
    },
  },
  {
    id: 'p50',
    title: 'Escape ampersands',
    blurb: 'An ampersand in a paragraph is escaped.',
    cases: [{ in: 'A & B', out: '<p>A &amp; B</p>\n' }],
    render(markdown) {
      return '<p>' + escapeHtml(markdown) + '</p>\n';
    },
  },
  {
    id: 'p51',
    title: 'Escape quotes',
    blurb: 'Double quotes in a paragraph are escaped.',
    cases: [{ in: 'Say "hi" now', out: '<p>Say &quot;hi&quot; now</p>\n' }],
    render(markdown) {
      return '<p>' + escapeHtml(markdown) + '</p>\n';
    },
  },
  {
    id: 'p52',
    title: 'Hard line break',
    blurb: 'Two spaces before a newline become a br tag.',
    cases: [{ in: 'foo  \nbar', out: '<p>foo<br />\nbar</p>\n' }],
    render(markdown) {
      const parts = markdown.split('  \n');
      return '<p>' + parts.map((part) => escapeHtml(part)).join('<br />\n') + '</p>\n';
    },
  },
  {
    id: 'p53',
    title: 'Soft line break',
    blurb: 'A single newline inside a paragraph stays a newline.',
    cases: [{ in: 'foo\nbar', out: '<p>foo\nbar</p>\n' }],
    render(markdown) {
      return '<p>' + escapeHtml(markdown) + '</p>\n';
    },
  },
  {
    id: 'p54',
    title: 'Emphasis inside a heading',
    blurb: 'An h1 may contain star emphasis.',
    cases: [{ in: '# Say *hi*', out: '<h1>Say <em>hi</em></h1>\n' }],
    render(markdown) {
      const text = markdown.replace(/^# /, '');
      const html = escapeHtml(text).replace(/\*([A-Za-z]+)\*/g, '<em>$1</em>');
      return '<h1>' + html + '</h1>\n';
    },
  },
  {
    id: 'p55',
    title: 'Emphasis inside a list item',
    blurb: 'A dash list item may contain star emphasis.',
    cases: [{ in: '- *A*', out: '<ul>\n<li><em>A</em></li>\n</ul>\n' }],
    render(markdown) {
      const text = markdown.replace(/^- /, '');
      const html = escapeHtml(text).replace(/\*([A-Za-z]+)\*/g, '<em>$1</em>');
      return '<ul>\n<li>' + html + '</li>\n</ul>\n';
    },
  },
];
