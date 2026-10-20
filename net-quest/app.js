(()=>{
'use strict';
const KEY=window.PROGRESS.key;
const $=s=>document.querySelector(s);
function fresh(){return {ch:0,mi:0,done:{},xp:0,tab:'quest'}}
let S=fresh();
try{const raw=localStorage.getItem(KEY);if(raw){const o=JSON.parse(raw);if(o&&typeof o==='object')S=Object.assign(fresh(),o)}}catch(e){}
function save(){try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}}

/* ---------- mission card (placeholder until the course lands) ---------- */
$('#mission').innerHTML='<div class="eyebrow">Coming together</div><h2>Network Quest</h2><p class="intro">Missions about addresses, ARP, routing, NAT and packets are being built. Check back soon.</p>';
$('#xpText').textContent=S.xp+' XP';

/* ---------- tabs ---------- */
const TABS=['quest','fire','guide'];
function showTab(t){if(!TABS.includes(t))t='quest';S.tab=t;save();
  document.querySelectorAll('.tabs button').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===t)));
  TABS.forEach(x=>{$('#tab-'+x).hidden=x!==t})}
$('.tabs').addEventListener('click',e=>{const b=e.target.closest('button');if(b)showTab(b.dataset.tab)});
$('.tabs').addEventListener('keydown',e=>{if(e.key!=='ArrowRight'&&e.key!=='ArrowLeft')return;const bs=[...document.querySelectorAll('.tabs button')];let i=bs.findIndex(b=>b.getAttribute('aria-selected')==='true');i=(i+(e.key==='ArrowRight'?1:bs.length-1))%bs.length;showTab(bs[i].dataset.tab);bs[i].focus()});
$('#cmdline').addEventListener('submit',e=>e.preventDefault());
showTab(S.tab);
})();
