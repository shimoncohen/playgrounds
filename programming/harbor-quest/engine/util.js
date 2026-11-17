(function (HQ) { 'use strict';
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let skew=0;const now=()=>Date.now()+skew;
const AL='bcdfghjklmnpqrstvwxz2456789';
const rnd=n=>{let s='';while(s.length<n)s+=AL[Math.random()*AL.length|0];return s};
const hex=n=>{let s='';while(s.length<n)s+='0123456789abcdef'[Math.random()*16|0];return s};
function hsh(str,n,al=AL){let h=2166136261>>>0;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)>>>0}let s='';while(s.length<n){h^=h>>>15;h=Math.imul(h,0x2c1b3c6d)>>>0;h^=h>>>12;h=Math.imul(h,0x297a2d39)>>>0;h^=h>>>15;h=(h+0x9e3779b9)>>>0;s+=al[h%al.length]}return s}
const hhex=(s,n)=>hsh(s,n,'0123456789abcdef');
const pad=(s,n)=>String(s)+' '.repeat(Math.max(0,n-String(s).length));
function table(rows,gap=3){const w=[];rows.forEach(r=>r.forEach((c,i)=>w[i]=Math.max(w[i]||0,String(c).length)));return rows.map(r=>r.map((c,i)=>i<r.length-1?pad(c,w[i]+gap):String(c)).join('').replace(/\s+$/,''))}
function secs(t){return Math.max(0,Math.round((now()-t)/1000))}
function age(t){const s=secs(t);if(s<120)return s+'s';const m=Math.floor(s/60);if(m<60)return m+'m';const h=Math.floor(m/60);if(h<48)return h+'h';return Math.floor(h/24)+'d'}
function ago(t){const s=Math.max(1,secs(t));if(s<60)return s+(s===1?' second':' seconds');const m=Math.floor(s/60);if(m<60)return (m===1?'About a minute':m+' minutes');const h=Math.floor(m/60);if(h<48)return (h===1?'About an hour':h+' hours');return Math.floor(h/24)+' days'}
const p2=n=>String(n).padStart(2,'0');
function stamp(){const d=new Date(now());return `${d.getFullYear()}/${p2(d.getMonth()+1)}/${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`}
function clf(){const d=new Date(now());const M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];return `${p2(d.getUTCDate())}/${M[d.getUTCMonth()]}/${d.getUTCFullYear()}:${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())} +0000`}
function sizeNum(s){const m=String(s).match(/([\d.]+)\s*(B|kB|MB|GB)/);if(!m)return 0;return +m[1]*({B:1,kB:1e3,MB:1e6,GB:1e9}[m[2]])}
function fmtSize(n){if(n<1e3)return Math.round(n)+'B';if(n<1e6)return (n/1e3).toFixed(1)+'kB';if(n<1e9)return (n/1e6).toFixed(n<1e7?2:1).replace(/\.0+$/,'')+'MB';return (n/1e9).toFixed(2)+'GB'}
Object.assign(HQ,{esc,now,rnd,hex,hsh,hhex,pad,table,age,ago,stamp,clf,sizeNum,fmtSize,skewBy:ms=>{skew+=ms}});
})(window.HQ = window.HQ || {});
