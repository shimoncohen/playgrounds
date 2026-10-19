(function (SQ) {
const S=SQ.S;
const {LIM,HOME,norm,getNode,bname,ok,E,globExpand,CTX,expandWords,CMDS,FRIENDLY,suggest}=SQ;
function runPath(name,io,force){const abs=norm(name),n=getNode(abs);
  if(!n)return E(SQ.isLoop(abs)?`bash: ${name}: Too many levels of symbolic links`:`bash: ${name}: No such file or directory`,127);
  if(n.type==='dir')return E(`bash: ${name}: Is a directory`,126);
  if(!force&&!n.exec)return Object.assign(E(`bash: ${name}: Permission denied`,126),{tips:[`Tip: mark it as runnable with chmod +x ${bname(abs)}`]});
  const sv=SQ.snapshotShell(),saveVars=S.vars;S.vars={};for(const k of Object.keys(S.exp||{}))if(k in saveVars)S.vars[k]=saveVars[k];const out=[],err=[];let code=0;
  try{for(const ln of n.content.split('\n')){const t=ln.trim();if(!t||t.startsWith('#'))continue;
    const r=execLine(t,{depth:io.depth+1,tty:io.tty,record:false,script:true});for(const o of r.out){if(o.clear)continue;(o.cls==='out'?out:err).push(o.text)}code=r.code;
    if(r.ctl&&r.ctl.type==='exit'){code=r.ctl.n;break}}} /* exit ends the script */
  finally{SQ.restoreShell(sv)}
  return {out:out.join('\n'),err,code}}

function runCmd(words,io){
  if(!words.length)return ok();
  SQ.step();
  const args=[];let globbed=false;let ew;
  try{ew=expandWords(words,words[0].raw==='export')}catch(e){if(e&&e.stop)throw e;CTX.pend.length=0;return E((e.raw?'':'bash: ')+e.message,e.code||2)}
  const pend=CTX.pend.splice(0).map(o=>o.text);
  if(!ew.length)return Object.assign(ok(),{err:pend});
  for(const w of ew){if(w.glob){globbed=true;args.push(...globExpand(w.v))}else args.push(w.v)}
  const name=args[0],a=args.slice(1);let r,lname=name;
  if(/^[A-Za-z_]\w*=/.test(name)&&args.length===1){const k=name.split('=')[0];S.vars[k]=name.slice(k.length+1);r=ok();lname='(assign)'}
  else if(args[1]==='='&&/^[A-Za-z_]\w*$/.test(name)){r=E(`bash: ${name}: command not found`,127);r.tips=[`Tip: no spaces around = when you set a variable. Try: ${name}="${a.slice(1).join(' ')||'value'}"`]}
  else if(SQ.hasFunction(name)){r=SQ.callFunction(name,a,io); /* functions beat builtins and commands; the call logs only its inner commands */
    if(pend.length){r.err=pend.concat(r.err);r.list=pend.map(t=>({text:t,cls:'err'})).concat(r.list)}
    return r}
  else if(name.includes('/'))r=runPath(name,io,false);
  else if((name==='break'||name==='continue')&&!CMDS[name])r=loopCtl(name,a,io);
  else if(name==='local'&&!CMDS.local)r=SQ.localBuiltin(a);
  else if(name==='return'&&!CMDS.return)r=SQ.returnBuiltin(a);
  else if(CMDS[name])r=CMDS[name](a,io);
  else if(FRIENDLY[name])r=E(FRIENDLY[name],127);
  else{r=E(`bash: ${name}: command not found`,127);const s=suggest(name);if(s)r.tips=[`Did you mean: ${s}?`]}
  if(pend.length)r.err=pend.concat(r.err||[]);
  if(r.out&&r.out.length>LIM.TEXT){r.out='';r.err=(r.err||[]).concat(`${lname}: output too large for this practice shell`);r.code=1}
  SQ.rt.outChars+=(r.out||'').length;if(SQ.rt.outChars>LIM.TOTAL)throw new SQ.StepLimit('output too large');
  if(io.record)SQ.rt.log.push({name:lname,args:a,globbed,piped:io.pipeLen>1,redirect:io.redirect,errRedirect:io.errRedirect,code:r.code,out:r.out||''});
  return r}

/* break/continue [N] inside a loop: a ctl signal the interpreter unwinds (the full builtins with their messages arrive in Task 7) */
function loopCtl(name,a,io){
  if(!io.loops)return E(`bash: ${name}: only meaningful in a \`for', \`while', or \`until' loop`,0);
  const n=a.length?Number(a[0]):1;
  if(!/^\d+$/.test(a[0]===undefined?'1':a[0]))return E(`bash: ${name}: ${a[0]}: numeric argument required`,1);
  if(n<1)return E(`bash: ${name}: ${a[0]}: loop count out of range`,1);
  return Object.assign(ok(),{ctl:{type:name,n}})}
const errOut=e=>({out:[{text:(e.raw?'':'bash: ')+e.message,cls:'err'}],code:e.code||2});
let nest=0;
/* prevLast: the exit code from before the outermost line ran, so a mission check can see what `$?` read. Lives on SQ.rt, not in saved state. */
function execLine(line,o){o=Object.assign({depth:0,tty:true,record:true},o);const outer=nest===0;
  if(outer){SQ.rt.prevLast=S.last;SQ.rt.steps=0;SQ.rt.outChars=0}
  const sd=CTX.depth;CTX.depth=o.depth;nest++;
  try{const r=execLine0(line,o);if(!outer)return r;
    SQ.rt.lastOut=r.out.filter(x=>x.cls==='out').map(x=>x.text).join('\n');return capLines(r)}
  catch(e){if(!outer)throw e; /* outermost call: any runaway or unexpected failure becomes one error line, state stays usable */
    SQ.rt.lastOut='';CTX.pend.length=0;S.last=1;return {out:[{text:e&&e.stop?e.message:'bash: internal error: '+(e&&e.message||e),cls:'err'}],code:1}}
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
  const r=SQ.runProgram(prog,{depth:o.depth,tty:o.tty,record:o.record,stdin:o.stdin||null});
  /* exit: a script or $( ) keeps the signal (the caller ends there); on a typed line there is nowhere to exit to */
  if(r.ctl&&r.ctl.type==='exit'){
    if(o.script)return r;
    if(o.sub){S.last=r.ctl.n;return {out:r.out,code:r.ctl.n}}
    r.out.push({text:FRIENDLY.exit,cls:'err'});S.last=127;return {out:r.out,code:127}}
  return r}

function ctxFor(line){const nd=p=>getNode(norm(p,HOME));return {line,cwd:S.cwd,log:SQ.rt.log,
  ran:(n,p)=>SQ.rt.log.some(e=>e.name===n&&(!p||p(e))),has:p=>!!nd(p),node:nd,
  isDir:p=>{const n=nd(p);return !!n&&n.type==='dir'},isFile:p=>{const n=nd(p);return !!n&&n.type==='file'},
  read:p=>{const n=nd(p);return n&&n.type==='file'?n.content:''},
  flag:(e,ch)=>e.args.some(x=>/^-[A-Za-z]+$/.test(x)&&x.includes(ch))}}
Object.assign(SQ,{runPath,runCmd,execLine,ctxFor});
})(window.SQ = window.SQ || {});
