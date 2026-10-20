(function (SQ) {
/* Virtual clock, process table, sleep, ps, timeout and the virtual date (Stage 3 Task 11).

   Time is virtual and deterministic: no Date.now(), Math.random or real timers. Runtime state lives on SQ.rt and is never saved
   (S is what gets saved; nothing here touches it). resetProcs() is called at load, by "Reset world" / progress reset (app.js), and
   SQ.sandbox runs its fn with a fresh copy (procsSave) and puts the old one back afterwards (procsLoad), also when fn throws.

   SQ.rt.clock     virtual seconds since the session started (a number, may hold fractions; kept to milliseconds). Starts at 0.
                   Each outermost typed line costs 1 second, added when the line ends (exec.js execLine; also after an error or a stopped
                   line; a $( ) does not cost a line of its own). `sleep N` costs N. Nothing else moves the clock: a busy loop under
                   `timeout` is stopped by the step cap, never by time.
   SQ.rt.procs     Proc[] = { pid, ppid, cmd, start, state: 'R'|'S'|'Z'|'T', exit? }; procs[0] is the shell itself (pid 1234, ppid PPID).
                   ps lists it, then every other record in pid order, then a row for the ps run. Task 12a adds a record per background job.
   SQ.newPid()     the next pid: 1235, 1236, ... Only `ps` runs (here) and background jobs (Task 12a) take one. At most MAX_PROCS (200)
                   are ever created per session (per world reset); the next call throws an Error with e.fork, e.raw, e.code 1 and the message
                   `bash: fork: retry: Resource temporarily unavailable` (errOf prints it as is). Callers catch it (ps prints it, status 1).
   SQ.advance(seconds, io) -> Out[]
                   moves the clock forward. Every function in SQ.onAdvance is called as fn(target, io) before the clock is set to target and
                   its returned Out[] ({text, cls}) are concatenated and returned. jobs.js pushes the scheduler (SQ.tick) onto SQ.onAdvance:
                   it runs due jobs in wake order, setting SQ.rt.clock to each wake time as it goes, and returns their output.
                   Under `timeout` the target is cut at the earliest active deadline (SQ.rt.deadlines); after moving the clock there, advance
                   throws a timeout signal {stop:true, tmo:index, out} that unwinds to the `timeout` that owns that deadline.
                   Inside a background job's slice (SQ.rt.slice, jobs.js) advance neither moves the clock nor runs onAdvance: it sets
                   slice.debt (time the job owes) and the job yields that much after the command. SQ.now() = clock + that debt; sleep, timeout
                   and date read it. A job's sleep is not capped by LIM.SLEEP (it only waits; `sleep infinity &` never wakes).
   $SECONDS        floor(clock); after SECONDS=N it counts on from N (SQ.rt.secAt, parse.js secondsNow). $$ and $BASHPID are always 1234 (jobs and subshells run inside
                   this one shell, so BASHPID never differs). $PPID is 1233 (the shell's parent, never listed by ps).

   Decisions:
   - EPOCH: the virtual clock 0 is Thu 2026-01-15 09:00:00 UTC (1768467600). `date` prints EPOCH + floor(clock) in UTC.
     `date` alone keeps the format the old wall-clock date printed: `Thu Jan 15 09:00:00 2026` (day zero-padded, no time zone), so the
     masked transcripts (corpus 1, Beginner golden) and `date | wc -w` = 5 keep matching. `date +FORMAT` supports
     %a %A %b %h %B %c %C %d %D %e %F %H %I %j %k %l %m %M %n %N %p %P %r %R %s %S %t %T %u %w %y %Y %z %Z %% and the flags - _ 0
     (no pad, space pad, zero pad); an unknown directive prints as written (GNU). -u/--utc/--universal are accepted (the clock is UTC).
     Other options print `this practice shell does not support date -X yet` (status 1); a non-option operand is `date: invalid date 'X'`.
   - sleep NUMBER[SUFFIX]...: decimal numbers with fractions and exponents (0.5, .5, 1e2), suffix s m h d, `inf`/`infinity`; several
     operands add up. A total over LIM.SLEEP (3600) stops the whole line at once with `this practice shell stopped the command: that sleep
     is too long` and the clock does not move, unless a `timeout` deadline falls within LIM.SLEEP (then the timeout fires as usual).
     GNU messages: `sleep: missing operand`, `sleep: invalid time interval 'X'`, `sleep: invalid option -- 'c'`, each followed by
     `Try 'sleep --help' for more information.`, status 1.
   - ps: `ps`, `ps -e`, `ps -A` (PID TTY TIME CMD), `ps -f`/`-ef` (UID PID PPID C STIME TTY TIME CMD), `ps aux` (USER PID %CPU %MEM VSZ RSS
     TTY STAT START TIME COMMAND), `ps ax` (PID TTY STAT TIME COMMAND); procps 3.3 column widths (PID in 5). Everything runs on pts/0;
     CPU time is always zero (00:00:00 / 0:00); START/STIME is the virtual HH:MM the process started; VSZ/RSS are fixed per command.
     Other options print `this practice shell does not support ps X yet` (status 1).
   - timeout [-v] [-s SIG] [-k D] [--preserve-status] [--foreground] DURATION COMMAND [ARG]...: COMMAND runs as an external command
     (a CMDS entry or a path); a function, a shell builtin (cd, export, read, ...) or an unknown name is
     `timeout: failed to run command 'X': No such file or directory`, status 127. A deadline clock+DURATION is pushed; a sleep that would
     pass the earliest deadline advances the clock exactly to it and the command is stopped: status 124 (137 for -s KILL, 128+N with
     --preserve-status), with -v printing `timeout: sending signal SIG to command 'X'`. Output the stopped command had produced is lost
     (as with the step cap). If COMMAND finishes first, its output and status are kept. DURATION 0 means no limit; -k is accepted and
     ignored (every command dies on the first signal). Usage errors are status 125. Nested timeouts: the earliest deadline wins, ties go
     to the outermost.
*/
const {LIM,CMDS,ok,E,own}=SQ;
const EPOCH=1768467600; /* Date.UTC(2026,0,15,9,0,0)/1000: Thu 2026-01-15 09:00:00 UTC */
const SHELL_PID=1234,FIRST_PID=1235,PPID=1233,MAX_PROCS=200;
const FORK_MSG='bash: fork: retry: Resource temporarily unavailable';
const ms=t=>Math.round(t*1000)/1000;
/* jobs, notices, jobSeq, scope, scopeSeq, scopeNode and slice belong to jobs.js (Task 12a); they live here so one reset / save / load covers them */
const fresh=()=>({secAt:undefined,clock:0,nextPid:FIRST_PID,forks:0,deadlines:[],procs:[{pid:SHELL_PID,ppid:PPID,cmd:'bash',start:0,state:'S'}],
  jobs:[],notices:[],jobSeq:0,scope:0,scopeSeq:0,scopeNode:{id:0,up:null},slice:null});
function resetProcs(){Object.assign(SQ.rt,fresh())}
/* sandbox support: procsSave() hands back the current state and installs a fresh one; procsLoad(saved) puts it back */
function procsSave(){const rt=SQ.rt,s={};for(const k of Object.keys(fresh()))s[k]=rt[k];resetProcs();return s}
function procsLoad(s){Object.assign(SQ.rt,s)}
/* the current virtual time: the clock, plus what the running job slice owes for synchronous sleeps (see advance) */
function now(){const rt=SQ.rt;return ms(rt.clock+(rt.slice?rt.slice.debt:0))}
function newPid(){const rt=SQ.rt;
  if(rt.forks>=MAX_PROCS)throw Object.assign(new Error(FORK_MSG),{raw:true,code:1,fork:true});
  rt.forks++;return rt.nextPid++}
const onAdvance=[];
/* the index of the earliest active deadline (the outermost on a tie), or -1 */
function earliest(){const d=SQ.rt.deadlines;let k=-1;for(let i=0;i<d.length;i++)if(k<0||d[i]<d[k])k=i;return k}
function advance(seconds,io){const rt=SQ.rt,base=now(),job=rt.slice;
  let target=ms(base+(seconds>0?seconds:0)),hit=-1;
  const k=earliest();if(k>=0&&rt.deadlines[k]<target){target=Math.max(base,rt.deadlines[k]);hit=k}
  const out=[];
  /* inside a background job's slice (jobs.js) the clock never moves: the job owes the time (debt) and yields it after the command */
  if(job)job.debt=ms(target-rt.clock);
  else{for(const fn of onAdvance){const o=fn(target,io||{});if(o&&o.length)out.push(...o)}
    if(rt.clock<target)rt.clock=target}
  if(hit>=0)throw Object.assign(new Error('this practice shell stopped the command: timed out'),{stop:true,tmo:hit,out});
  return out}

/* ---------- durations (sleep, timeout) ---------- */
const UNIT={'':1,s:1,m:60,h:3600,d:86400};
function dur(x){const m=/^(?:(\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?|(inf|infinity))([smhd]?)$/i.exec(x);if(!m)return NaN;
  if(m[2])return Infinity;const n=Number(x.slice(0,x.length-m[3].length));return Number.isFinite(n)?n*UNIT[m[3]]:Infinity}
const tryOf=c=>`Try '${c} --help' for more information.`;
const bad=(c,m,code)=>({out:'',err:[m,tryOf(c)],code});

CMDS.sleep=function(a,io){const ops=[];let opts=true;
  for(const x of a){
    if(opts&&x==='--'){opts=false;continue}
    if(opts&&x.length>1&&x[0]==='-'){ /* GNU reads -5 as an option */
      if(x==='--help'||x==='--version')return E(`this practice shell does not support sleep ${x} yet`,1);
      if(x.startsWith('--'))return bad('sleep',`sleep: unrecognized option '${x}'`,1);
      return bad('sleep',`sleep: invalid option -- '${x[1]}'`,1)}
    ops.push(x)}
  if(!ops.length)return bad('sleep','sleep: missing operand',1);
  let total=0;for(const x of ops){const n=dur(x);if(Number.isNaN(n))return bad('sleep',`sleep: invalid time interval '${x}'`,1);total+=n}
  const k=earliest(),cut=k>=0&&SQ.rt.deadlines[k]-now()<=LIM.SLEEP; /* a timeout fires first: no need to refuse */
  if(total>LIM.SLEEP&&!cut&&!SQ.rt.slice)throw new SQ.StepLimit('that sleep is too long'); /* a background job may sleep as long as it likes: it only waits */
  const outs=advance(total,io);const r=ok();if(outs.length){r.list=outs;r.bg=outs} /* output of jobs that ran meanwhile (bg: it reaches the screen even when sleep's output is redirected) */
  return r};

/* ---------- date ---------- */
const DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const pad=(n,w,c)=>String(n).padStart(w,c);
function strftime(fmt,clock){const t=EPOCH+Math.floor(clock),d=new Date(t*1000);
  const Y=d.getUTCFullYear(),mo=d.getUTCMonth(),D=d.getUTCDate(),H=d.getUTCHours(),Mi=d.getUTCMinutes(),Se=d.getUTCSeconds(),wd=d.getUTCDay();
  const yd=Math.floor((Date.UTC(Y,mo,D)-Date.UTC(Y,0,1))/86400000)+1,H12=H%12||12;
  const frac=pad(Math.round((clock-Math.floor(clock))*1000)*1000000,9,'0');
  /* directive -> [value, default pad width, default pad char] (width 0: text, never padded) */
  const V={a:[DAYS[wd].slice(0,3),0],A:[DAYS[wd],0],b:[MONTHS[mo].slice(0,3),0],h:[MONTHS[mo].slice(0,3),0],B:[MONTHS[mo],0],
    C:[Math.floor(Y/100),2,'0'],d:[D,2,'0'],e:[D,2,' '],H:[H,2,'0'],I:[H12,2,'0'],j:[yd,3,'0'],k:[H,2,' '],l:[H12,2,' '],m:[mo+1,2,'0'],
    M:[Mi,2,'0'],N:[frac,0],p:[H<12?'AM':'PM',0],P:[H<12?'am':'pm',0],s:[t,0],S:[Se,2,'0'],u:[wd||7,1,'0'],w:[wd,1,'0'],
    y:[Y%100,2,'0'],Y:[Y,0],z:['+0000',0],Z:['UTC',0],n:['\n',0],t:['\t',0],'%':['%',0]};
  const C={c:'%a %b %e %H:%M:%S %Y',D:'%m/%d/%y',F:'%Y-%m-%d',r:'%I:%M:%S %p',R:'%H:%M',T:'%H:%M:%S'};
  let o='';
  for(let i=0;i<fmt.length;i++){const c=fmt[i];if(c!=='%'||i===fmt.length-1){o+=c;continue}
    let j=i+1,flag='';if('-_0'.includes(fmt[j])&&j+1<fmt.length){flag=fmt[j];j++}
    const k=fmt[j];
    if(own(C,k)){o+=strftime(C[k],clock);i=j;continue}
    if(!own(V,k)){o+=fmt.slice(i,j+1);i=j;continue}
    const [v,w,pc]=V[k];o+=!w||flag==='-'?String(v):pad(v,w,flag==='_'?' ':flag==='0'?'0':pc);i=j}
  return o}
CMDS.date=function(a){let fmt=null;
  for(const x of a){
    if(x[0]==='+'){if(fmt!==null)return E(`date: extra operand '${x}'`,1);fmt=x.slice(1);continue}
    if(x==='-u'||x==='--utc'||x==='--universal')continue;
    if(x.length>1&&x[0]==='-')return E(`this practice shell does not support date ${x.split('=')[0]} yet`,1);
    return E(`date: invalid date '${x}'`,1)}
  return ok(strftime(fmt===null?'%a %b %d %H:%M:%S %Y':fmt,now()))};

/* ---------- ps ---------- */
const hhmm=p=>strftime('%H:%M',p.start);
const comm=p=>p.cmd.split(' ')[0].replace(/^.*\//,'');
const MEM={bash:['0.1',8960,5120],ps:['0.0',10072,3328]};
const mem=p=>MEM[comm(p)]||['0.0',5560,1920];
const stat=p=>p.pid===SHELL_PID?'Ss':p.self?'R+':p.state;
CMDS.ps=function(a){let full=false,user=false,bsd=false;
  for(const x of a){
    if(x[0]==='-'&&x.length>1&&x[1]!=='-'){for(const c of x.slice(1)){if(c==='f')full=true;else if(c!=='e'&&c!=='A')return E(`this practice shell does not support ps ${x} yet`,1)}continue}
    if(/^[aux]+$/.test(x)){bsd=true;if(x.includes('u'))user=true;continue}
    return E(`this practice shell does not support ps ${x} yet`,1)}
  let pid;try{pid=newPid()}catch(e){if(e&&e.fork)return E(FORK_MSG,1);throw e}
  const rows=SQ.rt.procs.slice().sort((x,y)=>x.pid-y.pid);
  rows.push({pid,ppid:SHELL_PID,cmd:['ps'].concat(a).join(' '),start:SQ.rt.clock,state:'R',self:true});
  const L=[];
  if(user){L.push('USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND');
    for(const p of rows){const [m,v,r]=mem(p);L.push(`${'explorer'.padEnd(8)} ${pad(p.pid,5,' ')}  0.0 ${pad(m,4,' ')} ${pad(v,6,' ')} ${pad(r,5,' ')} ${'pts/0'.padEnd(8)} ${stat(p).padEnd(4)} ${pad(hhmm(p),5,' ')}   0:00 ${p.cmd}`)}}
  else if(bsd){L.push('  PID TTY      STAT   TIME COMMAND');
    for(const p of rows)L.push(`${pad(p.pid,5,' ')} ${'pts/0'.padEnd(8)} ${stat(p).padEnd(4)}   0:00 ${p.cmd}`)}
  else if(full){L.push('UID        PID  PPID  C STIME TTY          TIME CMD');
    for(const p of rows)L.push(`${'explorer'.padEnd(8)} ${pad(p.pid,5,' ')} ${pad(p.ppid,5,' ')}  0 ${hhmm(p)} ${'pts/0'.padEnd(8)} 00:00:00 ${p.cmd}`)}
  else{L.push('  PID TTY          TIME CMD');
    for(const p of rows)L.push(`${pad(p.pid,5,' ')} ${'pts/0'.padEnd(8)} 00:00:00 ${comm(p)}`)}
  return ok(L.join('\n'))};

/* ---------- timeout ---------- */
const SIGS={HUP:1,INT:2,QUIT:3,KILL:9,USR1:10,USR2:12,ALRM:14,TERM:15,CONT:18,STOP:19};
function sigOf(v){if(/^\d+$/.test(v)){const n=+v;const k=Object.keys(SIGS).find(s=>SIGS[s]===n);return k?[k,n]:null}
  const k=v.toUpperCase().replace(/^SIG/,'');return own(SIGS,k)?[k,SIGS[k]]:null}
/* names a real `timeout` cannot run: shell builtins with no program of their own */
const SHELL_ONLY=new Set(['cd','export','unset','local','return','break','continue','source','.','alias','unalias','set','shift','eval','exit',
  'declare','typeset','readonly','trap','wait','jobs','fg','bg','disown','history','let','read','type','getopts','umask','hash','builtin','command','edit']);
CMDS.timeout=function(a,io){const T=m=>bad('timeout',m,125);
  let i=0,sig=['TERM',15],preserve=false,verbose=false;
  for(;i<a.length;i++){const x=a[i];if(x.length<2||x[0]!=='-')break;
    if(x==='--'){i++;break}
    if(x==='--preserve-status'){preserve=true;continue}
    if(x==='--foreground'){continue}
    if(x==='--verbose'){verbose=true;continue}
    if(x.startsWith('--signal=')||x.startsWith('--kill-after=')){const v=x.slice(x.indexOf('=')+1);
      if(x[2]==='s'){const s=sigOf(v);if(!s)return T(`timeout: ${v}: invalid signal`);sig=s}else if(Number.isNaN(dur(v)))return T(`timeout: invalid time interval '${v}'`);continue}
    if(x.startsWith('--'))return T(`timeout: unrecognized option '${x}'`);
    for(let j=1;j<x.length;j++){const c=x[j];
      if(c==='v'){verbose=true;continue}
      if(c==='s'||c==='k'){let v=x.slice(j+1);if(!v){if(i+1>=a.length)return T(`timeout: option requires an argument -- '${c}'`);v=a[++i]}
        if(c==='s'){const s=sigOf(v);if(!s)return T(`timeout: ${v}: invalid signal`);sig=s}
        else if(Number.isNaN(dur(v)))return T(`timeout: invalid time interval '${v}'`);
        break}
      return T(`timeout: invalid option -- '${c}'`)}}
  if(i+1>=a.length)return T('timeout: missing operand');
  const d=dur(a[i]);if(Number.isNaN(d))return T(`timeout: invalid time interval '${a[i]}'`);
  const name=a[i+1],args=a.slice(i+2);
  let run;
  if(name.includes('/'))run=()=>SQ.runPath(name,io,false,args);
  else if(own(CMDS,name)&&CMDS[name]&&!SHELL_ONLY.has(name)&&!SQ.hasFunction(name)&&!own(SQ.FRIENDLY,name))run=()=>CMDS[name](args,io);
  else return E(`timeout: failed to run command '${name}': No such file or directory`,127);
  if(!(d>0)||d===Infinity)return run();
  const rt=SQ.rt,idx=rt.deadlines.length;rt.deadlines.push(ms(now()+d));
  try{return run()}
  catch(e){if(!(e&&e.tmo===idx))throw e;
    const r={out:'',err:verbose?[`timeout: sending signal ${sig[0]} to command '${name}'`]:[],code:preserve?128+sig[1]:sig[1]===9?137:124};
    if(e.out&&e.out.length){r.list=e.out.concat(r.err.map(t=>({text:t,cls:'err'})));r.bg=e.out}
    return r}
  finally{rt.deadlines.length=idx}};

resetProcs();
Object.assign(SQ,{PPID,EPOCH,FORK_MSG,newPid,now,advance,onAdvance,resetProcs,procsSave,procsLoad,strftime});
})(window.SQ = window.SQ || {});
