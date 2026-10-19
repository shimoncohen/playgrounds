// Hand-written entries for the second differential corpus (Stage 2 engine behaviour; see corpus2.test.mjs).
// Same shapes as corpus-lines.mjs: a string (one line, fresh world), an array (a session: the LAST line's out/code plus the
// final state are recorded), or { line|lines, put?, change } where put is { path: content } written before the lines run and
// change:false/true/'note' overrides the automatic expectChange marking. Every entry runs after the setup() of chapters 0..14.
// No dates, no $RANDOM. Parametric families are generated below so the list stays reviewable.

const fam = (fn, vals) => vals.map(fn);
const grid = (fn, as, bs) => as.flatMap((a) => bs.map((b) => fn(a, b)));

/* ---- Stage 2 features: functions, locals, return ---- */
const FUNCS = [
  'f() { echo hi; }; f', 'f() { echo "$1"; }; f a', 'f() { echo "$#"; }; f a b c', 'f() { echo "$@"; }; f "a b" c', 'f() { echo "$*"; }; f a b', 'f() { return 3; }; f; echo $?',
  'f() { return; }; f; echo $?', 'f() { false; }; f; echo $?', 'f() { local x=1; echo $x; }; x=9; f; echo $x', 'f() { x=2; }; x=1; f; echo $x', 'f() { local x; echo "[$x]"; }; f',
  'f() { local x=$1; x=$((x+1)); echo $x; }; f 4', 'f() { echo one; return 1; echo two; }; f; echo $?', 'f() { g() { echo inner; }; g; }; f',
  'f() { echo $1; shift; echo $1; }; f a b', 'f() { echo ${1:-none}; }; f', 'f() { echo ${1:-none}; }; f x', 'f() { [ "$#" -eq 0 ] && echo none || echo some; }; f; f x',
  'f() { for a in "$@"; do echo "<$a>"; done; }; f x "y z"', 'f() { for a in $@; do echo "<$a>"; done; }; f x "y z"', 'f() { while [ $# -gt 0 ]; do echo $1; shift; done; }; f 1 2 3',
  'f() { f2 $1; }; f2() { echo "got $1"; }; f z', 'fact() { if [ $1 -le 1 ]; then echo 1; else echo $(( $1 * $(fact $(($1-1))) )); fi; }; fact 5',
  'fib() { if [ $1 -lt 2 ]; then echo $1; else echo $(( $(fib $(($1-1))) + $(fib $(($1-2))) )); fi; }; fib 7', 'f() { f; }; f', 'f() { echo a | cat; }; f', 'f() { echo a; } > out.txt; cat out.txt',
  'function g { echo g; }; g', 'function g() { echo g; }; g', 'f() { echo $0; }; f', 'f() { echo $$; }; f', 'f() { ls nosuch; }; f; echo $?', 'f() { echo hi >&2; }; f 2>/dev/null', 'f() { echo hi >&2; }; f 2>&1 | wc -l',
  'f() { exit 4; }; f; echo after', 'f() { return 300; }; f; echo $?', 'f() { return abc; }; f; echo $?', 'unset -f f; f', 'f() { :; }; unset -f f; f', 'f() { echo A; }; f() { echo B; }; f',
  'ls() { echo shadow; }; ls', 'echo() { printf "%s!\\n" "$1"; }; echo hi', 'f() { local a=1 b=2; echo $a $b; }; f', 'f() { local; echo ok; }; f', 'local x=1', 'return 3', 'f() { read x; echo $x; }; echo hi | f',
  'f() { cat; }; echo hello | f', 'f() { cat; }; f < readme.txt', 'f() { echo $1; }; f $(echo a b)', 'f() { echo $#; }; f "$(echo a b)"', 'f() { echo $#; }; f ""', 'f() { echo $#; }; f "" ""', 'f()', 'f() {', 'f() { echo; ', '() { echo; }',
  ['f() { echo A; }', 'f'], ['f() { echo A; }', 'g() { f; f; }', 'g'], ['greet() { echo "Hello, $1!"; }', 'greet Ada', 'greet Bob'], ['n=1', 'inc() { n=$((n+1)); }', 'inc', 'inc', 'echo $n'],
  ['f() { echo A; }', 'f() { echo B; }', 'f'], ['f() { return 2; }', 'f || echo failed', 'echo $?'], ['f() { local x=1; }', 'f', 'echo "[$x]"'], ['x=outer', 'f() { local x=inner; g; }', 'g() { echo $x; }', 'f', 'echo $x'],
  ['f() { echo $1 $2; }', 'f a', 'f a b c'], ['sq() { echo $(($1*$1)); }', 'sq 7'], ['sq() { echo $(($1*$1)); }', 'for i in 1 2 3; do sq $i; done'], ['f() { echo in; }', 'f | cat', 'f > o.txt', 'cat o.txt'],
];

/* ---- case ---- */
const CASES = [
  'case a in a) echo A;; esac', 'case b in a) echo A;; b) echo B;; esac', 'case z in a) echo A;; *) echo other;; esac', 'case z in a) echo A;; esac', 'case "" in "") echo empty;; esac',
  'case abc in a*) echo starts;; esac', 'case abc in *c) echo ends;; esac', 'case abc in ?b?) echo mid;; esac', 'case abc in [a-c]*) echo class;; esac', 'case abc in a|b) echo ab;; abc|x) echo hit;; esac',
  'case "a b" in "a b") echo spaced;; esac', 'case "a b" in a*) echo glob;; esac', 'case $USER in explorer) echo me;; *) echo not;; esac', 'case $UNSET in "") echo unset;; *) echo set;; esac',
  'case 5 in [0-9]) echo digit;; esac', 'case 55 in [0-9]) echo one;; [0-9][0-9]) echo two;; esac', 'case a in a) echo A;& b) echo B;; esac', 'case a in a) echo A;;& *) echo star;; esac',
  'case a in (a) echo paren;; esac', 'case a in a) ;; esac; echo $?', 'case x in x) false;; esac; echo $?', 'case x in y) echo no;; esac; echo $?', 'case a in a) echo 1; echo 2;; esac', 'case a in a) echo 1',
  'case a esac', 'case a in a echo;; esac', 'case', 'esac', 'case a in a) echo A;; esac | cat', 'case a in a) echo A;; esac > c.txt; cat c.txt', 'x=a; case $x in a) echo yes;; esac && echo chained',
  'for i in 1 2 3; do case $i in 2) echo two;; *) echo other;; esac; done', 'for f in *.txt; do case $f in r*) echo "r: $f";; esac; done', 'case "*" in "*") echo literal;; esac', 'case a.txt in *.txt) echo text;; esac',
  'case Ada in [A-Z]*) echo cap;; esac', 'case ada in [!A-Z]*) echo notcap;; esac', 'case "$(echo hi)" in hi) echo sub;; esac',
  ['x=2', 'case $x in 1) echo one;; 2) echo two;; esac'], ['x=hello', 'case $x in h*) echo H;; esac', 'echo $?'],
];

