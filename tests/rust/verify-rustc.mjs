// Checks the corpus, every mission program and every field-guide example against a real rustc. Writes verified.json and
// content/verified.js only on 0 mismatches; never edits the corpus.
//   node tests/rust/verify-rustc.mjs                                       local rustc (>= 1.85, edition 2024)
//   RUSTC_RUNNER="sh tests/rust/docker-run.sh" node tests/rust/verify-rustc.mjs
// RUSTC_RUNNER is split on whitespace and run without a shell. RQ_TMP: temp dir (default the OS one). RQ_JOBS: parallel programs (default 1).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { loadRust, ROOT } from './harness.mjs';
import { programs, record, verifiedJs, sortGroups } from './stamp-lib.mjs';

const EDITION = '2024';
const RUN_TIMEOUT_S = 10;
const HOST_TIMEOUT_MS = 15 * 60 * 1000; // a backstop only: the runner enforces its own, shorter limits
const RUNNER = (process.env.RUSTC_RUNNER || 'sh tests/rust/build-run.sh').split(/\s+/).filter(Boolean);
const TMP = process.env.RQ_TMP || os.tmpdir();
const JOBS = Math.max(1, Number(process.env.RQ_JOBS) || 1);

const run = (args) => new Promise((resolve, reject) => {
  execFile(RUNNER[0], [...RUNNER.slice(1), ...args], { cwd: ROOT, timeout: HOST_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
    if (err && err.killed) reject(new Error('runner timed out'));
    else if (err && typeof err.code !== 'number') reject(err);
    else resolve({ stdout, stderr, code: err ? err.code : 0 });
  });
});

function frames(r, nonce) {
  const text = r.stdout;
  const names = ['DIAG', 'STDOUT', 'STDERR', 'EXIT'], marks = names.map((n) => `\n${nonce}:${n}\n`);
  const at = marks.map((m) => text.indexOf(m));
  if (at.some((i, k) => i < 0 || (k && i < at[k - 1]))) throw new Error(`malformed runner output (runner exit ${r.code}); stderr: ${r.stderr.slice(0, 500)}; stdout: ${text.slice(0, 500)}`);
  const out = {};
  names.forEach((n, k) => { out[n] = text.slice(at[k] + marks[k].length, k + 1 < names.length ? at[k + 1] : text.length); });
  out.EXIT = out.EXIT.trim();
  return out;
}

