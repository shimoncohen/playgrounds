// Data Structures Quest solvability: the walk over missions with a practice block, node fixtures (lists and trees) and speed fixtures in the runners.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngines } from './practice-engines.mjs';

const E = loadEngines();
const P = E.DSQ.practice;
const LANGS = ['js', 'py', 'cpp', 'rs'];
const CPP_HEAD = '#include <iostream>\n#include <vector>\n#include <string>\nusing namespace std;\n';
const plain = (v) => JSON.parse(JSON.stringify(v));
const sig = (args, ret) => ({ args, ret });
const statuses = (rs) => rs.map((r) => r.status);

const HELPER_NAMES = { list: ['fromList', 'toList'], tree: ['fromTree', 'toTree'] };
// the learner's starter ships the node types and helpers; a fixture answer is the part after them
function program(lang, kind, answer) {
  const helpers = HELPER_NAMES[kind].map((n) => P.HELPERS[lang][n]).join('\n\n');
  return `${lang === 'cpp' ? CPP_HEAD : ''}${helpers}\n\n${answer}\n`;
}
const run = (lang, block, kind, answer) => plain(P.RUNNERS[lang].run(program(lang, kind, answer), block));

const fn = (name, args, ret, tests) => ({ fn: { name, sig: sig(args, ret), tests } });
const FIXTURES = {
  reverse: {
    kind: 'list',
    block: fn('reverse', [['head', 'list']], 'list', [
      { args: [[1, 2, 3]], want: [3, 2, 1] }, { args: [[]], want: [] }, { args: [[7]], want: [7] }, { args: [[4, 4, 5]], want: [5, 4, 4] }]),
    answers: {
      js: 'function reverse(head){let prev=null;while(head){const nx=head.next;head.next=prev;prev=head;head=nx}return prev}',
      py: 'def reverse(head):\n    prev = None\n    while head is not None:\n        nx = head["next"]\n        head["next"] = prev\n        prev = head\n        head = nx\n    return prev',
      cpp: `List reverse(List l) {
    int prev = -1;
    int cur = l.head;
    while (cur != -1) {
        int nx = l.nodes[cur].next;
        l.nodes[cur].next = prev;
        prev = cur;
        cur = nx;
    }
    l.head = prev;
    return l;
}`,
      rs: `fn reverse(mut l: List) -> List {
    let mut prev: Option<usize> = None;
    let mut cur = l.head;
    while let Some(i) = cur {
        let nx = l.nodes[i].next;
        l.nodes[i].next = prev;
        prev = Some(i);
        cur = nx;
    }
    l.head = prev;
    l
}`,
    },
    // a program that links the head to itself: the helper's visit cap gives a wrong answer, not a hang or a limit
    cycle: {
      js: 'function reverse(head){if(head)head.next=head;return head}',
      py: 'def reverse(head):\n    if head is not None:\n        head["next"] = head\n    return head',
      cpp: 'List reverse(List l) { if (l.head != -1) { l.nodes[l.head].next = l.head; } return l; }',
      rs: 'fn reverse(mut l: List) -> List { if let Some(h) = l.head { l.nodes[h].next = Some(h); } l }',
    },
    cycleBlock: fn('reverse', [['head', 'list']], 'list', [{ args: [[1, 2]], want: [2, 1] }]),
  },
  insert: {
    kind: 'tree',
    block: fn('insert', [['root', 'tree'], ['value', 'int']], 'tree', [
      { args: [[5, 3, 8], 4], want: [5, 3, 8, -1, 4] }, { args: [[], 7], want: [7] }, { args: [[5], 9], want: [5, -1, 9] },
      { args: [[5, 3, 8, 1, 4], 6], want: [5, 3, 8, 1, 4, 6] }]),
    answers: {
      js: `function insert(root,v){
  const n={value:v,left:null,right:null};
  if(!root)return n;
  let c=root;
  while(true){
    if(v<c.value){if(!c.left){c.left=n;break}c=c.left}
    else{if(!c.right){c.right=n;break}c=c.right}
  }
  return root;
}`,
      py: `def insert(root, v):
    n = {"value": v, "left": None, "right": None}
    if root is None:
        return n
    c = root
    while True:
        if v < c["value"]:
            if c["left"] is None:
                c["left"] = n
                return root
            c = c["left"]
        else:
            if c["right"] is None:
                c["right"] = n
                return root
            c = c["right"]`,
      cpp: `Tree insert(Tree t, int v) {
    Node n;
    n.value = v;
    n.left = -1;
    n.right = -1;
    t.nodes.push_back(n);
    int k = t.nodes.size() - 1;
    if (t.root == -1) {
        t.root = k;
        return t;
    }
    int c = t.root;
    while (true) {
        if (v < t.nodes[c].value) {
            if (t.nodes[c].left == -1) {
                t.nodes[c].left = k;
                return t;
            }
            c = t.nodes[c].left;
        } else {
            if (t.nodes[c].right == -1) {
                t.nodes[c].right = k;
                return t;
            }
            c = t.nodes[c].right;
        }
    }
    return t;
}`,
      rs: `fn insert(mut t: Tree, v: i32) -> Tree {
    t.nodes.push(Node { value: v, left: None, right: None });
    let k = t.nodes.len() - 1;
    let mut cur = match t.root {
        Some(r) => r,
        None => {
            t.root = Some(k);
            return t;
        }
    };
    loop {
        let left = t.nodes[cur].left;
        let right = t.nodes[cur].right;
        if v < t.nodes[cur].value {
            if let Some(n) = left {
                cur = n;
            } else {
                t.nodes[cur].left = Some(k);
                return t;
            }
        } else {
            if let Some(n) = right {
                cur = n;
            } else {
                t.nodes[cur].right = Some(k);
                return t;
            }
        }
    }
}`,
    },
    cycle: {
      js: 'function insert(r,v){if(r)r.left=r;return r}',
      py: 'def insert(r, v):\n    if r is not None:\n        r["left"] = r\n    return r',
      cpp: 'Tree insert(Tree t, int v) { if (t.root != -1) { t.nodes[t.root].left = t.root; } return t; }',
      rs: 'fn insert(mut t: Tree, v: i32) -> Tree { if let Some(r) = t.root { t.nodes[r].left = Some(r); } t }',
    },
    cycleBlock: fn('insert', [['root', 'tree'], ['value', 'int']], 'tree', [{ args: [[1, 2], 3], want: [1, 2, -1, -1, 3] }]),
  },
  height: {
    kind: 'tree',
    block: fn('height', [['root', 'tree']], 'int', [
      { args: [[]], want: 0 }, { args: [[5]], want: 1 }, { args: [[5, 3, 8, -1, 4]], want: 3 }, { args: [[8, -1, 10, -1, 12]], want: 3 }]),
    answers: {
      js: 'function height(n){return n?1+Math.max(height(n.left),height(n.right)):0}',
      py: 'def height(n):\n    if n is None:\n        return 0\n    return 1 + max(height(n["left"]), height(n["right"]))',
      cpp: `int heightAt(const Tree& t, int i) {
    if (i == -1) {
        return 0;
    }
    int l = heightAt(t, t.nodes[i].left);
    int r = heightAt(t, t.nodes[i].right);
    if (l > r) {
        return l + 1;
    }
    return r + 1;
}

int height(Tree t) {
    return heightAt(t, t.root);
}`,
      rs: `fn height_at(t: &Tree, i: Option<usize>) -> i32 {
    match i {
        None => 0,
        Some(k) => {
            let l = height_at(t, t.nodes[k].left);
            let r = height_at(t, t.nodes[k].right);
            if l > r { l + 1 } else { r + 1 }
        }
    }
}

fn height(t: Tree) -> i32 {
    height_at(&t, t.root)
}`,
    },
  },
};

