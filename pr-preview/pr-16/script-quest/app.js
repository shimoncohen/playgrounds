
(()=>{
"use strict";
// ================= ENGINE =================
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const tagOf=v=>Object.prototype.toString.call(v).slice(8,-1);
const realmsHost=$('#realms');

/* ---------- realm: a hidden same-origin iframe where code really runs ---------- */
let METHOD=null; // 'insert' (script tags; let/const persist like a real console) or 'eval' (fallback)
function makeRealm(hooks){
  const f=document.createElement('iframe');f.className='realm';f.setAttribute('aria-hidden','true');f.tabIndex=-1;
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
    return {code:'(async()=>{\n'+body+'\n})().then(v=>{if(v!==undefined)__asyncOut(v)})',decls:[],echo:false,async:true};
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
  return {code,decls,echo,ast};
}

/* ---------- value formatting ---------- */
let refIds=new WeakMap(),refN=0;
const refId=o=>{if(!refIds.has(o))refIds.set(o,++refN);return refIds.get(o)};
const promState=new WeakMap();
let onPromSettle=()=>{};
function pstate(p){
  if(!promState.has(p)){const st={s:'pending'};promState.set(p,st);
    try{p.then(v=>{st.s='fulfilled';st.v=v;onPromSettle()},e=>{st.s='rejected';st.v=e;onPromSettle()})}catch(e){}}
  return promState.get(p);
}
class FakeBuffer{constructor(s){this._s=String(s)}toString(){return this._s}get length(){return this._s.length}}
function fnSig(f){
  let s='';try{s=Function.prototype.toString.call(f)}catch(e){}
  if(/^class\b/.test(s))return {cls:true,txt:'class '+(f.name||'')};
  const asy=/^async\b/.test(s)?'async ':'';
  let m=s.match(/^(?:async\s*)?(?:function\s*\*?\s*[\w$]*\s*)?\(([^)]*)\)/);
  let params=m?m[1]:(s.match(/^(?:async\s+)?([\w$]+)\s*=>/)||[])[1]||'';
  params=params.replace(/\s+/g,' ').trim();
  const arrow=/=>/.test(s.split('{')[0])&&!/^(async\s*)?function/.test(s);
  return {cls:false,txt:asy+(arrow?'('+params+') => …':'ƒ '+(f.name||'anonymous')+'('+params+')')};
}
function fmt(v,depth=0,raw=false){
  const t=typeof v;
  if(v===undefined)return '<span class="v-u">undefined</span>';
  if(v===null)return '<span class="v-u">null</span>';
  if(t==='string')return raw?esc(v):'<span class="v-s">'+esc(JSON.stringify(v))+'</span>';
  if(t==='number'||t==='bigint')return '<span class="v-n">'+esc(Object.is(v,-0)?'-0':String(v)+(t==='bigint'?'n':''))+'</span>';
  if(t==='boolean')return '<span class="v-b">'+v+'</span>';
  if(t==='symbol')return '<span class="v-c">'+esc(String(v))+'</span>';
  if(t==='function'){const s=fnSig(v);return '<span class="v-f">'+esc(s.cls?s.txt:s.txt)+'</span>'}
  if(v instanceof FakeBuffer){const hex=[...v._s].slice(0,12).map(c=>c.charCodeAt(0).toString(16).padStart(2,'0')).join(' ');return '<span class="v-c">&lt;Buffer '+hex+(v._s.length>12?' …':'')+'&gt;</span>'}
  const tg=tagOf(v);
  if(tg==='Error'||(v&&typeof v.message==='string'&&typeof v.name==='string'&&'stack' in v))return '<span class="v-e">'+esc(v.name+': '+v.message)+'</span>';
  if(tg==='Promise'){const st=pstate(v);return '<span class="v-c">Promise</span> {'+(st.s==='pending'?'<span class="v-u">&lt;pending&gt;</span>':(st.s==='rejected'?'<span class="v-e">&lt;rejected&gt;</span> ':'')+fmt(st.v,depth+1))+'}'}
  if(tg==='Date')return '<span class="v-c">'+esc(isNaN(v)?'Invalid Date':v.toISOString())+'</span>';
  if(tg==='RegExp')return '<span class="v-c">'+esc(String(v))+'</span>';
  if(tg==='Map'){if(depth>2)return 'Map('+v.size+')';return 'Map('+v.size+') {'+[...v].slice(0,10).map(([k,x])=>fmt(k,depth+1)+' =&gt; '+fmt(x,depth+1)).join(', ')+'}'}
  if(tg==='Set'){if(depth>2)return 'Set('+v.size+')';return 'Set('+v.size+') {'+[...v].slice(0,15).map(x=>fmt(x,depth+1)).join(', ')+'}'}
  if(Array.isArray(v)){
    if(depth>2)return '[Array('+v.length+')]';
    const items=[];for(let i=0;i<Math.min(v.length,25);i++)items.push(i in v?fmt(v[i],depth+1):'<span class="v-u">empty</span>');
    if(v.length>25)items.push('<span class="v-u">… '+(v.length-25)+' more</span>');
    return '['+items.join(', ')+']';
  }
  if(t==='object'){
    let ctor='';try{const p=Object.getPrototypeOf(v);ctor=p&&p.constructor&&p.constructor.name!=='Object'?p.constructor.name+' ':''}catch(e){}
    if(depth>2)return ctor+'{…}';
    let keys=[];try{keys=Object.keys(v)}catch(e){}
    const parts=keys.slice(0,20).map(k=>'<span class="v-k">'+esc(/^[A-Za-z_$][\w$]*$/.test(k)?k:JSON.stringify(k))+'</span>: '+fmt(v[k],depth+1));
    if(keys.length>20)parts.push('…');
    return esc(ctor)+(parts.length?'{ '+parts.join(', ')+' }':'{}');
  }
  return esc(String(v));
}
const toText=html=>{const d=document.createElement('div');d.innerHTML=html;return d.textContent};
function fmtArgs(a){return a.map(x=>fmt(x,0,typeof x==='string')).join(' ')}
function tableHTML(v){
  if(!v||typeof v!=='object')return fmt(v);
  const rows=Array.isArray(v)?v.map((x,i)=>[i,x]):Object.keys(v).map(k=>[k,v[k]]);
  const cols=[];rows.forEach(([,x])=>{if(x&&typeof x==='object')Object.keys(x).forEach(k=>{if(!cols.includes(k))cols.push(k)})});
  const prim=rows.some(([,x])=>!x||typeof x!=='object');
  let h='<div class="tblwrap"><table class="ctable"><tr><th>(index)</th>'+cols.map(c=>'<th>'+esc(c)+'</th>').join('')+(prim?'<th>Values</th>':'')+'</tr>';
  rows.forEach(([k,x])=>{h+='<tr><td>'+esc(k)+'</td>'+cols.map(c=>'<td>'+(x&&typeof x==='object'&&c in x?fmt(x[c],2):'')+'</td>').join('')+(prim?'<td>'+(!x||typeof x!=='object'?fmt(x,2):'')+'</td>':'')+'</tr>'});
  return h+'</table></div>';
}

/* ---------- TypeScript (loaded on demand) ---------- */
const TS_URL='https://cdn.jsdelivr.net/npm/typescript@5.9.3/lib/typescript.min.js';
const TS_URL2='https://cdn.jsdelivr.net/npm/typescript@5.9.3/lib/typescript.js';
let tsState='idle',tsWaiters=[];
function loadTS(){
  if(tsState==='ready')return Promise.resolve(true);
  if(tsState==='failed')return Promise.resolve(false);
  return new Promise(res=>{tsWaiters.push(res);if(tsState==='loading')return;tsState='loading';
    const done=ok=>{tsState=ok?'ready':'failed';tsWaiters.splice(0).forEach(f=>f(ok))};
    const add=(url,next)=>{const s=document.createElement('script');s.src=url;s.onload=()=>done(typeof ts!=='undefined');s.onerror=next;document.head.appendChild(s)};
    add(TS_URL,()=>add(TS_URL2,()=>done(false)));
  });
}
const TS_LIB=`interface Object { toString(): string; hasOwnProperty(k: PropertyKey): boolean; }
interface Function { apply(t: any, a?: any): any; call(t: any, ...a: any[]): any; bind(t: any, ...a: any[]): any; readonly name: string; readonly length: number; }
interface CallableFunction extends Function {}
interface NewableFunction extends Function {}
interface IArguments { [i: number]: any; length: number; }
interface RegExp { test(s: string): boolean; }
interface Boolean {}
interface Symbol {}
type PropertyKey = string | number | symbol;
interface Number { toFixed(d?: number): string; toString(radix?: number): string; }
interface String {
  readonly length: number; [i: number]: string;
  toUpperCase(): string; toLowerCase(): string; trim(): string;
  includes(s: string): boolean; startsWith(s: string): boolean; endsWith(s: string): boolean;
  split(sep: string): string[]; slice(a?: number, b?: number): string; repeat(n: number): string;
  padStart(n: number, f?: string): string; padEnd(n: number, f?: string): string;
  charAt(i: number): string; indexOf(s: string): number; replace(a: string | RegExp, b: string): string;
  at(i: number): string | undefined;
}
interface TemplateStringsArray extends ReadonlyArray<string> { readonly raw: readonly string[]; }
interface ReadonlyArray<T> {
  readonly length: number; readonly [n: number]: T;
  map<U>(f: (v: T, i: number, a: readonly T[]) => U): U[];
  filter(f: (v: T, i: number, a: readonly T[]) => unknown): T[];
  forEach(f: (v: T, i: number, a: readonly T[]) => void): void;
  includes(v: T): boolean; indexOf(v: T): number; join(s?: string): string; slice(a?: number, b?: number): T[];
  find(f: (v: T, i: number) => unknown): T | undefined;
}
interface Array<T> {
  length: number; [n: number]: T;
  push(...items: T[]): number; pop(): T | undefined; shift(): T | undefined; unshift(...items: T[]): number;
  map<U>(f: (v: T, i: number, a: T[]) => U): U[];
  filter<S extends T>(f: (v: T, i: number, a: T[]) => v is S): S[];
  filter(f: (v: T, i: number, a: T[]) => unknown): T[];
  reduce(f: (acc: T, v: T, i: number, a: T[]) => T): T;
  reduce<U>(f: (acc: U, v: T, i: number, a: T[]) => U, init: U): U;
  forEach(f: (v: T, i: number, a: T[]) => void): void;
  find(f: (v: T, i: number, a: T[]) => unknown): T | undefined;
  findIndex(f: (v: T, i: number, a: T[]) => unknown): number;
  some(f: (v: T, i: number, a: T[]) => unknown): boolean;
  every(f: (v: T, i: number, a: T[]) => unknown): boolean;
  includes(v: T): boolean; indexOf(v: T): number; join(s?: string): string;
  slice(a?: number, b?: number): T[]; splice(a: number, n?: number, ...items: T[]): T[];
  concat(...items: (T | T[])[]): T[]; reverse(): T[]; sort(f?: (a: T, b: T) => number): this;
  at(i: number): T | undefined;
}
interface ArrayConstructor { isArray(a: any): a is any[]; from<T>(a: ArrayLike<T>): T[]; }
interface ArrayLike<T> { readonly length: number; readonly [n: number]: T; }
declare var Array: ArrayConstructor;
interface PromiseLike<T> { then<R = T>(ok?: (v: T) => R | PromiseLike<R>): PromiseLike<R>; }
interface Promise<T> {
  then<R = T>(ok?: (v: T) => R | PromiseLike<R>, bad?: (e: any) => any): Promise<R>;
  catch(bad: (e: any) => any): Promise<T>;
  finally(f: () => void): Promise<T>;
}
interface PromiseConstructor {
  new <T>(fn: (resolve: (v: T) => void, reject: (e?: any) => void) => void): Promise<T>;
  resolve<T>(v: T): Promise<T>; all<T>(ps: Promise<T>[]): Promise<T[]>;
}
declare var Promise: PromiseConstructor;
type Awaited<T> = T extends PromiseLike<infer U> ? Awaited<U> : T;
interface Error { name: string; message: string; }
interface ErrorConstructor { new (message?: string): Error; (message?: string): Error; }
declare var Error: ErrorConstructor;
declare var TypeError: ErrorConstructor;
interface Math { random(): number; floor(x: number): number; ceil(x: number): number; round(x: number): number; max(...v: number[]): number; min(...v: number[]): number; abs(x: number): number; sqrt(x: number): number; readonly PI: number; }
declare var Math: Math;
interface JSON { stringify(v: any, r?: any, s?: number | string): string; parse(s: string): any; }
declare var JSON: JSON;
declare function Number(v?: any): number;
declare function String(v?: any): string;
declare function Boolean(v?: any): boolean;
declare function parseInt(s: string, radix?: number): number;
declare function setTimeout(f: () => void, ms?: number): number;
interface Console { log(...a: any[]): void; error(...a: any[]): void; warn(...a: any[]): void; table(v: any): void; }
declare var console: Console;
type Partial<T> = { [P in keyof T]?: T[P] };
type Required<T> = { [P in keyof T]-?: T[P] };
type Readonly<T> = { readonly [P in keyof T]: T[P] };
type Pick<T, K extends keyof T> = { [P in K]: T[P] };
type Record<K extends keyof any, T> = { [P in K]: T };
type Exclude<T, U> = T extends U ? never : T;
type Omit<T, K extends keyof any> = Pick<T, Exclude<keyof T, K>>;
type ReturnType<T extends (...a: any) => any> = T extends (...a: any) => infer R ? R : any;`;
function tsCheck(prev,src){
  const opts={noLib:true,strict:true,target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.None,noEmit:true,types:[]};
  const head=prev.join('\n;\n')+(prev.length?'\n;\n':'');
  const files={'lib.d.ts':TS_LIB,'main.ts':head+src};
  const host={getSourceFile:(n,v)=>files[n]!=null?ts.createSourceFile(n,files[n],v):undefined,getDefaultLibFileName:()=>'lib.d.ts',writeFile(){},getCurrentDirectory:()=>'/',getDirectories:()=>[],fileExists:n=>n in files,readFile:n=>files[n],getCanonicalFileName:n=>n,useCaseSensitiveFileNames:()=>true,getNewLine:()=>'\n'};
  const prog=ts.createProgram(['lib.d.ts','main.ts'],opts,host);
  const diags=[...prog.getSyntacticDiagnostics(),...prog.getSemanticDiagnostics()];
  const headLines=head.split('\n').length-1;const out=[];
  for(const d of diags){
    if(!d.file||d.file.fileName!=='main.ts'||d.start<head.length)continue;
    const p=d.file.getLineAndCharacterOfPosition(d.start);
    out.push({line:p.line-headLines+1,col:p.character+1,code:d.code,msg:ts.flattenDiagnosticMessageText(d.messageText,'\n')});
  }
  const js=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.None},reportDiagnostics:false}).outputText.replace(/^export \{\};\s*$/m,'');
  const types=[];
  const sf=ts.createSourceFile('x.ts',src,ts.ScriptTarget.ES2020,true);
  sf.statements.forEach(st=>{
    if(ts.isInterfaceDeclaration(st))types.push({name:st.name.text,kind:'interface',text:st.getText(sf)});
    else if(ts.isTypeAliasDeclaration(st))types.push({name:st.name.text,kind:'type',text:st.getText(sf)});
  });
  return {diags:out,js,types};
}

/* ---------- virtual Node.js ---------- */
const NODE_VERSION='v22.12.0';
const COWSAY=(text)=>{const t=String(text);const bar='_'.repeat(t.length+2),low='-'.repeat(t.length+2);
  return ' '+bar+'\n< '+t+' >\n '+low+'\n        \\   ^__^\n         \\  (oo)\\_______\n            (__)\\       )\\/\\\n                ||----w |\n                ||     ||'};
