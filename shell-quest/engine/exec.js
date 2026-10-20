(function (SQ) {
const S=SQ.S;
const {LIM,HOME,norm,getNode,bname,ok,E,globExpand,CTX,expandWords,CMDS,FRIENDLY,suggest,own,errOf,fatalText}=SQ;
/* ./FILE and bash FILE: SQ.runScript (interp.js) does the work; args are $1.., stdin comes from a pipe or < */
function runPath(name,io,force,args){return SQ.runScript(name,{args:args||[],depth:io.depth,tty:io.tty,force,stdinBox:io.stdinBox||null})}

/* assignment words (NAME=value text after expansion): [[name, value]], or an error result for a bad name */
function assignPairs(texts){const out=[];
  for(const t of texts){const k=t.slice(0,t.indexOf('='));if(SQ.badName(k))return E(`bash: \`${k}': not a valid identifier`,1);
    const v=t.slice(k.length+1);if(v.length>LIM.VAR)throw new SQ.StepLimit('a value grew too large');out.push([k,v])}
  return out}
const xAssign=(k,v)=>SQ.xline(k+'='+(v===''?'':SQ.xq(v))); /* set -x: `+ x=1`, `+ x='a b'`, `+ x=` */
const failExp=e=>{if(e&&e.stop)throw e;CTX.pend.length=0;const er=E(errOf(e),e.code||2);if(e&&e.abort)er.ctl={type:'exit',n:1,abort:true};return er};
/* runCmd(words, io, assigns): assigns = the prefix assignments of `X=1 cmd` (AST Simple.assigns). The words expand first (X=1 echo $X prints the old X),
   then the values; they are set and exported for this one command only (functions and scripts see them, read honours IFS) and put back afterwards.
   With no command left after expansion (X=1 $empty) they stay set, as an assignment-only command.
   set -x (Task 13): the trace lines ride on the result as r.xt (Out[], stderr), which runPipeline puts on the screen before the command's own output:
   the stderr of the $( )s in the words first, then `+ NAME=value` for each assignment (prefix ones too), then `+ cmd args` (expanded, quoted by SQ.xq). */
function runCmd(words,io,assigns){
  if(!words.length)return ok();
  SQ.step();
  const X=SQ.rt.opts.x;let ew,pre=null,bad=null,xt=null;
  CTX.lastSub=null;
  const all=!(assigns&&assigns.length)&&words.every(w=>/^[A-Za-z_]\w*=/.test(w.raw));
  try{if(all){ew=[]; /* a=1 b=$a: left to right, each value sees the ones before it */
      for(const w of words){const ts=expandWords([w],true);for(const t of ts)ew.push(t);const ps=assignPairs(ts.map(t=>t.v));if(!Array.isArray(ps)){bad=ps;break}for(const [k,v] of ps){if(X)(xt=xt||[]).push(...CTX.pend.splice(0),xAssign(k,v)); /* traced before it takes effect (PS4=x is shown with the old PS4) */
        S.vars[k]=v;if(k==='SECONDS')SQ.rt.secAt=SQ.rt.clock}}}
    else ew=expandWords(words,true);
    if(assigns&&assigns.length)pre=assigns.map(x=>SQ.expandOne(x.word))}
  catch(e){return failExp(e)}
  const pend=CTX.pend.splice(0).map(o=>o.text);
  if(pre){pre=assignPairs(pre);if(!Array.isArray(pre))return Object.assign(pre,{err:pend.concat(pre.err)});
    if(X)xt=pend.splice(0).map(t=>({text:t,cls:'err'})).concat(pre.map(([k,v])=>xAssign(k,v)))}
  if(all){const r=bad||ok();if(!bad&&CTX.lastSub!==null)r.code=CTX.lastSub;if(xt)r.xt=xt;return finishCmd(r,'(assign)',ew.slice(1).map(w=>w.v),false,io,pend)} /* each one was set above, left to right */
  if(!ew.length){if(pre){for(const [k,v] of pre)S.vars[k]=v;const r=Object.assign(ok(),{err:pend});if(CTX.lastSub!==null)r.code=CTX.lastSub;if(xt)r.xt=xt;return r}
    return Object.assign(ok(),{err:pend})}
  if(pre){const saved=pre.map(([k])=>[k,own(S.vars,k)?S.vars[k]:undefined,!!(S.exp&&own(S.exp,k))]);
    for(const [k,v] of pre){S.vars[k]=v;(S.exp=S.exp||{})[k]=1}
    try{return runCmd0(ew,io,pend,true,xt)} /* never deferred: the prefix assignments must hold while the function runs */
    finally{for(const [k,v,x] of saved){if(v===undefined)delete S.vars[k];else S.vars[k]=v;if(!x&&S.exp)delete S.exp[k]}}}
  return runCmd0(ew,io,pend)}
function runCmd0(ew,io,pend,noDefer,xt){const {args,globbed}=SQ.globWords(ew);
  const name=args[0],a=args.slice(1);let r,lname=name;
  if(SQ.rt.opts.x)xt=(xt||[]).concat(pend.splice(0).map(t=>({text:t,cls:'err'})),SQ.xline(args.map(SQ.xq).join(' ')));
  if(args[1]==='='&&/^[A-Za-z_]\w*$/.test(name)&&!own(CMDS,name)&&!SQ.hasFunction(name)){ /* the tip is for `x = 1`, never for a real command such as sed = file */r=E(`bash: ${name}: command not found`,127);r.tips=[`Tip: no spaces around = when you set a variable. Try: ${name}="${a.slice(1).join(' ')||'value'}"`]}
  else if(SQ.hasFunction(name)){
    if(io.defer&&!noDefer){const d={out:'',err:[],code:0,defer:{name,args:a,pend}};if(xt)d.xt=xt;return d} /* the job interpreter (jobs.js) runs the body itself */
    r=SQ.callFunction(name,a,io); /* functions beat builtins and commands; the call logs only its inner commands */
    if(pend.length){r.err=pend.concat(r.err);r.list=pend.map(t=>({text:t,cls:'err'})).concat(r.list)}
    if(xt)r.xt=xt;return r}
  else if(name.includes('/'))r=runPath(name,io,false,a);
  else if((name==='break'||name==='continue')&&!own(CMDS,name))r=loopCtl(name,a,io);
  else if(name==='local'&&!own(CMDS,'local'))r=SQ.localBuiltin(a);
  else if(name==='return'&&!own(CMDS,'return'))r=SQ.returnBuiltin(a);
  else if(own(CMDS,name))r=CMDS[name](a,io);
  else if(own(FRIENDLY,name))r=E(FRIENDLY[name],127);
  else{r=E(`bash: ${name}: command not found`,127);const s=suggest(name);if(s)r.tips=[`Did you mean: ${s}?`]}
  r=finishCmd(r,lname,a,globbed,io,pend);return xt?Object.assign({},r,{xt}):r} /* a copy: a command may hand back a shared result object */
/* the common tail of a command: stderr from its $( ) first, the output caps, the log entry */
function finishCmd(r,lname,a,globbed,io,pend){
  if(pend.length)r.err=pend.concat(r.err||[]);
  if(r.out&&r.out.length>LIM.TEXT){r.out='';r.err=(r.err||[]).concat(`${lname}: output too large for this practice shell`);r.code=1}
  SQ.rt.outChars+=(r.out||'').length;if(SQ.rt.outChars>LIM.TOTAL)throw new SQ.StepLimit('output too large');
  if(io.record)SQ.rt.log.push({name:lname,args:a,globbed,piped:io.pipeLen>1,redirect:io.redirect,errRedirect:io.errRedirect,code:r.code,out:r.out||''});
  return r}

/* break/continue [N] inside a loop: a ctl signal the interpreter unwinds (loops catch it in interp.js resolveCtl); outside a loop it only prints bash's notice */
function loopCtl(name,a,io){
  if(!io.loops)return E(`bash: ${name}: only meaningful in a \`for', \`while', or \`until' loop`,0);
  const n=a.length?Number(a[0]):1;
  /* like bash, a bad count reports once and leaves every enclosing loop */
  if(!/^\d+$/.test(a[0]===undefined?'1':a[0]))return Object.assign(E(`bash: ${name}: ${a[0]}: numeric argument required`,1),{ctl:{type:'break',n:Infinity}});
  if(n<1)return Object.assign(E(`bash: ${name}: ${a[0]}: loop count out of range`,1),{ctl:{type:'break',n:Infinity}});
  return Object.assign(ok(),{ctl:{type:name,n}})}
const errOut=e=>({out:[{text:errOf(e),cls:'err'}],code:e.code||2});
let nest=0;
/* prevLast: the exit code from before the outermost line ran, so a mission check can see what `$?` read. Lives on SQ.rt, not in saved state. */
/* The virtual clock (procs.js): each outermost line costs one second, added when it ends (also after an error or a stopped line).
   A $( ) run at the top of a sandboxed script (o.sub) is not a typed line and costs nothing. SQ.advance's Out[] (Task 12a: output of jobs
   that came due) is appended to the line's output, then the job notices (Task 12b, SQ.flushNotices); lastOut keeps only the line's own output. */
function execLine(line,o){o=Object.assign({depth:0,tty:true,record:true},o);const outer=nest===0;
  if(outer){SQ.rt.prevLast=S.last;SQ.rt.steps=0;SQ.rt.jobWork=0;SQ.rt.lineNo=(SQ.rt.lineNo||0)+1;SQ.rt.outChars=0;SQ.rt.grewBy=0;SQ.rt.lineBg=[]}
  let charged=!(outer&&!o.sub);
  const lineCost=r=>{if(charged)return r;charged=true;const x=SQ.advance(1,{tty:o.tty,depth:0});if(x&&x.length)r.out=r.out.concat(x);return r};
  /* Task 12b: the interactive shell's job notices ([1]+  Done  sleep 2) close the typed line, after the jobs that ran during its cost; never in $( ) */
  const notices=r=>{if(outer&&!o.sub&&SQ.flushNotices){const n=SQ.flushNotices();if(n.length)r.out=r.out.concat(n)}return r};
  const sd=CTX.depth;CTX.depth=o.depth;nest++;
  try{const r=execLine0(line,o);if(!outer)return r;
    SQ.checkState(); /* the saved-state cap, once more at the end of the typed line (see checkState in fs.js) */
    SQ.rt.lastOut=r.out.filter(x=>x.cls==='out'&&!x.bg).map(x=>x.text).join('\n'); /* a background job's output is not the line's */
    return capLines(notices(lineCost(r)))}
  catch(e){if(!outer)throw e; /* outermost call: any runaway or unexpected failure becomes one error line, state stays usable */
    if(e&&e.tmo!==undefined&&SQ.rt.deadlines.length)throw e; /* a $( ) at the top of a sandboxed script, inside `timeout`: the timeout takes it */
    const code=SQ.isOverflow(e)?2:1; /* a JS stack overflow reads like the parser's nesting error, status 2 */
    SQ.rt.lastOut='';CTX.pend.length=0;S.last=code; /* background-job output this line already let through (SQ.rt.lineBg, jobs.js) stays on screen */
    return capLines(notices(lineCost({out:(SQ.rt.lineBg||[]).concat({text:fatalText(e),cls:'err'}),code})))}
  finally{CTX.depth=sd;nest--}}
/* On-screen output per typed line is capped at LIM.LINES; the rest is replaced by one notice. */
function capLines(r){let n=0;const out=[];
  for(const o of r.out){if(o.clear||typeof o.text!=='string'){out.push(o);continue}
    const c=o.text.split('\n').length;
    if(n+c<=LIM.LINES){n+=c;out.push(o);continue}
    const keep=LIM.LINES-n;if(keep>0)out.push(Object.assign({},o,{text:o.text.split('\n').slice(0,keep).join('\n')}));
    out.push({text:`... output cut off after ${LIM.LINES} lines: this practice shell does not print more`,cls:'tip'});return {out,code:r.code}}
  return r}
/* The whole text is parsed before anything runs: a syntax error prints once and nothing executes. */
function execLine0(line,o){
  if(o.depth>6)return {out:[{text:'bash: too many nested scripts',cls:'err'}],code:1};
  let prog;try{prog=SQ.parseProgram(line)}catch(e){if(e&&e.stop)throw e;const r=errOut(e);S.last=r.code;return r}
  const r=SQ.runProgram(prog,{depth:o.depth,tty:o.tty,record:o.record,stdin:typeof o.stdin==='string'?{text:o.stdin,pos:0}:o.stdin||null});
  /* exit: a script or $( ) keeps the signal (the caller ends there); on a typed line there is nowhere to exit to */
  if(r.ctl&&r.ctl.type==='exit'){
    if(o.script)return r;
    if(o.sub||r.ctl.abort){S.last=r.ctl.n;return {out:r.out,code:r.ctl.n}}
    r.out.push({text:FRIENDLY.exit,cls:'err'});S.last=127;return {out:r.out,code:127}}
  return r}

/* Hidden-test cases: SCRIPT_CASES most, REPORT_MAX characters of any reported output. */
const SCRIPT_CASES=20,REPORT_MAX=2000;
const cap=t=>t.length>REPORT_MAX?t.slice(0,REPORT_MAX)+'...':t;
/* ctx.runScript / scriptPasses run on a throwaway copy of the world, from the home directory, with no terminal; a runaway script is a result, never an exception */
function sandboxRun(path,args,stdin){return SQ.sandbox(()=>{S.cwd=HOME;S.oldpwd=HOME;
  try{const r=SQ.runScript(path,{args:args||[],stdin,depth:1,tty:false,force:true,record:false});return {out:r.out,err:r.err,code:r.code}}
  catch(e){return {out:'',err:[fatalText(e)],code:1,thrown:true}}})}
function scriptPasses(m){const nd=p=>getNode(norm(p,HOME)),fn=nd(m.file);
  if(!fn||fn.type!=='file')return {ok:false,failed:{index:-1,label:'file',expected:m.file,got:'missing'}};
  const cases=(m.tests||[]).slice(0,SCRIPT_CASES);
  for(let i=0;i<cases.length;i++){const tc=cases[i],label=tc.label||`case ${i+1}`;
    const fail=(expected,got)=>({ok:false,failed:{index:i,label,expected:cap(String(expected)),got:cap(String(got))}});
    const res=SQ.sandbox(()=>{S.cwd=HOME;S.oldpwd=HOME;
      for(const [p,c] of Object.entries(tc.files||{})){const abs=norm(p,HOME),[,,pp]=SQ.parentOf(abs);SQ.mkdirp(pp);SQ.writeFile(abs,String(c),false,p)}
      let r;try{r=SQ.runScript(m.file,{args:(tc.args||[]).map(String),stdin:tc.stdin,depth:1,tty:false,force:true,record:false})}
      catch(e){return {thrown:fatalText(e)}}
      const files={};for(const p of Object.keys(tc.expectFiles||{})){const n=nd(p);files[p]=n&&n.type==='file'?n.content:'(missing)'}
      return {r,files}});
    if(res.thrown!==undefined)return fail(tc.expectOut!==undefined?tc.expectOut:'the script to finish',res.thrown);
    const out=res.r.out.replace(/\n$/,'');
    if(tc.expectOut!==undefined&&out!==tc.expectOut)return fail(tc.expectOut,out);
    if(tc.expectMatch!==undefined){let re;
      try{re=SQ.safeRegex(String(tc.expectMatch),'')}catch(e){return fail(tc.expectMatch,'(unusable pattern: '+(e&&e.message)+')')}
      if(!re.test(out))return fail('/'+tc.expectMatch+'/',out)}
    const errT=res.r.err.join('\n').replace(/\n$/,'');
    if(tc.expectErr!==undefined&&errT!==tc.expectErr)return fail(tc.expectErr,errT);
    if(tc.expectErrMatch!==undefined){let re;
      try{re=SQ.safeRegex(String(tc.expectErrMatch),'')}catch(e){return fail(tc.expectErrMatch,'(unusable pattern: '+(e&&e.message)+')')}
      if(!re.test(errT))return fail('/'+tc.expectErrMatch+'/',errT)}
    const want=tc.expectCode===undefined?0:tc.expectCode;
    if(res.r.code!==want)return fail('exit status '+want,'exit status '+res.r.code+(res.r.err.length?' ('+res.r.err.join('; ')+')':''));
    for(const [p,c] of Object.entries(tc.expectFiles||{}))if(res.files[p]!==String(c))return fail(c,res.files[p])}
  return {ok:true}}

function ctxFor(line){const nd=p=>getNode(norm(p,HOME));return {line,cwd:S.cwd,log:SQ.rt.log,
  ran:(n,p)=>SQ.rt.log.some(e=>e.name===n&&(!p||p(e))),has:p=>!!nd(p),node:nd,
  isDir:p=>{const n=nd(p);return !!n&&n.type==='dir'},isFile:p=>{const n=nd(p);return !!n&&n.type==='file'},
  read:p=>{const n=nd(p);return n&&n.type==='file'?n.content:''},
  flag:(e,ch)=>e.args.some(x=>/^-[A-Za-z]+$/.test(x)&&x.includes(ch)),
  out:()=>SQ.rt.lastOut||'',exists:p=>!!nd(p),runScript:(p,a,i)=>sandboxRun(p,a,i),scriptPasses}}
/* A chapter's setup(), plus the `starter` text of its script/challenge missions: written only where the file is absent, so revisiting a chapter never clobbers saved work. */
function setupChapter(ch){ch.setup();for(const m of ch.missions)if(m.file&&typeof m.starter==='string'&&(m.kind==='script'||m.kind==='challenge'))SQ.ensureFile(m.file,m.starter)}
/* missionVerdict(m, c, why): {good, failed} for any mission. A custom m.check wins; script/challenge missions without one use scriptPasses.
   With why, a failed script/challenge mission also says why: the first failing case, judged inside the same world the check uses
   (m.world: fn => result, e.g. a sandbox with no leftover backup/), or m.checkFail when every case passes but the check still says no. */
function missionVerdict(m,c,why){const isScript=m.kind==='script'||m.kind==='challenge',world=typeof m.world==='function'?m.world:(fn=>fn());
  if(typeof m.check==='function'){const good=!!m.check(c);let failed=null;
    if(!good&&why&&isScript&&m.tests){failed=world(()=>c.scriptPasses(m)).failed||null;if(!failed&&m.checkFail)failed={index:-2,label:'check',text:m.checkFail}}
    return {good,failed}}
  if(isScript&&m.file){const r=world(()=>c.scriptPasses(m));return {good:!!r.ok,failed:r.failed||null}}
  return {good:false,failed:null}}
/* the one err line explaining a failed test case (scriptPasses().failed), at most 120 characters */
const oneLine=(t,n)=>{t=t.replace(/\n/g,'\\n');return t.length>n?t.slice(0,n-3)+'...':t};
function scriptFailLine(m,f){if(f.index===-2)return oneLine(f.text,120);if(f.index<0)return `Save your script as ${m.file} first (nano ${m.file}).`;
  return oneLine(`Test ${f.index+1} (${f.label}) failed: expected "${f.expected}", got "${f.got}"`,120)}
Object.assign(SQ,{runPath,runCmd,execLine,ctxFor,setupChapter,scriptFailLine,missionVerdict});
})(window.SQ = window.SQ || {});
