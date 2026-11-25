/* Data Structures Quest: drawing and animation for the scene models in scenes.js.
   Each renderer takes a scene state and returns an HTML string with a hook on every item of items(s): data-i, data-l, data-head, data-v or data-k.
   plan() chooses the animation from a step and is pure, so Node can test it. play() applies a plan to the DOM. Strings are built only inside functions. */
(()=>{
'use strict';
const D=globalThis.DSQ=globalThis.DSQ||{};
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const LEAVE_MS=300,ENTER_MS=500,SHAKE_MS=400;
const ATTR={i:'data-i',l:'data-l',v:'data-v',k:'data-k',head:'data-head'};
const attrOf=sel=>Object.keys(sel).find(k=>ATTR[k]);

/* o.interactive: the root is a group and every positional item can take focus, for pages that let the learner pick nodes. */
const root=(cls,label,o,inner)=>`<div class="sc ${cls}" role="${o&&o.interactive?'group':'img'}" aria-label="${esc(label)}">${inner}</div>`;
const tab=o=>o&&o.interactive?' tabindex="0"':'';
const ptrOf=(s,sc,sel)=>sc.pointers(s).filter(p=>{const{name,...r}=p;return JSON.stringify(r)===JSON.stringify(sel)}).map(p=>`<span class="sc-ptr">${esc(p.name)}</span>`).join('');
const S=()=>D.SCENES;
const list=(a,w)=>a.length?a.join(', '):`no ${w}`;

const box=(shape,s,o,i,x,cls)=>`<div class="sc-item sc-box ${cls}" data-i="${i}"${tab(o)}>${ptrOf(s,S()[shape],{i})}<span class="sc-val">${esc(x)}</span><i class="sc-idx">${i}</i></div>`;

function row(s,o){
 const body=s.v.length?s.v.map((x,i)=>box('row',s,o,i,x,'t-int')).join(''):'<span class="empty">empty row</span>';
 return root('sc-row',`Row of ${s.v.length} boxes: ${list(s.v,'boxes')}`,o,`<div class="sc-flow">${body}</div>`);
}
function pile(s,o){
 const body=s.v.length?s.v.map((x,i)=>box('pile',s,o,i,x,'t-list')).reverse().join(''):'<span class="empty">empty stack</span>';
 return root('sc-pile',`Stack of ${s.v.length} items, top first: ${list([...s.v].reverse(),'items')}`,o,`<div class="sc-col">${body}<div class="sc-base"></div></div>`);
}
function line(s,o){
 const body=s.v.length?s.v.map((x,i)=>box('line',s,o,i,x,'t-list')).join(''):'<span class="empty">empty queue</span>';
 return root('sc-line',`Queue of ${s.v.length} items, front first: ${list(s.v,'items')}`,o,`<div class="sc-flow">${body}</div>`);
}
function chain(s,o){
 const sc=S().chain,vals=D.listVals(s.v),L=s.loose||[],R=D.listVals(s.rest||null);
 const node=(attr,i,x,arrow)=>`<div class="${attr?'sc-item ':''}sc-node"${attr?` ${attr}="${i}"${tab(o)}`:''}><span class="sc-val">${esc(x)}</span>${arrow?'<span class="sc-arrow" aria-hidden="true">→</span>':'<span class="sc-nil" aria-hidden="true">∅</span>'}</div>`;
 const head=`<div class="sc-item sc-head" data-head="true"${tab(o)}><span class="sc-ptr">${esc((sc.pointers(s)[0]||{name:'head'}).name)}</span><span class="sc-arrow" aria-hidden="true">${vals.length?'→':'∅'}</span></div>`;
 const main=vals.map((x,i)=>node('data-i',i,x,true)).join('');
 const loose=L.length?`<div class="sc-flow sc-loose"><span class="sc-tag">loose</span>${L.map((n,l)=>node('data-l',l,n.value,false)).join('')}</div>`:'';
 const rest=R.length?`<div class="sc-flow sc-loose"><span class="sc-tag">not flipped yet</span>${R.map((x,i)=>node(null,i,x,i<R.length-1)).join('')}</div>`:'';
 const label=`Linked list of ${vals.length} nodes: ${list(vals,'nodes')}${L.length?`. ${L.length} loose nodes: ${list(L.map(n=>n.value),'nodes')}`:''}${R.length?`. ${R.length} not flipped yet: ${list(R,'nodes')}`:''}`;
 return root('sc-chain',label,o,`<div class="sc-flow">${head}${main}</div>${loose}${rest}`);
}
function buckets(s,o){
 const isSet=s.v instanceof Set,max=isSet?6:5,items=isSet?[...s.v]:[...s.v];
 const cells=items.map(x=>isSet
  ?`<div class="sc-item sc-bucket t-bool" data-v="${esc(x)}"><span class="sc-val">${esc(x)}</span></div>`
  :`<div class="sc-item sc-bucket t-dict" data-k="${esc(x[0])}"><b class="sc-key">${esc(x[0])}</b><span class="sc-val">${esc(x[1])}</span></div>`);
 for(let n=items.length;n<max;n++)cells.push('<div class="sc-bucket sc-slot" aria-hidden="true"></div>');
 const label=isSet?`Set of ${items.length} values: ${list(items,'values')}`:`Map of ${items.length} pairs: ${items.length?items.map(([k,x])=>`${k} is ${x}`).join(', '):'no pairs'}`;
 return root(`sc-buckets${isSet?' sc-set':''}`,label,o,`<div class="sc-flow">${cells.join('')}</div>`);
}
function tree(s,o){
 const sc=S().tree,vals=D.treeVals(s.v);
 const one=n=>{
  if(!n)return '<span class="nil" aria-hidden="true">∅</span>';
  const kids=[n.left,n.right],more=kids.some(Boolean);
  return `<div class="tnode"><div class="sc-item tv t-dict" data-v="${esc(n.value)}">${ptrOf(s,sc,{v:n.value})}<span class="sc-val">${esc(n.value)}</span></div>${more?`<div class="tkids">${kids.map(k=>`<div class="tkid">${one(k)}</div>`).join('')}</div>`:''}</div>`;
 };
 return root('sc-tree',`Search tree of ${vals.length} nodes, in order: ${list(vals,'nodes')}`,o,s.v?`<div class="tree">${one(s.v)}</div>`:'<span class="empty">empty tree</span>');
}

const ent=(sel,cls,extra)=>({sel,cls,...extra});
function plan(shape,step,{reduced}={}){
 const p={leave:[],enter:[],hi:step.hi||[],shake:false,leaveMs:0,enterMs:0};
 if(!step.ok){p.shake=!reduced;return p}
 if(reduced)return p;
 for(const c of step.changes){
  const{kind,from,to}=c,sel=()=>{const{kind:_,...r}=c;return r};
  if(kind==='remove'){const s=sel();p.leave.push(ent(s,s.i===0&&shape!=='pile'?'sc-slide-out':'sc-out'))}
  else if(kind==='add'){const s=sel();p.enter.push(ent(s,shape==='pile'?'sc-drop':s.i===0&&(shape==='row'||shape==='chain')?'sc-slide-in':'sc-in'))}
  else if(kind==='move'){
   if(from.l!==undefined)p.enter.push(ent(to,'sc-join'));
   else p.enter.push(ent(to,to.i>from.i?'sc-slide-r':'sc-slide-l'));
  }
  else if(kind==='swap'){p.enter.push(ent(from,'sc-swap',{with:to}),ent(to,'sc-swap',{with:from}))}
  else if(kind==='relink')p.enter.push(ent(from,'sc-repoint'));
 }
 if(p.leave.length)p.leaveMs=LEAVE_MS;
 if(p.enter.length)p.enterMs=ENTER_MS;
 return p;
}

const find=(box,sel)=>{const k=attrOf(sel);if(!k)return null;const a=ATTR[k],v=String(sel[k]);return [...box.querySelectorAll(`[${a}]`)].find(e=>e.getAttribute(a)===v)||null};
const mark=(box,sels,cls)=>{box.querySelectorAll('.hi,.walk').forEach(x=>x.classList.remove('hi','walk'));for(const h of sels||[]){const e=find(box,h);if(e)e.classList.add(cls)}};

/* Plays one step. `before` is a clone taken before the operation, drawn only for the leave phase. */
function play(box,shape,before,after,step,o={}){
 const{reduced,onDone,interactive}=o,p=plan(shape,step,{reduced}),paint=st=>{box.innerHTML=D.draw[shape](st,{interactive})};
 const end=()=>{for(const e of p.enter){const el=find(box,e.sel);if(el)el.classList.remove(e.cls)}mark(box,p.hi,'hi');if(onDone)onDone()};
 if(p.shake){box.classList.add('sc-shake');setTimeout(()=>{box.classList.remove('sc-shake');end()},SHAKE_MS);return}
 const enter=()=>{
  paint(after);
  const dx=p.enter.map(e=>{const a=e.with&&find(box,e.sel),b=e.with&&find(box,e.with);return a&&b?b.getBoundingClientRect().left-a.getBoundingClientRect().left:0});
  p.enter.forEach((e,n)=>{const el=find(box,e.sel);if(!el)return;if(e.with)el.style.setProperty('--dx',dx[n]+'px');el.classList.add(e.cls)});
  if(p.enterMs)setTimeout(end,p.enterMs);else end();
 };
 if(p.leaveMs){paint(before);for(const e of p.leave){const el=find(box,e.sel);if(el)el.classList.add(e.cls)}setTimeout(enter,p.leaveMs)}
 else enter();
}

D.draw={row,pile,line,chain,buckets,tree,plan,play,find,mark,LEAVE_MS,ENTER_MS,SHAKE_MS};
})();