/* ---- here-docs and here-strings ---- */
const HEREDOCS = [
  'cat <<EOF\nhello\nEOF', 'cat <<EOF\nhello $USER\nEOF', "cat <<'EOF'\nhello $USER\nEOF", 'cat <<"EOF"\nhello $USER\nEOF', 'cat <<-EOF\n\thello\n\tEOF', 'cat <<EOF\nEOF', 'cat <<EOF\na\n\nb\nEOF',
  'cat <<EOF > h.txt\nline\nEOF\ncat h.txt', 'cat <<EOF | wc -l\na\nb\nEOF', 'cat <<EOF\nhello', 'cat <<EOF\n$((1+2))\nEOF', 'cat <<EOF\n$(echo sub)\nEOF', 'cat <<EOF\n\\$HOME\nEOF', 'cat <<EOF\n`echo bt`\nEOF',
  'cat <<A\nx\nA\ncat <<B\ny\nB', 'read a b <<EOF\n1 2\nEOF\necho $a-$b', 'while read l; do echo "[$l]"; done <<EOF\nx\ny\nEOF', 'grep a <<EOF\nabc\nxyz\nEOF', 'wc -l <<EOF\n1\n2\n3\nEOF', 'sort <<EOF\nb\na\nc\nEOF',
  'cat <<< hello', 'cat <<< "hello world"', 'cat <<< $USER', 'cat <<< "$USER"', "cat <<< '$USER'", 'read x <<< abc; echo $x', 'read a b <<< "1 2 3"; echo "$a|$b"', 'wc -w <<< "a b c"', 'tr a-z A-Z <<< hi', 'grep -c a <<< banana',
  'cat <<< ""', 'cat <<<', 'cat << EOF\nspace\nEOF', 'cat <<EOF >> h.txt\none\nEOF\ncat <<EOF >> h.txt\ntwo\nEOF\ncat h.txt', 'cat <<EOF\n  indented\nEOF', 'cat <<EOF\ntab\there\nEOF',
  'f() { cat <<EOF\nin func $1\nEOF\n}; f arg', 'if true; then cat <<EOF\nin if\nEOF\nfi', 'for i in 1 2; do cat <<EOF\nloop $i\nEOF\ndone',
];

/* ---- ${} parameter expansion forms ---- */
const PEXP_VARS = ['x=hello', 'x=', 'unset x', 'x="a b c"', 'x=file.tar.gz', 'x=/path/to/file.txt', 'x=Hello', 'x=12345'];
const PEXP_FORMS = ['${x}', '${x:-d}', '${x-d}', '${x:=d}', '${x:+alt}', '${x+alt}', '${#x}', '${x#*.}', '${x##*.}', '${x%.*}', '${x%%.*}', '${x/l/L}', '${x//l/L}', '${x:1}', '${x:1:3}', '${x^^}', '${x,,}', '${x:?msg}', '${!x}', '${x:-}'];
const PEXP = grid((v, f) => `${v}; echo "${f}"`, PEXP_VARS, PEXP_FORMS);
const PEXP_MISC = [
  'echo ${HOME:-x}', 'echo ${NOSUCH:-$HOME}', 'echo ${NOSUCH:-"quoted default"}', 'echo ${NOSUCH:-a b}', 'echo "${NOSUCH:=set}"; echo $NOSUCH', 'echo ${#}', 'echo ${#NOSUCH}', 'echo ${}', 'echo ${x', 'echo ${1x}', 'echo ${a-b-c}',
  'a=1; echo ${a:-${b:-deep}}', 'echo ${NOSUCH:?boom}; echo after', 'echo ${NOSUCH?boom}', 'set -- a b c; echo ${@:2}', 'set -- a b c; echo ${#@}', 'f=a.b.c; echo ${f%.*} ${f%%.*} ${f#*.} ${f##*.}',
  'p=/a/b/c.txt; echo ${p##*/}; echo ${p%/*}', 'n=007; echo ${n#0}', 'echo ${PWD##*/}', 'echo ${USER^}', 'a=(1 2 3); echo ${a[1]}', 'declare -a z', 'echo ${BASH_VERSION:-none}',
];

/* ---- $(( )) arithmetic ---- */
const AR = ['1+2', '7-9', '6*7', '7/2', '-7/2', '7%3', '-7%3', '2**10', '1<2', '2<1', '1==1', '1!=1', '3>=3', '1&&0', '1||0', '!0', '!5', '~0', '5&3', '5|3', '5^3', '1<<4', '256>>4', '(1+2)*3', '1+2*3', '10/3*3', '2**3**2', '5>3?10:20', '0?1:2', '1,2', ' 3 + 4 ', '07+1', '08+1', '0x1f+1', '9999999999*9999999999', '1/0', '1%0', '-5', '--5', '+5', '1+', '()', '1 2', 'a', 'a+1', '3++', '2**-1', '1<<64', '5-3-1', '100/10/5'];
const ARITH = AR.map((e) => `echo $((${e}))`);
const ARITH_MISC = [
  'x=5; echo $((x+1)); echo $x', 'x=5; echo $((x*x))', 'x=5; echo $((x++)); echo $x', 'x=5; echo $((++x)); echo $x', 'x=5; echo $((x--)); echo $x', 'x=5; echo $((x+=3)); echo $x', 'x=5; echo $((x=x*2)); echo $x',
  'x=abc; echo $((x+1))', 'x=; echo $((x+1))', 'echo $((UNSET+1))', 'x=3; y=4; echo $((x*x+y*y))', 'echo $(( $(echo 6) * 7 ))', 'echo $((1+$((2+3))))', 'let x=3+4; echo $x', 'let "x = 2 * 8"; echo $x', 'let x++; echo $x',
  '((x=5)); echo $x', '((1)); echo $?', '((0)); echo $?', 'x=3; ((x>2)) && echo big', 'for ((i=0;i<3;i++)); do echo $i; done', 'i=0; while ((i<3)); do echo $i; i=$((i+1)); done', 'expr 1 + 2', 'expr 6 \\* 7', 'expr 7 / 2', 'echo $[1+2]',
  'x=10; while [ $x -gt 7 ]; do x=$((x-1)); echo $x; done', 'echo $((2**62))', 'echo $((2**63))', 'echo $((2**64))', 'echo $((9223372036854775807+1))', 'echo $((-9223372036854775807-2))', 'echo $((1<<62))',
];

