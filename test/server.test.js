'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const test = require('node:test');
const { Readable } = require('stream');

const { createServer, handleUpload, proxyHeaders } = require('../src/server/index.js');

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

// fetch() itself refuses to set a raw Connection header (it's on the Fetch
// spec's forbidden-header list) -- ironically the same undici error class
// the original bug produced. nginx isn't bound by that spec and sends it
// anyway, so a faithful repro needs the lower-level http.request(), which
// has no such restriction.
function rawHttpRequest(url, { method = 'GET', headers = {}, body, timeoutMs = 3000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ statusCode: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    // A regression of the hop-by-hop header bug hangs the upstream request
    // rather than erroring fast (matches production: nginx logged "upstream
    // timed out", not an immediate failure) -- without this, that failure
    // mode would hang the whole test run instead of failing the assertion.
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`request timed out after ${timeoutMs}ms -- likely a Connection/hop-by-hop header regression`)));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

test('upload helper writes the file and manifest', async () => {
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cast-upload-'));
  const body = JSON.stringify({
    fileName: 'episode.mp3',
    contentType: 'audio/mpeg',
    dataBase64: Buffer.from('hello world').toString('base64'),
  });

  const req = Readable.from([Buffer.from(body)]);
  req.headers = { 'content-type': 'application/json' };
  req.method = 'POST';
  req.url = '/ui-api/uploads';

  const chunks = [];
  const res = {
    statusCode: 200,
    headers: {},
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
    end(chunk) {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    },
  };

  await handleUpload(req, res, { uploadDir });
  assert.strictEqual(res.statusCode, 201);
  const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  assert.ok(payload.uploadId.startsWith('cast_upload_'));
  assert.ok(fs.existsSync(path.join(uploadDir, `${payload.uploadId}.json`)));
  assert.ok(fs.existsSync(payload.path));
});

test('proxyHeaders drops hop-by-hop headers and the browser Origin, keeps everything else', () => {
  // Regression coverage for two incidents that only ever showed up through
  // a real browser (curl never reproduced either, since curl doesn't send
  // Origin and doesn't add nginx's Connection: upgrade boilerplate):
  // - Origin forwarded verbatim tripped the upstream API's CORS allowlist,
  //   turning every real /api/cast/jobs/quote call into a 500.
  // - Connection: upgrade forwarded verbatim made the upstream API hang
  //   trying to negotiate a protocol upgrade nobody asked for, so
  //   /ui-api/payments/credits/quote timed out behind nginx.
  const result = proxyHeaders({
    host: 'cast.e3d.ai',
    origin: 'https://cast.e3d.ai',
    connection: 'upgrade',
    upgrade: 'websocket',
    'keep-alive': 'timeout=5',
    'proxy-authenticate': 'Basic',
    'proxy-authorization': 'Basic abc',
    te: 'trailers',
    trailer: 'X-Foo',
    'transfer-encoding': 'chunked',
    'content-type': 'application/json',
    authorization: 'Bearer some-key',
    'x-real-ip': '1.2.3.4',
    'x-forwarded-for': '1.2.3.4',
    'x-forwarded-proto': 'https',
    accept: '*/*',
  });

  for (const dropped of ['host', 'origin', 'connection', 'upgrade', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding']) {
    assert.strictEqual(result[dropped], undefined, `expected ${dropped} to be stripped`);
  }
  assert.strictEqual(result['content-type'], 'application/json');
  assert.strictEqual(result.authorization, 'Bearer some-key');
  assert.strictEqual(result['x-real-ip'], '1.2.3.4');
  assert.strictEqual(result['x-forwarded-for'], '1.2.3.4');
  assert.strictEqual(result['x-forwarded-proto'], 'https');
  assert.strictEqual(result.accept, '*/*');
});

test('proxyHeaders is case-insensitive when dropping headers', () => {
  const result = proxyHeaders({
    Origin: 'https://cast.e3d.ai',
    Connection: 'upgrade',
    Host: 'cast.e3d.ai',
    'Content-Type': 'application/json',
  });
  assert.strictEqual(result.Origin, undefined);
  assert.strictEqual(result.Connection, undefined);
  assert.strictEqual(result.Host, undefined);
  assert.strictEqual(result['Content-Type'], 'application/json');
});

test('forwardServiceCall never relays Origin or Connection to the upstream API', async () => {
  let receivedHeaders = null;
  const upstream = http.createServer((req, res) => {
    receivedHeaders = req.headers;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: true }));
  });
  const upstreamPort = await listen(upstream);

  const uiDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cast-ui-'));
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cast-upload-'));
  const server = createServer({
    rootDir: uiDir,
    uiDir,
    uploadDir,
    spacepacketApiUrl: `http://127.0.0.1:${upstreamPort}`,
  });
  const port = await listen(server);

  try {
    const body = JSON.stringify({ product: 'cast' });
    const response = await rawHttpRequest(`http://127.0.0.1:${port}/ui-api/payments/credits/quote`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
        // Exactly what a real browser and production nginx send, and what
        // curl/fetch don't -- this is what made the original bugs
        // invisible to manual curl testing.
        origin: 'https://cast.e3d.ai',
        connection: 'upgrade',
      },
      body,
    });
    assert.strictEqual(response.statusCode, 200);
    assert.ok(receivedHeaders, 'upstream must have received the proxied request');
    assert.strictEqual(receivedHeaders.origin, undefined, 'the client Origin must never reach the upstream');
    // The outgoing fetch() to the upstream sets its own Connection header
    // (normal HTTP/1.1 keep-alive) -- that's fine. What must never happen
    // is the *client's* value ("upgrade", from nginx's boilerplate) making
    // it through, which is what caused the upstream to hang.
    assert.notStrictEqual(receivedHeaders.connection, 'upgrade', "the client's Connection: upgrade must never reach the upstream");
  } finally {
    await close(server);
    await close(upstream);
  }
});

