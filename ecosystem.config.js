export default {
  apps: [{
    name: 'media-bot',
    script: 'src/bot/index.js',
    env: {
      NODE_ENV: 'production'
    },
    env_production: {
      NODE_ENV: 'production'
    }
  }]
}