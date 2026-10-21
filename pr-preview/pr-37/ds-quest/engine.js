/* Data Structures Quest engine: runs the learner's JavaScript for real and hands back what it printed and what it left behind. DOM-free, so Node can test it. */
(()=>{
'use strict';
const D=globalThis.DSQ=globalThis.DSQ||{};
const MAX_STEPS=200000;

/* ---------- loop guard: an endless loop stops with an error instead of freezing the tab ---------- */
const isId=c=>/[\w$]/.test(c||'');
function skipStr(s,i){const q=s[i];i++;while(i<s.length&&s[i]!==q){if(s[i]==='\\')i++;i++}return i+1}
function guard(src){
  let out='',i=0;const n=src.length;
  const ws=j=>{while(j<n&&/\s/.test(src[j]))j++;return j};
  while(i<n){
    const c=src[i];
    if(c==='/'&&src[i+1]==='/'){const e=src.indexOf('\n',i);const j=e<0?n:e;out+=src.slice(i,j);i=j;continue}
    if(c==='/'&&src[i+1]==='*'){const e=src.indexOf('*/',i+2);const j=e<0?n:e+2;out+=src.slice(i,j);i=j;continue}
    if(c==='"'||c==="'"||c==='`'){const j=skipStr(src,i);out+=src.slice(i,j);i=j;continue}
    if(/[A-Za-z_$]/.test(c)&&!isId(src[i-1])&&src[i-1]!=='.'){
      let j=i;while(j<n&&isId(src[j]))j++;const w=src.slice(i,j);
      if(w==='for'||w==='while'){
        let k=ws(j);
        if(src[k]==='('){let d=0;while(k<n){const ch=src[k];if(ch==='"'||ch==="'"||ch==='`'){k=skipStr(src,k);continue}if(ch==='(')d++;else if(ch===')'){d--;if(d===0){k++;break}}k++}
          const m=ws(k);
          if(src[m]==='{'){out+=src.slice(i,m+1)+'__g();';i=m+1;continue}}
      }else if(w==='do'){const m=ws(j);if(src[m]==='{'){out+=src.slice(i,m+1)+'__g();';i=m+1;continue}}
      out+=w;i=j;continue}
    out+=c;i++}
  return out}

/* ---------- showing values the way a console would ---------- */
function show(v,depth=0,seen=new Set()){
  if(v===null)return 'null';if(v===undefined)return 'undefined';
  const t=typeof v;
  if(t==='string')return depth?JSON.stringify(v):v;
  if(t==='number'||t==='boolean'||t==='bigint'||t==='symbol')return String(v);
  if(t==='function')return /^class\b/.test(Function.prototype.toString.call(v))?`[class ${v.name||'anonymous'}]`:`[Function: ${v.name||'anonymous'}]`;
  if(seen.has(v))return '[Circular]';
  if(depth>4)return '…';
  seen.add(v);let r;
  if(Array.isArray(v)){const it=v.slice(0,50).map(x=>show(x,depth+1,seen));if(v.length>50)it.push(`… ${v.length-50} more`);r=`[${it.join(', ')}]`}
  else if(v instanceof Map){r=`Map(${v.size}) {${[...v].slice(0,30).map(([k,x])=>show(k,depth+1,seen)+' => '+show(x,depth+1,seen)).join(', ')}}`}
  else if(v instanceof Set){r=`Set(${v.size}) {${[...v].slice(0,30).map(x=>show(x,depth+1,seen)).join(', ')}}`}
  else{const name=v.constructor&&v.constructor!==Object?v.constructor.name+' ':'';const ks=Object.keys(v);r=name+(ks.length?`{${ks.map(k=>k+': '+show(v[k],depth+1,seen)).join(', ')}}`:'{}')}
  seen.delete(v);return r}

/* ---------- running ---------- */
const topNames=src=>{const set=new Set(),re=/^(?:async\s+)?(?:const|let|var|class|function\*?)\s+([A-Za-z_$][\w$]*)/gm;let m;while((m=re.exec(src)))set.add(m[1]);return [...set]};
function errLine(e,nLines){const fr=String(e&&e.stack||'').split('\n').find(l=>/^\s*at /.test(l));const all=fr?[...fr.matchAll(/(?:<anonymous>|Function):(\d+):\d+/g)]:[];if(!all.length)return null;const l=+all[all.length-1][1]-3;return l>=1&&l<=nLines?l:null}
function run(src){
  const lines=[];let steps=0;
  const print=(...a)=>{lines.push(a.map(x=>show(x)).join(' '))};
  const __g=()=>{if(++steps>MAX_STEPS)throw new Error('LOOP_LIMIT')};
  const res={src,lines,vars:{},names:[],error:null,ok:false,reset:()=>{steps=0}};
  const nLines=src.split('\n').length;
  try{
    const names=topNames(src);res.names=names;
    const body='"use strict";\n'+guard(src)+'\n;return {'+names.map(n=>`${JSON.stringify(n)}:typeof ${n}==='undefined'?undefined:${n}`).join(',')+'}';
    const fn=new Function('print','console','__g',body);
    res.vars=fn(print,{log:print,info:print,warn:print,error:print},__g);res.ok=true}
  catch(e){const loop=e&&e.message==='LOOP_LIMIT';
    res.error={type:loop?'EndlessLoop':(e&&e.name)||'Error',msg:loop?'the code ran for too many steps':String(e&&e.message||e),line:errLine(e,nLines)}}
  res.out=lines.join('\n');return res}

/* ---------- helpers every mission check receives ---------- */
function eq(a,b){
  if(a===b)return true;if(Number.isNaN(a)&&Number.isNaN(b))return true;
  if(typeof a!=='object'||typeof b!=='object'||!a||!b)return false;
  if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((x,i)=>eq(x,b[i]));
  if(a instanceof Map||b instanceof Map)return a instanceof Map&&b instanceof Map&&a.size===b.size&&[...a].every(([k,v])=>b.has(k)&&eq(v,b.get(k)));
  if(a instanceof Set||b instanceof Set)return a instanceof Set&&b instanceof Set&&a.size===b.size&&[...a].every(x=>b.has(x));
  const ka=Object.keys(a),kb=Object.keys(b);return ka.length===kb.length&&ka.every(k=>eq(a[k],b[k]))}
const list=(arr)=>arr.reduceRight((next,value)=>({value,next}),null);
const toArr=(head)=>{const o=[];let n=head,k=0;while(n&&k++<1000){o.push(n.value);n=n.next}return o};
const node=(value,left=null,right=null)=>({value,left,right});
const inorder=(n,o=[])=>{if(n){inorder(n.left,o);o.push(n.value);inorder(n.right,o)}return o};
function makeCtx(src,res){
  res.reset();
  const lines=res.lines;
  return {code:src,out:res.out,lines,vars:res.vars,error:res.error,
    printed:s=>lines.includes(String(s)),printedI:s=>lines.some(l=>l.toLowerCase()===String(s).toLowerCase()),
    has:re=>re.test(src),eq,show:x=>show(x,1),list,toArr,node,inorder,
    fn:(name)=>typeof res.vars[name]==='function'?res.vars[name]:null}}
function tipFor(e){return e&&e.message==='LOOP_LIMIT'?'Your code ran for too many steps. Look for a loop that never ends, or one that does far more work than it needs to.':'Your code crashed while the mission tested it ('+(e&&e.message||e)+'). Check the names in the goal and try a tiny example yourself.'}

D.guard=guard;D.show=show;D.run=run;D.makeCtx=makeCtx;D.eq=eq;D.tipFor=tipFor;
})();
