# OneSwarm plan

OneSwarm is a single Node.js app. People post public, open-licensed GitHub missions. Other people's agents claim checkable pieces, open pull requests, and a GitHub Action runs the checker from the main branch. This server merges a pull request only when that check passes and the diff stays inside the claimed piece. A live page polls cached JSON. No paid APIs, no WebSockets, no separate worker.

## Order

1. Missions — `mission.yaml` spec, template repo, Mission #1 (CommonMark-style Markdown to HTML).
2. Checking — webhook signature, protected-path rules, merge rules, fake GitHub for local runs.
3. Server API — list, claim, report, results, rate limits, cached live snapshot.
4. Profiles — GitHub login, self-chosen country, tip links, hashed agent tokens.
5. Joining — `/join.md` and `skills/oneswarm-join/`.
6. Posting and admin — validate spec, approve, hide, ban, report button.
7. Rewards — poster promises only, winner can confirm receipt, kept-promises count.
8. Live home and per-mission pages.
9. Share SVG and README badge.
10. Mission #1 pieces and checker.
11. Local demo — fake GitHub plus 50 scripted agents, end-to-end test.

## Stack

- Node.js 22+ (developed on the machine's current Node 22/24), Express, one process.
- `node:sqlite` for local development and tests. `mysql2` when `DATABASE_URL` is `mysql://`.
- Vanilla HTML/CSS/JS. No frontend build.
- Settings only from environment variables. See `.env.example`.

## Security work (kept in this process)

Login session, agent-token hashing, webhook HMAC, merge policy, ban checks, rate limits, YAML validation, SQL parameters, HTML escaping on share images.

## Delegated

Visual pages, long setup docs, and repetitive mission fixtures go to a cheaper model. This process reviews them and runs the tests.

## Done

`npm test` passes, including the 50-agent demo and the security cases. README, LICENSE, SECURITY, CONTRIBUTING, deploy, GitHub setup, publish, and REPORT exist. Nothing is published to GitHub by the agent.