for (const [name, f] of Object.entries(FIXTURES)) {
  for (const lang of LANGS) {
    test(`node fixture ${name}: the reference answer passes every case in ${lang}`, () => {
      const rs = run(lang, f.block, f.kind, f.answers[lang]);
      assert.deepEqual(rs.map((r) => r.msg || r.status), rs.map(() => 'pass'));
    });
  }
}

for (const [name, f] of Object.entries(FIXTURES)) {
  if (!f.cycle) continue;
  for (const lang of LANGS) {
    test(`node fixture ${name}: a cycle in ${lang} fails the case as wrong, and the run finishes`, () => {
      // wrong, not limit: the helper's visit cap ends the walk, so no engine step limit is involved
      assert.deepEqual(statuses(run(lang, f.cycleBlock, f.kind, f.cycle[lang])), ['wrong']);
    });
  }
}

// Observed: the Rust engine does not model `if let Some(n) = t.nodes[cur].left` (a pattern on a field of an indexed element).
// An answer copies the link into a local first. When the engine learns this form, this test fails and the starters can drop the copy.
test('node fixture insert: Rust reports a pattern on an indexed field as unsupported', () => {
  const direct = FIXTURES.insert.answers.rs.replace('let left = t.nodes[cur].left;', '').replace('let right = t.nodes[cur].right;', '')
    .replace('if let Some(n) = left', 'if let Some(n) = t.nodes[cur].left').replace('if let Some(n) = right', 'if let Some(n) = t.nodes[cur].right');
  const rs = run('rs', FIXTURES.insert.block, 'tree', direct);
  assert.deepEqual(statuses(rs), ['error', 'error', 'error', 'error']);
  assert.match(rs[0].msg, /^not supported by this quest: borrow of a field \(line \d+\)$/);
});

