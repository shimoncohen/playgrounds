/* app.js owns localStorage. Same contract as net-quest/app.js:14-31, plus `codes` (learner code per mission, cut to CAP
   characters). DOM-free. */
(()=>{
'use strict';
const RQ=globalThis.RQ=globalThis.RQ||{};
const XP=RQ.XP=10; // per mission
const CAP=4000;
const TABS=['quest','fire','guide'];
const isObj=o=>!!o&&typeof o==='object'&&!Array.isArray(o);
const isKey=(k,CH)=>{const m=/^(\d+)\.(\d+)$/.exec(k);return !!m&&+m[1]<CH.length&&+m[2]<CH[+m[1]].missions.length;};
const nonNeg=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
const xpFor=done=>XP*Object.keys(done).length;
const fresh=()=>({ch:0,mi:0,done:{},xp:0,best:0,tab:'quest',codes:{}});
/* every field falls back on its own, so one bad value never costs the rest of a save; a saved xp is kept as saved
   (net-quest/app.js:24) and recomputed only when it is not a finite number >= 0 */
function load(raw,CH){
  const S=fresh();let o=null;
  try{o=JSON.parse(raw);}catch(e){return S;}
  if(!isObj(o))return S;
  if(isObj(o.done))for(const k of Object.keys(o.done))if(o.done[k]===true&&isKey(k,CH))S.done[k]=true;
  S.xp=nonNeg(o.xp)?o.xp:xpFor(S.done);
  S.best=nonNeg(o.best)?o.best:0;
  if(Number.isInteger(o.ch)&&o.ch>=0&&o.ch<CH.length){S.ch=o.ch;if(Number.isInteger(o.mi)&&o.mi>=0&&o.mi<=CH[o.ch].missions.length)S.mi=o.mi;}
  if(TABS.includes(o.tab))S.tab=o.tab;
  if(isObj(o.codes))for(const k of Object.keys(o.codes))if(typeof o.codes[k]==='string'&&isKey(k,CH))S.codes[k]=o.codes[k].slice(0,CAP);
  return S;
}
const serialize=S=>JSON.stringify({ch:S.ch,mi:S.mi,done:S.done,xp:S.xp,best:S.best,tab:S.tab,codes:S.codes});
RQ.state={fresh,load,serialize,xpFor,CAP,TABS};
})();