/* ---- [ ] and [[ ]] ---- */
const TESTS_ONE = ['-e readme.txt', '-f readme.txt', '-d readme.txt', '-d village', '-f village', '-e nosuch', '-s readme.txt', '-r readme.txt', '-w readme.txt', '-x readme.txt', '-L readme.txt', '-n abc', '-n ""', '-z ""', '-z abc', '-n', '-z', 'abc', '""', '!', '! -e nosuch', '! -e readme.txt', '-h readme.txt', '-b readme.txt', '-p readme.txt'];
const TESTS_TWO = ['a = a', 'a = b', 'a != b', 'a == a', '1 -eq 1', '1 -eq 2', '1 -ne 2', '5 -gt 3', '3 -gt 5', '3 -ge 3', '3 -lt 5', '3 -le 2', 'abc \\< abd', 'abd \\> abc', 'a -eq b', '1.5 -eq 1', '"" = ""', '-5 -lt 0', '1 -eq', 'a b c', '1 -gt 2 -o 2 -gt 1', '1 -gt 2 -a 2 -gt 1', '\\( 1 -eq 1 \\)', 'readme.txt -nt village', 'readme.txt -ef readme.txt'];
const TESTCMDS = [...TESTS_ONE, ...TESTS_TWO].flatMap((t) => [`[ ${t} ] && echo yes || echo no`, `test ${t}; echo $?`]);
const TESTCMDS_MISC = [
  '[ -f readme.txt', '[ ]', '[ ] ; echo $?', '[', ']', 'test', 'test; echo $?', '[[ -f readme.txt ]] && echo yes', '[[ a == a ]] && echo eq', '[[ a == b ]] || echo neq', '[[ abc == a* ]] && echo glob', '[[ abc == "a*" ]] || echo literal',
  '[[ abc =~ ^a.c$ ]] && echo re', '[[ abc =~ ^b ]] || echo nore', '[[ -z "" && -n x ]] && echo both', '[[ -z x || -n x ]] && echo either', '[[ ! -e nosuch ]] && echo gone', '[[ 5 -gt 3 ]] && echo gt', '[[ a < b ]] && echo lt',
  '[[ $UNSET == "" ]] && echo empty', '[[ -n $UNSET ]] || echo unset', '[ -n $UNSET ] && echo weird', '[ -z $UNSET ] && echo zero', '[ $UNSET = x ] || echo noeq', '[[ a == a', '[[ ]]', '[[ x ]] && echo nonempty',
  '[[ ( a == a ) && ( b == b ) ]] && echo grp', '[[ $USER == exp* ]] && echo prefix', 'x="a b"; [ $x = "a b" ]; echo $?', 'x="a b"; [ "$x" = "a b" ] && echo ok', 'x="a b"; [[ $x == "a b" ]] && echo ok',
  'if [ -f readme.txt ]; then echo f; fi', 'if [ -d nosuch ]; then echo d; else echo nod; fi', 'if [ -f nosuch ]; then echo a; elif [ -d village ]; then echo b; else echo c; fi', 'if [[ -e readme.txt && -r readme.txt ]]; then echo both; fi',
  'if ! [ -e nosuch ]; then echo neg; fi', 'if ! true; then echo no; else echo yes; fi', 'if [ 1 -eq 1 ]; then echo a; fi; if [ 1 -eq 2 ]; then echo b; fi', 'if true; then false; fi; echo $?', 'if false; then echo x; fi; echo $?',
  'if', 'if true', 'if true; then', 'if true; then echo; ', 'fi', 'then', 'else', 'elif', 'if true; then echo a; else; fi', 'if ; then echo a; fi', 'if true; then echo a; fi > o.txt; cat o.txt', 'if true; then echo a; fi | cat',
  'while false; do echo x; done; echo $?', 'until true; do echo x; done; echo $?', 'i=0; until [ $i -ge 3 ]; do echo $i; i=$((i+1)); done', 'i=0; while [ $i -lt 3 ]; do i=$((i+1)); [ $i -eq 2 ] && continue; echo $i; done',
  'i=0; while true; do i=$((i+1)); [ $i -ge 3 ] && break; done; echo $i', 'while true; do echo x; break; done', 'for i in 1 2 3; do [ $i -eq 2 ] && break; echo $i; done', 'for i in 1 2 3; do [ $i -eq 2 ] && continue; echo $i; done',
  'for i in 1 2; do for j in a b; do [ $j = b ] && break 2; echo $i$j; done; done', 'break', 'continue', 'break 0', 'while true; do :; done', 'until false; do :; done', 'i=0; while [ $i -lt 5000 ]; do i=$((i+1)); done; echo $i',
  'while :; do echo x; done | head -n 2', 'while [ 1 ]; do break; done; echo done',
];

