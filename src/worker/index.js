'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const TIER_CONFIG = {
  free: { retentionHours: 24, watermarked: true },
  starter: { retentionHours: 24 * 7, watermarked: false },
  pro: { retentionHours: 24 * 30, watermarked: false },
  studio: { retentionHours: 24 * 90, watermarked: false },
};

const WEBHOOK_RETRY_MS = [250, 1000, 2500];

function loadDotEnv(cwd) {
  const filePath = path.join(cwd, '.env');
  if (!fs.existsSync(filePath)) return;
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadDotEnv(process.cwd());

function getEnv(name, fallback = '') {
  const value = process.env[name];
  return value == null || value === '' ? fallback : String(value);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJsonAtomic(filePath, payload) {
  ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2));
  fs.renameSync(tempPath, filePath);
}

function appendLog(job, message) {
  const current = String(job.workerLogTail || '').trim();
  const parts = current ? current.split('\n').slice(-11) : [];
  parts.push(message);
  job.workerLogTail = parts.slice(-12).join('\n');
}

function jobRecordPath(storageDir, jobId) {
  return path.join(storageDir, 'jobs', `${jobId}.json`);
}

function pipelineJobDir(storageDir, jobId) {
  return path.join(storageDir, 'jobs', jobId);
}

function artifactStoreDir(storageDir, jobId) {
  return path.join(storageDir, 'artifacts', jobId);
}

function nowIso() {
  return new Date().toISOString();
}

function safeFileName(value, fallback) {
  const normalized = String(value || '').replace(/[^a-zA-Z0-9._-]+/g, '-');
  return normalized || fallback;
}

function normalizeArtifactId(artifactId) {
  return artifactId === 'job_manifest' ? 'manifest' : artifactId;
}

function buildRunnerCommand(runnerPath, manifestPath) {
  return runnerPath.endsWith('.py') ? ['python3', runnerPath, manifestPath] : [runnerPath, manifestPath];
}

function loadUploadRecord(uploadDir, uploadId) {
  const manifestPath = path.join(uploadDir, `${uploadId}.json`);
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing upload record for ${uploadId}`);
  }
  return readJson(manifestPath);
}

async function downloadUrlToFile(url, destinationPath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download source URL: ${response.status}`);
  }
  ensureDir(path.dirname(destinationPath));
  fs.writeFileSync(destinationPath, Buffer.from(await response.arrayBuffer()));
}

async function buildWorkerManifest(job, config) {
  const tier = TIER_CONFIG[job.tier] || TIER_CONFIG.starter;
  const manifest = {
    kind: 'cast_job',
    version: '1.0',
    jobId: job.jobId,
    parentJobId: job.parentJobId || undefined,
    mode: job.revisionType ? 'revision' : 'render',
    dryRun: !!(job.options && job.options.dryRun),
    preset: job.outputPreset,
    tier: job.tier || 'starter',
    retentionHours: tier.retentionHours,
    options: {
      subtitleStyle: (job.options && job.options.subtitleStyle) || 'clean_podcast',
      voicePreset: job.options && job.options.voicePreset,
      generateThumbnail: job.options && job.options.generateThumbnail === false ? false : true,
      brandEndCard: job.options && job.options.brandEndCard === false ? false : true,
      archiveToIpfs: !!(job.options && job.options.archiveToIpfs),
      transcriptionEngine: (job.options && job.options.transcriptionEngine === 'local') ? 'local' : 'assemblyai',
    },
    brandKit: {
      endCard: job.options && job.options.brandEndCard === false ? false : true,
      watermarkMode: tier.watermarked ? 'force_on' : 'tier_default',
      watermarkText: tier.watermarked ? 'cast.e3d.ai' : 'Made with Cast',
    },
    platformMetadata: {
      title: job.options && job.options.title,
      description: job.options && job.options.description,
      tags: Array.isArray(job.options && job.options.tags) ? job.options.tags : [],
      chapters: Array.isArray(job.options && job.options.chapters) ? job.options.chapters : [],
      platforms: Array.isArray(job.options && job.options.platforms) ? job.options.platforms : [],
    },
    storage: {
      rootDir: config.storageDir,
    },
  };

  if (job.inputKind === 'transcript') {
    manifest.input = {
      kind: 'transcript',
      text: job.options && job.options.transcriptText ? job.options.transcriptText : 'Transcript redacted in queue record',
    };
  } else if (job.inputKind === 'upload') {
    const upload = loadUploadRecord(config.uploadDir, job.inputUri);
    manifest.input = {
      kind: 'upload',
      path: upload.path,
    };
  } else if (job.inputKind === 'url') {
    const urlExt = path.extname(new URL(job.inputUri).pathname) || '.bin';
    const urlPath = path.join(config.manifestDir, 'resolved-inputs', `${job.jobId}${urlExt}`);
    await downloadUrlToFile(job.inputUri, urlPath);
    manifest.input = {
      kind: 'url',
      path: urlPath,
      resolvedPath: urlPath,
    };
  } else {
    throw new Error(`Unsupported input kind: ${job.inputKind}`);
  }

  if (job.revisionType) {
    manifest.revision = {
      type: job.revisionType,
      subtitleStyle: job.options && job.options.subtitleStyle,
      title: job.options && job.options.title,
      description: job.options && job.options.description,
    };
  }

  return manifest;
}

