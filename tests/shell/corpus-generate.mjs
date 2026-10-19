// Differential corpus: builds the entry specs, replays one in a fresh world, and (UPDATE_CORPUS=1 via
// corpus.test.mjs) rewrites tests/fixtures/shell-corpus.json from the CURRENT engine.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadShell, run } from './harness.mjs';
import { LINES } from './corpus-lines.mjs';

export const FIXTURE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/shell-corpus.json');
export const ALLOW = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/shell-corpus-allow.json');

/* Lines Stage 2 intends to change. Tested on the line with quoted strings blanked (single lines) or on the raw
   text (sessions, whose scripts hide their code inside quotes). First matching rules form the changeNote. */
const CMD = String.raw`(?:^|[;&|(]|&&|\|\||\bthen\b|\bdo\b|\{)\s*`;
const RULES = [
  ['positional/special parameter ($1 $2 $@ $# $0 $* $$)', /\$[0-9@#*$]/],
  ['parameter expansion ${X:-d} ${#X} ${X%..}', /\$\{[^}]*[:#%/!+=-]/],
  ['arithmetic $(( ))', /\$\(\(/],
  ['here-doc / here-string', /<</],
  ['&> redirect', /&>/],
  ['|& pipe', /\|&/],
  ['>&N redirect', /(?:^|[^2])>&\d?/],
  ['background &', /(?:^|[^&])&\s*$/],
  ['compound/builtin keyword', new RegExp(CMD + String.raw`(?:if|while|until|case|function|test|read|shift|source|true|false|exit|return|local|declare|unset|alias|set|let|eval|trap|wait|jobs|fg|select|time)\b`)],
  ['dot-source', new RegExp(CMD + String.raw`\.\s`)],
  ['function definition', /\w+\s*\(\)/],
  ['[ ] / [[ ]] test', new RegExp(CMD + String.raw`\[\[?\s`)],
  ['unquoted ( ) or { }', /(?:^|[\s;&|])[({]\s|(?:^|\s)[)}]/],
  ['echo -e', /\becho\s+-[a-zA-Z]*e/],
  ['editor becomes a real command', new RegExp(CMD + String.raw`(?:nano|vi|vim|code)\b`)],
  ['for with pipe/redirect/chain after done', /\bdone\s*(?:[|<>]|;\s*\S|&&|\|\|)/],
  ['negation !', /(?:^|[;&|]\s*)!\s/],
  ['backticks', /`/],
  ['brace expansion', /\{[^}\s]*(?:,|\.\.)[^}\s]*\}/],
  ['process substitution', /[<>]\(/],
  ['history expansion', /!!|!\$/],
];
const blank = (l) => l.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, (m) => (/\$/.test(m) ? m : '""'));
export function autoChange(lines) {
  const hits = new Set();
  const single = lines.length === 1;
  /* in a session, script bodies sit inside quotes (echo "if ..." > x.sh): test each quoted body as a line of its own too */
  const cands = single ? lines : lines.flatMap((l) => [l, ...[...l.matchAll(/"((?:[^"\\]|\\.)*)"|'([^']*)'/g)].map((m) => (m[1] ?? m[2]).replace(/\\(.)/g, '$1'))]);
  for (const l of cands) {
    const text = single ? l.replace(/'[^']*'/g, "''") : l;
    const bare = single ? blank(l) : l;
    for (const [note, rx] of RULES) {
      const dollar = /\$|`|<<|<\(|>\(/.test(rx.source);
      if (rx.test(dollar ? text : bare)) hits.add(note);
    }
  }
  return [...hits];
}

/* ---- helpers on the engine's own tree ---- */
export function listFiles(SQ) {
  const out = [];
  const walk = (abs, n) => {
    if (n.type === 'file') out.push([abs, n.content.length]);
    else if (n.type === 'dir') for (const k of Object.keys(n.children)) walk(SQ.join(abs, k), n.children[k]);
  };
  const home = SQ.getNode(SQ.HOME);
  if (home) walk(SQ.HOME, home);
  return out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

export function freshWorld(upTo = 10) {
  const SQ = loadShell();
  SQ.content.chapters.slice(0, upTo + 1).forEach((c) => c.setup());
  return SQ;
}

/* `date` is the only clock-dependent command; a mission answer uses it, so its timestamp is masked. */
const stable = (t) => t.replace(/\b[A-Z][a-z]{2} [A-Z][a-z]{2} [ \d]\d \d\d:\d\d:\d\d \d{4}\b/g, '<DATE>');
/* spec: { line | lines, prefix?, setupUpTo? } -> { out, code, cwd, vars, files, gone } */
export function runSpec(spec) {
  const SQ = freshWorld(spec.setupUpTo ?? 10);
  const base = new Map(listFiles(SQ));
  for (const p of spec.prefix || []) run(SQ, p);
  let r = { out: '', code: 0 };
  for (const l of spec.lines || [spec.line]) r = run(SQ, l);
  // files: delta against the seeded world (new or resized files as [path,size]); gone: seeded files that no longer exist.
  const now = new Map(listFiles(SQ));
  const files = [...now].filter(([p, n]) => base.get(p) !== n);
  const gone = [...base.keys()].filter((p) => !now.has(p)).sort();
  return { out: stable(r.out), code: r.code, cwd: SQ.S.cwd, vars: { ...SQ.S.vars }, files, gone };
}

export const specLines = (spec) => spec.lines || [spec.line];
export const keyOf = (spec) => (spec.setupUpTo !== undefined ? `[setup 0..${spec.setupUpTo}${spec.lines ? ' session' : ''}]\n` : '') + [...(spec.prefix || []), ...specLines(spec)].join('\n');

/* every beginner/intermediate mission answer, chapters 0..10 */
export function answerSpecs() {
  const SQ = loadShell();
  const specs = [];
  SQ.content.chapters.slice(0, 11).forEach((c, ci) => {
    const answers = c.missions.map((m) => m.answer);
    specs.push({ lines: answers.slice(), setupUpTo: ci });
    answers.forEach((a, mi) => specs.push({ line: a, prefix: answers.slice(0, mi), setupUpTo: ci }));
  });
  return specs;
}

export function handSpecs() {
  const seen = new Set();
  const specs = [];
  for (const e of LINES) {
    const lines = typeof e === 'string' ? [e] : Array.isArray(e) ? e : e.lines || [e.line];
    const spec = lines.length === 1 && !Array.isArray(e) ? { line: lines[0] } : { lines };
    const k = lines.join('\n');
    if (seen.has(k)) continue;
    seen.add(k);
    if (e && e.change === false) spec.noChange = true;
    if (e && typeof e.change === 'string') spec.forceChange = e.change;
    specs.push(spec);
  }
  return specs;
}

export function buildEntries() {
  const entries = [];
  for (const spec of [...handSpecs(), ...answerSpecs()]) {
    const res = runSpec(spec);
    const e = { ...(spec.line !== undefined ? { line: spec.line } : { lines: spec.lines }) };
    if (spec.prefix && spec.prefix.length) e.prefix = spec.prefix;
    if (spec.setupUpTo !== undefined) e.setupUpTo = spec.setupUpTo;
    Object.assign(e, res);
    const hits = spec.setupUpTo === undefined && !spec.noChange ? autoChange(specLines(spec)) : [];
    if (spec.forceChange) hits.push(spec.forceChange);
    if (hits.length) { e.expectChange = true; e.changeNote = hits.join('; '); }
    entries.push(e);
  }
  return entries;
}

export function writeFixture() {
  const entries = buildEntries();
  const body = '[\n' + entries.map((e) => '  ' + JSON.stringify(e)).join(',\n') + '\n]\n';
  fs.writeFileSync(FIXTURE, body);
  return entries.length;
}
