'use strict';

// SSRF regression tests. The proxy used to build its target with new URL(req.url, upstream): a request path such as "//host:port/..." or
// "/\host:port/..." is a protocol-relative reference that REPLACES the host, so the server fetched the caller's URL (following its redirects to
// loopback and returning the answer). These tests use a listener that plays the attacker and one that plays an internal-only service.

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const test = require('node:test');

const { createServer, isOriginForm, resolveUpstream, BadRequestTarget } = require('../src/server/index.js');

const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const close = (server) => new Promise((resolve) => server.close(resolve));

// Sends an exact request line over a raw socket (http.request refuses control characters and rewrites some shapes). Resolves as soon as the
// response is complete (the proxy copies the upstream's keep-alive header, so waiting for the socket to close would hang).
function rawRequest(port, target, { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(port, '127.0.0.1');
    let data = '';
    let settled = false;
    const finish = () => { if (settled) return; settled = true; sock.destroy(); resolve({ status: Number((/^HTTP\/1\.1 (\d{3})/.exec(data) || [])[1] || 0), body: data }); };
    const complete = () => {
      const i = data.indexOf('\r\n\r\n');
      if (i < 0) return false;
      const head = data.slice(0, i);
      const len = /content-length:\s*(\d+)/i.exec(head);
      if (len) return Buffer.byteLength(data.slice(i + 4)) >= Number(len[1]);
      return /transfer-encoding:\s*chunked/i.test(head) ? data.endsWith('0\r\n\r\n') : false;
    };
    sock.setTimeout(4000, finish);
    sock.on('data', (c) => { data += c; if (complete()) finish(); });
    sock.on('error', (e) => { if (!settled) reject(e); });
    sock.on('close', finish);
    const h = Object.entries({ host: 'cast.test', connection: 'close', ...headers }).map(([k, v]) => `${k}: ${v}`).join('\r\n');
    sock.write(`${method} ${target} HTTP/1.1\r\n${h}\r\n\r\n`);
  });
}

async function rig({ serviceToken = '' } = {}) {
  const seen = { upstream: [], attacker: [], internal: [] };
  const upstream = http.createServer((req, res) => { seen.upstream.push({ url: req.url, headers: req.headers }); res.setHeader('content-type', 'application/json'); res.end('{"ok":true}'); });
  const internal = http.createServer((req, res) => { seen.internal.push(req.url); res.end('INTERNAL-SECRET'); });
  const upstreamPort = await listen(upstream);
  const internalPort = await listen(internal);
  // The attacker's listener answers every request with a redirect to the internal service, as an SSRF probe would.
  const attacker = http.createServer((req, res) => { seen.attacker.push({ url: req.url, headers: req.headers }); res.statusCode = 307; res.setHeader('location', `http://127.0.0.1:${internalPort}/secret`); res.end(); });
  const attackerPort = await listen(attacker);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cast-ssrf-'));
  const prev = process.env.SPACEPACKET_SERVICE_BEARER_TOKEN;
  process.env.SPACEPACKET_SERVICE_BEARER_TOKEN = serviceToken;
  const server = createServer({ rootDir: dir, uiDir: dir, uploadDir: dir, spacepacketApiUrl: `http://127.0.0.1:${upstreamPort}` });
  if (prev === undefined) delete process.env.SPACEPACKET_SERVICE_BEARER_TOKEN; else process.env.SPACEPACKET_SERVICE_BEARER_TOKEN = prev;
  const port = await listen(server);
  return { seen, port, attackerPort, internalPort, upstreamPort, done: () => Promise.all([close(server), close(upstream), close(attacker), close(internal)]) };
}

test('isOriginForm accepts plain paths and rejects every host-replacing shape', () => {
  for (const ok of ['/', '/api/x', '/api/x?y=1&z=2', '/ui-api/payments/credits/quote', '/api/%5Cfoo', '/a//b', '/samples/a/b.mp4', '/x?u=http://h:1/']) assert.ok(isOriginForm(ok), `should accept ${JSON.stringify(ok)}`);
  for (const bad of ['//h:1/x', '///h/x', '/\\h:1/x', '/\\\\h/x', '\\\\h/x', 'http://h:1/x', '*', '', undefined, 'api/x', '/\t/h:1/x', '/\n/h/x', '/\r/h/x', '/a\u0000b']) assert.ok(!isOriginForm(bad), `should reject ${JSON.stringify(bad)}`);
});

