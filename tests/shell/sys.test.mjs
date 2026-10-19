import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadShell, run } from './harness.mjs';

const fresh = () => {
  const SQ = loadShell();
  run(SQ, 'cd ~');
  return SQ;
};
const ll = (SQ, f) => run(SQ, `ls -l ${f}`).out;

describe('chmod modes', () => {
  it('octal 600', () => {
    const SQ = fresh();
    run(SQ, 'touch f; chmod 600 f');
    assert.match(ll(SQ, 'f'), /^-rw-------/);
  });
  it('symbolic comma list', () => {
    const SQ = fresh();
    run(SQ, 'touch f; chmod 600 f; chmod u+x,go-w f');
    assert.match(ll(SQ, 'f'), /^-rwx------/);
  });
  it('a=r', () => {
    const SQ = fresh();
    run(SQ, 'touch f; chmod a=r f');
    assert.match(ll(SQ, 'f'), /^-r--r--r--/);
  });
  it('4-digit leading 0 octal', () => {
    const SQ = fresh();
    run(SQ, 'touch f; chmod 0600 f');
    assert.match(ll(SQ, 'f'), /^-rw-------/);
  });
  it('invalid modes', () => {
    const SQ = fresh();
    run(SQ, 'touch f');
    assert.equal(run(SQ, 'chmod 999 f').out, "chmod: invalid mode: '999'");
    assert.equal(run(SQ, 'chmod q+x f').out, "chmod: invalid mode: 'q+x'");
    assert.equal(run(SQ, 'chmod u+z f').out, "chmod: invalid mode: 'u+z'");
  });
  it('missing file', () => {
    const SQ = fresh();
    assert.equal(run(SQ, 'chmod 644 x').out, "chmod: cannot access 'x': No such file or directory");
  });
  it('directories', () => {
    const SQ = fresh();
    run(SQ, 'mkdir d; chmod 700 d');
    assert.match(run(SQ, 'ls -l').out, /^drwx------.*d\/$/m);
  });
  it('default dir line', () => {
    const SQ = fresh();
    run(SQ, 'mkdir d');
    assert.match(run(SQ, 'ls -l').out, /^drwxr-xr-x.*d\/$/m);
  });
  it('legacy nodes without mode list as before and exec stays in sync', () => {
    const SQ = fresh();
    SQ.S.fs.children.home.children.explorer.children['old.sh'] = { type: 'file', content: 'echo hi', exec: true };
    SQ.S.fs.children.home.children.explorer.children['old.txt'] = { type: 'file', content: 'x', exec: false };
    assert.match(ll(SQ, 'old.sh'), /^-rwxr-xr-x/);
    assert.match(ll(SQ, 'old.txt'), /^-rw-r--r--/);
    assert.equal(run(SQ, './old.sh').out, 'hi');
    run(SQ, 'chmod 644 old.sh');
    assert.equal(SQ.getNode('/home/explorer/old.sh').exec, false);
    assert.match(run(SQ, './old.sh').out, /Permission denied/);
    run(SQ, 'chmod u+x old.sh');
    assert.equal(SQ.getNode('/home/explorer/old.sh').exec, true);
    assert.equal(run(SQ, './old.sh').out, 'hi');
  });
  it('beginner chmod +x leaves no mode field', () => {
    const SQ = fresh();
    run(SQ, 'touch s.sh; chmod +x s.sh');
    const n = SQ.getNode('/home/explorer/s.sh');
    assert.equal(n.exec, true);
    assert.equal('mode' in n, false);
    assert.match(ll(SQ, 's.sh'), /^-rwxr-xr-x/);
    run(SQ, 'chmod -x s.sh');
    assert.equal('mode' in SQ.getNode('/home/explorer/s.sh'), false);
  });
});

