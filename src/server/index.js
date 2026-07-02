'use strict';

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { URL } = require('url');

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

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.js':
      return 'application/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.mp4':
      return 'video/mp4';
    case '.srt':
      return 'application/x-subrip';
    default:
      return 'application/octet-stream';
  }
}

function json(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload, null, 2));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sanitizeFileName(name) {
  return String(name || 'upload.bin').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 120) || 'upload.bin';
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

// Headers describing the browser's own request context, plus the standard
// hop-by-hop headers (RFC 7230 6.1) that only apply to one leg of a proxy
// chain. This proxy call is a trusted server-to-server hop, not the original
// browser request — forwarding it verbatim causes real breakage upstream:
// - origin: trips the upstream API's strict CORS allowlist (it doesn't
//   include cast.e3d.ai), turning into a 500 for every real browser client.
// - connection/upgrade: production nginx unconditionally sends
//   "Connection: upgrade" on this location block (websocket-support
//   boilerplate applied to a plain HTTP proxy). Relayed as-is to the
//   upstream fetch(), the upstream API hangs trying to negotiate a
//   protocol upgrade nobody asked for, and /ui-api/payments/credits/*
//   times out behind nginx even though it answers instantly over loopback.
const DROPPED_PROXY_HEADERS = new Set([
  'host',
  'origin',
  'connection',
  'upgrade',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
]);

function proxyHeaders(reqHeaders, extraHeaders = {}) {
  const headers = { ...extraHeaders };
  for (const [key, value] of Object.entries(reqHeaders || {})) {
    if (value == null) continue;
    if (DROPPED_PROXY_HEADERS.has(key.toLowerCase())) continue;
    headers[key] = value;
  }
  return headers;
}

async function proxyRequest(req, res, targetBaseUrl) {
  const target = new URL(req.url, targetBaseUrl);
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await readBody(req);
  const response = await fetch(target, {
    method: req.method,
    headers: proxyHeaders(req.headers),
    body,
  });
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'transfer-encoding') return;
    res.setHeader(key, value);
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  res.end(buffer);
}

async function handleUpload(req, res, options) {
  const body = JSON.parse(String(await readBody(req) || '{}') || '{}');
  const fileName = sanitizeFileName(body.fileName);
  const uploadId = `cast_upload_${crypto.randomBytes(8).toString('hex')}`;
  const uploadDir = options.uploadDir;
  ensureDir(uploadDir);
  const payload = String(body.dataBase64 || '');
  if (!payload) {
    return json(res, 400, { error: 'dataBase64 is required', code: 'INVALID_UPLOAD_BODY' });
  }
  const fileBuffer = Buffer.from(payload, 'base64');
  const fileExt = path.extname(fileName) || '.bin';
  const storedFileName = `${uploadId}${fileExt}`;
  const filePath = path.join(uploadDir, storedFileName);
  fs.writeFileSync(filePath, fileBuffer);
  const manifest = {
    uploadId,
    fileName,
    contentType: String(body.contentType || 'application/octet-stream'),
    sizeBytes: fileBuffer.length,
    path: filePath,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(uploadDir, `${uploadId}.json`), JSON.stringify(manifest, null, 2));
  return json(res, 201, manifest);
}

async function forwardServiceCall(req, res, targetBaseUrl, serviceToken) {
  // The service token is only used to attribute agent-tier pricing upstream
  // (see productPaymentsRoutes.js handleQuoteCredits/handlePurchaseCredits,
  // which treat it as optional). Wallet purchase quoting/registration works
  // without it, so a missing token must not block those routes entirely.
  const routePath = req.url.replace(/^\/ui-api/, '/api');
  const target = new URL(routePath, targetBaseUrl);
  const body = await readBody(req);
  const response = await fetch(target, {
    method: req.method,
    headers: proxyHeaders(req.headers, {
      ...(serviceToken ? { authorization: `Bearer ${serviceToken}` } : {}),
      'content-type': req.headers['content-type'] || 'application/json',
    }),
    body,
  });
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'transfer-encoding') return;
    res.setHeader(key, value);
  });
  res.end(Buffer.from(await response.arrayBuffer()));
}

function serveFile(res, filePath) {
  if (!fs.existsSync(filePath)) {
    res.statusCode = 404;
    res.end('not found');
    return;
  }
  res.statusCode = 200;
  res.setHeader('content-type', contentTypeFor(filePath));
  // index.html/gallery.html/etc. reference app.js/styles.css by a
  // content-hashed ?v= query string, so *those* are safe to cache far in
  // the future -- but the HTML shell itself was being served with no
  // cache-control at all, leaving each browser's own (inconsistent,
  // sometimes surprisingly sticky) heuristic caching in charge of when a
  // deploy actually became visible. Explicit no-cache forces revalidation
  // on every load instead.
  if (path.extname(filePath).toLowerCase() === '.html') {
    res.setHeader('cache-control', 'no-cache');
  }
  res.end(fs.readFileSync(filePath));
}

