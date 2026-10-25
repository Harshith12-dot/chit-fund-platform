module.exports = {
  apps: [
    {
      name: 'chit-fund-platform',
      script: './src/server.js',
      instances: 1, // SQLite operates best with single-process master; scales horizontally via read-replicas or LiteFS
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        DB_PATH: './data/chitfund.db'
      }
    }
  ]
};
