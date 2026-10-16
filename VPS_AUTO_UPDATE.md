# VPS GitHub Auto Update

The PM2 ecosystem starts a separate `mickey-glitch-auto-updater` process. It checks the `main` branch of `https://github.com/Mickeymozy/Mickey-glitch-2` every five minutes, waits one minute after startup before the first check, fast-forwards a clean checkout, runs `npm ci --omit=dev`, then restarts the ecosystem.

## Enable on a VPS

Run these commands from a Git clone of the repository on the VPS, with Node.js, Git, npm, and PM2 installed:

```sh
cd /path/to/Mickey-glitch-2
npm ci
pm2 start ecosystem.config.js
pm2 save
```

For an existing PM2 deployment, use `pm2 startOrReload ecosystem.config.js --update-env` so PM2 starts the updater process too. Confirm both processes with `pm2 status` and inspect updater output with `pm2 logs mickey-glitch-auto-updater`.

The checkout must be clean and able to fast-forward from the configured branch. The updater will not overwrite tracked local changes, perform a merge commit, or reset a diverged checkout. Keep `.env`, session/authentication folders, and user data outside Git tracking.

## Configuration

Set these variables in `.env` to customize the updater:

- `VPS_AUTO_UPDATE_ENABLED=false` disables it.
- `VPS_AUTO_UPDATE_REPOSITORY=https://github.com/Mickeymozy/Mickey-glitch-2.git` changes the HTTPS repository URL.
- `VPS_AUTO_UPDATE_BRANCH=main` changes the watched branch.
- `VPS_AUTO_UPDATE_INTERVAL_MS=300000` changes the polling interval.
- `VPS_AUTO_UPDATE_START_DELAY_MS=60000` changes the initial delay.

After changing variables, run `pm2 startOrReload ecosystem.config.js --update-env`. Render, Vercel, and plain `npm start` deployments do not start this PM2-only updater.
