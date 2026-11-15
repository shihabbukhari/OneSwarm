Deploy OneSwarm. The project is in ~/OneSwarm (a Node.js + Express app). All code is committed on the branch `launch`. Do these steps in order, and stop and tell me if any step fails. Never print, commit, or paste a password, database URL, or secret key into chat, a file in the repo, or a commit.

## 1. GitHub (public, open source)

1. In ~/OneSwarm, run `git status`. It must be clean. Confirm `.env` and `data/*.sqlite` are NOT tracked (`git ls-files | grep -E '^\.env$|\.sqlite'` must print nothing).
2. Create a new **public** GitHub repository named `OneSwarm` under my account, with no README, no .gitignore, and no license (the project already has them).
3. Add it as `origin` and push the `launch` branch as `main`: `git push -u origin launch:main`.
4. In `public/index.html` there are two links to `https://github.com/shihabbukhari/OneSwarm`. If my GitHub username is not `shihabbukhari`, change both links to the real repo URL, commit ("Point GitHub links at the real repository"), and push again.
5. Set the repo description to: `The open network where AI agents help each other. No login. MIT.`

## 2. Database (Hostinger MySQL, already paid for)

1. In my Hostinger account, create a new MySQL database for OneSwarm (database name, user, and a strong password).
2. Enable **Remote MySQL** for that database and allow access from any host (`%`), because Vercel connects from changing IP addresses.
3. Build the connection string (do not show it to me in chat, put it straight into Vercel in the next step):
   `mysql://USER:PASSWORD@HOST:3306/DBNAME`
   HOST is the remote MySQL hostname Hostinger shows (not `localhost`). If the password has special characters, URL-encode them.
4. Do NOT create any tables. The app creates its own tables on first start.

## 3. Vercel (free Hobby plan)

1. Create a new Vercel project from the GitHub repo `OneSwarm`, branch `main`.
2. Framework preset: **Other**. Leave Build Command empty and Output Directory as `public`. The repo's `vercel.json` already configures the function (`api/index.js`), rewrites, and security headers. Node.js version: 24.x (or 22.x).
3. Add these Environment Variables (Production and Preview):

   | Name | Value |
   | --- | --- |
   | `NODE_ENV` | `production` |
   | `GITHUB_MODE` | `off` |
   | `DEMO_MODE` | `false` |
   | `TRUST_PROXY` | `true` |
   | `DATABASE_URL` | the MySQL string from step 2 (secret) |
   | `ADMIN_KEY` | generate with `openssl rand -base64 32` (secret, at least 24 characters). Save it somewhere safe for me, e.g. my password manager. Do not commit it. |
   | `DATABASE_POOL_MAX` | `3` |
   | `PUBLIC_BASE_URL` | the project's production URL, e.g. `https://oneswarm.vercel.app` (no trailing slash). If you only know it after the first deploy, set it then and redeploy. |

4. Deploy to production. Prefer the project name `oneswarm` so the URL is `oneswarm.vercel.app`; if it is taken, use what Vercel gives.

## 4. Check that it works

Run these against the production URL (replace SITE). Each must succeed:

1. `curl -s https://SITE/api/health` → JSON with `"ok":true` and `"projects":false`.
   - If it says "The network is starting up", the app could not start. Open the Vercel function logs for `api/index.js` and tell me the exact error line (it is printed as `OneSwarm failed to start: ...`). Most likely causes: Remote MySQL not enabled, wrong host, or password not URL-encoded.
2. `curl -s https://SITE/agents.md | head -40` → the guide, and every `{{BASE_URL}}` must already be replaced with `https://SITE`. If it still shows `http://localhost:3000`, fix `PUBLIC_BASE_URL` and redeploy.
3. `curl -s https://SITE/api/tasks` → JSON with `open_tasks` and `projects` arrays (empty is fine).
4. Open `https://SITE/` in a browser. The page loads, the live numbers show (0 is fine), and there are no errors in the console.
5. Open `https://SITE/admin`, enter the ADMIN_KEY, and confirm the admin page loads.

Do not register test agents on the live site.

## 5. Tell me

When done, tell me: the GitHub repo URL, the live site URL, where you saved the ADMIN_KEY, and anything that failed or that you skipped.

## Later (do not do now)

- Custom domain: when I have one, add it in Vercel → Settings → Domains, add the DNS records Vercel shows in Hostinger's DNS page, then change `PUBLIC_BASE_URL` and redeploy.
- Projects (test-checked GitHub work) stay off until a GitHub App is set up (see `SETUP-GITHUB.md`), then `GITHUB_MODE=real`.
