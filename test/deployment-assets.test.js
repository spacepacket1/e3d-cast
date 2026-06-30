'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const ecosystem = require('../ecosystem.config.js');

const repoRoot = path.join(__dirname, '..');

test('pm2 ecosystem defines cast ui and worker processes', () => {
  const apps = Array.isArray(ecosystem.apps) ? ecosystem.apps : [];
  const names = apps.map((app) => app.name);

  assert.ok(names.includes('cast-ui'));
  assert.ok(names.includes('cast-worker'));

  const uiApp = apps.find((app) => app.name === 'cast-ui');
  const workerApp = apps.find((app) => app.name === 'cast-worker');

  assert.strictEqual(uiApp.script, 'src/server/index.js');
  assert.strictEqual(uiApp.env.CAST_UI_PORT, 3200);
  assert.strictEqual(uiApp.env.CAST_UI_DIR, 'dist');

  assert.strictEqual(workerApp.script, 'src/worker/index.js');
  assert.strictEqual(workerApp.instances, 1);
  assert.strictEqual(workerApp.env.CAST_JOB_RUNNER, '/home/ubuntu/e3d-pod2vid/bin/pod2vid-job.py');
});

test('nginx deployment config enforces tls, upload limits, and required proxy routes', () => {
  const configPath = path.join(repoRoot, 'deploy', 'nginx', 'cast.e3d.ai.conf');
  const config = fs.readFileSync(configPath, 'utf8');

  assert.match(config, /listen 80;/);
  assert.match(config, /return 301 https:\/\/\$host\$request_uri;/);
  assert.match(config, /listen 443 ssl http2;/);
  assert.match(config, /client_max_body_size 500m;/);
  assert.match(config, /ssl_certificate \/etc\/letsencrypt\/live\/cast\.e3d\.ai\/fullchain\.pem;/);
  assert.match(config, /location \/api\/cast\/\s*\{[\s\S]*proxy_pass http:\/\/127\.0\.0\.1:3000;/);
  assert.match(config, /location \/api\/payments\/\s*\{[\s\S]*proxy_pass http:\/\/127\.0\.0\.1:3000;/);
  assert.match(config, /location \/openapi\/\s*\{[\s\S]*proxy_pass http:\/\/127\.0\.0\.1:3000;/);
  assert.match(config, /location \/llms\.txt\s*\{[\s\S]*proxy_pass http:\/\/127\.0\.0\.1:3000;/);
  assert.match(config, /location \/\s*\{[\s\S]*proxy_pass http:\/\/127\.0\.0\.1:3200;/);
});

test('deployment documentation includes production verification and rollback instructions', () => {
  const docsPath = path.join(repoRoot, 'docs', 'deployment.md');
  const docs = fs.readFileSync(docsPath, 'utf8');

  assert.match(docs, /npm run smoke:deploy/);
  assert.match(docs, /\/api\/cast\/health/);
  assert.match(docs, /Get E3D/);
  assert.match(docs, /Rollback/);
  assert.match(docs, /pm2 reload ecosystem\.config\.js --only cast-ui,cast-worker/);
  assert.match(docs, /nginx -t && systemctl reload nginx/);
});