test('/samples/* serves public assets with Range support and rejects path traversal', async () => {
  const uiDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cast-ui-'));
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cast-upload-'));
  const publicSamplesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cast-samples-'));
  const secretDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cast-secret-'));
  fs.writeFileSync(path.join(secretDir, 'private.txt'), 'should never be served');

  const content = Buffer.from('0123456789'.repeat(10)); // 100 bytes, easy to slice by hand
  fs.writeFileSync(path.join(publicSamplesDir, 'clip.mp4'), content);

  const server = createServer({ rootDir: uiDir, uiDir, uploadDir, publicSamplesDir });
  const port = await listen(server);

  try {
    // Full file, no Range header.
    const full = await rawHttpRequest(`http://127.0.0.1:${port}/samples/clip.mp4`);
    assert.strictEqual(full.statusCode, 200);
    assert.strictEqual(Buffer.byteLength(full.body), content.length);

    // A specific byte range.
    const ranged = await rawHttpRequest(`http://127.0.0.1:${port}/samples/clip.mp4`, {
      headers: { range: 'bytes=10-19' },
    });
    assert.strictEqual(ranged.statusCode, 206);
    assert.strictEqual(ranged.body, content.slice(10, 20).toString());

    // Open-ended range (from byte 90 to the end).
    const openEnded = await rawHttpRequest(`http://127.0.0.1:${port}/samples/clip.mp4`, {
      headers: { range: 'bytes=90-' },
    });
    assert.strictEqual(openEnded.statusCode, 206);
    assert.strictEqual(openEnded.body, content.slice(90).toString());

    // A range past the end of the file must be rejected, not silently clamped.
    const outOfRange = await rawHttpRequest(`http://127.0.0.1:${port}/samples/clip.mp4`, {
      headers: { range: 'bytes=200-300' },
    });
    assert.strictEqual(outOfRange.statusCode, 416);

    // Traversal attempts must never escape publicSamplesDir. Both payloads
    // are constructed to survive Node's URL parser unmangled (it decodes
    // literal ".." segments itself -- e.g. /samples/%2e%2e/x collapses to
    // /x before this code ever runs, so that spelling wouldn't actually
    // exercise our own check at all). Don't just trust that a browser,
    // curl, or the URL parser would neutralize it -- prove the server's
    // own resolved.startsWith(root) guard rejects it and never returns the
    // secret file's contents.
    //
    // publicSamplesDir and secretDir are sibling temp dirs (both direct
    // children of the OS tmpdir), so exactly one ".." reaches the parent.
    const encodedDotDot = await rawHttpRequest(`http://127.0.0.1:${port}/samples/..%2f${path.basename(secretDir)}/private.txt`);
    assert.notStrictEqual(encodedDotDot.statusCode, 200);
    assert.ok(!encodedDotDot.body.includes('should never be served'));

    // path.resolve(base, '/etc/passwd') ignores `base` entirely and returns
    // '/etc/passwd' -- a request path with a doubled slash produces exactly
    // that absolute second argument once the /samples/ prefix is stripped.
    const absoluteInjection = await rawHttpRequest(`http://127.0.0.1:${port}/samples//${path.join(secretDir, 'private.txt')}`);
    assert.notStrictEqual(absoluteInjection.statusCode, 200);
    assert.ok(!absoluteInjection.body.includes('should never be served'));

    // Nonexistent sample file.
    const missing = await rawHttpRequest(`http://127.0.0.1:${port}/samples/does-not-exist.mp4`);
    assert.strictEqual(missing.statusCode, 404);
  } finally {
    await close(server);
  }
});
