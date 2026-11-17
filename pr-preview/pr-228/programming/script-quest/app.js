
(()=>{
"use strict";
// ================= ENGINE =================
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const tagOf=v=>Object.prototype.toString.call(v).slice(8,-1);
const decl=(src,n)=>new RegExp('\\b(?:let|const|var)\\b[^;\\n]*\\b'+n+'\\b|\\b(?:function|class)\\s+'+n+'\\b').test(src||'');
const SCQ=window.SCQ;
SCQ.engine={decl,tagOf};
const {CH,FIRE,qfOpen,BLOCKS}=SCQ;
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

const RANKS=[[0,'Newbie'],[60,'Tinkerer'],[180,'Coder'],[340,'Builder'],[520,'Engineer'],[700,'Wizard']];

// ================= UI =================
const KEY='script-quest-v1';
const RUNS={'greet.js':'node greet.js Pepper','package.json':'npm start','math.js':null};
CH.forEach(ch=>ch.missions.forEach(m=>{if(m.editFile&&!('run' in m))m.run=m.editFile in RUNS?RUNS[m.editFile]:'node '+m.editFile}));
/* the starter files live in window.PROGRESS so shared/progress.js can tell an untouched project from an edited one */
const INITIAL_FILES=window.PROGRESS.defaults.files;
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
    missionEl.innerHTML=`${Trail.html(ch.story)}<div class="eyebrow">Chapter ${c+1} · Mission ${j+1} of ${ch.missions.length}${S.done[mk(c,j)]?' · replay':''}</div>
      <h2>${esc(m.title)}</h2>
      ${j===0?'<p class="intro">'+HowSteps.tick(ch.intro,esc)+'</p>':''}
      <div class="goal"><div class="label">${m.editFile?'Your mission · edit '+esc(m.editFile):'Your mission'}</div><p>${HowSteps.tick(m.goal,esc)}</p><pre>${MODE==='sh'&&!m.editFile?esc(m.code):hl(m.code)}</pre></div>
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
   <div class="mem">${boxes||'<div class="memempty">Empty for now. Make a variable, like <code>let coins = 0</code>, and a box will appear here.</div>'}
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
  const open=qfOpen(S.done);
  if(!open.length){
    fStage.innerHTML=`<div class="example"><div class="eyebrow">Locked for now</div><p class="note" style="margin-top:8px">Quick-fire only asks about things the quest has already taught. Finish all of <b>Chapter 1: ${esc(CH[0].name)}</b> first, and the first questions open up. Each later chapter you finish adds more.</p></div>
    <div class="actions" style="margin-top:12px"><button class="btn" id="fGo">Go to the quest</button></div>`;
    $('#fGo').onclick=()=>showTab('quest');return;
  }
  const ex=FIRE[0];
  fStage.innerHTML=`<div class="example"><div class="eyebrow">Example</div><pre class="snip">${hl(ex.c)}</pre><p class="note" style="margin-top:8px">Answer: <code>22</code>. ${esc(ex.w)}</p></div>
    ${open.length<FIRE.length?`<p class="note">${open.length} of ${FIRE.length} questions are open. Finish more chapters to unlock the rest.</p>`:''}
    <div class="actions"><button class="btn" id="fGo">Start the clock</button></div>`;
  $('#fGo').onclick=fireStart;
}
function fireStart(){
  if(!qfOpen(S.done).length){fireIdle();return}
  Object.assign(F,{on:true,score:0,streak:0,time:75,misses:[],locked:false,paused:false});
  F.order=qfOpen(S.done).sort(()=>Math.random()-.5);
  clearInterval(F.tick);let last=performance.now();
  F.tick=setInterval(()=>{const now=performance.now();if(!F.paused)F.time-=(now-last)/1000;last=now;if(F.time<=0){F.time=0;fireEnd()}fStats()},100);
  fireNext();
}
function fireStop(){clearInterval(F.tick);F.on=false}
function fireNext(){
  if(!F.order.length)F.order=qfOpen(S.done).sort(()=>Math.random()-.5);
  const q=F.order.pop();
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

function renderGuide(){
  const g=$('#guide');
  g.innerHTML=SCQ.guideHTML({esc,hl});
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
