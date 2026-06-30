'use strict';

const assert = require('assert');
const path = require('path');
const test = require('node:test');
const { Readable } = require('stream');

const { createServer } = require('../src/server/index.js');

async function invoke(server, { method, url, headers, body }) {
  const req = Readable.from(body ? [Buffer.from(body)] : []);
  req.method = method;
  req.url = url;
  req.headers = headers || {};

  const chunks = [];
  const res = {
    statusCode: 200,
    headers: {},
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
    end(chunk) {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      this.finished = true;
      if (this._resolve) this._resolve();
    },
  };

  await new Promise((resolve) => {
    res._resolve = resolve;
    server.emit('request', req, res);
  });

  return {
    statusCode: res.statusCode,
    headers: res.headers,
    body: Buffer.concat(chunks).toString('utf8'),
  };
}

test('ui config returns the configured public base URL and Get E3D link', async () => {
  process.env.CAST_PUBLIC_BASE_URL = 'https://cast.e3d.ai';
  process.env.CAST_GET_E3D_URL = 'https://e3d.ai/token';
  const server = createServer({
    rootDir: process.cwd(),
    uiDir: path.join(process.cwd(), 'src', 'ui'),
  });

  try {
    const response = await invoke(server, { method: 'GET', url: '/ui-api/config' });
    assert.strictEqual(response.statusCode, 200);
    const payload = JSON.parse(response.body);
    assert.strictEqual(payload.publicBaseUrl, 'https://cast.e3d.ai');
    assert.strictEqual(payload.getE3dUrl, 'https://e3d.ai/token');
  } finally {
    delete process.env.CAST_PUBLIC_BASE_URL;
    delete process.env.CAST_GET_E3D_URL;
  }
});

test('ui home serves the workspace shell', async () => {
  const server = createServer({
    rootDir: process.cwd(),
    uiDir: path.join(process.cwd(), 'src', 'ui'),
  });

  const response = await invoke(server, { method: 'GET', url: '/' });
  assert.strictEqual(response.statusCode, 200);
  assert.match(response.body, /Cast on E3D/);
  assert.match(response.body, /id="get-e3d-link"/);
});
