// awk: the interpreter (engine/awk.js, SQ.awkRun) and the command (CMDS.awk), Task 9.
// Expected values come from mawk 1.3.4 20240123 run by hand on copies of the same files (the default world's village/shop.txt,
// village/people.txt, journal.txt, readme.txt, plus the csv file written below), except where a comment says otherwise:
// "gawk/POSIX" marks a case where this practice shell follows gawk or POSIX rather than mawk, and "practice shell" marks a cap or
// message of its own (documented in engine/awk.js).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadShell, run } from './harness.mjs';

const CSV = 'name,age,city\nAda,36,London\nBen,25,Paris\nZoe,41,Rome';
function world() {
  const SQ = loadShell();
  run(SQ, `printf '${CSV.replace(/\n/g, '\\n')}\\n' > csv`);
  run(SQ, "printf 'a b c\\nd e f\\n' > abc");
  return SQ;
}
const r = (line, SQ = world()) => run(SQ, line);
const out = (line, SQ) => r(line, SQ).out;
const L = (...xs) => xs.join('\n');

/* 40+ one-liners. Every expected output was produced by mawk on the same input (see the header) and read over by hand;
   the for-in line is piped through sort because real awk's for-in order is unspecified (this shell uses insertion order). */
const ONE_LINERS = [
  ["awk '{print $1}' village/shop.txt", L('apple', 'bread', 'rope', 'torch', 'map')],
  ["awk '{print $2, $1}' village/shop.txt", L('2 apple', '3 bread', '12 rope', '8 torch', '20 map')],
  ["awk '{s+=$2} END{print s}' village/shop.txt", '45'],
  ["awk '$2>5' village/shop.txt", L('rope 12', 'torch 8', 'map 20')],
  ["awk 'NR==2' village/shop.txt", 'bread 3'],
  ["awk 'END{print NR}' journal.txt", '30'],
  ["awk -F, '{print NF}' csv", L('3', '3', '3', '3')],
  ["awk -F, 'NR>1{print $1}' csv", L('Ada', 'Ben', 'Zoe')],
  ["awk -F, 'NR>1{sum+=$2} END{print sum/(NR-1)}' csv", '34'],
  ["awk '/wolf/' journal.txt", L('Heard a wolf howling far away.', 'The wolf followed me to the gate, then turned away.')],
  ["awk 'tolower($0) ~ /wolf/{c++} END{print c}' journal.txt", '4'],
  ["awk 'length($0)>4' village/people.txt", 'Tomas'],
  ["awk '!seen[$0]++' village/people.txt", L('Mira', 'Tomas', 'Ada', 'Ben', 'Zoe', 'Lena', 'Omar', 'Kai')],
  ["awk '{c[$0]++} END{for(k in c) if(c[k]>1) print k, c[k]}' village/people.txt | sort", L('Ada 2', 'Ben 2', 'Mira 3')],
  ["awk 'BEGIN{print 1+2, 7/2, 2^10, 7%3, -7%3}'", '3 3.5 1024 1 -1'],
  [`awk 'BEGIN{printf "%5.2f|%-4s|%03d|%x|%e\\n", 3.14159, "ab", 7, 255, 1234.5}'`, ' 3.14|ab  |007|ff|1.234500e+03'],
  [`awk 'BEGIN{print substr("hello",2,3), substr("hello",3), index("hello","l"), toupper("abc")}'`, 'ell llo 3 ABC'],
  [`awk 'BEGIN{n=split("a:b:c",p,":"); print n, p[3], length(p)}'`, '3 c 3'],
  [`echo 'a b c' | awk '{$2="X"; print}'`, 'a X c'],
  ["echo 'a b c' | awk -v OFS=- '{$1=$1; print}'", 'a-b-c'],
  ["echo 'a b c d' | awk '{NF=2; print}'", 'a b'],
  [`echo '  lead   trail  ' | awk '{print $1 "|" NF}'`, 'lead|2'],
  ["echo 'x=1;y=2' | awk -F'[=;]' '{print $2+$4}'", '3'],
  ["printf 'a\\tb c\\n' | awk -F'\\t' '{print $2}'", 'b c'],
  [`awk 'NR==2,NR==4{print NR": "$1}' village/shop.txt`, L('2: bread', '3: rope', '4: torch')],
  [`echo hello | awk '{sub(/l+/,"L"); print}'`, 'heLo'],
  [`echo banana | awk '{n=gsub(/a/,"o"); print n, $0}'`, '3 bonono'],
  ["echo foobar | awk '{print match($0,/o+b/), RSTART, RLENGTH}'", '2 2 3'],
  [`awk 'BEGIN{x["a"]=1; delete x["a"]; print length(x), ("a" in x)}'`, '0 0'],
  ["awk 'function fact(n){return n<=1?1:n*fact(n-1)} BEGIN{print fact(10)}'", '3628800'],
  [`awk 'function fill(a){a["k"]="v"} BEGIN{fill(arr); print arr["k"]}'`, 'v'],
  [`echo '10 9' | awk '{print ($1<$2), ("10"<"9"), (10<9)}'`, '0 1 0'],
  [`awk 'BEGIN{print x+0, "[" x "]", length(x), (x==0), (x=="")}'`, '0 [] 0 1 1'],
  ["awk 'BEGIN{print 0.1+0.2, 1/3, 1e6, 100000*100000, 2^53}'", '0.3 0.333333 1000000 10000000000 9007199254740992'],
  ["awk -v n=3 'BEGIN{while(i<n) print ++i}'", L('1', '2', '3')],
  [`awk 'BEGIN{for(i=1;i<=10;i++){if(i==3)continue; if(i==6)break; printf "%d ", i}; print ""}'`, '1 2 4 5 '],
  ["awk 'FNR==1{print FILENAME, NR}' village/shop.txt readme.txt", L('village/shop.txt 1', 'readme.txt 6')],
  [`awk 'BEGIN{printf "%c%c\\n", 72, "i!"}'`, 'Hi'],
  [`awk 'BEGIN{print int(-3.7), int("42abc"), sqrt(16), exp(0), log(1)}'`, '-3 42 4 1 0'],
  [`awk 'BEGIN { exit 3 } END { print "end" }'; echo $?`, L('end', '3')],
  ["seq 5 | awk 'NR%2'", L('1', '3', '5')],
  [`awk 'BEGIN{s=sprintf("%s-%d", "id", 42.9); print s, length(s)}'`, 'id-42 5'],
  [`echo a | awk '{$3="z"; print; print NF}'`, L('a  z', '3')],
  ["echo 'a b c' | awk '{print $NF, $(NF-1)}'", 'c b'],
  [`awk 'BEGIN{print 1==1.0, "a"<"b", 2<10, "2"<"10"}'`, '1 1 1 0'],
  ["echo a:b:c | awk -F: -v OFS=: '{t=$1; $1=$2; $2=t} 1'", 'b:a:c'],
  [`awk 'BEGIN{a["x"]=1; a["y"]=2; a["z"]=3; for(k in a) s+=a[k]; print s}'`, '6'],
  [`awk 'BEGIN{print length("abc") length(12345)}'`, '35'],
];

