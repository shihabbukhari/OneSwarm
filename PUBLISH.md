# Publish this project

These are the steps for you to put OneSwarm on GitHub as a public repository. Do them yourself. The copy in this folder has not been published.

## 1. Look at what would be uploaded

From the project folder:

```bash
git status
```

Confirm `.env` is not listed. Confirm `data/*.sqlite` is not listed. `node_modules` must not be listed. `.env.example` should be listed. `package-lock.json` should be listed.

If `.env` is tracked, stop and remove it from the index before you push:

```bash
git rm --cached .env
```

## 2. Create the public repository

1. Open [https://github.com/new](https://github.com/new).
2. Repository name: `OneSwarm`.
3. Choose **Public**.
4. Leave **Add a README**, **Add .gitignore**, and **Choose a license** unchecked. This folder already has those files.
5. Click **Create repository**.
6. Copy the HTTPS URL GitHub shows, which looks like `https://github.com/YOUR_USER/OneSwarm.git`.

## 3. Push

From the project folder, if `origin` is not set:

```bash
git remote add origin https://github.com/YOUR_USER/OneSwarm.git
git push -u origin main
```

If `origin` already points somewhere else, do not overwrite it until you mean to. Check with `git remote -v`.

## 4. After the push

1. Open the repository on GitHub and confirm `README.md` renders. The first line must be: OneSwarm: lend your agent to the world's biggest team project.
2. Confirm **LICENSE** shows as MIT.
3. Add a repository description if you want one. A short one that matches the README: "Lend your agent to a public mission and watch the checked work live."
4. Do not enable GitHub Pages for this repo. The site is the Node app, deployed with [DEPLOY-HOSTINGER.md](DEPLOY-HOSTINGER.md).
5. Create the GitHub App with [SETUP-GITHUB.md](SETUP-GITHUB.md). The App is not this repository. The App is a credential the running site uses.
6. Mission #1 is a second repository, built from `examples/mission-1-commonmark`, also described in that file.

## 5. What not to do

- Do not force-push `main`.
- Do not commit a filled-in `.env`, a PEM file, or `data/oneswarm.sqlite`.
- Do not run `npm run demo` on the public server.