test('node fixtures: the type mapping and the helper shapes are what the contract freezes', () => {
  assert.deepEqual(Object.keys(P.HELPERS.cpp).sort(), ['fromList', 'fromTree', 'toList', 'toTree']);
  assert.deepEqual(Object.keys(P.HELPERS.rs).sort(), ['fromList', 'fromTree', 'toList', 'toTree']);
  assert.match(P.HELPERS.cpp.fromList, /struct List \{ vector<Node> nodes; int head; \}/);
  assert.match(P.HELPERS.cpp.fromTree, /struct Tree \{ vector<Node> nodes; int root; \}/);
  assert.match(P.HELPERS.rs.fromList, /struct List \{ nodes: Vec<Node>, head: Option<usize> \}/);
  assert.match(P.HELPERS.rs.fromTree, /struct Tree \{ nodes: Vec<Node>, root: Option<usize> \}/);
  assert.match(P.HELPERS.rs.toList, /fn to_list\(l: &List\) -> Vec<i32>/);
  assert.match(P.HELPERS.cpp.toTree, /vector<int> toTree\(Tree t\)/);
});

/* For every mission with a practice block and every language no PENDING row covers: starter, answer, wrong and lazy must exist,
   the answer passes every case (generated cases expanded), and wrong, lazy, the starter and an empty program each fail some case.
   A10: a scriptStep mission is taught in a JavaScript script, so py, cpp and rs are not required for it.
   It returns the problems, so a bite proof can read them. */
function walk(CH, pending = P.PENDING, langs = LANGS) {
  const problems = [];
  CH.forEach((ch, ci) => ch.missions.forEach((m, mi) => {
    if (!m.practice) return;
    const id = `${ci}.${mi}`;
    for (const lang of langs) {
      if (pending.some((r) => (r.mission === '*' || r.mission === id) && r.lang === lang)) continue;
      if (m.scriptStep && lang !== 'js') continue;
      const L = (m.practice.langs || {})[lang] || {};
      const absent = ['starter', 'answer', 'wrong', 'lazy'].filter((k) => typeof L[k] !== 'string');
      if (absent.length) { problems.push(`${id} ${lang}: missing ${absent.join(', ')}`); continue; }
      const res = (src) => plain(P.RUNNERS[lang].run(src, m.practice));
      const bad = res(L.answer).find((r) => !r.ok);
      if (bad) problems.push(`${id} ${lang}: the answer fails (${bad.status}: ${bad.msg})`);
      for (const k of ['wrong', 'lazy', 'starter']) if (res(L[k]).every((r) => r.ok)) problems.push(`${id} ${lang}: the ${k} answer passes`);
      if (res('').every((r) => r.ok)) problems.push(`${id} ${lang}: an empty program passes`);
    }
  }));
  return problems;
}
const missionWith = (practice, extra = {}) => [{ missions: [{ title: 'fixture', practice, ...extra }] }];

test('walk: mission 0.3 has a practice block, so the real walk is never empty', () => {
  assert.ok(E.DSQ.CH[0].missions[3].practice);
});

for (const lang of LANGS) {
  test(`walk: every real practice block is solvable in ${lang}`, () => {
    assert.deepEqual(walk(E.DSQ.CH, P.PENDING, [lang]), []);
  });
}