describe('awk one-liners (checked against mawk)', () => {
  it('has at least 40 pinned one-liners', () => assert.ok(ONE_LINERS.length >= 40));
  const SQ = world();
  for (const [line, want] of ONE_LINERS) {
    it(line, () => {
      const got = r(line, SQ);
      assert.equal(got.out, want);
      if (!/exit 3/.test(line)) assert.equal(got.code, 0);
    });
  }
});

describe('SQ.awkRun', () => {
  const SQ = loadShell();
  it('runs a program over named inputs and returns { out, err, code }', () => {
    const res = SQ.awkRun('{print FILENAME ": " $2}', [{ name: 'f', text: 'a b\nc d' }], { vars: {} });
    assert.deepEqual({ ...res }, { out: 'f: b\nf: d\n', err: '', code: 0 });
  });
  it('takes FS and -v style vars (escapes processed) and reads stdin when there are no inputs', () => {
    const res = SQ.awkRun('{print $2 x}', [], { FS: ',', vars: { x: '\\t!' }, stdin: '1,2' });
    assert.equal(res.out, '2\t!\n');
  });
  it('a syntax error is reported before anything runs', () => {
    const res = SQ.awkRun('BEGIN{print "x"} {', [], { vars: {} });
    assert.equal(res.code, 2);
    assert.equal(res.out, '');
    assert.match(res.err, /^awk: syntax error at source line 1/);
  });
});

