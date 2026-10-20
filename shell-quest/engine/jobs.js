(function (SQ) {
/* Background jobs: `&`, the job table, the generator interpreter and the scheduler (Stage 3 Task 12a).

   Time is virtual (procs.js). A job never runs on a real timer: it runs lazily, when the clock moves (the 1-second cost of a typed line, a
   foreground `sleep`, Task 12b's `wait`), through SQ.tick, which is pushed onto SQ.onAdvance below. All of this is runtime state on SQ.rt
   (reset by SQ.resetProcs, swapped out by SQ.sandbox through procsSave/procsLoad); nothing is ever saved.

   SQ.rt.jobs      Job[] in spawn order. Job = {
                     id        job number [N]: 1 + the highest number among the records of the same owner (so once every record is reaped the next job is [1])
                     pid       from SQ.newPid() (1235, 1236, ...; never repeats in a session)
                     cmd       the source text of the and-or list, without the `&` ('sleep 30')
                     node      the AST (andor node) it runs
                     state     'Running' | 'Done' | 'Terminated' | 'Stopped' (kill -STOP/-TSTP/-TTIN/-TTOU; kill -CONT resumes it: cmds-proc.js)
                     code      exit status once it ended (null while live); 143 when this shell stopped it (step cap, output cap, ...); 128+N when signal N ended it
                     desc      what `jobs` and the notice print for a Terminated job: strsignal's text ('Killed', 'Hangup', ...); unset means 'Terminated'
                     cur       the order in which jobs became current (spawn, stop): the highest is `+` (%%), the next `-` (%-)
                     endSeq    the order jobs ended in (wait -n); waited: a wait already returned its status; told: jobs/a notice showed its state
                     stopSig   the signal that stopped it (wait %N on a stopped job returns 128 + it)
                     waitReq   set while the job is blocked in `wait` (cmds-proc.js waitReady decides when it may go on; wake is Infinity meanwhile)
                     wake      virtual time of its next slice (Infinity for `sleep infinity`; null once ended)
                     gen       the generator SQ.gen.run made for it (null once ended)
                     cwd oldpwd vars exp fns unsetB last frames baseArgs   its own shell state (copied from the shell at spawn, like a subshell)
                     owner     the process scope that started it: 0 = the interactive shell; a subshell, $( ), pipeline stage or script has its own
                               (SQ.rt.scope, set by snapshotShell in interp.js). Only scope-0 jobs print `[N] PID` and get Done notices.
                     scope     the scope its commands currently run in (the jobs it starts belong to it)
                     ppid      the pid of the job that started it, else the shell (1234)
                     ownerNode, scopeNode   the scope tree nodes behind owner and scope
                     topNode   the job's own process node (scopeNode at spawn): its traps (Task 14, cmds-proc.js TRAPS) and its queued signals (topNode.sig)
                     seq       spawn order (ties between equal wake time and job number); debt, d, depth, out, lineNo, lineSteps: scheduler bookkeeping
                     waitIntr  128+N once a trapped signal N interrupted the job's `wait` (gWait returns it), else 0 }
   SQ.rt.notices   the scope-0 jobs that ended or stopped and whose `[N]+  Done ...` notice has not been shown yet. A finished scope-0 job keeps
                   its record in SQ.rt.jobs until then: exec.js prints the queue (SQ.flushNotices, cmds-proc.js) at the end of each outermost typed
                   line, never inside $( ), and drops the ended records (`jobs` showing an ended job does the same). A job of any other scope (script,
                   subshell, $( ), another job) is non-interactive: its record goes as soon as it ends, with no notice (bash -c does the same).
                   Either way the status stays in SQ.rt.reaped ({pid, owner, code}) for `wait PID`; Task 17 adds {id, cmd, state, desc, line: the
                   SQ.rt.lineNo it was cleared in} so a mission check (ctx.jobs) still sees a job the line ended, e.g. `sleep 100 & kill %1`.
   SQ.spawn(node, env, src) -> Job
                   starts node in the background: at most 16 live jobs and SQ.newPid's 200 processes per session, else it throws an Error with
                   e.fork and the message `bash: fork: retry: Resource temporarily unavailable`. Adds a process record (ps lists it; it goes when
                   the job ends). The job's first slice runs at the next tick, not now.
   SQ.spawnItem(andor, env) -> {out, code}
                   the list item `cmd &` (runList here and in interp.js): spawns, $? = 0, and returns the `[N] PID` notice (cls 'sys', stderr in
                   bash) only for a typed line in the interactive shell (scope 0): bash prints no notice in a script, subshell or $( ).
                   A fork failure prints the message, status 1, and the line goes on.
   SQ.gen.run(node, ctx) -> Generator<{wake}, number>
                   the job interpreter: lists, &&/||, `!`, if, while, until, for, case, { } groups, ( ) subshells and function calls are walked
                   here; every simple command, every multi-stage pipeline and every compound with redirects runs through interp.js's normal
                   runPipeline as one synchronous unit. A function call is handed back by runPipeline (env.defer, r.defer) so its body is walked
                   here too, with interp.js's frame code (fnEnter/fnLeave/fnResult). ctx is an interpreter env plus ctx.job.
                   `sleep`: inside a slice SQ.advance does not move the clock; it records what the job owes (job.debt) and, right after that
                   unit, the generator yields {wake: clock + debt}. So a plain `sleep N` yields N; a sleep hidden in a pipeline, $( ), redirected
                   compound, `timeout`, sourced file or script (which run synchronously) is paid when that unit ends (its output comes earlier).
   SQ.tick(until, {inclusive}?) -> Out[]
                   runs every Running job whose wake is before `until` (at or before with inclusive: for Task 12b's `wait`), earliest wake first,
                   then lowest job number, then spawn order, re-reading the table after each slice (jobs a job starts take part). The clock is
                   set to each job's wake as it goes. Each slice swaps the job's shell state in (setShellState: S fields, the frame stack, the base
                   frame's positional parameters, CTX.pend/depth/lastSub, deadlines, scope, interpreter depth counters) and the caller's back,
                   whatever the caller was doing (a sleep inside a function, a pipeline stage, a script). Returns the job's Out[] marked bg:true:
                   it goes to the screen at that point of the current line even when the foreground command's stdout is redirected (interp.js
                   asCmd/runPipeline pass bg items through; a $( ) does not capture them; runScript counts them as the script's own output,
                   as a job inherits the script's stdout). Called from the typed line's 1-second cost, a tick runs jobs due before the line's
                   end: `(sleep 2; echo hi) &` at clock 0 shows `hi` after the second following line. A job's file writes happen during its
                   slice, i.e. at its virtual time.

   Caps. Job slices count SQ.step()s per typed line, never against the foreground's budget (so background work never stops the foreground
   command), with two limits that are never refunded: each job may take LIM.STEPS per typed line (Job.lineSteps, reset when SQ.rt.lineNo
   changes, i.e. when an outermost line starts), and all jobs together SQ.JOB_WORK = 3 x LIM.STEPS per typed line (SQ.rt.jobWork, reset by
   exec.js and swapped by SQ.sandbox). A slice may run min(both remainders) steps. The job whose slice crosses a limit is stopped with
   `this practice shell stopped the job: too many steps` (state Terminated, status 143; its output counter is refunded so the line goes on).
   CHOICE: once SQ.rt.jobWork is spent, tick runs nothing more in this line: the other due jobs are left due (not stopped) and run, late,
   at the next line's ticks, so an honest long job survives a busy line and the line's total job work stays bounded (a one-line spawner of
   runaway jobs costs at most 3 x LIM.STEPS per typed line). A sync unit cannot be paused, so the job that happens to cross the shared
   limit is stopped even if it is honest. Task 12b's `wait`: when tick returns with jobs still due before the target and SQ.rt.jobWork
   >= SQ.JOB_WORK, stop the wait (a step message) instead of looping. A job only yields when it owes time, so
   `while :; do :; done &` and `while :; do sleep 0; done &` run into the cap in one slice; every slice that yields moves its job's wake
   forward (time resolution 1 ms), which keeps a tick finite. `f() { f & }; f` and `:(){ :|:& };:` run into the 16-job and 200-process caps
   (`bash: fork: retry: ...`, printed by the job that tried); the shell stays usable, but the session's 200 processes are spent until
   "Reset world" (procs.js).

   Known limitations (also in the spec's as-built list): a $( ) does not wait for the stdout of a job started inside it
   (x=$( (sleep 1; echo cap) & echo got ) gives got); a sleep inside a unit that runs in one go is paid after the unit; job output that comes
   due during a foreground $( ) travels with that command's stderr (err class); during xargs/find -exec sleep it is lost (runArgv keeps r.out
   only); after the 200-process cap a surviving spawner prints up to LIM.LINES fork errors per line until it ends.

   Scopes: SQ.rt.scopeNode = {id, up} is the current process scope (interp.js snapshotShell/restoreShell; id mirrored in SQ.rt.scope).
   Job output is tagged {bg:true, owner: the owner's scope node}; runScript keeps as its own output only items whose owner is the script's
   scope or below it, and passes the rest up as r.bg (interactive jobs' output reaches the screen, not the script's redirect).

   Extension points for later tasks:
   - 12b (done, cmds-proc.js): `jobs`/`wait`/`kill`, notices, $! (SQ.rt.bang: the newest job's pid, part of the per-shell state swapped by
     copyShell/snapshotShell/restoreShell/shellState in interp.js). SQ.endJob(job, 'Terminated', 128+n, desc) ends a live job from outside: it runs
     the generator's pending finally blocks with the job's state swapped in (function frames, subshell snapshots) and records the end. A job that
     signals itself is ended by a thrown {jobSig} that slice() catches. `wait` inside a job comes back from runPipeline as r.defer = {wait: req}
     and gWait yields {wait: req} until the jobs it waits for end; tick skips a job while its waitReq is not ready.
   - 13 (done) `set -e`/`-x`/pipefail/-u: the job's options are part of its shell state (J.opts, copied at spawn); gAndOr asks SQ.errexit like
     runAndOr, conditions and ! run SQ.quiet, G.for traces each pass; everything else (pipefail, traces of simple commands, set -u) is in the
     shared units (runPipeline, runCmd, caseArm, expansion).
   - 14 (done) `trap`/signals: a trapped signal is queued on J.topNode and delivered at the job's next command boundary (gAndOr after each
     pipeline: interp.js sigAt); it interrupts a blocked wait (waitIntr). endJob(J, state, code, desc, noTrap) runs the job's EXIT trap
     (not for KILL) inside inSlice with its own allowance (SQ.TRAP_STEPS), after the unwinding, whichever way the job ended (its end, exit,
     kill, the step-cap stop: the message first); a Done job's handler may change its status with exit n. Its output goes to J.out (slice()
     returns it; kill collects it with SQ.jobOut). A ( ) inside a job runs its own EXIT trap at its end, also when the job is killed inside it.
   - 16 process substitution: runs synchronously inside a unit. The /dev/fd tables (fs.js fdTable) are part of a job's shell state: a job starts
     with its parent's (it can read the /dev/fd files of the command that started it), a for list or case word the generator expands itself gets a
     table dropped when that compound ends, and a deferred function call keeps its command's table while the body runs (fdKeep).
   - 17 mission ctx.jobs/clock: read SQ.rt.jobs / SQ.rt.clock.
*/
const S=SQ.S,{CTX,fatalText}=SQ;
const MAX_JOBS=16;
const errL=text=>({text,cls:'err'});
const ms=t=>Math.round(t*1000)/1000;
const isLive=j=>j.state==='Running'||j.state==='Stopped';
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);

/* ---------- the generator interpreter (mirrors runList/runAndOr/runIf/... in interp.js, which hold the shared helpers) ---------- */
const emit=(env,o)=>{if(o&&o.length)env.job.out.push(...o)};
/* after a synchronous unit: yield the time the job owes (a sleep inside it) */
function* pay(env){const J=env.job;if(J.debt>0){const wake=ms(SQ.rt.clock+J.debt);J.debt=0;yield {wake}}}
const plain=R=>!R||(!R.out&&!R.inp&&!R.err&&!R.doc&&!R.herestr);

function* gList(list,env){let code=0;
  for(const it of list.items){
    if(it.sep==='&'){const r=spawnItem(it.andor,env);emit(env,r.out);code=r.code;continue}
    const r=yield* gAndOr(it.andor,env);code=r.code;if(r.ctl)return r}
  return {code}}
/* set -e as in interp.js runAndOr: every pipeline but the last runs quiet, the list's status is checked when its last pipeline ran (SQ.errexit) */
/* Task 14: the command boundary after each pipeline delivers the job's queued signals (interp.js sigAt), and failAt runs the ERR trap */
const gSig=env=>{const o=[],c=SQ.sigAt(env,o);emit(env,o);return c};
function* gAndOr(n,env){const k=n.rest.length,q=k?SQ.quiet(env):env;let r=yield* gPipe(n.first,q),c;if(r.ctl)return r;let code=r.code,ran=!k;
  if(SQ.rt.sigPend&&(c=gSig(env)))return {code,ctl:c};
  for(let i=0;i<k;i++){const it=n.rest[i];if(it.op==='&&'&&code!==0)continue;if(it.op==='||'&&code===0)continue;
    const fin=i===k-1;r=yield* gPipe(it.pipe,fin?env:q);code=r.code;ran=fin;if(r.ctl)return r;
    if(SQ.rt.sigPend&&(c=gSig(env)))return {code,ctl:c}}
  if(ran&&code!==0){const o=[],x=SQ.failAt(code,k?n.rest[k-1].pipe:n.first,env,o);emit(env,o);if(x)return {code,ctl:x}}
  return {code}}
/* one pipeline: a lone unredirected compound is walked here; anything else is one runPipeline unit (a lone function call comes back deferred) */
function* gPipe(Pn,env){const c=Pn.cmds[0];let r;
  if(Pn.cmds.length===1&&own(G,c.type)&&plain(c.redirs)){SQ.nestIn();try{r=yield* G[c.type](c,Pn.negate?SQ.quiet(env):env)}finally{SQ.nestOut()}} /* set -e is ignored under ! */
  else{const p=SQ.runPipeline(Pn,Object.assign({},env,{defer:true}));emit(env,p.out);
    if(!p.defer){yield* pay(env);return {code:p.code,ctl:p.ctl}}
    const rt=SQ.rt,fd=[rt.fdTab,rt.fdOwn];if(p.defer.fdTab){rt.fdTab=p.defer.fdTab;rt.fdOwn=false} /* the call's <( ) files live while its body runs */
    try{r=p.defer.wait?yield* gWait(p.defer.wait,env):yield* gCall(p.defer.name,p.defer.args,Pn.negate?SQ.quiet(env):env)}finally{rt.fdTab=fd[0];rt.fdOwn=fd[1]}}
  if(Pn.negate)r={code:r.code===0?1:0,ctl:r.ctl};
  S.last=r.code;return r}
/* `wait` in a job (cmds-proc.js): yield until the jobs it waits for have ended; tick resumes this job once SQ.waitReady says so */
function* gWait(req,env){let r;const J=env.job;
  while(!(r=SQ.waitReady(req))){yield {wait:req};if(J.waitIntr){const c=J.waitIntr;J.waitIntr=0;return {code:c}}} /* a trapped signal interrupted it (cmds-proc.js signal) */
  return {code:SQ.waitDone(req,r)}}
function* gCall(name,args,env){const fe=SQ.fnEnter(name,args);
  if(fe.fail){emit(env,fe.fail.list);return {code:fe.fail.code}}
  let r;try{r=yield* gList(fe.prog,env)}finally{SQ.fnLeave(fe)} /* break/continue in the body reach the caller's loop, as in callFunction */
  return SQ.fnResult(r)}
/* a loop body's or condition's ctl, as in interp.js runWhile/runFor: 'next', 'stop' or a ctl to pass outward */
function* gLoop(c,env){const inner=Object.assign({},env,{loops:env.loops+1}),q=SQ.quiet(inner);let code=0,p;
  for(;;){SQ.step();
    const cr=yield* gList(c.cond,q);
    if(cr.ctl){p=SQ.resolveCtl(cr.ctl,env.loops);if(p==='next')continue;if(p==='stop')break;return {code,ctl:p}}
    if(c.type==='while'?cr.code!==0:cr.code===0)break;
    const br=yield* gList(c.body,inner);code=br.code;
    if(br.ctl){p=SQ.resolveCtl(br.ctl,env.loops);if(p==='next')continue;if(p==='stop')break;return {code,ctl:p}}}
  return {code}}
const G={
  *if(c,env){
    const q=SQ.quiet(env); /* set -e is ignored in the conditions */
    for(const b of c.branches){const cr=yield* gList(b.cond,q);if(cr.ctl)return cr;if(cr.code!==0)continue;return yield* gList(b.body,env)}
    return c.else?yield* gList(c.else,env):{code:0}},
  while:gLoop,until:gLoop,
  *for(c,env){const rt=SQ.rt,fd=[rt.fdTab,rt.fdOwn];rt.fdOwn=false; /* the <( ) files of the list live until the loop ends */
    try{const out=[],fi=SQ.forItems(c,env,out);emit(env,out);if(fi.fail)return fi.fail;
    const inner=Object.assign({},env,{loops:env.loops+1});let code=0;
    for(const it of fi.items){SQ.step();SQ.setVar(c.var,it);if(SQ.rt.opts.x)emit(env,[SQ.forTrace(c)]);
      const br=yield* gList(c.body,inner);code=br.code;
      if(br.ctl){const p=SQ.resolveCtl(br.ctl,env.loops);if(p==='next')continue;if(p==='stop')break;return {code,ctl:p}}}
    return {code}}finally{rt.fdTab=fd[0];rt.fdOwn=fd[1]}},
  *case(c,env){const rt=SQ.rt,fd=[rt.fdTab,rt.fdOwn];rt.fdOwn=false;
    try{const out=[],ca=SQ.caseArm(c,env,out);emit(env,out);if(ca.fail)return ca.fail;return ca.arm?yield* gList(ca.arm.body,env):{code:0}}finally{rt.fdTab=fd[0];rt.fdOwn=fd[1]}},
  *group(c,env){return yield* gList(c.body,env)},
  /* ( ... ) inside a job: isolated like runSubshell (snapshotShell/restoreShell, also when the job is ended while suspended inside) */
  /* its EXIT trap runs at its end, also when the job is ended while suspended inside (g.return() runs the finally block) */
  *subshell(c,env){const sv=SQ.snapshotShell();let done=false;
    try{const r=yield* gList(c.body,Object.assign({},env,{loops:0}));done=true;let code=r.ctl&&r.ctl.type==='exit'?r.ctl.n:r.code;
      if(SQ.rt.scopeNode.traps){const x=SQ.exitTrap(code,{});if(x){emit(env,x.out);code=x.code}}
      return {code}}
    catch(e){done=true;if(SQ.rt.scopeNode.traps)SQ.abortTrap(e,{});throw e}
    finally{if(!done&&SQ.rt.scopeNode.traps){const x=SQ.exitTrap(S.last,{budget:true});if(x)emit(env,x.out)}SQ.restoreShell(sv)}}};
/* SQ.gen.run: the job's whole program; exit n ends it with n (also set -e's exit), a stray return/break/continue just ends it.
   Its EXIT trap runs in endJob, whichever way it ended. */
/* a job whose whole program is one unredirected ( list ): bash runs the async subshell as ONE process, so its body runs in the job's own node
   (traps set inside it are the job's: kill %1 finds them in J.topNode); anything around it ({ (...); x; } &) keeps the inner subshell */
function loneSub(node){if(node.type!=='andor'||node.rest.length)return null;const P=node.first;
  if(P.negate||P.cmds.length!==1)return null;const c=P.cmds[0];return c.type==='subshell'&&plain(c.redirs)?c:null}
function* run(node,ctx){let r;const ls=loneSub(node);
  if(ls)r=yield* gList(ls.body,ctx);
  else if(node.type==='list')r=yield* gList(node,ctx);
  else if(node.type==='andor')r=yield* gAndOr(node,ctx);
  else if(node.type==='pipeline')r=yield* gPipe(node,ctx);
  else r=yield* gPipe({type:'pipeline',negate:false,cmds:[node]},ctx);
  return r.ctl&&(r.ctl.type==='exit'||r.ctl.type==='return')?r.ctl.n:r.code}

/* ---------- spawning ---------- */
const forkErr=()=>Object.assign(new Error(SQ.FORK_MSG),{raw:true,code:1,fork:true});
function spawn(node,env,src){const rt=SQ.rt;env=env||{};
  if(rt.jobs.filter(isLive).length>=MAX_JOBS)throw forkErr();
  const pid=SQ.newPid(),ownerNode=rt.scopeNode,owner=ownerNode.id,start=SQ.now();
  const top={id:++rt.scopeSeq,up:ownerNode};if(ownerNode.traps)top.traps=SQ.childTraps(ownerNode.traps,true); /* a job keeps only the ignored signals */
  let id=1;for(const j of rt.jobs)if(j.owner===owner&&j.id>=id)id=j.id+1;
  const frames=rt.frames.map(f=>Object.assign({},f,{args:f.args.slice(),locals:f.locals&&new Map(f.locals)}));
  const cmd=String(src===undefined?node.src||'':src);
  const J=Object.assign(SQ.copyShell(),{id,pid,cmd,node,state:'Running',code:null,wake:start,gen:null,frames,baseArgs:SQ.BASE_FRAME.args.slice(),
    owner,ownerNode,scopeNode:top,topNode:top,scope:top.id,lineNo:0,lineSteps:0,ppid:rt.slice?rt.slice.pid:1234,seq:++rt.jobSeq,debt:0,d:[0,0,0],depth:env.depth||0,out:[],waitIntr:0,
    desc:null,endSeq:0,waited:false,told:false,stopSig:0,waitReq:null,fdTab:rt.fdTab,fdOwn:false});
  J.cur=J.seq; /* the newest job is the current one (%+) */
  J.gen=run(node,{depth:J.depth,tty:!!env.tty,record:false,stdin:null,loops:0,job:J});
  rt.jobs.push(J);rt.bang=pid; /* $! of the shell that started it (J itself keeps its parent's $!, copied above) */
  /* ps: a lone simple command shows as itself (sleep 30), anything else as the subshell running it (bash) */
  const one=node.type==='andor'&&!node.rest.length&&node.first.cmds.length===1&&node.first.cmds[0].type==='simple';
  rt.procs.push({pid,ppid:J.ppid,cmd:one?cmd:'bash',start,state:'S'});
  return J}
function spawnItem(n,env){let J;
  try{J=SQ.spawn(n,env,n.src)}catch(e){if(e&&e.fork){S.last=1;return {out:[errL(e.message)],code:1}}throw e}
  S.last=0;if(SQ.rt.scope!==0||SQ.rt.slice)return {out:[],code:0};
  const note={text:`[${J.id}] ${J.pid}`,cls:'sys'};if(SQ.rt.lineBg)SQ.rt.lineBg.push(note); /* already on screen: a line stopped later keeps it (exec.js) */
  return {out:[note],code:0}}

/* ---------- the scheduler ---------- */
/* noTrap: KILL (no EXIT trap). The EXIT handler runs with the job's state swapped in and its own allowance (SQ.TRAP_STEPS), at the time the job
   ends; its output goes to J.out (slice() and kill collect it: SQ.jobOut). A Done job's handler may change its status with exit n. */
function endJob(J,state,code,desc,noTrap){const rt=SQ.rt,g=J.gen;J.gen=null;
  try{inSlice(J,()=>{
    if(g){try{g.return()}catch(e){/* a finally block failed: the job ends anyway */}} /* a live job ended from outside (kill) */
    if(!noTrap&&rt.scopeNode.traps){const x=SQ.exitTrap(state==='Done'?code:S.last,{budget:true});if(x){J.out.push(...x.out);if(state==='Done')code=x.code}}})}
  catch(e){/* the job ends anyway */}
  SQ.sigDrop(J.topNode);
  J.state=state;J.code=code;J.gen=null;J.wake=null;J.waitReq=null;J.endSeq=++rt.endSeq;J.told=false;if(desc)J.desc=desc;
  const i=rt.procs.findIndex(p=>p.pid===J.pid);if(i>=0)rt.procs.splice(i,1);
  if(J.owner===0){if(!rt.notices.includes(J))rt.notices.push(J)}
  else reap(J)} /* a non-interactive shell's finished job leaves the table at once (no notice) */
/* drop an ended job's record; wait PID still finds its status in SQ.rt.reaped (bounded: pids never repeat and at most 200 exist per session) */
function reap(J){const rt=SQ.rt;let i=rt.jobs.indexOf(J);if(i>=0)rt.jobs.splice(i,1);i=rt.notices.indexOf(J);if(i>=0)rt.notices.splice(i,1);
  rt.reaped.push({pid:J.pid,owner:J.owner,code:J.code,id:J.id,cmd:J.cmd,state:J.state,desc:J.desc,line:rt.lineNo||0});if(rt.reaped.length>256)rt.reaped.shift()}
const stopText=e=>e&&e.stop&&/^this practice shell stopped the command/.test(e.message)?e.message.replace('stopped the command','stopped the job'):fatalText(e);
/* run fn with J's state swapped in, and the caller's back afterwards (also when fn throws) */
function inSlice(J,fn){const rt=SQ.rt,B=SQ.BASE_FRAME;
  const fg={sh:SQ.shellState(),pend:CTX.pend,depth:CTX.depth,lastSub:CTX.lastSub,deadlines:rt.deadlines,scopeNode:rt.scopeNode,d:SQ.depths(),args:B.args,slice:rt.slice,xbase:rt.xbase};
  rt.xbase=CTX.sub; /* set -x: the job's own trace starts at one + even when the slice runs inside a $( ) (interp.js xline) */
  SQ.setShellState(J);CTX.pend=[];CTX.depth=J.depth;CTX.lastSub=null;rt.deadlines=[];rt.scopeNode=J.scopeNode;rt.scope=J.scopeNode.id;B.args=J.baseArgs;
  SQ.setDepths(fg.d.map((x,i)=>x+J.d[i]));rt.slice=J; /* the counters go on from the caller's: the slice runs on top of the caller's JS stack */
  try{return fn()}
  finally{Object.assign(J,SQ.shellState());J.scopeNode=rt.scopeNode;J.scope=rt.scope;J.baseArgs=B.args;J.d=SQ.depths().map((x,i)=>x-fg.d[i]);J.debt=0;
    if(CTX.pend.length)J.out.push(...CTX.pend);
    rt.slice=fg.slice;SQ.setShellState(fg.sh);CTX.pend=fg.pend;CTX.depth=fg.depth;CTX.lastSub=fg.lastSub;rt.deadlines=fg.deadlines;rt.scopeNode=fg.scopeNode;rt.scope=fg.scopeNode.id;
    B.args=fg.args;SQ.setDepths(fg.d);rt.xbase=fg.xbase}}
/* one slice of J: resume its generator until it yields or ends; returns its Out[] marked bg */
/* step budgets (see the header): the slice may take min(the job's own allowance left this line, the line's job work left) steps; SQ.step()
   counts up to LIM.STEPS, so rt.steps starts at LIM.STEPS - allowance. What it used is charged to both and never refunded. */
const LIM=SQ.LIM,JOB_WORK=3*LIM.STEPS;
function allowance(J){const rt=SQ.rt;if(J.lineNo!==rt.lineNo){J.lineNo=rt.lineNo;J.lineSteps=0}
  return Math.min(LIM.STEPS-J.lineSteps,JOB_WORK-(rt.jobWork||0))}
function slice(J){const rt=SQ.rt,fgSteps=rt.steps,chars=rt.outChars,allow=allowance(J),start=LIM.STEPS-allow;let res,err=null;
  rt.steps=start; /* never the foreground's budget */
  try{res=inSlice(J,()=>J.gen.next())}catch(e){err=e}
  finally{const used=Math.min(allow,Math.max(0,rt.steps-start));J.lineSteps+=used;rt.jobWork=(rt.jobWork||0)+used;rt.steps=fgSteps}
  if(err||res.done)J.gen=null; /* finished: nothing left to unwind */
  if(err&&err.jobSig){const s=err.jobSig;endJob(J,'Terminated',128+s.num,s.desc,s.num===9)} /* it signalled itself (kill): no message, like bash */
  else if(err){J.out.push(errL(stopText(err)),...(err.after||[]));rt.outChars=chars;endJob(J,'Terminated',143)} /* the message, then any EXIT handlers */
  else if(res.done)endJob(J,'Done',res.value);
  else if(res.value.wait){J.waitReq=res.value.wait;J.wake=Infinity} /* blocked in wait: tick resumes it once its jobs have ended */
  else J.wake=res.value.wake;
  const out=J.out;J.out=[];
  const tagged=out.map(o=>Object.assign({},o,{bg:true,owner:J.ownerNode}));
  if(rt.lineBg)rt.lineBg.push(...tagged);
  return tagged}
function tick(until,o){const rt=SQ.rt;if(rt.slice||rt.ticking)return [];
  const incl=!!(o&&o.inclusive),out=[];rt.ticking=true;
  try{for(;;){let J=null;
      if((rt.jobWork||0)>=JOB_WORK)break; /* this line's job work is spent: the due jobs wait for the next line */
      for(const j of rt.jobs){if(j.state!=='Running')continue;
        if(j.waitReq){if(!SQ.waitReady(j.waitReq))continue;j.waitReq=null;j.wake=rt.clock} /* its wait is over: it goes on now */
        if((incl?j.wake<=until:j.wake<until)&&(!J||j.wake<J.wake||(j.wake===J.wake&&(j.id<J.id||(j.id===J.id&&j.seq<J.seq)))))J=j}
      if(!J)break;
      if(J.wake>rt.clock)rt.clock=J.wake;
      out.push(...slice(J))}}
  finally{rt.ticking=false}
  return out}
SQ.onAdvance.push(target=>tick(target));

/* the output J produced outside a slice (its EXIT handler when kill ended it), tagged like slice()'s */
function jobOut(J){if(!J.out||!J.out.length)return [];const o=J.out.splice(0).map(x=>Object.assign({},x,{bg:true,owner:J.ownerNode}));if(SQ.rt.lineBg)SQ.rt.lineBg.push(...o);return o}
Object.assign(SQ,{spawn,spawnItem,tick,endJob,reap,jobOut,gen:{run},MAX_JOBS,JOB_WORK});
})(window.SQ = window.SQ || {});
