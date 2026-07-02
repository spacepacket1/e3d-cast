#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const sourceDir = path.join(rootDir, 'src', 'ui');
const outDir = path.join(rootDir, 'dist');
// Cache-busted by content hash below — a browser that already cached
// app.js/styles.css under an old ?v= has no other signal to refetch them.
const CACHE_BUSTED_ASSETS = ['app.js', 'styles.css'];

function rmrf(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function mkdirp(target) {
  fs.mkdirSync(target, { recursive: true });
}

function copyRecursive(from, to) {
  const stat = fs.statSync(from);
  if (stat.isDirectory()) {
    mkdirp(to);
    for (const entry of fs.readdirSync(from)) {
      copyRecursive(path.join(from, entry), path.join(to, entry));
    }
    return;
  }
  mkdirp(path.dirname(to));
  fs.copyFileSync(from, to);
}

function contentHash(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex').slice(0, 10);
}

function bustCacheInHtml(htmlPath, hashesByFileName) {
  let html = fs.readFileSync(htmlPath, 'utf8');
  for (const [fileName, hash] of Object.entries(hashesByFileName)) {
    const escaped = fileName.replace(/\./g, '\\.');
    const pattern = new RegExp(`(/${escaped})(\\?v=[^"'\\s]*)?`, 'g');
    html = html.replace(pattern, `$1?v=${hash}`);
  }
  fs.writeFileSync(htmlPath, html);
}

rmrf(outDir);
copyRecursive(sourceDir, outDir);

const hashesByFileName = {};
for (const fileName of CACHE_BUSTED_ASSETS) {
  const filePath = path.join(outDir, fileName);
  if (fs.existsSync(filePath)) hashesByFileName[fileName] = contentHash(filePath);
}
for (const entry of fs.readdirSync(outDir)) {
  if (entry.endsWith('.html')) bustCacheInHtml(path.join(outDir, entry), hashesByFileName);
}

console.log(`Built static UI to ${outDir}`);
