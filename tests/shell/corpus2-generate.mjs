// Second differential corpus (Stage 2 engine): builds the entry specs, replays one in a fresh world, and (UPDATE_CORPUS2=1 via
// corpus2.test.mjs) rewrites tests/fixtures/shell-corpus2.json from the CURRENT engine. Same entry format as the Stage 1 corpus
// ({line|lines, out, code, cwd, vars, files, gone}); an entry may also carry `put` ({path: content} written before it runs, used
// for mission scripts) and `setupUpTo` (default 14: the setup() of every chapter through Advanced).
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadShell, run } from './harness.mjs';
import { listFiles } from './corpus-generate.mjs';
import { LINES } from './corpus2-lines.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURE = path.resolve(HERE, '../fixtures/shell-corpus2.json');
export const ALLOW = path.resolve(HERE, '../fixtures/shell-corpus2-allow.json');
export const DEFAULT_SETUP = 14;
export const ADVANCED_FIRST = 11;

/* Lines Stage 3 intends to change, tested on the line with quoted strings blanked (awk/sed programs live in quotes, so a few
   rules look at the raw line). The notes become changeNote. */
const CMD = String.raw`(?:^|[;&|(]|&&|\|\||\bthen\b|\bdo\b|\{)\s*`;
const RULES = [
  ['awk becomes a real command', new RegExp(CMD + String.raw`awk\b`), 'raw'],
  ['sed becomes a real command (s///, addresses, ;, -i, y)', new RegExp(CMD + String.raw`sed\b`), 'raw'],
  ['sleep / virtual clock', new RegExp(CMD + String.raw`(?:sleep|timeout)\b`), 'raw'],
  ['background & and the process table', /(?<![>&|\\])&(?![&>\d])/, 'blank'],
  ['jobs / wait / kill / fg / bg / ps / trap', new RegExp(CMD + String.raw`(?:jobs|wait|kill|fg|bg|ps|trap|disown)\b`), 'raw'],
  ['process substitution <( ) / >( )', /[<>]\(/, 'blank'],
  ['set options (-e -u -x -o pipefail ...)', new RegExp(CMD + String.raw`set(?:\s+[-+][euxofCnv]\w*|\s*$)`), 'raw'],
  ['bash -x / -n', /\bbash\s+-[a-z]*[xn]\b/, 'raw'],
  ['getopts / mktemp / command / readonly / shopt', new RegExp(CMD + String.raw`(?:getopts|mktemp|command|readonly|shopt)\b`), 'raw'],
  ['$! $- $SECONDS $RANDOM $LINENO', /\$(?:!|-|SECONDS|RANDOM|LINENO|BASH_VERSION)\b|\$\{(?:SECONDS|RANDOM|LINENO)/, 'blank'],
  ['IFS assignment / splitting', /\bIFS=/, 'raw'],
  ['prefix assignment VAR=x cmd', new RegExp(CMD + String.raw`[A-Za-z_]\w*=(?:"[^"]*"|'[^']*'|[^\s;&|"'])*\s+[A-Za-z./][^\s=;&|]*(?:\s|;|&|\||$)`), 'raw'],
  ['unquoted $x / $(..) / $@ / $* word splitting and globbing', /(?:^|[^\\])\$(?:[A-Za-z_@*]|\{[A-Za-z_@*][^}]*\}|\((?!\())/, 'unquoted'],
  ['grep -o/-w/-x/-r/-R/-l/-L/-q/-s/-h/-H/-A/-B/-C/-m/-E/-F/-P/-e', new RegExp(CMD + String.raw`(?:xargs\s+(?:-\S+\s+)*)?grep\b[^|;&]*\s(?:-[a-zA-Z]*[owrRlLqshHxEFPeABCmbz][a-zA-Z]*\d*(?=\s|$)|--include|--exclude|--color)`), 'raw'],
  ['find -exec/-delete/-newer/-mtime/-perm/-empty/-iname/-print0/-path/-prune/-not/-o/-mindepth/-size', new RegExp(CMD + String.raw`find\b[^|;&]*\s(?:-exec|-delete|-newer|-mtime|-perm|-empty|-iname|-print0?|-path|-prune|-not|-o|-mindepth|-maxdepth|-size|!)(?:\s|$)`), 'raw'],
  ['xargs options (-P -0 -d -s -L -t -r -I)', new RegExp(CMD + String.raw`xargs\b[^|;&]*\s-(?:P|0|d|s|L|t|r|I)`), 'raw'],
  ['printf formats (%5.2f %e %q %b %c width/precision)', new RegExp(CMD + String.raw`printf\b[^|;&]*%[-0-9.]*[feEqbcxXoiu]`), 'raw'],
  ['${X:?msg} aborts the command', /\$\{\w*:?\?/, 'raw'],
];
const blankQuotes = (l) => l.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""');
const unquoted = (l) => l.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""');
export function autoChange(lines) {
  const hits = new Set();
  const cands = lines.flatMap((l) => l.split('\n'));
  for (const l of cands) {
    for (const [note, rx, mode] of RULES) {
      const text = mode === 'raw' ? l : mode === 'blank' ? blankQuotes(l) : unquoted(l);
      if (!rx.test(text)) continue;
      /* an unquoted expansion only changes behaviour when its value can contain whitespace or a glob; flag only lines that set such a value or use $@ $* $(..) */
      if (mode === 'unquoted' && !/\$[@*]|\$\((?!\()|\bIFS|=\s*(?:'[^']*[\s*?\[][^']*'|"[^"]*[\s*?\[][^"]*"|\*)|set\s+--\s+\S.*\$/.test(l.replace(/\\[ ]/g, '').replace(/\w=\$\(/g, '='))) continue;
      hits.add(note);
    }
  }
  return [...hits];
}

const stable = (t) => t.replace(/\b[A-Z][a-z]{2} [A-Z][a-z]{2} [ \d]\d \d\d:\d\d:\d\d \d{4}\b/g, '<DATE>');
export function freshWorld(upTo = DEFAULT_SETUP) {
  const SQ = loadShell();
  SQ.content.chapters.slice(0, upTo + 1).forEach((c) => c.setup());
  return SQ;
}

/* spec: { line | lines, put?, prefix?, setupUpTo? } -> { out, code, cwd, vars, files, gone } */
export function runSpec(spec) {
  const SQ = freshWorld(spec.setupUpTo ?? DEFAULT_SETUP);
  const base = new Map(listFiles(SQ).map(([p, n, h]) => [p, `${n}:${h}`]));
  for (const [p, c] of Object.entries(spec.put || {})) {
    const abs = SQ.norm(p, SQ.HOME);
    SQ.mkdirp(SQ.parentOf(abs)[2]);
    const e = SQ.writeFile(abs, c, false, p);
    if (e) throw new Error(`corpus2: cannot write ${p}: ${e}`);
  }
  for (const p of spec.prefix || []) run(SQ, p);
  let r = { out: '', code: 0 };
  for (const l of spec.lines || [spec.line]) r = run(SQ, l);
  const all = listFiles(SQ);
  const now = new Map(all.map(([p, n, h]) => [p, `${n}:${h}`]));
  const files = all.filter(([p, n, h]) => base.get(p) !== `${n}:${h}`);
  const gone = [...base.keys()].filter((p) => !now.has(p)).sort();
  return { out: stable(r.out), code: r.code, cwd: SQ.S.cwd, vars: { ...SQ.S.vars }, files, gone };
}

export const specLines = (spec) => spec.lines || [spec.line];
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);
export const keyOf = (spec) =>
  (spec.setupUpTo !== undefined ? `[setup 0..${spec.setupUpTo}${spec.lines ? ' session' : ''}]\n` : '') +
  (spec.put ? `[put ${Object.entries(spec.put).map(([p, c]) => p + '#' + sha(c)).join(' ')}]\n` : '') +
  [...(spec.prefix || []), ...specLines(spec)].join('\n');

/* every Advanced command mission answer (a chapter session, then each answer after its prefix), every script / challenge answer and
   wrong script run through `bash` once per test case (arguments, stdin and seeded files from the case), and the Advanced quick-fire answers */
const q = (a) => `"${String(a).replace(/(["\\$`])/g, '\\$1')}"`;
export function missionSpecs() {
  const SQ = loadShell();
  const specs = [];
  SQ.content.chapters.forEach((c, ci) => {
    if (ci < ADVANCED_FIRST || c.tier !== 'advanced') return; // Advanced only: the Expert tier came after the recording
    const cmds = c.missions.filter((m) => m.kind !== 'script' && m.kind !== 'challenge');
    const answers = cmds.map((m) => m.answer);
    if (answers.length) specs.push({ lines: answers.slice(), setupUpTo: ci });
    answers.forEach((a, mi) => specs.push({ line: a, prefix: answers.slice(0, mi), setupUpTo: ci }));
    for (const m of c.missions.filter((m) => m.kind === 'script' || m.kind === 'challenge')) {
      const variants = [m.answer, ...(m.wrong || []), ...(m.starter ? [m.starter] : [])];
      variants.forEach((script) => {
        for (const tc of m.tests || []) {
          const put = { ...(tc.files || {}), [m.file]: script };
          const args = (tc.args || []).map(q).join(' ');
          const call = `bash ${m.file}${args ? ' ' + args : ''}`;
          const line = tc.stdin !== undefined ? `printf '%s' ${"'" + String(tc.stdin).replace(/'/g, "'\\''") + "'"} | ${call}` : call;
          specs.push({ lines: [line, 'echo "code=$?"'], put, setupUpTo: ci });
        }
      });
    }
  });
  for (const qf of SQ.content.quickfire.filter((x) => x[2] === 'advanced')) for (const a of qf[1]) specs.push({ line: a });
  return specs;
}

export function handSpecs() {
  const specs = [];
  for (const e of LINES) {
    const lines = typeof e === 'string' ? [e] : Array.isArray(e) ? e : e.lines || [e.line];
    const spec = lines.length === 1 && !Array.isArray(e) ? { line: lines[0] } : { lines };
    if (e && e.put) spec.put = e.put;
    if (e && e.change === false) spec.noChange = true;
    if (e && typeof e.change === 'string') spec.forceChange = e.change;
    specs.push(spec);
  }
  return specs;
}

export function buildEntries() {
  const entries = [];
  const seenKeys = new Set();
  for (const spec of [...handSpecs(), ...missionSpecs()]) {
    if (seenKeys.has(keyOf(spec))) continue;
    seenKeys.add(keyOf(spec));
    const res = runSpec(spec);
    const e = { ...(spec.line !== undefined ? { line: spec.line } : { lines: spec.lines }) };
    if (spec.put) e.put = spec.put;
    if (spec.prefix && spec.prefix.length) e.prefix = spec.prefix;
    if (spec.setupUpTo !== undefined) e.setupUpTo = spec.setupUpTo;
    Object.assign(e, res);
    const hand = spec.setupUpTo === undefined;
    const hits = hand && !spec.noChange ? autoChange(specLines(spec)) : [];
    if (spec.forceChange) hits.push(spec.forceChange);
    if (hits.length) { e.expectChange = true; e.changeNote = hits.join('; '); }
    entries.push(e);
  }
  return entries;
}

export function writeFixture() {
  const entries = buildEntries();
  fs.writeFileSync(FIXTURE, '[\n' + entries.map((e) => '  ' + JSON.stringify(e)).join(',\n') + '\n]\n');
  return entries.length;
}
