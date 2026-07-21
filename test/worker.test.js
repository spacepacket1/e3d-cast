'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');

const { processNextQueuedJob, buildWorkerManifest } = require('../src/worker/index.js');

test('buildWorkerManifest defaults transcriptionEngine to assemblyai and passes through "local"', async () => {
  const baseJob = {
    jobId: 'cast_job_engine_test',
    inputKind: 'transcript',
    outputPreset: 'youtube',
    tier: 'starter',
    options: { subtitleStyle: 'clean_podcast', transcriptText: 'Host: Hi.' },
  };
  const config = { storageDir: '/tmp/cast-test-storage' };

  const defaultManifest = await buildWorkerManifest(baseJob, config);
  assert.strictEqual(defaultManifest.options.transcriptionEngine, 'assemblyai');

  const localManifest = await buildWorkerManifest(
    { ...baseJob, options: { ...baseJob.options, transcriptionEngine: 'local' } },
    config,
  );
  assert.strictEqual(localManifest.options.transcriptionEngine, 'local');

  const bogusManifest = await buildWorkerManifest(
    { ...baseJob, options: { ...baseJob.options, transcriptionEngine: 'deepgram' } },
    config,
  );
  assert.strictEqual(bogusManifest.options.transcriptionEngine, 'assemblyai');
});

test('worker claims a queued job, runs the runner, and writes artifacts back to the API store', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cast-worker-'));
  const storageDir = path.join(tempDir, 'storage');
  const uploadDir = path.join(storageDir, 'uploads');
  const manifestDir = path.join(storageDir, 'worker-manifests');
  fs.mkdirSync(path.join(storageDir, 'jobs'), { recursive: true });
  fs.mkdirSync(uploadDir, { recursive: true });
  fs.mkdirSync(manifestDir, { recursive: true });

  const runnerPath = path.join(tempDir, 'fake-runner.js');
  fs.writeFileSync(runnerPath, `#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const jobDir = path.join(process.env.CAST_STORAGE_DIR, 'jobs', manifest.jobId);
const artifactDir = path.join(jobDir, 'artifacts');
fs.mkdirSync(artifactDir, { recursive: true });
const videoPath = path.join(artifactDir, 'video.mp4');
const manifestPath = path.join(artifactDir, 'job-manifest.json');
fs.writeFileSync(videoPath, Buffer.from('video bytes'));
fs.writeFileSync(manifestPath, JSON.stringify({ jobId: manifest.jobId }, null, 2));
const artifactManifest = {
  jobId: manifest.jobId,
  localRetentionExpiresAt: '2026-07-01T00:00:00.000Z',
  artifacts: [
    {
      artifactId: 'video',
      type: 'mp4',
      contentType: 'video/mp4',
      bytes: 11,
      sha256: 'sha-video',
      path: videoPath
    },
    {
      artifactId: 'job_manifest',
      type: 'manifest',
      contentType: 'application/json',
      bytes: fs.statSync(manifestPath).size,
      sha256: 'sha-manifest',
      path: manifestPath
    }
  ]
};
fs.writeFileSync(path.join(jobDir, 'artifact-manifest.json'), JSON.stringify(artifactManifest, null, 2));
fs.writeFileSync(path.join(jobDir, 'result.json'), JSON.stringify({
  jobId: manifest.jobId,
  status: 'succeeded',
  finishedAt: '2026-07-01T00:00:00.000Z'
}, null, 2));
console.log(JSON.stringify({ event: 'job.started', jobId: manifest.jobId }));
console.log(JSON.stringify({ event: 'job.completed', jobId: manifest.jobId, status: 'succeeded' }));
`);
  fs.chmodSync(runnerPath, 0o755);

  const uploadId = 'cast_upload_test';
  const uploadFile = path.join(uploadDir, `${uploadId}.mp3`);
  fs.writeFileSync(uploadFile, Buffer.from('audio'));
  fs.writeFileSync(path.join(uploadDir, `${uploadId}.json`), JSON.stringify({
    uploadId,
    fileName: 'episode.mp3',
    sizeBytes: 5,
    path: uploadFile,
  }, null, 2));

  const jobPath = path.join(storageDir, 'jobs', 'cast_job_test.json');
  fs.writeFileSync(jobPath, JSON.stringify({
    jobId: 'cast_job_test',
    status: 'queued',
    createdAt: '2026-06-30T00:00:00.000Z',
    inputKind: 'upload',
    inputUri: uploadId,
    outputPreset: 'youtube',
    tier: 'starter',
    options: {
      dryRun: false,
      subtitleStyle: 'developer_demo',
      brandEndCard: true,
      archiveToIpfs: false,
    },
    webhookStatus: 'none',
    webhookAttempts: [],
  }, null, 2));

  const job = await processNextQueuedJob({
    storageDir,
    uploadDir,
    manifestDir,
    pollMs: 5,
    timeoutMs: 10_000,
    runnerPath,
    pipelineDir: tempDir,
  });

  assert(job);
  const stored = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
  assert.strictEqual(stored.status, 'succeeded');
  assert.ok(Array.isArray(stored.artifacts));
  assert.ok(stored.artifacts.some((artifact) => artifact.artifactId === 'video'));
  assert.ok(stored.artifacts.some((artifact) => artifact.artifactId === 'manifest'));
  assert.ok(fs.existsSync(path.join(storageDir, 'artifacts', 'cast_job_test', 'video.mp4')));
});
