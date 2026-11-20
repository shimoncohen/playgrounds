(function (root) {
'use strict';
let realmsHost=null;
function init(o){realmsHost=o.host}
/* ---------- realm: a hidden same-origin iframe where code really runs ---------- */
let METHOD=null; // 'insert' (script tags; let/const persist like a real console) or 'eval' (fallback)
function makeRealm(hooks){
  const f=realmsHost.ownerDocument.createElement('iframe');f.className='realm';f.setAttribute('aria-hidden','true');f.tabIndex=-1;
  realmsHost.appendChild(f);
  const w=f.contentWindow,d=w.document;
  if(!d.body){d.open();d.write('<!doctype html><html><body></body></html>');d.close()}
  const R={f,w,d,err:null,capturing:false,silent:false,hooks,peek:{}};
  const say=(lvl)=>(...a)=>{if(!R.silent)hooks.out(lvl,a)};
  w.console.log=say('log');w.console.info=say('log');w.console.debug=say('log');
  w.console.warn=say('warn');w.console.error=say('error');
  w.console.table=(v)=>{if(!R.silent)hooks.out('table',[v])};
  w.console.clear=()=>hooks.clear&&hooks.clear();
  w.__out=v=>{R.last=v;R.hasLast=true};
  w.__p=(n,v,bad)=>{R.peek[n]=bad?{tdz:true}:{v}};
  w.addEventListener('error',e=>{
    const er=e.error!==undefined&&e.error!==null?e.error:{name:'Error',message:e.message};
    if(R.capturing){R.err=er}else if(!R.silent){hooks.asyncErr(er)}
    e.preventDefault();
  });
  w.addEventListener('unhandledrejection',e=>{if(!R.silent)hooks.asyncErr(e.reason,true);e.preventDefault()});
  if(root.Scheduler){
    // The app swaps w.setTimeout for a no-op on history replay, so keep the real one.
    const st=w.setTimeout.bind(w);
    R.guard=root.Scheduler.makeGuard(fn=>st(fn,0));
    w[root.Scheduler.GUARD_NAME]=()=>R.guard.tick();
  }
  if(!METHOD){
    w.__ok=0;const s=d.createElement('script');s.textContent='__ok=1';d.body.appendChild(s);s.remove();
    if(w.__ok===1)METHOD='insert';
    else{try{if(w.eval('1+1')===2)METHOD='eval'}catch(e){} if(!METHOD)METHOD='none'}
  }
  return R;
}
function killRealm(R){if(R&&R.f){try{R.silent=true;R.f.remove()}catch(e){}}}
function runScript(R,code){
  R.err=null;R.hasLast=false;R.last=undefined;
  if(R.guard)R.guard.reset();
  if(METHOD==='insert'){
    R.capturing=true;const s=R.d.createElement('script');s.textContent=code;
    try{R.d.body.appendChild(s)}finally{R.capturing=false;s.remove()}
    return R.err;
  }
  if(METHOD==='eval'){try{R.w.eval(code);return null}catch(e){return e}}
  return {name:'Error',message:'This browser blocked running code inside the page.'};
}

/* ---------- parsing helpers (acorn) ---------- */
const HAS_ACORN=()=>typeof acorn!=='undefined';
function parse(src){return acorn.parse(src,{ecmaVersion:'latest',sourceType:'script',allowAwaitOutsideFunction:true,allowReturnOutsideFunction:false})}
function isIncomplete(src){
  if(!HAS_ACORN()){let d=0,q=null;for(let i=0;i<src.length;i++){const c=src[i];if(q){if(c==='\\')i++;else if(c===q)q=null}else if(c==='"'||c==="'"||c==='`')q=c;else if('([{'.includes(c))d++;else if(')]}'.includes(c))d--}return d>0||!!q}
  try{parse(src);return false}catch(e){return e.pos>=src.trimEnd().length&&/Unexpected token|Unterminated/.test(e.message)}
}
function patNames(p,out){if(!p)return;switch(p.type){case'Identifier':out.push(p.name);break;case'ObjectPattern':p.properties.forEach(q=>patNames(q.type==='RestElement'?q.argument:q.value,out));break;case'ArrayPattern':p.elements.forEach(e=>patNames(e,out));break;case'RestElement':patNames(p.argument,out);break;case'AssignmentPattern':patNames(p.left,out);break}}
function topDecls(ast){
  const out=[];
  for(const n of ast.body){
    if(n.type==='VariableDeclaration'){for(const d of n.declarations){const ns=[];patNames(d.id,ns);ns.forEach(x=>out.push({name:x,kind:n.kind}))}}
    else if(n.type==='FunctionDeclaration'&&n.id)out.push({name:n.id.name,kind:'function'});
    else if(n.type==='ClassDeclaration'&&n.id)out.push({name:n.id.name,kind:'class'});
  }
  return out;
}
function hasTopAwait(ast){
  let found=false;
  (function walk(n,inFn){
    if(!n||found||typeof n.type!=='string')return;
    if(n.type==='AwaitExpression'&&!inFn){found=true;return}
    const fn=/Function/.test(n.type);
    for(const k in n){const v=n[k];if(k==='type'||k==='start'||k==='end')continue;
      if(Array.isArray(v))v.forEach(c=>c&&typeof c.type==='string'&&walk(c,inFn||fn));
      else if(v&&typeof v.type==='string')walk(v,inFn||fn)}
  })(ast,false);
  return found;
}
const guarded=code=>root.Scheduler?root.Scheduler.guardSource(code,parse):code;
// prepare: returns {code, decls, echo, error}
function prepare(src){
  if(!HAS_ACORN()){
    const t=src.trim();const decls=[];
    t.replace(/^\s*(let|const|var|function|class)\s+([A-Za-z_$][\w$]*)/gm,(m,k,n)=>{decls.push({name:n,kind:k})});
    const stmt=/^(let|const|var|function|class|if|for|while|do|switch|try|throw|return|import|export|\/\/|\{)/.test(t)||/[;\n]/.test(t.replace(/;\s*$/,''));
    return {code:stmt?src:'__out(('+t.replace(/;\s*$/,'')+'\n))',decls,echo:!stmt};
  }
  let ast;try{ast=parse(src)}catch(e){const er=new SyntaxError(e.message.replace(/\s*\(\d+:\d+\)$/,''));er.loc=e.loc;return {error:er}}
  const decls=topDecls(ast);
  if(hasTopAwait(ast)){
    // top-level await: run inside an async wrapper (declarations stay local to this run)
    const last=ast.body[ast.body.length-1];let body=src;
    if(last&&last.type==='ExpressionStatement')body=src.slice(0,last.start)+'return ('+src.slice(last.expression.start,last.expression.end)+');'+src.slice(last.end);
    return {code:guarded('(async()=>{\n'+body+'\n})().then(v=>{if(v!==undefined)__asyncOut(v)})'),decls:[],echo:false,async:true};
  }
  let code=src,echo=false;const last=ast.body[ast.body.length-1];
  if(last&&last.type==='ExpressionStatement'){
    code=src.slice(0,last.expression.start)+'__out(('+src.slice(last.expression.start,last.expression.end)+'\n));'+src.slice(last.end);echo=true;
  }
  if(METHOD==='eval'){
    // fallback: indirect eval forgets let/const, so turn them into globals
    const edits=[];
    for(const n of ast.body){
      if(n.type==='VariableDeclaration'&&n.kind!=='var')edits.push([n.start,n.start+n.kind.length,'var']);
      if(n.type==='ClassDeclaration'&&n.id)edits.push([n.start,n.start,'var '+n.id.name+' = ']);
    }
    edits.sort((a,b)=>b[0]-a[0]);
    let off=0;const shift=(echo&&last)?last.expression.start:Infinity;
    for(const [a,b,t] of edits){code=code.slice(0,a)+t+code.slice(b)}
    void off;void shift;
  }
  return {code:guarded(code),decls,echo,ast};
}
root.JSRealm={init,makeRealm,killRealm,runScript,prepare,isIncomplete,method:()=>METHOD};
})(typeof window !== 'undefined' ? window : globalThis);
