/* Network Quest packet inspector: every packet of the current mission session, grouped by the command that sent it,
   newest command first. Selecting a packet shows its layers (field by field) and its bytes as a hex dump.
   Accessibility pattern: a WAI-ARIA tree (role="tree" / "treeitem" / "group"), not a listbox, because the rows nest
   under expandable command headers. The tree is one tab stop with a roving tabindex; Up/Down move, Home/End jump,
   Enter/Space toggle a header (and select a packet), Right/Left open and close. Selection follows focus and is shown
   with aria-selected on the packet row. Engine text and learner-typed command lines are escaped before they land. */
(()=>{
'use strict';
const UI=window.NQUI=window.NQUI||{};
const esc=UI.esc;
// the engine's short direction codes (tx, rx, ...) appear too, small, because mission text refers to them
UI.DIR={tx:'sent',rx:'received',fwd:'forwarded',drop:'dropped',nat:'translated'};
// what each header field means, in a few plain words, shown next to its value
const NOTE={
  Ethernet:{src:'sender’s MAC',dst:'receiver’s MAC',type:'what is inside'},
  ARP:{op:'question or answer',sha:'sender’s MAC',spa:'sender’s IP address',tha:'target’s MAC (unknown in a request)',tpa:'target’s IP address'},
  IPv4:{src:'sender’s IP address',dst:'receiver’s IP address',ttl:'time to live: routers left before it is dropped',proto:'what is inside'},
  ICMP:{type:'kind of message',id:'which ping it belongs to',seq:'request number'}
};
const layersOf=p=>{try{return NQ.pkt.layerNames(p).join(' › ');}catch(e){return '';}};
const hexDump=p=>{
  let h;try{h=NQ.pkt.hex(p);}catch(e){return null;}
  const b=h?h.split(' '):[],out=[];
  for(let i=0;i<b.length;i+=8)out.push(i.toString(16).padStart(4,'0')+'  '+b.slice(i,i+8).join(' '));
  return out.join('\n');
};
/* inspector({list, detail, onSelect}): update(groups) shows [{line, entries}] (oldest first, as run); reset() empties */
UI.inspector=({list,detail,onSelect})=>{
  let groups=[],sel=null; // sel: {g, i}
  const items=()=>[...list.querySelectorAll('[role="treeitem"]')].filter(li=>!li.closest('[role="group"][hidden]'));
  const entryOf=s=>s&&groups[s.g]?groups[s.g].entries[s.i]:null;
  const rove=el=>{list.querySelectorAll('[role="treeitem"]').forEach(li=>li.tabIndex=-1);if(el)el.tabIndex=0;};
  const renderDetail=()=>{
    const e=entryOf(sel);
    if(!e){detail.innerHTML='';detail.hidden=true;return;}
    detail.hidden=false;
    const hex=hexDump(e.packet);
    detail.innerHTML=`<h4 class="dsum">${esc(UI.DIR[e.dir]||e.dir)} on <b>${esc(e.dev)}</b> ${esc(e.iface)} <span class="t">· step ${esc(e.t)}</span></h4><p class="dverdict">${esc(e.verdict)}</p>`+
      `<div class="layers" id="layers">${e.packet.layers.map((l,n)=>`<section class="layer"><h5><span class="ln">${n+1}</span>${esc(l.name)}${n?'':' <small>(outermost)</small>'}</h5><table><tbody>${Object.entries(l.fields).map(([k,v])=>`<tr><th scope="row"><code>${esc(k)}</code></th><td><code>${esc(v)}</code></td><td class="fnote">${esc((NOTE[l.name]||{})[k]||'')}</td></tr>`).join('')}</tbody></table></section>`).join('')}</div>`+
      `<div class="hexwrap"><h5>Bytes on the wire</h5><pre class="hex" id="hex">${hex===null?'(these bytes cannot be shown)':esc(hex)}</pre><p class="note">Each pair is one byte in hexadecimal, eight to a line. The number on the left counts bytes from the start, also in hexadecimal.</p></div>`;
  };
  const select=(s,focus)=>{
    sel=s;
    list.querySelectorAll('.pkt').forEach(li=>li.setAttribute('aria-selected',String(!!s&&+li.dataset.g===s.g&&+li.dataset.i===s.i)));
    const li=s&&list.querySelector(`.pkt[data-g="${s.g}"][data-i="${s.i}"]`);
    if(li){rove(li);if(focus)li.focus();}
    renderDetail();onSelect(entryOf(s));
  };
  const toggle=(li,open)=>{
    const sub=li.querySelector('[role="group"]'),o=open===undefined?sub.hidden:open;
    sub.hidden=!o;li.setAttribute('aria-expanded',String(o));
  };
  const render=()=>{
    if(!groups.length){list.innerHTML='<p class="empty">No packets yet. Run a command in the terminal, like the one in your goal, and every packet it puts on the wire lands here for you to open.</p>';renderDetail();return;}
    const newest=groups.length-1;
    list.innerHTML=`<ul role="tree" aria-label="Packets, newest command first">${groups.map((g,gi)=>({g,gi})).reverse().map(({g,gi})=>
      `<li role="treeitem" class="grp" data-g="${gi}" aria-level="1" aria-expanded="${gi===newest}" tabindex="-1"><div class="ghead"><span class="chev" aria-hidden="true"></span><code>$ ${esc(g.line)}</code><span class="cnt">${g.entries.length} packet${g.entries.length===1?'':'s'}</span></div>`+
      `<ul role="group"${gi===newest?'':' hidden'}>${g.entries.map((e,i)=>`<li role="treeitem" class="pkt d-${esc(e.dir)}" data-g="${gi}" data-i="${i}" aria-level="2" aria-selected="false" tabindex="-1"><span class="t">${esc(e.t)}</span><span class="dev">${esc(e.dev)}</span><span class="dir">${esc(UI.DIR[e.dir]||e.dir)}<small> ${esc(e.dir)}</small></span><span class="vd">${esc(e.verdict)}</span><span class="ly">${esc(layersOf(e.packet))}</span></li>`).join('')}</ul></li>`).join('')}</ul>`;
  };
  list.addEventListener('click',e=>{
    const head=e.target.closest('.ghead'),pkt=e.target.closest('.pkt');
    if(pkt){select({g:+pkt.dataset.g,i:+pkt.dataset.i},true);return;}
    if(head){const li=head.parentElement;toggle(li);rove(li);li.focus();}
  });
  list.addEventListener('keydown',e=>{
    const it=items();if(!it.length)return;
    const cur=document.activeElement&&document.activeElement.closest('[role="treeitem"]');
    let k=it.indexOf(cur);if(k<0)k=0;
    const go=n=>{const li=it[Math.max(0,Math.min(it.length-1,n))];if(li.classList.contains('pkt'))select({g:+li.dataset.g,i:+li.dataset.i},true);else{rove(li);li.focus();}};
    const isGrp=cur&&cur.classList.contains('grp');
    if(e.key==='ArrowDown')go(k+1);
    else if(e.key==='ArrowUp')go(k-1);
    else if(e.key==='Home')go(0);
    else if(e.key==='End')go(it.length-1);
    else if((e.key==='Enter'||e.key===' ')&&isGrp)toggle(cur);
    else if((e.key==='Enter'||e.key===' ')&&cur)select({g:+cur.dataset.g,i:+cur.dataset.i},true);
    else if(e.key==='ArrowRight'&&isGrp){if(cur.getAttribute('aria-expanded')==='true')go(k+1);else toggle(cur,true);}
    else if(e.key==='ArrowLeft'&&cur){if(isGrp)toggle(cur,false);else{const g=cur.closest('.grp');rove(g);g.focus();}}
    else return;
    e.preventDefault();
  });
  return {
    reset:()=>{groups=[];sel=null;render();onSelect(null);},
    update:g=>{
      groups=g;render();
      const newest=groups.length-1;
      if(newest>=0&&groups[newest].entries.length)select({g:newest,i:0},false);
      else if(sel&&entryOf(sel))select(sel,false);
      else{sel=null;const first=list.querySelector('[role="treeitem"]');rove(first);renderDetail();onSelect(null);}
    }
  };
};
})();
