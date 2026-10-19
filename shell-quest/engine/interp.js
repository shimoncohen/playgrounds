(function (SQ) {
/* Stage 2 interpreter: SQ.runProgram(list, env) walks the SQ.parseProgram AST.
   Env = {depth, tty, record, stdin: StdinBox|null, loops}; StdinBox = {text, pos} (shared by the commands of a compound whose input was redirected).
   Every runner returns {out: Out[], code, ctl?, ui?}; Ctl = {type:'break'|'continue'|'return'|'exit', n} unwinds lists, loops and compounds. */
const S=SQ.S;
const {CTX,expandWords,expandOne,globExpand}=SQ;
const errL=text=>({text,cls:'err'});
const errOf=e=>(e.raw?'':'bash: ')+e.message;

/* Shell state a subshell, $( ) or script must not leak. FS changes are not part of it. */
function snapshotShell(){
  return {cwd:S.cwd,oldpwd:S.oldpwd,vars:Object.assign({},S.vars),exp:S.exp&&Object.assign({},S.exp),fns:S.fns&&Object.assign({},S.fns),last:S.last,frames:SQ.rt.frames.length}}
function restoreShell(sv){
  S.cwd=sv.cwd;S.oldpwd=sv.oldpwd;S.vars=sv.vars;S.last=sv.last;
  if(sv.exp)S.exp=sv.exp;else delete S.exp;
  if(sv.fns)S.fns=sv.fns;else delete S.fns;
  SQ.rt.frames.length=Math.min(SQ.rt.frames.length,sv.frames)}

/* Interpreter nesting across compounds, $( ) and scripts; the parser caps one text at 100 levels, this caps the sum so the JS stack never overflows. */
const IMAX=250;let idepth=0;
function nested(f){if(idepth>=IMAX)throw new SQ.StepLimit('nesting too deep');idepth++;try{return f()}finally{idepth--}}

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
  for(let i=0;i<P.length;i++){const c=P[i],last=i===P.length-1,simple=c.type==='simple';
    const R=simple?c:(c.redirs||{});
    let out=null,inp=null,err=null,here=null;
    try{if(R.out)out={path:expandOne(R.out.w),append:R.out.append};if(R.inp)inp=expandOne(R.inp);if(R.err)err=R.err.dup?R.err:{path:expandOne(R.err.w),append:R.err.append};
      if(R.herestr||R.doc)here=hereText(R,res)}
    catch(e){if(e&&e.stop)throw e;res.push(...CTX.pend.splice(0),{text:(e.raw?'':'bash: ')+e.message,cls:'err'});code=e.code||2;break}
    res.push(...CTX.pend.splice(0));
    let box=null;
    if(inp!==null){if(isNull(inp))box={text:'',pos:0};else{const n=getNode(norm(inp));if(!n||n.type!=='file'){res.push({text:`bash: ${inp}: No such file or directory`,cls:'err'});code=1;break}box={text:n.content,pos:0}}}
    else if(here!==null)box={text:here,pos:0};
    else if(i>0)box={text:stdin,pos:0};
    else if(env.stdin)box=env.stdin;
    let bad=false;
    for(const t of [out,err&&err.path?err:null]){if(t&&!t.append){const e=writeFile(norm(t.path),'',false,t.path);if(e){res.push({text:e,cls:'err'});code=1;bad=true;break}}}
    if(bad)break;
    const tty=env.tty&&last&&!out;let r;
    if(simple){
      const io={tty,depth:env.depth,pipeLen:P.length,record:env.record,redirect:out,errRedirect:err,loops:env.loops,stdinBox:box};
      if(box&&box===env.stdin){let got=null; /* shared box: the first read of io.stdin takes the rest of it */
        Object.defineProperty(io,'stdin',{enumerable:true,configurable:true,get(){if(got===null){got=box.text.slice(box.pos);box.pos=box.text.length}return got}})}
      else io.stdin=box?box.text:'';
      r=SQ.runCmd(c.words,io)}
    else{
      const cr=runCompound(c,Object.assign({},env,{tty,stdin:box}));
      if(cr.ui)ui=cr.ui;if(P.length===1&&cr.ctl)ctl=cr.ctl;
      if(last&&!out&&!err){res.push(...cr.out);code=cr.code;continue}
      r=asCmd(cr)}
    if(r.ui)ui=r.ui;if(P.length===1&&r.ctl)ctl=r.ctl;
    if(r.clear)res.push({clear:true});
    let errs=r.err.slice(),tips=r.tips||[],text=r.out;
    if(err){if(err.dup){if(errs.length)text=[text,...errs].filter(x=>x!=='').join('\n')}
      else if(errs.length){const e=writeFile(norm(err.path),errs.join('\n'),err.append,err.path);if(e)res.push({text:e,cls:'err'})}
      errs=[];if(!err.dup)tips=[]}
    errs.forEach(e=>res.push({text:e,cls:'err'}));tips.forEach(e=>res.push({text:e,cls:'tip'}));
    code=r.code;
    if(out){const e=writeFile(norm(out.path),text,out.append,out.path);if(e){res.push({text:e,cls:'err'});code=1}stdin=''}
    else if(last){if(text!=='')res.push({text,cls:'out'})}
    else stdin=text}
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
    case 'cond':return {out:[errL('this practice shell does not support [[ ]] yet')],code:2};
    case 'func':return {out:[errL('this practice shell does not support functions yet')],code:2};
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
function loopCtl(ctl,outer){
  if(ctl.type==='break')return ctl.n>1&&outer>0?{type:'break',n:ctl.n-1}:'stop';
  if(ctl.type==='continue')return ctl.n>1&&outer>0?{type:'continue',n:ctl.n-1}:'next';
  return ctl}

function runWhile(c,env){const out=[];let code=0,ui,pass;const inner=Object.assign({},env,{loops:env.loops+1});
  for(;;){SQ.step();
    const cr=runList(c.cond,inner);out.push(...cr.out);if(cr.ui)ui=cr.ui;
    if(cr.ctl){pass=loopCtl(cr.ctl,env.loops);if(pass==='next')continue;if(pass==='stop')break;logKw(env,c.type,code);return {out,code,ctl:pass,ui}}
    if(c.type==='while'?cr.code!==0:cr.code===0)break;
    const br=runList(c.body,inner);out.push(...br.out);if(br.ui)ui=br.ui;code=br.code;
    if(br.ctl){pass=loopCtl(br.ctl,env.loops);if(pass==='next')continue;if(pass==='stop')break;logKw(env,c.type,code);return {out,code,ctl:pass,ui}}}
  logKw(env,c.type,code);return {out,code,ui}}

/* for: the list expands once, one 'for' log entry with the items, then one step per pass. The loop variable stays set afterwards. */
function runFor(c,env){const out=[];let code=0,ui;
  let items=[],globbed=false;
  if(c.words===null)items=SQ.frame().args.slice();
  else{let toks;
    try{toks=expandWords(c.words)}catch(e){if(e&&e.stop)throw e;out.push(...CTX.pend.splice(0),errL(errOf(e)));return {out,code:e.code||2}}
    for(const w of toks){if(w.glob){globbed=true;items.push(...globExpand(w.v))}else items.push(w.v)}}
  out.push(...CTX.pend.splice(0));
  if(env.record)SQ.rt.log.push({name:'for',args:items,globbed,piped:false,redirect:null,code:0,out:''});
  const inner=Object.assign({},env,{loops:env.loops+1});
  for(const it of items){SQ.step();SQ.setVar(c.var,it);
    const br=runList(c.body,inner);out.push(...br.out);if(br.ui)ui=br.ui;code=br.code;
    if(br.ctl){const pass=loopCtl(br.ctl,env.loops);if(pass==='next')continue;if(pass==='stop')break;return {out,code,ctl:pass,ui}}}
  return {out,code,ui}}

function runCase(c,env){const out=[];let code=0,w;
  try{w=expandOne(c.word)}catch(e){if(e&&e.stop)throw e;out.push(...CTX.pend.splice(0),errL(errOf(e)));return {out,code:e.code||1}}
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

function runArith(c,env){SQ.step();let v;
  try{v=SQ.arithVal(c.expr)}catch(e){if(e&&e.stop)throw e;const out=[...CTX.pend.splice(0),errL(errOf(e))];logKw(env,'((',1);return {out,code:1}}
  const out=CTX.pend.splice(0),code=v!=='0'?0:1;logKw(env,'((',code);return {out,code}}

Object.assign(SQ,{runProgram,snapshotShell,restoreShell});
})(window.SQ=window.SQ||{});
