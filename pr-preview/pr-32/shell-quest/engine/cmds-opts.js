(function (SQ) {
/* Shell options and option-like builtins (Stage 3). Sections:
     1. set        (Task 13) `set` options, `set -o`/`set +o` listings, positional parameters, the variable listing
     2. bash, sh   (Task 13) `bash -c TEXT [name args...]`, `-n` (parse only), `-x -e -u -o NAME`, combined letters
     3. getopts    (Task 15) option parsing for scripts and functions: OPTIND, OPTARG, OPTERR, silent mode
     4. mktemp     (Task 15) temporary files and directories with names from a per-session counter
     5. command    (Task 15) command -v/-V NAME, command NAME ARGS (skips functions)
     6. readonly   (Task 15) readonly names, readonly -p; the checks live where variables are written (parse.js canSet)
     7. printenv   (Task 15) the environment, or named exported variables
     8. realpath   (Task 15) canonical absolute paths with GNU's -e / -m / -s rules
   type -t (Task 15) is next to type in cmds-sys.js.

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

/* ---------- 3. getopts ----------
   getopts OPTSTRING NAME [ARG...]: the next option of ARG (default: the positional parameters of the current frame, so a function's own) at OPTIND.
   It sets NAME to the letter (? for an unknown one, ? at the end), OPTARG to the argument of a letter followed by : in OPTSTRING, and OPTIND
   to the index of the next word; status 0, or 1 when the options are over (a word that is not an option, `-`, past the end, or `--`, which it
   skips). Grouped letters (-vn Ada) and an attached argument (-nAda) work; the place inside a group is SQ.rt.gopt = {ind, sp} (per shell,
   like the options: interp.js copyShell), forgotten when OPTIND is assigned (parse.js canSet; OPTIND=1 restarts, as POSIX asks) or when it
   no longer holds the value getopts wrote. OPTIND and OPTERR read 1 in a new shell or script (parse.js BUILTIN_VARS); functions keep it, so
   `local OPTIND=1` is the usual way to parse a function's own options (its value is put back on return).
   Errors (OPTERR not 0, OPTSTRING not starting with :): `NAME0: illegal option -- x` / `NAME0: option requires an argument -- n` with NAME0
   the script's $0 as typed (scripts/opts.sh, the name given to bash -c, bash at the prompt; a function or sourced file keeps its script's),
   NAME set to ? and OPTARG unset. Silent mode (leading :): no message, NAME ? with OPTARG the letter for an unknown one, NAME : with OPTARG
   the letter for a missing argument. Checked against bash 5.2 in tests/shell/opts.test.mjs (GETOPTS). */
const GO_USAGE='getopts: usage: getopts optstring name [arg ...]';
const VNAME=/^[A-Za-z_]\w*$/;
/* $0 of the script (or bash -c, or the interactive shell) that is running: the nearest script frame */
function scriptName(){const f=SQ.rt.frames;for(let i=f.length-1;i>=0;i--)if(f[i].kind==='script')return f[i].name;return SQ.BASE_FRAME.name}
CMDS.getopts=function(a){let i=0;
  if(a[0]==='--')i=1;
  else if(a.length&&a[0].length>1&&a[0][0]==='-')return {out:'',err:[`bash: getopts: ${a[0].slice(0,2)}: invalid option`,GO_USAGE],code:2};
  if(a.length-i<2)return {out:'',err:[GO_USAGE],code:2};
  const optstr=a[i],name=a[i+1],args=a.length>i+2?a.slice(i+2):SQ.frame().args;
  if(!VNAME.test(name)||SQ.badName(name))return E(`bash: getopts: \`${name}': not a valid identifier`,1);
  const rt=SQ.rt,err=[],silent=optstr[0]===':',os=silent?optstr.slice(1):optstr,argc=args.length;
  const cur=SQ.getVar('OPTIND');let ind,sp=0;
  if(rt.gopt&&rt.gopt.ind===cur){ind=+cur;sp=rt.gopt.sp}else{ind=parseInt(cur,10);if(!(ind>=1))ind=1}
  let nameRO=false;
  const put=(k,v)=>{if(SQ.isRO(k)){err.push(SQ.roMsg(k));if(k===name)nameRO=true;return}if(v===undefined)delete S.vars[k];else S.vars[k]=v};
  const finish=(letter,arg,code)=>{put('OPTIND',String(ind));rt.gopt=sp>0?{ind:String(ind),sp}:null;put('OPTARG',arg);put(name,letter);
    return {out:'',err,code:nameRO?2:code}};
  if(sp===0){
    if(ind>argc){ind=argc+1;return finish('?',undefined,1)}
    const w=args[ind-1];
    if(w[0]!=='-'||w==='-')return finish('?',undefined,1);
    if(w==='--'){ind++;return finish('?',undefined,1)}
    sp=1}
  const w=args[ind-1],c=w[sp++],end=sp>=w.length,at=c===':'?-1:os.indexOf(c);
  const oe=SQ.getVar('OPTERR'),loud=!silent&&(oe===''||(parseInt(oe,10)||0)!==0);
  const next=()=>{ind++;sp=0};
  if(at<0){if(loud)err.push(`${scriptName()}: illegal option -- ${c}`);if(end)next();return finish('?',silent?c:undefined,0)}
  if(os[at+1]!==':'){if(end)next();return finish(c,undefined,0)}
  if(!end){const arg=w.slice(sp);next();return finish(c,arg,0)}
  if(ind<argc){const arg=args[ind];ind+=2;sp=0;return finish(c,arg,0)}
  next();
  if(silent)return finish(':',c,0);
  if(loud)err.push(`${scriptName()}: option requires an argument -- ${c}`);
  return finish('?',undefined,0)};

/* ---------- 4. mktemp ----------
   mktemp [-d] [-u] [-t] [-p DIR | --tmpdir[=DIR]] [TEMPLATE]: creates a new empty file (mode 600) or directory (-d, mode 700) and prints its name;
   -u only prints a name. Names are deterministic: the last run of 3 or more X's in the last component of TEMPLATE becomes a letter and a counter
   (XXXXXX -> A00001, XXX -> A01), and without a TEMPLATE the name is DIR/tmp.A00001, DIR/tmp.A00002, ... The counter is SQ.rt.tmpSeq (runtime
   state: it restarts with Reset world, a reload and inside SQ.sandbox, so a mission check sees the same names every time); a name that already
   exists is skipped. DIR is -p DIR, else an exported TMPDIR, else /tmp; a TEMPLATE without -p/-t is relative to the current directory, with -t
   it is one name in DIR. A folder that already holds 1000 entries refuses another (`No space left on device`), so a loop cannot fill the save
   with empty files; every call is a command, so a runaway loop also meets the step cap. GNU coreutils 9.4 messages (with ' quotes); -q and
   --suffix print `this practice shell does not support mktemp -q yet`. */
const MK_TRY="Try 'mktemp --help' for more information.",DEF_TMPL='tmp.XXXXXXXXXX',DIR_MAX=1000;
const joinDir=(d,t)=>d.endsWith('/')?d+t:d+'/'+t;
/* why a path whose parent is missing cannot be made: a file in the way, or a missing folder */
function missWhy(abs){let p='';for(const s of abs.split('/').filter(Boolean)){p+='/'+s;const n=SQ.getNode(p);if(!n)return 'No such file or directory';if(n.type!=='dir')return 'Not a directory'}return 'No such file or directory'}
CMDS.mktemp=function(a){let dir=false,dry=false,tflag=false,pdir=null,end=false;const ops=[];
  const bad=m=>({out:'',err:[m,MK_TRY],code:1}),uns=x=>E(`this practice shell does not support mktemp ${x} yet`,1);
  for(let i=0;i<a.length;i++){const x=a[i];
    if(end||x[0]!=='-'||x==='-'){ops.push(x);continue}
    if(x==='--'){end=true;continue}
    if(x.startsWith('--')){const eq=x.indexOf('='),nm=eq<0?x:x.slice(0,eq);
      if(nm==='--directory'&&eq<0)dir=true;else if(nm==='--dry-run'&&eq<0)dry=true;else if(nm==='--tmpdir')pdir=eq<0?'':x.slice(eq+1);
      else if(['--quiet','--suffix','--help','--version'].includes(nm))return uns(nm);
      else return bad(`mktemp: unrecognized option '${x}'`);
      continue}
    for(let j=1;j<x.length;j++){const c=x[j];
      if(c==='d')dir=true;else if(c==='u')dry=true;else if(c==='t')tflag=true;
      else if(c==='p'){let v=x.slice(j+1);if(!v){if(i+1>=a.length)return bad("mktemp: option requires an argument -- 'p'");v=a[++i]}pdir=v;break}
      else if(c==='q')return uns('-q');
      else return bad(`mktemp: invalid option -- '${c}'`)}}
  if(ops.length>1)return bad('mktemp: too many templates');
  const envT=S.exp&&own(S.exp,'TMPDIR')&&SQ.isSet('TMPDIR')?SQ.getVar('TMPDIR'):'';
  let tmpl=ops.length?ops[0]:DEF_TMPL,shown;
  if(!ops.length)shown=joinDir(pdir||envT||'/tmp',tmpl);
  else if(tflag){if(tmpl.includes('/'))return E(`mktemp: invalid template, '${tmpl}', contains directory separator`,1);shown=joinDir(envT||pdir||'/tmp',tmpl)}
  else if(pdir!==null){if(tmpl.startsWith('/'))return E(`mktemp: invalid template, '${tmpl}'; with --tmpdir, it may not be absolute`,1);shown=joinDir(pdir||envT||'/tmp',tmpl)}
  else shown=tmpl;
  const cut=shown.lastIndexOf('/')+1,xe=shown.lastIndexOf('X')+1;let xs=xe;
  while(xs>cut&&shown[xs-1]==='X')xs--;
  if(xe<=cut||xe-xs<3)return E(`mktemp: too few X's in template '${tmpl}'`,1);
  const width=ops.length?xe-xs:6; /* the default name: tmp.A00001 */
  const fail=why=>E(`mktemp: failed to create ${dir?'directory':'file'} via template '${shown}': ${why}`,1);
  const parent=SQ.norm(shown.slice(0,cut)||'.'),par=SQ.getNode(parent);
  if(!par||par.type!=='dir')return fail(missWhy(parent));
  if(!dry&&Object.keys(par.children).length>=DIR_MAX)return fail('No space left on device');
  const rt=SQ.rt,w=width-1,cap=10**w;
  for(let tries=0;tries<DIR_MAX+1;tries++){const c=++rt.tmpSeq,L=Math.floor(c/cap);
    if(L>=26)return fail('File exists');
    const name=shown.slice(0,xs)+String.fromCharCode(65+L)+String(c%cap).padStart(w,'0')+shown.slice(xe),abs=SQ.norm(name);
    if(SQ.lstat(abs))continue;
    if(SQ.tooLong(abs))return fail(SQ.TOO_LONG);
    if(!dry){const node=dir?SQ.D():SQ.F('');node.mode=dir?0o700:0o600;par.children[abs.slice(abs.lastIndexOf('/')+1)]=node;rt.changed.add(abs)}
    return ok(name)}
  return fail('File exists')};

/* ---------- 5. command ----------
   command -v NAME...  how each name would run: /usr/bin/NAME for a command, the name itself for a builtin, keyword or function, a path for an
                       executable file named with a /; nothing for a missing name. Status 1 only when none was found (bash).
   command -V NAME...  type's sentence for each (cmds-sys.js), `bash: command: NAME: not found` for a missing one; same status rule.
   command NAME ARGS   runs NAME skipping functions: the builtin or command (exec.js runNamed), else `bash: NAME: command not found` (127).
   -p (the default PATH) is accepted and changes nothing; with no NAME it does nothing (status 0). */
const CMD_USAGE='command: usage: command [-pVv] command [arg ...]';
const execFile=c=>{const n=SQ.getNode(SQ.norm(c));return !!n&&n.type==='file'&&!!n.exec};
CMDS.command=function(a,io){let i=0,v=false,V=false;
  for(;i<a.length;i++){const x=a[i];if(x==='--'){i++;break}if(x[0]!=='-'||x==='-')break;
    for(const c of x.slice(1)){if(c==='v')v=true;else if(c==='V')V=true;else if(c!=='p')return {out:'',err:[`bash: command: -${c}: invalid option`,CMD_USAGE],code:2}}}
  const rest=a.slice(i);
  if(v||V){const out=[],err=[];let found=0;
    for(const c of rest){
      if(c.includes('/')){if(execFile(c)){out.push(V?`${c} is ${c}`:c);found++}else if(V)err.push(`bash: command: ${c}: not found`);continue}
      const k=SQ.kindOf(c);
      if(!k){if(V)err.push(`bash: command: ${c}: not found`);continue}
      found++;out.push(V?SQ.describeCmd(c):k==='file'?'/usr/bin/'+c:c)}
    return {out:out.join('\n'),err,code:rest.length&&!found?1:0}}
  if(!rest.length)return ok();
  return SQ.runNamed(rest[0],rest.slice(1),io)};

/* ---------- 6. readonly ----------
   readonly NAME[=VALUE]...  marks each name readonly (setting VALUE first); a name may be readonly and unset. readonly / readonly -p lists them
   as `declare -r NAME="VALUE"` (-rx when exported, no value when unset), sorted; bash also lists its own readonly variables (BASHOPTS, UID, ...),
   which this shell does not have. -f with no names lists none; -f NAME, -a, -A are not supported. SQ.rt.ro is per shell and never saved (see
   parse.js canSet and interp.js copyShell): a subshell, $( ), pipeline stage or job inherits it and keeps its own additions, a function shares
   it, a script or bash -c starts with none, and Reset world / a reload / SQ.sandbox start with none.
   Every write checks it and refuses with `bash: NAME: readonly variable`, status 1: NAME=v (the later assignments of that command are not made),
   export NAME=v, read, for NAME in, local NAME, getopts (status 2, as bash), printf -v, wait -p (silently), (( )) and $(( )) assignments and
   ${NAME:=v}; unset NAME says `bash: unset: NAME: cannot unset: readonly variable`. NAME=v cmd reports it and runs cmd with the old value (bash
   5.2). A readonly local goes with the local when the function returns. Difference kept on purpose: bash abandons the rest of the line after
   a failed plain assignment or expansion (the next line of a script still runs); here the line goes on with status 1, like other errors. */
const RO_USAGE='readonly: usage: readonly [-aAf] [name[=value] ...] or readonly -p';
function addRO(k){const rt=SQ.rt,n=Object.create(null);if(rt.ro)Object.assign(n,rt.ro);n[k]=1;rt.ro=Object.freeze(n)}
function dropRO(k){const rt=SQ.rt;if(!rt.ro||rt.ro[k]!==1)return;const n=Object.create(null);for(const x of Object.keys(rt.ro))if(x!==k)n[x]=1;rt.ro=Object.keys(n).length?Object.freeze(n):null}
const dq=v=>'"'+v.replace(/[\\"$`]/g,'\\$&')+'"';
function roListing(names){const ro=SQ.rt.ro;if(!ro)return '';
  return Object.keys(ro).filter(k=>!names||names.includes(k)).sort((x,y)=>x<y?-1:x>y?1:0).map(k=>`declare -r${S.exp&&own(S.exp,k)?'x':''} ${k}${SQ.isSet(k)?'='+dq(SQ.getVar(k)):''}`).join('\n')}
CMDS.readonly=function(a){let i=0,p=false,f=false;
  for(;i<a.length;i++){const x=a[i];if(x==='--'){i++;break}if(x[0]!=='-'||x==='-')break;
    for(const c of x.slice(1)){if(c==='p')p=true;else if(c==='f')f=true;else if(c==='a'||c==='A')return E(`this practice shell does not support readonly -${c} yet`,2);
      else return {out:'',err:[`bash: readonly: -${c}: invalid option`,RO_USAGE],code:2}}}
  const rest=a.slice(i);
  if(f){if(rest.length)return E('this practice shell does not support readonly -f yet',2);return ok()}
  if(!rest.length||p)return ok(roListing(rest.length?rest:null));
  const err=[];
  for(const x of rest){const eq=x.indexOf('='),k=eq<0?x:x.slice(0,eq);
    if(!VNAME.test(k)||SQ.badName(k)){err.push(`bash: readonly: \`${x}': not a valid identifier`);continue}
    if(eq>=0){if(!SQ.canSet(k)){err.push(SQ.roMsg(k));continue}
      const v=x.slice(eq+1);if(v.length>SQ.LIM.VAR)throw new SQ.StepLimit('a value grew too large');
      S.vars[k]=v;if(k==='SECONDS')SQ.rt.secAt=SQ.rt.clock}
    addRO(k)}
  return {out:'',err,code:err.length?1:0}};

/* ---------- 7. printenv ----------
   printenv: the environment, as env prints it. printenv NAME...: the value of each exported variable (and HOME USER SHELL HOSTNAME PATH PWD,
   which env shows too), one per line; status 1 when one is missing. -0 is not supported; other options print GNU's message (status 2). */
const PE_TRY="Try 'printenv --help' for more information.";
function envMap(){const L={};for(const k of ['HOME','USER','SHELL','HOSTNAME','PATH','PWD'])if(SQ.isSet(k))L[k]=SQ.getVar(k);
  for(const k of Object.keys(S.exp||{}))if(own(S.vars,k))L[k]=S.vars[k];return L}
CMDS.printenv=function(a,io){let i=0;
  for(;i<a.length;i++){const x=a[i];if(x==='--'){i++;break}if(x[0]!=='-'||x==='-')break;
    if(x.startsWith('--')){const nm=x.split('=')[0];if(['--null','--help','--version'].includes(nm))return E(`this practice shell does not support printenv ${nm} yet`,2);
      return {out:'',err:[`printenv: unrecognized option '${x}'`,PE_TRY],code:2}}
    for(const c of x.slice(1)){if(c==='0')return E('this practice shell does not support printenv -0 yet',2);return {out:'',err:[`printenv: invalid option -- '${c}'`,PE_TRY],code:2}}}
  const names=a.slice(i);if(!names.length)return CMDS.env([],io);
  const L=envMap(),out=[];let miss=false;
  for(const n of names){if(!n.includes('=')&&own(L,n))out.push(L[n]);else miss=true}
  return {out:out.join('\n'),err:[],code:miss?1:0}};

/* ---------- 8. realpath ----------
   realpath [-e|-m] [-s] PATH...: each PATH as an absolute path with . and .. resolved and every symbolic link followed (a link's .. is taken
   after the link, so le/.. is the parent of le's target). Default (GNU -E): every component but the last must exist; -e: all of them; -m: none.
   -s / --no-symlinks: links are kept and .. is lexical. Errors as GNU: `realpath: PATH: No such file or directory` / `Not a directory` /
   `Too many levels of symbolic links` (status 1; the other PATHs still print, in order). -q -z -L -P --relative-to --relative-base are not
   supported. */
const RP_TRY="Try 'realpath --help' for more information.";
function rpResolve(p,mode,nosym){const cwd=SQ.realPath(S.cwd,true)||S.cwd;
  if(nosym){const L=SQ.norm(p,cwd);if(mode==='m')return {path:L};
    const chk=mode==='e'?L:L.slice(0,L.lastIndexOf('/'))||'/',n=SQ.getNode(chk);
    if(!n||(mode!=='e'&&n.type!=='dir'))return {err:SQ.isLoop(chk)?'Too many levels of symbolic links':n?'Not a directory':missWhy(chk)};
    return {path:L}}
  const parts=(p.startsWith('/')?'':cwd).split('/').concat(p.split('/')).filter(x=>x!==''),res=[];let node=S.fs,hops=0;
  const look=()=>{let n=S.fs;for(const s of res){if(!n||n.type!=='dir'||!own(n.children,s))return null;n=n.children[s]}return n};
  while(parts.length){const s=parts.shift();
    if(s==='.')continue;
    if(s==='..'){res.pop();node=look();continue}
    if(node&&node.type!=='dir'){if(mode==='m'){res.push(s);node=null;continue}return {err:'Not a directory'}}
    const c=node&&own(node.children,s)?node.children[s]:null;
    if(!c){if(mode==='e'||(mode==='E'&&parts.length))return {err:'No such file or directory'};res.push(s);node=null;continue}
    if(c.type==='link'){if(++hops>20)return {err:'Too many levels of symbolic links'};
      if(c.target.startsWith('/')){res.length=0;node=S.fs}
      parts.unshift(...c.target.split('/').filter(x=>x!==''));continue}
    res.push(s);node=c}
  return {path:'/'+res.join('/')}}
CMDS.realpath=function(a){let mode='E',nosym=false,end=false;const ops=[];
  const uns=x=>E(`this practice shell does not support realpath ${x} yet`,1);
  for(const x of a){if(end||x[0]!=='-'||x==='-'){ops.push(x);continue}if(x==='--'){end=true;continue}
    if(x.startsWith('--')){const nm=x.split('=')[0];
      if(nm==='--canonicalize-existing')mode='e';else if(nm==='--canonicalize-missing')mode='m';else if(nm==='--no-symlinks'||nm==='--strip')nosym=true;
      else if(['--quiet','--zero','--relative-to','--relative-base','--logical','--physical','--help','--version'].includes(nm))return uns(nm);
      else return {out:'',err:[`realpath: unrecognized option '${x}'`,RP_TRY],code:1};
      continue}
    for(const c of x.slice(1)){if(c==='e')mode='e';else if(c==='m')mode='m';else if(c==='s')nosym=true;else if('qzLP'.includes(c))return uns('-'+c);
      else return {out:'',err:[`realpath: invalid option -- '${c}'`,RP_TRY],code:1}}}
  if(!ops.length)return {out:'',err:['realpath: missing operand',RP_TRY],code:1};
  const out=[],err=[],list=[];
  for(const p of ops){const fd=p!==''&&SQ.rt.fdTab&&SQ.fdNode(SQ.norm(p))?{path:SQ.norm(p)}:null; /* a live <( ) file (fs.js fdTable) is its own path */
    const r=fd||(p===''?{err:'No such file or directory'}:rpResolve(p,mode,nosym));
    if(r.err){const m=`realpath: ${p===''?"''":p}: ${r.err}`;err.push(m);list.push({text:m,cls:'err'})}else{out.push(r.path);list.push({text:r.path,cls:'out'})}}
  const res={out:out.join('\n'),err,code:err.length?1:0};if(err.length&&out.length)res.list=list; /* on the screen, stdout and stderr in order */
  return res};

Object.assign(SQ,{optListing:listing,dropRO,scriptName});
})(window.SQ = window.SQ || {});
