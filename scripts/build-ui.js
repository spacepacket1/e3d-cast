#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const sourceDir = path.join(rootDir, 'src', 'ui');
const outDir = path.join(rootDir, 'dist');

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

rmrf(outDir);
copyRecursive(sourceDir, outDir);
console.log(`Built static UI to ${outDir}`);
