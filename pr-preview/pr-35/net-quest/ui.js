/* Network Quest UI pieces: the terminal and the network map. DOM code only; the engine stays in engine/. Everything a
   learner can type reaches the page as textContent or through esc(), never as raw markup. Exposes window.NQUI. */
(()=>{
'use strict';
const UI=window.NQUI=window.NQUI||{};
const esc=UI.esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ---------- terminal ---------- */
/* terminal({screen, input, form, prompt, onRun}): Enter (form submit, so phones work) hands the line to onRun.
   Up/Down walk this session's history, Ctrl+L clears; Tab moves focus on as usual (there is no completion).
   The screen keeps at most MAX lines. */
const MAX=1500;
UI.terminal=({screen,input,form,prompt,onRun})=>{
  let hist=[],hi=0,draft='',promptText='$ ';
  const add=(cls,...parts)=>{
    const d=document.createElement('div');d.className='line'+(cls?' '+cls:'');
    for(const [c,t] of parts){const s=document.createElement('span');if(c)s.className=c;s.textContent=t;d.appendChild(s);}
    screen.appendChild(d);
    while(screen.childElementCount>MAX)screen.firstElementChild.remove();
  };
  const T={
    print:(text,cls)=>add(cls,['',text]),
    echo:line=>add('in',['p',promptText],['',line]),
    clear:()=>{screen.textContent='';},
    scroll:()=>{screen.scrollTop=screen.scrollHeight;},
    setPrompt:t=>{promptText=t+' ';prompt.textContent=t;},
    reset:()=>{hist=[];hi=0;draft='';T.clear();},
    fill:v=>{input.value=v;input.focus();try{input.setSelectionRange(v.length,v.length);}catch(e){}}
  };
  form.addEventListener('submit',e=>{
    e.preventDefault();const line=input.value;input.value='';
    if(line.trim()){hist.push(line);}
    hi=hist.length;draft='';onRun(line);T.scroll();
  });
  input.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&(e.key==='l'||e.key==='L')){e.preventDefault();T.clear();return;}
    if(e.key==='ArrowUp'||e.key==='ArrowDown'){
      if(!hist.length)return;e.preventDefault();
      if(hi===hist.length)draft=input.value;
      hi=Math.max(0,Math.min(hist.length,hi+(e.key==='ArrowUp'?-1:1)));
      T.fill(hi===hist.length?draft:hist[hi]);
    }
  });
  return T;
};

/* ---------- network map ---------- */
/* Deterministic layout: devices in columns by hop distance (BFS over the links) from the terminal's device, rows in
   each column ordered by where their neighbours sit in the column before. Shapes tell kinds apart (host: rounded box,
   switch: hexagon, router: oval) and every box carries its name and address as text, so nothing is colour-only. */
