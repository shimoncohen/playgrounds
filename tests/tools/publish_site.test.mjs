import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const script = resolve('tools/publish_site.sh');
const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
const who = {
  GIT_AUTHOR_NAME: 'Setup', GIT_AUTHOR_EMAIL: 'setup@example.com',
  GIT_COMMITTER_NAME: 'Setup', GIT_COMMITTER_EMAIL: 'setup@example.com',
};

function git(cwd, args, env = {}) {
  return execFileSync(realGit, args, { cwd, encoding: 'utf8', env: { ...process.env, ...env } }).trim();
}

test('a push rejected because another preview landed first is rebased and pushed', (t) => {
  const tmp = mkdtempSync(join(tmpdir(), 'publish-site-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const origin = join(tmp, 'origin.git');
  const url = `file://${origin}`;
  git(tmp, ['init', '-q', '--bare', origin]);

  const seed = join(tmp, 'seed');
  git(tmp, ['init', '-q', '-b', 'gh-pages', seed]);
  writeFileSync(join(seed, '.nojekyll'), '');
  git(seed, ['add', '-A']);
  git(seed, ['commit', '-qm', 'seed'], who);
  git(seed, ['push', '-q', url, 'gh-pages']);

  // The rival is another PR's preview, ready to land between our commit and our push.
  const rival = join(tmp, 'rival');
  git(tmp, ['clone', '-q', '-b', 'gh-pages', url, rival]);
  mkdirSync(join(rival, 'pr-preview', 'pr-1'), { recursive: true });
  writeFileSync(join(rival, 'pr-preview', 'pr-1', 'index.html'), 'rival');
  git(rival, ['add', '-A']);
  git(rival, ['commit', '-qm', 'rival preview'], who);

  const site = join(tmp, 'site');
  git(tmp, ['init', '-q', '-b', 'main', site]);
  writeFileSync(join(site, 'index.html'), 'hub');
  mkdirSync(join(site, 'shared'));
  writeFileSync(join(site, 'shared', 'a.js'), '');
  mkdirSync(join(site, 'programming', 'code-quest'), { recursive: true });
  writeFileSync(join(site, 'programming', 'code-quest', 'index.html'), 'code');
  mkdirSync(join(site, 'math'));
  writeFileSync(join(site, 'math', 'index.html'), 'math');
  git(site, ['add', '-A']);
  git(site, ['commit', '-qm', 'site'], who);
  git(site, ['remote', 'add', 'origin', url]);

  const bin = join(tmp, 'bin');
  const mark = join(tmp, 'rival-pushed');
  mkdirSync(bin);
  writeFileSync(join(bin, 'git'), `#!/bin/sh
if [ "$1" = push ] && [ ! -e "${mark}" ]; then
  touch "${mark}"
  "${realGit}" -C "${rival}" push -q origin gh-pages
fi
exec "${realGit}" "$@"
`);
  chmodSync(join(bin, 'git'), 0o755);

  // Like a CI runner: no git identity anywhere, so only the script's own identity applies.
  const env = { PATH: `${bin}:${process.env.PATH}`, HOME: tmp, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GITHUB_SHA: 'abc1234' };
  const run = spawnSync('bash', [script, 'pr', '7'], { cwd: site, encoding: 'utf8', env });

  assert.ok(existsSync(mark), 'the rival push should have happened');
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /published \(pr 7\)/);
  assert.match(run.stderr, /push rejected, retrying \(1\)/);
  const files = git(origin, ['ls-tree', '-r', '--name-only', 'gh-pages']).split('\n');
  assert.ok(files.includes('pr-preview/pr-1/index.html'), 'rival preview kept');
  assert.ok(files.includes('pr-preview/pr-7/programming/code-quest/index.html'), 'programming quests published');
  assert.ok(files.includes('pr-preview/pr-7/math/index.html'), 'math section published');
  assert.equal(git(origin, ['log', '-1', '--format=%an|%cn', 'gh-pages']), 'github-actions[bot]|github-actions[bot]');
});
