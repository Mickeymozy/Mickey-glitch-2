# VPS GitHub Auto Update

PM2 starts a separate updater process. Pterodactyl-style panel deployments with a Git checkout run the updater inside the app process, so no extra panel process is needed. Both check the configured GitHub branch every five minutes, wait one minute before the first check, fast-forward a clean checkout, install production dependencies, then ask the host to restart the app. The `.update` WhatsApp command uses the same updater. Docker builds in this repository omit `.git`, so they do not enable automatic polling.

## Enable on a VPS

Run these commands from a Git clone of the repository on the VPS, with Node.js, Git, npm, and PM2 installed:

```sh
cd /path/to/Mickey-glitch-2
npm install --omit=dev
pm2 start ecosystem.config.js
pm2 save
```

For an existing PM2 deployment, use `pm2 startOrReload ecosystem.config.js --update-env` so PM2 starts the updater process too. Confirm both processes with `pm2 status` and inspect updater output with `pm2 logs mickey-glitch-auto-updater`.

The checkout must be a Git clone with `git`, Node.js, npm, and an enabled restart-on-failure policy in the panel. Set the panel startup command to `npm start` and enable auto-restart. The updater will not overwrite tracked local changes, perform a merge commit, or reset a diverged checkout. Untracked session files are left untouched. If a lockfile exists, it uses `npm ci`; otherwise it uses `npm install` without generating one.

## Panel Setup

Clone the repository into the panel server's working directory, install dependencies, and start the server with `npm start`. Set the update variables in the panel environment. The app detects common Pterodactyl/container environment markers and starts polling automatically. The `.update` command can also trigger a one-time check; it is restricted to the owner or sudo users.

## Configuration

Set these variables in `.env` or in Admin → Environment to customize the updater. Admin-managed settings are re-read while polling and take effect within 30 seconds; `.env` changes require `pm2 startOrReload ecosystem.config.js --update-env`:

- `VPS_AUTO_UPDATE_ENABLED=false` disables it.
- `VPS_AUTO_UPDATE_REPOSITORY=https://github.com/Mickeymozy/Mickey-glitch-2.git` changes the HTTPS repository URL.
- `VPS_AUTO_UPDATE_BRANCH=main` changes the watched branch.
- `VPS_AUTO_UPDATE_INTERVAL_MS=300000` changes the polling interval (minimum 30 seconds).
- `VPS_AUTO_UPDATE_START_DELAY_MS=60000` changes the initial delay.

After changing variables on PM2, run `pm2 startOrReload ecosystem.config.js --update-env`. Render and Vercel deployments remain excluded; plain `npm start` outside a detected panel does not start polling.