/* ---- read, source, exit, stderr, nano ---- */
const IO = [
  'read x <<< hi; echo $x', 'read; echo "[$REPLY]" <<< hi', 'read x y z <<< "1 2"; echo "[$x][$y][$z]"', 'read x y <<< "1 2 3 4"; echo "[$x][$y]"', 'echo "a b" | read x; echo "[$x]"', 'read -r x <<< "a\\b"; echo $x', 'read x <<< "a\\b"; echo $x',
  'read -p "name? " n <<< Ada; echo $n', 'read -n 2 x <<< abcdef; echo $x', 'read -a arr <<< "1 2"; echo ${arr[0]}', 'read x < /dev/null; echo $?', 'read x < nosuch; echo $?', 'read 1x <<< a', 'read x <<< ""; echo "[$x]"; echo $?', 'read -t 1 x <<< a; echo $x',
  'while read l; do echo "<$l>"; done < readme.txt', 'while read a b; do echo "$b $a"; done <<< "x y"', 'cat readme.txt | while read l; do echo "$l"; done', 'while read l; do n=$((n+1)); done < readme.txt; echo $n', 'read x y; echo $x',
  'echo "echo sourced" > s.sh; source s.sh', 'echo "echo sourced" > s.sh; . s.sh', 'echo "x=42" > s.sh; source s.sh; echo $x', 'echo "f() { echo fn; }" > s.sh; source s.sh; f', 'echo "echo \\$1" > s.sh; source s.sh arg', 'source nosuch.sh', '. nosuch.sh; echo $?', 'source', '. ',
  'echo "exit 3" > s.sh; source s.sh; echo after', 'echo "return 3" > s.sh; source s.sh; echo $?', 'echo "echo \\$0" > s.sh; bash s.sh', 'echo "echo \\$0" > s.sh; source s.sh', 'echo "echo \\$#" > s.sh; bash s.sh a b c', 'echo "echo \\$@" > s.sh; bash s.sh "a b" c',
  'echo "echo hi" > s.sh; bash s.sh', 'echo "echo hi" > s.sh; sh s.sh', 'echo "echo hi" > s.sh; ./s.sh', 'echo "echo hi" > s.sh; chmod +x s.sh; ./s.sh', 'echo "echo hi" > s.sh; chmod +x s.sh; ./s.sh | cat', 'bash nosuch.sh', 'bash', 'bash -c "echo hi"', 'bash -c "exit 3"; echo $?',
  'exit', 'exit 0', 'exit 1', 'exit 3; echo after', 'exit 256', 'exit abc', 'exit -1', 'exit 1 2', 'true; exit', 'false; exit', '(exit 3); echo $?', '(exit 3) && echo yes || echo no', 'echo hi; exit; echo no', 'if true; then exit 2; fi; echo no',
  'echo err >&2', 'echo err >&2; echo out', 'echo err 1>&2', 'echo err >&2 | wc -l', 'echo err >&2 2>/dev/null', 'echo err 2>&1 >&2', 'echo out 2>&1', 'echo err >&2 > o.txt; cat o.txt', '{ echo a; echo b >&2; } 2>/dev/null', '{ echo a; echo b >&2; } 2>&1 | wc -l',
  'echo hi >&1', 'echo hi >&3', 'echo hi >&-', 'ls nosuch 2>&1 | wc -l', 'ls nosuch >/dev/null 2>&1; echo $?', 'ls nosuch 2>err.txt; cat err.txt', 'ls nosuch &>/dev/null', 'ls nosuch 2>&1 >/dev/null',
  'nano', 'nano new.txt', 'nano readme.txt', 'nano nosuchdir/x.txt', 'nano forest', 'nano a.txt b.txt', 'vi readme.txt', 'vim readme.txt', 'code readme.txt', 'echo hi | nano', 'nano -w readme.txt', 'nano +2 readme.txt', 'touch t.sh; nano t.sh',
];

/* ---- pipelines of compounds, groups, subshells, lists ---- */
const COMPOUND = [
  'for i in 1 2 3; do echo $i; done | wc -l', 'for i in 3 1 2; do echo $i; done | sort', 'for i in 1 2 3; do echo $i; done | grep 2', 'for i in a b; do echo $i; done | tr a-z A-Z', 'for i in 1 2; do echo $i; done | while read n; do echo "n=$n"; done',
  'for i in 1 2; do echo $i; done > o.txt; cat o.txt', 'for i in 1 2; do echo $i; done >> o.txt; for i in 3; do echo $i; done >> o.txt; cat o.txt', 'for i in 1 2; do echo $i; done && echo ok', 'for i in 1 2; do echo $i; done || echo no',
  'for i in 1 2; do echo $i; done; echo end', 'while read l; do echo "$l"; done < readme.txt | wc -l', 'cat readme.txt | while read l; do echo "$l"; done | head -n 1', 'if true; then echo a; fi | tr a-z A-Z', 'case a in a) echo A;; esac | tr A-Z a-z',
  '{ echo a; echo b; }', '{ echo a; echo b; } | wc -l', '{ echo a; echo b; } > o.txt; cat o.txt', '{ echo a; echo b; } >> o.txt; cat o.txt', '{ cat; } < readme.txt', '{ read l; echo "got $l"; } < readme.txt', '{ echo a; false; } || echo failed', '{ echo a; }; echo $?',
  '{ echo a', '{ echo a; }}', '{', '}', '{echo a;}', '{ echo a;}', '{ ; }', '{ }', '{ echo a; } &&  { echo b; }', '{ cd forest; pwd; }; pwd', '{ x=1; }; echo $x', '{ exit 2; }; echo after',
  '(echo a; echo b)', '(echo a; echo b) | wc -l', '(cd forest; pwd); pwd', '(x=1); echo "[$x]"', '(exit 3); echo $?', '(echo a) > o.txt; cat o.txt', '( echo a )', '(echo a', '()', '(cd forest && ls)', '(false) || echo caught', '((echo nested))',
  'echo a && echo b', 'echo a || echo b', 'false && echo a', 'false || echo b', 'true && false || echo c', 'false || true && echo d', 'echo a && echo b && echo c', 'false && false || echo e', 'echo a; echo b; echo c', 'echo a;; echo b', 'echo a &&', '&& echo a', '|| echo a', 'echo a ||',
  '! true', '! false', '! true; echo $?', '! false; echo $?', '! ls nosuch; echo $?', '! echo hi', '! ! true; echo $?', 'if ! ls nosuch 2>/dev/null; then echo missing; fi',
  'echo b | sort | uniq', 'echo a | cat | cat | cat', 'ls | head -n 2 | tail -n 1', 'ls | wc -l', 'cat readme.txt | wc -w', 'ls forest | sort -r | head -n 1', 'false | true; echo $?', 'true | false; echo $?', 'ls nosuch | wc -l', 'echo | cat', '| cat', 'cat |', 'echo a ||| b',
  'x=$(for i in 1 2 3; do echo $i; done); echo $x', 'x=$(echo a; echo b); echo "$x"', 'x=$({ echo a; echo b; } | wc -l); echo $x', 'x=$(ls | wc -l); echo $x', 'echo $(echo $(echo deep))', 'echo "$(ls)" | wc -l', 'echo $(ls)', 'echo "$(cat readme.txt)"',
  'x=$(false); echo $?', 'x=$(exit 3); echo $?', 'echo $(nosuchcmd_zz)', 'echo `echo bt`', 'echo "`echo bt`"', 'echo $(', 'echo $(echo a',
];

