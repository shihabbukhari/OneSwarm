module.exports = {
  "p01": [
    {
      "in": "",
      "out": ""
    }
  ],
  "p02": [
    {
      "in": "Hello",
      "out": "<p>Hello</p>\n"
    },
    {
      "in": "Hello world",
      "out": "<p>Hello world</p>\n"
    }
  ],
  "p03": [
    {
      "in": "Hello\n\nWorld",
      "out": "<p>Hello</p>\n<p>World</p>\n"
    }
  ],
  "p04": [
    {
      "in": "# Title",
      "out": "<h1>Title</h1>\n"
    },
    {
      "in": "# A & B",
      "out": "<h1>A &amp; B</h1>\n"
    }
  ],
  "p05": [
    {
      "in": "## Section",
      "out": "<h2>Section</h2>\n"
    }
  ],
  "p06": [
    {
      "in": "### Part",
      "out": "<h3>Part</h3>\n"
    }
  ],
  "p07": [
    {
      "in": "#### Detail",
      "out": "<h4>Detail</h4>\n"
    }
  ],
  "p08": [
    {
      "in": "##### Note",
      "out": "<h5>Note</h5>\n"
    }
  ],
  "p09": [
    {
      "in": "###### Deep",
      "out": "<h6>Deep</h6>\n"
    }
  ],
  "p10": [
    {
      "in": "# Title #",
      "out": "<h1>Title</h1>\n"
    }
  ],
  "p11": [
    {
      "in": "## Title ##",
      "out": "<h2>Title</h2>\n"
    }
  ],
  "p12": [
    {
      "in": "Title\n====",
      "out": "<h1>Title</h1>\n"
    }
  ],
  "p13": [
    {
      "in": "Title\n----",
      "out": "<h2>Title</h2>\n"
    }
  ],
  "p14": [
    {
      "in": "***",
      "out": "<hr />\n"
    }
  ],
  "p15": [
    {
      "in": "---",
      "out": "<hr />\n"
    }
  ],
  "p16": [
    {
      "in": "___",
      "out": "<hr />\n"
    }
  ],
  "p17": [
    {
      "in": "* * *",
      "out": "<hr />\n"
    }
  ],
  "p18": [
    {
      "in": "*****",
      "out": "<hr />\n"
    }
  ],
  "p19": [
    {
      "in": "    code",
      "out": "<pre><code>code\n</code></pre>\n"
    }
  ],
  "p20": [
    {
      "in": "```\ncode\n```",
      "out": "<pre><code>code\n</code></pre>\n"
    }
  ],
  "p21": [
    {
      "in": "~~~\ncode\n~~~",
      "out": "<pre><code>code\n</code></pre>\n"
    }
  ],
  "p22": [
    {
      "in": "```js\nconst a = 1;\n```",
      "out": "<pre><code class=\"language-js\">const a = 1;\n</code></pre>\n"
    }
  ],
  "p23": [
    {
      "in": "```\n<b>\n```",
      "out": "<pre><code>&lt;b&gt;\n</code></pre>\n"
    }
  ],
  "p24": [
    {
      "in": "```\n* * *\n```",
      "out": "<pre><code>* * *\n</code></pre>\n"
    }
  ],
  "p25": [
    {
      "in": "> Quote",
      "out": "<blockquote>\n<p>Quote</p>\n</blockquote>\n"
    }
  ],
  "p26": [
    {
      "in": "> > Inner",
      "out": "<blockquote>\n<blockquote>\n<p>Inner</p>\n</blockquote>\n</blockquote>\n"
    }
  ],
  "p27": [
    {
      "in": "> One\n> Two",
      "out": "<blockquote>\n<p>One\nTwo</p>\n</blockquote>\n"
    }
  ],
  "p28": [
    {
      "in": "- Item",
      "out": "<ul>\n<li>Item</li>\n</ul>\n"
    }
  ],
  "p29": [
    {
      "in": "* Item",
      "out": "<ul>\n<li>Item</li>\n</ul>\n"
    }
  ],
  "p30": [
    {
      "in": "+ Item",
      "out": "<ul>\n<li>Item</li>\n</ul>\n"
    }
  ],
  "p31": [
    {
      "in": "- A\n- B",
      "out": "<ul>\n<li>A</li>\n<li>B</li>\n</ul>\n"
    }
  ],
  "p32": [
    {
      "in": "1. Item",
      "out": "<ol>\n<li>Item</li>\n</ol>\n"
    }
  ],
  "p33": [
    {
      "in": "3. Item",
      "out": "<ol start=\"3\">\n<li>Item</li>\n</ol>\n"
    }
  ],
  "p34": [
    {
      "in": "10. Item",
      "out": "<ol start=\"10\">\n<li>Item</li>\n</ol>\n"
    }
  ],
  "p35": [
    {
      "in": "1. A\n2. B",
      "out": "<ol>\n<li>A</li>\n<li>B</li>\n</ol>\n"
    }
  ],
  "p36": [
    {
      "in": "Say *hi* now",
      "out": "<p>Say <em>hi</em> now</p>\n"
    }
  ],
  "p37": [
    {
      "in": "Say _hi_ now",
      "out": "<p>Say <em>hi</em> now</p>\n"
    }
  ],
  "p38": [
    {
      "in": "Say **hi** now",
      "out": "<p>Say <strong>hi</strong> now</p>\n"
    }
  ],
  "p39": [
    {
      "in": "Say __hi__ now",
      "out": "<p>Say <strong>hi</strong> now</p>\n"
    }
  ],
  "p40": [
    {
      "in": "Use `code` here",
      "out": "<p>Use <code>code</code> here</p>\n"
    }
  ],
  "p41": [
    {
      "in": "Use ``co`de`` here",
      "out": "<p>Use <code>co`de</code> here</p>\n"
    }
  ],
  "p42": [
    {
      "in": "See [docs](http://example.com)",
      "out": "<p>See <a href=\"http://example.com\">docs</a></p>\n"
    }
  ],
  "p43": [
    {
      "in": "See [docs](http://example.com \"Docs\")",
      "out": "<p>See <a href=\"http://example.com\" title=\"Docs\">docs</a></p>\n"
    }
  ],
  "p44": [
    {
      "in": "See <http://example.com>",
      "out": "<p>See <a href=\"http://example.com\">http://example.com</a></p>\n"
    }
  ],
  "p45": [
    {
      "in": "Pic ![alt](http://example.com/a.png)",
      "out": "<p>Pic <img src=\"http://example.com/a.png\" alt=\"alt\" /></p>\n"
    }
  ],
  "p46": [
    {
      "in": "Pic ![alt](http://example.com/a.png \"T\")",
      "out": "<p>Pic <img src=\"http://example.com/a.png\" alt=\"alt\" title=\"T\" /></p>\n"
    }
  ],
  "p47": [
    {
      "in": "![A & B](http://example.com/a.png)",
      "out": "<p><img src=\"http://example.com/a.png\" alt=\"A &amp; B\" /></p>\n"
    }
  ],
  "p48": [
    {
      "in": "A \\* b",
      "out": "<p>A * b</p>\n"
    }
  ],
  "p49": [
    {
      "in": "A <b> tag",
      "out": "<p>A &lt;b&gt; tag</p>\n"
    }
  ],
  "p50": [
    {
      "in": "A & B",
      "out": "<p>A &amp; B</p>\n"
    }
  ],
  "p51": [
    {
      "in": "Say \"hi\" now",
      "out": "<p>Say &quot;hi&quot; now</p>\n"
    }
  ],
  "p52": [
    {
      "in": "foo  \nbar",
      "out": "<p>foo<br />\nbar</p>\n"
    }
  ],
  "p53": [
    {
      "in": "foo\nbar",
      "out": "<p>foo\nbar</p>\n"
    }
  ],
  "p54": [
    {
      "in": "# Say *hi*",
      "out": "<h1>Say <em>hi</em></h1>\n"
    }
  ],
  "p55": [
    {
      "in": "- *A*",
      "out": "<ul>\n<li><em>A</em></li>\n</ul>\n"
    }
  ]
};
