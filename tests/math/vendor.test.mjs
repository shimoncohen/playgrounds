import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VENDOR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'math-quest', 'vendor');
const FILES = ['katex/katex.min.js', 'katex/katex.min.css', 'katex/fonts/KaTeX_Main-Regular.woff2', 'mathjs/math.js', 'mathlive/mathlive.min.js', 'three/three.min.js'];

function load(file) {
  const sandbox = {};
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(VENDOR, file), 'utf8'), sandbox, { filename: file });
  return sandbox;
}

test('vendored files exist and are non-empty', () => {
  for (const f of FILES) assert.ok(fs.statSync(path.join(VENDOR, f)).size > 0, f);
});

test('math.js defines math.evaluate', () => {
  assert.equal(load('mathjs/math.js').math.evaluate('2 + 3 * 4'), 14);
});

test('three.min.js defines THREE with WebGLRenderer and OrbitControls', () => {
  const { THREE } = load('three/three.min.js');
  assert.equal(typeof THREE.WebGLRenderer, 'function');
  assert.equal(typeof THREE.OrbitControls, 'function');
});