async function deliverWebhook(job, eventName) {
  if (!job.webhookUrl) return job;
  const payload = {
    event: eventName,
    jobId: job.jobId,
    parentJobId: job.parentJobId || null,
    status: job.status,
    artifactManifestUrl: job.artifactManifestUrl || null,
    errorCode: job.errorCode || null,
    errorMessage: job.errorMessage || null,
  };
  const attempts = Array.isArray(job.webhookAttempts) ? job.webhookAttempts.slice() : [];
  for (let index = 0; index < WEBHOOK_RETRY_MS.length; index += 1) {
    try {
      const response = await fetch(job.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      attempts.push({ attempt: index + 1, deliveredAt: nowIso(), statusCode: response.status });
      job.webhookAttempts = attempts;
      job.webhookStatus = response.ok ? 'delivered' : 'failed';
      if (response.ok) return job;
    } catch (error) {
      attempts.push({ attempt: index + 1, deliveredAt: nowIso(), error: error.message });
    }
    await new Promise((resolve) => setTimeout(resolve, WEBHOOK_RETRY_MS[index]));
  }
  job.webhookAttempts = attempts;
  job.webhookStatus = 'failed';
  return job;
}

function readQueuedJobs(storageDir) {
  const jobsDir = path.join(storageDir, 'jobs');
  if (!fs.existsSync(jobsDir)) return [];
  return fs.readdirSync(jobsDir)
    .filter((entry) => entry.endsWith('.json'))
    .map((entry) => readJson(path.join(jobsDir, entry)))
    .filter((job) => job && job.status === 'queued')
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
}

function claimJob(storageDir, jobId) {
  const filePath = jobRecordPath(storageDir, jobId);
  const job = readJson(filePath);
  if (job.status !== 'queued') return null;
  job.status = 'running';
  job.startedAt = nowIso();
  job.workerLogTail = 'Worker claimed job\nPreparing manifest';
  writeJsonAtomic(filePath, job);
  return job;
}

function copyArtifactToStore(storageDir, jobId, artifact) {
  const targetDir = artifactStoreDir(storageDir, jobId);
  ensureDir(targetDir);
  const normalizedId = normalizeArtifactId(artifact.artifactId);
  const fileName = safeFileName(path.basename(artifact.path || ''), `${normalizedId}.bin`);
  const targetPath = path.join(targetDir, fileName);
  fs.copyFileSync(artifact.path, targetPath);
  return {
    artifactId: normalizedId,
    type: artifact.type,
    contentType: artifact.contentType,
    bytes: artifact.bytes,
    sha256: artifact.sha256,
    fileName,
    path: targetPath,
    ipfsUri: artifact.ipfsUri || null,
    gatewayUrl: artifact.gatewayUrl || null,
  };
}

function finalizeJobSuccess(job, config) {
  const artifactManifestPath = path.join(pipelineJobDir(config.storageDir, job.jobId), 'artifact-manifest.json');
  const artifactManifest = readJson(artifactManifestPath);
  const resultPath = path.join(pipelineJobDir(config.storageDir, job.jobId), 'result.json');
  const result = readJson(resultPath);
  const archiveManifestPath = path.join(pipelineJobDir(config.storageDir, job.jobId), 'archive-manifest.json');
  const archiveManifest = fs.existsSync(archiveManifestPath) ? readJson(archiveManifestPath) : null;

  job.status = 'succeeded';
  job.finishedAt = result.finishedAt || nowIso();
  job.errorCode = '';
  job.errorMessage = '';
  job.artifactExpiresAt = artifactManifest.localRetentionExpiresAt || null;
  job.artifactManifestUrl = `/api/cast/jobs/${job.jobId}/artifacts`;
  job.artifacts = artifactManifest.artifacts.map((artifact) => copyArtifactToStore(config.storageDir, job.jobId, artifact));
  job.actualArtifactBytes = job.artifacts.reduce((sum, artifact) => sum + Number(artifact.bytes || 0), 0);
  if (archiveManifest) {
    job.localArchiveManifestPath = archiveManifestPath;
  }
  appendLog(job, `Completed with ${job.artifacts.length} artifacts`);
}

function finalizeJobFailure(job, errorCode, message) {
  job.status = 'failed';
  job.finishedAt = nowIso();
  job.errorCode = errorCode;
  job.errorMessage = message;
  appendLog(job, `Failed: ${errorCode} ${message}`);
}

function updateJobRecord(storageDir, job) {
  writeJsonAtomic(jobRecordPath(storageDir, job.jobId), job);
}

function parseProgressLine(job, rawLine) {
  const line = String(rawLine || '').trim();
  if (!line) return;
  try {
    const payload = JSON.parse(line);
    if (payload.event === 'job.started') {
      appendLog(job, `Started ${payload.mode}/${payload.preset}`);
      return;
    }
    if (payload.event === 'job.completed') {
      appendLog(job, `Worker result: ${payload.status}`);
      return;
    }
    appendLog(job, `${payload.event || 'worker.event'} ${JSON.stringify(payload)}`);
  } catch (_error) {
    appendLog(job, line);
  }
}

async function runRunner(manifestPath, config, job) {
  const command = buildRunnerCommand(config.runnerPath, manifestPath);
  const child = spawn(command[0], command.slice(1), {
    cwd: config.pipelineDir,
    env: {
      ...process.env,
      CAST_STORAGE_DIR: config.storageDir,
      CAST_PIPELINE_DIR: config.pipelineDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const exitCode = await new Promise((resolve, reject) => {
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      child.kill('SIGKILL');
      reject(new Error('ERR_WORKER_TIMEOUT'));
    }, config.timeoutMs);

    child.stdout.on('data', (chunk) => {
      for (const line of String(chunk).split(/\r?\n/)) {
        parseProgressLine(job, line);
      }
      updateJobRecord(config.storageDir, job);
    });

    child.stderr.on('data', (chunk) => {
      for (const line of String(chunk).split(/\r?\n/)) {
        if (line.trim()) appendLog(job, `stderr: ${line.trim()}`);
      }
      updateJobRecord(config.storageDir, job);
    });

    child.on('error', (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve(code);
    });
  });

  return exitCode;
}

async function processJob(job, config) {
  const manifest = await buildWorkerManifest(job, config);
  ensureDir(config.manifestDir);
  const manifestPath = path.join(config.manifestDir, `${job.jobId}.json`);
  writeJsonAtomic(manifestPath, manifest);
  appendLog(job, `Manifest written to ${manifestPath}`);
  updateJobRecord(config.storageDir, job);

  try {
    const exitCode = await runRunner(manifestPath, config, job);
    if (exitCode !== 0) {
      finalizeJobFailure(job, 'ERR_WORKER_EXIT', `Worker exited with code ${exitCode}`);
    } else {
      finalizeJobSuccess(job, config);
    }
  } catch (error) {
    if (error && error.message === 'ERR_WORKER_TIMEOUT') {
      finalizeJobFailure(job, 'ERR_WORKER_TIMEOUT', 'Worker exceeded configured timeout');
    } else {
      finalizeJobFailure(job, 'ERR_WORKER_FAILED', error && error.message ? error.message : 'Worker execution failed');
    }
  }

  if (job.status === 'succeeded' && job.webhookUrl) {
    await deliverWebhook(job, 'job.succeeded');
  } else if (job.status === 'failed' && job.webhookUrl) {
    await deliverWebhook(job, 'job.failed');
  }

  updateJobRecord(config.storageDir, job);
  return job;
}

async function processNextQueuedJob(config = readConfig()) {
  const queued = readQueuedJobs(config.storageDir);
  if (!queued.length) return null;
  const claimed = claimJob(config.storageDir, queued[0].jobId);
  if (!claimed) return null;
  return processJob(claimed, config);
}

function readConfig() {
  const storageDir = getEnv('CAST_STORAGE_DIR', '/tmp/e3d-pod2vid');
  return {
    storageDir,
    uploadDir: getEnv('CAST_UPLOAD_DIR', path.join(storageDir, 'uploads')),
    manifestDir: getEnv('CAST_WORKER_MANIFEST_DIR', path.join(storageDir, 'worker-manifests')),
    pollMs: Number(getEnv('CAST_WORKER_POLL_MS', '5000')),
    timeoutMs: Number(getEnv('CAST_WORKER_TIMEOUT_MS', '1200000')),
    runnerPath: getEnv('CAST_JOB_RUNNER', '/home/ubuntu/e3d-pod2vid/bin/pod2vid-job.py'),
    pipelineDir: getEnv('CAST_PIPELINE_DIR', '/home/ubuntu/e3d-pod2vid'),
  };
}

async function runLoop() {
  const config = readConfig();
  ensureDir(config.storageDir);
  ensureDir(config.uploadDir);
  ensureDir(config.manifestDir);
  console.log(JSON.stringify({ event: 'worker.loop.started', storageDir: config.storageDir, runnerPath: config.runnerPath }));
  for (;;) {
    const processed = await processNextQueuedJob(config);
    if (!processed) {
      await new Promise((resolve) => setTimeout(resolve, config.pollMs));
    }
  }
}

if (require.main === module) {
  runLoop().catch((error) => {
    console.error(JSON.stringify({
      event: 'worker.fatal',
      errorCode: 'ERR_WORKER_FATAL',
      errorMessage: error && error.message ? error.message : 'fatal worker error',
      traceId: crypto.randomBytes(4).toString('hex'),
    }));
    process.exit(1);
  });
}

module.exports = {
  buildWorkerManifest,
  processNextQueuedJob,
  readConfig,
};
