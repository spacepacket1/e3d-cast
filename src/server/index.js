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

function proxyHeaders(reqHeaders, extraHeaders = {}) {
  const headers = { ...extraHeaders };
  for (const [key, value] of Object.entries(reqHeaders || {})) {
    if (value == null) continue;
    if (key.toLowerCase() === 'host') continue;
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
  const uploadId = `pod2vid_upload_${crypto.randomBytes(8).toString('hex')}`;
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
  if (!serviceToken) {
    return json(res, 503, {
      error: 'SPACEPACKET_SERVICE_BEARER_TOKEN is not configured',
      code: 'SERVICE_TOKEN_MISSING',
    });
  }
  const routePath = req.url.replace(/^\/ui-api/, '/api');
  const target = new URL(routePath, targetBaseUrl);
  const body = await readBody(req);
  const response = await fetch(target, {
    method: req.method,
    headers: proxyHeaders(req.headers, {
      authorization: `Bearer ${serviceToken}`,
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
  res.end(fs.readFileSync(filePath));
}

function createServer(config = {}) {
  const rootDir = config.rootDir || path.resolve(__dirname, '..', '..');
  const uiDir = config.uiDir || getEnv('POD2VID_UI_DIR', path.join(rootDir, 'src', 'ui'));
  const targetBaseUrl = config.spacepacketApiUrl || getEnv('SPACEPACKET_API_URL', 'http://localhost:3000');
  const uploadDir = config.uploadDir || getEnv('POD2VID_UPLOAD_DIR', path.join(getEnv('POD2VID_STORAGE_DIR', '/tmp/e3d-pod2vid'), 'uploads'));
  const publicBaseUrl = getEnv('POD2VID_PUBLIC_BASE_URL', 'https://pod2vid.e3d.ai');
  const getE3dUrl = getEnv('POD2VID_GET_E3D_URL', 'https://e3d.ai/token');
  const serviceToken = getEnv('SPACEPACKET_SERVICE_BEARER_TOKEN', '');
  const allowFreeSampleRender = getEnv('POD2VID_ALLOW_FREE_SAMPLE_RENDER', 'true') !== 'false';

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
  const port = Number(getEnv('POD2VID_UI_PORT', '3200'));
  const server = createServer();
  server.listen(port, () => {
    console.log(`Pod2Vid UI server listening on http://127.0.0.1:${port}`);
  });
}

module.exports = {
  createServer,
  handleUpload,
  loadDotEnv,
};
