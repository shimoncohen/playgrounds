(()=>{
'use strict';
const UI=window.RQUI=window.RQUI||{};
const SVG='http://www.w3.org/2000/svg';
const h=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;};
const sv=(tag,attrs)=>{const e=document.createElementNS(SVG,tag);for(const k of Object.keys(attrs||{}))e.setAttribute(k,attrs[k]);return e;};
const BADGE={moved:'moved',uninit:'no value yet',dropped:'freed by drop',mutBorrowed:'&mut borrowed'};
const badge=v=>v.state==='shared'?'borrowed'+(v.n>1?' x'+v.n:''):BADGE[v.state]||'';

function sentence(e){
  const n=e.name?'The variable '+e.name:'A temporary value';
  if(e.t==='alloc')return e.empty?'An empty '+e.kind+' was made (#'+e.id+'). It takes no heap memory until it grows.':'A '+e.kind+' was made on the heap (#'+e.id+').';
  if(e.t==='move')return n+' moved, so it cannot be used any more.';
  if(e.t==='drop')return e.part?null:n+' was dropped'+(e.ty==='String'?'.':' ('+e.ty+').');
  if(e.t==='free')return 'Heap #'+e.id+' was freed.';
  return null;
}

function slot(leaf,snap){
  if(leaf.ref){
    const loan=snap.loans.find(l=>l.id===leaf.loan),live=!loan||loan.live;
    const s=h('span','mv-slot mv-ref '+(leaf.mut?'mut':'shared')+(live?'':' ended'));
    if(leaf.path)s.append(h('i',null,leaf.path+' '));
    s.append(document.createTextNode((leaf.mut?'&mut':'&')+' to '+(leaf.toName||'a temporary')+(leaf.text?' '+leaf.text:'')+(live?'':' (borrow ended)')));
    if(leaf.to!==null)s.dataset.refTo=leaf.to;
    s.dataset.mut=leaf.mut?'1':'';s.dataset.live=live?'1':'';
    return s;
  }
  const s=h('span','mv-slot');
  if(leaf.path)s.append(h('i',null,leaf.path+' '));
  if('heap' in leaf){
    if(leaf.heap===null)s.append(document.createTextNode('pointer (gone)'));
    else{s.classList.add('mv-ptr');s.dataset.heap=leaf.heap;s.append(document.createTextNode('pointer to #'+leaf.heap));}
  }else s.append(document.createTextNode(leaf.text));
  return s;
}

function varRow(v,snap){
  const row=h('div','mv-var');
  row.dataset.state=v.state;row.dataset.uid=v.uid;
  const head=h('div','mv-head');
  head.append(h('b','mv-name',v.name),h('span','mv-ty',v.ty));
  const b=badge(v);
  if(b)head.append(h('span','mv-badge',b));
  row.append(head);
  const slots=h('div','mv-slots');
  for(const l of v.leaves)slots.append(slot(l,snap));
  if(!v.leaves.length)slots.append(h('span','mv-slot empty','empty'));
  row.append(slots);
  return row;
}

function heapBox(o){
  const b=h('div','mv-box');
  b.dataset.heap=o.id;
  b.append(h('span','mv-id','#'+o.id),h('span','mv-kind',o.kind));
  if(o.content==='')b.append(h('em','mv-empty','empty, no heap memory yet'));else b.append(h('q',null,o.content));
  b.append(h('small',null,o.owner?'owner: '+o.owner:'no owner'));
  return b;
}

function arrows(cols,svg){
  svg.textContent='';
  const box=cols.getBoundingClientRect();
  svg.setAttribute('viewBox','0 0 '+Math.max(1,box.width)+' '+Math.max(1,box.height));
  const defs=sv('defs');
  for(const k of ['own','shared','mut']){
    const m=sv('marker',{id:'mv-head-'+k,viewBox:'0 0 10 10',refX:'9',refY:'5',markerWidth:'7',markerHeight:'7',orient:'auto-start-reverse'});
    m.append(sv('path',{d:'M0 0L10 5L0 10z',class:'mv-h-'+k}));
    defs.append(m);
  }
  svg.append(defs);
  const rel=r=>({l:r.left-box.left,r:r.right-box.left,t:r.top-box.top,b:r.bottom-box.top,cx:(r.left+r.right)/2-box.left,cy:(r.top+r.bottom)/2-box.top});
  const draw=(from,to,kind,live)=>{
    const a=rel(from.getBoundingClientRect()),z=rel(to.getBoundingClientRect());
    let d;
    if(z.t>a.b+4){d='M'+a.r+' '+a.cy+' C'+(a.r+36)+' '+a.cy+' '+z.cx+' '+(z.t-36)+' '+z.cx+' '+z.t;}
    else if(z.l>a.r+8){d='M'+a.r+' '+a.cy+' C'+(a.r+40)+' '+a.cy+' '+(z.l-40)+' '+z.cy+' '+z.l+' '+z.cy;}
    else{d='M'+a.r+' '+a.cy+' C'+(a.r+44)+' '+a.cy+' '+(z.r+44)+' '+z.cy+' '+z.r+' '+z.cy;}
    const p=sv('path',{d,class:'mv-a mv-a-'+kind+(live?'':' ended'),'marker-end':'url(#mv-head-'+kind+')',fill:'none'});
    svg.append(p);
  };
  for(const s of cols.querySelectorAll('.mv-ptr')){
    const t=cols.querySelector('.mv-box[data-heap="'+s.dataset.heap+'"]');
    if(t)draw(s,t,'own',true);
  }
  for(const s of cols.querySelectorAll('.mv-ref[data-ref-to]')){
    const t=cols.querySelector('.mv-var[data-uid="'+s.dataset.refTo+'"] .mv-head');
    if(t)draw(s,t,s.dataset.mut?'mut':'shared',!!s.dataset.live);
  }
}

UI.gutter=(el,ta)=>{
  let loans=[],cur=0;
  const paint=()=>{
    el.textContent='';
    const lh=parseFloat(getComputedStyle(ta).lineHeight)||20,pad=parseFloat(getComputedStyle(ta).paddingTop)||0;
    const top=n=>pad+(n-1)*lh-ta.scrollTop;
    loans.forEach((l,i)=>{
      const bar=h('i','gt-bar '+(l.mut?'mut':'shared'));
      bar.style.top=top(l.from)+'px';bar.style.height=((l.to-l.from+1)*lh)+'px';bar.style.left=(2+i%3*4)+'px';
      bar.title=(l.mut?'&mut':'&')+' borrow of '+(l.place||'a value')+', lines '+l.from+' to '+l.to;
      el.append(bar);
    });
    if(cur){const m=h('b','gt-cur','▸');m.style.top=top(cur)+'px';m.style.height=lh+'px';m.style.lineHeight=lh+'px';el.append(m);}
  };
  ta.addEventListener('scroll',paint);
  addEventListener('resize',paint);
  return {set(l,line){loans=l||[];cur=line||0;el.hidden=!loans.length&&!cur;paint();},clear(){loans=[];cur=0;el.hidden=true;el.textContent='';}};
};

UI.memview=({root,gutter})=>{
  let snaps=[],src=[],at=0,redraw=null,loansNow=[];
  const clear=()=>{root.hidden=true;root.textContent='';snaps=[];redraw=null;gutter.clear();};
  addEventListener('resize',()=>{if(redraw)redraw();});

  function stepLabel(i){return i===snaps.length-1&&snaps[i].end?'The program has finished':'Before line '+snaps[i].line+' runs';}

  function timeline(){
    root.textContent='';
    const ctl=h('div','mv-ctl');
    const prev=h('button','btn ghost mv-btn','‹ Back'),next=h('button','btn ghost mv-btn','Next ›'),range=h('input');
    prev.type=next.type='button';
    range.type='range';range.min=0;range.max=snaps.length-1;range.value=at;range.setAttribute('aria-label','Step through the program');
    const step=h('span','mv-step');step.setAttribute('aria-live','polite');
    ctl.append(prev,range,next,step);
    const line=h('p','mv-line');
    const cols=h('div','mv-cols'),stack=h('section','mv-stack'),heap=h('section','mv-heap'),svg=sv('svg',{class:'mv-arrows','aria-hidden':'true'});
    cols.append(stack,heap,svg);
    const ev=h('ul','mv-events');ev.setAttribute('aria-live','polite');
    root.append(ctl,line,cols,ev);
    root.hidden=false;

    function draw(){
      const s=snaps[at];
      range.value=at;prev.disabled=at===0;next.disabled=at===snaps.length-1;
      step.textContent='Step '+(at+1)+' of '+snaps.length+' · '+stepLabel(at);
      line.textContent='';
      if(!s.end&&src[s.line-1]!==undefined){line.append(h('span','mv-ln','line '+s.line),h('code',null,src[s.line-1].trim()));}
      stack.textContent='';heap.textContent='';
      stack.append(h('h4',null,'Stack'));
      if(!s.frames.length)stack.append(h('p','note','Nothing is left on the stack.'));
      for(const f of s.frames){
        const fr=h('div','mv-frame');
        fr.append(h('div','mv-fn','fn '+f.fn));
        if(!f.vars.length)fr.append(h('p','note','no variables yet'));
        for(const v of f.vars)fr.append(varRow(v,s));
        stack.append(fr);
      }
      heap.append(h('h4',null,'Heap'));
      if(!s.heap.length)heap.append(h('p','note','Nothing on the heap.'));
      for(const o of s.heap)heap.append(heapBox(o));
      ev.textContent='';
      const lines=s.events.map(sentence).filter(Boolean);
      for(const t of lines)ev.append(h('li',null,t));
      ev.hidden=!lines.length;
      gutter.set(loansNow,s.end?0:s.line);
      redraw=()=>arrows(cols,svg);
      requestAnimationFrame(redraw);
    }
    const go=i=>{at=Math.max(0,Math.min(snaps.length-1,i));draw();};
    prev.addEventListener('click',()=>go(at-1));
    next.addEventListener('click',()=>go(at+1));
    range.addEventListener('input',()=>go(+range.value));
    draw();
  }

  function staticView(v){
    root.textContent='';
    const intro=h('p','mv-line');
    intro.append(h('span','mv-ln','line '+v.error.line),document.createTextNode(' '+v.error.code+': the program cannot run, so this is the state where the compiler stops, not a timeline.'));
    const cols=h('div','mv-cols static'),stack=h('section','mv-stack');
    stack.append(h('h4',null,'fn '+v.fn+', at the error'));
    if(!v.vars.length)stack.append(h('p','note','no variables are alive here'));
    for(const x of v.vars){
      const row=h('div','mv-var');row.dataset.state=x.state;
      const head=h('div','mv-head');
      head.append(h('b','mv-name',x.name),h('span','mv-ty',x.ty));
      const b=badge(x);if(b)head.append(h('span','mv-badge',b));
      if(v.error.name===x.name)head.append(h('span','mv-badge err','← the error is here'));
      row.append(head);stack.append(row);
    }
    cols.append(stack);
    const loans=h('section','mv-heap');
    loans.append(h('h4',null,'Borrows that reach this line'));
    if(!v.loans.length)loans.append(h('p','note','none'));
    for(const l of v.loans)loans.append(h('p','mv-loan '+l.kind,(l.kind==='mut'?'&mut':'&')+' borrow of '+(l.place||'a value')+', lines '+l.from+' to '+l.to));
    cols.append(loans);
    root.append(intro,cols);
    root.hidden=false;redraw=null;
    gutter.set(v.loans.map(l=>({mut:l.kind==='mut',place:l.place,from:l.from,to:l.to})),v.error.line);
  }

  return {
    clear,
    show(ev){
      const c=ev&&ev.c;
      if(c&&(c.status==='ok'||c.status==='panic')&&c.snaps.length){
        snaps=c.snaps;src=String(ev.src||'').split('\n');at=0;
        loansNow=(c.loans||[]).filter(l=>l.span&&!l.implicit).map(l=>({mut:l.mut,place:l.local,from:l.span[0],to:l.span[1]}));
        timeline();
      }else if(c&&c.status==='error'&&c.view)staticView(c.view);
      else clear();
    }
  };
};
})();
