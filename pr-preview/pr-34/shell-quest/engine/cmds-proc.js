(function (SQ) {
/* jobs, wait, kill, the job notices and the signal table (Stage 3 Task 12b), trap and signal delivery (Task 14). Runtime state only (SQ.rt, procs.js); nothing here is saved.

   Job tables. Every job record (jobs.js) has an owner: the process scope that started it (0 = the interactive shell). The current shell's
   table is tableOf(): the records owned by SQ.rt.scope. A $( ) or a pipeline stage (scope node marked inherit by parse.js runSub and interp.js
   runPipeline) that has no jobs of its own sees its parent's table, as in bash, so `jobs | cat` and `kill $(jobs -p)` work; a ( ) subshell, a
   script and a job start with an empty table. `wait` only ever waits for the current scope's own jobs (its children).
   The interactive shell keeps an ended job's record until a notice or `jobs` has shown it; every other shell drops it when it ends (bash -c
   does the same). The statuses of dropped records stay in SQ.rt.reaped for `wait PID` (bash remembers them too).

   Format (bash 5.2): `[N]M  STATE                   CMD`, M = `+` current, `-` previous, else a space; STATE padded to 24 columns:
   Running | Stopped | Done | Exit N | the signal's strsignal text (Terminated, Killed, Hangup, Interrupt, Quit, User defined signal 1, ...).
   CMD is the and-or list's source text as typed (bash prints its own re-indented copy, e.g. `( exit 3 )` for `(exit 3)`), with ` &` while Running.
   jobs -l puts the pid in 5 columns after the marker: `[1]+  1235 Running ...`. Current/previous: the job that most recently started or stopped
   is current (Job.cur).
   Job specs: %% %+ % (current), %- (previous; the current one when there is only one job), %N, %string (command starts with it),
   %?string (command contains it); more than one match is `bash: kill: string: ambiguous job spec`, none `bash: kill: %x: no such job`.

   Notices (SQ.flushNotices, called by exec.js at the end of every outermost typed line, after the jobs that ran during the line's 1-second cost,
   never inside $( ) and never for a non-interactive shell's jobs): each interactive job that ended or stopped since the last prompt, once, in job
   order: `[1]+  Done                    sleep 2`, `[1]+  Terminated              sleep 100`, `[1]+  Exit 3                  cmd` (bash pads
   every state to 24 columns, so `Exit 3` is followed by 18 spaces). Choice: bash 5.2 also prints them as soon as a foreground command finishes;
   here they always close the line, so the line's own output comes first.

   jobs [-lnprs] [jobspec...]: -l pids, -p only pids, -r running only, -s stopped only, -n only jobs whose state changed since `jobs` or a notice
   last showed it. -x prints the unsupported message. Errors: `bash: jobs: -z: invalid option` + usage (2), `bash: jobs: %3: no such job` (1).
   wait [-fn] [-p VAR] [ID...]: no ID waits for every running job of this shell and returns 0 (at once when there are none). PID or job spec:
   that job's status (each in turn; the status of the last); a stopped job returns 128 + its stop signal at once. -n: the first of them (or of all
   the shell's unwaited jobs) to end; 127 when there is none. -p VAR gets that job's pid; -f is accepted. Errors (bash wording):
   `bash: wait: pid 999 is not a child of this shell` (127), `bash: wait: %5: no such job` (127), "bash: wait: `abc': not a pid or valid job
   spec" (1), invalid option + usage (2). The clock moves to each time a job wakes (SQ.advance, then SQ.tick(t, {inclusive:true}) so a job
   whose wake equals the target ends during the wait); the jobs' output appears during the wait, tagged as jobs.js tags it (a script's wait
   keeps its own jobs' output as its own). Stops: a wait that would last more than LIM.SLEEP seconds or for ever (sleep infinity, a job
   that is stopped) prints `this practice shell stopped the command: that wait is too long`; a wait that cannot go on because the line's job
   work (SQ.JOB_WORK) is spent prints the step message. Inside a background job a lone `wait` makes the job yield until its children end
   (r.defer.wait, jobs.js gWait); a wait the job cannot pause at (inside a pipeline, $( ), redirect or script run by the job) that would have to
   block prints `this practice shell does not support wait inside that part of a background job yet` (2).
   kill [-s SIG | -n N | -SIG] PID|JOBSPEC... and kill -l|-L [SIG|N...]: argument parsing follows bash's kill.def (-sNAME, -nN, the first
   -X is the signal, later -N is a negative pid, -- ends options). Signals by number or name, any case, SIG prefix optional; Linux numbering,
   1-31 and 34-64 (RTMIN..RTMAX). kill -l prints bash's 64-signal table; kill -l 9 -> KILL, kill -l KILL -> 9, kill -l 137 -> KILL (N > 128
   is N - 128), 0 -> EXIT. Status 0 when any target got the signal, else 1; usage errors 2. Wording: `bash: kill: (999) - No such process`,
   `bash: kill: abc: arguments must be process or job IDs`, `bash: kill: %5: no such job`, `bash: kill: SIGFOO: invalid signal specification`,
   `bash: kill: -s: option requires an argument`. A PID names any live job of the session (whoever started it); a job that has ended is
   `No such process` by pid and `no such job` by spec. kill -0 only checks that the target exists.

   SQ.signal(job, {num, name}) -> 'ok' | 'ignored' | 'trapped' | 'stopped' | 'continued' | 'ended' | 'self' delivers a signal to a job. (The plan's
   interface named it signal(pid, name) -> Out[]; the 12b hook takes the job record, and the output of an EXIT handler it causes stays in J.out for
   kill to collect with SQ.jobOut.) First the job's traps (Task 14, below): '' ignores it, a handler queues it ('trapped'); KILL and STOP cannot be
   caught. Otherwise the DEFAULT ACTION TABLE: 0 nothing; CONT resumes a stopped job (state Running; it runs at the next tick); STOP, TSTP, TTIN,
   TTOU stop a running job (state Stopped, ps state T, it becomes current, notice `Stopped`; tick never runs it; a job that stops itself runs on
   until it next yields); CHLD, URG, WINCH are ignored; every other signal (TERM, INT, HUP, KILL, QUIT, USR1, ...) ends it: SQ.endJob(job,
   'Terminated', 128 + N, strsignal text) unwinds the generator's finally blocks with the job's state swapped in, so the shell's own state (cwd,
   variables, function frames, scope) is untouched wherever the job was suspended, then runs the job's EXIT trap (not for KILL). A terminating
   signal to a stopped job ends it at once. 'self': the job signalled itself from its own slice; kill throws {jobSig} after its other targets and
   jobs.js slice() ends the job (no message). $BASHPID inside a job is the job's pid (parse.js), so `kill $BASHPID` there signals the job itself.
   kill 0 and negative pids (process groups) name no process here: `bash: kill: (0) - No such process` (status 1), a safe choice (bash would
   signal the whole group, the shell included).

   TRAPS (Task 14). Traps belong to a process: the scope node SQ.rt.scopeNode (jobs.js header) holds them as node.traps = Map<key, text> | null,
   key EXIT DEBUG ERR RETURN or a signal name (INT, RTMIN+1, ...), text '' = ignored. SQ.rt.traps is a read-only view of the current node's map,
   null when none is set, so every check in the interpreter is O(1) without traps. A function and a sourced file run in the caller's process,
   so they see and change its traps; a ( ) subshell, $( ), pipeline stage and background job start a new node with only the ignored real
   signals (childTraps), and show (trap / trap -p) the parent's traps until they change one, as bash does for `saved=$(trap)`; a script or
   bash -c starts with only the ignored ones, which it cannot trap or reset (bash: signals ignored on entry to a non-interactive shell).
   Runtime state only: never saved; Reset world (resetProcs: a fresh root node) and SQ.sandbox (procsSave) start with none.
   trap [-lp] [[ARG] SPEC...]: `trap 'cmd' SPEC...` sets, `trap '' SPEC` ignores, `trap - SPEC`, `trap SPEC` (one argument that is a spec) and
   `trap N SPEC...` (N a signal number, as bash) reset; `trap` / `trap -p` list every trap as `trap -- 'cmd' SIGINT` (EXIT, DEBUG, ERR, RETURN
   without SIG; text in single quotes with '\'' for a quote) in signal order (EXIT, 1..64, DEBUG, ERR, RETURN); `trap -p SPEC...` those;
   `trap -l` (also with -p or arguments) prints the kill -l table. Specs: names in any case with or without SIG, numbers 0..64 (0 = EXIT), the
   pseudo signals without SIG (SIGEXIT is invalid, as in bash). Errors (bash wording): `bash: trap: SIGFOO: invalid signal specification`
   (status 1, the other specs still apply), `bash: trap: -z: invalid option` + usage and a lone action (`trap 'x'`, `trap ''`, `trap -`):
   `trap: usage: trap [-lp] [[arg] signal_spec ...]` (status 2). KILL and STOP are accepted and listed but never caught. `trap 'x' RETURN`
   prints `this practice shell does not support trap RETURN yet` (2).
   Handlers (runHandler) are parsed when they run (a syntax error prints `bash: exit trap: line 1: ...` / `error trap` / `debug trap` /
   `trap`, each time it runs; bash adds a second line quoting the text) and run in the process's own state through the normal interpreter,
   with $? = the status at that moment; afterwards $? is put back (an EXIT handler leaves the shell's status as it was unless it calls exit n).
   A handler is not interrupted by the signals it queues (node.inTrap); they run after it. Under set -x a signal, ERR or DEBUG handler is
   traced one level deeper (++), an EXIT handler at + (bash). A handler cut short by its allowance inside a job says `stopped the job`.
   A background job whose whole program is one unredirected ( list ) runs that list in the job's own node (bash runs an async subshell as one
   process), so `(trap '' TERM; sleep 30) &` survives kill %1; a ( ) inside a larger job program stays a child process.
   EXIT runs once (it is removed before it runs) whenever a process ends: a script or bash -c (interp.js runChild), a ( ) subshell, $( ),
   pipeline stage, background job (endJob: its end, exit, kill, its step-cap stop), by the end of the text, exit (its status kept, or the
   handler's exit n), set -e, a ${X:?}/set -u abort, a signal (not KILL; the status stays 128+N), a timeout (SQ.abortTrap: the timeout's
   signal handler first, then EXIT; KILL runs neither) and a step / output / nesting cap (abortTrap again: the cap's message is printed first,
   the handler's output after it, and the handler gets its own TRAP_STEPS = 1000 steps and output room, so a runaway handler is cut short with
   a second cap message). A job's EXIT handler always gets that allowance (it runs outside the job's slice). At a typed prompt an EXIT trap is
   kept but never runs: bash runs it when the shell exits, and this page never exits.
   ERR runs where set -e would exit (interp.js failAt, the same suppression in conditions, && / || lists and !), set -e on or off, then set -e
   exits as usual; it does not run inside a function body (bash without set -E: the call's failing status fires it in the caller).
   DEBUG runs before each simple command of the process and before each command of a multi-stage pipeline (all of them before the pipeline
   starts, as bash; exec.js runCmd, interp.js runPipeline; not inside a function: no set -T; not before [[ ]], (( )) or a for pass, which
   bash also traces); its output comes before the command's, like a set -x trace, and exit in it ends the shell before the command.
   Signal delivery: a queued signal waits at node.sig (SQ.rt.sigPend counts them all) and runs at the target's next command boundary: after the
   pipeline it is in finishes (sigBoundary, called after every pipeline of an and-or list in interp.js and jobs.js). As in bash 5.2: a trapped
   signal to a job sleeping in `sleep 10` runs its handler when the sleep ends and the job goes on; a trapped signal interrupts `wait` (status
   128+N, then the handler; a job's wait too); an untrapped terminating signal ends a job at once (its EXIT trap runs at the kill time).
   `kill SIG $$` names the shell $$ stands for: the innermost script / bash -c on the scope chain, else the interactive shell (inside a job or
   subshell that is its parent, as in bash, where $$ is the parent's pid). Trapped or ignored: as above. Untrapped, a script dies at its next
   command boundary with status 128+N: its EXIT trap runs (not for KILL) and its caller prints the strsignal text (`Terminated`, `Killed`,
   `User defined signal 1`; nothing for INT and PIPE, like bash). The interactive shell ignores TERM, INT and QUIT (as bash) and, since the page
   never exits, every other untrapped signal too (kill -9 $$ prints nothing, status 0); its trapped signals from a job run when the shell next
   gets control (the next boundary of the line, or the end of the line: exec.js). STOP/TSTP to a script are ignored.
   Deviations kept on purpose: a script killed by a job while it sleeps dies when its sleep ends (bash: at the kill time); a script under
   `timeout` whose TERM trap runs does not go on afterwards (bash resumes it after the interrupted command) and its earlier output is lost as
   with any timeout (only the handlers' output is shown); a handler's syntax error prints one line in this shell's syntax-error wording
   (bash: two lines, `unexpected token `then''); a job's async INT/QUIT ignore (bash without job control) is not modelled; RETURN, set -E and set -T are unsupported;
   `exit` in a sourced file ends only that file (Stage 2), so the EXIT trap runs when the script itself ends.
*/
const {CMDS,E,own,LIM}=SQ;
const SHELL_PID=1234;
const errL=text=>({text,cls:'err'}),outL=text=>({text,cls:'out'});
/* a result whose stdout and stderr lines keep their order on screen (list), with out/err for a redirected command */
const fromList=(list,code,bg)=>{const r={out:list.filter(x=>x.cls==='out'&&!x.bg).map(x=>x.text).join('\n'),err:list.filter(x=>x.cls==='err'&&!x.bg).map(x=>x.text),code,list};if(bg&&bg.length)r.bg=bg;return r};

/* ---------- signals (Linux numbering, bash 5.2 names) ---------- */
const NAMES=['HUP','INT','QUIT','ILL','TRAP','ABRT','BUS','FPE','KILL','USR1','SEGV','USR2','PIPE','ALRM','TERM','STKFLT','CHLD','CONT','STOP','TSTP',
  'TTIN','TTOU','URG','XCPU','XFSZ','VTALRM','PROF','WINCH','IO','PWR','SYS'];
const SIGNAME=Object.create(null);SIGNAME[0]='EXIT';NAMES.forEach((n,i)=>{SIGNAME[i+1]=n});
SIGNAME[34]='RTMIN';for(let k=1;k<=15;k++)SIGNAME[34+k]='RTMIN+'+k;for(let k=14;k>=1;k--)SIGNAME[64-k]='RTMAX-'+k;SIGNAME[64]='RTMAX';
const SIGNUM=Object.create(null);for(const n of Object.keys(SIGNAME))SIGNUM[SIGNAME[n]]=+n;
const DESC=[null,'Hangup','Interrupt','Quit','Illegal instruction','Trace/breakpoint trap','Aborted','Bus error','Floating point exception','Killed',
  'User defined signal 1','Segmentation fault','User defined signal 2','Broken pipe','Alarm clock','Terminated','Stack fault','Child exited','Continued',
  'Stopped (signal)','Stopped','Stopped (tty input)','Stopped (tty output)','Urgent I/O condition','CPU time limit exceeded','File size limit exceeded',
  'Virtual timer expired','Profiling timer expired','Window changed','I/O possible','Power failure','Bad system call'];
const descOf=n=>n<DESC.length?DESC[n]:`Real-time signal ${n-34}`;
const STOPS=new Set([19,20,21,22]),IGNORED=new Set([17,23,28]);
const action=n=>n===0?'none':n===18?'cont':STOPS.has(n)?'stop':IGNORED.has(n)?'ignore':'term';
/* a signal by number or name (any case, SIG prefix optional) -> {num, name}, or null */
function sigOf(spec){spec=String(spec);
  if(/^\d+$/.test(spec)){const n=+spec;return SIGNAME[n]!==undefined?{num:n,name:SIGNAME[n]}:null}
  let u=spec.toUpperCase();if(u.startsWith('SIG')&&u.length>3)u=u.slice(3);
  return SIGNUM[u]!==undefined?{num:SIGNUM[u],name:u}:null}
function sigTable(){const ns=Object.keys(SIGNAME).map(Number).filter(n=>n>0).sort((a,b)=>a-b);let o='';
  ns.forEach((n,i)=>{o+=`${String(n).padStart(2)}) SIG${SIGNAME[n]}${(i+1)%5===0?'\n':'\t'}`});return o.replace(/\n$/,'')}

const setProc=(J,st)=>{const p=SQ.rt.procs.find(x=>x.pid===J.pid);if(p)p.state=st};
/* queue signal num at a process scope node (delivered by sigBoundary at its next command boundary) */
const queue=(n,num)=>{(n.sig=n.sig||[]).push(num);SQ.rt.sigPend=(SQ.rt.sigPend||0)+1};
const UNCATCHABLE=n=>n===9||n===19;
function signal(J,s){const rt=SQ.rt;
  if(s.num===0)return 'ok';
  /* a trap the job set (on its top scope node) intercepts the signal before the default action; KILL and STOP cannot be caught */
  const top=J.topNode,h=top&&top.traps?top.traps.get(s.name):undefined;
  if(h!==undefined&&!UNCATCHABLE(s.num)){
    if(h==='')return 'ignored';
    queue(top,s.num);
    if(J.waitReq){J.waitIntr=128+s.num;J.waitReq=null;J.wake=rt.clock} /* a trapped signal interrupts wait (status 128+n), then the handler runs */
    if(s.num===18&&J.state==='Stopped'){J.state='Running';setProc(J,'S');if(J.wake!==null&&J.wake<rt.clock)J.wake=rt.clock}
    return 'trapped'}
  const act=action(s.num);
  if(act==='ignore')return 'ignored';
  if(act==='cont'){if(J.state==='Stopped'){J.state='Running';setProc(J,'S');if(J.wake!==null&&J.wake<rt.clock)J.wake=rt.clock}return 'continued'}
  if(act==='stop'){if(J.state==='Running'){J.state='Stopped';J.stopSig=s.num;J.cur=++rt.jobSeq;J.told=false;setProc(J,'T');
      if(J.owner===0&&!rt.notices.includes(J))rt.notices.push(J)}
    return 'stopped'}
  if(J===rt.slice)return 'self';
  SQ.endJob(J,'Terminated',128+s.num,descOf(s.num),s.num===9);return 'ended'}
/* the shell $$ names (see TRAPS in the header): the innermost script or bash -c on the scope chain, else the interactive shell */
function signalShell(s){const rt=SQ.rt;if(s.num===0)return {ok:true};
  let n=rt.scopeNode;while(n.up&&!n.script)n=n.up;
  if(n.dead)return {ok:true};
  const h=n.traps?n.traps.get(s.name):undefined;
  if(h!==undefined&&!UNCATCHABLE(s.num)){if(h!=='')queue(n,s.num);return {ok:true}}
  if(n.id===0)return {ok:true}; /* the interactive shell: ignores TERM, INT and QUIT like bash, and the page never exits on any other signal */
  if(s.num===9||action(s.num)==='term')queue(n,s.num); /* a script dies at its next command boundary (KILL: without its EXIT trap) */
  return {ok:true}}

/* ---------- job tables, job specs, formatting ---------- */
const byId=(a,b)=>a.id-b.id;
function tableOf(){const rt=SQ.rt;let n=rt.scopeNode;
  while(n.inherit&&n.up&&!rt.jobs.some(j=>j.owner===n.id))n=n.up;
  return {own:n===rt.scopeNode,list:rt.jobs.filter(j=>j.owner===n.id).sort(byId)}}
const ownJobs=()=>{const s=SQ.rt.scope;return SQ.rt.jobs.filter(j=>j.owner===s).sort(byId)};
function marks(list){const m=new Map(),by=list.slice().sort((a,b)=>b.cur-a.cur);for(const j of list)m.set(j,' ');
  if(by[0])m.set(by[0],'+');if(by[1])m.set(by[1],'-');return m}
/* a %spec (shown as typed in messages) -> {job} | {err} */
function findJob(w,list,who,shown){shown=shown===undefined?w:shown;const s=w.slice(1),M=marks(list),none={err:`bash: ${who}: ${shown}: no such job`};
  const by=mk=>list.find(x=>M.get(x)===mk);let j;
  if(s===''||s==='%'||s==='+')j=by('+');
  else if(s==='-')j=by('-')||by('+');
  else if(/^\d+$/.test(s))j=list.find(x=>x.id===+s);
  else{const q=s[0]==='?',t=q?s.slice(1):s,hits=list.filter(x=>q?x.cmd.includes(t):x.cmd.startsWith(t));
    if(hits.length>1)return {err:`bash: ${who}: ${t}: ambiguous job spec`};j=hits[0]}
  return j?{job:j}:none}
const ended=J=>J.state!=='Running'&&J.state!=='Stopped';
const stateText=J=>J.state==='Running'?'Running':J.state==='Stopped'?'Stopped':J.state==='Done'?(J.code?`Exit ${J.code}`:'Done'):(J.desc||'Terminated');
function jobLine(J,m,long){return `[${J.id}]${m}${long?' '+String(J.pid).padStart(5)+' ':'  '}${stateText(J).padEnd(24)}${J.state==='Running'?J.cmd+' &':J.cmd}`}
/* the interactive shell has shown J's state: an ended record goes (its status stays for wait PID), a stopped one stays */
function told(J){const rt=SQ.rt;J.told=true;if(ended(J)){SQ.reap(J);return}const i=rt.notices.indexOf(J);if(i>=0)rt.notices.splice(i,1)}
function flushNotices(){const rt=SQ.rt;if(!rt.notices.length)return [];
  const M=marks(rt.jobs.filter(j=>j.owner===0)),due=rt.notices.filter(j=>j.state!=='Running').sort(byId);rt.notices.length=0;
  const out=due.map(J=>({text:jobLine(J,M.get(J)||' ',false),cls:'sys'}));
  for(const J of due)told(J);
  return out}

/* ---------- jobs ---------- */
const JOBS_USAGE='jobs: usage: jobs [-lnprs] [jobspec ...] or jobs -x command [args]';
CMDS.jobs=function(a){const f={l:0,n:0,p:0,r:0,s:0};let i=0;
  for(;i<a.length;i++){const x=a[i];if(x==='--'){i++;break}if(x[0]!=='-'||x==='-')break;
    for(const c of x.slice(1)){if(own(f,c)){f[c]=1;continue}
      if(c==='x')return E('this practice shell does not support jobs -x yet',2);
      return {out:'',err:[`bash: jobs: -${c}: invalid option`,JOBS_USAGE],code:2}}}
  const T=tableOf(),M=marks(T.list),list=[];let sel=T.list,code=0;
  if(i<a.length){sel=[];
    for(const w of a.slice(i)){const r=findJob(w[0]==='%'?w:'%'+w,T.list,'jobs',w);if(r.job)sel.push(r.job);else{list.push(errL(r.err));code=1}}}
  const shown=[];
  for(const J of sel){if(f.r&&J.state!=='Running')continue;if(f.s&&J.state!=='Stopped')continue;if(f.n&&J.told)continue;
    list.push(outL(f.p&&!f.l?String(J.pid):jobLine(J,M.get(J),!!f.l)));shown.push(J)}
  if(T.own&&SQ.rt.scope===0)for(const J of shown)told(J);
  else if(T.own)for(const J of shown)J.told=true;
  return fromList(list,code)};

/* ---------- wait ---------- */
const WAIT_USAGE='wait: usage: wait [-fn] [-p var] [id ...]';
const jobCode=J=>J.state==='Stopped'?128+J.stopSig:J.code;
/* req = {mode: 'all'|'each'|'any', items: [{job} | {code, pid?, bad?}], pvar}. null while it must go on waiting, else {code, job?, pid?} */
function waitReady(req){const its=req.items;
  if(req.mode==='all')return its.every(x=>x.job.state!=='Running')?{code:0}:null;
  if(req.mode==='each'){if(its.some(x=>x.job&&x.job.state==='Running'))return null;
    const L=its[its.length-1];return L.job?{code:jobCode(L.job),job:L.job}:{code:L.code,pid:L.pid}}
  const cand=its.filter(x=>x.job);if(!cand.length)return {code:127};
  let J=null;for(const x of cand)if(ended(x.job)&&(!J||x.job.endSeq<J.endSeq))J=x.job;
  return J?{code:J.code,job:J}:null}
/* the wait is over: mark what it collected, set -p VAR, return the status */
function waitDone(req,r){
  if(req.mode!=='any'){for(const x of req.items)if(x.job&&ended(x.job))x.job.waited=true}else if(r.job)r.job.waited=true;
  if(req.pvar){const pid=r.job?r.job.pid:r.pid;if(pid!==undefined&&SQ.canSet(req.pvar))SQ.setVar(req.pvar,String(pid))} /* a readonly VAR keeps its value */
  return r.code}
/* the foreground waits: move the clock from one job wake to the next until req is ready; returns the jobs' output */
function block(req,io){const rt=SQ.rt,start=SQ.now(),out=[];
  try{for(;;){const sn=rt.scopeNode;if(rt.sigPend&&sn.sig&&sn.sig.length){req.intr=128+sn.sig[0];return out} /* a signal for this shell interrupts the wait (Task 14) */
      if(waitReady(req))return out;
      SQ.step();
      if((rt.jobWork||0)>=SQ.JOB_WORK)throw new SQ.StepLimit(); /* no job may run again in this line: the wait cannot end */
      let T=Infinity;
      for(const j of rt.jobs){if(j.state!=='Running')continue;
        if(j.waitReq){if(waitReady(j.waitReq))T=Math.min(T,rt.clock);continue}
        if(j.wake<T)T=j.wake}
      if(T<rt.clock)T=rt.clock;
      const dl=rt.deadlines.length?Math.min(...rt.deadlines):Infinity; /* a timeout around a script that waits fires as usual */
      if((T===Infinity||T-start>LIM.SLEEP)&&!(dl-SQ.now()<=LIM.SLEEP))throw new SQ.StepLimit('that wait is too long');
      out.push(...SQ.advance(T-SQ.now(),io));
      out.push(...SQ.tick(T,{inclusive:true}))}}
  catch(e){if(e&&e.tmo!==undefined)e.out=out.concat(e.out||[]);throw e}}
CMDS.wait=function(a,io){let any=false,pvar=null,i=0;const bad=m=>({out:'',err:[m,WAIT_USAGE],code:2});
  for(;i<a.length;i++){const x=a[i];if(x==='--'){i++;break}if(x[0]!=='-'||x==='-')break;
    for(let k=1;k<x.length;k++){const c=x[k];
      if(c==='n'){any=true;continue}if(c==='f')continue;
      if(c==='p'){pvar=x.slice(k+1)||a[++i];if(pvar===undefined)return bad('bash: wait: -p: option requires an argument');
        if(!/^[A-Za-z_]\w*$/.test(pvar)||SQ.badName(pvar))return E(`bash: wait: \`${pvar}': not a valid identifier`,2);break}
      return bad(`bash: wait: -${c}: invalid option`)}}
  const rt=SQ.rt,scope=rt.scope,mine=ownJobs(),errs=[],ids=a.slice(i),live=J=>J.state==='Running'||(ended(J)&&!J.waited);
  const req={mode:ids.length?(any?'any':'each'):(any?'any':'all'),items:[],pvar};
  if(!ids.length)req.items=mine.filter(any?live:(J=>J.state==='Running')).map(job=>({job}));
  for(const w of ids){
    if(/^\d+$/.test(w)){const n=+w,J=mine.find(j=>j.pid===n);
      if(J){if(!any||live(J))req.items.push({job:J});continue}
      const R=!any&&rt.reaped.slice().reverse().find(x=>x.owner===scope&&x.pid===n);
      if(R){req.items.push({code:R.code,pid:n});continue}
      if(any&&rt.reaped.some(x=>x.owner===scope&&x.pid===n))continue;
      errs.push(`bash: wait: pid ${n} is not a child of this shell`);if(!any)req.items.push({code:127,bad:true});continue}
    if(w[0]==='%'){const f=findJob(w,mine,'wait');
      if(f.job){if(!any||live(f.job))req.items.push({job:f.job});continue}
      errs.push(f.err);if(!any)req.items.push({code:127,bad:true});continue}
    errs.push(`bash: wait: \`${w}': not a pid or valid job spec`);if(!any)req.items.push({code:1,bad:true})}
  if(req.mode==='each'&&!req.items.length)req.mode='all';
  const el=errs.map(errL);let r=waitReady(req);
  if(r)return fromList(el,waitDone(req,r));
  if(rt.slice){ /* inside a background job: a lone wait makes the job yield (jobs.js gWait); anywhere else in it the job cannot pause */
    if(io&&io.defer){const o={out:'',err:errs,code:0};o.defer={wait:req,get pend(){return o.err}};return o}
    return fromList(el.concat(errL('this practice shell does not support wait inside that part of a background job yet')),2)}
  const bg=block(req,io);if(req.intr)return fromList(el.concat(bg),req.intr,bg);r=waitReady(req);
  return fromList(el.concat(bg),waitDone(req,r),bg)};

/* ---------- kill ---------- */
const KILL_USAGE='kill: usage: kill [-s sigspec | -n signum | -sigspec] pid | jobspec ... or kill -l [sigspec]';
function sigListing(args){if(!args.length)return fromList([outL(sigTable())],0);
  const list=[];let code=0;
  for(const x of args){
    if(/^\d+$/.test(x)){let n=+x;if(n>128)n-=128;if(SIGNAME[n]!==undefined){list.push(outL(SIGNAME[n]));continue}if(n===32||n===33)continue}
    else{const s=sigOf(x);if(s){list.push(outL(String(s.num)));continue}}
    list.push(errL(`bash: kill: ${x}: invalid signal specification`));code=1}
  return fromList(list,code)}
CMDS.kill=function(a){let i=0,listing=false,sig=null,spec=null,saw=false;
  while(i<a.length){const w=a[i];
    if(w==='-l'||w==='-L'){listing=true;i++;continue}
    if(w==='-s'||w==='-n'){if(i+1>=a.length)return E(`bash: kill: ${w}: option requires an argument`,1);spec=a[i+1];sig=sigOf(spec);saw=true;i+=2;continue}
    if(w[0]==='-'&&w[1]==='s'&&/[A-Za-z]/.test(w[2]||'')){spec=w.slice(2);sig=sigOf(spec);saw=true;i++;continue}
    if(w[0]==='-'&&w[1]==='n'&&/\d/.test(w[2]||'')){spec=w.slice(2);sig=sigOf(spec);saw=true;i++;continue}
    if(w==='--'){i++;break}
    if(w==='-?')return {out:'',err:[KILL_USAGE],code:2};
    if(w[0]==='-'&&!saw){spec=w.slice(1);sig=sigOf(spec);saw=true;i++;continue}
    break}
  if(listing)return sigListing(a.slice(i));
  if(saw&&!sig)return E(`bash: kill: ${spec}: invalid signal specification`,1);
  const targets=a.slice(i);if(!targets.length)return {out:'',err:[KILL_USAGE],code:2};
  if(!sig)sig={num:15,name:'TERM'};
  const T=tableOf(),errs=[],bg=[];let any=false,self=false;
  const hit=J=>{const r=signal(J,sig);if(r==='self')self=true;any=true;bg.push(...SQ.jobOut(J))}; /* the EXIT handler of a job it ended */
  for(const w0 of targets){const neg=w0[0]==='-',w=neg?w0.slice(1):w0;
    if(w&&/^\d+$/.test(w)){const pid=+w;
      if(!neg&&pid===SHELL_PID){SQ.signalShell(sig);any=true;continue}
      const J=!neg&&SQ.rt.jobs.find(j=>j.pid===pid&&!ended(j));
      if(J){hit(J);continue}
      errs.push(`bash: kill: (${neg?'-':''}${pid}) - No such process`);continue}
    if(w0===''){errs.push("bash: kill: `': not a pid or valid job spec");continue}
    if(w0[0]!=='%'){errs.push(`bash: kill: ${w0}: arguments must be process or job IDs`);continue}
    const f=findJob(w0,T.list,'kill');
    if(!f.job){errs.push(f.err);continue}
    if(ended(f.job)){errs.push(`bash: kill: ${w0}: no such job`);continue}
    hit(f.job)}
  /* the job killed itself: end its slice now (jobs.js slice() records it) */
  if(self)throw Object.assign(new Error('killed by '+sig.name),{stop:true,jobSig:{num:sig.num,desc:descOf(sig.num)}});
  return fromList(errs.map(errL).concat(bg),any?0:1,bg)};

/* ---------- trap (Task 14; see TRAPS in the header) ---------- */
const S=SQ.S,CTX=SQ.CTX;
const TRAP_USAGE='trap: usage: trap [-lp] [[arg] signal_spec ...]';
const TRAP_STEPS=1000,TRAP_CHARS=100000; /* the allowance of a handler that runs after an abort (and of a job's EXIT handler) */
const PSEUDO=['EXIT','DEBUG','ERR','RETURN'];
const ORDER=k=>k==='EXIT'?0:k==='DEBUG'?65:k==='ERR'?66:k==='RETURN'?67:SIGNUM[k];
const shownName=k=>PSEUDO.includes(k)?k:'SIG'+k;
const LABEL={EXIT:'exit trap',ERR:'error trap',DEBUG:'debug trap'};
/* a trap key from a spec: EXIT DEBUG ERR RETURN (any case, never with SIG), a signal name (any case, SIG optional) or number; 0 is EXIT. null if invalid */
function trapKey(spec){spec=String(spec);
  if(/^\d+$/.test(spec)){const n=+spec;return n===0?'EXIT':n<=64&&SIGNAME[n]!==undefined?SIGNAME[n]:null}
  let u=spec.toUpperCase();if(PSEUDO.includes(u))return u;
  if(u.startsWith('SIG')&&u.length>3)u=u.slice(3);
  return SIGNUM[u]!==undefined&&u!=='EXIT'?u:null}
const sq1=t=>"'"+t.replace(/'/g,"'\\''")+"'";
/* the traps a new process starts with: only the ignored real signals ('' handlers). show: a subshell, $( ), pipeline stage or job also
   shows (trap -p) the parent's until it changes one (bash); lock: a script cannot trap or reset a signal ignored on entry (non-interactive bash) */
function childTraps(p,show,lock){if(!p)return null;const m=new Map();
  for(const [k,v] of p)if(v===''&&!PSEUDO.includes(k))m.set(k,'');
  const disp=p.shown||p;if(show&&disp.size)m.shown=new Map(disp);
  if(lock&&m.size)m.locked=new Set(m.keys());
  return m.size||m.shown?m:null}
const inFunction=()=>{const f=SQ.rt.frames;for(let i=f.length-1;i>=0;i--){if(f[i].kind==='function')return true;if(f[i].kind==='script')return false}return false};
/* run handler text in the current shell: $? = status while it runs and is put back afterwards (keep: an EXIT handler, the shell is ending).
   budget: it runs after an abort (or at a job's end), with its own TRAP_STEPS steps and output room; a cap inside it prints its message.
   A syntax error prints `bash: exit trap: line N: ...` (bash adds a second line quoting the text). -> {out, ctl} (ctl: an exit inside it) */
function runHandler(text,key,status,o){o=o||{};const rt=SQ.rt,node=rt.scopeNode,label=LABEL[key]||'trap';
  let prog;try{prog=SQ.parseCached(text)}catch(e){if(e&&e.stop)throw e;
    const m=e&&e.at!==undefined?`bash: ${label}: line ${SQ.lineOf(text,e.at)}: ${e.message}`:e&&!e.raw&&!SQ.isOverflow(e)?`bash: ${label}: line ${SQ.lineOf(text,text.length)}: ${e.message}`:SQ.errOf(e);
    return {out:[errL(m)],ctl:null}}
  const saved=S.last,xb=rt.xbase;S.last=status;node.inTrap=(node.inTrap||0)+1;
  if(key!=='EXIT')rt.xbase=(rt.xbase||0)-1; /* set -x: bash traces a signal, ERR or DEBUG handler one level deeper (++), an EXIT handler at +. */
  let budget=null,r;
  if(o.budget){budget={steps:rt.steps,chars:rt.outChars};rt.steps=LIM.STEPS-TRAP_STEPS;if(rt.outChars>LIM.TOTAL-TRAP_CHARS)rt.outChars=LIM.TOTAL-TRAP_CHARS}
  try{r=SQ.runProgram(prog,{depth:CTX.depth,tty:!!o.tty,record:false,stdin:null,loops:0})}
  catch(e){if(!budget||(e&&(e.tmo!==undefined||e.jobSig)))throw e;let m=SQ.fatalText(e);
    if(rt.slice)m=m.replace(/^this practice shell stopped the command/,'this practice shell stopped the job'); /* a job's handler, like jobs.js stopText */
    r={out:CTX.pend.splice(0).concat(errL(m)),code:1}}
  finally{rt.xbase=xb;node.inTrap--;if(budget){rt.steps=budget.steps;rt.outChars=budget.chars}}
  const ctl=r.ctl&&r.ctl.type==='exit'?r.ctl:null;
  if(!o.keep)S.last=saved;
  return {out:r.out,ctl}}
/* the current process's EXIT trap, run once (it is removed first): null when none, else {out, code} (code: the handler's exit n, else status) */
function exitTrap(status,o){const n=SQ.rt.scopeNode,t=n.traps;if(!t||!t.has('EXIT'))return null;
  const h=t.get('EXIT');t.delete('EXIT');if(h==='')return null;
  const rt=SQ.rt;(rt.exitFired=rt.exitFired||[]).push(h); /* the handlers that ran this typed line (a mission check asks whether one really fired); execLine empties it */
  const r=runHandler(h,'EXIT',status,Object.assign({keep:true},o));
  return {out:r.out,code:r.ctl?r.ctl.n:status}}
/* error e (a cap, a timeout, ...) is ending the current process: for a timeout its signal's handler first (TERM by default; KILL runs nothing), then
   the EXIT trap, each with the small allowance; their output rides on e.after (printed after the abort message). Returns e. */
function abortTrap(e,o){const t=SQ.rt.scopeNode.traps;if(!t||!e||e.jobSig)return e;const outs=[];let kill=false;
  if(e.tmo!==undefined){const d=SQ.rt.deadlines,s=(d.sigs&&d.sigs[e.tmo])||{num:15,name:'TERM'};
    if(s.num===9)kill=true;else{const h=t.get(s.name);if(h)outs.push(...runHandler(h,s.name,S.last,Object.assign({budget:true},o)).out)}}
  if(!kill){const x=exitTrap(S.last,Object.assign({budget:true},o));if(x)outs.push(...x.out)}
  if(outs.length)e.after=(e.after||[]).concat(outs);
  return e}
/* a command boundary of the current process: run the handlers of the signals queued for it, in order. -> null | {out, ctl?}; ctl: a handler
   ran exit, or a queued signal with no trap ends the shell ({type:'exit', n:128+N, abort:true, sig:N}; the interactive shell never ends) */
function sigBoundary(tty){const rt=SQ.rt,n=rt.scopeNode;if(!n.sig||!n.sig.length||n.inTrap)return null;
  const out=[];
  while(n.sig.length){const num=n.sig.shift();rt.sigPend--;const name=SIGNAME[num],h=n.traps?n.traps.get(name):undefined;
    if(h!==undefined&&!UNCATCHABLE(num)){if(h==='')continue;const r=runHandler(h,name,S.last,{tty});out.push(...r.out);if(r.ctl)return {out,ctl:r.ctl};continue}
    if(n.id!==0&&(num===9||action(num)==='term'))return {out,ctl:{type:'exit',n:128+num,abort:true,sig:num}}}
  return {out}}
/* ERR (where set -e would exit; not inside a function body: no set -E) and DEBUG (before a simple command, not inside a function: no set -T) */
function errTrap(code,tty){const n=SQ.rt.scopeNode,h=n.traps&&n.traps.get('ERR');if(!h||n.inTrap||inFunction())return null;return runHandler(h,'ERR',code,{tty})}
function debugTrap(tty){const n=SQ.rt.scopeNode,h=n.traps&&n.traps.get('DEBUG');if(!h||n.inTrap||inFunction())return null;return runHandler(h,'DEBUG',S.last,{tty})}
/* drop what is still queued for a process that ends */
function sigDrop(n){if(n.sig&&n.sig.length){SQ.rt.sigPend-=n.sig.length;n.sig=null}n.dead=true}

CMDS.trap=function(a,io){let i=0,list=false,print=false;
  for(;i<a.length;i++){const x=a[i];if(x==='--'){i++;break}if(x[0]!=='-'||x.length<2)break;
    for(const c of x.slice(1)){if(c==='l')list=true;else if(c==='p')print=true;else return {out:'',err:[`bash: trap: -${c}: invalid option`,TRAP_USAGE],code:2}}}
  const args=a.slice(i),rt=SQ.rt,node=rt.scopeNode;
  if(list)return fromList([outL(sigTable())],0);
  if(print||!args.length){const t=node.traps,disp=t?(t.shown||t):null,line=k=>outL(`trap -- ${sq1(disp.get(k))} ${shownName(k)}`);
    if(!args.length)return fromList(disp?[...disp.keys()].sort((x,y)=>ORDER(x)-ORDER(y)).map(line):[],0);
    const L=[];let code=0;
    for(const w of args){const k=trapKey(w);if(k===null){L.push(errL(`bash: trap: ${w}: invalid signal specification`));code=1;continue}if(disp&&disp.has(k))L.push(line(k))}
    return fromList(L,code)}
  let act=args[0],specs=args.slice(1),op;
  if(!specs.length){if(trapKey(act)===null)return {out:'',err:[TRAP_USAGE],code:2};op='reset';specs=[act]}
  else if(act==='-'||(/^\d+$/.test(act)&&trapKey(act)!==null))op='reset'; /* trap - SIG..., and bash's trap N SIG... */
  else op=act===''?'ignore':'set';
  const L=[];let code=0;
  for(const w of specs){const k=trapKey(w);
    if(k===null){L.push(errL(`bash: trap: ${w}: invalid signal specification`));code=1;continue}
    if(k==='RETURN'&&op!=='reset'){L.push(errL('this practice shell does not support trap RETURN yet'));code=2;continue}
    let m=node.traps;if(!m)m=node.traps=new Map();delete m.shown;
    if(m.locked&&m.locked.has(k))continue; /* ignored when this script started: bash silently keeps it ignored */
    if(op==='reset')m.delete(k);else m.set(k,op==='ignore'?'':act)}
  if(node.traps&&!node.traps.size&&!node.traps.shown)node.traps=null; /* none left: the interpreter's checks stay O(1) */
  return fromList(L,code)};
Object.defineProperty(SQ.rt,'traps',{configurable:true,get(){return SQ.rt.scopeNode.traps||null}});

Object.assign(SQ,{childTraps,exitTrap,abortTrap,sigBoundary,errTrap,debugTrap,sigDrop,TRAP_STEPS,signal,signalShell,sigOf,sigName:n=>SIGNAME[n],sigDesc:descOf,flushNotices,waitReady,waitDone,jobTable:tableOf});
})(window.SQ = window.SQ || {});
