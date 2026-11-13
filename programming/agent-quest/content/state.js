/* Agent Quest saved state: pure functions, so Node can test them. The saved keys are exactly ch, mi, done, xp, badges,
   best and tab. xp is saved for shared/progress.js and the landing card, but it is always recomputed from done and badges
   on load. No learner text is part of the state. */
(()=>{
'use strict';
const AQ=globalThis.AQ=globalThis.AQ||{};
const TABS=['quest','fire','guide'];
const isObj=o=>!!o&&typeof o==='object'&&!Array.isArray(o);
const isKey=(k,ch)=>{const m=/^(\d+)\.(\d+)$/.exec(k);return !!m&&+m[1]<ch.length&&+m[2]<ch[+m[1]].missions.length;};
const isBadge=(k,ch)=>/^\d+$/.test(k)&&+k<ch.length;
const byKey=(a,b)=>{const [a1,a2]=a.split('.').map(Number),[b1,b2]=b.split('.').map(Number);return a1-b1||a2-b2;};

const fresh=()=>({ch:0,mi:0,done:{},xp:0,badges:{},best:0,tab:'quest'});

function xpFor(done,badges,chapters=AQ.CH){
  let xp=0;
  for(const k of Object.keys(done||{}))if(done[k]===true&&isKey(k,chapters))xp+=AQ.tierXp(chapters[+k.split('.')[0]].tier);
  for(const k of Object.keys(badges||{}))if(badges[k]===true&&isBadge(k,chapters))xp+=AQ.tiers.chapterBadgeXp;
  return xp;
}

/* every field falls back on its own, so one bad value never costs the rest of a save */
function load(raw,chapters=AQ.CH){
  const S=fresh();let o=null;
  try{o=JSON.parse(raw);}catch(e){return S;}
  if(!isObj(o))return S;
  if(isObj(o.done))for(const k of Object.keys(o.done))if(o.done[k]===true&&isKey(k,chapters))S.done[k]=true;
  if(isObj(o.badges))for(const k of Object.keys(o.badges))if(o.badges[k]===true&&isBadge(k,chapters))S.badges[k]=true;
  S.xp=xpFor(S.done,S.badges,chapters);
  if(typeof o.best==='number'&&Number.isFinite(o.best)&&o.best>=0)S.best=Math.floor(o.best);
  if(Number.isInteger(o.ch)&&o.ch>=0&&o.ch<chapters.length){S.ch=o.ch;if(Number.isInteger(o.mi)&&o.mi>=0&&o.mi<=chapters[o.ch].missions.length)S.mi=o.mi;}
  if(TABS.includes(o.tab))S.tab=o.tab;
  return S;
}

/* the whitelist: anything else on S (an answers map, say) is never written */
function serialize(S){
  const done={};
  for(const k of Object.keys(S.done||{}).filter(k=>S.done[k]===true).sort(byKey))done[k]=true;
  const badges={};
  for(const k of Object.keys(S.badges||{}).filter(k=>S.badges[k]===true).sort((a,b)=>a-b))badges[k]=true;
  return JSON.stringify({ch:S.ch,mi:S.mi,done,xp:Number.isFinite(S.xp)?S.xp:0,badges,best:S.best,tab:S.tab});
}

const addMiss=(list,q)=>list.includes(q)?list:[...list,q];

AQ.state={TABS,fresh,load,serialize,xpFor,addMiss};
})();