/* ---- caps: runaway constructs (the Stage 1/2 limits must keep holding) ---- */
const CAPS = [
  'while true; do :; done', 'while true; do echo x; done', 'until false; do :; done', 'for i in $(seq 1 100000); do :; done', 'f() { f; }; f', 'f() { f; f; }; f', 'f() { f | f; }; f', { line: 'x=a; for i in $(seq 1 22); do x=$x$x; done; echo ${#x}; unset x', change: 'LIM.VAR 1,000,000 characters per variable (Task 2)' },
  { line: 'x=aaaaaaaaaa; for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do x=$x$x; done; echo ${#x}; unset x', change: 'LIM.VAR 1,000,000 characters per variable (Task 2)' },
  { line: 'x=a; for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18; do x=$x$x; done; echo ${#x}; unset x', change: false },
  'i=0; while [ $i -lt 1000000 ]; do i=$((i+1)); done; echo $i', 'yes | head -n 3', 'seq 1 1000000 | wc -l',
  'for i in $(seq 1 2000); do echo $i; done | wc -l', 'echo $(seq 1 100000) | wc -w', 'while read l; do :; done < /dev/null; echo done', 'a=(); while true; do a+=(x); done', ':(){ :|:& };:', ':(){ :|: };:', 'eval "eval \\"eval echo hi\\""',
  'cat /dev/zero | head -c 10', 'head -c 5 /dev/null', 'echo {1..100000} | wc -w', 'echo {a,b}{c,d}{e,f}{g,h}{i,j}{k,l}{m,n} | wc -w', 'printf "%.0s-" {1..10}; echo', 'ls -R / | wc -l', 'find / | wc -l', 'find . -name "*" | wc -l', 'grep -r a / | wc -l',
  'history | wc -l', 'x=$(seq 1 100000); echo ${#x}', 'x=$(yes | head -n 100000); echo ${#x}',
];

/* ---- misc builtins and Stage 2 odds ---- */
const MISC = [
  'eval echo hi', 'eval "x=5"; echo $x', 'eval "echo \\$HOME"', 'eval', 'eval "false"; echo $?', 'alias ll="ls -l"; ll', 'alias ll="ls -l"; alias', 'alias x', 'alias', 'unalias ll', 'alias ll=ls; unalias ll; ll', 'type ls', 'type cd', 'type nosuch_zz', 'which ls', 'command -v ls', 'command ls',
  'true', 'false', 'true; echo $?', 'false; echo $?', ':', ': foo bar', ': > empty.txt; ls empty.txt', 'declare x=1; echo $x', 'declare -i n=5; echo $n', 'declare -r r=1; r=2; echo $r', 'declare -x e=1; env | grep ^e=', 'declare -p x', 'declare', 'unset x', 'x=1; unset x; echo "[$x]"', 'unset', 'unset 1x', 'readonly r=1; r=2',
  'shift', 'set -- a b c; shift; echo $@', 'set -- a b c; shift 2; echo $@', 'set -- a b; shift 3; echo $?', 'set -- a b c; echo $1 $2 $3 $#', 'set -- "a b" c; echo $#', 'set --; echo $#', 'set -- a b; for x; do echo $x; done', 'set -- a b; for x in "$@"; do echo $x; done', 'set -- a b; echo "$*"', 'set -- a b; IFS=,; echo "$*"',
  'echo $0 $1 $2', 'echo "$@" | wc -w', 'echo $#', 'echo $-', 'echo $_', 'echo $!', 'echo $RANDOM | wc -c', 'echo $SECONDS', 'echo $LINENO', 'echo $BASH', 'echo $OLDPWD', 'cd forest; cd -', 'cd forest; echo $OLDPWD', 'echo $PPID', 'echo $UID', 'echo $EUID', 'echo $HOSTNAME', 'echo $IFS | od -c | head -n 1',
  'x=1 y=2; echo $x $y', 'x=1 echo $x', 'x=1 env | grep ^x=', 'x=1; x=2 true; echo $x', 'FOO=bar printenv FOO', 'FOO=bar; export FOO; printenv FOO', 'LC_ALL=C sort readme.txt', 'x=a b', 'x=$(echo a b)', 'x=`echo a`; echo $x', 'x="a  b"; echo $x', 'x="a  b"; echo "$x"', 'x="  a  "; echo "[$x]"', 'x="  a  "; echo [$x]',
  'x="a b c"; for w in $x; do echo $w; done', 'x="a b c"; for w in "$x"; do echo $w; done', 'x="*"; echo $x', 'x="*"; echo "$x"', 'x="a*"; echo $x', 'x=$(ls); echo $x', 'x="a b"; touch $x; ls', 'x="a b"; touch "$x"; ls', 'x="a b"; mkdir $x; ls', 'x=""; echo $x end', 'x=""; echo "$x" end', 'x="a b"; [ $x = "a b" ]; echo $?',
  'IFS=,; x="a,b,c"; for i in $x; do echo $i; done', 'IFS=:; echo $PATH', 'IFS=; x="a b"; echo $x', 'IFS=,; read a b <<< "1,2"; echo $a $b', 'IFS=, read a b <<< "1,2"; echo $a $b', 'IFS= read -r l <<< "  x  "; echo "[$l]"', 'OLDIFS=$IFS; IFS=,; IFS=$OLDIFS; echo ok',
  'echo -n hi; echo', 'echo -e "a\\tb"', 'echo -e "a\\nb"', 'echo -E "a\\nb"', 'echo -ne "a\\n"', 'echo -- hi', 'echo -x', 'echo -n', 'echo -', 'echo --', 'printf "hi\\n"', 'printf "%s\\n" a b c', 'printf "%d\\n" 42', 'printf "%d\\n" abc', 'printf "%5d|\\n" 42', 'printf "%-5d|\\n" 42', 'printf "%05d\\n" 42', 'printf "%x\\n" 255', 'printf "%o\\n" 8', 'printf "%c\\n" abc', 'printf "%%\\n"', 'printf "%s"', 'printf', 'printf "%5s|\\n" ab', 'printf "%-5s|\\n" ab', 'printf "%.2s\\n" abcdef', 'printf "%b\\n" "a\\tb"', 'printf "%q\\n" "a b"', 'printf "%s %s\\n" a', 'printf "%5.2f\\n" 3.14159', "printf '%5.2f\\n' 3.14159", 'printf "%f\\n" 1.5', 'printf "%e\\n" 1.5', 'printf "%.3f\\n" 2', 'printf "%i\\n" 7', 'printf "%u\\n" 7', 'printf "%10.3f|\\n" 3.14159', 'printf -- "-x\\n"', 'printf "a\\tb\\n"', 'printf "no newline"; echo',
  'date +%Y | wc -c', 'date | wc -w', 'sleep 1', 'sleep 0', 'sleep', 'sleep abc', 'sleep 1; echo done', 'sleep 0.1', 'sleep 5 &', 'sleep 1 & echo bg', 'echo a & echo b', 'jobs', 'wait', 'wait; echo $?', 'kill 1', 'kill -9 1234', 'fg', 'bg', 'ps', 'timeout 1 sleep 5', 'trap "echo bye" EXIT', 'trap', 'trap -l', 'trap "" INT', 'trap - INT',
  'set -e; false; echo after', 'set -e; true; echo after', 'set -u; echo $UNSET', 'set -x; echo hi', 'set -o pipefail; false | true; echo $?', 'set -euo pipefail', 'set +e', 'set -o', 'set', 'set -n', 'set -f; echo *', 'set -C; echo a > readme.txt', 'bash -x -c "echo hi"', 'bash -n -c "echo hi"', 'shopt -s nullglob', 'shopt', 'getopts "ab:" opt -a; echo $opt', 'getopts', 'mktemp', 'mktemp -d', 'wait $!',
  'echo <(echo hi)', 'cat <(echo hi)', 'diff <(echo a) <(echo b)', 'cat <(ls) | wc -l', 'echo hi > >(cat)', 'sort <(printf "b\\na\\n")', 'while read l; do echo $l; done < <(echo x)', 'paste <(echo a) <(echo b)',
];