const BW=116,BH=46,COLW=184,ROWH=76,PAD=14,TOP=22;
const firstIp=d=>{for(const i of Object.values(d.ifaces))if(i.ip)return i.ip.split('/')[0];return null;};
const linksOf=net=>{
  const out=[],seen=new Set();
  for(const d of Object.values(net.devices))for(const [n,i] of Object.entries(d.ifaces)){
    if(!i.peer)continue;const a=d.id+'.'+n,b=i.peer;const k=a<b?a+'|'+b:b+'|'+a;
    if(seen.has(k))continue;seen.add(k);
    const [bd,bi]=b.split('.'),peer=net.devices[bd];
    out.push({a:d.id,ai:n,b:bd,bi,up:i.up!==false&&!!(peer&&peer.ifaces[bi]&&peer.ifaces[bi].up!==false)});
  }
  return out;
};
UI.layout=net=>{
  const ids=Object.keys(net.devices),links=linksOf(net).filter(l=>net.devices[l.b]);
  const nb={};ids.forEach(id=>nb[id]=[]);
  for(const l of links){nb[l.a].push(l.b);nb[l.b].push(l.a);}
  const dist={},q=[net.me in net.devices?net.me:ids[0]];dist[q[0]]=0;
  while(q.length){const x=q.shift();for(const y of nb[x])if(!(y in dist)){dist[y]=dist[x]+1;q.push(y);}}
  let maxD=Math.max(0,...Object.values(dist));
  ids.forEach(id=>{if(!(id in dist))dist[id]=maxD+1;});
  maxD=Math.max(0,...Object.values(dist));
  const cols=[];for(let c=0;c<=maxD;c++)cols.push([]);
  ids.forEach(id=>cols[dist[id]].push(id));
  const row={};
  cols.forEach((col,c)=>{
    const key=id=>{const ps=nb[id].filter(p=>dist[p]===c-1).map(p=>row[p]);return ps.length?ps.reduce((a,b)=>a+b,0)/ps.length:0;};
    col.map((id,i)=>({id,i,k:c?key(id):i})).sort((x,y)=>x.k-y.k||x.i-y.i).forEach((o,r)=>{row[o.id]=r;});
    col.sort((a,b)=>row[a]-row[b]);
  });
  const rows=Math.max(...cols.map(c=>c.length));
  const W=PAD*2+maxD*COLW+BW,H=TOP+PAD+(rows-1)*ROWH+BH;
  const pos={};
  cols.forEach((col,c)=>col.forEach((id,r)=>{pos[id]={x:PAD+BW/2+c*COLW,y:TOP+(rows-col.length)*ROWH/2+r*ROWH+BH/2};}));
  return {W,H,pos,links};
};
const shape=(kind,x,y,cls)=>{
  const w=BW/2,h=BH/2;
  if(kind==='switch')return `<polygon class="${cls}" points="${x-w+12},${y-h} ${x+w-12},${y-h} ${x+w},${y} ${x+w-12},${y+h} ${x-w+12},${y+h} ${x-w},${y}"/>`;
  if(kind==='router')return `<ellipse class="${cls}" cx="${x}" cy="${y}" rx="${w}" ry="${h+3}"/>`;
  return `<rect class="${cls}" x="${x-w}" y="${y-h}" width="${BW}" height="${BH}" rx="10"/>`;
};
// where an interface label goes: just outside the box around (x,y), on the way towards (tx,ty), anchored away from it
const edge=(x,y,tx,ty)=>{
  const dx=tx-x,dy=ty-y,ax=Math.abs(dx)||1e-9,ay=Math.abs(dy)||1e-9,t=Math.min((BW/2+4)/ax,(BH/2+12)/ay);
  return {x:x+dx*t,y:y+dy*t-4,a:ax*BH>ay*BW?(dx>0?'start':'end'):'middle'};
};
const KIND={host:'computer',switch:'switch',router:'router'};
/* diagram(el, net, sel): sel = {dev, iface} of the selected packet entry, or null. Draws an SVG and a text list. */
UI.diagram=(el,net,sel)=>{
  const {W,H,pos,links}=UI.layout(net),devs=Object.values(net.devices);
  const isSel=id=>!!sel&&sel.dev===id;
  const onLink=l=>!!sel&&((l.a===sel.dev&&l.ai===sel.iface)||(l.b===sel.dev&&l.bi===sel.iface));
  let g='';
  for(const l of links){
    const A=pos[l.a],B=pos[l.b];
    g+=`<line class="dg-link${l.up?'':' down'}${onLink(l)?' hot':''}" x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}"/>`;
  }
  for(const l of links){
    const A=pos[l.a],B=pos[l.b],pa=edge(A.x,A.y,B.x,B.y),pb=edge(B.x,B.y,A.x,A.y);
    g+=`<text class="dg-if" x="${pa.x}" y="${pa.y}" text-anchor="${pa.a}">${esc(l.ai)}</text><text class="dg-if" x="${pb.x}" y="${pb.y}" text-anchor="${pb.a}">${esc(l.bi)}</text>`;
  }
  for(const d of devs){
    const p=pos[d.id],ip=d.kind==='switch'?'switch':(firstIp(d)||'no address'),s=isSel(d.id);
    g+=`<g class="dg-dev k-${esc(d.kind)}${s?' sel':''}"><title>${esc(d.id)}: ${esc(KIND[d.kind]||d.kind)}</title>${shape(d.kind,p.x,p.y,'dg-box'+(s?' dg-sel':''))}`+
      `<text class="dg-id" x="${p.x}" y="${p.y-3}" text-anchor="middle">${esc(d.id)}${d.id===net.me?' (you)':''}</text><text class="dg-ip" x="${p.x}" y="${p.y+13}" text-anchor="middle">${esc(ip)}</text>`+
      (s?`<text class="dg-mark" x="${p.x}" y="${p.y-BH/2-(d.kind==='router'?8:5)}" text-anchor="middle">▼ this packet</text>`:'')+'</g>';
  }
  const label='Network map: '+devs.map(d=>d.id+' ('+(KIND[d.kind]||d.kind)+(d.kind==='switch'?'':', '+(firstIp(d)||'no address'))+')').join(', ')+'. The links are listed below.';
  const items=devs.map(d=>`<li><b>${esc(d.id)}</b>${d.id===net.me?' (you)':''} · ${esc(KIND[d.kind]||d.kind)}${d.kind==='switch'?'':' · '+esc(firstIp(d)||'no address')}${isSel(d.id)?' <span class="dg-here">◀ this packet</span>':''}</li>`).join('');
  const wires=links.map(l=>`<li>${esc(l.a)} ${esc(l.ai)} ↔ ${esc(l.b)} ${esc(l.bi)}${l.up?'':' (down)'}</li>`).join('');
  el.innerHTML=`<div class="dg-scroll"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(label)}" style="--w:${W}px">${g}</svg></div>`+
    `<div class="dg-text"><h4>Devices</h4><ul class="dg-list">${items}</ul><h4>Cables</h4><ul class="dg-list">${wires}</ul></div>`;
};
})();
