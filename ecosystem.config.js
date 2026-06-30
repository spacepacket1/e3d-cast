module.exports = {
  apps: [
    {
      name: 'pod2vid-ui',
      script: 'node_modules/.bin/vite',
      args: 'preview --port 3200',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'pod2vid-worker',
      script: 'src/worker/index.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
        POD2VID_PIPELINE_DIR: '/home/ubuntu/e3d-pod2vid',
        POD2VID_JOB_RUNNER: '/home/ubuntu/e3d-pod2vid/bin/pod2vid-job.py',
      },
    },
  ],
};