// a 1.1 shape: returns [top, size after peeking], so an answer that pops gives a size one too low
const PEEK = {
  js: { starter: 'function peek(xs){return []}', answer: 'function peek(xs){return [xs[xs.length-1],xs.length]}',
    wrong: 'function peek(xs){const t=xs.pop();return [t,xs.length]}', lazy: 'function peek(xs){return [2,3]}' },
  py: { starter: 'def peek(xs):\n    return []', answer: 'def peek(xs):\n    return [xs[len(xs) - 1], len(xs)]',
    wrong: 'def peek(xs):\n    t = xs.pop()\n    return [t, len(xs)]', lazy: 'def peek(xs):\n    return [2, 3]' },
  cpp: { starter: `${CPP_HEAD}vector<int> peek(vector<int> xs) { vector<int> r; return r; }`,
    answer: `${CPP_HEAD}vector<int> peek(vector<int> xs) { vector<int> r; r.push_back(xs[xs.size() - 1]); r.push_back(xs.size()); return r; }`,
    wrong: `${CPP_HEAD}vector<int> peek(vector<int> xs) { vector<int> r; int t = xs[xs.size() - 1]; xs.pop_back(); r.push_back(t); r.push_back(xs.size()); return r; }`,
    lazy: `${CPP_HEAD}vector<int> peek(vector<int> xs) { vector<int> r; r.push_back(2); r.push_back(3); return r; }` },
  rs: { starter: 'fn peek(xs: Vec<i32>) -> Vec<i32> { Vec::new() }', answer: 'fn peek(xs: Vec<i32>) -> Vec<i32> { let n = xs.len(); vec![xs[n - 1], n as i32] }',
    wrong: 'fn peek(xs: Vec<i32>) -> Vec<i32> { let n = xs.len() - 1; vec![xs[n], n as i32] }', lazy: 'fn peek(xs: Vec<i32>) -> Vec<i32> { vec![2, 3] }' },
};
const peekBlock = (langs = PEEK) => ({ ...fn('peek', [['xs', 'ints']], 'ints', [
  { args: [[3, 1, 2]], want: [2, 3] }, { args: [[5]], want: [5, 1] }, { args: [[7, 7, 4, 9]], want: [9, 4] }]), langs });
const without = (langs, lang, key) => ({ ...langs, [lang]: { ...langs[lang], [key]: undefined } });
const withKey = (langs, lang, key, src) => ({ ...langs, [lang]: { ...langs[lang], [key]: src } });

test('walk: a good fixture in the 1.1 shape passes in all four languages', () => {
  assert.deepEqual(walk(missionWith(peekBlock())), []);
});

test('walk: it bites on a wrong answer, a missing part, a lazy answer that passes and a starter that passes', () => {
  for (const lang of LANGS) {
    const broken = walk(missionWith(peekBlock(withKey(PEEK, lang, 'answer', PEEK[lang].wrong))));
    assert.equal(broken.length, 1, lang);
    assert.match(broken[0], new RegExp(`^0\\.0 ${lang}: the answer fails \\(wrong: `));
    for (const key of ['answer', 'wrong', 'lazy', 'starter']) {
      assert.deepEqual(walk(missionWith(peekBlock(without(PEEK, lang, key)))), [`0.0 ${lang}: missing ${key}`], `${lang} ${key}`);
    }
    assert.deepEqual(walk(missionWith(peekBlock(withKey(PEEK, lang, 'lazy', PEEK[lang].answer)))), [`0.0 ${lang}: the lazy answer passes`], `${lang} lazy`);
    assert.deepEqual(walk(missionWith(peekBlock(withKey(PEEK, lang, 'starter', PEEK[lang].answer)))), [`0.0 ${lang}: the starter answer passes`], `${lang} starter`);
    assert.deepEqual(walk(missionWith(peekBlock(withKey(PEEK, lang, 'wrong', PEEK[lang].answer)))), [`0.0 ${lang}: the wrong answer passes`], `${lang} wrong`);
  }
  assert.deepEqual(walk(missionWith(peekBlock({ js: PEEK.js }))).map((p) => p.slice(0, 8)), ['0.0 py: ', '0.0 cpp:', '0.0 rs: '], 'a language with no entry at all');
});

test('walk: a pair covered by a PENDING row is skipped, an exact or a * row, and only that pair', () => {
  const noPyCpp = { js: PEEK.js, rs: PEEK.rs };
  const mission = missionWith(peekBlock(noPyCpp));
  assert.equal(walk(mission, []).length, 2);
  assert.deepEqual(walk(mission, [{ mission: '0.0', lang: 'py', issue: 309 }, { mission: '*', lang: 'cpp', issue: 310 }]), []);
  assert.equal(walk(mission, [{ mission: '0.0', lang: 'cpp', issue: 310 }]).length, 1, 'the py pair is still required');
  assert.equal(walk(mission, [{ mission: '0.1', lang: 'py', issue: 309 }, { mission: '*', lang: 'cpp', issue: 310 }]).length, 1, 'a row for another mission covers nothing');
  assert.equal(walk(mission, [{ mission: '0.0', lang: 'rs', issue: 311 }]).length, 2, 'a row for a language that is fine skips only that one');
});

test('walk: a scriptStep mission is exempt from py, cpp and rs (A10) and still needs js', () => {
  const jsOnly = peekBlock({ js: PEEK.js });
  assert.deepEqual(walk(missionWith(jsOnly, { scriptStep: true })), []);
  assert.equal(walk(missionWith(jsOnly)).length, 3);
  assert.deepEqual(walk(missionWith(peekBlock({}), { scriptStep: true })), ['0.0 js: missing starter, answer, wrong, lazy']);
  assert.match(walk(missionWith(peekBlock({ js: withKey(PEEK, 'js', 'answer', PEEK.js.wrong).js }), { scriptStep: true }))[0], /the answer fails/);
});

