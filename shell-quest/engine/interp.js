(function (SQ) {
/* Stage 2 interpreter: SQ.runProgram(list, env) walks the SQ.parseProgram AST.
   Env = {depth, tty, record, stdin: StdinBox|null, loops}; StdinBox = {text, pos} (shared by the commands of a compound whose input was redirected).
   Every runner returns {out: Out[], code, ctl?, ui?}; Ctl = {type:'break'|'continue'|'return'|'exit', n} unwinds lists, loops and compounds. */
const S=SQ.S;
const {CTX,expandWords,expandOne,globExpand}=SQ;
const errL=text=>({text,cls:'err'});
const {errOf,own}=SQ;

/* Shell state a subshell, $( ) or script must not leak. FS changes are not part of it. */
function snapshotShell(){
  const f=SQ.frame();
  return {cwd:S.cwd,oldpwd:S.oldpwd,vars:Object.assign({},S.vars),exp:S.exp&&Object.assign({},S.exp),fns:S.fns&&Object.assign({},S.fns),unsetB:S.unsetB&&Object.assign({},S.unsetB),last:S.last,frames:SQ.rt.frames.length,frame:f,args:f.args}}
function restoreShell(sv){
  S.cwd=sv.cwd;S.oldpwd=sv.oldpwd;S.vars=sv.vars;S.last=sv.last;
  if(sv.exp)S.exp=sv.exp;else delete S.exp;
  if(sv.fns)S.fns=sv.fns;else delete S.fns;
  if(sv.unsetB)S.unsetB=sv.unsetB;else delete S.unsetB;
  sv.frame.args=sv.args; /* shift inside a subshell, $( ) or pipeline stage does not reach the shell */
  SQ.rt.frames.length=Math.min(SQ.rt.frames.length,sv.frames)}

/* Interpreter nesting across compounds, $( ) and scripts; the parser caps one text at 100 levels, this caps the sum so the JS stack never overflows. */
const IMAX=250;let idepth=0;
function nested(f){if(idepth>=IMAX)throw new SQ.StepLimit('nesting too deep');idepth++;try{return f()}finally{idepth--}}

/* an expansion error marked abort (${X:?msg}) ends the function, script or typed line: the same unwinding signal as `exit 1`, flagged so a typed line prints no friendly message */
const abortOf=e=>e&&e.abort?{type:'exit',n:1,abort:true}:undefined;
function logKw(env,name,code){if(env.record)SQ.rt.log.push({name,args:[],globbed:false,piped:false,redirect:null,errRedirect:null,code,out:''})}

function runProgram(node,env){
  env=Object.assign({depth:0,tty:true,record:true,stdin:null,loops:0},env);
  return runList(node,env)}

function runList(list,env){const out=[];let code=0,ui;
  for(const it of list.items){const r=runAndOr(it.andor,env);out.push(...r.out);code=r.code;if(r.ui)ui=r.ui;
    if(r.ctl)return {out,code,ctl:r.ctl,ui}}
  return {out,code,ui}}

/* && / || run left to right on the status of the last pipeline that ran (a skipped one leaves it unchanged). */
function runAndOr(n,env){
  let r=runPipeline(n.first,env);const out=r.out.slice();let code=r.code,ui=r.ui;
  if(r.ctl)return {out,code,ctl:r.ctl,ui};
  for(const it of n.rest){if(it.op==='&&'&&code!==0)continue;if(it.op==='||'&&code===0)continue;
    r=runPipeline(it.pipe,env);out.push(...r.out);code=r.code;if(r.ui)ui=r.ui;
    if(r.ctl)return {out,code,ctl:r.ctl,ui}}
  return {out,code,ui}}

/* stdout text, stderr lines and tips of a compound's Out[] in the shape runCmd returns */
function asCmd(r){const o={out:[],err:[],tips:[],code:r.code,clear:false};
  for(const x of r.out){if(x.clear){o.clear=true;continue}(x.cls==='out'?o.out:x.cls==='tip'?o.tips:o.err).push(x.text)}
  o.out=o.out.join('\n');return o}

/* the body of a here-document or here-string as stdin text (no trailing newline, like every other text in this shell) */
function hereText(R,res){
  if(R.herestr)return expandOne(R.herestr);
  const d=R.doc;
  if(d.eof)res.push(errL(`bash: warning: here-document delimited by end-of-file (wanted '${d.delim}')`));
  const t=d.quoted?d.raw:SQ.expandHeredoc(d.raw);
  return t.replace(/\n$/,'')}

/* One pipeline. The stage loop is the pre-Stage-2 executor body: redirect targets expand just before their stage, > and 2> targets are truncated
   before the command runs, 2>&1 appends stderr after stdout, stderr reaches the screen at once, status = last stage. */
function runPipeline(Pn,env){const res=[];let code=0,ctl=null,ui;
  const P=Pn.cmds,{norm,getNode,writeFile,isNull}=SQ;
  let stdin='';
  /* every stage of a multi-command pipeline is a full subshell: directory, variables, exports, functions and positional parameters go back to what they were
     (echo Ada | read x leaves x unset, cd forest | cat stays put, echo a | shift keeps $#). Files and $? come out of a stage as before. */
  const sv0=P.length>1?snapshotShell():null;
  const back=()=>{const l=S.last;restoreShell(Object.assign({},sv0,{vars:Object.assign({},sv0.vars),exp:sv0.exp&&Object.assign({},sv0.exp),fns:sv0.fns&&Object.assign({},sv0.fns),unsetB:sv0.unsetB&&Object.assign({},sv0.unsetB),last:l}))};
  try{
  for(let i=0;i<P.length;i++){const c=P[i],last=i===P.length-1,simple=c.type==='simple';
    if(sv0&&i>0)back();
    const R=simple?c:(c.redirs||{});
    let out=null,inp=null,err=null,here=null;
    let toErr=null,pre=null;
    try{if(R.out){if(R.out.toErr){toErr=R.out;if(toErr.pre)pre={path:expandOne(toErr.pre.w),append:toErr.pre.append}}else out={path:expandOne(R.out.w),append:R.out.append}}if(R.inp)inp=expandOne(R.inp);if(R.err)err=R.err.dup?R.err:{path:expandOne(R.err.w),append:R.err.append};
      if(R.herestr||R.doc)here=hereText(R,res)}
    catch(e){if(e&&e.stop)throw e;res.push(...CTX.pend.splice(0),{text:errOf(e),cls:'err'});code=e.code||2;if(P.length===1)ctl=abortOf(e);break}
    res.push(...CTX.pend.splice(0));
    let box=null;
    if(inp!==null){if(isNull(inp))box={text:'',pos:0};else{const n=getNode(norm(inp));if(!n||n.type!=='file'){res.push({text:`bash: ${inp}: No such file or directory`,cls:'err'});code=1;break}box={text:n.content,pos:0}}}
    else if(here!==null)box={text:here,pos:0};
    else if(i>0)box={text:stdin,pos:0};
    else if(env.stdin)box=env.stdin;
    let bad=false;
    for(const t of [out,pre,err&&err.path?err:null]){if(t&&(!t.append||(t===pre&&!getNode(norm(t.path))))){const e=writeFile(norm(t.path),'',false,t.path);if(e){res.push({text:e,cls:'err'});code=1;bad=true;break}}}
    if(bad)break;
    const tty=env.tty&&last&&!out;let r;
    if(simple){
      const io={tty,depth:env.depth,pipeLen:P.length,record:env.record,redirect:out,errRedirect:err,loops:env.loops,stdinBox:box};
      if(box&&box===env.stdin){let got=null; /* shared box: the first read of io.stdin takes the rest of it */
        Object.defineProperty(io,'stdin',{enumerable:true,configurable:true,get(){if(got===null){got=box.text.slice(box.pos);box.pos=box.text.length}return got}})}
      else io.stdin=box?box.text:'';
      r=SQ.runCmd(c.words,io);
      if(r.list&&last&&!out&&!err&&!toErr){if(r.ui&&last)ui=r.ui;if(P.length===1&&r.ctl)ctl=r.ctl;res.push(...r.list);code=r.code;continue}}
    else{
      const cr=runCompound(c,Object.assign({},env,{tty,stdin:box}));
      if(cr.ui&&last)ui=cr.ui;if(P.length===1&&cr.ctl)ctl=cr.ctl;
      if(last&&!out&&!err&&!toErr){res.push(...cr.out);code=cr.code;continue}
      r=asCmd(cr)}
    if(r.ui&&last)ui=r.ui; /* only the last stage may open the editor: nano f | cat does not */
    if(P.length===1&&r.ctl)ctl=r.ctl;
    if(r.clear)res.push({clear:true});
    let errs=r.err.slice(),tips=r.tips||[],text=r.out,errR=err;
    if(toErr){ /* >&2: this command's stdout joins the stderr stream. `2>&1 >&2` (after) swaps the two; `2>f >&2` sends both to f; `>&2 2>&1` leaves both on the screen. */
      const extra=text!==''?[text]:[];text='';
      if(errR&&errR.dup&&toErr.after){text=errs.join('\n');errs=[];res.push(...extra.map(t=>({text:t,cls:'err'})));errR=null}
      else if(errR&&errR.path&&toErr.after){errs=extra.concat(errs)}
      else{if(errR&&errR.dup)errR=null;res.push(...extra.map(t=>({text:t,cls:'err'})))}}
    if(errR){if(errR.dup){if(errs.length)text=[text,...errs].filter(x=>x!=='').join('\n')}
      else if(errs.length){const e=writeFile(norm(errR.path),errs.join('\n'),errR.append,errR.path);if(e)res.push({text:e,cls:'err'})}
      errs=[];if(!errR.dup)tips=[]}
    errs.forEach(e=>res.push({text:e,cls:'err'}));tips.forEach(e=>res.push({text:e,cls:'tip'}));
    code=r.code;
    if(out){const e=writeFile(norm(out.path),text,out.append,out.path);if(e){res.push({text:e,cls:'err'});code=1}stdin=''}
    else if(last){if(text!=='')res.push({text,cls:'out'})}
    else stdin=text}
  }finally{if(sv0)back()}
  if(Pn.negate)code=code===0?1:0;
  S.last=code;
  const o={out:res,code};if(ctl)o.ctl=ctl;if(ui)o.ui=ui;return o}

function runCompound(c,env){return nested(()=>{
  switch(c.type){
    case 'if':return runIf(c,env);
    case 'while':case 'until':return runWhile(c,env);
    case 'for':return runFor(c,env);
    case 'case':return runCase(c,env);
    case 'group':return runList(c.body,env);
    case 'subshell':return runSubshell(c,env);
    case 'arith':return runArith(c,env);
    case 'cond':return runCond(c,env);
    case 'func':return defineFunction(c,env);
  }
  return {out:[errL('bash: internal error: unknown node '+c.type)],code:2}})}

function runIf(c,env){const out=[];let code=0,ui;
  for(const b of c.branches){
    const cr=runList(b.cond,env);out.push(...cr.out);if(cr.ui)ui=cr.ui;
    if(cr.ctl)return {out,code:cr.code,ctl:cr.ctl,ui};
    if(cr.code!==0)continue;
    const br=runList(b.body,env);out.push(...br.out);if(br.ui)ui=br.ui;
    logKw(env,'if',br.code);return {out,code:br.code,ctl:br.ctl,ui}}
  if(c.else){const br=runList(c.else,env);out.push(...br.out);if(br.ui)ui=br.ui;code=br.code;
    logKw(env,'if',code);return {out,code,ctl:br.ctl,ui}}
  logKw(env,'if',code);return {out,code,ui}}

/* A loop body's ctl: returns 'next' (keep looping), 'stop' (leave the loop) or a ctl to pass outward. outer = loops enclosing this one. */
function resolveCtl(ctl,outer){
  if(ctl.type==='break')return ctl.n>1&&outer>0?{type:'break',n:ctl.n-1}:'stop';
  if(ctl.type==='continue')return ctl.n>1&&outer>0?{type:'continue',n:ctl.n-1}:'next';
  return ctl}

function runWhile(c,env){const out=[];let code=0,ui,pass;const inner=Object.assign({},env,{loops:env.loops+1});
  for(;;){SQ.step();
    const cr=runList(c.cond,inner);out.push(...cr.out);if(cr.ui)ui=cr.ui;
    if(cr.ctl){pass=resolveCtl(cr.ctl,env.loops);if(pass==='next')continue;if(pass==='stop')break;logKw(env,c.type,code);return {out,code,ctl:pass,ui}}
    if(c.type==='while'?cr.code!==0:cr.code===0)break;
    const br=runList(c.body,inner);out.push(...br.out);if(br.ui)ui=br.ui;code=br.code;
    if(br.ctl){pass=resolveCtl(br.ctl,env.loops);if(pass==='next')continue;if(pass==='stop')break;logKw(env,c.type,code);return {out,code,ctl:pass,ui}}}
  logKw(env,c.type,code);return {out,code,ui}}

/* for: the list expands once, one 'for' log entry with the items, then one step per pass. The loop variable stays set afterwards. */
function runFor(c,env){const out=[];let code=0,ui;
  if(SQ.badName(c.var))return {out:[errL(`bash: \`${c.var}': not a valid identifier`)],code:1};
  let items=[],globbed=false;
  if(c.words===null)items=SQ.frame().args.slice();
  else{let toks;
    try{toks=expandWords(c.words)}catch(e){if(e&&e.stop)throw e;out.push(...CTX.pend.splice(0),errL(errOf(e)));return {out,code:e.code||2,ctl:abortOf(e)}}
    for(const w of toks){if(w.glob){globbed=true;items.push(...globExpand(w.v))}else items.push(w.v)}}
  out.push(...CTX.pend.splice(0));
  if(env.record)SQ.rt.log.push({name:'for',args:items,globbed,piped:false,redirect:null,code:0,out:''});
  const inner=Object.assign({},env,{loops:env.loops+1});
  for(const it of items){SQ.step();SQ.setVar(c.var,it);
    const br=runList(c.body,inner);out.push(...br.out);if(br.ui)ui=br.ui;code=br.code;
    if(br.ctl){const pass=resolveCtl(br.ctl,env.loops);if(pass==='next')continue;if(pass==='stop')break;return {out,code,ctl:pass,ui}}}
  return {out,code,ui}}

function runCase(c,env){const out=[];let code=0,w;
  try{w=expandOne(c.word)}catch(e){if(e&&e.stop)throw e;out.push(...CTX.pend.splice(0),errL(errOf(e)));return {out,code:e.code||1,ctl:abortOf(e)}}
  out.push(...CTX.pend.splice(0));
  for(const arm of c.arms){let hit=false;
    for(const p of arm.patterns){let m;
      try{m=SQ.patMatch(w,p.raw)}catch(e){if(e&&e.stop)throw e;out.push(...CTX.pend.splice(0),errL(errOf(e)));logKw(env,'case',1);return {out,code:1}}
      out.push(...CTX.pend.splice(0));if(m){hit=true;break}}
    if(!hit)continue;
    const br=runList(arm.body,env);out.push(...br.out);code=br.code;
    logKw(env,'case',code);return {out,code,ctl:br.ctl,ui:br.ui}}
  logKw(env,'case',code);return {out,code}}

/* ( ... ): a subshell, isolated like $( ); loop control and exit stop at its edge */
function runSubshell(c,env){const sv=snapshotShell();let r;
  try{r=runList(c.body,Object.assign({},env,{loops:0}))}finally{restoreShell(sv)}
  const code=r.ctl&&r.ctl.type==='exit'?r.ctl.n:r.code;
  return {out:r.out,code,ui:r.ui}}

/* [[ ... ]]: SQ.evalCond (cmds-flow.js) returns the status and leaves stderr lines in CTX.pend */
function runCond(c,env){const code=SQ.evalCond(c.raw);logKw(env,'[[',code);return {out:CTX.pend.splice(0),code}}

function runArith(c,env){SQ.step();let v;
  /* an arithmetic error reads `bash: ((: reason`: the expression prefix of SQ.arith's message becomes ((: */
  try{v=SQ.arithVal(c.expr)}catch(e){if(e&&e.stop)throw e;const m=errOf(e),pre='bash: '+c.expr+': ';
    const out=[...CTX.pend.splice(0),errL(m.startsWith(pre)?'bash: ((: '+m.slice(pre.length):m)];logKw(env,'((',1);return {out,code:1}}
  const out=CTX.pend.splice(0),code=v!=='0'?0:1;logKw(env,'((',code);return {out,code}}

/* ---------- functions ----------
   S.fns[name] = the source text of the body ({ ... } plus its redirects), parsed lazily on call through a small bounded cache.
   A call pushes Frame {name,args,kind:'function',locals}; `local` saves the previous value of a name in locals (undefined = was unset)
   and the pop puts it back, so callees see the caller's locals (dynamic scope) and nothing leaks after the return. */
const FN_NEST=100,CACHE_MAX=64;
const parseCache=new Map();let fnDepth=0;
const hasFunction=name=>own(S.fns,name);
function fnsText(skip){let t=0;for(const k of Object.keys(S.fns||{}))if(k!==skip)t+=S.fns[k].length;return t}
function defineFunction(c,env){const src=c.body.src;
  if(c.name==='__proto__')return {out:[errL(`bash: \`${c.name}': not a valid identifier`)],code:1};
  const total=fnsText(c.name)+src.length;
  if(src.length>SQ.LIM.TEXT||(total>1000&&total+SQ.stateText(S.fs)>SQ.LIM.STATE)){logKw(env,'(fn)',1);return {out:[errL(`bash: ${c.name}: function too large for this practice shell`)],code:1}}
  (S.fns=S.fns||{})[c.name]=src;
  logKw(env,'(fn)',0);return {out:[],code:0}}
function parsedBody(text){let p=parseCache.get(text);
  if(p){parseCache.delete(text);parseCache.set(text,p);return p}
  p=SQ.parseProgram(text);parseCache.set(text,p);
  if(parseCache.size>CACHE_MAX)parseCache.delete(parseCache.keys().next().value);
  return p}
function restoreLocals(f){for(const [k,v] of f.locals){if(v===undefined)delete S.vars[k];else S.vars[k]=v}}
/* runCmd's result shape plus list (the body's Out[] in order, used when the call's output goes straight to the screen) */
function callFunction(name,args,io){
  if(fnDepth>=FN_NEST)throw Object.assign(new Error(`bash: ${name}: maximum function nesting level exceeded`),{stop:true});
  let prog;try{prog=parsedBody(S.fns[name])}catch(e){if(e&&e.stop)throw e;return {out:'',err:[errOf(e)],tips:[],code:e.code||2,list:[errL(errOf(e))]}}
  const fr=SQ.rt.frames,at=fr.length,f={name,args:args.slice(),kind:'function',locals:new Map()};
  fr.push(f);fnDepth++;let r;
  try{r=runProgram(prog,{depth:io.depth||0,tty:io.tty,record:io.record,stdin:io.stdinBox||null,loops:io.loops||0})} /* break/continue in the body reach the caller's loop */
  finally{fnDepth--;restoreLocals(f);fr.length=Math.min(fr.length,at)}
  const ret=r.ctl&&r.ctl.type==='return';
  const o=asCmd(r);o.code=ret?r.ctl.n:r.code;o.list=r.out;if(r.ui)o.ui=r.ui;
  if(r.ctl&&!ret)o.ctl=r.ctl;
  return o}
/* source FILE: the text runs in the CURRENT shell under a Frame {name:FILE,args,kind:'source'}; `return` ends the file with its status, `exit n` ends that file
   (the status is n; only a typed line shows the friendly exit message). Parse first: a syntax error prints once and nothing runs. The nesting bound matches functions. */
let srcDepth=0;
function runSourced(name,text,args,io){
  const fail=(m,c)=>({out:'',err:[m],tips:[],code:c,list:[errL(m)]});
  if(srcDepth>=FN_NEST)return fail('bash: source: maximum source nesting level exceeded',1);
  let prog;try{prog=parsedBody(text)}catch(e){if(e&&e.stop)throw e;return fail(errOf(e),e.code||2)}
  const fr=SQ.rt.frames,at=fr.length,f={name,args:args.slice(),kind:'source',locals:new Map()};
  fr.push(f);srcDepth++;let r;
  try{r=runProgram(prog,{depth:io.depth||0,tty:io.tty,record:io.record,stdin:io.stdinBox||null,loops:0})}
  finally{srcDepth--;fr.length=Math.min(fr.length,at)}
  const end=r.ctl&&(r.ctl.type==='return'||(r.ctl.type==='exit'&&!r.ctl.abort));
  const o=asCmd(r);o.code=end?r.ctl.n:r.code;o.list=r.out;if(r.ui)o.ui=r.ui;
  if(r.ctl&&!end)o.ctl=r.ctl;
  return o}
/* ---------- scripts ----------
   runScript(path, {args,stdin,stdinBox,depth,tty,force,record}) -> {out,err,code}: `bash FILE ARGS` and ./FILE. A child process: it sees only the exported variables
   (no functions), has its own $0 (the path as typed), $1.., and the caller's cwd/vars/exports/functions/status come back when it ends. The whole file is parsed first:
   a syntax error prints once and nothing runs. `exit n` ends it with status n. Files it writes stay. depth = the caller's depth. */
function runScript(path,o){o=Object.assign({args:[],depth:0,tty:true,force:false,record:false},o);
  const {norm,getNode,bname,E}=SQ,abs=norm(path),n=getNode(abs);
  if(!n)return E(SQ.isLoop(abs)?`bash: ${path}: Too many levels of symbolic links`:`bash: ${path}: No such file or directory`,127);
  if(n.type==='dir')return E(`bash: ${path}: Is a directory`,126);
  if(!o.force&&!n.exec)return Object.assign(E(`bash: ${path}: Permission denied`,126),{tips:[`Tip: mark it as runnable with chmod +x ${bname(abs)}`]});
  if(o.depth+1>6)return E('bash: too many nested scripts',1);
  let prog;try{prog=parsedBody(n.content)}catch(e){if(e&&e.stop)throw e;
    /* a script reports `NAME: line N: syntax error ...` (the path as typed, the line of the offending token) instead of `bash: syntax error ...` */
    if(e&&e.at!==undefined)return E(`${path}: line ${SQ.lineOf(n.content,e.at)}: ${e.message}`,e.code||2);
    return E(errOf(e),e.code||2)}
  const box=o.stdinBox||(o.stdin!=null?{text:String(o.stdin),pos:0}:null);
  const sv=snapshotShell(),callerVars=S.vars;S.vars={};for(const k of Object.keys(S.exp||{}))if(own(callerVars,k))S.vars[k]=callerVars[k];
  delete S.fns;
  const fr=SQ.rt.frames,at=fr.length;fr.push({name:path,args:o.args.slice(),kind:'script',locals:new Map()});
  const out=[],err=[];let code=0;
  try{const r=runProgram(prog,{depth:o.depth+1,tty:o.tty,record:o.record,stdin:box,loops:0});
    for(const x of r.out){if(x.clear)continue;(x.cls==='out'?out:err).push(x.text)}
    code=r.ctl&&r.ctl.type==='exit'?r.ctl.n:r.code}
  finally{fr.length=Math.min(fr.length,at);restoreShell(sv)}
  return {out:out.join('\n'),err,code}}

/* sandbox(fn): run fn on a throwaway copy of the world. The whole of S (a JSON snapshot: fs, cwd, vars, exp, fns, last, ...) and the per-line runtime state come back
   afterwards, also when fn throws; the saved game is never touched (save() is a no-op while SQ.rt.sandboxed). */
function sandbox(fn){const rt=SQ.rt,snap=JSON.stringify(S);
  const keep={log:rt.log,changed:rt.changed,frames:rt.frames,lastOut:rt.lastOut,prevLast:rt.prevLast,steps:rt.steps,outChars:rt.outChars,grewBy:rt.grewBy,sandboxed:rt.sandboxed,pend:CTX.pend.slice(),depth:CTX.depth};
  rt.log=keep.log.slice();rt.changed=new Set(keep.changed);rt.frames=[];rt.steps=0;rt.outChars=0;rt.grewBy=0;rt.sandboxed=true;
  try{return fn()}
  finally{const back=JSON.parse(snap);SQ.fixTree(back.fs);
    for(const k of Object.keys(S))if(!(k in back))delete S[k];
    for(const k of Object.keys(back))S[k]=back[k];
    Object.assign(rt,{log:keep.log,changed:keep.changed,frames:keep.frames,lastOut:keep.lastOut,prevLast:keep.prevLast,steps:keep.steps,outChars:keep.outChars,grewBy:keep.grewBy||0,sandboxed:!!keep.sandboxed});
    CTX.pend.length=0;CTX.pend.push(...keep.pend);CTX.depth=keep.depth}}

/* the frame `return` acts on: the innermost function or sourced-script frame on top of the stack */
const fnFrame=()=>{const f=SQ.rt.frames;const t=f[f.length-1];return t&&(t.kind==='function'||t.kind==='source')?t:null};
/* `local` belongs to the nearest function frame; a sourced file called from a function shares that function's scope */
function localBuiltin(a){const fr=SQ.rt.frames;let f=null;
  for(let i=fr.length-1;i>=0;i--){if(fr[i].kind==='function'){f=fr[i];break}if(fr[i].kind!=='source')break}
  if(!f)return SQ.E('bash: local: can only be used in a function',1);
  const err=[];let code=0;
  for(const x of a){const eq=x.indexOf('='),k=eq<0?x:x.slice(0,eq);
    if(!/^[A-Za-z_]\w*$/.test(k)||SQ.badName(k)){err.push(`bash: local: \`${x}': not a valid identifier`);code=1;continue}
    if(!f.locals.has(k))f.locals.set(k,own(S.vars,k)?S.vars[k]:undefined);
    if(eq<0)delete S.vars[k];else S.vars[k]=x.slice(eq+1)}
  return {out:'',err,code}}
function returnBuiltin(a){
  if(!fnFrame())return SQ.E("bash: return: can only 'return' from a function or sourced script",1);
  let n=S.last;
  if(a.length){if(!/^[-+]?\d+$/.test(a[0]))return Object.assign(SQ.E(`bash: return: ${a[0]}: numeric argument required`,2),{ctl:{type:'return',n:2}});
    n=((Number(a[0])%256)+256)%256}
  return {out:'',err:[],code:n,ctl:{type:'return',n}}}

Object.assign(SQ,{runScript,sandbox,runProgram,snapshotShell,restoreShell,callFunction,runSourced,hasFunction,localBuiltin,returnBuiltin,fnParseCache:parseCache});
})(window.SQ=window.SQ||{});
