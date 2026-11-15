# Report

Written after the commands below. If a box was not run, it is listed under "Not run".

## Ran and passed

`npm test` on Node v24.18.0, from this folder:

```
node --test --test-concurrency=1 --test-timeout=180000 test/*.test.js
```

19 tests, 19 passed, 0 failed. That includes:

- 50 scripted agents on Mission 1. The test asserts 40 merges, 6 failed checks, 4 rejections, then 50 agents, 40 people, 16 countries, 50 map dots, and 72.7% done.
- A webhook with a bad signature is rejected.
- A submission that edits tests is rejected even when the check is green.
- Reporting a workflow edit is rejected.
- A banned user cannot claim.
- Agent tokens are stored as SHA-256. The raw token is not in the row.
- A poster promise can be confirmed by the winner in the rewards test.

`npm run demo` was started with `PORT=3456` and `PUBLIC_BASE_URL=http://127.0.0.1:3456` because another program was already listening on port 3000. The process printed:

```
Round complete. Merged 40, failed 6, rejected 4.
```

`curl` against that process:

- `GET /api/health` returned 200 and `{"ok":true,"demo":true,"github_mode":"fake"}`.
- `GET /join.md` returned 200.
- `GET /badge/1.svg` returned 200 and an SVG whose label is `OneSwarm 72.7%`.
- `GET /legal/terms.md` returned 200.

The browser, on `http://127.0.0.1:3456`:

- The home board, before any extra token, showed 50 agents, 40 people, 16 countries, 72.7% done, and 50 map dots. The feed showed rejected pieces and failed checks by country. Pilot 0 led the people board with 2 pieces. Bangladesh led a country row with 3.
- Mission 1 showed 40 of 55 pieces, the join line `Read http://127.0.0.1:3456/join.md and join mission 1.`, the reward notice word for word, the badge, and the share image.
- Demo login as `admin` worked. The Admin link appeared. Creating an agent token showed a value starting with `os_live_` once, with the note that it will not be shown again.
- After that token, the same running board moved to 51 agents, 41 people, and 50 active. That is the honest count: the new token belongs to a person, and it had not claimed or called the API yet.
- The admin page listed no missions waiting, then showed the report after one was sent from mission 1. The mission stayed public. The signed-in admin had no Ban button on their own row.
- Posting the demo repo again showed "That repo is already submitted."
- `/u/pilot-0` showed 2 pieces done, 2 agents, and a share image whose text is "I lent my agent to OneSwarm" and "2 pieces done".
- Terms and Privacy opened and both start with the draft notice that they are not legal advice.
- At a 390px wide layout the home page did not scroll sideways. The counters stacked in two columns.

## Not run

- No test against a real GitHub App, a real webhook from GitHub, or a real pull request.
- No test against MySQL or MariaDB. Tests and the demo used SQLite.
- No deploy to Hostinger, and no domain.
- Hide and Ban were not clicked. Hide has no undo in version 1, so it was left alone on the demo mission.
- The "I received this" button was not clicked in the browser. The rewards test covers that path for a challenge mission.
- An unknown URL returns the app shell with HTTP 200. That was checked with curl, not by clicking it.

## Not finished

- Share cards and the badge are SVG. There is no PNG.
- Terms and Privacy are drafts. They need a human review before a public launch.
- A hidden mission cannot be made public again from the admin page.
- The real GitHub client is in the server and is refused unless `GITHUB_MODE=real`. It has not been called.

## Only you can do

- Create the GitHub App and paste the id, slug, client id, client secret, private key, and webhook secret. Steps are in `SETUP-GITHUB.md`.
- Create the public Mission #1 repository from `examples/mission-1-commonmark` and install the App on it. Do not add a generated README on GitHub.
- Put your GitHub username in `ADMIN_GITHUB_LOGINS`, deploy with `DEPLOY-HOSTINGER.md`, and attach the domain.
- Read the draft Terms and Privacy and replace them if you want different wording.
- Push this folder with `PUBLISH.md`. Nothing here was published.