describe('fields and special variables', () => {
  it('NF NR FNR FILENAME across two files', () => {
    assert.equal(out("awk '{print FILENAME, NR, FNR, NF}' abc csv"), L('abc 1 1 3', 'abc 2 2 3', 'csv 3 1 1', 'csv 4 2 1', 'csv 5 3 1', 'csv 6 4 1'));
  });
  it('default FS collapses blanks and trims; a single-character FS keeps empty fields', () => {
    assert.equal(out(`printf '  a \\t b  \\n' | awk '{print NF ":" $1 ":" $2}'`), '2:a:b');
    assert.equal(out("echo 'a:b::c' | awk -F: '{print NF, $3 \"|\"}'"), '4 |');
    assert.equal(out("echo 'a|b' | awk -F'|' '{print $2}'"), 'b'); // a single character is literal, never a regex
    assert.equal(out("echo 'a.b' | awk -F. '{print $2}'"), 'b');
    assert.equal(out("echo 'a1b22c' | awk -F'[0-9]+' '{print NF, $3}'"), '3 c'); // longer FS is a regex
  });
  it('assigning a field or NF rebuilds $0 with OFS', () => {
    assert.equal(out(`echo 'a b c' | awk 'BEGIN{OFS="-"} {$3="Z"; print; print NF}'`), L('a-b-Z', '3'));
    assert.equal(out(`echo 'a b c d' | awk 'BEGIN{OFS=","} {NF=2; print; NF=4; print}'`), L('a,b', 'a,b,,'));
    assert.equal(out(`echo 'x y' | awk '{$0="p q r"; print NF, $3}'`), '3 r');
  });
  it('OFS ORS SUBSEP', () => {
    assert.equal(out(`awk 'BEGIN{ORS="|"; OFS="+"; print "a","b"; print "c"}'`), 'a+b|c|');
    assert.equal(out(`awk 'BEGIN{a[1,2]=3; for(k in a){split(k,p,SUBSEP); print p[1], p[2], length(SUBSEP)}}'`), '1 2 1');
    assert.equal(out(`awk 'BEGIN{a[1,2]=3; print ((1,2) in a), ((2,1) in a)}'`), '1 0');
  });
  it('RS other than a newline is not supported (practice shell)', () => {
    const res = r(`echo a | awk 'BEGIN{RS=";"} {print}'`);
    assert.equal(res.out, 'this practice shell does not support awk RS other than a newline yet');
    assert.equal(res.code, 2);
  });
  it('$0 and NF in END keep the last record', () => {
    assert.equal(out("awk 'END{print $0; print NF}' village/shop.txt"), L('map 20', '2'));
  });
  it('a missing field is the empty string', () => {
    assert.equal(out(`echo a | awk '{print "[" $5 "]", ($5==""), ($5==0)}'`), '[] 1 0');
  });
});

describe('BEGIN, END, patterns, next, exit', () => {
  it('BEGIN without input reads nothing; END sees NR', () => {
    assert.equal(out("awk 'BEGIN{print \"hi\"}'"), 'hi');
    assert.equal(out("awk 'BEGIN{n=0} {n++} END{print n, NR}' village/shop.txt"), '5 5');
  });
  it('range patterns, including one that never closes', () => {
    assert.equal(out("awk '/bread/,/torch/' village/shop.txt"), L('bread 3', 'rope 12', 'torch 8'));
    assert.equal(out("awk '/rope/,/nothing/' village/shop.txt"), L('rope 12', 'torch 8', 'map 20'));
    assert.equal(out("awk 'NR==2,NR==2' village/shop.txt"), 'bread 3');
  });
  it('next skips the remaining rules', () => {
    assert.equal(out("awk '/rope/{next} {print $1}' village/shop.txt"), L('apple', 'bread', 'torch', 'map'));
  });
  it('exit runs END (which keeps the code unless it exits again)', () => {
    assert.deepEqual(r("awk 'NR==2{exit 4} END{print \"end\", NR}' village/shop.txt"), { out: 'end 2', code: 4 });
    assert.deepEqual(r("awk 'END{exit 5; print \"no\"}' village/shop.txt"), { out: '', code: 5 });
    assert.deepEqual(r("awk 'BEGIN{exit 1} END{exit}'"), { out: '', code: 1 });
  });
});