/* ---- features Stage 3 changes: awk, sed, grep, find, xargs, sleep, jobs ---- */
const AWK = [
  "awk '{print $1}' village/shop.txt", "awk '{print}' readme.txt", "awk -F, '{print $2}' village/shop.txt", "awk 'BEGIN{print 1+2}'", "awk 'END{print NR}' readme.txt", "awk 'NR==1' readme.txt", "awk '/wolf/' forest/notes.txt", "awk '{s+=$1} END{print s}' village/shop.txt",
  "echo 'a b c' | awk '{print $2}'", "echo 'a b c' | awk '{print NF}'", "echo 'a:b' | awk -F: '{print $1}'", "echo 'a b' | awk '{print $2, $1}'", "echo 3 | awk '{print $1*2}'", "echo x | awk '{printf \"%s!\\n\", $1}'", "echo abc | awk '{print length($0)}'", "echo abc | awk '{print toupper($0)}'",
  "echo 'a b' | awk '{$1=\"z\"; print}'", "awk 'BEGIN{for(i=0;i<3;i++)print i}'", "awk 'BEGIN{x[1]=2; print x[1]}'", "awk '{a[$1]++} END{for(k in a)print k,a[k]}' readme.txt", "awk", "awk -f prog.awk readme.txt", "awk '{'", "awk 'BEGIN{print 1/0}'", "awk 'BEGIN{system(\"ls\")}'", "awk 'BEGIN{getline; print}'",
  "echo 10 9 | awk '{print ($1<$2)}'", "awk 'BEGIN{print substr(\"hello\",2,3)}'", "awk 'BEGIN{print index(\"abc\",\"c\")}'", "awk 'BEGIN{print split(\"a b c\",arr)}'", "awk 'BEGIN{printf \"%5.2f\\n\", 3.14159}'", "awk '$1>2' village/shop.txt", "awk 'NF' readme.txt", "awk '!seen[$0]++' readme.txt",
];
const SED = [
  "sed 's/a/b/' readme.txt", "sed 's/a/b/g' readme.txt", "sed 's/a/b/2' readme.txt", "sed -n '2p' readme.txt", "sed -n '$p' readme.txt", "sed -n '1,2p' readme.txt", "sed '1d' readme.txt", "sed '$d' readme.txt", "sed '/wolf/d' forest/notes.txt", "sed -n '/wolf/p' forest/notes.txt",
  "sed -e 's/a/b/' -e 's/c/d/' readme.txt", "sed 's/a/b/;s/c/d/' readme.txt", "sed 'y/abc/xyz/' readme.txt", "sed '2q' readme.txt", "sed '1!d' readme.txt", "sed 's/\\(a\\)/[\\1]/' readme.txt", "sed -E 's/(a)/[\\1]/' readme.txt", "sed 's|a|b|' readme.txt", "sed 's/a/b' readme.txt", "sed 'y/abc/xy/' readme.txt", "sed -n p readme.txt", "sed",
  "sed -i 's/a/b/' readme.txt; cat readme.txt", "sed -i.bak 's/a/b/' readme.txt; ls", "sed -i 's/a/b/' nosuch.txt", "echo abc | sed 's/b/X/'", "echo abc | sed 's/b/&&/'", "echo abc | sed 's/B/x/I'", "echo abc | sed -n 's/b/X/p'", "echo abc | sed '1i\\\\top'", "echo abc | sed 'a\\\\bottom'", "printf 'a\\nb\\n' | sed 'N;s/\\n/-/'", "printf 'a\\nb\\n' | sed -n '$='",
];
const GREP = [
  'grep wolf forest/notes.txt', 'grep -i WOLF forest/notes.txt', 'grep -v wolf forest/notes.txt', 'grep -n wolf forest/notes.txt', 'grep -c wolf forest/notes.txt', 'grep -l wolf forest/notes.txt', 'grep -L wolf forest/notes.txt', 'grep -h wolf forest/notes.txt', 'grep -H wolf forest/notes.txt', 'grep -q wolf forest/notes.txt; echo $?',
  'grep -o wolf forest/notes.txt', 'grep -o "[a-z]*" readme.txt', 'grep -w wolf forest/notes.txt', 'grep -w wol forest/notes.txt', 'grep -x wolf forest/notes.txt', 'grep -r wolf .', 'grep -r wolf forest', 'grep -rn wolf forest', 'grep -rl wolf .', 'grep -R wolf forest', 'grep -A1 wolf forest/notes.txt', 'grep -B1 wolf forest/notes.txt', 'grep -C1 wolf forest/notes.txt',
  'grep -m1 a readme.txt', 'grep -e wolf -e owl forest/*', 'grep -E "wolf|owl" forest/*', 'grep -F "a.b" readme.txt', 'grep -P "\\d" readme.txt', 'grep -s wolf nosuch.txt; echo $?', 'grep wolf nosuch.txt', 'grep -n -i wolf forest/notes.txt', 'grep --color=never wolf forest/notes.txt', 'grep --include="*.txt" -r wolf .', 'grep -z a readme.txt',
  'echo abc | grep b', 'echo abc | grep -o b', 'echo abc | grep -b b', 'echo abc | grep "^a"', 'echo abc | grep "c$"', 'echo abc | grep -e', 'grep', 'grep -E "(" readme.txt', 'grep "[" readme.txt', 'echo a+b | grep -E "a\\+b"', 'echo aaa | grep -E "a{2}"', 'echo ab | grep -E "a|b" -o',
];
const FIND = [
  'find .', 'find . -name "*.txt"', 'find . -type f', 'find . -type d', 'find forest -name "*.txt"', 'find . -name "*.txt" -type f', 'find . -maxdepth 1', 'find . -mindepth 1 -maxdepth 1', 'find . -iname "README*"', 'find . -size +0', 'find . -empty', 'find . -newer readme.txt', 'find . -mtime 0', 'find . -perm 644', 'find nosuch', 'find . -name',
  'find . -name "*.txt" -exec echo {} \;', 'find . -name "*.txt" -exec cat {} \;', 'find . -name "*.txt" -exec grep -l wolf {} +', 'find . -name "*.txt" -print', 'find . -name "*.txt" -print0 | xargs -0 echo', 'find . -name "*.log" -delete', 'find . -type f -exec wc -l {} \;', 'find . -not -name "*.txt"', 'find . ! -name "*.txt" -type f', 'find . -name "a*" -o -name "b*"', 'find . -path "./forest/*"', 'find . -prune',
];
const XARGS = [
  'echo a b c | xargs echo', 'echo a b c | xargs -n 1 echo', 'echo a b c | xargs -n 2 echo', 'echo a b c | xargs -I{} echo "<{}>"', 'echo a b c | xargs -P 2 echo', 'echo a b c | xargs -P 2 -n 1 echo', 'printf "a\\0b\\0" | xargs -0 echo', 'echo a | xargs', 'xargs', 'echo | xargs echo x', 'echo a b | xargs -t echo', 'echo a b | xargs -r echo',
  'ls | xargs wc -l', 'ls | xargs -n 1 echo', 'ls forest | xargs -I{} echo forest/{}', 'find . -name "*.txt" | xargs grep -l wolf', 'find . -name "*.txt" | xargs wc -l', 'echo "a b" | xargs -d " " echo', 'echo a b c | xargs -s 10 echo', 'echo a | xargs nosuch_zz', 'echo a | xargs -L 1 echo',
];
const MORE = [
  'sort readme.txt', 'sort -r readme.txt', 'sort -u readme.txt', 'sort -n village/shop.txt', 'sort -k2 village/shop.txt', 'sort -t, -k2 -n village/shop.txt', 'uniq readme.txt', 'uniq -c readme.txt', 'cut -c1-3 readme.txt', 'cut -d" " -f2 readme.txt', 'tr -d a readme.txt', 'tr -s " " < readme.txt', 'head -n 2 readme.txt', 'tail -n 2 readme.txt', 'tail -n +2 readme.txt', 'wc readme.txt', 'wc -c readme.txt',
  'tee o.txt < readme.txt; cat o.txt', 'basename /a/b.txt', 'basename /a/b.txt .txt', 'dirname /a/b.txt', 'realpath readme.txt', 'readlink -f readme.txt', 'stat readme.txt', 'file readme.txt', 'du -s .', 'df', 'ls -l', 'ls -la', 'ls -lh', 'ls -R forest', 'ls -d */', 'tree', 'tree forest', 'cp readme.txt c.txt; ls', 'cp -r forest f2; ls f2', 'mv readme.txt r2.txt; ls', 'rm readme.txt; ls', 'rm -r forest; ls', 'rm -rf nosuch', 'rm nosuch', 'rmdir forest', 'mkdir -p a/b/c; ls a/b', 'mkdir forest', 'touch a b c; ls', 'ln readme.txt h.txt; cat h.txt', 'ln -s readme.txt s.txt; cat s.txt', 'chmod +x readme.txt; ls -l readme.txt', 'whoami', 'id', 'hostname', 'uname', 'uname -a', 'pwd', 'cd; pwd', 'cd nosuch', 'cd readme.txt', 'cd /; pwd', 'cd ..; pwd', 'cd forest; cd ..; pwd', 'history', 'clear', 'man ls', 'help', 'ls --help', 'cat --help', 'nosuchcmd', 'nosuchcmd arg', '/bin/ls', './nosuch', 'echo hi | nosuch_zz', 'cat readme.txt nosuch.txt', 'cat -n readme.txt', 'cat -A readme.txt', 'tac readme.txt', 'rev readme.txt', 'nl readme.txt', 'od -c readme.txt | head -n 2', 'xxd readme.txt | head -n 1', 'comm readme.txt readme.txt', 'diff readme.txt readme.txt', 'diff readme.txt forest/notes.txt', 'cmp readme.txt readme.txt', 'seq 3', 'seq 2 4', 'seq 1 2 7', 'seq 5 -1 1', 'seq 3 1', 'yes | head -n 2', 'env | head -n 2', 'printenv HOME', 'export -n A', 'ls -1', 'ls -S', 'ls -t', 'ls -X', 'echo hello world | wc -w', 'echo hello | tr "a-z" "A-Z"', 'echo hello | rev', 'echo {a,b,c}', 'echo {1..5}', 'echo {a..e}', 'echo a{b,c}d', 'echo {1..3}{a,b}', 'echo ~root', 'echo $HOME/forest', 'echo "$HOME/forest"', 'tar', 'zip', 'curl x', 'ssh x', 'sudo ls', 'su', 'apt install x', 'python3', 'node',
];

