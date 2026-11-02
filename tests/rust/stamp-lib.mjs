// The verify record: canonical JSON, the two hashes and the result digest. verify-rustc.mjs writes them and
// stamp.test.mjs recomputes them with this same file, so the two can never drift apart.
import crypto from 'node:crypto';

const sorted = (v) => Array.isArray(v) ? v.map(sorted)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])])) : v;
export const canonical = (v) => JSON.stringify(sorted(v));
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function programs(RQ, corpus) {
  const all = [
    ...corpus.map((e) => ({ id: 'corpus:' + e.id, src: e.src, entry: e })),
    ...RQ.missionPrograms().map((p) => ({ id: 'mission:' + p.id, src: p.src, role: p.role })),
  ];
  return all.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function digest(c) {
  const first = c.status === 'error' ? c.errors[0] : c.status === 'unsupported' ? { code: c.unsupported.feature, line: c.unsupported.line } : null;
  return { status: c.status, id: first ? (first.code || first.lint || null) : null, line: first ? first.line : null, stdout: c.stdout, stderr: c.stderr, exit: c.exit };
}

export const inputsHash = (corpus, progs) => sha256(canonical({
  corpus: [...corpus].sort((a, b) => (a.id < b.id ? -1 : 1)),
  missions: progs.filter((p) => p.id.startsWith('mission:')).map((p) => ({ id: p.id, src: p.src })),
}));
export const resultsHash = (run, progs) => sha256(canonical(progs.map((p) => ({ id: p.id, r: digest(run(p.src)) }))));

export function record(RQ, corpus) {
  const progs = programs(RQ, corpus);
  return {
    inputsHash: inputsHash(corpus, progs),
    resultsHash: resultsHash(RQ.run, progs),
    counts: { corpus: progs.filter((p) => p.id.startsWith('corpus:')).length, missions: progs.filter((p) => p.id.startsWith('mission:')).length },
  };
}

export const verifiedJs = (rec) => `/* Written only by tests/rust/verify-rustc.mjs. Do not edit. */\nglobalThis.RQ=globalThis.RQ||{};RQ.verified=${JSON.stringify(rec)};\n`;
