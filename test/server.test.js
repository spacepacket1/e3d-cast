'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const { Readable } = require('stream');

const { handleUpload } = require('../src/server/index.js');

test('upload helper writes the file and manifest', async () => {
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pod2vid-upload-'));
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
  assert.ok(payload.uploadId.startsWith('pod2vid_upload_'));
  assert.ok(fs.existsSync(path.join(uploadDir, `${payload.uploadId}.json`)));
  assert.ok(fs.existsSync(payload.path));
});
