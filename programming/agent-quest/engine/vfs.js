/* Agent Quest virtual files: a flat map of path -> text. Paths are relative, use "/" and never contain "..". DOM-free.
   Nothing here throws on a bad path: write() and remove() just say false. */
(()=>{
'use strict';
const AQ=globalThis.AQ=globalThis.AQ||{};
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const MAXTEXT=20000;
const valid=p=>typeof p==='string'&&p.length>0&&p.length<=200&&/^[\w.@-]+(?:\/[\w.@-]+)*\/?$/.test(p)&&!p.split('/').some(s=>s==='.'||s==='..');
const dir=p=>p.endsWith('/')?p:p+'/';
const anchorOf=h=>h.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
/* the text of the heading whose anchor is `anchor`, to the next heading of the same or a higher level; null when there is none.
   The first duplicate wins and fenced code is not special-cased. */
function section(text,anchor){
  if(!anchor)return null;
  const ls=String(text).split('\n');
  let start=-1,level=0;
  for(let i=0;i<ls.length;i++){
    const m=/^(#{1,6})\s+(.*)$/.exec(ls[i]);
    if(!m)continue;
    if(start<0){if(anchorOf(m[2])===anchor){start=i;level=m[1].length;}}
    else if(m[1].length<=level)return ls.slice(start,i).join('\n');
  }
  return start<0?null:ls.slice(start).join('\n');
}
const proto={
  /* "file#anchor" reads one section, only when no file has that exact name; valid() still rejects #, so no file can */
  read(p){
    if(typeof p!=='string')return null;
    if(own(this.files,p))return this.files[p];
    const i=p.indexOf('#');
    return i>0&&own(this.files,p.slice(0,i))?section(this.files[p.slice(0,i)],p.slice(i+1)):null;
  },
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
AQ.vfs={create,valid,dir,own,section};
})();
