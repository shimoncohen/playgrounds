/* Agent Quest virtual files: a flat map of path -> text. Paths are relative, use "/" and never contain "..". DOM-free.
   Nothing here throws on a bad path: write() and remove() just say false. */
(()=>{
'use strict';
const AQ=globalThis.AQ=globalThis.AQ||{};
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const MAXTEXT=20000;
const valid=p=>typeof p==='string'&&p.length>0&&p.length<=200&&/^[\w.@-]+(?:\/[\w.@-]+)*\/?$/.test(p)&&!p.split('/').some(s=>s==='.'||s==='..');
const dir=p=>p.endsWith('/')?p:p+'/';
const proto={
  read(p){return typeof p==='string'&&own(this.files,p)?this.files[p]:null;},
  list(prefix=''){return Object.keys(this.files).filter(f=>f.startsWith(prefix)).sort();},
  write(p,text){
    if(!valid(p)||p.endsWith('/')||typeof text!=='string')return false;
    this.files[p]=text.slice(0,MAXTEXT);return true;
  },
  remove(p){if(typeof p==='string'&&own(this.files,p)){delete this.files[p];return true;}return false;},
  clone(){return create(this.files);}
};
function create(files){
  const v=Object.create(proto);v.files=Object.create(null);
  if(files&&typeof files==='object')for(const p of Object.keys(files))v.write(p,files[p]);
  return v;
}
AQ.vfs={create,valid,dir,own};
})();
