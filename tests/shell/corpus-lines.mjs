// Hand-written differential-corpus entries for the shell interpreter (see corpus.test.mjs).
// An entry is a string (one line, fresh world), an array of strings (a session: lines run in order in one
// fresh world, the LAST line's out/code and the final state are recorded), or an object { lines|line, change }
// where change:false/true/'note' overrides the automatic expectChange marking in corpus-generate.mjs.
// Every entry runs in a world where the setup() of chapters 0..10 has been applied. No dates, no $RANDOM.

export const LINES = [
  // ---- empty / whitespace / comments ----
  '', ' ', '   ', '\t', '# only a comment', '   # indented comment', 'echo hi # trailing comment',
  'echo a#b', 'echo "a # b"', 'echo   many    spaces   here', '\techo tab-led', 'echo\ttabbed\targs', '  echo lead and trail  ',
  'pwd ', ' pwd',

  // ---- quoting ----
  'echo "double quoted"', "echo 'single quoted'", 'echo back\\slash', 'echo "a\\"b"', "echo 'a\"b'", 'echo "a\'b"',
  'echo \\$HOME', 'echo "\\$HOME"', "echo '$HOME'", 'echo "$HOME"', 'echo $HOME', 'echo ${HOME}', 'echo "${HOME}x"',
  'echo "unterminated', "echo 'unterminated", 'echo "a" "b"', 'echo "a""b"', "echo ''", 'echo ""', 'echo "" x', 'echo a"b c"d',
  'echo "tab\\there"', 'echo "line1\\nline2"', 'echo "a  b"', 'echo \\"quoted\\"', 'echo \\', 'echo a\\ b',

  // ---- variables ----
  'X=1; echo $X', 'X=hello; echo "$X world"', 'X=a Y=b', 'X=1; Y=2; echo $X$Y', 'X=1; echo ${X}2', 'X=1; echo $X2',
  'echo $UNSET', 'echo "[$UNSET]"', 'echo $USER', 'echo $SHELL', 'echo $HOSTNAME', 'echo $PATH', 'echo $PWD', 'X = 1', 'X= 1', 'X=',
  'X="a b"; echo $X', 'X="a b"; echo "$X"', 'X=*; echo $X', 'X=1; X=2; echo $X', 'echo $?', 'false_cmd_zz; echo $?', 'true_zz || echo $?',
  'ls nosuch; echo $?', 'ls; echo $?', 'echo $? $?', 'cat nosuch; echo "code $?"', 'X=5; echo $X $? $X',
  'export A=1', 'export A=1 B=2', 'export', 'export A', 'export A=1; env', 'export A="x y"; echo $A', 'export 1A=x', 'env',
  ['export Z=1', 'env'], ['export Z=1', 'echo $Z'], ['X=1', 'echo $X'], ['X=1', 'X=2', 'echo $X'], ['NAME="Ada"', 'echo "Hello, $NAME"'],
  'echo $$', 'echo $0', 'echo $1', 'echo "$@"', 'echo $#', 'echo ${X:-default}', 'echo ${#HOME}', 'echo $((1+2))', 'echo $(( 3 * 4 ))',
  'X=3; echo $((X+1))', 'X=abc; echo ${#X}', 'echo ${UNSET:-fallback}', 'echo ${HOME:-no}',

  // ---- tilde ----
  'echo ~', 'echo ~/forest', 'echo "~"', 'echo a~', 'cd ~; pwd', 'ls ~', 'ls ~/forest', 'echo ~ ~', 'cd ~/forest; pwd', 'cat ~/readme.txt',

  // ---- globs ----
  'echo *', 'echo *.txt', 'echo ?', 'echo ??', 'echo .*', 'echo *.nomatch', 'echo "*"', "echo '*.txt'", 'echo \\*', 'echo f*', 'echo [a-z]*',
  'ls *.txt', 'ls *.nomatch', 'ls -a *', 'ls .s*', 'ls forest/*', 'ls forest/c*', 'ls */', 'ls village/logs/*.log', 'ls village/logs/day?.log',
  'echo village/logs/*', 'echo village/*/day1.log', 'echo */*', 'echo ~/*.txt', 'cat *.txt | head -n 1', 'wc -l *.txt', 'grep -l wolf *', 'echo *a*',
  ['touch a1 a2 b1', 'ls a*'], ['touch a1 a2 b1', 'echo ?1'], ['touch .hid vis', 'echo *'], ['touch .hid vis', 'echo .*'],
  ['mkdir d', 'touch d/x d/y', 'echo d/*'], ['touch "sp ace"', 'echo *ace'], ['touch "sp ace"', 'ls'],

  // ---- for one-liners ----
  'for i in a b c; do echo $i; done', 'for i in 1 2 3; do echo "n=$i"; done', 'for f in *.txt; do echo "Found $f"; done',
  'for f in village/logs/*.log; do echo $f; done', 'for i in a b; do for j in 1 2; do echo $i$j; done; done', 'for i in a b; do echo $i; done; echo $i',
  'for i in $(seq 1 3); do echo $i; done', 'for i in $(ls forest); do echo "- $i"; done', 'for i in; do echo $i; done', 'for i in x; do echo $i; done',
  'for i in "a b" c; do echo $i; done', 'for i in *.nomatch; do echo $i; done', 'for i in 1 2 3; do echo $i; done | wc -l', 'for i in 1 2; do echo $i; done > loop.txt',
  'for i in 1 2; do echo $i; done; echo end', 'for i in 1 2 3; do echo $i; done && echo ok', 'for i in a b; do touch $i.txt; done; ls',
  'for i in a b; do touch $i.txt; done', 'for 1 in a; do echo x; done', 'for i a b; do echo x; done', 'for i in a b', 'for i in a b; do echo $i', 'for i in a b; echo $i; done',
  'for i in 1 2 3; do echo $i; done; for j in x y; do echo $j; done', 'for i in 1 2; do echo $i; echo again; done', 'for i in 1 2; do echo $i && echo and; done',
  'for i in 1 2; do ls nosuch; done', 'for i in 1 2; do false_zz; done; echo $?', 'for x in $(echo a b c); do echo "<$x>"; done',
  'for d in forest village; do ls $d; done', 'for d in forest village; do cd $d; pwd; done', 'for n in 1 2 3; do mkdir dir$n; done; ls',
  'for i in 1 2 3; do echo $i; done > out.txt; cat out.txt', 'for i in $(seq 1 100000); do echo $i; done', 'for i in $(seq 1 30000); do true_zz; done',
  ['for i in 1 2 3; do echo $i; done', 'echo $i'], ['for i in a b; do echo $i; done', 'echo "last=$i"'],

  // ---- redirects ----
  'echo hi > a.txt', 'echo hi > a.txt; cat a.txt', 'echo one > a.txt; echo two >> a.txt; cat a.txt', 'echo hi >> new.txt; cat new.txt', 'echo hi>a.txt; cat a.txt',
  'echo hi >a.txt', 'echo hi > a.txt > b.txt', 'echo hi > forest', 'echo hi > nosuchdir/f.txt', 'echo hi > /dev/null', 'echo hi >> /dev/null', 'cat < readme.txt', 'cat < nosuch.txt',
  'cat < /dev/null', 'cat nosuch 2> err.txt; cat err.txt', 'cat nosuch 2>> err.txt; cat nosuch 2>> err.txt; cat err.txt', 'cat nosuch 2> /dev/null', 'cat nosuch 2>&1', 'cat nosuch 2>&1 | wc -l',
  'ls nosuch 2>&1 | head -n 1', 'echo hi 2>&1', 'cat readme.txt journal.txt > both.txt; wc -l both.txt', 'ls > listing.txt', 'ls > listing.txt; cat listing.txt', 'grep wolf journal.txt > w.txt; wc -l w.txt',
  'echo a > f; echo b > f; cat f', 'echo > f; cat f', 'echo hi >', 'echo hi > ;', '> f', '> f; ls', '< readme.txt', 'echo hi 2>', 'cat nosuch 2> forest', 'echo hi | > f',
  'sort < village/people.txt | uniq', 'sort < village/people.txt > sorted.txt; head -n 2 sorted.txt', 'wc -l < journal.txt', 'echo hi > a.txt < readme.txt',
  ['echo "echo hi" > x.sh', 'cat x.sh'], ['echo one > f', 'echo two >> f', 'echo three >> f', 'cat f'], ['echo hi > f', 'echo > f', 'wc -c f'], ['ln -s readme.txt L', 'echo more >> L', 'cat readme.txt'],

  // ---- pipes ----
  'cat journal.txt | head -n 2', 'cat journal.txt | grep -i wolf | wc -l', 'cat village/people.txt | sort | uniq -c', 'sort village/people.txt | uniq', 'sort village/people.txt | uniq -c | sort -n',
  'ls | wc -l', 'ls | sort', 'ls | head -n 1', 'echo b a | tr " " "\\n" | sort', 'cat nosuch | wc -l', 'ls nosuch | wc -l', 'cat nosuch | cat', '| cat', 'cat |', 'cat | | cat', 'echo a || echo b',
  'echo hi | cat | cat | cat', 'echo hi | echo yo', 'grep wolf journal.txt | head -n 1 | tr a-z A-Z', 'cat readme.txt | wc', 'cat village/people.txt | sort | uniq -c | sort -rn | head -n 2',
  'echo x | wc -c', 'seq 1 5 | tail -n 2', 'seq 1 5 | head -n 2 | tail -n 1', 'ls | grep txt', 'ls -l | head -n 3', 'pwd | cat', 'cd forest | cat', 'cd forest | pwd', 'echo hi | cd',

  // ---- && || ; chains ----
  'echo a && echo b', 'echo a || echo b', 'ls nosuch && echo b', 'ls nosuch || echo b', 'echo a; echo b', 'echo a;echo b', 'ls nosuch; echo after', 'ls nosuch && echo b || echo c', 'echo a && echo b && echo c',
  'echo a || echo b || echo c', 'ls nosuch || ls nosuch2 || echo third', 'ls nosuch && echo b; echo c', 'ls nosuch && echo b && echo c; echo d', 'echo a; ls nosuch && echo b || echo c',
  'mkdir -p backup && cp *.txt backup/', 'mkdir -p backup && cp *.txt backup/ && ls backup', 'echo a;; echo b', ';', '; echo a', 'echo a;', 'echo a; ;', '&& echo a', 'echo a &&', 'echo a ||', 'echo a | | echo b',
  'echo a && | echo b', 'echo a ; ; echo b', 'cd forest && pwd', 'cd nosuch && pwd', 'cd nosuch || pwd', 'cd forest; cd cave; pwd', 'cd forest && cd cave && cd .. && pwd',
  'echo a && ls nosuch; echo $?', 'ls nosuch || echo $?', 'true_zz && echo no || echo yes', 'echo a &&echo b', 'echo a&&echo b', 'echo a||echo b', 'echo a;echo b;echo c',

  // ---- command substitution ----
  'echo $(echo hi)', 'echo "$(echo hi)"', 'echo "[$(echo a b)]"', 'echo $(echo a b)', 'echo $(pwd)', 'echo "in $(pwd) now"', 'X=$(echo hi); echo $X', 'X=$(pwd); echo $X', 'X=$(ls forest); echo $X',
  'echo $(echo $(echo deep))', 'echo $(echo $(echo $(echo deeper)))', 'echo $(ls nosuch)', 'echo $(ls nosuch); echo $?', 'echo $(cd forest; pwd); pwd', 'echo $(X=1; echo $X); echo [$X]',
  'echo $(echo', 'echo "$(echo"', 'echo $(', 'echo $()', { line: 'echo $(  )', change: false }, 'echo a$(echo b)c', 'echo $(echo a)$(echo b)', 'echo $(cat readme.txt | head -n 1)', 'echo "$(cat readme.txt | wc -l)"',
  'ls $(echo forest)', 'cat $(echo readme.txt)', 'echo $(seq 1 3)', 'echo "$(seq 1 3)"', 'echo $(echo "a   b")', 'echo "$(echo "nested quotes")"', 'echo $(echo ")")', "echo $(echo ')')",
  'echo $(wc -l journal.txt)', 'for i in $(seq 1 3); do echo "$(echo $i)"; done', 'echo $(echo $(echo $(echo $(echo $(echo $(echo $(echo $(echo $(echo $(echo $(echo $(echo $(echo $(echo $(echo $(echo $(echo $(echo $(echo $(echo $(echo $(echo $(echo end))))))))))))))))))))))))))',
  'echo $(echo $(echo $(echo $(echo $(echo $(echo $(echo $(echo $(echo $(echo $(echo $(echo $(echo $(echo $(echo $(echo $(echo $(echo $(echo end))))))))))))))))))))',

  // ---- cd ----
  'cd', 'cd ~', 'cd /', 'cd /tmp', 'cd forest', 'cd forest/cave', 'cd nosuch', 'cd readme.txt', 'cd forest cave', 'cd ..', 'cd ../..', 'cd /home/explorer/forest', 'cd -', 'cd .', 'cd ./forest', 'cd forest/', 'cd forest//cave',
  'cd forest/..', 'cd /nosuch', 'cd ~/nosuch', 'cd ""', 'cd forest;cd -', 'cd ..;pwd', 'cd /;cd ..;pwd', 'cd forest/cave/deeper/chest; pwd', 'cd forest; ls', 'cd forest; ls -a', 'cd forest/cave; cat .bats',
  ['cd forest', 'pwd'], ['cd forest', 'cd cave', 'pwd'], ['cd forest', 'cd -'], ['cd forest', 'cd ..', 'cd -', 'pwd'], ['cd forest/cave', 'ls'], ['cd /tmp', 'ls'], ['cd /tmp', 'cd', 'pwd'], ['cd forest', 'cat owl.txt'],
  ['cd forest', 'echo $PWD'], ['cd forest', 'cd ../village', 'pwd'], 'cd..', 'cd...',

  // ---- ls ----
  'ls', 'ls -a', 'ls -l', 'ls -la', 'ls -al', 'ls -A', 'ls -lh', 'ls -R', 'ls -1', 'ls -x', 'ls --all', 'ls forest', 'ls forest village', 'ls forest/cave', 'ls nosuch', 'ls nosuch forest', 'ls readme.txt', 'ls readme.txt forest',
  'ls /', 'ls /etc', 'ls /tmp', 'ls -l /etc', 'ls -ld forest', 'ls .', 'ls ..', 'ls ./forest', 'ls forest/', 'ls ~/village/logs', 'ls -a forest/cave', 'ls -t', 'ls -S', 'ls -r', 'ls -d forest', 'ls ""',
  ['chmod +x pack.sh', 'ls -l'], ['touch s', 'chmod +x s', 'ls -l'], ['touch s', 'chmod 600 s', 'ls -l s'], ['mkdir d', 'chmod 700 d', 'ls -ld d'], ['ln -s forest F', 'ls -l'], ['ln -s forest F', 'ls F'], ['ln -s nosuch D', 'ls -l'],
  ['touch x', 'chmod +x x', 'ls'],

  // ---- mkdir / touch / rmdir ----
  'mkdir d', 'mkdir d; ls', 'mkdir d e f; ls', 'mkdir forest', 'mkdir -p forest', 'mkdir -p a/b/c; ls a/b', 'mkdir a/b', 'mkdir', 'mkdir -z x', 'mkdir readme.txt', 'mkdir -p readme.txt/x', 'mkdir /tmp/x; ls /tmp', 'mkdir ""',
  'touch f', 'touch f g; ls', 'touch', 'touch forest', 'touch nosuch/f', 'touch readme.txt; cat readme.txt | head -n 1', 'touch -z x', 'touch "a b"; ls', 'touch a/b',
  'rmdir forest', 'rmdir nosuch', 'rmdir', 'rmdir readme.txt', ['mkdir d', 'rmdir d', 'ls'], ['mkdir -p a/b', 'rmdir a'], ['mkdir -p a/b', 'rmdir a/b', 'ls a'], ['mkdir d', 'cd d', 'rmdir ../d'],

  // ---- cp / mv / rm ----
  'cp readme.txt copy.txt; cat copy.txt | head -n 1', 'cp readme.txt', 'cp', 'cp nosuch x', 'cp forest x', 'cp -r forest forest2; ls forest2', 'cp -r forest forest', 'cp readme.txt forest; ls forest', 'cp readme.txt journal.txt forest; ls forest',
  'cp readme.txt journal.txt', 'cp readme.txt readme.txt', 'cp -r forest forest/cave', 'cp readme.txt nosuchdir/x', 'cp *.txt forest; ls forest', 'cp -z a b', 'cp readme.txt /tmp/; ls /tmp',
  'mv readme.txt r.txt; ls', 'mv readme.txt', 'mv', 'mv nosuch x', 'mv forest village; ls village', 'mv readme.txt forest/; ls forest', 'mv forest forest/cave', 'mv readme.txt journal.txt', 'mv readme.txt readme.txt',
  'mv readme.txt journal.txt forest; ls forest', 'mv village forest; ls', 'mv -z a b', 'mv forest .', 'mv forest/owl.txt .; ls forest',
  'rm readme.txt; ls', 'rm', 'rm nosuch', 'rm -f nosuch', 'rm forest', 'rm -r forest; ls', 'rm -rf forest; ls', 'rm -r nosuch', 'rm readme.txt journal.txt; ls', 'rm *.txt; ls', 'rm -z x', 'rm -r /', 'rm /', 'rm -rf *; ls', 'rm .secret_map; ls -a', 'rm -r .',
  'rm village/logs/*.log; ls village/logs', 'rm "*.txt"', 'rm -i readme.txt',
  ['cd forest', 'rm -r ../forest'], ['cd forest', 'mv ../forest ../x'], ['cp -r forest f2', 'rm -r f2', 'ls'],

  // ---- cat / head / tail / wc ----
  'cat readme.txt', 'cat', 'cat nosuch', 'cat forest', 'cat readme.txt nosuch', 'cat nosuch readme.txt', 'cat readme.txt readme.txt', 'cat -n readme.txt', 'cat /etc/hostname', 'cat /etc/motd', 'cat .secret_map', 'cat -z x',
  'head journal.txt', 'head -n 2 journal.txt', 'head -n2 journal.txt', 'head -2 journal.txt', 'head -n 0 journal.txt', 'head -n x journal.txt', 'head -n', 'head nosuch', 'head', 'head -n 2 readme.txt journal.txt', 'head -n 100 readme.txt',
  'tail journal.txt', 'tail -n 3 journal.txt', 'tail -n3 journal.txt', 'tail -3 journal.txt', 'tail -n 0 journal.txt', 'tail nosuch', 'tail', 'tail -n 2 readme.txt journal.txt', 'tail -f journal.txt', 'tail -n -1 journal.txt',
  'wc journal.txt', 'wc -l journal.txt', 'wc -w journal.txt', 'wc -c journal.txt', 'wc -lw journal.txt', 'wc nosuch', 'wc readme.txt journal.txt', 'wc forest', 'wc', 'wc -z x', 'wc -m journal.txt',

  // ---- grep ----
  'grep wolf journal.txt', 'grep -i wolf journal.txt', 'grep -n map journal.txt', 'grep -c wolf journal.txt', 'grep -v Day journal.txt', 'grep -in wolf journal.txt', 'grep nosuchword journal.txt', 'grep wolf nosuch', 'grep', 'grep wolf',
  'grep wolf journal.txt readme.txt', 'grep -r wolf .', 'grep -l wolf journal.txt', 'grep -w wolf journal.txt', 'grep "Day [1-3]" journal.txt', 'grep "^Day" journal.txt', 'grep "[" journal.txt', 'grep "(a+)+b" journal.txt',
  'grep -E "a|b" journal.txt', 'grep -x x journal.txt', 'grep --color wolf journal.txt', 'grep -j wolf journal.txt', 'grep "" readme.txt', 'grep wolf forest', 'grep -c wolf journal.txt village/shop.txt', 'cat journal.txt | grep -c Day',

  // ---- sort / uniq / find / tree ----
  'sort village/people.txt', 'sort -r village/people.txt', 'sort -u village/people.txt', 'sort -n village/shop.txt', 'sort nosuch', 'sort', 'sort -z x', 'sort village/people.txt village/shop.txt', 'sort -k2 village/shop.txt', 'sort -nr village/shop.txt',
  'uniq village/people.txt', 'sort village/people.txt | uniq', 'sort village/people.txt | uniq -c', 'sort village/people.txt | uniq -d', 'sort village/people.txt | uniq -u', 'uniq nosuch', 'uniq -z x',
  'find .', 'find . -name "*.txt"', 'find . -type d', 'find . -type f', 'find . -name gold.txt', 'find forest', 'find nosuch', 'find . -name', 'find . -type x', 'find -name "*.log"', 'find . -name "*.nomatch"', 'find / -name hostname',
  'find . -maxdepth 1', 'find . -iname "README*"', 'find forest -type f -name "*.txt"', 'find . -z', 'find readme.txt',
  'tree', 'tree forest', 'tree -a', 'tree nosuch', 'tree readme.txt', 'tree -L 1', 'tree -d', 'tree village',

  // ---- other commands ----
  'pwd', 'pwd -L', 'pwd extra', 'whoami', 'hostname', 'echo', 'echo -n hi', 'echo -e "a\\tb"', 'echo -n', 'echo -x', 'echo --', 'echo - -', 'echo a  b', 'echo "$(echo a)  b"',
  'seq 3', 'seq 2 4', 'seq 1 2 7', 'seq', 'seq x', 'seq 0', 'seq 1 100000', 'seq 1 300000', 'seq 1 1000 | wc -l', 'seq 1 5 | tr 1 x', 'echo hello | tr a-z A-Z', 'echo hello | tr -d l', 'tr', 'cut -d, -f1 village/shop.txt',
  'cut -c1-3 readme.txt', 'cut', 'sed "s/wolf/dog/" journal.txt | head -n 1', "sed -n '2,3p' readme.txt", 'sed', 'printf "%s\\n" a b', 'printf "a\\n"', 'printf', 'basename /a/b.txt', 'dirname /a/b.txt', 'basename',
  'echo a b | xargs echo', 'echo a b | xargs -n 1 echo', 'seq 1 3 | xargs', 'xargs', 'diff readme.txt readme.txt', 'diff readme.txt journal.txt | head -n 3', 'diff', 'stat readme.txt', 'stat nosuch', 'stat',
  'ln -s readme.txt L', 'ln -s readme.txt L; cat L', 'ln readme.txt L', 'ln -s', 'ln -s a', 'ln -s a b c', 'ln -s readme.txt readme.txt', 'ln -s forest F; cd F; pwd', 'ln -s a b; ls -l',
  ['ln -s b a', 'ln -s a b', 'cat a'], ['ln -s readme.txt L', 'rm L', 'ls'], ['ln -s readme.txt L', 'cat L | head -n 1'], ['ln -s forest F', 'cd F', 'pwd'], ['ln -s forest F', 'ls F/cave'],
  'tee t.txt', 'echo hi | tee t.txt', 'echo hi | tee t.txt; cat t.txt', 'echo hi | tee -a t.txt', 'echo hi | tee', 'tee', 'echo hi | tee /nosuch/x',
  'which ls', 'which nosuch', 'which', 'type ls', 'type cd', 'type nosuch', 'type export', 'type', 'type cd ls',
  'history', 'clear', 'clear; echo after', 'date_zz', { line: 'help', change: 'help text may list the new builtins' }, 'help cd', 'man ls', 'man cd', 'man grep', 'man pwd', 'man nosuch', 'man', 'man man', 'ls --help', 'cd --help', 'tree --help', 'man help',

  // ---- typo suggestions / friendly messages ----
  'lss', 'cta readme.txt', 'grp wolf journal.txt', 'sl', 'ech hi', 'mkdr d', 'tuch f', 'cd..', 'tar', 'tee_', 'pws', 'cat_', 'ls-l', 'lsl', 'whoam', 'hlep', 'mkdi x', 'celar', 'x', 'zzzzzz', 'gerp', 'sudo ls', 'sudo', 'dir', 'cls', 'copy a b', 'move a b', 'del a',
  'less readme.txt', 'more readme.txt', 'logout', 'rmm x', 'pw', 'exitt', 'ECHO hi', 'Ls', 'cp_', 'python', 'git status', 'vi f', 'nano f', 'vim f', 'code f', 'exit', 'exit 1', 'ping x', 'curl x', 'ssh x', 'touchh f',
  'echo hi; lss', 'lss && echo no', 'lss || echo fallback', 'lss; echo $?', 'echo hi | lss', 'nosuchcmd arg', '/bin/ls', '/usr/bin/echo hi', './nosuch', './readme.txt', './forest', 'forest/', 'readme.txt',

  // ---- chmod / run ----
  'chmod', 'chmod +x', 'chmod +x nosuch', 'chmod 755 readme.txt', 'chmod 999 readme.txt', 'chmod abc readme.txt', 'chmod +x readme.txt; ls -l readme.txt', 'chmod -x readme.txt', 'chmod u+x readme.txt', 'chmod a+x readme.txt', 'chmod 644 forest',
  'chmod +x forest', 'chmod 7 readme.txt', 'chmod 0755 readme.txt', 'chmod -R +x forest',
  ['chmod 000 readme.txt', 'cat readme.txt'], ['chmod 000 readme.txt', 'ls -l readme.txt'], ['chmod 444 readme.txt', 'echo hi > readme.txt'], ['chmod 644 readme.txt', 'ls -l readme.txt'],

  // ---- scripts ----
  ['echo "echo hello" > x.sh', 'bash x.sh'], ['echo "echo hello" > x.sh', './x.sh'], ['echo "echo hello" > x.sh', 'chmod +x x.sh', './x.sh'], ['echo "echo hello" > x.sh', 'sh x.sh'], ['echo "echo hello" > x.sh', 'chmod +x x.sh', './x.sh', 'echo $?'],
  ['echo "echo hello" > x.sh', 'chmod +x x.sh', 'cd forest', '../x.sh'], ['echo "echo hello" > x.sh', 'chmod +x x.sh', '/home/explorer/x.sh'], ['echo "echo hello" > x.sh', 'chmod +x x.sh', 'x.sh'],
  ['echo "echo one" > x.sh', 'echo "echo two" >> x.sh', 'bash x.sh'], ['echo "ls nosuch" > x.sh', 'bash x.sh', 'echo $?'], ['echo "echo hi > out.txt" > x.sh', 'bash x.sh', 'cat out.txt'], ['echo "cd forest" > x.sh', 'bash x.sh', 'pwd'],
  ['echo "X=5" > x.sh', 'bash x.sh', 'echo [$X]'], ['echo "echo \\$X" > x.sh', 'X=7', 'bash x.sh'], ['echo "echo \\$X" > x.sh', 'export X=7', 'bash x.sh'], ['echo "# comment" > x.sh', 'echo "echo ok" >> x.sh', 'bash x.sh'],
  ['printf "echo a\\necho b\\n" > x.sh', 'bash x.sh'], ['echo "" > x.sh', 'bash x.sh'], ['touch x.sh', 'bash x.sh'], 'bash', 'bash nosuch.sh', 'bash forest', 'sh nosuch.sh', 'bash -c "echo hi"', 'bash readme.txt',
  ['echo "bash x.sh" > x.sh', 'bash x.sh'], ['echo "bash y.sh" > x.sh', 'echo "bash x.sh" > y.sh', 'bash x.sh'], ['echo "echo deep" > a.sh', 'echo "bash a.sh" > b.sh', 'echo "bash b.sh" > c.sh', 'bash c.sh'],
  ['echo "for i in 1 2; do echo \\$i; done" > x.sh', 'bash x.sh'], ['echo "echo a; echo b" > x.sh', 'bash x.sh'], ['echo "seq 1 3 | wc -l" > x.sh', 'bash x.sh'], ['echo "lss" > x.sh', 'bash x.sh'],
  ['echo "if true; then echo yes; fi" > x.sh', 'bash x.sh'], ['echo "echo \\$1" > x.sh', 'bash x.sh arg'], ['echo "echo hi" > pack.sh', './pack.sh'], ['echo "echo hi" > pack.sh', 'chmod +x pack.sh', './pack.sh', 'ls -l pack.sh'],
  ['echo \'echo "Packing for the trip..."\' > pack.sh', 'echo \'ls camp\' >> pack.sh', 'chmod +x pack.sh', './pack.sh'],

  // ---- caps and limits ----
  'seq 1 10000', 'seq 1 2001', ['seq 1 10000 > f', 'cat f f f f f f f f f f f f f f f f f f f f f f f f f f'], ['seq 1 10000 > f', 'cat f f f f f f f f f f f f f f f f f f f f f f f f f f | wc -l'],
  'seq 1 100000 | wc -l', 'seq 1 100000 | head -n 3', 'seq 1 100000 > big.txt; wc -l big.txt', 'seq 1 300000 > big.txt', 'for i in $(seq 1 5000); do echo $i; done | wc -l', 'for i in $(seq 1 25000); do :; done',
  ['seq 1 100000 > big.txt', 'cat big.txt big.txt big.txt > big2.txt', 'wc -l big2.txt'], ['seq 1 10000 > f', 'cat f f f f f f f f f f f f > g', 'wc -c g'], ['seq 1 100000 > f', 'for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do cat f >> f; done'],
  'for i in $(seq 1 1000); do for j in $(seq 1 1000); do true_zz; done; done', 'seq 1 5000 | xargs -n 1 echo | wc -l', 'seq 1 30000 | xargs -n 1 echo | wc -l',
  'echo aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa | grep "(a+)+b"',

  // ---- unsupported syntax today (Stage 2 changes these) ----
  'cat << EOF', 'cat <<< hi', 'echo hi &> f', 'echo hi |& cat', 'echo hi >&2', 'echo hi &', 'sleep 1 &', 'if true; then echo y; fi', 'while true; do echo y; done', 'until false; do echo y; done', 'case x in x) echo y;; esac',
  'function f { echo hi; }', 'f() { echo hi; }', 'f() { echo hi; }; f', '[ -f readme.txt ] && echo yes', '[[ -f readme.txt ]] && echo yes', 'test -f readme.txt && echo yes', 'test 1 = 1', 'read X', 'echo hi | read X', 'shift', 'source x.sh', '. x.sh',
  'true', 'false', 'true && echo ok', 'false || echo ok', 'false; echo $?', 'exit', 'return', 'local x=1', '(echo hi)', '( echo hi )', '{ echo hi; }', '{ echo hi; } > f', 'echo $(( 1 + 2 ))', 'echo $((2*3))', 'echo $((', 'echo `date_zz`', 'echo `echo hi`',
  'echo a{b,c}', 'echo {1..3}', 'echo hi > f &', 'ls &', 'for i in 1; do echo $i; done &', 'echo hi 1>&2', 'echo hi 2>&1 >f', 'echo ${X:=v}', 'echo ${X:+v}', 'echo ${HOME#/home}', 'echo ${HOME%/explorer}', 'echo ${HOME/home/h}', 'echo ${#}', 'echo $*',
  'declare x=1', 'alias l=ls', 'unset X', 'set -e', 'let x=1', 'eval echo hi', 'trap x EXIT', 'wait', 'jobs', 'fg', 'echo $RANDOM_ZZ', '! true', '! false && echo ok', 'time ls', 'cd forest &', 'select x in a; do echo $x; done',
  'echo !!', 'echo !$', 'echo a\\', 'echo a \\\n b', 'ls | { cat; }', 'echo hi |& tee f', 'cat <(echo hi)', 'echo hi >(cat)', 'echo hi >| f', 'cat <> f', 'echo [a]', 'echo a=b', 'a=b echo hi', 'X=1 echo $X', 'echo a ;; echo b',
  ['X=1', 'echo "$X $1 $@ $#"'], ['f() { echo hi; }', 'f'], ['echo "echo \\$1 \\$2" > x.sh', 'bash x.sh a b'], ['echo "echo \\$# args" > x.sh', 'bash x.sh a b c'], ['echo "exit 3" > x.sh', 'bash x.sh', 'echo $?'], ['echo "false" > x.sh', 'bash x.sh', 'echo $?'],
  ['echo "echo hi" > x.sh', 'source x.sh'], ['echo "X=9" > x.sh', 'source x.sh', 'echo $X'], ['echo "read X" > x.sh', 'bash x.sh'], ['echo "echo -e a" > x.sh', 'bash x.sh'], ['echo "echo \\${X:-d}" > x.sh', 'bash x.sh'],
];
