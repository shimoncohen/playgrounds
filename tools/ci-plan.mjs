// Picks which CI test jobs a pull request needs from the files it changes.
//   git diff --name-only HEAD^1 HEAD | node tools/ci-plan.mjs   -> matrix for the changed parts
//   node tools/ci-plan.mjs --all                                -> matrix for everything
//   TASK='<matrix entry>' node tools/ci-plan.mjs run            -> runs one entry
// Writes `matrix=<json>` to $GITHUB_OUTPUT when set, else prints it.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COURSE = '^shell-quest full course';
// Changes here cannot affect a page or a test.
const IGNORED = [/^docs\//, /\.md$/, /^LICENSE$/, /^\.claude\//, /^\.github\/ISSUE_TEMPLATE\//];

// Returns the quests a change touches, or null when it may touch anything (shared code, tools, fixtures, config).
export function scope(files) {
  const quests = new Set();
  for (const f of files) {
    if (IGNORED.some(r => r.test(f))) continue;
    const m = f.match(/^(?:programming\/)?([a-z]+)-quest\//) || f.match(/^tests\/([a-z]+)\//);
    if (!m || m[1] === 'fixtures' || m[1] === 'tools') return null;
    quests.add(m[1]);
  }
  return [...quests].sort();
}

// `all` lists every quest; `withTests` the ones that have a tests/<name>/ folder.
export function plan(files, { all, withTests, browser = {} }) {
  const picked = files === null ? null : scope(files);
  const shell = picked === null || picked.includes('shell');
  const jobs = [];
  if (picked === null) jobs.push({ name: 'engine tests', args: ['--run', 'test:engine'], browser: false });
  else {
    const dirs = picked.filter(q => withTests.includes(q));
    if (dirs.length) jobs.push({ name: `engine tests (${dirs.join(', ')})`, args: ['--test', ...dirs.map(q => `tests/${q}/*.test.mjs`)], browser: false });
  }
  if (picked !== null && !picked.length) return jobs;
  const others = picked === null ? [] : all.filter(q => !picked.includes(q));
  // A quest's smoke tests start with its name and a hyphen or space (`net-quest …`, `math-algebra …`, `math hub …`).
  // Tests not named after a quest (landing page, theme, saves) always run: they cover every page.
  const skip = [...(others.length ? [`--test-skip-pattern=^(${others.join('|')})[- ]`] : []), ...(shell ? [`--test-skip-pattern=${COURSE}`] : [])];
  jobs.push({ name: picked === null ? 'browser smoke tests' : `browser smoke tests (${picked.join(', ')})`, args: [...skip, 'tests/smoke.mjs'], browser: true });
  for (const q of picked ?? all) if (browser[q]?.length) jobs.push({ name: `${q} browser tests`, args: ['--test', ...browser[q]], browser: true });
  if (shell) {
    // The full-course test alone takes over two minutes, so it gets its own job.
    jobs.push({ name: 'shell-quest full course', args: [`--test-name-pattern=${COURSE}`, 'tests/smoke.mjs'], browser: true });
    jobs.push({ name: 'shell-quest golden', args: ['tests/shell-golden.mjs'], browser: true });
  }
  return jobs;
}

function repoQuests() {
  const all = [...fs.readdirSync(ROOT), ...fs.readdirSync(path.join(ROOT, 'programming'))].map(d => d.match(/^([a-z]+)-quest$/)?.[1]).filter(Boolean).sort();
  const withTests = all.filter(q => fs.existsSync(path.join(ROOT, 'tests', q)));
  const browser = Object.fromEntries(withTests.map(q => [q, fs.readdirSync(path.join(ROOT, 'tests', q)).filter(f => f.endsWith('.browser.mjs')).sort().map(f => `tests/${q}/${f}`)]));
  return { all, withTests, browser };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'run') {
    const { args } = JSON.parse(process.env.TASK);
    const r = spawnSync(process.execPath, args, { stdio: 'inherit', cwd: ROOT });
    process.exit(r.status ?? 1);
  }
  const files = process.argv[2] === '--all' ? null : fs.readFileSync(0, 'utf8').split('\n').filter(Boolean);
  const out = `matrix=${JSON.stringify(plan(files, repoQuests()))}\n`;
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, out);
  process.stdout.write(out);
}