// the only normalization: drop the backtrace hint line, and a thread id if the real panic header has one
const norm = (s) => s.split('\n').filter((l) => !l.startsWith('note: run with `RUST_BACKTRACE')).join('\n').replace(/^(thread '[^']*') \(\d+\) panicked/m, '$1 panicked');

const unordered = (s) => norm(s).split('\n').map(sortGroups).sort().join('\n');

function realResult(f) {
  const diags = f.DIAG.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const coded = diags.filter((d) => d.level === 'error' && d.code && d.code.code)
    .map((d) => ({ id: d.code.code, line: (d.spans.find((s) => s.is_primary) || d.spans[0] || {}).line_start }));
  if (f.EXIT === 'compile-failed') return { compiled: false, coded };
  return { compiled: true, stdout: norm(f.STDOUT), stderr: norm(f.STDERR), exit: Number(f.EXIT) };
}

function compare(p, real, c) {
  const bad = [], e = p.entry;
  const same = (what, a, b) => { if (a !== b) bad.push(`${what}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`); };
  if (!real.compiled) {
    if (real.coded.length !== 1) { bad.push(`rustc: expected exactly one coded error, got ${JSON.stringify(real.coded)}`); return bad; }
    const { id, line } = real.coded[0];
    if (e) {
      if (e.expect === 'ok') bad.push(`entry expects ok but rustc reports ${id} at line ${line}`);
      else { same('entry id', e.expect.code || e.expect.lint, id); same('entry line', e.expect.line, line); }
    }
    const mine = c.errors.filter((x) => x.code || x.lint);
    if (c.status !== 'error' || mine.length !== 1) bad.push(`RQ.run: expected one coded error, got status ${c.status} with ${JSON.stringify(c.errors)}`);
    else { same('RQ.run id', mine[0].code || mine[0].lint, id); same('RQ.run line', mine[0].line, line); }
    return bad;
  }
  if (e) {
    if (e.expect !== 'ok') bad.push(`entry expects ${JSON.stringify(e.expect)} but rustc compiles it`);
    else { same('entry stdout', norm(e.out), real.stdout); same('entry stderr', norm(e.err), real.stderr); same('entry exit', e.exit, real.exit); }
  }
  if (!['ok', 'panic', 'exit'].includes(c.status)) bad.push(`RQ.run: expected a finished run, got status ${c.status}`);
  else if (c.orderDependent) {
    if (e) bad.push('an order-dependent program cannot be a corpus entry');
    // rustc's HashMap order is random, so compare what survives any order: the exit status, and the lines as a multiset, with the elements of each {...} or [...] group sorted
    same('RQ.run stdout (any order)', unordered(c.stdout), unordered(real.stdout));
    same('RQ.run stderr (any order)', unordered(c.stderr), unordered(real.stderr));
    same('RQ.run exit', c.exit, real.exit);
  }
  else { same('RQ.run stdout', norm(c.stdout), real.stdout); same('RQ.run stderr', norm(c.stderr), real.stderr); same('RQ.run exit', c.exit, real.exit); }
  return bad;
}

const RQ = loadRust();
const corpus = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/rust/corpus-1.json'), 'utf8'));
const progs = programs(RQ, corpus);

const verOut = (await run(['--version'])).stdout;
const ver = verOut.match(/rustc (\d+)\.(\d+)\.(\d+)/);
if (!ver) { console.error('could not read the rustc version from the runner'); process.exit(2); }
const version = ver.slice(1).join('.');
const image = verOut.match(/^image: (\S+)/m)?.[1];
if (+ver[1] < 1 || (+ver[1] === 1 && +ver[2] < 85)) {
  console.error(`rustc ${version} is older than 1.85, which edition ${EDITION} needs. Stop and ask the owner.`);
  process.exit(3);
}

const mismatches = [];
const check = async (p) => {
  const dir = fs.mkdtempSync(path.join(TMP, 'rq-verify-'));
  try {
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src', 'main.rs'), p.src);
    const nonce = crypto.randomBytes(12).toString('hex');
    const r = await run([dir, EDITION, String(RUN_TIMEOUT_S), nonce]);
    const bad = compare(p, realResult(frames(r, nonce)), RQ.run(p.src));
    for (const b of bad) mismatches.push(`${p.id}: ${b}`);
  } catch (err) {
    mismatches.push(`${p.id}: ${err.message}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};
const queue = [...progs];
await Promise.all(Array.from({ length: JOBS }, async () => { for (let p; (p = queue.shift());) await check(p); }));
mismatches.sort();

if (mismatches.length) {
  console.error(mismatches.join('\n'));
  console.error(`rustc ${version} edition ${EDITION}: ${mismatches.length} mismatches, nothing written`);
  process.exit(1);
}

const rec = { rustc: version, edition: EDITION, ...(image ? { image } : {}), date: new Date().toISOString().slice(0, 10), ...record(RQ, corpus) };
fs.writeFileSync(path.join(ROOT, 'tests/fixtures/rust/verified.json'), JSON.stringify(rec, null, 2) + '\n');
fs.writeFileSync(path.join(ROOT, 'programming/rust-quest/content/verified.js'), verifiedJs(rec));
console.log(`rustc ${version} edition ${EDITION}: ${rec.counts.corpus} corpus + ${rec.counts.missions} mission programs + ${rec.counts.guide} guide examples, 0 mismatches`);
