# Decisions

Choices made while building OneSwarm v1, without stopping to ask. Each one is the simplest safe option.

## Summary

**What was built.** A pnpm monorepo with:

- **apps/web**: Next.js 16 (App Router) with Tailwind 4, hand-written shadcn-style components restyled to DESIGN.md, cmdk and Radix Popover/Dialog/Tooltip. It has a three-panel layout, real-time channels with threads, markdown, highlighted code, attachments and optimistic sends. The composer has @mentions and slash commands, plus agent/model, effort and mode chips with an upward model picker. The app also has a Linear-style tasks view, a task detail panel, an approval queue, the `⌘K` palette, keyboard shortcuts with a `?` sheet, two-step onboarding, and settings for profile, members, agents and bridge devices, channels and limits.
- **apps/server**: Fastify + `ws` + Drizzle. It serves the REST API, a browser WebSocket hub, and a bridge WebSocket hub that drives agent runs. It also handles sessions, CSRF, rate limits, invites, pairing, files (local disk or S3/R2) and fair-use limits.
- **packages/bridge**: the `oneswarm-bridge` CLI, an ACP client built on `@agentclientprotocol/sdk`. It handles detection from one registry, pairing, a reconnecting outbound WebSocket, one ACP session per channel thread, config options, permission bridging and a files MCP server.
- **packages/shared**: types, zod schemas, permissions, ACP mapping and chip logic.
- **packages/mock-agent**: an ACP agent for tests. It streams replies, exposes three models plus effort, mode and model settings, sends `config_option_update`, and asks for one permission.
- **Tests**: 43 Vitest unit tests and one Playwright end-to-end test. The end-to-end test covers signup, onboarding, a live bridge, two browsers, an unread badge, a model switch, streaming, an approval, task to Review to Done, and the keyboard shortcuts.

**Acceptance status.** `pnpm build`, `pnpm lint`, `pnpm test` and `pnpm e2e` pass. Checks 2–6 are covered by the end-to-end test. Check 7 was checked by hand at 1280px and 1920px and partly covered by the test (palette, panels, `E`, `?`, Esc).

**Left for v2.** A skills library, an integrated browser, agent swarms (agents handing work to each other), a usage meter, a Tauri tray app for the bridge, email delivery for invites, multiple workspaces per account, message search on the server, and loading ACP sessions again after a bridge restart.

## Repository

1. **The previous app moved to `legacy/network/`** on branch `workspace-app`. The repo held a different OneSwarm (a public agent network on Express). The new monorepo needs the root, so the old app was moved with `git mv`, history intact, and left untouched. Its CI job still runs from that folder.
2. **TypeScript 5.9, not 7.** TypeScript 7 (the native port) is the latest release, but Next.js 16 and typescript-eslint target 5.x. ESLint is 9 for the same reason.
3. **`packages/shared` ships TypeScript source.** Next transpiles it (`transpilePackages`), tsup bundles it into the server and the bridge, and Vitest reads it directly. There is no separate build step.

## Architecture

4. **One backend process owns the database.** The Fastify server serves the API and both WebSocket endpoints. The web app is a client-rendered Next app that proxies `/api/*` to the server through a catch-all route handler. The proxy target (`SERVER_URL`) is read at runtime, so one build works on any port, and cookies stay first-party.
5. **The browser WebSocket uses a single-use ticket.** The client POSTs `/api/realtime/ticket` (cookie + CSRF) and connects with `?ticket=`. This avoids cross-site WebSocket hijacking and works whether or not the WebSocket shares the web app's origin. Tickets expire after 60 seconds.
6. **Messages are posted over REST and fanned out over the WebSocket.** The REST response and the broadcast both carry the client's `clientId`, so the optimistic copy is replaced exactly once. On reconnect the client reloads bootstrap data and the open channel.
7. **Postgres, with PGlite as a fallback.** `postgres://` uses node-postgres. `pglite://<dir>` or `pglite://memory` runs Postgres in-process: the end-to-end tests use it, and so can anyone without Docker. The same Drizzle schema and migrations serve both.
8. **Text ids** (`crypto.randomUUID()` made in the app) instead of database-generated ids, so the server knows ids before inserting (for example the agent reply message and run).

