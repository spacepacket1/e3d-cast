module.exports = {
  apps: [
    {
      name: 'cast-ui',
      script: 'src/server/index.js',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        CAST_UI_PORT: 3200,
        CAST_UI_DIR: 'dist',
      },
    },
    {
      name: 'cast-worker',
      script: 'src/worker/index.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
        CAST_PIPELINE_DIR: '/home/ubuntu/e3d-pod2vid',
        CAST_JOB_RUNNER: '/home/ubuntu/e3d-pod2vid/bin/pod2vid-job.py',
        CAST_WORKER_POLL_MS: 5000,
      },
    },
  ],
};
