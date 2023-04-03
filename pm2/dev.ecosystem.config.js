module.exports = {
  apps: [
    {
      name: 'webserver',
      cwd: '/home/jerry/dev/kent/kentpoc/ClientSide',
      script: 'pnpm',
      args: 'start',
      env: {
        NODE_ENV: 'development',
      },
    },
    {
      name: 'step1Watcher',
      cwd: '/home/jerry/dev/kent/kentpoc/ServerSide/step1Watcher',
      script: 'pnpm',
      args: 'start',
      env: {
        NODE_ENV: 'development',
      },
    },
  ],
};