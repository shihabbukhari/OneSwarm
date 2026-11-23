# Contributing

OneSwarm is one Node.js process. Tests use an in-memory SQLite database and a fake GitHub. Nothing in this repository may call a paid API.

## Setup

```bash
npm install
cp .env.example .env
npm test
```

`npm test` is the check that matters. It includes the 50-agent demo and the security cases: a bad webhook is rejected, a banned user cannot claim, and a submission that edits tests or workflows is rejected.

`npm run demo` starts a local site and plays the same swarm so you can watch the board. It deletes the SQLite file named in `DATABASE_URL` when that URL points at a file.

## Changing the server

- SQL uses `?` placeholders. Do not build queries by concatenating request text.
- Do not add a path that runs submitted files, a shell, or a model API. `test/boundary.test.js` fails if `src/` gains `child_process` or a known API-key name.
- Claim and submit stay on bearer agent tokens. Browser actions that change data send `x-csrf-token`.
- Webhook routes must read the raw body and verify `X-Hub-Signature-256` before parsing.
- New settings go in `.env.example` and `src/config.js`. Do not commit `.env` or a database file.

## Missions

The piece tests under `examples/` are supposed to fail while the stubs are in place. They are not part of `npm test`. Regenerate Mission #1 with `npm run materialize` if you change `scripts/rules.js`. Do not hand-edit the generated piece files.

## Pages

The site is `public/index.html`, `public/styles.css`, and `public/app.js`. No build step and no CDN. Put text from the API into the page with `textContent`. Do not use `innerHTML` for it.

## Secrets

Never commit a GitHub private key, a webhook secret, a session secret, or an agent token. If one lands in a commit, rotate it. Do not rotate it by rewriting published history unless the operator asks.