describe('arrays', () => {
  it('in, delete, for-in (insertion order), length(arr), split', () => {
    assert.equal(out(`awk 'BEGIN{a["z"]=1; a["a"]=2; a["m"]=3; for(k in a) printf "%s ", k; print ""}'`), 'z a m '); // practice shell: insertion order
    assert.equal(out(`awk 'BEGIN{a[1]; a[2]; delete a; print length(a)}'`), '0');
    assert.equal(out(`awk 'BEGIN{print ("x" in a), length(a); a["x"]; print ("x" in a), length(a)}'`), L('0 0', '1 1'));
    assert.equal(out(`awk 'BEGIN{n=split("  a  b ",p); print n, "[" p[1] "]"; n=split("",q); print n, length(q); n=split("abc",c,""); print n, c[3]}'`), L('2 [a]', '0 0', '3 c'));
    assert.equal(out(`awk 'BEGIN{split("10 9",p); print (p[1]<p[2])}'`), '0'); // split elements are numeric strings
  });
  it('array parameters are passed by reference, scalars by value', () => {
    assert.equal(out(`awk 'function f(a,s){a[1]="x"; s="changed"} BEGIN{s="kept"; f(arr,s); print arr[1], s}'`), 'x kept');
    assert.equal(out(`awk 'function g(b){b["k"]=1} function f(a){g(a)} BEGIN{f(z); print length(z)}'`), '1');
  });
  it('scalar/array misuse is an awk error (BWK wording; mawk says illegal reference to variable x)', () => {
    const res = r(`awk 'BEGIN{x=1; x[1]=2}'`);
    assert.equal(res.code, 2);
    assert.match(res.out, /^awk: can't use scalar x as array/);
  });
});

describe('builtins', () => {
  it('string functions', () => {
    assert.equal(out(`awk 'BEGIN{print length("hello"), substr("hello",2), substr("hello",0,2), index("abc","c"), tolower("AbC")}'`), '5 ello h 3 abc'); // substr(s,0,2): gawk/POSIX ("h"); mawk prints "he"
    assert.equal(out(`awk 'BEGIN{s="aaa"; n=gsub(/a/,"[&]",s); print n, s; t="x.y"; sub(/\\./,"\\\\&",t); print t}'`), L('3 [a][a][a]', 'x&y'));
    assert.equal(out(`echo abbc | awk '{s=$0; gsub(/b*/,"-",s); print s}'`), '-a-c-');
    assert.equal(out(`awk 'BEGIN{print match("xyz",/q/), RSTART, RLENGTH}'`), '0 0 -1');
    assert.equal(out(`awk 'BEGIN{print sprintf("%5s|%-3d|%.2e", "ab", 7, 12345)}'`), '   ab|7  |1.23e+04');
  });
  it('math functions', () => {
    assert.equal(out(`awk 'BEGIN{print int(7.9), sqrt(2), exp(1), log(10), sin(0), cos(0), atan2(0,-1)}'`), '7 1.41421 2.71828 2.30259 0 1 3.14159');
  });
  it('rand is a seeded LCG: deterministic, in [0,1), srand returns the previous seed (practice shell values)', () => {
    const a = out(`awk 'BEGIN{srand(7); print rand(), rand()}'`);
    assert.equal(out(`awk 'BEGIN{srand(7); print rand(), rand()}'`), a);
    assert.notEqual(out(`awk 'BEGIN{srand(8); print rand()}'`), a.split(' ')[0]);
    assert.equal(out(`awk 'BEGIN{x=srand(5); y=srand(9); print x, y}'`), '0 5'); // gawk/POSIX: the first seed is 0 (mawk seeds from the clock)
    assert.equal(out(`awk 'BEGIN{for(i=0;i<500;i++){r=rand(); if(r<0||r>=1) bad++}; print bad+0}'`), '0');
  });
  it('printf goes through SQ.fmtPrintf with awk rules (numbers to %d, %c of a number, literal backslashes)', () => {
    assert.equal(out(`awk 'BEGIN{printf "%d %d %i\\n", "3.9x", -2.5, 1e3}'`), '3 -2 1000');
    assert.equal(out(`awk 'BEGIN{printf "a\\\\nb\\n"}'`), 'a\\nb');
    assert.equal(out(`awk 'BEGIN{printf "%s|%5.1f%%\\n", 0.1, 99.44}'`), '0.1| 99.4%');
    const res = r(`awk 'BEGIN{printf "%d %s\\n", 1}'`);
    assert.equal(res.code, 2);
    assert.match(res.out, /^awk: not enough args in printf/);
    assert.doesNotMatch(res.out, /bash: printf/);
  });
});

describe('numbers and strings', () => {
  it('number output: integers whole, others %.6g (OFMT for print, CONVFMT for concatenation)', () => {
    assert.equal(out(`awk 'BEGIN{print 3.0, 2.5, 1e30, 123456789012, 0.000001234}'`), '3 2.5 1e+30 123456789012 1.234e-06');
    assert.equal(out(`awk 'BEGIN{OFMT="%.2f"; x=3.14159; print x, x ""}'`), '3.14 3.14159');
    assert.equal(out(`awk 'BEGIN{CONVFMT="%.2f"; x=3.14159; print (x "")}'`), '3.14');
  });
  it('field comparisons are numeric when both look numeric, string otherwise', () => {
    assert.equal(out(`echo '10 9 abc' | awk '{print ($1<$2), ($1<"9"), ($3>$1), ($1==10.0)}'`), '0 1 1 1');
    assert.equal(out(`echo ' 2 ' | awk -F, '{print ($1==2)}'`), '1');
  });
  it('-v values and name=value operands are processed (escapes, numeric strings)', () => {
    assert.equal(out(`awk -v 's=a\\tb' 'BEGIN{print s}'`), 'a\tb');
    assert.equal(out(`awk -v n=10 'BEGIN{print (n<9)}'`), '0');
    assert.equal(out(`awk '{print v, $1}' v=1 village/shop.txt v=2 csv | head -7`), L('1 apple', '1 bread', '1 rope', '1 torch', '1 map', '2 name,age,city', '2 Ada,36,London'));
  });
  it('infinity and NaN print as inf/nan, never as JS text (mawk and gawk print -nan for log(-1); BWK awk and this shell print nan)', () => {
    assert.equal(out(`awk 'BEGIN{print log(0), -log(0), log(-1), 2^1024, sqrt(-1)+1}'`), '-inf inf nan inf nan');
    assert.doesNotMatch(out(`awk 'BEGIN{x=log(-1); printf "%d %s %f\\n", x, x, x; print x "" ; y[x]; for(k in y) print k}'`), /NaN|Infinity|undefined/);
  });
});

describe('user functions', () => {
  it('recursion works up to depth 100, then an awk error', () => {
    assert.equal(out(`awk 'function d(n){return n?1+d(n-1):0} BEGIN{print d(90)}'`), '90');
    const res = r(`awk 'function d(n){return d(n+1)} BEGIN{d(1)}'`);
    assert.equal(res.code, 2);
    assert.match(res.out, /^awk: function calls nested too deeply/);
  });
  it('locals are extra parameters and start uninitialised', () => {
    assert.equal(out(`awk 'function f(a,   i){i++; return a+i} BEGIN{i=50; print f(1), f(1), i}'`), '2 2 50');
  });
});

describe('errors and caps', () => {
  it('assigning $(-1) is an out-of-range field error, status 2', () => {
    const res = r(`echo a | awk '{$(-1)="x"}'`);
    assert.equal(res.code, 2);
    assert.equal(res.out.split('\n')[0], 'awk: trying to access out of range field -1');
  });
  it('$1000001 and $1000000 = 1 are refused', () => {
    for (const p of ['{print $1000001}', '{$1000000 = 1}', '{NF=5000}']) {
      const res = r(`echo a | awk '${p}'`);
      assert.equal(res.code, 2, p);
      assert.match(res.out, /^awk: trying to access out of range field/, p);
    }
  });
  it('division by zero', () => {
    for (const p of ['BEGIN{print 1/0}', 'BEGIN{x=0; print 5%x}', 'BEGIN{y=3; y/=0}']) {
      const res = r(`awk '${p}'`);
      assert.equal(res.code, 2, p);
      assert.match(res.out, /^awk: division by zero/, p);
    }
  });
  it('output printed before a runtime error is kept', () => {
    // the shell shows a command's stderr lines before its stdout (as for cat FILE MISSING)
    assert.deepEqual(r(`awk 'BEGIN{print "before"; print 1/0}'`), { out: L('awk: division by zero', ' source line number 1', 'before'), code: 2 });
  });
  it('an endless loop ends with the step-limit message', () => {
    for (const p of ['BEGIN{while(1){}}', 'BEGIN{for(;;);}', 'BEGIN{do x++; while(1)}', 'function f(){while(1);} BEGIN{f()}']) {
      const res = r(`awk '${p}'`);
      assert.equal(res.out, 'this practice shell stopped the command: too many steps', p);
      assert.equal(res.code, 1);
    }
  });
  it('the shell still works after a stopped awk', () => {
    const SQ = world();
    r("awk 'BEGIN{while(1);}'", SQ);
    assert.equal(out('echo ok', SQ), 'ok');
  });
  it('output beyond the screen cap is cut as for every command', () => {
    const lines = out(`awk 'BEGIN{for(i=1;i<=3000;i++)print i}'`).split('\n');
    assert.equal(lines.length, 2001);
    assert.equal(lines[1999], '2000');
    assert.match(lines[2000], /output cut off after 2000 lines/);
  });
  it('output larger than LIM.TEXT stops with a message', () => {
    const res = r(`awk 'BEGIN{s="x"; for(i=0;i<17;i++) s=s s; for(i=0;i<9;i++) print s}'`);
    assert.equal(res.out, 'awk: output too large for this practice shell');
    assert.equal(res.code, 1);
  });
  it('a string over LIM.VAR stops the command', () => {
    const res = r(`awk 'BEGIN{s="x"; for(i=0;i<30;i++) s=s s}'`);
    assert.equal(res.out, 'this practice shell stopped the command: a value grew too large');
  });
  it('getline and system() are unsupported', () => {
    for (const [p, x] of [['BEGIN{getline; print}', 'getline'], ['BEGIN{system("ls")}', 'system()']]) {
      const res = r(`awk '${p}'`);
      assert.equal(res.out, `this practice shell does not support awk ${x} yet`);
      assert.equal(res.code, 2);
    }
  });
  it('regexes go through SQ.safeRegex: special cases work, catastrophic ones are refused', () => {
    assert.equal(out(`awk '/bread|rope/' village/shop.txt`), L('bread 3', 'rope 12'));
    assert.equal(out(`awk '/^[a-c]/' village/shop.txt`), L('apple 2', 'bread 3'));
    assert.equal(out(`awk '/[[:digit:]][[:digit:]]/' village/shop.txt`), L('rope 12', 'map 20'));
    assert.equal(out(`printf 'a.b\\naxb\\n' | awk '/a\\.b/'`), 'a.b');
    assert.equal(out(`printf 'a]b\\n' | awk '/[]]/'`), 'a]b');
    assert.equal(out(`echo 'a+b' | awk '$0 ~ "a\\\\+b"'`), 'a+b');
    const res = r(`echo aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa! | awk '/(a+)+$/'`);
    assert.equal(res.code, 2);
    assert.equal(res.out, 'awk: pattern too complex for this practice shell');
    const bad = r(`awk '/a(/' village/shop.txt`);
    assert.equal(bad.code, 2);
    assert.match(bad.out, /^awk: syntax error in regular expression a\( at source line 1/);
  });
});

describe('the awk command', () => {
  it('-f reads the program from a file; a missing one is an error', () => {
    const SQ = world();
    run(SQ, "printf '{print $2}\\n' > p.awk");
    assert.equal(out('awk -f p.awk village/shop.txt | head -2', SQ), L('2', '3'));
    const res = r('awk -f nope.awk village/shop.txt', SQ);
    assert.deepEqual(res, { out: "awk: can't open file nope.awk", code: 2 });
  });
  it('a missing input file is an error after the earlier output', () => {
    const res = r("awk '{print $1}' abc nosuch");
    assert.deepEqual(res, { out: L("awk: can't open file nosuch", 'a', 'd'), code: 2 }); // stderr is shown first
  });
  it('no program prints usage', () => {
    const res = r('awk');
    assert.equal(res.code, 2);
    assert.match(res.out, /^usage: awk/);
  });
  it('pipes and skip-header idioms', () => {
    assert.equal(out("cat csv | awk -F, 'NR>1' | awk -F, '{print $3}'"), L('London', 'Paris', 'Rome'));
    assert.equal(out("awk -F, 'NR>1{print $2}' csv | sort -n | head -1"), '25');
    assert.equal(out("cat village/shop.txt | awk '{print $1}' -"), L('apple', 'bread', 'rope', 'torch', 'map'));
  });
  it('-- ends the options; -F with a separate argument; -v with a joined value', () => {
    assert.equal(out("echo a:b | awk -F : -- '{print $2}'"), 'b');
    assert.equal(out("awk -vx=7 'BEGIN{print x}'"), '7');
  });
  it('type and which see awk', () => {
    assert.equal(out('type awk'), 'awk is /usr/bin/awk');
    assert.equal(out('which awk'), '/usr/bin/awk');
  });
});
