(function (SQ) {
const S=SQ.S;
const {LIM,HOME,norm,getNode,bname,writeFile,ok,E,tokenize,parse,globExpand,CTX,expandWords,expandOne,isNull,CMDS,FRIENDLY,suggest}=SQ;
function runPath(name,io,force){const abs=norm(name),n=getNode(abs);
  if(!n)return E(SQ.isLoop(abs)?`bash: ${name}: Too many levels of symbolic links`:`bash: ${name}: No such file or directory`,127);
  if(n.type==='dir')return E(`bash: ${name}: Is a directory`,126);
  if(!force&&!n.exec)return Object.assign(E(`bash: ${name}: Permission denied`,126),{tips:[`Tip: mark it as runnable with chmod +x ${bname(abs)}`]});
  const saveCwd=S.cwd,saveVars=S.vars;S.vars={};for(const k of Object.keys(S.exp||{}))if(k in saveVars)S.vars[k]=saveVars[k];const out=[],err=[];let code=0;
  try{for(const ln of n.content.split('\n')){const t=ln.trim();if(!t||t.startsWith('#'))continue;
    const r=execLine(t,{depth:io.depth+1,tty:io.tty,record:false});for(const o of r.out){if(o.clear)continue;(o.cls==='out'?out:err).push(o.text)}code=r.code}}
  finally{S.cwd=saveCwd;S.vars=saveVars}
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
  else if(name.includes('/'))r=runPath(name,io,false);
  else if(CMDS[name])r=CMDS[name](a,io);
  else if(FRIENDLY[name])r=E(FRIENDLY[name],127);
  else{r=E(`bash: ${name}: command not found`,127);const s=suggest(name);if(s)r.tips=[`Did you mean: ${s}?`]}
  if(pend.length)r.err=pend.concat(r.err||[]);
  if(r.out&&r.out.length>LIM.TEXT){r.out='';r.err=(r.err||[]).concat(`${lname}: output too large for this practice shell`);r.code=1}
  SQ.rt.outChars+=(r.out||'').length;if(SQ.rt.outChars>LIM.TOTAL)throw new SQ.StepLimit('output too large');
  if(io.record)SQ.rt.log.push({name:lname,args:a,globbed,piped:io.pipeLen>1,redirect:io.redirect,errRedirect:io.errRedirect,code:r.code,out:r.out||''});
  return r}

const FOR_RE=/^for\s+([A-Za-z_]\w*)\s+in\s+(.*?)\s*;\s*do\s+(.*?)\s*;?\s*done\s*$/;
const errOut=e=>({out:[{text:(e.raw?'':'bash: ')+e.message,cls:'err'}],code:e.code||2});
let nest=0;
/* prevLast: the exit code from before the outermost line ran, so a mission check can see what `$?` read. Lives on SQ.rt, not in saved state. */
function execLine(line,o){o=Object.assign({depth:0,tty:true,record:true},o);const outer=nest===0;
  if(outer){SQ.rt.prevLast=S.last;SQ.rt.steps=0;SQ.rt.outChars=0}
  const sd=CTX.depth;CTX.depth=o.depth;nest++;
  try{const r=execLine0(line,o);return outer?capLines(r):r}
  catch(e){if(!outer)throw e; /* outermost call: any runaway or unexpected failure becomes one error line, state stays usable */
    CTX.pend.length=0;S.last=1;return {out:[{text:e&&e.stop?e.message:'bash: internal error: '+(e&&e.message||e),cls:'err'}],code:1}}
  finally{CTX.depth=sd;nest--}}
/* On-screen output per typed line is capped at LIM.LINES; the rest is replaced by one notice. */
function capLines(r){let n=0;const out=[];
  for(const o of r.out){if(o.clear||typeof o.text!=='string'){out.push(o);continue}
    const c=o.text.split('\n').length;
    if(n+c<=LIM.LINES){n+=c;out.push(o);continue}
    const keep=LIM.LINES-n;if(keep>0)out.push(Object.assign({},o,{text:o.text.split('\n').slice(0,keep).join('\n')}));
    out.push({text:`... output cut off after ${LIM.LINES} lines: this practice shell does not print more`,cls:'tip'});return {out,code:r.code}}
  return r}
function execLine0(line,o){const res=[];let code=0;
  if(o.depth>6)return {out:[{text:'bash: too many nested scripts',cls:'err'}],code:1};
  const t=line.trim();
  if(/^for\b/.test(t)){const fm=t.match(FOR_RE);
    if(!fm)return {out:[{text:'bash: for loop needs this shape: for x in a b c; do echo $x; done',cls:'err'}],code:2};
    let toks;try{toks=expandWords(tokenize(fm[2],{dry:true}).filter(w=>w.t==='w'))}catch(e){if(e&&e.stop)throw e;const r=errOut(e);r.out.unshift(...CTX.pend.splice(0));return r}
    res.push(...CTX.pend.splice(0));
    const items=[];let globbed=false;for(const w of toks){if(w.glob){globbed=true;items.push(...globExpand(w.v))}else items.push(w.v)}
    if(o.record)SQ.rt.log.push({name:'for',args:items,globbed,piped:false,redirect:null,code:0,out:''});
    for(const it of items){SQ.step();S.vars[fm[1]]=it;const r=execLine(fm[3],o);res.push(...r.out);code=r.code}
    S.last=code;return {out:res,code}}
  let seq;try{seq=parse(tokenize(line,{dry:true}))}catch(e){if(e&&e.stop)throw e;return errOut(e)}
  for(const item of seq){if(item.op==='&&'&&code!==0)continue;if(item.op==='||'&&code===0)continue;
    let stdin='';const P=item.pipe;
    for(let i=0;i<P.length;i++){const c=P[i],last=i===P.length-1;
      let out=null,inp=null,err=null;
      try{if(c.out)out={path:expandOne(c.out.w),append:c.out.append};if(c.inp)inp=expandOne(c.inp);if(c.err)err=c.err.dup?c.err:{path:expandOne(c.err.w),append:c.err.append}}
      catch(e){if(e&&e.stop)throw e;res.push(...CTX.pend.splice(0),{text:(e.raw?'':'bash: ')+e.message,cls:'err'});code=e.code||2;break}
      res.push(...CTX.pend.splice(0));
      if(inp!==null){if(isNull(inp))stdin='';else{const n=getNode(norm(inp));if(!n||n.type!=='file'){res.push({text:`bash: ${inp}: No such file or directory`,cls:'err'});code=1;break}stdin=n.content}}
      let bad=false;
      for(const t of [out,err&&err.path?err:null]){if(t&&!t.append){const e=writeFile(norm(t.path),'',false,t.path);if(e){res.push({text:e,cls:'err'});code=1;bad=true;break}}}
      if(bad)break;
      const r=runCmd(c.words,{stdin,tty:o.tty&&last&&!out,depth:o.depth,pipeLen:P.length,record:o.record,redirect:out,errRedirect:err});
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
    S.last=code}
  return {out:res,code}}


function ctxFor(line){const nd=p=>getNode(norm(p,HOME));return {line,cwd:S.cwd,log:SQ.rt.log,
  ran:(n,p)=>SQ.rt.log.some(e=>e.name===n&&(!p||p(e))),has:p=>!!nd(p),node:nd,
  isDir:p=>{const n=nd(p);return !!n&&n.type==='dir'},isFile:p=>{const n=nd(p);return !!n&&n.type==='file'},
  read:p=>{const n=nd(p);return n&&n.type==='file'?n.content:''},
  flag:(e,ch)=>e.args.some(x=>/^-[A-Za-z]+$/.test(x)&&x.includes(ch))}}
Object.assign(SQ,{runPath,runCmd,FOR_RE,execLine,ctxFor});
})(window.SQ = window.SQ || {});