function makeNodeEnv(R,vfs,file,args,io){
  const cwd='/home/you/my-app';
  const cache={};
  const norm=p=>String(p).replace(/^\.\//,'').replace(/^\/home\/you\/my-app\//,'');
  const enoent=(p,op)=>{const e=new Error("ENOENT: no such file or directory, "+op+" '"+p+"'");e.code='ENOENT';return e};
  const fs={
    readFileSync(p,enc){const k=norm(p);if(!(k in vfs.files))throw enoent(p,'open');const enc2=typeof enc==='object'&&enc?enc.encoding:enc;return enc2?vfs.files[k]:new FakeBuffer(vfs.files[k])},
    writeFileSync(p,data){const k=norm(p);if(k.includes('/'))throw enoent(p,'open');vfs.write(k,String(data))},
    appendFileSync(p,data){const k=norm(p);vfs.write(k,(vfs.files[k]||'')+String(data))},
    existsSync(p){return norm(p) in vfs.files||norm(p)==='node_modules'&&vfs.hasModules()},
    readdirSync(){return vfs.list()},
    unlinkSync(p){const k=norm(p);if(!(k in vfs.files))throw enoent(p,'unlink');vfs.remove(k)},
  };
  fs.promises={readFile:async(p,e)=>fs.readFileSync(p,e||'utf8'),writeFile:async(p,d)=>fs.writeFileSync(p,d)};
  fs.readFile=(p,e,cb)=>{if(typeof e==='function'){cb=e;e=null}setTimeout(()=>{try{cb(null,fs.readFileSync(p,e))}catch(er){cb(er)}},5)};
  const path={join:(...a)=>a.join('/').replace(/\/+/g,'/').replace(/\/\.\//g,'/'),basename:(p,ext)=>{let b=String(p).split('/').pop();if(ext&&b.endsWith(ext))b=b.slice(0,-ext.length);return b},extname:p=>{const m=String(p).match(/\.[^./]+$/);return m?m[0]:''},dirname:p=>String(p).split('/').slice(0,-1).join('/')||'.',resolve:(...a)=>cwd+'/'+a.join('/'),sep:'/'};
  const os={platform:()=>'linux',homedir:()=>'/home/you',userInfo:()=>({username:'you'}),EOL:'\n',cpus:()=>[{model:'Playground CPU'}]};
  const process={argv:['/usr/local/bin/node',cwd+'/'+file,...args],env:{HOME:'/home/you',USER:'you',NODE_ENV:'development'},platform:'linux',version:NODE_VERSION,versions:{node:NODE_VERSION.slice(1)},cwd:()=>cwd,exit:(c=0)=>{const e=new Error('__exit__');e.__exit=c;throw e},pid:4242,
    stdout:{write:s=>{io.out('raw',[String(s).replace(/\n$/,'')]);return true}}};
  const builtins={fs,path,os,process};
  function require(spec){
    spec=String(spec).replace(/^node:/,'');
    if(spec in builtins)return builtins[spec];
    if(/^\.\.?\//.test(spec)){
      let k=norm(spec);if(!(k in vfs.files)&&(k+'.js') in vfs.files)k+='.js';
      if(!(k in vfs.files)&&(k+'.json') in vfs.files)k+='.json';
      if(!(k in vfs.files)){const e=new Error("Cannot find module '"+spec+"'");e.code='MODULE_NOT_FOUND';throw e}
      if(k.endsWith('.json'))return JSON.parse(vfs.files[k]);
      return loadModule(k);
    }
    if(spec==='cowsay'&&vfs.installed('cowsay'))return {say:o=>COWSAY(o&&o.text!==undefined?o.text:o),think:o=>COWSAY(o&&o.text!==undefined?o.text:o).replace(/\\/g,'o')};
    const e=new Error("Cannot find module '"+spec+"'"+(spec==='cowsay'?'\n(Install it first: npm install cowsay)':''));e.code='MODULE_NOT_FOUND';throw e;
  }
  function loadModule(k,code){
    if(cache[k])return cache[k].exports;
    const module={exports:{}};cache[k]=module;
    R.w.__defs=R.w.__defs||{};
    const src=code!==undefined?code:vfs.files[k];
    if(k.endsWith('.json')){module.exports=JSON.parse(src);return module.exports}
    const er=runScript(R,'__defs['+JSON.stringify(k)+']=function(require,module,exports,__filename,__dirname,process){'+src+'\n}');
    if(er){delete cache[k];er.__file=k;throw er}
    R.w.__defs[k](require,module,module.exports,cwd+'/'+k,cwd,process);
    return module.exports;
  }
  return {require,loadModule,process};
}

// ================= CURRICULUM =================
// mission: {title, goal, code (shown in goal), anat, answer, explain, hint, check(c), need:[names], pre:'code', expectError:true}
const isArr=Array.isArray;
const logsHave=(c,re)=>c.logs.some(l=>re.test(l));
const CH=[
{name:'Say hello',group:'JavaScript basics',badge:'First Words',mode:'js',
 intro:'This dark box is a JavaScript console. You type code, press Enter, and it runs right away. Every program you will ever write starts with a few lines like these.',
 learned:['console.log()','numbers','strings','+ - * /','typeof','// comments'],
 missions:[
 {title:'Your first line of code',goal:'Make the console print a greeting.',code:'console.log("Hello, world!")',
  anat:[['console','name'],['.log','fn'],['(','op'],['"Hello, world!"','val'],[')','op']],
  explain:'<code>console.log</code> prints whatever you put inside the brackets. Text in quotes is called a <b>string</b>. Change the words if you like: any greeting counts.',
  hint:'Watch the quotes and the brackets: every <code>(</code> needs a <code>)</code>, every <code>"</code> needs a closing <code>"</code>.',
  check:c=>c.ok&&/console\.log/.test(c.src)&&c.logs.length>0},
 {title:'Use it as a calculator',goal:'Type a sum with no console.log at all, and press Enter.',code:'7 * 6',
  anat:[['7','val'],['*','op'],['6','val']],
  explain:'When you type a value straight into the console, it shows the result in grey after an arrow. <code>*</code> means times, <code>/</code> divides, <code>%</code> gives the remainder.',
  check:c=>c.ok&&c.hasValue&&typeof c.value==='number'&&/[\d)]\s*[-+*/%]\s*[\d(]/.test(c.src)},
 {title:'Glue words together',goal:'Join two strings with a plus sign.',code:'"Java" + "Script"',
  anat:[['"Java"','val'],['+','op'],['"Script"','val']],
  explain:'With strings, <code>+</code> does not add. It sticks them together end to end. That is called <b>concatenation</b>. Notice there is no space between the words unless you put one inside the quotes.',
  check:c=>c.ok&&typeof c.value==='string'&&/\+/.test(c.src)},
 {title:'Ask what type something is',goal:'Use typeof to ask what kind of value 42 is.',code:'typeof 42',
  anat:[['typeof','kw'],['42','val']],
  explain:'Every value has a <b>type</b>. The main ones are <code>number</code>, <code>string</code> and <code>boolean</code> (true or false). Try <code>typeof "42"</code> next and compare. The quotes change everything.',
  check:c=>c.ok&&/^\s*typeof\b/.test(c.src)&&typeof c.value==='string'},
 {title:'The famous mix-up',goal:'Add a string and a number. Predict the answer first.',code:'"5" + 5',
  anat:[['"5"','val'],['+','op'],['5','val']],
  explain:'You get <code>"55"</code>, not 10. When one side of <code>+</code> is a string, JavaScript turns the other side into a string too and glues them. This trips up everyone once. Now you know.',
  check:c=>c.ok&&c.value==='55'},
 {title:'Print several things at once',goal:'Give console.log more than one value, separated by commas.',code:'console.log("Level", 1, true)',
  anat:[['console.log','fn'],['"Level"','val'],[',','op'],['1','val'],[',','op'],['true','val']],
  explain:'Commas separate the values. console.log prints them in a row with spaces between. Very handy for labelling what you print: <code>console.log("score:", 10)</code>.',
  check:c=>c.ok&&/console\.log\s*\([^)]*,/.test(c.src)&&c.logs.length>0},
 {title:'Leave a note for humans',goal:'Write a line of code with a comment after it.',code:'console.log("hi") // this says hi',
  anat:[['console.log("hi")','fn'],['// this says hi','kw']],
  explain:'Everything after <code>//</code> on a line is a <b>comment</b>. JavaScript ignores it completely. Comments are notes for the people reading your code, including future you.',
  check:c=>c.ok&&/\/\//.test(c.src)},
 ]},
{name:'Named boxes',group:'JavaScript basics',badge:'Box Keeper',mode:'js',
 intro:'A variable is a labelled box that holds a value. Watch the Memory panel: every box you create appears there, and it updates live as the values change.',
 learned:['let','const','=','+=','++','template strings'],
 missions:[
 {title:'Make your first box',goal:'Create a variable called score that starts at 0.',code:'let score = 0',
  anat:[['let','kw'],['score','name'],['=','op'],['0','val']],
  explain:'<code>let</code> makes a new box. <code>score</code> is its label. <code>=</code> means <b>put this value in the box</b>. It does not mean "equals" like in maths. Look right: a box called score just appeared in Memory.',
  check:c=>c.has('score')&&typeof c.val('score')==='number'},
 {title:'Change what is inside',goal:'Add 10 to score.',code:'score = score + 10',need:['score'],pre:'let score = 0',
  anat:[['score','name'],['=','op'],['score + 10','val']],
  explain:'Read it right to left: work out <code>score + 10</code> first, then put the result back in the box. The box flashes in Memory when its value changes.',
  check:c=>c.ok&&/score\s*=\s*score\s*\+/.test(c.src)},
 {title:'The shortcut',goal:'Add 5 more with the shorthand operator.',code:'score += 5',need:['score'],pre:'let score = 10',
  anat:[['score','name'],['+=','op'],['5','val']],
  explain:'<code>score += 5</code> is short for <code>score = score + 5</code>. There are also <code>-=</code>, <code>*=</code> and <code>/=</code>.',
  check:c=>c.ok&&/score\s*\+=/.test(c.src)},
 {title:'Count up by one',goal:'Use ++ to add exactly one.',code:'score++',need:['score'],pre:'let score = 15',
  anat:[['score','name'],['++','op']],
  explain:'<code>++</code> adds one and <code>--</code> takes one away. You will see these all the time in loops.',
  check:c=>c.ok&&/(score\s*\+\+|\+\+\s*score)/.test(c.src)},
 {title:'A box that never changes',goal:'Store a player name with const.',code:'const player = "Ada"',
  anat:[['const','kw'],['player','name'],['=','op'],['"Ada"','val']],
  explain:'<code>const</code> also makes a box, but it is locked: once filled, you cannot put anything else in it. Memory marks it with a <b>CONST</b> tag. Good habit: use <code>const</code> by default, and <code>let</code> only when the value needs to change.',
  check:c=>c.kind('player')==='const'},
 {title:'Try to break the lock',goal:'Try to give player a new value. This one is supposed to fail.',code:'player = "Bob"',need:['player'],pre:'const player = "Ada"',expectError:true,
  anat:[['player','name'],['=','op'],['"Bob"','val']],
  explain:'Red text is not a disaster. It is JavaScript explaining what went wrong. <code>TypeError: Assignment to constant variable</code> means exactly what it says. Reading error messages is a real skill. You just practised it.',
  check:c=>c.err&&c.err.name==='TypeError'&&/constant/i.test(c.err.message)},
 {title:'Fill in the blanks',goal:'Build a sentence with a template string. Use backticks, not quotes.',code:'`${player} has ${score} points`',need:['player','score'],pre:'const player = "Ada"\nlet score = 16',
  anat:[['`','op'],['${player}','name'],[' has ','val'],['${score}','name'],[' points`','val']],
  explain:'Backticks (the key under Esc) make a <b>template string</b>. Anything inside <code>${ }</code> gets worked out and dropped into the text. Much tidier than gluing with <code>+</code>.',
  hint:'The backtick key <kbd>`</kbd> is usually top-left, under Esc. On a phone, use the <b>`</b> button above the keyboard.',
  check:c=>c.ok&&typeof c.value==='string'&&/\$\{/.test(c.src)},
 ]},
{name:'True or false',group:'JavaScript basics',badge:'Truth Seeker',mode:'js',
 intro:'Programs make decisions by asking yes-or-no questions. Before deciding, you need to know how JavaScript compares things and what it counts as true.',
 learned:['Number()','===','==','undefined','null','Boolean()','&& || !','??'],
 missions:[
 {title:'Turn text into a number',goal:'Convert the string "42" into a number, then add 8.',code:'Number("42") + 8',
  anat:[['Number','fn'],['("42")','val'],['+','op'],['8','val']],
  explain:'Text typed by users always arrives as a string. <code>Number()</code> converts it, so <code>+</code> does real maths: 50, not "428".',
  check:c=>c.ok&&c.value===50},
 {title:'Strict comparison',goal:'Ask whether the number 5 is the same as the string "5".',code:'5 === "5"',
  anat:[['5','val'],['===','op'],['"5"','val']],
  explain:'<code>===</code> asks "same value <b>and</b> same type?" A number and a string are different types, so: <code>false</code>. Comparisons always answer with a <b>boolean</b>.',
  check:c=>c.ok&&c.value===false&&/===/.test(c.src)},
 {title:'The loose one',goal:'Now try the same question with two equals signs.',code:'5 == "5"',
  anat:[['5','val'],['==','op'],['"5"','val']],
  explain:'<code>==</code> quietly converts types before comparing, so it says <code>true</code>. That sounds friendly but causes sneaky bugs. Professional rule: always use <code>===</code> (and <code>!==</code> for "not equal").',
  check:c=>c.ok&&c.value===true&&/[^=!]==[^=]/.test(c.src)},
 {title:'An empty box',goal:'Make a variable without giving it a value.',code:'let mystery',
  anat:[['let','kw'],['mystery','name']],
  explain:'The box exists but holds <code>undefined</code>: "nothing has been put here yet". Its cousin <code>null</code> means "deliberately empty". Check the grey value in Memory.',
  check:c=>c.has('mystery')&&c.val('mystery')===undefined},
 {title:'Truthy and falsy',goal:'Ask Boolean() whether an empty string counts as true.',code:'Boolean("")',
  anat:[['Boolean','fn'],['("")','val']],
  explain:'Only six values count as false: <code>false</code>, <code>0</code>, <code>""</code>, <code>null</code>, <code>undefined</code> and <code>NaN</code>. Everything else is <b>truthy</b>, even <code>"0"</code> and <code>"false"</code>. Try <code>Boolean("hi")</code>.',
  check:c=>c.ok&&/Boolean\s*\(/.test(c.src)&&typeof c.value==='boolean'},
 {title:'And, or, not',goal:'Combine two conditions with && (and).',code:'let hasKey = true\nlet doorOpen = false\nhasKey && !doorOpen',
  anat:[['hasKey','name'],['&&','op'],['!','op'],['doorOpen','name']],
  explain:'<code>&&</code> is true only when both sides are true. <code>||</code> is true when at least one side is. <code>!</code> flips true and false. Shift+Enter makes a new line, so you can type all three lines before running.',
  check:c=>c.ok&&/&&|\|\|/.test(c.src)&&typeof c.value==='boolean'},
 {title:'A fallback value',goal:'Use ?? to pick a default when something is missing.',code:'null ?? "Guest"',
  anat:[['null','val'],['??','op'],['"Guest"','val']],
  explain:'<code>a ?? b</code> gives <code>a</code>, unless <code>a</code> is <code>null</code> or <code>undefined</code>. Then it gives <code>b</code>. Perfect for "use their name, or Guest if they did not give one".',
  check:c=>c.ok&&/\?\?/.test(c.src)},
 ]},
{name:'Decisions',group:'JavaScript basics',badge:'Decider',mode:'js',
 intro:'Now your code can choose. An if statement runs a block of code only when a condition is true. This is where programs start feeling alive.',
 learned:['if','else','else if','>= <=','? :'],
 missions:[
 {title:'Set up a hero',goal:'Create a variable for health points.',code:'let hp = 30',
  anat:[['let','kw'],['hp','name'],['=','op'],['30','val']],
  explain:'We will make decisions based on this number. Change it later and re-run the decisions to see different paths.',
  check:c=>c.has('hp')&&typeof c.val('hp')==='number'},
 {title:'Your first if',goal:'Print a warning when hp is low. Type all three lines, then press Enter on the last one.',code:'if (hp < 50) {\n  console.log("Find a potion!")\n}',need:['hp'],pre:'let hp = 30',
  anat:[['if','kw'],['(hp < 50)','val'],['{ … }','op']],
  explain:'The condition goes in round brackets. The code to run goes in curly braces <code>{ }</code>. Notice the console waits for the closing <code>}</code> before running: it knows the block is not finished.',
  check:c=>c.ok&&/\bif\s*\(/.test(c.src)},
 {title:'Otherwise…',goal:'Add an else branch so something prints either way.',code:'if (hp > 50) {\n  console.log("Feeling strong")\n} else {\n  console.log("Need rest")\n}',need:['hp'],pre:'let hp = 30',
  anat:[['if (…) {…}','kw'],['else','kw'],['{…}','op']],
  explain:'Exactly one of the two blocks runs, never both. Try changing <code>hp = 80</code> and running it again.',
  check:c=>c.ok&&/\belse\b/.test(c.src)&&c.logs.length>0},
 {title:'More than two paths',goal:'Chain conditions with else if.',code:'if (hp >= 80) {\n  console.log("Full health")\n} else if (hp >= 30) {\n  console.log("Wounded")\n} else {\n  console.log("Danger!")\n}',need:['hp'],pre:'let hp = 30',
  anat:[['if','kw'],['else if','kw'],['else','kw']],
  explain:'JavaScript checks each condition from top to bottom and runs the <b>first</b> one that is true. The rest are skipped.',
  check:c=>c.ok&&/else\s+if/.test(c.src)},
 {title:'A one-line choice',goal:'Pick between two values with the ternary operator.',code:'hp > 50 ? "strong" : "weak"',need:['hp'],pre:'let hp = 30',
  anat:[['hp > 50','val'],['?','op'],['"strong"','val'],[':','op'],['"weak"','val']],
  explain:'<code>condition ? a : b</code> reads as "if condition, then a, otherwise b". It gives back a value, so you can store it: <code>const mood = hp > 50 ? "😀" : "😟"</code>.',
  check:c=>c.ok&&/\?[^?]*:/.test(c.src)&&c.hasValue},
 {title:'Two conditions at once',goal:'Print something only when hp is between 1 and 49.',code:'if (hp > 0 && hp < 50) console.log("Hurt but alive")',need:['hp'],pre:'let hp = 30',
  anat:[['if','kw'],['hp > 0','val'],['&&','op'],['hp < 50','val']],
  explain:'When the block is just one line, you can skip the braces. Many people keep them anyway for clarity.',
  check:c=>c.ok&&/\bif\b/.test(c.src)&&/&&/.test(c.src)},
 ]},
{name:'Loops',group:'JavaScript basics',badge:'Loop Master',mode:'js',
 intro:'Computers never get bored. A loop repeats a block of code as many times as you need, from five times to five million.',
 learned:['for','while','for…of','break','i++ / i--'],
 missions:[
 {title:'Count to five',goal:'Write a for loop that prints 1 to 5.',code:'for (let i = 1; i <= 5; i++) {\n  console.log(i)\n}',
  anat:[['let i = 1','name'],[';','op'],['i <= 5','val'],[';','op'],['i++','op']],
  explain:'A for loop has three parts: <b>start</b> (<code>let i = 1</code>), <b>keep going while</b> (<code>i <= 5</code>), and <b>after each round</b> (<code>i++</code>). Change 5 to 50 and watch.',
  check:c=>c.ok&&/\bfor\s*\(/.test(c.src)&&c.logs.length>=3},
 {title:'Countdown',goal:'Count down from 3 to 1, then print "Liftoff!"',code:'for (let i = 3; i >= 1; i--) {\n  console.log(i)\n}\nconsole.log("Liftoff! 🚀")',
  anat:[['let i = 3','name'],['i >= 1','val'],['i--','op']],
  explain:'Same three parts, running backwards. Code after the loop runs once the loop is finished.',
  check:c=>c.ok&&/--/.test(c.src)&&/\bfor\b/.test(c.src)},
 {title:'Loop until done',goal:'Use while to collect coins until you have 3.',code:'let coins = 0\nwhile (coins < 3) {\n  coins++\n  console.log("coins:", coins)\n}',
  anat:[['while','kw'],['(coins < 3)','val'],['{ coins++ … }','op']],
  explain:'<code>while</code> repeats as long as its condition is true. If the condition never becomes false, the loop never stops. That is an <b>infinite loop</b>, so make sure something inside changes.',
  check:c=>c.ok&&/\bwhile\s*\(/.test(c.src)},
 {title:'Visit every item',goal:'Loop over a list of fruit with for…of.',code:'for (const fruit of ["🍎", "🍌", "🍇"]) {\n  console.log("I like", fruit)\n}',
  anat:[['for','kw'],['const fruit','name'],['of','kw'],['[…]','val']],
  explain:'<code>for…of</code> hands you each item in turn. No counting needed. This is the loop you will use most for lists.',
  check:c=>c.ok&&/\bof\b/.test(c.src)&&c.logs.length>=2},
 {title:'Build something in a loop',goal:'Grow a row of stars, one per round.',code:'let stars = ""\nfor (let i = 0; i < 5; i++) {\n  stars += "⭐"\n}\nstars',
  anat:[['stars','name'],['+=','op'],['"⭐"','val']],
  explain:'A common pattern: start with something empty, add to it each round, use it at the end. Memory shows the finished string.',
  check:c=>c.ok&&typeof c.val('stars')==='string'&&c.val('stars').length>=2},
 {title:'Escape early',goal:'Stop a loop the moment you find what you want.',code:'for (let i = 1; i <= 10; i++) {\n  if (i === 4) break\n  console.log(i)\n}',
  anat:[['if (i === 4)','val'],['break','kw']],
  explain:'<code>break</code> jumps straight out of the loop. Its sibling <code>continue</code> skips to the next round.',
  check:c=>c.ok&&/\bbreak\b/.test(c.src)},
 ]},
{name:'Lists',group:'Organising data',badge:'Collector',mode:'js',
 intro:'An array is a list of values in order. Memory draws it as a row of numbered slots. The numbering starts at 0, which feels odd for about a week.',
 learned:['[ ]','[0]','.length','.push()','.pop()','.includes()'],
 missions:[
 {title:'Pack a bag',goal:'Make an array with three items.',code:'const bag = ["sword", "shield", "potion"]',
  anat:[['const','kw'],['bag','name'],['=','op'],['[ "sword", … ]','val']],
  explain:'Square brackets make an array. Items are separated by commas. Look at Memory: three slots, numbered 0, 1 and 2.',
  check:c=>isArr(c.val('bag'))&&c.val('bag').length>=2},
 {title:'Grab the first item',goal:'Read slot 0.',code:'bag[0]',need:['bag'],pre:'const bag = ["sword", "shield", "potion"]',
  anat:[['bag','name'],['[0]','op']],
  explain:'Put a slot number in square brackets to read that item. The first item is at <code>[0]</code>. What do you get for <code>bag[3]</code>? Try it.',
  check:c=>c.ok&&/bag\s*\[\s*0\s*\]/.test(c.src)},
 {title:'How many?',goal:'Ask the array for its length.',code:'bag.length',need:['bag'],pre:'const bag = ["sword", "shield", "potion"]',
  anat:[['bag','name'],['.length','fn']],
  explain:'<code>length</code> is the number of items. The last item is always at <code>bag[bag.length - 1]</code>, because counting starts at 0.',
  check:c=>c.ok&&/\.length\b/.test(c.src)&&typeof c.value==='number'},
 {title:'Swap an item',goal:'Replace the shield in slot 1.',code:'bag[1] = "golden shield"',need:['bag'],pre:'const bag = ["sword", "shield", "potion"]',
  anat:[['bag','name'],['[1]','op'],['=','op'],['"golden shield"','val']],
  explain:'Wait, bag is a <code>const</code>! The lock is on the <b>box</b>, not on what is inside the list. You cannot put a different list in the box, but you can change the list itself. Watch slot 1 flash.',
  check:c=>c.ok&&/bag\s*\[\s*\d+\s*\]\s*=/.test(c.src)},
 {title:'Add to the end',goal:'Push a new item onto the bag.',code:'bag.push("map")',need:['bag'],pre:'const bag = ["sword", "golden shield", "potion"]',
  anat:[['bag','name'],['.push','fn'],['("map")','val']],
  explain:'<code>push</code> adds to the end and returns the new length. A new slot appears in Memory.',
  check:c=>c.ok&&/\.push\s*\(/.test(c.src)},
 {title:'Take from the end',goal:'Pop the last item off.',code:'bag.pop()',need:['bag'],pre:'const bag = ["sword", "golden shield", "potion", "map"]',
  anat:[['bag','name'],['.pop','fn'],['()','op']],
  explain:'<code>pop</code> removes the last item and hands it back to you. <code>shift</code> and <code>unshift</code> do the same at the front.',
  check:c=>c.ok&&/\.pop\s*\(/.test(c.src)},
 {title:'Is it in there?',goal:'Check whether the bag has a potion.',code:'bag.includes("potion")',need:['bag'],pre:'const bag = ["sword", "golden shield", "potion"]',
  anat:[['bag','name'],['.includes','fn'],['("potion")','val']],
  explain:'<code>includes</code> answers true or false. <code>indexOf("potion")</code> tells you which slot, or -1 if it is not there.',
  check:c=>c.ok&&/\.(includes|indexOf)\s*\(/.test(c.src)},
 ]},
{name:'Functions',group:'Organising data',badge:'Spellcaster',mode:'js',
 intro:'A function is a recipe with a name. Write it once, then use it whenever you like with different ingredients. This is the most important idea in programming.',
 learned:['function','return','parameters','=>','default values','callbacks','scope'],
 missions:[
 {title:'Write a recipe',goal:'Create a function that builds a greeting.',code:'function greet(name) {\n  return "Hello, " + name + "!"\n}',
  anat:[['function','kw'],['greet','name'],['(name)','val'],['return','kw']],
  explain:'<code>name</code> is a <b>parameter</b>: a blank waiting to be filled. <code>return</code> hands the result back. Nothing happens yet. You have only written the recipe. Memory shows it as a function box.',
  check:c=>typeof c.val('greet')==='function'},
 {title:'Cook it',goal:'Call greet with a name.',code:'greet("Ada")',need:['greet'],pre:'function greet(name) {\n  return "Hello, " + name + "!"\n}',
  anat:[['greet','name'],['(','op'],['"Ada"','val'],[')','op']],
  explain:'Brackets after a function name <b>call</b> it. The value you pass in is the <b>argument</b>, and it fills the <code>name</code> blank. Try your own name.',
  check:c=>c.ok&&/greet\s*\(/.test(c.src)&&typeof c.value==='string'},
 {title:'The short way',goal:'Write an arrow function that doubles a number.',code:'const double = n => n * 2',
  anat:[['const double','name'],['=','op'],['n','val'],['=>','op'],['n * 2','val']],
  explain:'Arrow functions are a shorter way to write small functions. With one line, the result is returned automatically: no <code>return</code> and no braces needed.',
  check:c=>{const f=c.val('double');try{return typeof f==='function'&&f(4)===8}catch(e){return false}}},
 {title:'Use the arrow',goal:'Double 21.',code:'double(21)',need:['double'],pre:'const double = n => n * 2',
  anat:[['double','name'],['(21)','val']],
  explain:'Same as calling any function. 42 is, of course, the answer to everything.',
  check:c=>c.ok&&c.value===42},
 {title:'A default value',goal:'Make a dice roller where the number of sides defaults to 6.',code:'function roll(sides = 6) {\n  return Math.floor(Math.random() * sides) + 1\n}\nroll()',
  anat:[['sides = 6','name'],['Math.random()','fn'],['Math.floor','fn']],
  explain:'If you call <code>roll()</code> with nothing, sides is 6. <code>roll(20)</code> uses 20. <code>Math.random()</code> gives a random number from 0 up to 1, and <code>Math.floor</code> chops off the decimals. Run it a few times.',
  check:c=>typeof c.val('roll')==='function'&&/=\s*\d/.test(c.src)},
 {title:'Pass a function to a function',goal:'Give forEach a function to run for every item.',code:'[1, 2, 3].forEach(n => console.log(n * 10))',
  anat:[['[1, 2, 3]','val'],['.forEach','fn'],['n => …','name']],
  explain:'Functions are values, so you can hand them to other functions. A function passed in like this is called a <b>callback</b>. forEach calls yours once per item.',
  check:c=>c.ok&&/forEach/.test(c.src)&&c.logs.length>=2},
 {title:'What happens inside, stays inside',goal:'Make a variable inside a function, then try to read it from outside.',code:'function vault() {\n  let code = 1234\n}\ncode',expectError:true,
  anat:[['function vault','name'],['let code','kw'],['code','name']],
  explain:'<code>ReferenceError: code is not defined</code>. Variables made inside a function only exist inside it. This is called <b>scope</b>, and it keeps functions from messing with each other\'s boxes.',
  check:c=>c.err&&c.err.name==='ReferenceError'},
 ]},
{name:'Objects',group:'Organising data',badge:'Architect',mode:'js',
 intro:'An object groups related values under names, like a character sheet. Objects plus arrays can describe almost anything: a player, a song, a shopping cart.',
 learned:['{ key: value }','dot access','["key"]','references','...spread','destructuring','methods'],
 missions:[
 {title:'Build a character',goal:'Make an object with a name, hp and level.',code:'const hero = { name: "Ada", hp: 100, level: 1 }',
  anat:[['{','op'],['name:','name'],['"Ada"','val'],['hp:','name'],['100','val'],['}','op']],
  explain:'Curly braces make an object. Each entry is <code>key: value</code>. Memory draws it as a little table. Note the <b>#1</b> tag: that is the object\'s ID in memory. It matters soon.',
  check:c=>{const h=c.val('hero');return h&&typeof h==='object'&&!isArr(h)&&Object.keys(h).length>=2}},
 {title:'Read a property',goal:'Get the hero\'s name with a dot.',code:'hero.name',need:['hero'],pre:'const hero = { name: "Ada", hp: 100, level: 1 }',
  anat:[['hero','name'],['.name','fn']],
  explain:'<code>object.key</code> reads a value. If the key does not exist you get <code>undefined</code>, not an error.',
  check:c=>c.ok&&/hero\.\w+/.test(c.src)&&c.hasValue},
 {title:'Level up',goal:'Change the hero\'s level.',code:'hero.level = 2',need:['hero'],pre:'const hero = { name: "Ada", hp: 100, level: 1 }',
  anat:[['hero.level','name'],['=','op'],['2','val']],
  explain:'Same as with arrays: <code>const</code> locks the box, not the object inside it. Properties can still change.',
  check:c=>c.ok&&/hero\.\w+\s*=/.test(c.src)},
 {title:'Add something new',goal:'Give the hero a weapon property that did not exist before.',code:'hero["weapon"] = "bow"',need:['hero'],pre:'const hero = { name: "Ada", hp: 100, level: 2 }',
  anat:[['hero','name'],['["weapon"]','op'],['=','op'],['"bow"','val']],
  explain:'Square brackets with a string work like a dot. They are useful when the key is stored in a variable: <code>hero[key]</code>. Assigning a new key simply adds it.',
  check:c=>{const h=c.val('hero');return c.ok&&h&&Object.keys(h).length>=4}},
 {title:'Two labels, one object',goal:'Make a second variable pointing at the hero.',code:'const twin = hero',need:['hero'],pre:'const hero = { name: "Ada", hp: 100, level: 2, weapon: "bow" }',
  anat:[['const','kw'],['twin','name'],['=','op'],['hero','name']],
  explain:'Look at Memory. Both boxes show the same <b>#ID</b>, highlighted. This did <b>not</b> copy the hero. Objects live in one place, and variables hold an <b>arrow pointing to it</b>, called a reference.',
  check:c=>{const a=c.val('twin'),b=c.val('hero');return a&&a===b}},
 {title:'Spooky action',goal:'Change twin\'s hp, then look at hero.',code:'twin.hp = 1\nhero.hp',need:['hero','twin'],pre:'const hero = { name: "Ada", hp: 100, level: 2, weapon: "bow" }\nconst twin = hero',
  anat:[['twin.hp','name'],['=','op'],['1','val'],['hero.hp','name']],
  explain:'Hero\'s hp changed too, because there is only one object. This surprises nearly every beginner, and now it will never surprise you.',
  check:c=>{const h=c.val('hero');return c.ok&&/twin\.\w+\s*=/.test(c.src)&&h&&c.val('twin')===h}},
 {title:'A real copy',goal:'Copy the hero with the spread operator.',code:'const clone = { ...hero }',need:['hero'],pre:'const hero = { name: "Ada", hp: 1, level: 2, weapon: "bow" }',
  anat:[['{','op'],['...hero','name'],['}','op']],
  explain:'<code>...</code> spreads all of hero\'s properties into a <b>new</b> object. Different #ID in Memory, so changes to clone leave hero alone. Works for arrays too: <code>[...bag]</code>.',
  check:c=>{const a=c.val('clone'),b=c.val('hero');return a&&b&&a!==b&&typeof a==='object'}},
 {title:'Unpack it',goal:'Pull two properties out into their own variables.',code:'const { level, weapon } = hero',need:['hero'],pre:'const hero = { name: "Ada", hp: 1, level: 2, weapon: "bow" }',
  anat:[['const','kw'],['{ level, weapon }','name'],['=','op'],['hero','name']],
  explain:'This is <b>destructuring</b>: it makes <code>level</code> and <code>weapon</code> in one line. You will see it constantly in real code, especially in Node and React.',
  check:c=>c.has('level')&&c.has('weapon')&&/\{[^}]*\}\s*=/.test(c.src)},
 {title:'Objects that do things',goal:'Give an object a method (a function stored inside it), then call it.',code:'const dog = {\n  sound: "woof",\n  speak() { return this.sound + "!" }\n}\ndog.speak()',
  anat:[['speak()','fn'],['this','kw'],['.sound','name']],
  explain:'A function inside an object is called a <b>method</b>. <code>this</code> means "the object I belong to". You have been using methods all along: <code>console.log</code>, <code>bag.push</code>.',
  check:c=>c.ok&&c.hasValue&&/\(\s*\)\s*\{/.test(c.src)},
 ]},
{name:'Array superpowers',group:'Organising data',badge:'Alchemist',mode:'js',
 intro:'Arrays come with built-in tools that transform whole lists in one line. Picture a conveyor belt: items go in one end and come out changed, filtered or combined.',
 learned:['.map()','.filter()','.find()','.reduce()','.sort()','chaining'],
 missions:[
 {title:'Load the belt',goal:'Make a list of scores.',code:'const scores = [12, 45, 7, 88, 23]',
  anat:[['const','kw'],['scores','name'],['=','op'],['[12, 45, …]','val']],
  explain:'Five numbers. Every tool in this chapter leaves this original list unchanged (except sort, which you will meet at the end).',
  check:c=>isArr(c.val('scores'))&&c.val('scores').length>=3&&c.val('scores').every(x=>typeof x==='number')},
 {title:'map: change every item',goal:'Double every score.',code:'scores.map(s => s * 2)',need:['scores'],pre:'const scores = [12, 45, 7, 88, 23]',
  anat:[['scores','name'],['.map','fn'],['s => s * 2','val']],
  explain:'map runs your function on each item and collects the results in a <b>new</b> array of the same length. Five in, five out.',
  check:c=>c.ok&&/\.map\s*\(/.test(c.src)&&isArr(c.value)},
 {title:'filter: keep some',goal:'Keep only scores above 20.',code:'scores.filter(s => s > 20)',need:['scores'],pre:'const scores = [12, 45, 7, 88, 23]',
  anat:[['scores','name'],['.filter','fn'],['s => s > 20','val']],
  explain:'Your function answers true or false for each item. Only the true ones make it into the new array.',
  check:c=>c.ok&&/\.filter\s*\(/.test(c.src)&&isArr(c.value)},
 {title:'find: get the first match',goal:'Find the first score over 40.',code:'scores.find(s => s > 40)',need:['scores'],pre:'const scores = [12, 45, 7, 88, 23]',
  anat:[['scores','name'],['.find','fn'],['s => s > 40','val']],
  explain:'find returns a single item, not an array: the first that passes. If nothing matches, you get <code>undefined</code>.',
  check:c=>c.ok&&/\.find\s*\(/.test(c.src)},
 {title:'reduce: boil it down',goal:'Add up all the scores into one total.',code:'scores.reduce((total, s) => total + s, 0)',need:['scores'],pre:'const scores = [12, 45, 7, 88, 23]',
  anat:[['.reduce','fn'],['(total, s) => total + s','val'],['0','val']],
  explain:'reduce carries a running value (<code>total</code>) through the list. It starts at <code>0</code>, then each round adds one score. Five in, one out.',
  check:c=>c.ok&&/\.reduce\s*\(/.test(c.src)&&typeof c.value==='number'},
 {title:'Chain them',goal:'Filter, then map, in one line.',code:'scores.filter(s => s > 20).map(s => s + 5)',need:['scores'],pre:'const scores = [12, 45, 7, 88, 23]',
  anat:[['.filter(…)','fn'],['.map(…)','fn']],
  explain:'Each tool returns a new array, so you can call the next tool straight on the result. Read it left to right like a recipe.',
  check:c=>c.ok&&/\.\w+\([^]*\)\s*\.\w+\(/.test(c.src)&&isArr(c.value)},
 {title:'Sort them',goal:'Sort a copy of the scores from low to high.',code:'[...scores].sort((a, b) => a - b)',need:['scores'],pre:'const scores = [12, 45, 7, 88, 23]',
  anat:[['[...scores]','name'],['.sort','fn'],['(a, b) => a - b','val']],
  explain:'sort changes the array it is called on, so we copy first with <code>[...scores]</code>. The compare function <code>a - b</code> means low to high. Without it, sort compares numbers as text, so 100 comes before 9.',
  check:c=>c.ok&&/\.sort\s*\(/.test(c.src)&&isArr(c.value)},
 ]},
{name:'Time travel',group:'Organising data',badge:'Timekeeper',mode:'js',
 intro:'Some things take time: loading a file, fetching from the internet, a countdown. JavaScript does not stop and wait. It schedules the work and keeps going. This chapter shows how.',
 learned:['setTimeout','event loop','Promise','.then()','async / await','try / catch','.catch()'],
 missions:[
 {title:'Do it later',goal:'Schedule a message for one second from now.',code:'setTimeout(() => console.log("Ding! ⏰"), 1000)',
  anat:[['setTimeout','fn'],['() => …','val'],['1000','val']],
  explain:'1000 means milliseconds, so one second. The console shows a number straight away (the timer\'s ID), and the message arrives later.',
  check:c=>/setTimeout/.test(c.src)&&c.logs.length>0},
 {title:'Guess the order',goal:'Run all three lines. Which prints last?',code:'console.log("1: first")\nsetTimeout(() => console.log("3: last"), 0)\nconsole.log("2: second")',
  anat:[['log 1','fn'],['setTimeout(…, 0)','kw'],['log 2','fn']],
  explain:'Even with 0 milliseconds, the timer goes to the back of the queue. JavaScript finishes all the code in front of it first. This is the <b>event loop</b>, pictured in the Field guide.',
  check:c=>/setTimeout/.test(c.src)&&c.logs.length>=3},
 {title:'Make a promise',goal:'Create a Promise for a pizza that is ready in 3 seconds.',code:'const pizza = new Promise(resolve => {\n  setTimeout(() => resolve("🍕 ready"), 3000)\n})',
  anat:[['new Promise','kw'],['resolve','name'],['resolve("🍕 ready")','fn']],
  explain:'A Promise is a box for a value that will arrive later. Watch it in Memory: it starts <b>pending</b>, then turns <b>fulfilled</b> after three seconds.',
  check:c=>{const p=c.val('pizza');return p&&tagOf(p)==='Promise'}},
 {title:'Then what?',goal:'Tell the promise what to do when the pizza arrives.',code:'pizza.then(food => console.log("Eating", food))',need:['pizza'],pre:'const pizza = new Promise(resolve => setTimeout(() => resolve("🍕 ready"), 3000))',
  anat:[['pizza','name'],['.then','fn'],['food => …','val']],
  explain:'<code>.then</code> takes a callback that runs when the value is ready. If the pizza was already done, it runs almost immediately.',
  check:c=>/\.then\s*\(/.test(c.src)&&c.logs.length>0},
 {title:'Wait politely',goal:'Write an async function that awaits the pizza, then call it.',code:'async function dinner() {\n  console.log("Ordering…")\n  const food = await pizza\n  console.log("Got", food)\n}\ndinner()',need:['pizza'],pre:'const pizza = new Promise(resolve => setTimeout(() => resolve("🍕 ready"), 3000))',
  anat:[['async','kw'],['await','kw'],['pizza','name']],
  explain:'<code>await</code> pauses <b>this function only</b> until the promise is ready, while the rest of the program keeps going. It reads top to bottom, like normal code. Most modern code uses async/await.',
  check:c=>/\bawait\b/.test(c.src)&&c.logs.length>=2},
 {title:'Catch a mistake',goal:'Try to read broken data, and handle the error instead of crashing.',code:'try {\n  JSON.parse("{oops")\n} catch (err) {\n  console.log("Caught:", err.message)\n}',
  anat:[['try','kw'],['{ risky }','op'],['catch (err)','kw'],['{ handle }','op']],
  explain:'If anything inside <code>try</code> throws an error, JavaScript jumps to <code>catch</code> instead of stopping. You get the error object to inspect.',
  check:c=>c.ok&&/\btry\b/.test(c.src)&&/\bcatch\b/.test(c.src)&&c.logs.length>0},
 {title:'A promise that breaks',goal:'Handle a rejected promise with .catch.',code:'const burnt = new Promise((resolve, reject) => {\n  setTimeout(() => reject(new Error("burnt!")), 1000)\n})\nburnt.catch(err => console.log("Oops:", err.message))',
  anat:[['reject(…)','fn'],['.catch','fn'],['err => …','val']],
  explain:'Promises can fail. <code>.catch</code> handles that. Inside an async function you would use <code>try</code>/<code>catch</code> around the <code>await</code> instead.',
  check:c=>/\.catch\s*\(/.test(c.src)&&c.logs.length>0},
 ]},
{name:'TypeScript',group:'Beyond the browser',badge:'Type Guardian',mode:'ts',
 intro:'TypeScript is JavaScript plus labels that say what type each thing is. A checker reads the labels and catches mistakes before your code runs. This console runs the real TypeScript compiler.',
 learned:[': number',': string','function types','interface','optional ?','union types','generics <T>','inference'],
 missions:[
 {title:'Label a box',goal:'Make a variable with a type annotation.',code:'let age: number = 30',
  anat:[['let','kw'],['age','name'],[': number','type'],['=','op'],['30','val']],
  explain:'<code>: number</code> promises that age will always hold a number. Everything else is plain JavaScript. The prompt says <b>ts&gt;</b> now.',
  check:c=>c.has('age')&&/:\s*number/.test(c.src)},
 {title:'Break the promise',goal:'Try to put a string in age. TypeScript should stop you.',code:'age = "thirty"',need:['age'],pre:'let age: number = 30',expectError:true,
  anat:[['age','name'],['=','op'],['"thirty"','val']],
  explain:'The code never ran. TypeScript caught it first, with an error code (TS2322) and the line and column. In plain JavaScript this would have quietly gone through, and broken something later.',
  check:c=>c.diags.some(d=>d.code===2322)},
 {title:'Typed recipes',goal:'Write a function with typed parameters and a return type.',code:'function add(a: number, b: number): number {\n  return a + b\n}',
  anat:[['a: number','type'],['b: number','type'],['): number','type']],
  explain:'Now TypeScript knows what goes in and what comes out. Editors like VS Code use this to autocomplete and warn you as you type.',
  check:c=>c.has('add')&&/:\s*number/.test(c.src)},
 {title:'Wrong ingredient',goal:'Call add with a string. See what happens.',code:'add(2, "3")',need:['add'],pre:'function add(a: number, b: number): number { return a + b }',expectError:true,
  anat:[['add','name'],['(2,','val'],['"3"','val'],[')','op']],
  explain:'In JavaScript this returns "23" (remember chapter 1?). TypeScript refuses: argument of type string is not assignable to number. Bug caught before it ever ran.',
  check:c=>c.diags.some(d=>d.code===2345)},
 {title:'Describe a shape',goal:'Write an interface for a hero.',code:'interface Hero {\n  name: string\n  hp: number\n  weapon?: string\n}',
  anat:[['interface','kw'],['Hero','name'],['name: string','type'],['weapon?','type']],
  explain:'An interface describes what an object must look like. The <code>?</code> makes weapon optional. Memory shows it as a dashed <b>blueprint</b>: types exist only while checking and vanish when the code runs.',
  check:c=>c.types.includes('Hero')},
 {title:'Follow the blueprint',goal:'Make a hero that matches the interface.',code:'const ada: Hero = { name: "Ada", hp: 100 }',need:['@Hero'],pre:'interface Hero { name: string; hp: number; weapon?: string }',
  anat:[['const ada','name'],[': Hero','type'],['{ name, hp }','val']],
  explain:'No weapon, and that is fine because it is optional. Now try typing <code>ada.</code> in a real editor and it will list name, hp and weapon for you.',
  check:c=>c.has('ada')&&/:\s*Hero/.test(c.src)},
 {title:'Missing a piece',goal:'Make a hero without hp.',code:'const bo: Hero = { name: "Bo" }',need:['@Hero'],pre:'interface Hero { name: string; hp: number; weapon?: string }',expectError:true,
  anat:[['const bo','name'],[': Hero','type'],['{ name }','val']],
  explain:'Property hp is missing. TypeScript checks every object against its blueprint. This is why large teams love it: change an interface and the checker lists every place that needs updating.',
  check:c=>c.diags.some(d=>d.code===2741||/missing/.test(d.msg))},
 {title:'Only these values',goal:'Make a union type with a fixed set of choices, then break it.',code:'type Direction = "up" | "down"\nlet move: Direction = "left"',expectError:true,
  anat:[['type','kw'],['Direction','name'],['"up" | "down"','type']],
  explain:'<code>|</code> means "or". A Direction can only ever be "up" or "down", so "left" is rejected. Great for things like game states or settings.',
  check:c=>c.diags.some(d=>d.code===2322)},
 {title:'TypeScript can guess',goal:'Make a variable with no label, then put a number in it.',code:'let city = "Haifa"\ncity = 5',expectError:true,
  anat:[['let city','name'],['= "Haifa"','val'],['city = 5','op']],
  explain:'You did not write <code>: string</code>, but TypeScript <b>inferred</b> it from the first value. In practice you write far fewer labels than you might think.',
  check:c=>c.diags.some(d=>d.code===2322)},
 {title:'One function, any type',goal:'Write a generic function that returns the first item of any list.',code:'function first<T>(items: T[]): T {\n  return items[0]\n}\nfirst(["a", "b"]).toUpperCase()',
  anat:[['<T>','type'],['items: T[]','type'],['): T','type']],
  explain:'<code>T</code> is a type placeholder. Pass strings and T becomes string, so TypeScript knows <code>toUpperCase</code> is allowed. Pass numbers and it knows you get a number.',
  check:c=>c.has('first')&&/<\s*\w+\s*>/.test(c.src)},
 ]},
{name:'Node.js',group:'Beyond the browser',badge:'Server Smith',mode:'sh',
 intro:'Node.js runs JavaScript outside the browser, straight on your computer. You write .js files and run them from a terminal. This is a simulated terminal and project folder, so nothing here touches your real files.',
 learned:['node file.js','node -e','fs','require','module.exports','process.argv','npm init','npm install','npm start'],
 missions:[
 {title:'Is Node here?',goal:'Ask Node for its version.',code:'node -v',
  anat:[['node','cmd'],['-v','opt']],
  explain:'The prompt is <code>$</code> now. That means you are typing <b>terminal commands</b>, not JavaScript. <code>-v</code> is an option meaning "version". Run this first on any new computer to check Node is installed.',
  check:c=>c.cmd==='node'&&/^-(v|-version)$/.test(c.args[0]||'')},
 {title:'Run a file',goal:'Run the hello.js file in this project.',code:'node hello.js',
  anat:[['node','cmd'],['hello.js','arg']],
  explain:'Node reads the file and runs every line in it, top to bottom, then exits. Click hello.js in the Project panel to see the code inside.',
  check:c=>c.cmd==='node'&&c.args[0]==='hello.js'&&c.ok},
 {title:'Edit and re-run',goal:'Open hello.js in the editor, add a second console.log line, save, and run it again.',code:'console.log("Hello from Node!")\nconsole.log("I edited this file")',
  anat:[['edit','kw'],['Save','fn'],['node hello.js','cmd']],
  explain:'This is the everyday loop of programming: edit, save, run, look, repeat. Press <kbd>Ctrl</kbd>+<kbd>S</kbd> in the editor to save, or the ▶ Run button to save and run.',
  editFile:'hello.js',
  check:c=>c.cmd==='node'&&c.args[0]==='hello.js'&&c.ok&&c.out.length>=2},
 {title:'One-liner',goal:'Run a line of JavaScript without a file, using -e.',code:'node -e "console.log(2 ** 10)"',
  anat:[['node','cmd'],['-e','opt'],['"console.log(2 ** 10)"','arg']],
  explain:'<code>-e</code> means "evaluate this". Handy for quick experiments. <code>**</code> means "to the power of".',
  check:c=>c.cmd==='node'&&c.args[0]==='-e'&&c.ok},
 {title:'Read a file with fs',goal:'Create read.js that reads notes.txt, then run it.',code:'const fs = require("fs")\nconst text = fs.readFileSync("notes.txt", "utf8")\nconsole.log(text)',
  anat:[['require("fs")','fn'],['readFileSync','fn'],['"utf8"','val']],
  explain:'<code>require("fs")</code> loads Node\'s built-in <b>file system</b> module. The browser cannot do this. Leave out <code>"utf8"</code> and you get raw bytes (a Buffer) instead of text: try it.',
  editFile:'read.js',
  check:c=>c.cmd==='node'&&c.args[0]==='read.js'&&c.ok&&/readFileSync/.test(c.files['read.js']||'')},
 {title:'Write a file',goal:'Use writeFileSync to create a new file called todo.txt.',code:'node -e "require(\'fs\').writeFileSync(\'todo.txt\', \'learn npm\')"',
  anat:[['writeFileSync','fn'],['"todo.txt"','arg'],['"learn npm"','val']],
  explain:'Watch the Project panel: todo.txt appears. You can do this from a file or a one-liner. Then try <code>cat todo.txt</code>.',
  check:c=>'todo.txt' in c.files},
 {title:'Share code between files',goal:'Create math.js that exports an add function.',code:'function add(a, b) {\n  return a + b\n}\nmodule.exports = { add }',
  anat:[['module.exports','name'],['=','op'],['{ add }','val']],
  explain:'Each file is a <b>module</b> with its own private boxes. <code>module.exports</code> is the list of things a file chooses to share. Save it; there is nothing to run yet.',
  editFile:'math.js',
  check:c=>/module\.exports|exports\./.test(c.files['math.js']||'')},
 {title:'Use another file',goal:'Create app.js that requires ./math and prints add(2, 3). Run it.',code:'const math = require("./math")\nconsole.log(math.add(2, 3))',
  anat:[['require','fn'],['"./math"','arg'],['math.add','name']],
  explain:'<code>./</code> means "a file in this folder". Without it, Node looks for a built-in module or an installed package instead. Real projects are dozens or hundreds of small modules wired together like this.',
  editFile:'app.js',
  check:c=>c.cmd==='node'&&c.args[0]==='app.js'&&c.ok&&/require\(\s*["']\.\/math/.test(c.files['app.js']||'')},
 {title:'Take input',goal:'Create greet.js that reads a name from the command line, then run it with your name.',code:'const name = process.argv[2] || "stranger"\nconsole.log("Hi, " + name + "!")',
  anat:[['process.argv','name'],['[2]','op'],['|| "stranger"','val']],
  explain:'<code>process.argv</code> is an array of everything typed on the command line. Slot 0 is node, slot 1 is the file, so your first word is slot 2. Run <code>node greet.js Ada</code>.',
  editFile:'greet.js',
  check:c=>c.cmd==='node'&&c.args[0]==='greet.js'&&c.args.length>=2&&c.ok},
 {title:'Start a real project',goal:'Create a package.json with npm.',code:'npm init -y',
  anat:[['npm','cmd'],['init','arg'],['-y','opt']],
  explain:'npm is Node\'s package manager. <code>package.json</code> is your project\'s ID card: its name, version, scripts and dependencies. <code>-y</code> says yes to all the default answers. Click it in the Project panel to look inside.',
  check:c=>'package.json' in c.files},
 {title:'Install a package',goal:'Install the cowsay package.',code:'npm install cowsay',
  anat:[['npm','cmd'],['install','arg'],['cowsay','arg']],
  explain:'Packages are code other people wrote and shared. npm downloads them into <code>node_modules</code> and records them in package.json under "dependencies". On your own computer you can install any public package. This playground has just this one.',
  check:c=>{try{return !!JSON.parse(c.files['package.json']||'{}').dependencies?.cowsay}catch(e){return false}}},
 {title:'Use the package',goal:'Create cow.js that makes the cow speak, then run it.',code:'const cowsay = require("cowsay")\nconsole.log(cowsay.say({ text: "I know Node!" }))',
  anat:[['require("cowsay")','fn'],['cowsay.say','fn'],['{ text: … }','val']],
  explain:'No <code>./</code> this time, so Node looks in node_modules. Moo.',
  editFile:'cow.js',
  check:c=>c.cmd==='node'&&c.args[0]==='cow.js'&&c.ok&&/cowsay/.test(c.files['cow.js']||'')},
 {title:'Your own command',goal:'Add a "start" script to package.json that runs cow.js, then run npm start.',code:'"scripts": {\n  "start": "node cow.js"\n}',
  anat:[['"scripts"','name'],['"start"','name'],['"node cow.js"','val'],['npm start','cmd']],
  explain:'Open package.json and add a <code>"start": "node cow.js"</code> line inside <code>"scripts"</code> (mind the commas between lines), save, then type <code>npm start</code>. Every Node project uses scripts like this, so teammates only need to remember <code>npm start</code>, <code>npm test</code> and friends.',
  editFile:'package.json',
  check:c=>c.cmd==='npm'&&(c.args[0]==='start'||(c.args[0]==='run'&&c.args[1]==='start'))&&c.ok},
 ]},
];
const RANKS=[[0,'Newbie'],[60,'Tinkerer'],[180,'Coder'],[340,'Builder'],[520,'Engineer'],[700,'Wizard']];

// ---------- Quick-fire bank: predict the output ----------
const FIRE=[
{c:'console.log("2" + 2)',o:['"22"','4','22','NaN'],a:2,w:'A string plus anything glues. console.log shows strings without quotes, so you see 22.'},
{c:'console.log(2 + 2 + "2")',o:['42','222','6','"42"'],a:0,w:'Left to right: 2 + 2 is 4 first, then 4 + "2" glues to "42".'},
{c:'console.log("5" - 2)',o:['3','"52"','NaN','"3"'],a:0,w:'Minus has no string meaning, so JavaScript converts "5" to a number. Only + glues.'},
{c:'console.log(typeof "42")',o:['string','number','"42"','text'],a:0,w:'Quotes make it a string, whatever is inside.'},
{c:'console.log(typeof [])',o:['object','array','list','undefined'],a:0,w:'Arrays are a special kind of object. Use Array.isArray() to check for one.'},
{c:'console.log(typeof null)',o:['object','null','undefined','boolean'],a:0,w:'A famous old bug in JavaScript that can never be fixed, because fixing it would break existing websites.'},
{c:'console.log(1 === "1")',o:['false','true','undefined','TypeError'],a:0,w:'=== checks type as well as value. Number vs string: false.'},
{c:'console.log(1 == "1")',o:['true','false','"1"','TypeError'],a:0,w:'== converts types first, then compares. That is why we prefer ===.'},
{c:'console.log(Boolean("false"))',o:['true','false','undefined','"false"'],a:0,w:'Any non-empty string is truthy, even the word "false".'},
{c:'console.log(Boolean(0))',o:['false','true','0','NaN'],a:0,w:'0 is one of the six falsy values.'},
{c:'const a = [1, 2, 3]\nconsole.log(a[3])',o:['undefined','3','null','Error'],a:0,w:'Slots are 0, 1 and 2. Reading past the end gives undefined, not an error.'},
{c:'const a = [1, 2, 3]\nconsole.log(a.length)',o:['3','2','4','[1, 2, 3]'],a:0,w:'length counts items. The last index is length - 1.'},
{c:'let x = 5\nx += 3\nconsole.log(x)',o:['8','53','5','3'],a:0,w:'x += 3 means x = x + 3.'},
{c:'let n = 10\nn++\nn++\nconsole.log(n)',o:['12','11','10','"10++"'],a:0,w:'Each ++ adds one.'},
{c:'console.log(10 % 3)',o:['1','3','3.33','0'],a:0,w:'% is remainder: 10 divided by 3 is 3, remainder 1.'},
{c:'console.log([1, 2, 3].map(n => n * 2))',o:['[2, 4, 6]','[1, 2, 3]','12','[2]'],a:0,w:'map makes a new array with each item transformed.'},
{c:'console.log([5, 12, 8].filter(n => n > 6))',o:['[12, 8]','[12]','[5]','true'],a:0,w:'filter keeps every item where the function returns true.'},
{c:'console.log([5, 12, 8].find(n => n > 6))',o:['12','[12, 8]','8','true'],a:0,w:'find returns only the first match, not an array.'},
{c:'console.log([1, 2, 3].reduce((t, n) => t + n, 0))',o:['6','[1, 2, 3]','123','0'],a:0,w:'reduce carries a running total: 0+1, then +2, then +3.'},
{c:'console.log([10, 9, 100].sort())',o:['[10, 100, 9]','[9, 10, 100]','[100, 10, 9]','Error'],a:0,w:'Without a compare function, sort compares as text. "1" comes before "9". Use sort((a, b) => a - b).'},
{c:'const a = { hp: 10 }\nconst b = a\nb.hp = 1\nconsole.log(a.hp)',o:['1','10','undefined','Error'],a:0,w:'a and b point to the same object. Change it through one, see it through the other.'},
{c:'const a = { hp: 10 }\nconst b = { ...a }\nb.hp = 1\nconsole.log(a.hp)',o:['10','1','undefined','Error'],a:0,w:'Spread makes a new object, so a is untouched.'},
{c:'const p = { name: "Ada" }\nconsole.log(p.age)',o:['undefined','null','Error','0'],a:0,w:'Missing properties are undefined. No error.'},
{c:'const name = "Bo"\nconsole.log(`Hi ${name}!`)',o:['Hi Bo!','Hi ${name}!','Hi name!','"Hi Bo!"'],a:0,w:'Template strings fill in ${ } with the value.'},
{c:'console.log("Hi ${name}")',o:['Hi ${name}','Hi Bo','Error','Hi undefined'],a:0,w:'Normal quotes do not fill in ${ }. Only backticks do.'},
{c:'function f() {\n  console.log("hi")\n}\nconsole.log(f())',o:['hi, then undefined','hi','undefined','f'],a:0,w:'f prints hi, but has no return, so its result is undefined.'},
{c:'const sq = n => n * n\nconsole.log(sq(4))',o:['16','8','n * n','undefined'],a:0,w:'One-line arrow functions return their expression automatically.'},
{c:'function hi(name = "you") {\n  return "hi " + name\n}\nconsole.log(hi())',o:['hi you','hi undefined','hi ','Error'],a:0,w:'Default parameter kicks in when nothing is passed.'},
{c:'console.log("A")\nsetTimeout(() => console.log("B"), 0)\nconsole.log("C")',o:['A C B','A B C','B A C','C A B'],a:0,w:'Timers always wait until the current code finishes, even at 0 ms.'},
{c:'for (let i = 0; i < 3; i++) {\n  console.log(i)\n}',o:['0 1 2','1 2 3','0 1 2 3','3'],a:0,w:'Starts at 0 and stops before reaching 3.'},
{c:'let s = ""\nfor (const c of "abc") s = c + s\nconsole.log(s)',o:['cba','abc','a','cbacba'],a:0,w:'Each letter goes in front of the others, reversing the string.'},
{c:'console.log(null ?? "x")',o:['x','null','undefined','false'],a:0,w:'?? falls back when the left side is null or undefined.'},
{c:'console.log(0 ?? "x")',o:['0','x','false','null'],a:0,w:'0 is not null or undefined, so ?? keeps it. (|| would give "x".)'},
{c:'console.log(0 || "x")',o:['x','0','false','true'],a:0,w:'|| falls back on any falsy value, including 0.'},
{c:'const hp = 30\nconsole.log(hp > 50 ? "strong" : "weak")',o:['weak','strong','true','30'],a:0,w:'30 > 50 is false, so the value after : is used.'},
{c:'console.log(Number("12px"))',o:['NaN','12','"12"','Error'],a:0,w:'Number() needs the whole string to be a number. parseInt("12px") would give 12.'},
{c:'console.log([..."hey"])',o:['["h", "e", "y"]','["hey"]','hey','3'],a:0,w:'Spreading a string splits it into characters.'},
{c:'const { a, b } = { a: 1, b: 2, c: 3 }\nconsole.log(a + b)',o:['3','6','12','undefined'],a:0,w:'Destructuring pulls a and b into variables.'},
{c:'console.log([1, 2] + [3])',o:['1,23','[1, 2, 3]','6','Error'],a:0,w:'+ turns both arrays into strings ("1,2" and "3") and glues them. Weird, but now you know.'},
{c:'console.log(0.1 + 0.2 === 0.3)',o:['false','true','NaN','0.3'],a:0,w:'Computers store decimals in binary, so 0.1 + 0.2 is 0.30000000000000004. Same in almost every language.'},
{c:'const a = [3, 1, 2]\na.push(5)\nconsole.log(a.length)',o:['4','3','5','[3, 1, 2, 5]'],a:0,w:'push adds one item. Four now.'},
{c:'let x: number = 5\nx = "five"  // TypeScript',o:['Type error before running','"five"','5','NaN'],a:0,w:'TypeScript refuses to compile: string is not assignable to number.'},
{c:'// node greet.js Ada\nconsole.log(process.argv[2])',o:['Ada','greet.js','node','undefined'],a:0,w:'argv[0] is node, [1] is the file, [2] is the first word you typed after it.'},
];

// ================= UI =================
const KEY='script-quest-v1';
const RUNS={'greet.js':'node greet.js Ada','package.json':'npm start','math.js':null};
CH.forEach(ch=>ch.missions.forEach(m=>{if(m.editFile&&!('run' in m))m.run=m.editFile in RUNS?RUNS[m.editFile]:'node '+m.editFile}));
const INITIAL_FILES={'hello.js':'console.log("Hello from Node!")\n','notes.txt':'Buy milk\nLearn Node\nBuild a game\n'};
let S={xp:0,done:{},chap:0,cur:{},best:0,files:null,pkgs:[]};
try{const raw=localStorage.getItem(KEY);if(raw)S=Object.assign(S,JSON.parse(raw))}catch(e){}
if(!S.files)S.files={...INITIAL_FILES};
function save(){try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}}
const mk=(i,j)=>i+'-'+j;
const chapDone=i=>CH[i].missions.filter((_,j)=>S.done[mk(i,j)]).length;

/* ---------- console screen ---------- */
const screen=$('#screen'),term=$('#term'),cmd=$('#cmd'),promptEl=$('#prompt');
function line(html,cls=''){const d=document.createElement('div');d.className='line '+cls;d.innerHTML=html;screen.appendChild(d);
  while(screen.childNodes.length>600)screen.firstChild.remove();term.scrollTop=term.scrollHeight;return d}
function clearScreen(){screen.innerHTML=''}
const KW=/^(const|let|var|function|return|if|else|for|while|of|in|new|class|async|await|try|catch|throw|typeof|interface|type|true|false|null|undefined|break|continue|this|export|import|require|switch|case|default)$/;
function hl(src){
  return src.replace(/(\/\/[^\n]*)|(`(?:\\.|[^`\\])*`?|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|([^])/g,(m,c,s,n,id,o)=>{
    if(c)return '<span class="v-u">'+esc(c)+'</span>';if(s)return '<span class="v-s">'+esc(s)+'</span>';if(n)return '<span class="v-n">'+esc(n)+'</span>';
    if(id)return KW.test(id)?'<span class="v-b">'+id+'</span>':esc(id);return esc(o)});
}
function echoInput(src,pr){const ls=src.split('\n');const pad=' '.repeat(Math.max(0,pr.length-4))+'... ';
  line(ls.map((l,i)=>'<span class="pr">'+esc(i?pad:pr)+'</span>'+(MODE==='sh'?esc(l):hl(l))).join('\n'),'in')}

/* ---------- JS / TS runtime ---------- */
let MODE='js',REALM=null,HIST=[],DECLS=new Map(),TYPES=new Map(),RUN=null,SYNC=false;
const hooks={
  out(level,args){
    let html,text;
    if(level==='table'){html=tableHTML(args[0]);text=toText(fmt(args[0]))}
    else if(level==='echo'){html='<span class="arrow">← </span>'+fmt(args[0]);text=toText(fmt(args[0]));line(html,'echo');afterAsync();return}
    else if(level==='raw'){html=esc(args[0]);text=args[0]}
    else{html=fmtArgs(args);text=toText(html)}
    line(html,level==='warn'?'warn':level==='error'?'err':'');
    if(RUN){RUN.logs.push(text);if(RUN.out)RUN.out.push(text)}
    afterAsync();
  },
  asyncErr(e,prom){line('Uncaught'+(prom?' (in promise)':'')+' '+esc(errName(e)),'err');afterAsync()},
  clear(){clearScreen()},
};
function errName(e){if(e&&typeof e==='object'&&'message' in e)return (e.name||'Error')+': '+e.message;return String(e)}
function afterAsync(){if(!SYNC){schedMem();if(RUN&&Date.now()-RUN.t<20000)tryComplete()}}
window.__asyncOutHook=v=>hooks.out('echo',[v]);
function bootRealm(){const R=makeRealm(hooks);R.w.__asyncOut=v=>{if(v!==undefined)hooks.out('echo',[v])};return R}
function freshConsole(){killRealm(REALM);REALM=bootRealm();HIST=[];DECLS=new Map();TYPES=new Map();prevSnap={}}
const REPLAY_BAD=/setTimeout|setInterval|\.then\s*\(|\.catch\s*\(|\bawait\b|console\.clear/;
function rebuild(entries){
  const old=REALM;REALM=bootRealm();REALM.silent=true;
  const w=REALM.w,st=w.setTimeout,si=w.setInterval;w.setTimeout=()=>0;w.setInterval=()=>0;
  HIST=[];DECLS=new Map();TYPES=new Map();
  for(const e of entries){
    if(!e.replay)continue;
    const er=e.code?runScript(REALM,e.code):null;
    if(!er){HIST.push(e);e.decls.forEach(d=>DECLS.set(d.name,d.kind));(e.types||[]).forEach(t=>TYPES.set(t.name,t))}
  }
  w.setTimeout=st;w.setInterval=si;REALM.silent=false;killRealm(old);
}
function constAssign(ast){
  let bad=null;
  (function walk(n){if(!n||bad||typeof n.type!=='string')return;
    if((n.type==='AssignmentExpression'&&n.left.type==='Identifier'&&DECLS.get(n.left.name)==='const')||(n.type==='UpdateExpression'&&n.argument.type==='Identifier'&&DECLS.get(n.argument.name)==='const'))bad=n.left?n.left.name:n.argument.name;
    for(const k in n){const v=n[k];if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v.type==='string')walk(v)}})(ast);
  return bad;
}
// run JS source in the console realm. meta: {ts, types}
function execJS(src,meta={}){
  const p=prepare(src);
  if(p.error)return {err:p.error};
  const names=p.decls.map(d=>d.name).concat((meta.types||[]).map(t=>t.name));
  const clash=names.filter(n=>DECLS.has(n)||TYPES.has(n));
  if(clash.length&&METHOD==='insert')rebuild(HIST.filter(h=>!h.decls.some(d=>clash.includes(d.name))&&!(h.types||[]).some(t=>clash.includes(t.name))));
  if(METHOD==='eval'){
    clash.forEach(n=>{try{Object.defineProperty(REALM.w,n,{writable:true})}catch(e){}});
    if(p.ast){const b=constAssign(p.ast);if(b&&!clash.includes(b)){const e=new TypeError('Assignment to constant variable.');return {err:e}}}
  }
  SYNC=true;let er;
  try{er=runScript(REALM,p.code)}finally{SYNC=false}
  if(er){
    if(METHOD==='insert'&&p.decls.some(d=>d.kind==='let'||d.kind==='const'||d.kind==='class'))rebuild(HIST.slice());
    return {err:er};
  }
  const value=REALM.last,hasValue=REALM.hasLast&&p.echo;
  p.decls.forEach(d=>DECLS.set(d.name,d.kind));
  (meta.types||[]).forEach(t=>TYPES.set(t.name,t));
  if(METHOD==='eval')p.decls.filter(d=>d.kind==='const').forEach(d=>{try{Object.defineProperty(REALM.w,d.name,{writable:false})}catch(e){}});
  HIST.push({code:p.code,decls:p.decls,ts:meta.ts,types:meta.types||[],replay:!REPLAY_BAD.test(src)&&!p.async});
  return {ok:true,value,hasValue};
}
function execTS(src){
  const prev=()=>HIST.filter(h=>h.ts).map(h=>h.ts);
  let r=tsCheck(prev(),src);
  const p0=prepare(r.js);
  const names=(p0.decls||[]).map(d=>d.name).concat(r.types.map(t=>t.name));
  const clash=names.filter(n=>DECLS.has(n)||TYPES.has(n));
  if(clash.length){rebuild(HIST.filter(h=>!h.decls.some(d=>clash.includes(d.name))&&!(h.types||[]).some(t=>clash.includes(t.name))));r=tsCheck(prev(),src)}
  if(r.diags.length)return {diags:r.diags};
  return execJS(r.js,{ts:src,types:r.types});
}
function peek(n){
  if(!/^[A-Za-z_$][\w$]*$/.test(n)||!REALM)return undefined;
  if(METHOD==='eval')return REALM.w[n];
  REALM.peek={};const keepErr=REALM.err,last=REALM.last,hl=REALM.hasLast;
  runScript(REALM,'try{__p('+JSON.stringify(n)+','+n+')}catch(e){__p('+JSON.stringify(n)+',undefined,true)}');
  REALM.err=keepErr;REALM.last=last;REALM.hasLast=hl;
  const r=REALM.peek[n];return r&&!r.tdz?r.v:undefined;
}

/* ---------- error tips ---------- */
function errTip(e){
  const m=(e&&e.message)||'';let x;
  if((x=m.match(/^(\w+) is not defined/)))return `<b>${esc(x[1])}</b> does not exist yet. Check the spelling and capital letters, or create it first with let or const.`;
  if((x=m.match(/(\S+) is not a function/)))return `<b>${esc(x[1])}</b> is not a function, so you cannot call it with brackets. Check the spelling of the method name.`;
  if(/Cannot read propert/.test(m))return 'You asked for a property of something that is undefined or null. Check the variable before the dot.';
  if(/Unexpected end of input|Unterminated/.test(m))return 'Something was opened but never closed: a quote, bracket or brace.';
  if(/Unexpected token|Unexpected identifier|missing \)|Invalid or unexpected/i.test(m))return 'JavaScript could not read this line. Compare it character by character with the example: quotes, commas and brackets.';
  if(/constant/.test(m))return 'That box was made with const, so it is locked.';
  return '';
}

/* ---------- submitting input ---------- */
const H={list:[],i:0};
async function submit(){
  const src=cmd.value.replace(/\s+$/,'');cmd.value='';sizeCmd();
  if(!src.trim()){echoInput('',promptEl.textContent);return}
  H.list.push(src);H.i=H.list.length;
  echoInput(src,promptEl.textContent);
  if(MODE==='sh')return runShell(src);
  const t=src.trim();
  if(t==='clear'||t==='.clear'||t==='cls'){clearScreen();return}
  if(t==='help'||t==='.help'){line('Type any JavaScript and press Enter. Shift+Enter adds a new line.\nThe console shows the value of the last expression after ←.\nclear empties the screen. The Memory panel shows every variable you make.','sys');return}
  if(/^(ls|cd|pwd|node|npm)\b/.test(t)&&!/[=(]/.test(t)){line('That is a terminal command, and this is a '+(MODE==='ts'?'TypeScript':'JavaScript')+' console. You will use the terminal in the Node.js chapter.','tip');return}
  RUN={src,mode:MODE,t:Date.now(),logs:[],diags:[],ok:false,err:null};
  let r;
  if(MODE==='ts'){
    if(!(await loadTS())){line('Could not load the TypeScript compiler. Check your internet connection, then press Fresh console.','err');return}
    try{r=execTS(src)}catch(e){r={err:e}}
  }else r=execJS(src);
  if(r.diags){
    RUN.diags=r.diags;
    r.diags.forEach(d=>line('<span class="loc">'+(d.line)+':'+d.col+' </span>error TS'+d.code+': '+esc(d.msg),'diag'));
    line('Nothing ran. TypeScript stopped it before it could cause trouble.','sys');
  }else if(r.err){
    RUN.err={name:r.err.name||'Error',message:r.err.message||String(r.err)};
    line('Uncaught '+esc(errName(r.err)),'err');
    const m=curMission();const tip=errTip(r.err);
    if(tip&&!(m&&m.expectError))line('Tip: '+tip.replace(/<\/?b>/g,''),'tip');
  }else{
    RUN.ok=true;RUN.value=r.value;RUN.hasValue=r.hasValue;
    if(r.hasValue)line('<span class="arrow">← </span>'+fmt(r.value),'echo');
  }
  renderMem();tryComplete();
}

/* ---------- missions ---------- */
function curIdx(){const c=S.chap;if(S.cur[c]!==undefined)return S.cur[c];const j=CH[c].missions.findIndex((_,j)=>!S.done[mk(c,j)]);return j}
function curMission(){const j=curIdx();return j>=0?CH[S.chap].missions[j]:null}
function ctx(){
  if(MODE==='sh')return {...RUN,files:S.files,logs:RUN.out||[]};
  return {...RUN,has:n=>DECLS.has(n),kind:n=>DECLS.get(n),val:n=>DECLS.has(n)?peek(n):undefined,types:[...TYPES.keys()]};
}
function tryComplete(){
  if(!RUN||RUN.mode!==MODE)return;
  const c=S.chap,j=curIdx();if(j<0)return;const m=CH[c].missions[j];
  let ok=false;try{ok=!!m.check(ctx())}catch(e){ok=false}
  if(!ok)return;
  const k=mk(c,j),first=!S.done[k];
  S.done[k]=1;if(first)S.xp+=10;
  delete S.cur[c];save();RUN=null;
  line('✓ Mission complete: '+esc(m.title)+(first?'   +10 XP':''),'win');
  renderTop();renderChapters();renderMission(true);
  const nj=curIdx();if(nj>=0)ensureNeeds(CH[c].missions[nj]);
}
async function ensureNeeds(m){
  if(!m||!m.need||!m.pre||MODE==='sh')return;
  const missing=m.need.some(n=>n[0]==='@'?!TYPES.has(n.slice(1)):!DECLS.has(n));
  if(!missing)return;
  if(MODE==='ts'&&!(await loadTS()))return;
  // drop anything the setup code would redeclare, then run it quietly
  const R=MODE==='ts'?execTS(m.pre):execJS(m.pre);
  if(R&&R.ok){line('Set up for this mission: '+esc(m.pre.split('\n').join('  ')),'sys');renderMem()}
}
function goMission(j){S.cur[S.chap]=j;save();renderMission();renderChapters();ensureNeeds(CH[S.chap].missions[j]);cmd.focus({preventScroll:true})}

const missionEl=$('#mission');
function anatHTML(a){return '<div class="anat">'+a.map(([t,k,l])=>`<div class="tok k-${k}"><b>${esc(t)}</b><span>${l?esc(l):({kw:'keyword',name:'name',op:'symbol',val:'value',fn:'function',type:'type',cmd:'command',arg:'argument',opt:'option'})[k]}</span></div>`).join('')+'</div>'}
function dotsHTML(c,j){return '<div class="dots" aria-label="Missions in this chapter">'+CH[c].missions.map((m,i)=>`<button class="dot${S.done[mk(c,i)]?' done':''}${i===j?' cur':''}" data-m="${i}" aria-label="Mission ${i+1}: ${esc(m.title)}" title="${esc(m.title)}">${i+1}</button>`).join('')+'</div>'}
function renderMission(pop){
  const c=S.chap,ch=CH[c],j=curIdx();
  if(j<0){
    missionEl.innerHTML=`<div class="eyebrow">Chapter ${c+1} complete</div>
      <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap"><div class="badge-art">${c+1}</div><div><h2>${esc(ch.badge)}</h2><p class="intro">Badge earned for finishing <b>${esc(ch.name)}</b>.</p></div></div>
      <div><div class="goal"><div class="label">You can now use</div><div class="learned" style="margin-top:6px">${ch.learned.map(x=>'<code>'+esc(x)+'</code>').join('')}</div></div></div>
      <div class="actions">${c<CH.length-1?`<button class="btn" id="nextChap">Next: ${esc(CH[c+1].name)} →</button>`:'<button class="btn" id="toFire">Play Quick-fire</button>'}<button class="btn ghost" id="toGuide">Field guide</button></div>
      <p class="note">Click any numbered dot to replay a mission. Replays do not add XP, but the practice counts.</p>${dotsHTML(c,-1)}`;
  }else{
    const m=ch.missions[j];
    missionEl.innerHTML=`<div class="eyebrow">Chapter ${c+1} · Mission ${j+1} of ${ch.missions.length}${S.done[mk(c,j)]?' · replay':''}</div>
      <h2>${esc(m.title)}</h2>
      ${j===0?'<p class="intro">'+esc(ch.intro)+'</p>':''}
      <div class="goal"><div class="label">${m.editFile?'Your mission · edit '+esc(m.editFile):'Your mission'}</div><p>${esc(m.goal)}</p><pre>${MODE==='sh'&&!m.editFile?esc(m.code):hl(m.code)}</pre></div>
      ${m.expectError?'<span class="errgoal">Goal: get an error</span>':''}
      ${anatHTML(m.anat)}
      ${HowSteps.html(m.how)}
      <p class="explain">${m.explain}</p>
      <div class="actions"><button class="btn" id="fill">${m.editFile?'Put it in the editor':'Type it for me'}</button><button class="btn ghost" id="hintBtn">Hint</button><button class="btn ghost" id="skip">Skip</button></div>
      <p class="hint" id="hint" hidden>${m.hint||(m.editFile?'Click <b>'+esc(m.editFile)+'</b> in the Project panel (or press the button above), type the code, press Save, then run it in the terminal'+(m.run?' with <code>'+esc(m.run)+'</code>':'')+'.':MODE==='sh'?'Type the command exactly as shown, then press Enter.':'Type the code exactly as shown, then press Enter. For several lines, use Shift+Enter between them.')}</p>
      ${dotsHTML(c,j)}`;
  }
  if(pop){missionEl.classList.remove('pop');void missionEl.offsetWidth;missionEl.classList.add('pop')}
}
missionEl.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.m!==undefined)return goMission(+b.dataset.m);
  if(b.id==='nextChap')return setChapter(S.chap+1);
  if(b.id==='toFire')return showTab('fire');
  if(b.id==='toGuide')return showTab('guide');
  if(b.id==='hintBtn'){$('#hint').hidden=!$('#hint').hidden;return}
  if(b.id==='skip'){const n=CH[S.chap].missions.length,j=curIdx();if(j+1<n)goMission(j+1);else{delete S.cur[S.chap];save();renderMission()}return}
  if(b.id==='fill'){const m=curMission();if(!m)return;
    if(m.editFile){
      let code=m.code;
      if(m.editFile==='package.json'){try{const pj=JSON.parse(S.files['package.json']||'{}');pj.scripts=Object.assign({start:'node cow.js'},pj.scripts||{});pj.scripts.start='node cow.js';code=JSON.stringify(pj,null,2)+'\n'}catch(er){line('package.json is not valid JSON right now. Fix it or run npm init -y again.','err');return}}
      else if(m.editFile==='hello.js'){code=(S.files['hello.js']||'').replace(/\s*$/,'\n')+'console.log("I edited this file")\n'}
      else code=m.code+'\n';
      openFile(m.editFile,code);
      if(m.run){cmd.value=m.run;sizeCmd()}
      $('#ed').focus({preventScroll:true});
    }else{cmd.value=m.code;sizeCmd();cmd.focus({preventScroll:true});cmd.setSelectionRange(cmd.value.length,cmd.value.length)}
  }
});

/* ---------- chapters rail, header ---------- */
function renderChapters(){
  let h='',g='';
  CH.forEach((ch,i)=>{
    if(ch.group!==g){g=ch.group;h+=`<div class="chapgroup">${esc(g)}</div>`}
    const d=chapDone(i),n=ch.missions.length;
    h+=`<button class="chap${d===n?' earned':''}" data-c="${i}" aria-current="${i===S.chap}"><span class="num">${i+1}</span><span class="nm">${esc(ch.name)}</span><span class="ct">${d}/${n}</span></button>`;
  });
  $('#chapters').innerHTML=h;
}
$('#chapters').addEventListener('click',e=>{const b=e.target.closest('.chap');if(b)setChapter(+b.dataset.c)});
function renderTop(){
  let r=RANKS[0],nx=null;for(let i=0;i<RANKS.length;i++){if(S.xp>=RANKS[i][0]){r=RANKS[i];nx=RANKS[i+1]||null}}
  $('#rank').textContent=r[1];$('#xpText').textContent=S.xp+' XP';
  $('#xpFill').style.width=(nx?Math.min(100,(S.xp-r[0])/(nx[0]-r[0])*100):100)+'%';
  $('#xpFill').parentElement.title=nx?(nx[0]-S.xp)+' XP to '+nx[1]:'Top rank';
}

/* ---------- memory map ---------- */
const mapPanel=$('#mapPanel');let prevSnap={},memTimer=null;
function schedMem(){clearTimeout(memTimer);memTimer=setTimeout(()=>{if(MODE!=='sh')renderMem()},120)}
onPromSettle=schedMem;
function tyOf(v){if(v===null)return 'null';if(Array.isArray(v))return 'array';const t=typeof v;if(t==='function')return fnSig(v).cls?'class':'function';if(t==='object')return tagOf(v)==='Promise'?'promise':'object';return t}
function shortV(v,owners){
  const t=typeof v;
  if(v===undefined)return '<span class="u">undefined</span>';if(v===null)return '<span class="u">null</span>';
  if(t==='string')return '<span class="s">'+esc(JSON.stringify(v.length>40?v.slice(0,40)+'…':v))+'</span>';
  if(t==='number'||t==='bigint')return '<span class="n">'+esc(String(v))+'</span>';
  if(t==='boolean')return '<span class="b">'+v+'</span>';
  if(t==='function')return '<span class="f">'+esc(fnSig(v).txt)+'</span>';
  if(t==='object'){const id=refId(v);const o=owners[id]||[];return `<span class="ref${o.length>1?' shared':''}">${Array.isArray(v)?'[…]':'{…}'} #${id}${o.length?' '+esc(o.join(', ')):''}</span>`}
  return esc(String(v));
}
function boxBody(v,owners){
  const ty=tyOf(v);
  if(ty==='array'){if(!v.length)return '<div class="boxval"><span class="u">[ ] empty</span></div>';
    return '<div class="cells">'+v.slice(0,30).map((x,i)=>`<span class="cell"><b>${shortV(x,owners)}</b><i>${i}</i></span>`).join('')+(v.length>30?'<span class="cell"><b>…</b><i>+'+(v.length-30)+'</i></span>':'')+'</div>'}
  if(ty==='promise'){const st=pstate(v);return `<div class="boxval"><span class="pill ${st.s}">${st.s}</span>${st.s!=='pending'?' '+shortV(st.s==='rejected'&&st.v&&st.v.message?st.v.message:st.v,owners):''}</div>`}
  if(ty==='object'){let ks=[];try{ks=Object.keys(v)}catch(e){}
    if(tagOf(v)==='Map'||tagOf(v)==='Set'||tagOf(v)==='Date')return '<div class="boxval">'+fmt(v)+'</div>';
    if(!ks.length)return '<div class="boxval"><span class="u">{ } empty</span></div>';
    return '<div class="kv">'+ks.slice(0,14).map(k=>`<span class="k">${esc(k)}</span><span class="v">${shortV(v[k],owners)}</span>`).join('')+'</div>'}
  return '<div class="boxval">'+shortV(v,owners)+'</div>';
}
function renderMem(){
  if(MODE==='sh')return renderProject();
  const names=[...DECLS.keys()];const vals={};names.forEach(n=>vals[n]=peek(n));
  const owners={};names.forEach(n=>{const v=vals[n];if(v&&typeof v==='object'){const id=refId(v);(owners[id]=owners[id]||[]).push(n)}});
  const snap={};let boxes='';
  for(const n of names.slice().reverse()){
    const v=vals[n],kind=DECLS.get(n),ty=tyOf(v);
    const id=v&&typeof v==='object'?refId(v):0;
    let s;try{s=ty+'|'+toText(fmt(v,0))}catch(e){s=ty}
    snap[n]=s;const chg=prevSnap[n]!==undefined&&prevSnap[n]!==s;
    const sh=id&&owners[id].length>1;
    boxes+=`<div class="box${chg?' chg':''}"><div class="boxhead"><span class="boxname">${esc(n)}</span><span class="kind ${kind==='const'?'const':''}">${kind==='const'?'🔒 const':esc(kind)}</span>${id?`<span class="ref${sh?' shared':''}">#${id}</span>`:''}<span class="ty ty-${ty}">${ty}</span></div>${boxBody(v,owners)}${sh?`<div class="sharednote">Same object as ${esc(owners[id].filter(x=>x!==n).join(', '))}</div>`:''}</div>`;
  }
  prevSnap=snap;
  const types=[...TYPES.values()];
  mapPanel.innerHTML=`<h3>Memory</h3><p class="mapsub">Every variable you create appears here as a labelled box. A box flashes when its value changes.</p>
   <div class="mem">${boxes||'<div class="memempty">Empty for now. Make a variable, like <code>let score = 0</code>, and a box will appear here.</div>'}
   ${types.length?'<div class="memsec">Type blueprints (TypeScript only)</div>'+types.map(t=>`<div class="blueprint"><div class="boxhead"><span class="boxname">${esc(t.name)}</span><span class="ty ty-number">${t.kind}</span></div><pre>${esc(t.text)}</pre></div>`).join(''):''}</div>
   <div class="legend"><span><span class="kind const">🔒 const</span> locked box</span><span><span class="ref">#2</span> object ID</span><span><span class="ref shared">#2</span> two names, one object</span></div>`;
}

/* ---------- Node: virtual project + terminal ---------- */
const VFS={
  get files(){return S.files},
  write(k,v){const isNew=!(k in S.files);S.files[k]=v;save();renderProject(k);if(ED.file===k&&!ED.dirty){$('#ed').value=v;edSync()}void isNew},
  remove(k){delete S.files[k];save();if(ED.file===k)openFile(null);renderProject()},
  list(){return Object.keys(S.files).concat(S.pkgs.length?['node_modules']:[]).sort()},
  installed:p=>S.pkgs.includes(p),hasModules:()=>S.pkgs.length>0,
};
let NODE=null;
function nodeHooks(){return {
  out(level,args){const html=level==='table'?tableHTML(args[0]):level==='raw'?esc(args[0]):fmtArgs(args);const text=level==='raw'?args[0]:toText(html);
    line(html,level==='warn'?'warn':level==='error'?'err':'');if(RUN&&RUN.out)RUN.out.push(text);if(!SYNC&&RUN&&Date.now()-RUN.t<20000)tryComplete()},
  asyncErr(e){printNodeErr(e);if(RUN)RUN.ok=false},clear(){clearScreen()}}}
function printNodeErr(e,file){
  if(e&&e.__exit!==undefined)return;
  if(e&&(e.__file||file))line('/home/you/my-app/'+esc(e.__file||file),'sys');
  line(esc(errName(e)),'err');
  if(e&&e.code)line("  code: '"+esc(e.code)+"'",'err');
  line('Node.js '+NODE_VERSION,'sys');
  const tip=errTip(e);if(tip)line('Tip: '+tip.replace(/<\/?b>/g,''),'tip');
}
function runNode(file,args,code){
  killRealm(NODE);NODE=makeRealm(nodeHooks());
  const env=makeNodeEnv(NODE,VFS,file,args,nodeHooks());
  SYNC=true;
  try{env.loadModule(file,code)}catch(e){if(e&&e.__exit!==undefined){RUN.ok=e.__exit===0}else{printNodeErr(e,file);RUN.ok=false}}
  finally{SYNC=false}
}
function tokenize(s){const out=[];let cur='',q=null,has=false;
  for(let i=0;i<s.length;i++){const c=s[i];
    if(q){if(c==='\\'&&q==='"'&&(s[i+1]==='"'||s[i+1]==='\\')){cur+=s[++i]}else if(c===q)q=null;else cur+=c}
    else if(c==='"'||c==="'"){q=c;has=true}
    else if(/\s/.test(c)){if(cur||has){out.push(cur);cur='';has=false}}
    else cur+=c}
  if(cur||has)out.push(cur);return out}
const NPM_INIT=()=>JSON.stringify({name:'my-app',version:'1.0.0',description:'',main:'index.js',scripts:{test:'echo "Error: no test specified" && exit 1'},keywords:[],author:'',license:'ISC'},null,2)+'\n';
function runShell(src){
  const a=tokenize(src),c=a[0]||'',args=a.slice(1);
  RUN={src,mode:'sh',t:Date.now(),cmd:c,args,ok:true,out:[],logs:[]};
  const out=(t,cls='')=>{line(esc(t),cls);RUN.out.push(t)};
  const fail=(t)=>{out(t,'err');RUN.ok=false};
  switch(c){
    case 'help':out('Commands here: ls, cat <file>, pwd, touch <file>, rm <file>, clear,\nnode <file> [words…], node -e "code", node -v,\nnpm init -y, npm install <package>, npm start, npm run <script>, npm test','sys');break;
    case 'clear':clearScreen();break;
    case 'pwd':out('/home/you/my-app');break;
    case 'ls':{const l=VFS.list();line(l.map(f=>f==='node_modules'?'<span class="c-d" style="color:var(--term-dir);font-weight:600">node_modules/</span>':/\.js$/.test(f)?'<span style="color:var(--term-prompt)">'+esc(f)+'</span>':esc(f)).join('  ')||'<span class="v-u">(empty folder)</span>');RUN.out.push(l.join('  '));break}
    case 'cat':if(!args[0])fail('cat: which file? Try: cat notes.txt');else if(args[0] in S.files)out(S.files[args[0]].replace(/\n$/,''));else fail('cat: '+args[0]+': No such file or directory');break;
    case 'touch':if(!args[0])fail('touch: missing file name');else{if(!(args[0] in S.files))VFS.write(args[0],'')}break;
    case 'rm':if(!(args[0] in S.files))fail('rm: cannot remove \''+(args[0]||'')+'\': No such file or directory');else VFS.remove(args[0]);break;
    case 'node':
      if(!args.length){out('This would open Node\'s interactive console (the REPL). You already know it: it is the > console from chapters 1–10.\nHere, run a file instead: node hello.js','tip');break}
      if(args[0]==='-v'||args[0]==='--version'){out(NODE_VERSION);break}
      if(args[0]==='-e'||args[0]==='--eval'||args[0]==='-p'){if(!args[1]){fail('node: '+args[0]+' requires an argument');break}
        runNode('[eval]',args.slice(2),args[0]==='-p'?'console.log('+args[1]+')':args[1]);break}
      if(!(args[0] in S.files)){
        if(args[0]+'.js' in S.files){runNode(args[0]+'.js',args.slice(1));break}
        out('node:internal/modules/cjs/loader','sys');fail("Error: Cannot find module '/home/you/my-app/"+args[0]+"'");line('Tip: check the file name with ls. Names are case-sensitive.','tip');break}
      if(!/\.(c?js|json)$/.test(args[0])){fail('That is not a JavaScript file. Node runs .js files.');break}
      if(ED.file===args[0]&&ED.dirty)line('Heads up: '+esc(args[0])+' has unsaved changes in the editor, so Node runs the last saved version. Press Save (Ctrl+S) first.','tip');
      runNode(args[0],args.slice(1));break;
    case 'npm':runNpm(args,out,fail);break;
    case 'npx':out('npx runs a package\'s command without installing it globally. You will use it for things like npx tsc. Not available in this playground.','tip');break;
    case 'tsc':out('tsc is the TypeScript compiler. On your computer: npm install -D typescript, then npx tsc. See the Field guide.','tip');break;
    case 'cd':out('This playground keeps you in ~/my-app. For folders and cd, play Shell Quest.','tip');break;
    default:
      if(/[=(){};"'`]|^(let|const|var|console|function)\b/.test(src)){fail('bash: syntax error');line('That looks like JavaScript, but this is the terminal. Put the code in a file and run node file.js, or try: node -e "your code"','tip')}
      else{fail('bash: '+c+': command not found');line('Type help to see the commands this terminal knows.','tip')}
  }
  renderProject();tryComplete();
}
function runNpm(args,out,fail){
  const sub=args[0];
  const pj=()=>{try{return JSON.parse(S.files['package.json'])}catch(e){return null}};
  if(!sub){out('npm <command>\n\nUsage:\nnpm init -y        create package.json\nnpm install <pkg>  add a package\nnpm start          run the "start" script\nnpm run <name>     run any script','sys');return}
  if(sub==='-v'||sub==='--version'){out('10.9.2');return}
  if(sub==='init'){if(!args.includes('-y')&&!args.includes('--yes')){out('npm init normally asks you questions (name, version, …). Add -y to accept the defaults: npm init -y','tip');RUN.ok=false;return}
    VFS.write('package.json',NPM_INIT());out('Wrote to /home/you/my-app/package.json:\n\n'+S.files['package.json']);return}
  if(sub==='install'||sub==='i'||sub==='add'){
    const pkgs=args.slice(1).filter(x=>!x.startsWith('-'));
    if(!pkgs.length){out(S.pkgs.length?'up to date, audited '+S.pkgs.length+' package in 1s':'up to date, audited 0 packages in 1s');return}
    for(const p of pkgs){if(p!=='cowsay'){fail('npm error 404 Not Found - '+p+'\nThis playground only has the cowsay package. On your own computer, npm can install any public package.');return}}
    if(!S.pkgs.includes('cowsay'))S.pkgs.push('cowsay');
    let j=pj();if(!j){j=JSON.parse(NPM_INIT())}
    j.dependencies=Object.assign(j.dependencies||{},{cowsay:'^1.6.0'});VFS.write('package.json',JSON.stringify(j,null,2)+'\n');
    out('\nadded 1 package, and audited 2 packages in 1s\n\nfound 0 vulnerabilities');return}
  if(sub==='start'||sub==='test'||sub==='t'||sub==='run'||sub==='run-script'){
    const j=pj();if(!j){fail('npm error enoent Could not read package.json\nRun npm init -y first.');return}
    const name=(sub==='run'||sub==='run-script')?args[1]:(sub==='t'?'test':sub);
    const sc=j.scripts||{};
    if(!name){out('Scripts available in my-app via `npm run`:\n'+Object.keys(sc).map(k=>'  '+k+'\n    '+sc[k]).join('\n'));return}
    if(!(name in sc)){fail('npm error Missing script: "'+name+'"');if(name==='start')line('Tip: add "start": "node cow.js" inside "scripts" in package.json, then save.','tip');return}
    out('\n> '+j.name+'@'+j.version+' '+name+'\n> '+sc[name]+'\n','sys');
    const parts=sc[name].split('&&').map(s=>s.trim());
    for(const p of parts){const t=tokenize(p);
      if(t[0]==='node'){const keep=RUN;runNode(t[1],t.slice(2));if(!keep.ok)return}
      else if(t[0]==='echo'){out(t.slice(1).join(' '))}
      else if(t[0]==='exit'){if(t[1]!=='0'){RUN.ok=false;fail('npm error Lifecycle script `'+name+'` failed with error:\nnpm error code '+(t[1]||1))}return}
      else{fail('sh: '+t[0]+': not available in this playground');return}}
    return}
  fail('npm error Unknown command: "'+sub+'"');
}

/* project panel + editor */
const ED={file:null,dirty:false};
function fileKind(f){return f==='node_modules'?'dir':/\.json$/.test(f)?'json':/\.js$/.test(f)?'js':'txt'}
function renderProject(flash){
  if(MODE!=='sh')return;
  const rows=VFS.list().map(f=>{const k=fileKind(f);const size=f in S.files?S.files[f].split('\n').filter((l,i,a)=>i<a.length-1||l).length:0;
    return `<button class="frow${ED.file===f?' open':''}${flash===f?' flash':''}" data-f="${esc(f)}"${k==='dir'?' disabled':''}><span class="fi ${k}">${k==='dir'?'DIR':k.toUpperCase()}</span>${esc(f)}${k==='dir'?'/':''}<span class="sz">${k==='dir'?S.pkgs.join(', '):size+' line'+(size===1?'':'s')}</span></button>`}).join('');
  mapPanel.innerHTML=`<h3>Project</h3><p class="mapsub"><code>~/my-app</code>. Click a file to open it in the editor below the terminal.</p>
    <div class="files">${rows}</div>
    <form class="newfile" id="newfile"><input id="nfName" placeholder="new-file.js" aria-label="New file name" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="btn small" type="submit">New file</button></form>
    <div class="legend"><span><span class="fi js" style="font-size:9.5px;font-weight:700;padding:0 4px;border-radius:4px">JS</span> runs with node</span><span><span class="fi json" style="font-size:9.5px;font-weight:700;padding:0 4px;border-radius:4px">JSON</span> settings and data</span><span>Files are saved in this browser.</span></div>`;
}
mapPanel.addEventListener('click',e=>{const b=e.target.closest('.frow');if(b&&!b.disabled)openFile(b.dataset.f)});
mapPanel.addEventListener('submit',e=>{e.preventDefault();const inp=$('#nfName');let n=(inp.value||'').trim();
  if(!/^[\w.-]+$/.test(n)){inp.setCustomValidity('Use letters, numbers, dots, dashes or underscores. No folders.');inp.reportValidity();return}
  inp.setCustomValidity('');if(!(n in S.files))VFS.write(n,'');openFile(n);$('#ed').focus()});
mapPanel.addEventListener('input',e=>{if(e.target.id==='nfName')e.target.setCustomValidity('')});
const ed=$('#ed'),gutter=$('#gutter');
function edSync(){const n=ed.value.split('\n').length;gutter.textContent=Array.from({length:n},(_,i)=>i+1).join('\n');ed.style.height='auto';ed.style.height=ed.scrollHeight+'px';
  $('#edtab').innerHTML=ED.file?esc(ED.file)+(ED.dirty?' <span class="dirty" title="Unsaved changes">●</span>':''):'no file open'}
function openFile(f,content){
  ED.file=f;ED.dirty=false;
  const has=f&&f in S.files;
  if(f&&!has&&content===undefined){S.files[f]='';save()}
  ed.disabled=!f;ed.value=f?(content!==undefined?content:S.files[f]||''):'';
  if(f&&content!==undefined&&content!==S.files[f])ED.dirty=true;
  if(f&&!(f in S.files)){S.files[f]='';save()}
  $('#edRun').hidden=!(f&&/\.js$/.test(f)||f==='package.json');
  $('#edRun').textContent=f==='package.json'?'▶ npm start':'▶ Run';
  edSync();renderProject();
}
function saveFile(){if(!ED.file)return false;S.files[ED.file]=ed.value;ED.dirty=false;save();edSync();renderProject(ED.file);
  if(ED.file==='package.json'){try{JSON.parse(ed.value)}catch(e){line('Saved, but package.json is not valid JSON: '+e.message.split('\n')[0],'warn')}}
  const m=curMission();if(m&&m.editFile===ED.file&&!m.run){RUN={mode:'sh',cmd:'(save)',args:[ED.file],ok:true,out:[],logs:[],t:Date.now()};tryComplete()}
  return true}
ed.addEventListener('input',()=>{ED.dirty=true;edSync()});
ed.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();saveFile();line('Saved '+esc(ED.file),'sys');return}
  if(e.key==='Tab'&&!e.shiftKey){e.preventDefault();const s=ed.selectionStart;ed.setRangeText('  ',s,ed.selectionEnd,'end');ED.dirty=true;edSync()}
  if(e.key==='Enter'){const s=ed.selectionStart,ln=ed.value.slice(0,s).split('\n').pop();const ind=ln.match(/^\s*/)[0]+(/[{(\[]\s*$/.test(ln)?'  ':'');if(ind){e.preventDefault();ed.setRangeText('\n'+ind,s,ed.selectionEnd,'end');ED.dirty=true;edSync()}}
});
$('#edSave').onclick=()=>{if(saveFile())line('Saved '+esc(ED.file),'sys')};
$('#edRun').onclick=()=>{if(!ED.file)return;saveFile();const c=ED.file==='package.json'?'npm start':(curMission()&&curMission().run&&curMission().editFile===ED.file?curMission().run:'node '+ED.file);echoInput(c,promptEl.textContent);H.list.push(c);H.i=H.list.length;runShell(c)};

/* ---------- chapter / mode switching ---------- */
function setChapter(i){
  S.chap=i;save();
  const ch=CH[i];MODE=ch.mode;
  clearScreen();RUN=null;killRealm(NODE);NODE=null;
  const termEl=$('#term');termEl.classList.toggle('short',MODE==='sh');$('#editor').hidden=MODE!=='sh';
  promptEl.textContent=MODE==='sh'?'~/my-app $ ':MODE==='ts'?'ts> ':'> ';
  cmd.setAttribute('aria-label',MODE==='sh'?'Type a terminal command':'Type '+(MODE==='ts'?'TypeScript':'JavaScript')+' and press Enter');
  $('#crumbs').innerHTML=`<span class="modepill">${MODE==='sh'?'terminal':MODE==='ts'?'TypeScript':'JavaScript'}</span><span>${MODE==='sh'?'A simulated terminal in the folder <code>~/my-app</code>. Commands, not code.':MODE==='ts'?'Real TypeScript type-checking, then the code runs.':'Live console. Your code really runs, right here in the page.'}</span>`;
  $('#fresh').textContent=MODE==='sh'?'Reset project':'Fresh console';$('#fresh').classList.remove('armed');
  freshConsole();
  line('Chapter '+(i+1)+': '+esc(ch.name),'tip');
  if(MODE==='sh'){
    line('Type <b>ls</b> to see the files, or help for the command list.','sys');
    if(!ED.file||!(ED.file in S.files))openFile('hello.js' in S.files?'hello.js':null);else edSync();
    renderProject();
  }else{
    line(MODE==='ts'?'Type TypeScript and press Enter. Loading the compiler…':'Type JavaScript and press Enter. Shift+Enter adds a new line.','sys');
    renderMem();
    if(MODE==='ts')loadTS().then(ok=>{if(MODE!=='ts')return;line(ok?'TypeScript compiler ready.':'Could not load the TypeScript compiler. Check your connection and try Fresh console.',ok?'sys':'err');const m=curMission();if(ok&&m)ensureNeeds(m)});
  }
  renderChapters();renderMission();
  const m=curMission();if(m&&MODE==='js')ensureNeeds(m);
  if(METHOD==='none')line('This browser blocked running code inside the page, so the console cannot run anything here. Try a different browser.','err');
}
$('#fresh').onclick=e=>{
  const b=e.currentTarget;
  if(MODE==='sh'){
    if(!b.classList.contains('armed')){b.classList.add('armed');b.textContent='Click again to reset all files';setTimeout(()=>{b.classList.remove('armed');b.textContent='Reset project'},3500);return}
    b.classList.remove('armed');b.textContent='Reset project';S.files={...INITIAL_FILES};S.pkgs=[];save();openFile('hello.js');line('Project reset to its starting files.','sys');renderProject();return}
  freshConsole();clearScreen();line('Fresh console: all variables cleared.','sys');renderMem();const m=curMission();if(m)ensureNeeds(m);cmd.focus();
};

/* ---------- input box behaviour ---------- */
function sizeCmd(){cmd.rows=Math.max(1,cmd.value.split('\n').length)}
cmd.addEventListener('input',sizeCmd);
cmd.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&!e.shiftKey){
    if(MODE!=='sh'&&isIncomplete(cmd.value)){e.preventDefault();const s=cmd.selectionStart;const ln=cmd.value.slice(0,s).split('\n').pop();const ind=ln.match(/^\s*/)[0]+(/[{(\[]\s*$/.test(ln)?'  ':'');cmd.setRangeText('\n'+ind,s,cmd.selectionEnd,'end');sizeCmd();return}
    e.preventDefault();submit();return}
  if(e.key==='Tab'){e.preventDefault();
    if(MODE==='sh'){const v=cmd.value,s=cmd.selectionStart;const pre=v.slice(0,s).split(/\s/).pop();const hits=VFS.list().filter(f=>f.startsWith(pre)&&f!==pre);
      if(hits.length===1)cmd.setRangeText(hits[0].slice(pre.length)+' ',s,s,'end');else if(hits.length>1)line(hits.join('  '),'sys');return}
    cmd.setRangeText('  ',cmd.selectionStart,cmd.selectionEnd,'end');sizeCmd();return}
  if(e.key==='ArrowUp'&&!cmd.value.slice(0,cmd.selectionStart).includes('\n')){if(H.i>0){e.preventDefault();H.i--;cmd.value=H.list[H.i];sizeCmd()}return}
  if(e.key==='ArrowDown'&&!cmd.value.slice(cmd.selectionEnd).includes('\n')){if(H.i<H.list.length){e.preventDefault();H.i++;cmd.value=H.list[H.i]||'';sizeCmd()}return}
  if(e.key.toLowerCase()==='l'&&e.ctrlKey){e.preventDefault();clearScreen()}
});
term.addEventListener('click',()=>{if(!getSelection().toString())cmd.focus({preventScroll:true})});
$('#keys').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const k=b.dataset.k;
  if(k==='ENTER'){submit()}else if(k==='UP'){if(H.i>0){H.i--;cmd.value=H.list[H.i];sizeCmd()}}
  else{const ins=k==='TAB'?'  ':k==='NL'?'\n':k;cmd.setRangeText(ins,cmd.selectionStart,cmd.selectionEnd,'end');sizeCmd()}
  cmd.focus({preventScroll:true})});

/* ---------- tabs ---------- */
function showTab(t){
  document.querySelectorAll('.tabs button').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===t));
  ['quest','fire','guide'].forEach(x=>$('#tab-'+x).hidden=x!==t);
  if(t==='fire')fireIdle();
  if(t!=='fire')fireStop();
  if(t==='guide'&&!$('#guide').innerHTML)renderGuide();
}
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));

// ================= QUICK-FIRE =================
const F={on:false,score:0,streak:0,time:75,tick:null,q:null,order:[],misses:[],locked:false,paused:false};
const fStage=$('#fStage');
function fStats(){$('#fScore').textContent=F.score;$('#fStreak').textContent=F.streak;$('#fBest').textContent=S.best||0;$('#fTime').textContent=Math.ceil(F.time);$('#fTimer').style.width=(F.time/75*100)+'%'}
function fireIdle(){
  if(F.on)return;fStats();
  const ex=FIRE[0];
  fStage.innerHTML=`<div class="example"><div class="eyebrow">Example</div><pre class="snip">${hl(ex.c)}</pre><p class="note" style="margin-top:8px">Answer: <code>22</code>. ${esc(ex.w)}</p></div>
    <div class="actions"><button class="btn" id="fGo">Start the clock</button></div>`;
  $('#fGo').onclick=fireStart;
}
function fireStart(){
  Object.assign(F,{on:true,score:0,streak:0,time:75,misses:[],locked:false,paused:false});
  F.order=FIRE.map((_,i)=>i).sort(()=>Math.random()-.5);
  clearInterval(F.tick);let last=performance.now();
  F.tick=setInterval(()=>{const now=performance.now();if(!F.paused)F.time-=(now-last)/1000;last=now;if(F.time<=0){F.time=0;fireEnd()}fStats()},100);
  fireNext();
}
function fireStop(){clearInterval(F.tick);F.on=false}
function fireNext(){
  if(!F.order.length)F.order=FIRE.map((_,i)=>i).sort(()=>Math.random()-.5);
  const q=FIRE[F.order.pop()];
  const opts=q.o.map((t,i)=>({t,right:i===q.a})).sort(()=>Math.random()-.5);
  F.q={...q,opts};F.locked=false;F.paused=false;
  fStage.innerHTML=`<div class="task">What does this print?</div><pre class="snip">${hl(q.c)}</pre>
    <div class="opts">${opts.map((o,i)=>`<button class="opt" data-i="${i}"><kbd>${i+1}</kbd><span>${esc(o.t)}</span></button>`).join('')}</div><p class="fb" id="fb" aria-live="polite"></p>`;
  fStats();
}
function fireAnswer(i){
  if(!F.on||F.locked||!F.q)return;F.locked=true;
  const btns=fStage.querySelectorAll('.opt');const o=F.q.opts[i];const right=F.q.opts.findIndex(x=>x.right);
  btns[right].classList.add('right');const fb=$('#fb');
  if(o.right){F.streak++;const pts=10+Math.min(F.streak-1,5)*2;F.score+=pts;fb.className='fb good';fb.textContent='Correct! +'+pts+(F.streak>1?'  (streak ×'+F.streak+')':'');fStats();setTimeout(()=>F.on&&fireNext(),650)}
  else{btns[i].classList.add('wrong');F.streak=0;F.paused=true;F.misses.push(F.q);fb.className='fb bad';fb.innerHTML=esc(F.q.w)+' <button class="btn small ghost" id="fNext">Next →</button>';fStats();$('#fNext').onclick=()=>F.on&&fireNext();$('#fNext').focus()}
}
fStage.addEventListener('click',e=>{const b=e.target.closest('.opt');if(b)fireAnswer(+b.dataset.i)});
document.addEventListener('keydown',e=>{if($('#tab-fire').hidden||!F.on)return;if(/^[1-4]$/.test(e.key))fireAnswer(+e.key-1);else if(e.key==='Enter'&&F.locked&&F.paused)fireNext()});
function fireEnd(){
  fireStop();const best=F.score>(S.best||0);if(best){S.best=F.score;save()}
  fStats();
  fStage.innerHTML=`<div class="task">Time! You scored ${F.score}${best?' — a new best':''}.</div>
    ${F.misses.length?'<div class="eyebrow">Worth another look</div><ul class="misses">'+F.misses.map(q=>`<li><pre>${hl(q.c)}</pre><span>Prints <code>${esc(q.o[q.a])}</code>. ${esc(q.w)}</span></li>`).join('')+'</ul>':'<p class="note">No misses. Impressive.</p>'}
    <div class="actions"><button class="btn" id="fGo">Play again</button></div>`;
  $('#fGo').onclick=fireStart;
}

// ================= FIELD GUIDE =================
const BLOCKS=[
['Variables','<code>const</code> for boxes that keep their value, <code>let</code> for boxes that change.','const name = "Ada"\nlet lives = 3\nlives = lives - 1\nconsole.log(name, "has", lives, "lives")'],
['Template strings','Backticks plus <code>${ }</code> drop values into text.','const item = "coffee"\nconst price = 4.5\n`One ${item} costs $${price}`'],
['if / else','Run code only when a condition is true.','const temp = 31\nif (temp > 30) {\n  console.log("Hot! 🥵")\n} else {\n  console.log("Nice out")\n}'],
['for loop','Repeat with a counter.','for (let i = 1; i <= 3; i++) {\n  console.log("Round", i)\n}'],
['Arrays','Ordered lists, numbered from 0.','const pets = ["cat", "dog"]\npets.push("fish")\nconsole.log(pets[0], pets.length)'],
['Objects','Named values grouped together.','const book = { title: "Dune", pages: 412 }\nbook.read = true\nbook'],
['Functions','Reusable recipes with inputs and an output.','function area(w, h) {\n  return w * h\n}\narea(3, 4)'],
['Arrow functions','Short functions, perfect for callbacks.','const shout = text => text.toUpperCase() + "!"\nshout("hey")'],
['Destructuring','Unpack objects and arrays into variables.','const user = { id: 7, city: "Lyon" }\nconst { city } = user\nconst [first, second] = ["gold", "silver"]\nconsole.log(city, first)'],
['Spread','Copy or combine arrays and objects.','const a = [1, 2]\nconst b = [...a, 3, 4]\nconst base = { size: "M" }\nconsole.log(b, { ...base, color: "red" })'],
['Classes','A blueprint for making many similar objects.','class Monster {\n  constructor(name) {\n    this.name = name\n    this.hp = 10\n  }\n  hit() { this.hp -= 3 }\n}\nconst m = new Monster("Slime")\nm.hit()\nm'],
['async / await','Wait for slow things without freezing everything.','const wait = ms => new Promise(r => setTimeout(r, ms))\nasync function go() {\n  console.log("loading…")\n  await wait(800)\n  console.log("done ✅")\n}\ngo()'],
['try / catch','Handle errors instead of crashing.','try {\n  null.length\n} catch (err) {\n  console.log("Handled:", err.name)\n}'],
['Map and Set','A Map is a dictionary with any keys. A Set holds unique values.','const tags = new Set(["js", "ts", "js"])\nconst ages = new Map([["Ada", 36]])\nconsole.log(tags.size, ages.get("Ada"))'],
];
const ERRS=[
['ReferenceError: x is not defined','You used a name that does not exist. Usually a typo or a capital letter: <code>Score</code> and <code>score</code> are different names.'],
['TypeError: x is not a function','You put brackets after something that is not a function. Check the method name, for example <code>.lenght()</code> or <code>.Push()</code>.'],
["TypeError: Cannot read properties of undefined (reading 'name')",'The thing before <code>.name</code> is undefined. Print it to see what it really is.'],
['SyntaxError: Unexpected token','JavaScript could not read the code. Look for a missing comma, bracket or quote just before the spot it mentions.'],
['TypeError: Assignment to constant variable','You tried to put a new value in a <code>const</code>. Use <code>let</code> if it needs to change.'],
["SyntaxError: Identifier 'x' has already been declared",'You used let or const twice with the same name in the same place. Drop the second <code>let</code> and just assign.'],
["Error: Cannot find module './math'",'Node could not find the file. Check the path, the spelling, and that you are in the right folder.'],
["error TS2322: Type 'string' is not assignable to type 'number'",'TypeScript caught a value of the wrong type. Fix the value, or the type if the type was wrong.'],
];
function renderGuide(){
  const g=$('#guide');
  g.innerHTML=`
  <div><h2>Field guide</h2><p class="lede">Everything from the quest on one page, with pictures. Every code card has a Run button, so you can try it right here.</p></div>

  <section class="gsec"><h3>Who's who</h3><p>Three names, one language. Here is how they fit together.</p>
    <div class="flow">
      <div class="fstep panel"><span class="eyebrow">You write</span><span class="big">TypeScript</span><p>JavaScript plus type labels. A checker finds mistakes before anything runs. Files end in <code>.ts</code>.</p></div>
      <span class="farrow">→ tsc →</span>
      <div class="fstep panel"><span class="eyebrow">Becomes</span><span class="big">JavaScript</span><p>The language itself. The labels are stripped away and plain JavaScript is left. Files end in <code>.js</code>.</p></div>
      <span class="farrow">→</span>
      <div class="fstep panel"><span class="eyebrow">Runs in</span><span class="big">Browser or Node.js</span><p>A browser runs it inside web pages. Node.js runs it on your computer or a server, with access to files and the network.</p></div>
    </div></section>

  <section class="gsec"><h3>Building blocks</h3><p>The core pieces of the language. Press Run to see each one work.</p>
    <div class="cards">${BLOCKS.map((b,i)=>`<div class="card panel"><h4>${esc(b[0])}</h4><p>${b[1]}</p><pre>${hl(b[2])}</pre><div class="runrow"><button class="btn small" data-run="${i}">▶ Run</button></div><div class="runout" id="ro${i}"></div></div>`).join('')}</div></section>

  <section class="gsec"><h3>Types at a glance</h3><p>The same colours as the Memory panel.</p>
    <div class="panel tblwrap" style="padding:6px 8px"><table class="cmp"><tr><th>Type</th><th>Examples</th><th><code>typeof</code> says</th></tr>
      <tr><td><span class="ty ty-number" style="margin:0">number</span></td><td><code>42</code> <code>3.14</code> <code>-7</code> <code>NaN</code></td><td><code>"number"</code></td></tr>
      <tr><td><span class="ty ty-string" style="margin:0">string</span></td><td><code>"hi"</code> <code>'hi'</code> <code>\`hi \${x}\`</code></td><td><code>"string"</code></td></tr>
      <tr><td><span class="ty ty-boolean" style="margin:0">boolean</span></td><td><code>true</code> <code>false</code></td><td><code>"boolean"</code></td></tr>
      <tr><td><span class="ty ty-undefined" style="margin:0">undefined</span></td><td><code>let x</code> with no value</td><td><code>"undefined"</code></td></tr>
      <tr><td><span class="ty ty-null" style="margin:0">null</span></td><td><code>null</code>, empty on purpose</td><td><code>"object"</code> (an old bug)</td></tr>
      <tr><td><span class="ty ty-array" style="margin:0">array</span></td><td><code>[1, 2, 3]</code></td><td><code>"object"</code>, use <code>Array.isArray()</code></td></tr>
      <tr><td><span class="ty ty-object" style="margin:0">object</span></td><td><code>{ name: "Ada" }</code></td><td><code>"object"</code></td></tr>
      <tr><td><span class="ty ty-function" style="margin:0">function</span></td><td><code>x =&gt; x * 2</code></td><td><code>"function"</code></td></tr>
    </table></div></section>

  <section class="gsec"><h3>Truthy or falsy?</h3><p>In an <code>if</code>, every value counts as true or false. Only these six are false. Everything else is true.</p>
    <div class="chips">${['false','0','""','null','undefined','NaN'].map(x=>`<span class="chip f">${x}</span>`).join('')}</div>
    <p>Some surprises that count as <b>true</b>:</p>
    <div class="chips">${['"0"','"false"','" "','[]','{}','-1'].map(x=>`<span class="chip t">${esc(x)}</span>`).join('')}</div></section>

  <section class="gsec"><h3><code>===</code> or <code>==</code>?</h3><p>Always use <code>===</code>. Here is why.</p>
    <div class="panel tblwrap" style="padding:6px 8px"><table class="cmp"><tr><th>Comparison</th><th>===</th><th>==</th></tr>
      ${[['5 vs "5"',0,1],['0 vs ""',0,1],['null vs undefined',0,1],['0 vs false',0,1],['"a" vs "a"',1,1]].map(r=>`<tr><td><code>${esc(r[0])}</code></td><td class="${r[1]?'yes':'no'}">${r[1]?'true':'false'}</td><td class="${r[2]?'yes':'no'}">${r[2]?'true':'false'}</td></tr>`).join('')}
    </table></div></section>

  <section class="gsec"><h3>Array methods, pictured</h3><p>Each one takes a function and runs it on every item of <code>[1, 2, 3, 4]</code>.</p>
    <div class="panel pipe" style="padding:16px">
      <div class="pipeRow"><code>.map(n =&gt; n * 2)</code><div class="belt"><span class="ball a">1</span><span class="ball b">2</span><span class="ball c">3</span><span class="ball d">4</span><span class="to">→</span><span class="ball a">2</span><span class="ball b">4</span><span class="ball c">6</span><span class="ball d">8</span><span class="note">same count, each changed</span></div></div>
      <div class="pipeRow"><code>.filter(n =&gt; n &gt; 2)</code><div class="belt"><span class="ball a">1</span><span class="ball b">2</span><span class="ball c">3</span><span class="ball d">4</span><span class="to">→</span><span class="ball ghost">1</span><span class="ball ghost">2</span><span class="ball c">3</span><span class="ball d">4</span><span class="note">only the ones that pass</span></div></div>
      <div class="pipeRow"><code>.find(n =&gt; n &gt; 2)</code><div class="belt"><span class="ball a">1</span><span class="ball b">2</span><span class="ball c">3</span><span class="ball d">4</span><span class="to">→</span><span class="ball c">3</span><span class="note">the first that passes, not an array</span></div></div>
      <div class="pipeRow"><code>.reduce((t, n) =&gt; t + n, 0)</code><div class="belt"><span class="ball a">1</span><span class="ball b">2</span><span class="ball c">3</span><span class="ball d">4</span><span class="to">→</span><span class="ball a" style="width:38px;height:38px">10</span><span class="note">everything boiled down to one value</span></div></div>
      <div class="pipeRow"><code>.some(n =&gt; n &gt; 3)</code><div class="belt"><span class="ball a">1</span><span class="ball b">2</span><span class="ball c">3</span><span class="ball d">4</span><span class="to">→</span><code>true</code><span class="note">does at least one pass?</span></div></div>
    </div></section>

  <section class="gsec"><h3>The event loop</h3><p>JavaScript does one thing at a time. Slow jobs wait in a waiting room, and their callbacks queue up to run once the current code has finished.</p>
    <div class="loop">
      <div class="lbox panel"><span class="eyebrow">1 · Call stack</span><h4>Running now</h4><div class="stack"><span>console.log("1: first")</span><span>your script</span></div><p>Runs your code line by line, to the end, without stopping.</p></div>
      <div class="lbox panel"><span class="eyebrow">2 · Waiting room</span><h4>Timers, files, network</h4><div class="q"><span>⏱ setTimeout 0 ms</span><span>🍕 pizza promise</span></div><p>Handled by the browser or Node, outside your code.</p></div>
      <div class="lbox panel"><span class="eyebrow">3 · Queue</span><h4>Callbacks ready to run</h4><div class="q"><span>() =&gt; log("3: last")</span></div><p>When the stack is empty, the next callback in line moves onto it.</p></div>
    </div></section>

  <section class="gsec"><h3>Error decoder</h3><p>Errors are messages, not failures. Learn these and you can fix most bugs yourself.</p>
    <div class="errs">${ERRS.map(e=>`<div class="card panel"><code class="e">${esc(e[0])}</code><p>${e[1]}</p></div>`).join('')}</div></section>

  <section class="gsec"><h3>Set up your own computer</h3><p>When you are ready to leave the playground, this is the path every professional setup starts with.</p>
    <ol class="steps">
      <li class="panel"><div><b>Install Node.js</b><p>Download the LTS version (long-term support, the stable one) from nodejs.org. npm comes with it. Then open a terminal and check:</p><pre>node -v\nnpm -v</pre></div></li>
      <li class="panel"><div><b>Install an editor</b><p>VS Code is free and the most common choice. It understands JavaScript and TypeScript out of the box, with autocomplete and red squiggles for errors.</p></div></li>
      <li class="panel"><div><b>Make a project</b><p>Create a folder, step into it, and make a package.json, just like in chapter 12.</p><pre>mkdir my-app\ncd my-app\nnpm init -y</pre></div></li>
      <li class="panel"><div><b>Write and run a file</b><p>Create index.js in VS Code with a console.log in it, then:</p><pre>node index.js</pre></div></li>
      <li class="panel"><div><b>Add TypeScript</b><p>Install the compiler into the project, create its settings file, then check and compile your .ts files. Recent Node versions can also run a .ts file directly by stripping the types, but only tsc checks them.</p><pre>npm install -D typescript\nnpx tsc --init\nnpx tsc</pre></div></li>
      <li class="panel"><div><b>Keep going</b><p>Good next steps: the browser DOM (make web pages react to clicks), Git for saving versions of your work, a web server with Express, and later a UI library like React.</p></div></li>
    </ol></section>`;
}
const guideRealms={};
$('#guide').addEventListener('click',e=>{
  const b=e.target.closest('[data-run]');if(!b)return;const i=+b.dataset.run;const out=$('#ro'+i);out.innerHTML='';
  killRealm(guideRealms[i]);
  const add=(h,cls)=>{const d=document.createElement('div');d.className='line '+(cls||'');d.innerHTML=h;out.appendChild(d)};
  const R=makeRealm({out(l,a){add(l==='table'?tableHTML(a[0]):l==='echo'?'<span class="v-u">← </span>'+fmt(a[0]):fmtArgs(a),l==='error'?'err':'')},asyncErr(er){add(esc('Uncaught '+errName(er)),'err')},clear(){out.innerHTML=''}});
  R.w.__asyncOut=v=>{if(v!==undefined)add('<span class="v-u">← </span>'+fmt(v))};
  guideRealms[i]=R;
  const p=prepare(BLOCKS[i][2]);if(p.error){add(esc(errName(p.error)),'err');return}
  const er=runScript(R,p.code);
  if(er)add(esc('Uncaught '+errName(er)),'err');else if(R.hasLast&&p.echo)add('<span class="v-u">← </span>'+fmt(R.last));
  setTimeout(()=>{if(guideRealms[i]===R){killRealm(R);delete guideRealms[i]}},15000);
});

// ================= BOOT =================
renderTop();
setChapter(Math.min(S.chap||0,CH.length-1));
if(location.hash==='#fire')showTab('fire');else if(location.hash==='#guide')showTab('guide');

})();
