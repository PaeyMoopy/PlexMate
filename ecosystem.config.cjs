module.exports = {
  apps: [{
    name: 'plexmate',
    script: 'src/bot/index.js',
    watch: false,
    autorestart: true,
    max_restarts: 5,
    env: {
      NODE_ENV: 'production'
    },
    env_file: '.env'
  }]
}