const STACK_SRC = 'class Stack{constructor(){this.items=[]}push(x){this.items.push(x)}pop(){return this.items.length?this.items.pop():-1}size(){return this.items.length}}';
const STACK_RS = `struct Stack { items: Vec<i32> }
impl Stack {
    fn new() -> Stack { Stack { items: Vec::new() } }
    fn push(&mut self, x: i32) { self.items.push(x); }
    fn pop(&mut self) -> i32 { POP }
    fn size(&self) -> i32 { SIZE }
}`;
const stackRs = (pop, size) => STACK_RS.replace('POP', pop).replace('SIZE', size);
const STACK_BLOCK = {
  cls: { name: 'Stack', methods: { push: sig([['x', 'int']], 'void'), pop: sig([], 'int'), size: sig([], 'int') }, tests: [
    [{ m: 'push', args: [1] }, { m: 'push', args: [2] }, { m: 'pop', args: [], want: 2 }, { m: 'size', args: [], want: 1 }],
    [{ m: 'pop', args: [], want: -1 }, { m: 'size', args: [], want: 0 }]] },
  langs: {
    js: { starter: 'class Stack{constructor(){}push(x){}pop(){return 0}size(){return 0}}', answer: STACK_SRC,
      wrong: STACK_SRC.replace('this.items.pop()', 'this.items.shift()'), lazy: 'class Stack{constructor(){}push(x){}pop(){return 2}size(){return 1}}' },
    rs: { starter: stackRs('0', '0'), answer: stackRs('match self.items.pop() { Some(v) => v, None => -1 }', 'self.items.len() as i32'),
      wrong: stackRs('match self.items.pop() { Some(v) => v - 1, None => -1 }', 'self.items.len() as i32'), lazy: stackRs('2', '1') },
  },
};