// Public sample gallery assets can be large videos, so this streams via
// fs.createReadStream and honors Range requests -- serveFile()'s
// fs.readFileSync would load the entire file into memory per request and
// gives browsers no way to seek or resume a partial download.
function serveSampleAsset(req, res, publicSamplesDir, requestPath) {
  const relative = decodeURIComponent(requestPath.replace(/^\/samples\//, ''));
  const resolved = path.resolve(publicSamplesDir, relative);
  const root = path.resolve(publicSamplesDir) + path.sep;
  if (!resolved.startsWith(root)) {
    res.statusCode = 400;
    res.end('invalid path');
    return;
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    res.statusCode = 404;
    res.end('not found');
    return;
  }
  const stat = fs.statSync(resolved);
  const contentType = contentTypeFor(resolved);
  const range = req.headers ? req.headers.range : null;
  if (!range) {
    res.statusCode = 200;
    res.setHeader('content-type', contentType);
    res.setHeader('content-length', stat.size);
    res.setHeader('accept-ranges', 'bytes');
    fs.createReadStream(resolved).pipe(res);
    return;
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) {
    res.statusCode = 416;
    res.setHeader('content-range', `bytes */${stat.size}`);
    res.end();
    return;
  }
  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Number(match[2]) : stat.size - 1;
  if (start > end || end >= stat.size) {
    res.statusCode = 416;
    res.setHeader('content-range', `bytes */${stat.size}`);
    res.end();
    return;
  }
  res.statusCode = 206;
  res.setHeader('content-type', contentType);
  res.setHeader('content-range', `bytes ${start}-${end}/${stat.size}`);
  res.setHeader('content-length', end - start + 1);
  res.setHeader('accept-ranges', 'bytes');
  fs.createReadStream(resolved, { start, end }).pipe(res);
}

function createServer(config = {}) {
  const rootDir = config.rootDir || path.resolve(__dirname, '..', '..');
  const uiDir = config.uiDir || getEnv('CAST_UI_DIR', path.join(rootDir, 'src', 'ui'));
  const targetBaseUrl = config.spacepacketApiUrl || getEnv('SPACEPACKET_API_URL', 'http://localhost:3000');
  const uploadDir = config.uploadDir || getEnv('CAST_UPLOAD_DIR', path.join(getEnv('CAST_STORAGE_DIR', '/tmp/e3d-pod2vid'), 'uploads'));
  const publicSamplesDir = config.publicSamplesDir || getEnv('CAST_PUBLIC_SAMPLES_DIR', path.join(getEnv('CAST_STORAGE_DIR', '/tmp/e3d-pod2vid'), 'public-samples'));
  const publicBaseUrl = getEnv('CAST_PUBLIC_BASE_URL', 'https://cast.e3d.ai');
  const getE3dUrl = getEnv('CAST_GET_E3D_URL', 'https://e3d.ai/token');
  const serviceToken = getEnv('SPACEPACKET_SERVICE_BEARER_TOKEN', '');
  const allowFreeSampleRender = getEnv('CAST_ALLOW_FREE_SAMPLE_RENDER', 'true') !== 'false';

  ensureDir(uploadDir);

  return http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url, 'http://127.0.0.1');
      if (req.method === 'GET' && requestUrl.pathname === '/ui-api/config') {
        return json(res, 200, {
          publicBaseUrl,
          getE3dUrl,
          allowFreeSampleRender,
          features: {
            uploadMode: true,
            sourceUrlMode: true,
            transcriptMode: true,
            sampleMode: true,
            nftMintAvailable: false,
          },
        });
      }
      if (req.method === 'POST' && requestUrl.pathname === '/ui-api/uploads') {
        return handleUpload(req, res, { uploadDir });
      }
      if (req.method === 'GET' && requestUrl.pathname.startsWith('/samples/')) {
        return serveSampleAsset(req, res, publicSamplesDir, requestUrl.pathname);
      }
      if (
        requestUrl.pathname === '/ui-api/payments/credits/quote'
        || requestUrl.pathname === '/ui-api/payments/credits/purchase'
      ) {
        return forwardServiceCall(req, res, targetBaseUrl, serviceToken);
      }
      if (
        requestUrl.pathname.startsWith('/api/')
        || requestUrl.pathname === '/llms.txt'
        || requestUrl.pathname.startsWith('/.well-known/')
        || requestUrl.pathname.startsWith('/openapi/')
      ) {
        return proxyRequest(req, res, targetBaseUrl);
      }

      const relativePath = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
      const filePath = path.join(uiDir, relativePath);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        return serveFile(res, filePath);
      }
      return serveFile(res, path.join(uiDir, 'index.html'));
    } catch (error) {
      return json(res, 500, {
        error: error && error.message ? error.message : 'internal_error',
        code: 'UI_SERVER_ERROR',
      });
    }
  });
}

if (require.main === module) {
  const port = Number(getEnv('CAST_UI_PORT', '3200'));
  const server = createServer();
  server.listen(port, () => {
    console.log(`Cast UI server listening on http://127.0.0.1:${port}`);
  });
}

module.exports = {
  createServer,
  handleUpload,
  loadDotEnv,
  proxyHeaders,
};
