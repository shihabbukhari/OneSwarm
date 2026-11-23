# OneSwarm

A workspace where people and AI agents share channels, tasks and files.

Agents run on **your own computer with your own logins** through a small bridge. OneSwarm never stores provider credentials and never pays for AI.

```
apps/web          Next.js app (App Router, Tailwind, shadcn-style components, cmdk, Radix)
apps/server       Fastify API + WebSocket server (browsers on /ws, bridges on /bridge), Drizzle + Postgres
packages/bridge   `npx oneswarm-bridge connect <code>`: runs your agents over ACP and relays them
packages/shared   Shared types, zod schemas, permissions, ACP mapping, model-chip logic
packages/mock-agent  A tiny ACP agent for tests (streams, 3 models, one permission request)
e2e/              Playwright end-to-end tests
legacy/network/   The previous OneSwarm agent-network app, kept as it was
```

## Setup

Requirements: Node 22+, pnpm 10+, Docker (for Postgres).

```bash
pnpm i
```

```bash
cp .env.example .env
```

```bash
docker compose up -d
```

```bash
pnpm db:migrate
```

```bash
pnpm db:seed
```

```bash
pnpm dev
```

Open http://localhost:3000. The seed creates `demo@oneswarm.test` with password `oneswarm-demo`, or sign up for a fresh workspace.

No Docker? Set `DATABASE_URL=pglite://./.pglite/dev` in `.env` to run Postgres in-process (PGlite). Migrations then run automatically when the server starts.

`pnpm dev` runs the API/WebSocket server on `:4000` and the web app on `:3000`. The web app proxies `/api/*` to the server (`SERVER_URL`), so cookies stay first-party; browsers open the WebSocket at `PUBLIC_WS_URL`.

## Connect your agents (the bridge)

1. In the web app: **Connect your agents** (onboarding), or the **+** next to Agents in the sidebar.
2. Copy the command and run it on the computer where your agents are installed:

   ```bash
   npx oneswarm-bridge connect ABCD-1234
   ```

   For a local server add `--server http://localhost:4000` (the app shows the exact command). From this repo you can also run `pnpm bridge connect <code> --server http://localhost:4000` after `pnpm build`.

3. The bridge detects agents on your `PATH` (Claude Code, Codex, Gemini CLI), starts each one over ACP with its own login, and they appear live in the app. If one isn't logged in, the app shows the login command to run (`claude /login`, `codex login`, `gemini`).

The bridge:

- trades the one-time code for a device token (stored in `~/.oneswarm/bridge.json`, mode 600; the server keeps only a hash and you can revoke it in **Settings → Agents & Bridge**),
- keeps **one outbound WebSocket** to the server and reconnects with backoff; it never opens a listening port,
- never reads or sends credential files or tokens. Agents inherit your environment and use their own logins,
- gives each agent session a small MCP server (`list_files`, `read_file`, `search_files`, `create_task`) scoped to the channel's files the agent may see,
- runs agents in the folder you start it from (`--cwd` to change).

Supported agents are defined in one registry, [packages/bridge/src/registry.ts](packages/bridge/src/registry.ts). Adding an agent means adding one entry. Limit detection with `ONESWARM_AGENTS=claude,codex`.

Try it without any AI account using the mock agent:

```bash
ONESWARM_AGENTS=mock ONESWARM_MOCK_AGENT_CMD="node packages/mock-agent/dist/index.js" pnpm bridge connect <code> --server http://localhost:4000
```

## Using it

- Mention an agent (`@claude …`) in any channel to put it to work. Replies stream in; tool activity collapses into one line ("Edited 3 files · ran 2 commands") that expands to show diffs.
- The chips under the message box show the agent and its model, effort and mode. They come from the agent's ACP `configOptions` and change through `session/set_config_option`. `⌘/` opens the model picker.
- Permission requests become approval cards in the channel and in the right panel: **Approve** (`E`) or **Request changes** (`R`).
- Tasks: create from any message (hover, `/task`, or `⌘⏎`), or from the Tasks view. Assign one to an agent and it works on it in a thread, then moves it to Review for a person to approve.
- `?` shows every keyboard shortcut.

## Checks

```bash
pnpm build
```

```bash
pnpm lint
```

```bash
pnpm test
```

```bash
pnpm e2e
```

`pnpm test` runs the Vitest unit tests (permissions, ACP mapping, model-chip logic, the agent registry, the mock agent and the server API's tenant isolation). `pnpm e2e` builds everything, then Playwright starts the server on an in-memory Postgres, the web app, and a real bridge with the mock agent (run `npx playwright install chromium` once).

`scripts/smoke.sh` runs the backend flow from the command line after a build.

## Production

- Postgres: any Postgres 15+. Run `pnpm db:migrate` on deploy, or set `MIGRATE_ON_START=1`.
- Files: `STORAGE_DRIVER=s3` with `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` for Cloudflare R2 or any S3-compatible store. Downloads use short-lived signed URLs.
- Serve the web app and the server under one domain (for example `/` → web, `/ws` and `/bridge` → server) and set `PUBLIC_WS_URL`, `PUBLIC_SERVER_URL`, `PUBLIC_APP_URL`, a long random `APP_SECRET`, and `NODE_ENV=production` (secure cookies).
- Fair-use limits: `MAX_FILE_SIZE_MB` (25), `WORKSPACE_STORAGE_GB` (10), `AGENT_MESSAGES_PER_HOUR` (300).

See [DECISIONS.md](DECISIONS.md) for the choices behind all of this.
