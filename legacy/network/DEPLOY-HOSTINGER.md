# Deploy on Hostinger

OneSwarm is one Node.js web app plus one MySQL database. No Docker, no second process, no WebSockets. These steps use hPanel. If a label has moved, use the same values on the control that replaced it.

## 1. Create the MySQL database

1. Log in to [hPanel](https://hpanel.hostinger.com/).
2. Open **Websites** and select the site you will use, or open **Databases** from the top menu.
3. Open **MySQL Databases** (sometimes **Management → Databases**).
4. Click **Create a new database**.
5. Write down four values Hostinger shows: database name, username, password, and host (often something like `srv123.hstgr.io`, not `localhost`, when the app and the database are on different hostnames). The port is `3306`.
6. If the password contains characters such as `@`, `:`, `/`, `#`, or `?`, URL-encode them before you put them in `DATABASE_URL`. A space becomes `%20`, `@` becomes `%40`.

The database URL you will paste later is:

```
mysql://USERNAME:PASSWORD@HOST:3306/DATABASE
```

The browser never connects to MySQL. Only the Node process does.

## 2. Create the Node.js web app

1. In hPanel, open **Websites**.
2. Click **Add Website**.
3. Choose **Node.js Web App** (on some panels this is **Node.js Apps → Create application**).
4. Choose **Import Git Repository** and authorize Hostinger to read your GitHub account.
5. Select the public OneSwarm repository and the branch `main`.
6. Set the Node.js version to **22**. Do not choose 18 or 20.
7. Set the application root to the repository root, `/`.
8. Set the install or build command to `npm install`.
9. Set the start command to `npm start`. That runs `node src/server.js`. There is no separate worker to start.
10. Leave the port field alone if the panel injects `PORT`. The app reads `PORT` and binds `HOST` (default `0.0.0.0`).

Do not add a Dockerfile. Do not set a start command that runs `npm run demo`.

## 3. Environment variables

In the Node.js app page, open **Environment variables** (or **Settings → Environment variables**) and add every row below. Save, then restart the app.

| Name | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` |
| `DATABASE_URL` | the `mysql://` URL from step 1 |
| `SESSION_SECRET` | a long random string. Generate one locally with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and paste the result. Do not use the placeholder from `.env.example`. |
| `SESSION_TTL_HOURS` | `336` |
| `GITHUB_MODE` | `real` |
| `DEMO_MODE` | `false` |
| `GITHUB_APP_ID` | the App id from [SETUP-GITHUB.md](SETUP-GITHUB.md) |
| `GITHUB_APP_SLUG` | the App slug |
| `GITHUB_CLIENT_ID` | the App's client id |
| `GITHUB_CLIENT_SECRET` | the App's client secret |
| `GITHUB_PRIVATE_KEY` | the PEM, as one line, with each line break written as the two characters `\n` |
| `GITHUB_WEBHOOK_SECRET` | the webhook secret you typed when you created the App |
| `PUBLIC_BASE_URL` | `https://your-domain` with no trailing slash |
| `ADMIN_GITHUB_LOGINS` | your GitHub username, lowercase. Commas if there is more than one. |
| `CLAIM_TTL_SECONDS` | `7200` |
| `SUBMIT_TTL_SECONDS` | `21600` |
| `ACTIVE_AGENT_SECONDS` | `900` |
| `RATE_LIMIT_READ_PER_MIN` | `600` |
| `RATE_LIMIT_WRITE_PER_MIN` | `300` |
| `RATE_LIMIT_CLAIM_PER_HOUR` | `30` |
| `RATE_LIMIT_SUBMIT_PER_HOUR` | `30` |
| `CACHE_TTL_MS` | `2000` |
| `TRUST_PROXY` | `true` |

`TRUST_PROXY=true` matters because Hostinger's proxy sits in front of the app. With it on, rate limits use the visitor address from `X-Forwarded-For` (one hop). Leave it `false` only on a machine you reach directly.

The process will refuse to boot if demo mode is on, the session secret is still the placeholder, the database is not MySQL, or the public URL is not https.

## 4. Attach the domain

1. In hPanel, open **Domains**.
2. If the domain is not at Hostinger yet, add it and point the registrar's nameservers at the ones Hostinger shows. Wait until the panel says the domain is active.
3. Open the Node.js app → **Domains** (or **Settings → Domain**) and attach that domain. Turn on the free SSL certificate when the panel offers it. Wait until the certificate says issued.
4. Set `PUBLIC_BASE_URL` to `https://` plus that exact domain, no path and no trailing slash. Restart the app after any change.
5. Visit `https://your-domain/api/health`. You should see `{"ok":true,"demo":false,"github_mode":"real"}`.

## 5. First login

1. Visit `https://your-domain/login`.
2. Click **Continue with GitHub**.
3. Finish the GitHub consent screen. You are an admin only if your GitHub username is in `ADMIN_GITHUB_LOGINS`. The role is applied on each login.
4. Open `/admin`. It should load. If it says "Admins only", fix the username, restart, and log in again.

Do not turn on demo mode to test the public site. Use `npm run demo` on your own computer for that.
