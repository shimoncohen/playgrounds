(function (SQ) {
const S=SQ.S;
const {HOME,norm,getNode,bname,writeFile,ok,E,tokenize,parse,globExpand,CMDS,FRIENDLY,suggest}=SQ;
function runPath(name,io,force){const abs=norm(name),n=getNode(abs);
  if(!n)return E(`bash: ${name}: No such file or directory`,127);
  if(n.type==='dir')return E(`bash: ${name}: Is a directory`,126);
  if(!force&&!n.exec)return Object.assign(E(`bash: ${name}: Permission denied`,126),{tips:[`Tip: mark it as runnable with chmod +x ${bname(abs)}`]});
  const saveCwd=S.cwd,saveVars=Object.assign({},S.vars);const out=[],err=[];let code=0;
  for(const ln of n.content.split('\n')){const t=ln.trim();if(!t||t.startsWith('#'))continue;
    const r=execLine(t,{depth:io.depth+1,tty:io.tty,record:false});for(const o of r.out){if(o.clear)continue;(o.cls==='out'?out:err).push(o.text)}code=r.code}
  S.cwd=saveCwd;S.vars=saveVars;return {out:out.join('\n'),err,code}}

function runCmd(words,io){
  if(!words.length)return ok();
  const args=[];let globbed=false;
  for(const w of words){if(w.glob){globbed=true;args.push(...globExpand(w.v))}else args.push(w.v)}
  const name=args[0],a=args.slice(1);let r,lname=name;
  if(/^[A-Za-z_]\w*=/.test(name)&&args.length===1){const k=name.split('=')[0];S.vars[k]=name.slice(k.length+1);r=ok();lname='(assign)'}
  else if(args[1]==='='&&/^[A-Za-z_]\w*$/.test(name)){r=E(`bash: ${name}: command not found`,127);r.tips=[`Tip: no spaces around = when you set a variable. Try: ${name}="${a.slice(1).join(' ')||'value'}"`]}
  else if(name.includes('/'))r=runPath(name,io,false);
  else if(CMDS[name])r=CMDS[name](a,io);
  else if(FRIENDLY[name])r=E(FRIENDLY[name],127);
  else{r=E(`bash: ${name}: command not found`,127);const s=suggest(name);if(s)r.tips=[`Did you mean: ${s}?`]}
  if(io.record)SQ.rt.log.push({name:lname,args:a,globbed,piped:io.pipeLen>1,redirect:io.redirect,code:r.code,out:r.out||''});
  return r}

const FOR_RE=/^for\s+([A-Za-z_]\w*)\s+in\s+(.*?)\s*;\s*do\s+(.*?)\s*;?\s*done\s*$/;
function execLine(line,o){o=Object.assign({depth:0,tty:true,record:true},o);const res=[];let code=0;
  if(o.depth>6)return {out:[{text:'bash: too many nested scripts',cls:'err'}],code:1};
  const t=line.trim();
  if(/^for\b/.test(t)){const fm=t.match(FOR_RE);
    if(!fm)return {out:[{text:'bash: for loop needs this shape: for x in a b c; do echo $x; done',cls:'err'}],code:2};
    let toks;try{toks=tokenize(fm[2])}catch(e){return {out:[{text:'bash: '+e.message,cls:'err'}],code:2}}
    const items=[];let globbed=false;for(const w of toks){if(w.t!=='w')continue;if(w.glob){globbed=true;items.push(...globExpand(w.v))}else items.push(w.v)}
    if(o.record)SQ.rt.log.push({name:'for',args:items,globbed,piped:false,redirect:null,code:0,out:''});
    for(const it of items){S.vars[fm[1]]=it;const r=execLine(fm[3],o);res.push(...r.out);code=r.code}
    S.last=code;return {out:res,code}}
  let seq;try{seq=parse(tokenize(line))}catch(e){return {out:[{text:'bash: '+e.message,cls:'err'}],code:2}}
  for(const item of seq){if(item.op==='&&'&&code!==0)continue;if(item.op==='||'&&code===0)continue;
    let stdin='';const P=item.pipe;
    for(let i=0;i<P.length;i++){const c=P[i],last=i===P.length-1;
      if(c.inp){const n=getNode(norm(c.inp));if(!n||n.type!=='file'){res.push({text:`bash: ${c.inp}: No such file or directory`,cls:'err'});code=1;break}stdin=n.content}
      if(c.out&&!c.out.append){const e=writeFile(norm(c.out.path),'',false,c.out.path);if(e){res.push({text:e,cls:'err'});code=1;break}}
      const r=runCmd(c.words,{stdin,tty:o.tty&&last&&!c.out,depth:o.depth,pipeLen:P.length,record:o.record,redirect:c.out});
      if(r.clear)res.push({clear:true});
      r.err.forEach(e=>res.push({text:e,cls:'err'}));(r.tips||[]).forEach(e=>res.push({text:e,cls:'tip'}));
      code=r.code;
      if(c.out){const e=writeFile(norm(c.out.path),r.out,c.out.append,c.out.path);if(e){res.push({text:e,cls:'err'});code=1}stdin=''}
      else if(last){if(r.out!=='')res.push({text:r.out,cls:'out'})}
      else stdin=r.out}
    S.last=code}
  return {out:res,code}}


function ctxFor(line){const nd=p=>getNode(norm(p,HOME));return {line,cwd:S.cwd,log:SQ.rt.log,
  ran:(n,p)=>SQ.rt.log.some(e=>e.name===n&&(!p||p(e))),has:p=>!!nd(p),node:nd,
  isDir:p=>{const n=nd(p);return !!n&&n.type==='dir'},isFile:p=>{const n=nd(p);return !!n&&n.type==='file'},
  read:p=>{const n=nd(p);return n&&n.type==='file'?n.content:''},
  flag:(e,ch)=>e.args.some(x=>/^-[A-Za-z]+$/.test(x)&&x.includes(ch))}}
Object.assign(SQ,{runPath,runCmd,FOR_RE,execLine,ctxFor});
})(window.SQ = window.SQ || {});