describe('links', () => {
  it('cat through link, ls -l arrow', () => {
    const SQ = fresh();
    run(SQ, 'ln -s readme.txt r');
    assert.equal(run(SQ, 'cat r').out, run(SQ, 'cat readme.txt').out);
    assert.match(run(SQ, 'ls -l').out, /r -> readme\.txt/);
    assert.match(run(SQ, 'ls -l').out, /^lrwxrwxrwx/m);
  });
  it('rm link keeps target', () => {
    const SQ = fresh();
    run(SQ, 'ln -s readme.txt r; rm r');
    assert.equal(run(SQ, 'ls').out.includes('readme.txt'), true);
    assert.equal(run(SQ, 'ls r').code, 2);
  });
  it('loops', () => {
    const SQ = fresh();
    run(SQ, 'ln -s a b; ln -s b a');
    assert.equal(run(SQ, 'cat a').out, 'cat: a: Too many levels of symbolic links');
  });
  it('dangling', () => {
    const SQ = fresh();
    run(SQ, 'ln -s nowhere dangling');
    assert.equal(run(SQ, 'cat dangling').out, 'cat: dangling: No such file or directory');
    assert.match(run(SQ, 'ls -l').out, /^l.*dangling -> nowhere/m);
    assert.equal(run(SQ, 'rm dangling').code, 0);
    assert.equal(run(SQ, 'ls -l').out.includes('dangling'), false);
  });
  it('rm -r does not follow links', () => {
    const SQ = fresh();
    run(SQ, 'mkdir d; ln -s ~/forest d/l; rm -r d');
    assert.equal(run(SQ, 'ls forest').out.includes('cave'), true);
  });
  it('cp link copies content; mv moves the link', () => {
    const SQ = fresh();
    run(SQ, 'ln -s readme.txt r; cp r x');
    assert.equal(run(SQ, 'ls -l x').out.startsWith('-'), true);
    assert.equal(run(SQ, 'cat x').out, run(SQ, 'cat readme.txt').out);
    run(SQ, 'mv r r2');
    assert.match(run(SQ, 'ls -l r2').out, /^l.*r2 -> readme\.txt/);
  });
  it('cd through link to dir, tree/find do not loop', () => {
    const SQ = fresh();
    run(SQ, 'ln -s forest f');
    assert.equal(run(SQ, 'cd f; ls').out.includes('owl.txt'), true);
    run(SQ, 'cd ~; ln -s . self');
    assert.equal(run(SQ, 'tree').code, 0);
    assert.equal(run(SQ, 'find .').code, 0);
    assert.equal(run(SQ, 'find . -type l').out, './f\n./self');
  });
  it('other readers do not crash', () => {
    const SQ = fresh();
    run(SQ, 'ln -s forest f; ln -s a b; ln -s b a');
    for (const c of ['cat f', 'head f', 'tail a', 'wc a', 'grep x a', 'sort a', 'stat a', 'chmod 644 a', 'cp a z', 'mv a z', 'cd a', './a', 'bash a', 'echo x > a', 'diff a a', 'cut -c1 a', 'sed p a'])
      assert.doesNotThrow(() => run(SQ, c), c);
  });
  it('write through link and dangling link', () => {
    const SQ = fresh();
    run(SQ, 'ln -s readme.txt r; echo hi > r');
    assert.equal(run(SQ, 'cat readme.txt').out, 'hi');
    run(SQ, 'ln -s newf dl; echo made > dl');
    assert.equal(run(SQ, 'cat newf').out, 'made');
  });
  it('round-trips through save/load', () => {
    const SQ = fresh();
    run(SQ, 'ln -s readme.txt r');
    const snap = JSON.parse(JSON.stringify(SQ.S));
    assert.deepEqual(snap.fs.children.home.children.explorer.children.r, { type: 'link', target: 'readme.txt' });
    SQ.resetState(Object.assign(SQ.fresh(), snap));
    assert.equal(run(SQ, 'cat r').out, run(SQ, 'cat readme.txt').out);
  });
  it('ln errors', () => {
    const SQ = fresh();
    assert.match(run(SQ, 'ln readme.txt x').out, /this practice shell only supports ln -s/);
    run(SQ, 'ln -s a b');
    assert.match(run(SQ, 'ln -s a b').out, /File exists/);
    assert.match(run(SQ, 'ln').out, /missing file operand/);
  });
});

describe('stat / which / type', () => {
  it('stat', () => {
    const SQ = fresh();
    const o = run(SQ, 'stat readme.txt').out;
    assert.match(o, /File: readme\.txt/);
    assert.match(o, /Size: \d+/);
    assert.match(o, /Mode: \(0644\/-rw-r--r--\)/);
    assert.match(run(SQ, 'stat nope').out, /stat: cannot statx 'nope': No such file or directory/);
  });
  it('which', () => {
    const SQ = fresh();
    assert.equal(run(SQ, 'which ls').out, '/usr/bin/ls');
    const r = run(SQ, 'which nosuchcmd');
    assert.equal(r.out, '');
    assert.equal(r.code, 1);
  });
  it('type', () => {
    const SQ = fresh();
    assert.equal(run(SQ, 'type cd').out, 'cd is a shell builtin');
    assert.equal(run(SQ, 'type export').out, 'export is a shell builtin');
    assert.equal(run(SQ, 'type ls').out, 'ls is /usr/bin/ls');
    const r = run(SQ, 'type zzz');
    assert.equal(r.out, 'bash: type: zzz: not found');
    assert.equal(r.code, 1);
  });
});

describe('review fixes', () => {
  const fresh2 = () => { const SQ = loadShell(); run(SQ, 'cd ~'); return SQ; };
  it('mv/cp dir into itself via link', () => {
    const SQ = fresh2();
    run(SQ, 'ln -s forest fl');
    assert.equal(run(SQ, 'mv forest fl/inner').out, "mv: cannot move 'forest' to a subdirectory of itself, 'fl/inner'");
    assert.equal(run(SQ, 'ls forest').out.includes('cave'), true);
    assert.equal(run(SQ, 'ls').out.includes('forest'), true);
    assert.match(run(SQ, 'cp -r forest fl/inner').out, /cp: cannot copy a directory, 'forest', into itself/);
    assert.match(run(SQ, 'mv forest fl').out, /subdirectory of itself/);
  });
  it('rm guards see through links', () => {
    const SQ = fresh2();
    run(SQ, 'ln -s / root');
    assert.match(run(SQ, 'rm -r root/home').out, /refusing to remove 'root\/home': that would wipe out your whole world/);
    run(SQ, 'cd forest/cave/deeper; ln -s .. up');
    assert.match(run(SQ, 'rm -r up/deeper').out, /rm: you are standing inside 'up\/deeper'/);
    assert.match(run(SQ, 'mv up/deeper /tmp/x').out, /mv: you are standing inside 'up\/deeper'/);
    run(SQ, 'cd ~; ln -s .. up2');
    assert.match(run(SQ, 'rm -r up2/explorer').out, /refusing to remove/);
    assert.equal(run(SQ, 'ls').out.includes('forest'), true);
  });
  it('chmod = clears all, and -R unsupported', () => {
    const SQ = fresh2();
    run(SQ, 'touch f; chmod 666 f; chmod =r f');
    assert.match(run(SQ, 'ls -l f').out, /^-r--r--r--/);
    assert.equal(run(SQ, 'chmod -R 755 forest').out, 'this practice shell does not support chmod -R yet');
    assert.equal(run(SQ, 'chmod -v 755 f').out, 'this practice shell does not support chmod -v yet');
  });
});