## Auth and security

9. **Lucia-style sessions.** Each session is a random 32-byte token in an HttpOnly, SameSite=Lax cookie, Secure in production, and the database stores only its SHA-256. Sessions last 30 days and slide when past half-life. Passwords use argon2id (`@node-rs/argon2`; memory 19 MiB, time 2). Unknown emails are checked against a dummy hash so timing doesn't reveal which accounts exist.
10. **CSRF uses double-submit.** Mutations need an `x-csrf-token` header equal to the `os_csrf` cookie. The token rotates with each session. The bridge endpoints (pairing exchange, agent API) use a bearer token or pairing code instead of cookies, so they are exempt.
11. **Rate limits.** Sign-up, login and pairing exchange allow `AUTH_RATE_LIMIT_PER_MIN` (20) per IP. Each browser WebSocket gets a token bucket of 10 messages/s with a burst of 30. A bridge connection is capped at 200 frames/s, enough for token streaming.
12. **Tenant isolation.** Every route resolves the actor (`userId`, `workspaceId`, `role`) from the session, and every query filters by `workspace_id`. Channel access checks run on the server for every message, file, thread and approval call. Records outside your workspace answer 404, not 403, so ids can't be probed. The tests cover this.
13. **Device tokens** look like `osb_` plus 32 random bytes. Only the SHA-256 is stored, and the raw token is shown to the bridge once. Revoking a device closes its socket at once, and later connections get a 401, which makes the bridge forget its token. Pairing codes are 8 characters, single use, valid for 15 minutes, and also stored hashed.
14. **Agent output is untrusted.** Markdown is rendered with react-markdown without `rehype-raw` and sanitized with `rehype-sanitize`. Highlighting runs after sanitizing, unsafe URLs are dropped, links open with `noopener noreferrer nofollow`, and images in agent markdown are not loaded. Tool kinds and statuses from agents are checked against the ACP enums. Prompts tell agents that channel history is information, not instructions.
15. **Uploads.** The server checks the extension against an allow-list (images, PDF, text, code, CSV, JSON, YAML, zip). It also checks the file's first bytes, so a renamed binary can't pass as text or an image, and enforces the size and per-workspace storage limits. Downloads use 15-minute signed URLs: HMAC for local disk, presigned GETs for R2. They are served with `nosniff`, a sandboxed CSP, and `attachment` except for raster images.

## Agents and ACP