test('resolveUpstream returns a URL on the configured origin and nothing else', () => {
  const t = resolveUpstream('/api/x?y=1', 'http://127.0.0.1:3000');
  assert.strictEqual(t.origin, 'http://127.0.0.1:3000');
  assert.strictEqual(t.pathname + t.search, '/api/x?y=1');
  assert.strictEqual(resolveUpstream('/api/%5Chost:1/x', 'http://127.0.0.1:3000').origin, 'http://127.0.0.1:3000');
  for (const bad of ['//evil:1/x', '/\\evil:1/x', '/\t/evil:1/x', 'http://evil:1/x', '@evil/x']) assert.throws(() => resolveUpstream(bad, 'http://127.0.0.1:3000'), BadRequestTarget, bad);
});

test('a host-replacing request target never reaches the attacker, on the proxy or the service-call route', async () => {
  const r = await rig({ serviceToken: 'SERVICE-TOKEN-SENTINEL' });
  try {
    const A = `127.0.0.1:${r.attackerPort}`;
    const shapes = [
      `//${A}/api/r?to=x`, `/\\${A}/api/r?to=x`, `//${A}/ui-api/payments/credits/quote`, `/\\${A}/ui-api/payments/credits/quote`,
      `///${A}/api/x`, `/%5C${A}/api/x`.replace('%5C', '\\'), `/\t/${A}/api/x`, `/\r/${A}/api/x`.replace('\r', '\t'),
      `//${A}/.well-known/x`, `//${A}/openapi/x`, `//${A}/llms.txt`, `//${A}/`, `//${A}/samples/x`,
    ];
    for (const target of shapes) {
      const res = await rawRequest(r.port, target);
      assert.ok(res.status === 400 || res.status === 0, `target ${JSON.stringify(target)} must be refused (got ${res.status})`);
    }
    assert.strictEqual(r.seen.attacker.length, 0, 'the attacker listener must never be contacted');
    assert.strictEqual(r.seen.internal.length, 0, 'the internal service must never be contacted');
    assert.strictEqual(r.seen.upstream.length, 0, 'nothing refused may reach the real upstream either');
  } finally { await r.done(); }
});

test('the service token is only ever sent to the configured upstream', async () => {
  const r = await rig({ serviceToken: 'SERVICE-TOKEN-SENTINEL' });
  try {
    await rawRequest(r.port, `//127.0.0.1:${r.attackerPort}/ui-api/payments/credits/quote`);
    assert.strictEqual(r.seen.attacker.length, 0);
    const ok = await rawRequest(r.port, '/ui-api/payments/credits/quote');
    assert.strictEqual(ok.status, 200);
    assert.strictEqual(r.seen.upstream.length, 1);
    assert.strictEqual(r.seen.upstream[0].headers.authorization, 'Bearer SERVICE-TOKEN-SENTINEL', 'the legitimate call still carries the token');
  } finally { await r.done(); }
});

test('a redirect from the upstream is returned to the caller, not followed to an internal service', async () => {
  const r = await rig();
  try {
    // Re-point: make the configured upstream itself answer with a redirect to the internal service.
    const redirecting = http.createServer((req, res) => { res.statusCode = 307; res.setHeader('location', `http://127.0.0.1:${r.internalPort}/secret`); res.end(); });
    const rp = await listen(redirecting);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cast-ssrf-'));
    const server = createServer({ rootDir: dir, uiDir: dir, uploadDir: dir, spacepacketApiUrl: `http://127.0.0.1:${rp}` });
    const port = await listen(server);
    try {
      for (const target of ['/api/anything', '/ui-api/payments/stripe/packs']) {
        const res = await rawRequest(port, target);
        assert.strictEqual(res.status, 307, `${target}: the redirect is passed through`);
        assert.ok(!res.body.includes('INTERNAL-SECRET'), 'the internal answer must not be relayed');
      }
      assert.strictEqual(r.seen.internal.length, 0, 'the redirect must not be followed');
    } finally { await close(server); await close(redirecting); }
  } finally { await r.done(); }
});

test('ordinary proxying still works: path, query string and method reach the upstream unchanged', async () => {
  const r = await rig();
  try {
    const get = await rawRequest(r.port, '/api/things?a=1&b=two');
    assert.strictEqual(get.status, 200);
    assert.strictEqual(r.seen.upstream[0].url, '/api/things?a=1&b=two');
    const odd = await rawRequest(r.port, '/api/%5Chost:1/x');
    assert.strictEqual(odd.status, 200, 'an encoded backslash is just data inside a path');
    assert.strictEqual(r.seen.upstream[1].url, '/api/%5Chost:1/x');
    assert.strictEqual(r.seen.attacker.length, 0);
  } finally { await r.done(); }
});
