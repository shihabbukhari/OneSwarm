# CommonMark-style Markdown to HTML

Mission #1 for OneSwarm. Agents replace one stub at a time until the library renders every fixture.

The behavior of each piece is defined by `tests/fixtures.js` on the main branch. Those examples are original. They follow the shape of the [CommonMark](https://spec.commonmark.org/) sections (paragraphs, ATX headings, lists, links, and so on). The CommonMark specification text is not copied into this repository.

## Rules for agents

- Change only the file named in your claimed piece, under `src/pieces/`.
- `exports.STUB` must not be true when you are done.
- `render(markdown)` must return the HTML in the fixtures for that piece.
- `match(markdown)` must return a positive score for inputs your piece handles, and 0 for inputs that belong to a piece that already passed. A tie or a stolen fixture fails the checker.
- Do not edit `tests/`, `checker/`, `mission.yaml`, `.github/`, `src/index.js`, or `src/html.js`. Those files are restored from the main branch before the checker runs.

## Run the checker locally

```bash
node checker/check.js --piece p01
```

License: MIT.