/* ---- grid families to widen coverage deterministically ---- */
const BIN_OPS = ['+', '-', '*', '/', '%'];
const NUMS = ['0', '1', '7', '-3', '10'];
const ARITH_GRID = grid((a, b) => `echo $((${a[0]} ${a[1]} ${b}))`, NUMS.flatMap((n) => BIN_OPS.map((o) => [n, o])), ['2', '3', '0']);
const CMP_OPS = ['-eq', '-ne', '-lt', '-le', '-gt', '-ge'];
const CMP_GRID = grid((op, p) => `[ ${p[0]} ${op} ${p[1]} ] && echo T || echo F`, CMP_OPS, [['1', '2'], ['2', '2'], ['3', '2'], ['-1', '1'], ['10', '9']]);
const GLOB_GRID = grid((c, g) => `${c} ${g}`, ['echo', 'ls -d'], ['*.txt', '*/', '*/*.txt', '[a-f]*', '?????*', '.[a-z]*', 'forest/[!a]*', '{forest,village}/*', '*[0-9]*', 'nomatch*']);
const QUOTE_GRID = grid((v, f) => `v='${v}'; ${f}`, ['a b', ' a  b ', '*', 'x*y', '', 'a\tb'], ['echo $v', 'echo "$v"', 'echo [$v]', 'for w in $v; do echo "<$w>"; done', 'set -- $v; echo $#', 'set -- "$v"; echo $#', 'printf "%s|" $v; echo', 'test -n $v && echo set || echo empty']);
const PIPE_GRID = grid((a, b) => `${a} | ${b}`, ['seq 1 5', 'ls', 'cat readme.txt', 'echo c b a', 'printf "b\\na\\nb\\n"'], ['sort', 'sort -r', 'sort | uniq', 'uniq -c', 'wc -l', 'head -n 2', 'tail -n 1', 'grep a', 'tr a-z A-Z', 'cat -n']);


