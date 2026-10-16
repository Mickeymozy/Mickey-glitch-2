module.exports = {
  apps: [{
    name: 'Mickey-Glitch ',
    script: './index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    node_args: '--max-old-space-size=384',
    env_file: './.env',
    max_memory_restart: process.env.PM2_MAX_MEMORY || '512M',
    exp_backoff_restart_delay: 100,
    kill_timeout: 5000,
    listen_timeout: 10000,
    env: {
      NODE_ENV: 'production',
      LOW_RESOURCE_MODE: 'true',
      ENABLE_TELEGRAM: 'false',
      MAX_MEDIA_MB: '8'
    },
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    time: true
  }, {
    name: 'mickey-glitch-auto-updater',
    script: './scripts/vps-auto-update.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '128M',
    exp_backoff_restart_delay: 1000,
    env_file: './.env',
    env: {
      NODE_ENV: 'production'
    }
  }]
};