test('walk: a class fixture passes in js and rs, and py and cpp need PENDING rows because they run no classes', () => {
  const rows = [{ mission: '0.0', lang: 'py', issue: 309 }, { mission: '0.0', lang: 'cpp', issue: 310 }];
  assert.deepEqual(walk(missionWith(STACK_BLOCK), rows), []);
  assert.deepEqual(walk(missionWith(STACK_BLOCK), []), ['0.0 py: missing starter, answer, wrong, lazy', '0.0 cpp: missing starter, answer, wrong, lazy']);
  const py = { starter: 'class Stack:\n    pass', answer: 'class Stack:\n    pass', wrong: 'class Stack:\n    pass', lazy: 'class Stack:\n    pass' };
  const p = walk(missionWith({ ...STACK_BLOCK, langs: { ...STACK_BLOCK.langs, py } }), [rows[1]]);
  assert.match(p[0], /^0\.0 py: the answer fails \(unsupported: /);
});

const RUNMAX = {
  js: ['function runMax(xs){const out=[];let best=-1;for(let i=0;i<xs.length;i++){if(xs[i]>best){best=xs[i]}out.push(best)}return out}',
    'function runMax(xs){const out=[];for(let i=0;i<xs.length;i++){let b=xs[i];for(let j=0;j<=i;j++){if(xs[j]>b){b=xs[j]}}out.push(b)}return out}'],
  py: ['def run_max(xs):\n    out = []\n    best = -1\n    for x in xs:\n        if x > best:\n            best = x\n        out.append(best)\n    return out',
    'def run_max(xs):\n    out = []\n    i = 0\n    while i < len(xs):\n        b = xs[i]\n        j = 0\n        while j <= i:\n            if xs[j] > b:\n                b = xs[j]\n            j = j + 1\n        out.append(b)\n        i = i + 1\n    return out'],
  rs: ['fn run_max(xs: Vec<i32>) -> Vec<i32> { let mut out: Vec<i32> = Vec::new(); let mut best = -1; for x in xs.iter() { if *x > best { best = *x; } out.push(best); } out }',
    'fn run_max(xs: Vec<i32>) -> Vec<i32> { let mut out: Vec<i32> = Vec::new(); for i in 0..xs.len() { let mut b = xs[i]; for j in 0..i + 1 { if xs[j] > b { b = xs[j]; } } out.push(b); } out }'],
};
const PAIRS = {
  js: ['function lookup(keys,vals,queries){const m=new Map();for(let i=0;i<keys.length;i++){m.set(keys[i],vals[i])}const out=[];for(let i=0;i<queries.length;i++){out.push(m.has(queries[i])?m.get(queries[i]):-1)}return out}',
    'function lookup(keys,vals,queries){const out=[];for(let i=0;i<queries.length;i++){let r=-1;for(let j=0;j<keys.length;j++){if(keys[j]===queries[i]){r=vals[j]}}out.push(r)}return out}'],
  py: ['def lookup(keys, vals, queries):\n    m = {}\n    for i in range(len(keys)):\n        m[keys[i]] = vals[i]\n    out = []\n    for q in queries:\n        if q in m:\n            out.append(m[q])\n        else:\n            out.append(-1)\n    return out',
    'def lookup(keys, vals, queries):\n    out = []\n    for q in queries:\n        r = -1\n        for j in range(len(keys)):\n            if keys[j] == q:\n                r = vals[j]\n        out.append(r)\n    return out'],
  rs: ['use std::collections::HashMap;\nfn lookup(keys: Vec<i32>, vals: Vec<i32>, queries: Vec<i32>) -> Vec<i32> { let mut m: HashMap<i32, i32> = HashMap::new(); for i in 0..keys.len() { m.insert(keys[i], vals[i]); } let mut out: Vec<i32> = Vec::new(); for q in queries.iter() { match m.get(q) { Some(v) => out.push(*v), None => out.push(-1) } } out }',
    'fn lookup(keys: Vec<i32>, vals: Vec<i32>, queries: Vec<i32>) -> Vec<i32> { let mut out: Vec<i32> = Vec::new(); for q in queries.iter() { let mut r = -1; for j in 0..keys.len() { if keys[j] == *q { r = vals[j]; } } out.push(r); } out }'],
};
const WORDS = {
  js: ['function countWords(text){const m=new Map();for(const w of text.split(" ")){m.set(w,(m.get(w)||0)+1)}const out=[];for(const [w,c] of m){out.push(w+" "+c)}return out}',
    'function countWords(text){const ws=text.split(" ");const seen=[];const cnt=[];for(let i=0;i<ws.length;i++){let f=-1;for(let j=0;j<seen.length;j++){if(seen[j]===ws[i]){f=j}}if(f<0){seen.push(ws[i]);cnt.push(1)}else{cnt[f]=cnt[f]+1}}const out=[];for(let i=0;i<seen.length;i++){out.push(seen[i]+" "+cnt[i])}return out}'],
  py: ['def count_words(text):\n    m = {}\n    order = []\n    for w in text.split(" "):\n        if w in m:\n            m[w] = m[w] + 1\n        else:\n            m[w] = 1\n            order.append(w)\n    out = []\n    for w in order:\n        out.append(w + " " + str(m[w]))\n    return out',
    'def count_words(text):\n    ws = text.split(" ")\n    seen = []\n    cnt = []\n    for w in ws:\n        f = -1\n        for j in range(len(seen)):\n            if seen[j] == w:\n                f = j\n        if f < 0:\n            seen.append(w)\n            cnt.append(1)\n        else:\n            cnt[f] = cnt[f] + 1\n    out = []\n    for i in range(len(seen)):\n        out.append(seen[i] + " " + str(cnt[i]))\n    return out'],
};
const runMaxBlock = (n) => ({ ...fn('runMax', [['xs', 'ints']], 'ints', [{ args: [{ gen: 'ramp', n }], want: { gen: 'ramp', n } }]) });
const pairsBlock = (n, q = n) => ({ nothing: -1, ...fn('lookup', [['keys', 'ints'], ['vals', 'ints'], ['queries', 'ints']], 'ints', [
  { args: ['keys', 'vals', 'queries'].map((part) => ({ gen: 'pairs', n, q, part })), want: { gen: 'pairs', n, q, part: 'want' } }]) });
const wordsBlock = (n) => fn('countWords', [['text', 'str']], 'strs', [{ args: [{ gen: 'words', n, part: 'text' }], want: { gen: 'words', n, part: 'want' } }]);
const FULL = 2000;
const DECISION = 'speed-case decision';
const RS_SPLIT = 'fn count_words(text: String) -> Vec<String> { let mut out: Vec<String> = Vec::new(); for w in text.split(" ") { out.push(w.to_string()); } out }';
const smaller = (what) => `${DECISION}: ${what}; a smaller size is used where the linear answer passes and the nested one reports limit, and a runner with no proving size is a gap tracked under #310 (C++) or #311 (Rust)`;
// Each cell is a proving block, an accepted smaller block, or a gap; holds() stays true while the reason stands.
const SPEED = [
  { name: 'runMax', kind: 'ramp', src: RUNMAX, cells: {
    js: { block: runMaxBlock(FULL) }, py: { block: runMaxBlock(FULL) }, rs: { block: runMaxBlock(FULL) },
    cpp: { gap: 310, why: 'the nested answer reports limit only from 500 elements, about 12 s' } } },
  { name: 'pairs', kind: 'pairs', src: PAIRS, cells: {
    js: { block: pairsBlock(FULL) }, py: { block: pairsBlock(FULL) },
    rs: { block: pairsBlock(200, 600), accepted: smaller('200 keys and 600 queries, a 2,000-key HashMap hits the step limit'),
      holds: () => statuses(plain(P.RUNNERS.rs.run(PAIRS.rs[0], pairsBlock(FULL)))).join() === 'limit' },
    cpp: { gap: 310, why: 'no map' } } },
  { name: 'words', kind: 'words', src: WORDS, cells: {
    js: { block: wordsBlock(500), accepted: smaller('500 words') },
    py: { block: wordsBlock(500), accepted: smaller('500 words') },
    rs: { gap: 311, why: 'str.split is not modelled', holds: () => {
      const [r] = plain(P.RUNNERS.rs.run(RS_SPLIT, wordsBlock(4)));
      return r.status === 'error' && /^not supported by this quest: method call/.test(r.msg);
    } },
    cpp: { gap: 310, why: 'no map' } } },
];

const gensOf = (block) => [...block.fn.tests[0].args, block.fn.tests[0].want].filter((e) => e && e.gen);
const sizeOf = (block) => Math.min(...gensOf(block).flatMap((e) => (e.gen === 'pairs' ? [e.n, e.q ?? e.n] : [e.n])));
const GAP_ISSUE = { cpp: 310, rs: 311 };

function speedProblems(rows, kinds) {
  const out = [];
  const names = rows.map((r) => r.name);
  for (const n of new Set(names.filter((x, i) => names.indexOf(x) !== i))) out.push(`${n}: duplicate row name`);
  const have = [...new Set(rows.map((r) => r.kind))].sort().join();
  if (have !== [...kinds].sort().join()) out.push(`kinds: the speed rows cover ${have}, the generators are ${[...kinds].sort().join()}`);
  for (const row of rows) {
    for (const lang of ['js', 'py', 'cpp', 'rs']) {
      const at = `${row.name} ${lang}`;
      const cell = row.cells[lang];
      if (!cell) { out.push(`${at}: no cell`); continue; }
      if (cell.block && cell.gap) { out.push(`${at}: both a block and a gap`); continue; }
      if (!cell.block && !cell.gap) { out.push(`${at}: neither a block nor a gap`); continue; }
      if (cell.holds !== undefined && typeof cell.holds !== 'function') out.push(`${at}: holds is not a function`);
      if (cell.block) {
        const gens = gensOf(cell.block);
        if (gens.some((e) => e.gen !== row.kind)) out.push(`${at}: a block entry has a gen other than ${row.kind}`);
        const size = sizeOf(cell.block);
        if (!gens.some((e) => e.gen === row.kind) || !Number.isFinite(size)) { out.push(`${at}: a speed block needs a ${row.kind} generator entry with a finite size`); continue; }
        if (size < FULL && !(typeof cell.accepted === 'string' && cell.accepted.startsWith(DECISION))) out.push(`${at}: size ${size} is below ${FULL} and needs an accepted text starting with ${DECISION}`);
        if (size >= FULL && cell.accepted !== undefined) out.push(`${at}: accepted on a ${FULL}-element block is stale`);
      } else {
        if (cell.accepted !== undefined) out.push(`${at}: accepted on a gap cell`);
        if (lang === 'js' || lang === 'py') out.push(`${at}: a gap is not allowed, this runner fits every case`);
        else if (cell.gap !== GAP_ISSUE[lang]) out.push(`${at}: a ${lang} gap must name issue ${GAP_ISSUE[lang]}`);
        if (!cell.why) out.push(`${at}: a gap needs a why`);
      }
    }
  }
  return out;
}

for (const { name, src, cells } of SPEED) {
  for (const [lang, { block, accepted }] of Object.entries(cells)) {
    if (!block) continue;
    test(`speed ${name}: in ${lang} a linear answer fits the step limit and a nested-loop answer reports limit${accepted ? ` (${accepted})` : ''}`, () => {
      assert.deepEqual(plain(P.RUNNERS[lang].run(src[lang][0], block)).map((r) => r.msg || r.status), ['pass']);
      assert.deepEqual(statuses(plain(P.RUNNERS[lang].run(src[lang][1], block))), ['limit']);
    });
  }
}

test('speed pairs: a walk fixture with generated cases in js and py, cpp and rs under PENDING rows', () => {
  const langs = {
    js: { starter: 'function lookup(keys,vals,queries){return []}', answer: PAIRS.js[0], wrong: PAIRS.js[0].replace(':-1', ':0'), lazy: PAIRS.js[1] },
    py: { starter: 'def lookup(keys, vals, queries):\n    return []', answer: PAIRS.py[0], wrong: PAIRS.py[0].replace('append(-1)', 'append(0)'), lazy: PAIRS.py[1] },
  };
  const rows = [{ mission: '*', lang: 'cpp', issue: 310 }, { mission: '*', lang: 'rs', issue: 311 }];
  assert.deepEqual(walk(missionWith({ ...pairsBlock(2000), langs }), rows), []);
  const rightAsWrong = { ...langs, js: { ...langs.js, wrong: langs.js.answer } };
  assert.deepEqual(walk(missionWith({ ...pairsBlock(2000), langs: rightAsWrong }), rows), ['0.0 js: the wrong answer passes']);
});

const speedProblemFixtures = () => {
  const ok = { block: pairsBlock(2000) };
  const good = { name: 'pairs', kind: 'pairs', cells: { js: ok, py: ok, cpp: { gap: 310, why: 'no map' }, rs: { gap: 311, why: 'slow map' } } };
  const accepted = `${DECISION}: 10 queries, the linear answer passes and the nested one reports limit`;
  const withCells = (cells, row = {}) => [{ ...good, ...row, cells: { ...good.cells, ...cells } }];
  const problems = (rows, kinds = ['pairs']) => speedProblems(rows, kinds);
  return { good, accepted, withCells, problems };
};

test('speed table: every pair is a proving block, an accepted smaller block or a gap, and every generator kind has a row', () => {
  assert.deepEqual(speedProblems(SPEED, Object.keys(P.GEN_KINDS)), []);
});

test('speed table rules: each one fails when broken and passes when kept', () => {
  const { good, accepted, withCells, problems } = speedProblemFixtures();
  const small = { block: pairsBlock(2000, 10) };
  assert.deepEqual(problems([good]), []);
  assert.match(problems(withCells({ cpp: undefined }))[0], /^pairs cpp: no cell/);
  assert.match(problems(withCells({ cpp: {} }))[0], /^pairs cpp: neither a block nor a gap/);
  assert.match(problems(withCells({ cpp: { block: good.cells.js.block, gap: 310, why: 'x' } }))[0], /^pairs cpp: both a block and a gap/);
  assert.match(problems(withCells({ js: small }))[0], /^pairs js: .*below 2000.*speed-case decision/);
  assert.deepEqual(problems(withCells({ js: { ...small, accepted } })), []);
  assert.match(problems(withCells({ js: { ...small, accepted: 'fine' } }))[0], /^pairs js: .*speed-case decision/);
  assert.match(problems(withCells({ js: { ...good.cells.js, accepted } }))[0], /^pairs js: .*stale/);
  assert.match(problems(withCells({ js: { gap: 310, why: 'x' } }))[0], /^pairs js: a gap/);
  assert.match(problems(withCells({ cpp: { gap: 311, why: 'x' } }))[0], /^pairs cpp: .*310/);
  assert.match(problems(withCells({ rs: { gap: 310, why: 'x' } }))[0], /^pairs rs: .*311/);
  assert.match(problems(withCells({ cpp: { gap: 310 } }))[0], /^pairs cpp: .*why/);
  assert.match(problems(withCells({ cpp: { gap: 310, why: 'x', accepted } }))[0], /^pairs cpp: .*accepted/);
  assert.match(problems(withCells({ cpp: { gap: 310, why: 'x', holds: true } }))[0], /^pairs cpp: .*holds/);
  assert.match(problems(withCells({ js: { block: runMaxBlock(2000) } }))[0], /^pairs js: .*gen/);
  const noGen = { block: fn('peek', [['xs', 'ints']], 'ints', [{ args: [[1]], want: [1] }]) };
  assert.match(problems(withCells({ js: noGen }))[0], /^pairs js: a speed block needs a pairs generator entry with a finite size/);
  const noSize = { block: pairsBlock(undefined) };
  assert.match(problems(withCells({ js: noSize }))[0], /^pairs js: a speed block needs a pairs generator entry with a finite size/);
  assert.match(problems([good, good])[0], /^pairs: duplicate row name/);
  assert.match(problems([good], ['pairs', 'words'])[0], /kinds/);
  assert.match(problems([good, { ...good, name: 'words', kind: 'words' }], ['pairs'])[0], /kinds/);
});

test('speed table: every reason a gap or smaller size stands still holds', () => {
  for (const row of SPEED) for (const [lang, cell] of Object.entries(row.cells)) {
    if (cell.holds) assert.ok(cell.holds(), `speed ${row.name} ${lang}: the engine changed, so update this row or size (${cell.why || cell.accepted})`);
  }
});
