module.exports = {
  apps: [
    {
      name: 'xyrapanel',
      script: '.output/server/index.mjs',
      exec_mode: 'cluster', // app is stateless (sessions/cache external)
      // Set to 1 on minimum-spec (2GB/1 core) hosts; override via INSTANCES env
      instances: process.env.INSTANCES || 'max',
      autorestart: true,

      // Resource Management
      max_memory_restart: process.env.MAX_MEMORY_RESTART || '1G',

      // Control Flow & Graceful signals
      // Matches the Nitro plugin 'ready' hook for zero-downtime
      kill_timeout: 4000,
      wait_ready: true,
      listen_timeout: 15000,

      // Advanced Stability
      instance_var: 'NODE_APP_INSTANCE',
      max_restarts: 10,
      min_uptime: '15s', // Consider app "up" after 15s
      restart_delay: 2000, // Delay between restarts if it crashes

      // Logging
      // Docker-centric logging configuration
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      time: true, // Prefix logs with timestamp (good for forensics)

      out_file: '/opt/xyrapanel/.pm2/logs/xyrapanel-out.log',
      error_file: '/opt/xyrapanel/.pm2/logs/xyrapanel-error.log',
      // NOTE: configure pm2-logrotate or external logrotate to manage log size.
      env: {
        NODE_ENV: 'production',
      },
      env_staging: {
        NODE_ENV: 'production',
        INSTANCES: '1',
      },
    },
  ],
};
