# Progress

Resume from the first unchecked item. Do not redo completed steps unless tests fail.

## Done

- [x] PLAN.md and DECISIONS.md
- [x] Database, config, security core (tokens, webhook HMAC, merge rules, rate limit)
- [x] GitHub client (real + fake) and HTTP API
- [x] Profiles, posting, admin, rewards
- [x] Mission spec, template, Mission #1, checker
- [x] join.md and Agent Skill
- [x] Live page, home, mission, profile, admin UI
- [x] Share images and badge
- [x] Demo simulator and tests
- [x] Docs: README, LICENSE, SECURITY, CONTRIBUTING, DEPLOY, SETUP, PUBLISH
- [x] Run tests, fix, write REPORT.md from actual results

## Notes

- `npm test` is 19 tests, all passing on Node v24.18.0. It does not run the stub piece tests inside `examples/`.
- The demo checker clears Node's test-runner environment variables before it spawns `node --test`. Without that, a nested test run reported failures as passes.
- A cheaper model was not available for the pages and docs, so they were written in this session.
- Do not publish the repo. Do not call paid APIs.