/* ---- lines the plan names for Tasks 2, 3 and 4 (pinned on the Stage 2 engine; expectChange marks the ones that will move) ---- */
const T = (note, ...lines) => lines.map((l) => (Array.isArray(l) ? { lines: l, change: note } : { line: l, change: note }));
const PLANNED = [
  ...T('Task 2: file names that match Object.prototype members', 'mkdir constructor; ls', 'touch toString; echo hi > valueOf; cat valueOf', 'cd __proto__', 'echo x > __proto__; cat content', 'touch hasOwnProperty; ls', 'mkdir __proto__; ls', 'cat constructor'),
  ...T('Task 3: status of an assignment-only line is the last $( )', 'x=$(false); echo $?', 'x=$(exit 3); echo $?', 'x=$(true); echo $?', 'x=$(false) y=$(true); echo $?', 'x=1; echo $?'),
  ...T('Task 3: ${X:?msg} aborts the command', 'f() { echo ${X:?msg}; echo after; }; f', 'echo ${X:?msg}; echo after', 'echo "${X:?}"; echo after', 'X=1; echo ${X:?msg}'),
  ...T('Task 3: a variable holds an expression evaluated by $(( ))', 'a="1+2"; echo $((a*2))', 'a=b; b=3; echo $((a+1))', 'a=a; echo $((a+1))', 'a="2*3"; echo $((a))'),
  ...T('Task 3: unset HOME', 'unset HOME; echo "[$HOME]"', 'unset HOME; cd', 'unset HOME; cd ~; pwd', 'unset PATH; ls', 'unset USER; echo "[$USER]"'),
  ...T('Task 3: type reports keywords', 'type if', 'type for', 'type [[', 'type ll', 'type f', 'type echo', 'type -t ls', 'type ls cd'),
  ...T('Task 3: script syntax errors name the line', ['printf "echo a\\nif\\necho b\\n" > s.sh', 'bash s.sh'], ['printf "echo a\\nfi\\n" > s.sh', 'bash s.sh'], ['printf "x=1\\nwhile true\\n" > s.sh', 'bash s.sh'], ['printf "echo a\\necho (\\n" > s.sh', 'bash s.sh']),
  ...T('Task 3: a redirect to a duplicated descriptor still creates the file', 'echo a > f >&2; ls f', 'echo a > f >&2; cat f', 'echo a >&2 > f; cat f', 'echo a > f 2>&1; cat f'),
  ...T('Task 3: each pipeline stage runs in a full subshell', 'cd forest | cat; pwd', 'cd forest | cat', 'cd forest | cat; echo $PWD', 'echo a | shift', 'set -- a b; echo x | shift; echo $#', 'echo a | x=1; echo "[$x]"', 'echo hi | read x; echo "[$x]"', 'echo hi | cd forest; pwd', 'f() { n=1; }; f | cat; echo "[$n]"', 'echo a | export Z=1; echo "[$Z]"', 'cd forest | cat; cd ..; pwd'),
  ...T('Task 3: break inside a function called from a loop', 'f() { break; }; for i in 1 2 3; do echo $i; f; done', 'f() { continue; }; for i in 1 2; do f; echo $i; done', 'f() { break; }; f; echo ok'),
  ...T('Task 4: word splitting of unquoted expansions', 'x="a b  c"; printf "[%s]" $x', 'x="a b  c"; printf "[%s]" "$x"', 'e=; printf "[%s]" $e a', 'for w in $(echo a b); do echo $w; done', 'n="a*"; touch ab; echo $n', 'n="a*"; touch ab; echo "$n"', 'x="a b"; a=$x; echo "[$a]"', 'IFS=,; y="1,2,,3"; printf "[%s]" $y', 'x="a b  c"; IFS= ; printf "[%s]" $x', '[ -n $unset ] && echo true || echo false', '[ -n "$unset" ] && echo true || echo false', 'IFS=, read a b <<< "1,2"; echo $a $b', 'f() { echo "[$X]"; }; X=7 f; echo "[$X]"', 'X=1 echo $X', 'x="a b"; echo $(echo $x)', 'x="a b"; echo "$(echo $x)"', 'echo $(echo "a  b")', 'echo $((1+1)) $((2*3))', 'x=`echo a b`; echo $x', 'set -- "a b" c; printf "[%s]" $@; echo', 'set -- "a b" c; printf "[%s]" "$@"; echo', 'set -- "a b" c; printf "[%s]" "$*"; echo'),
];

export const LINES = [
  ...PLANNED,
  ...FUNCS, ...CASES, ...HEREDOCS, ...PEXP, ...PEXP_MISC, ...ARITH, ...ARITH_MISC, ...TESTCMDS, ...TESTCMDS_MISC, ...IO, ...COMPOUND, ...CAPS, ...MISC, ...AWK, ...SED, ...GREP, ...FIND, ...XARGS, ...MORE,
  ...ARITH_GRID, ...CMP_GRID, ...GLOB_GRID, ...QUOTE_GRID, ...PIPE_GRID,
];
void fam;
