(function (root) {
'use strict';
// looked up at call time so the load order of the realm file does not matter
const runScript=(R,code)=>root.JSRealm.runScript(R,code);
class FakeBuffer{constructor(s){this._s=String(s)}toString(){return this._s}get length(){return this._s.length}}

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
root.NodeEnv={NODE_VERSION,FakeBuffer,make:makeNodeEnv};
})(typeof window !== 'undefined' ? window : globalThis);
