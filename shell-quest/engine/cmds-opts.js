(function (SQ) {
/* Shell options and option-like builtins (Stage 3). Sections:
     1. set        (Task 13) `set` options, `set -o`/`set +o` listings, positional parameters, the variable listing
     2. bash, sh   (Task 13) `bash -c TEXT [name args...]`, `-n` (parse only), `-x -e -u -o NAME`, combined letters
     3. (Task 15)  getopts, mktemp, command, readonly go below as their own sections

   The options live in SQ.rt.opts = {e, u, pipefail, x} (fs.js; an immutable object: every change installs a new one, so a snapshot keeps a
   reference). They are per shell: a function or sourced file shares its caller's (a change persists after it, as in bash), a subshell, $( ),
   pipeline stage or background job starts with a copy and its changes go with it (interp.js copyShell/snapshotShell/restoreShell/shellState),
   and a script or bash -c starts with none set (runChild), unless bash -e/-u/-x/-o gave some. resetProcs (Reset world) and SQ.sandbox start
   from none (procs.js fresh). What each option does is in the interpreter: set -e errexit/quiet (interp.js, mirrored in jobs.js gAndOr),
   set -u nounset (parse.js), pipefail (interp.js runPipeline), set -x xline/xq (interp.js; exec.js runCmd traces simple commands).
   Every check is an O(1) flag test, so with the options off the interpreter does no extra work. The ERR trap (Task 14, cmds-proc.js TRAPS)
   fires at the places set -e watches (interp.js failAt), and the EXIT trap runs when set -e ends a script (runChild).

   Typed lines: `set -e` at the prompt is kept for the following lines, and a failing command ends only the line it is on (bash would close
   the interactive shell; this page never closes). `set -u` likewise ends the line at the first unbound variable.

   Differences from bash 5.2 kept on purpose (simplifications, pinned in tests/shell/opts.test.mjs):
   - messages keep the typed-line form `bash: NAME: unbound variable` also inside a script or bash -c (bash: `s.sh: line 2: ...`, `bash: line 1: ...`),
     and an unbound variable is status 1 everywhere (bash -c in 5.2 returns 127, a script 1);
   - set -o lists all 27 bash option names in bash's order with the values of a non-interactive bash (bash -c); only errexit, nounset, pipefail
     and xtrace change. Other valid letters and names print `this practice shell does not support set -X yet` (status 2, nothing changes);
   - xtrace shows [[ ]] and (( )) with the operands as written (bash expands them), traces `export x=1` once (bash adds `+ x=1`), and does
     not $'...'-quote non-ASCII text; $- and ${PIPESTATUS[@]} are not supported (arrays do not exist here);
   - an unbound variable inside a here-document body ends the command line (bash 5.2 prints the error and goes on);
   - `set` alone lists the variables only (bash adds the functions). */
const S=SQ.S;
const {CMDS,E,ok}=SQ;

/* ---------- 1. set ---------- */
const NAMES=['allexport','braceexpand','emacs','errexit','errtrace','functrace','hashall','histexpand','history','ignoreeof','interactive-comments','keyword',
  'monitor','noclobber','noexec','noglob','nolog','notify','nounset','onecmd','physical','pipefail','posix','privileged','verbose','vi','xtrace'];
const ON_BY_DEFAULT=new Set(['braceexpand','hashall','interactive-comments']); /* bash -c's values for the options this shell does not model */
const KEY={errexit:'e',nounset:'u',pipefail:'pipefail',xtrace:'x'}; /* option name -> SQ.rt.opts field */
const LETTER={e:'errexit',u:'nounset',x:'xtrace'};
const BASH_LETTERS='abefhkmnptuvxBCEHPT'; /* the letters bash's set accepts (the ones not in LETTER are unsupported here) */
const USAGE='set: usage: set [-abefhkmnptuvxBCEHPT] [-o option-name] [--] [-] [arg ...]';
const isOn=n=>own(KEY,n)?!!SQ.rt.opts[KEY[n]]:ON_BY_DEFAULT.has(n);
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
/* set -o: `name<pad to 15>\ton|off` (bash's "%-15s\t%s"); set +o: the commands that recreate the settings */
const listing=minus=>NAMES.map(n=>minus?n.padEnd(15)+'\t'+(isOn(n)?'on':'off'):`set ${isOn(n)?'-':'+'}o ${n}`).join('\n');
/* parseOpts(a, i, who): reads option words from a[i] on. Returns {changes, i, list, end} (i = the first word that is not an option, end: `--` or `-`
   was seen, list: '-' or '+' when -o/+o had no name) or {err: result}. who = 'set' or the shell name (bash/sh: -c and -n are its own). */
function parseOpts(a,i,who){const changes={},sh=who!=='set',fl={};let list=null,end=null;
  const bad=(m,code=2)=>({err:E(m,code)});
  for(;i<a.length;i++){const x=a[i];
    if(x==='--'){end='--';i++;break}
    if(x==='-'&&!sh){end='-';i++;break}
    if(sh&&x.startsWith('--'))return bad(`this practice shell does not support ${who} ${x.split('=')[0]} yet`);
    if((x[0]!=='-'&&x[0]!=='+')||x.length<2)break;
    const on=x[0]==='-';
    for(let j=1;j<x.length;j++){const c=x[j];
      if(sh&&(c==='c'||c==='n')){fl[c]=on;continue}
      if(c==='o'){
        if(i+1>=a.length||(sh&&/^[-+]/.test(a[i+1]))){if(sh)return bad(`${who}: -o: option requires an argument`);list=x[0];continue}
        const nm=a[++i];
        if(!NAMES.includes(nm))return bad(sh?`${who}: ${nm}: invalid option name`:`bash: set: ${nm}: invalid option name`);
        if(!own(KEY,nm))return bad(`this practice shell does not support ${sh?who:'set'} ${x[0]}o ${nm} yet`);
        changes[KEY[nm]]=on;continue}
      if(own(LETTER,c)){changes[KEY[LETTER[c]]]=on;continue}
      if(sh){
        if('abfhkmptvBCEHPTilrsDO'.includes(c))return bad(`this practice shell does not support ${who} ${x[0]}${c} yet`);
        return {err:{out:'',err:[`${who}: ${x[0]}${c}: invalid option`,`Usage:\t${who} [GNU long option] [option] ...`,`\t${who} [GNU long option] [option] script-file ...`],code:2}}}
      if(BASH_LETTERS.includes(c))return bad(`this practice shell does not support set ${x[0]}${c} yet`);
      return {err:{out:'',err:[`bash: set: ${x[0]}${c}: invalid option`,USAGE],code:2}}}}
  return {changes,i,list,end,fl}}
const apply=ch=>{if(Object.keys(ch).length)SQ.rt.opts=Object.assign({},SQ.rt.opts,ch)};

/* `set` alone: every set variable as NAME=value, sorted, quoted the way bash prints them ('a b', $'\t' for control characters) */
const CTRL=/[\x00-\x1f\x7f]/;
function quoteVal(v){if(CTRL.test(v))return "$'"+v.replace(/[\\'\x00-\x1f\x7f]/g,c=>c==='\\'?'\\\\':c==="'"?"\\'":c==='\n'?'\\n':c==='\t'?'\\t':c==='\r'?'\\r':'\\'+c.charCodeAt(0).toString(8).padStart(3,'0'))+"'";
  return SQ.xq(v)}
function listVars(){const names=new Set(['HOME','HOSTNAME','IFS','PATH','PWD','SHELL','USER',...Object.keys(S.vars)]);
  return ok([...names].filter(k=>SQ.isSet(k)).sort((x,y)=>x<y?-1:x>y?1:0).map(k=>k+'='+quoteVal(SQ.getVar(k))).join('\n'))}

CMDS.set=function(a){
  if(!a.length)return listVars();
  const p=parseOpts(a,0,'set');if(p.err)return p.err;
  apply(p.changes);
  if(p.end==='-')apply({x:false}); /* `set -` also turns off -x (and -v) */
  const words=a.slice(p.i);
  if(p.end==='--'||words.length)SQ.frame().args=words; /* set -- a b, set a b, set -e a b: the positional parameters of the current frame */
  return p.list?ok(listing(p.list==='-')):ok()};

/* ---------- 2. bash, sh ----------
   bash [-eux] [-o NAME]... [-n] FILE [ARGS]  runs FILE as a script (SQ.runScript) with those options set; -n parses only (status 0 or the
                                              `FILE: line N: syntax error ...` with status 2, nothing runs)
   bash ... -c TEXT [NAME [ARGS]]             runs TEXT the same way: $0 = NAME (default the shell's name), $1.. = ARGS
   sh is the same shell. Other bash letters and --long options are unsupported; an unknown letter prints bash's invalid-option usage. */
function shellCmd(who){return (a,io)=>{
  if(!a.length)return E('You are already in bash. To run a script, give its name: bash pack.sh');
  const p=parseOpts(a,0,who);if(p.err)return p.err;
  const rest=a.slice(p.i),o={depth:io.depth,tty:io.tty,stdinBox:io.stdinBox||null,opts:p.changes,noexec:!!p.fl.n};
  if(p.fl.c){if(!rest.length)return E(`${who}: -c: option requires an argument`,2);
    return SQ.runText(rest[0],rest.length>1?rest[1]:who,`${who}: -c`,Object.assign(o,{args:rest.slice(2),dashc:true}))}
  if(!rest.length)return E('You are already in bash. To run a script, give its name: bash pack.sh');
  return SQ.runScript(rest[0],Object.assign(o,{args:rest.slice(1),force:true}))}}
CMDS.bash=shellCmd('bash');
CMDS.sh=shellCmd('sh');

Object.assign(SQ,{optListing:listing});
})(window.SQ = window.SQ || {});