16. **Models come only from ACP `configOptions`.** Chips map categories: `model` → agent+model chip, `thought_level` → effort chip, `mode` → mode chip, and `model_config` → settings at the bottom of the picker. A chip shows only if the agent exposes that option. Changes go to the bridge, which calls `session/set_config_option`. The chip shows the new value straight away, then takes whatever the agent sends back (the response or a `config_option_update`). The server rejects values the agent didn't offer.
17. **A config session per agent.** At start-up the bridge opens one ACP session per agent to read and change config options before any conversation exists. The values the person chose are stored as the agent's `configOptions`. They are applied to the config session, sent again to every open thread session, and replayed when a new thread session starts (model first, since it can change the other options).
18. **One ACP session per channel thread.** The channel's main timeline counts as a thread. A mention in the main timeline gets its reply in the main timeline, so "@Mock hello" answers in the channel. A mention inside a thread gets its reply in that thread. Prompts in the same thread run one after another.
19. **Only mentions trigger agents.** People can talk in a channel without waking agents, and the composer chip follows the first agent mentioned. If an owner or member mentions an agent that isn't in the channel, the agent is added to the channel. A guest gets a message asking a member to add it.
20. **New agents start in #general.** Members choose other channels in Settings → Agents, or by mentioning the agent in a channel. The files MCP sees only the channel the run belongs to, and the agent must still be a member of it.
21. **Login detection without credentials.** The bridge never opens credential files. An agent counts as logged in when `session/new` succeeds. An ACP `auth_required` error marks it logged out, and the UI shows the registry's login command. Agents that are logged out are checked again every 30 seconds.
22. **Detected agents.** Claude runs through `claude-agent-acp` if it is on PATH, otherwise `npx -y @agentclientprotocol/claude-agent-acp`. Codex runs through `codex-acp` or `npx -y @zed-industries/codex-acp`. Gemini runs as `gemini --experimental-acp`. The mock agent is opt-in.
23. **Approvals.** A permission request creates an approval card message plus an approval row, and the right panel opens on the queue unless you are already looking at that task. Approve picks the agent's `allow_once` option and Request changes its `reject_once` option. If the run ends first, its approvals are cancelled. A decided card keeps its state (the message carries an approval snapshot).
24. **Agent-created tasks** go through a `create_task` MCP tool next to the file tools. It is gated by the agent's "can create tasks" permission. The onboarding prompt ("create 3 starter tasks") needs this.
25. **Task runs.** Assigning a task to an agent posts a "Task OS-n" root message in the task's channel (#general by default). The agent works in that thread and the task moves to Doing. When the run finishes, the task moves to Review and a review approval appears. Approve moves it to Done. Request changes sends it back to Doing and runs the agent again with the feedback.
26. **The files MCP authenticates with a signed, 6-hour token** scoped to the workspace, agent and channel, which the server issues with each run. Sessions that outlive the token need a new prompt to refresh it (v2: rotate it through the bridge).

## Product details

27. **One workspace per account** is enforced with a unique index on `workspace_members.user_id`. Invites are copyable links: there is no email provider in v1. They last 7 days and work once. Only owners can invite owners, and the last owner can't be demoted.
28. **Guests** see only the channels they are added to. They can post and create tasks, but can't create channels, approve agent actions, pair devices or manage agents.
29. **Unread counts** cover top-level messages since `last_read_at`, not counting your own. Opening a channel marks it read.
30. **Fair-use limits come from env vars.** The defaults are 25 MB per file, 10 GB per workspace and 300 agent messages per hour. Hitting one gives a friendly sentence, as a system message in the channel or a toast. Settings → Limits shows the limits and current use as text. There is no AI usage or plan meter, as the brief asked.
31. **Onboarding** has two steps (workspace name, then connect agents). It ends in #general with the suggested prompt filled in for the first agent that is logged in, Claude if present.

## Design

32. **DESIGN.md is the source of truth.** Its tokens (Onyx canvas, Charcoal and Graphite surface steps, white and gray text, the single Ember accent, white-alpha hairlines, pill controls, 16px cards) live in Tailwind's `@theme`.
33. **Font stand-ins.** DESIGN.md's fonts are proprietary, so the code uses its suggested substitutes: Inter Variable for gigaSansText, Cormorant Garamond 300 for emilioDisplay, and Geist Mono for the mono labels. They are self-hosted through Fontsource, so builds need no network.
34. **Where DESIGN.md is silent:** dark only, spacing over borders, no dashboard cards, and 120 ms ease-out motion everywhere. `prefers-reduced-motion` turns animations off. The display serif is used for page titles, empty states and onboarding, never at body size. Ember marks things that need a person: a pending approval, a working agent, an unsent error.
35. **shadcn/ui components are written in the repo** (`components/ui`, with `components.json` for the CLI) and restyled: pill buttons, 6px inputs, 16px popovers and dialogs, no shadows on cards.
36. **Panel sizes** (left and right width, left collapsed) persist per user in `localStorage` under `oneswarm:panels:<userId>`. Panels animate width only, so the message column never jumps.
