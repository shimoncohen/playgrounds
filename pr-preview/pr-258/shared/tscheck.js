(function (root) {
'use strict';
let tsDoc=null;
function init(o){tsDoc=o.document}
/* ---------- TypeScript (loaded on demand) ---------- */
const TS_URL='https://cdn.jsdelivr.net/npm/typescript@5.9.3/lib/typescript.min.js';
const TS_URL2='https://cdn.jsdelivr.net/npm/typescript@5.9.3/lib/typescript.js';
let tsState='idle',tsWaiters=[];
function loadTS(){
  if(tsState==='ready')return Promise.resolve(true);
  if(tsState==='failed')tsState='idle';
  return new Promise(res=>{tsWaiters.push(res);if(tsState==='loading')return;tsState='loading';
    const done=ok=>{tsState=ok?'ready':'failed';tsWaiters.splice(0).forEach(f=>f(ok))};
    const add=(url,next)=>{const s=tsDoc.createElement('script');s.src=url;s.onload=()=>done(typeof ts!=='undefined');s.onerror=next;tsDoc.head.appendChild(s)};
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
type ReturnType<T extends (...a: any) => any> = T extends (...a: any) => infer R ? R : any;
type Extract<T, U> = T extends U ? T : never;
type NonNullable<T> = T & {};
type Uppercase<S extends string> = intrinsic;
type Lowercase<S extends string> = intrinsic;
type Capitalize<S extends string> = intrinsic;
type Uncapitalize<S extends string> = intrinsic;
type Parameters<T extends (...a: any) => any> = T extends (...a: infer P) => any ? P : never;
type InstanceType<T extends abstract new (...a: any) => any> = T extends abstract new (...a: any) => infer R ? R : any;
interface ObjectConstructor {
  keys(o: {}): string[];
  values<T>(o: { [s: string]: T } | ArrayLike<T>): T[]; values(o: {}): any[];
  entries<T>(o: { [s: string]: T } | ArrayLike<T>): [string, T][]; entries(o: {}): [string, any][];
}
declare var Object: ObjectConstructor;
interface Map<K, V> {
  readonly size: number; get(k: K): V | undefined; has(k: K): boolean; set(k: K, v: V): this; delete(k: K): boolean; clear(): void;
  forEach(f: (v: V, k: K, m: Map<K, V>) => void): void;
}
interface MapConstructor { new(): Map<any, any>; new <K, V>(entries?: readonly (readonly [K, V])[] | null): Map<K, V>; }
declare var Map: MapConstructor;
interface Set<T> {
  readonly size: number; add(v: T): this; has(v: T): boolean; delete(v: T): boolean; clear(): void;
  forEach(f: (v: T, v2: T, s: Set<T>) => void): void;
}
interface SetConstructor { new <T = any>(values?: readonly T[] | null): Set<T>; }
declare var Set: SetConstructor;
interface Date {
  getTime(): number; valueOf(): number; getFullYear(): number; getMonth(): number; getDate(): number; getDay(): number;
  getHours(): number; getMinutes(): number; getSeconds(): number; getMilliseconds(): number;
  toISOString(): string; toString(): string;
}
interface DateConstructor {
  new(): Date; new(value: number | string): Date;
  new(year: number, monthIndex: number, date?: number, hours?: number, minutes?: number, seconds?: number, ms?: number): Date;
  (): string; now(): number; parse(s: string): number;
}
declare var Date: DateConstructor;`;
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
const PROJECT_LIB='/.lib/lib.d.ts',CONFIG='tsconfig.json';
// The host sees only the map: no disk, so a config's paths, typeRoots and extends cannot reach outside it.
function tsCheckProject(input){
  const files={};
  for(const k of Object.keys(input))files['/'+k.replace(/^\.?\//,'')]=String(input[k]);
  files[PROJECT_LIB]=TS_LIB;
  const rel=n=>n.slice(1);
  const dirs=new Set(['/']);
  for(const k of Object.keys(files))for(let d=k.slice(0,k.lastIndexOf('/'));d;d=d.slice(0,d.lastIndexOf('/')))dirs.add(d);
  const entries=dir=>{
    const base=dir==='/'?'/':dir+'/',fl=[],dl=new Set();
    for(const k of Object.keys(files)){
      if(k===PROJECT_LIB||!k.startsWith(base))continue;
      const rest=k.slice(base.length),i=rest.indexOf('/');
      if(i<0)fl.push(rest);else dl.add(rest.slice(0,i));
    }
    return {files:fl,directories:[...dl]};
  };
  const sys={
    useCaseSensitiveFileNames:true,newLine:'\n',
    fileExists:n=>n in files,
    readFile:n=>files[n],
    directoryExists:d=>dirs.has(d),
    getDirectories:d=>entries(d).directories,
    readDirectory:(dir,ext,exc,inc,depth)=>ts.matchFiles(dir,ext,exc,inc,true,'/',depth,entries,p=>p),
  };
  const out=[];
  const push=(d,file)=>{
    const p=d.file?d.file.getLineAndCharacterOfPosition(d.start):{line:0,character:0};
    out.push({file:d.file?rel(d.file.fileName):file,line:p.line+1,col:p.character+1,code:d.code,msg:ts.flattenDiagnosticMessageText(d.messageText,'\n')});
  };
  let opts={strict:true,target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS},roots;
  if('/'+CONFIG in files){
    const parsed=ts.parseConfigFileTextToJson('/'+CONFIG,files['/'+CONFIG]);
    if(parsed.error)push(parsed.error,CONFIG);
    const cfg=ts.parseJsonConfigFileContent(parsed.config||{},sys,'/',undefined,'/'+CONFIG);
    cfg.errors.forEach(d=>push(d,CONFIG));
    opts={target:opts.target,module:opts.module,...cfg.options};
    roots=cfg.fileNames;
  }else roots=Object.keys(files).filter(k=>/\.ts$/.test(k)&&k!==PROJECT_LIB);
  delete opts.lib;delete opts.typeRoots;
  Object.assign(opts,{noLib:true,types:[],noEmit:true,configFilePath:undefined});
  const host={
    getSourceFile:(n,v)=>files[n]!=null?ts.createSourceFile(n,files[n],v):undefined,
    getDefaultLibFileName:()=>PROJECT_LIB,writeFile(){},getCurrentDirectory:()=>'/',getDirectories:sys.getDirectories,
    fileExists:sys.fileExists,readFile:sys.readFile,directoryExists:sys.directoryExists,realpath:p=>p,
    getCanonicalFileName:n=>n,useCaseSensitiveFileNames:()=>true,getNewLine:()=>'\n',
  };
  const prog=ts.createProgram([PROJECT_LIB,...roots],opts,host);
  [...prog.getOptionsDiagnostics(),...prog.getSyntacticDiagnostics(),...prog.getSemanticDiagnostics()].forEach(d=>{if(!d.file||d.file.fileName!==PROJECT_LIB)push(d,CONFIG)});
  const js={};
  for(const sf of prog.getSourceFiles()){
    if(sf.isDeclarationFile)continue;
    js[rel(sf.fileName).replace(/\.ts$/,'.js')]=ts.transpileModule(sf.text,{compilerOptions:opts,fileName:sf.fileName}).outputText;
  }
  return {diags:out,js,ok:!out.length};
}
root.TSCheck={init,check:tsCheck,checkProject:tsCheckProject,load:loadTS};
})(typeof window !== 'undefined' ? window : globalThis);
