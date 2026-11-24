/* Data Structures Quest: scene models. One model per structure shape (row, pile, line, chain, buckets, tree), DOM-free so Node can test it.
   Every operation returns a step: what happened, the code, what to highlight, what changed and where the pointers are.
   A selector is {i}, {v}, {k}, {l} or {head:true}. A step's `say` and `reason` are HTML, so every value in them goes through esc(). */
(()=>{
'use strict';
const D=globalThis.DSQ=globalThis.DSQ||{};
const rnd=(a,b)=>a+Math.floor(Math.random()*(b-a+1));
const pick=a=>a[Math.floor(Math.random()*a.length)];
const idxs=n=>Array.from({length:n},(_,i)=>({i}));
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>typeof v==='string'?JSON.stringify(v):String(v);
const isNum=v=>typeof v==='number'&&Number.isFinite(v);
const isKey=v=>typeof v==='string'&&v.length>=1&&v.length<=12;
const isVal=v=>isNum(v)||isKey(v);
const isIdx=Number.isInteger;
const isSel=(x,k,ok)=>!!x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===1&&ok(x[k]);

/* A refusal is thrown before the state is touched and turned into an ok:false step by mk(). */
class Refuse{constructor(m){this.m=m}}
const no=m=>{throw new Refuse(m)};
const full=(n,what)=>no(`This page keeps the picture small (${n} ${what} at most). Remove something first.`);
const empty=what=>no(`The ${what} is empty, so there is nothing to take. Add something first.`);

const mk=(sc,name,label,fn)=>({name,label,run(s,arg){
 try{
  if(arg!=null&&(typeof arg!=='object'||Array.isArray(arg)))no('The options for an operation go in an object, like <code>{ value: 3 }</code>.');
  const r=fn(s,arg||{});
  const step={ok:true,say:r.say,code:r.code||'',hi:r.hi||[],changes:r.changes||[],ptrs:sc.pointers(s),result:r.result};
  if(r.walk)step.walk=r.walk;
  return step;
 }catch(e){
  if(!(e instanceof Refuse))throw e;
  return {ok:false,reason:e.m,say:e.m,code:'',hi:[],changes:[],ptrs:sc.pointers(s),result:undefined};
 }}});
const build=(sc,list,setList)=>{
 const to=l=>l.map(([n,lab,f])=>mk(sc,n,lab,f));
 sc.ops=to(list);
 if(setList)sc.setOps=to(setList);
 sc.op=(s,name)=>(sc.setOps&&s&&s.v instanceof Set?sc.setOps:sc.ops).find(o=>o.name===name);
 return sc;
};

const val=(a,k='value')=>{if(a[k]===undefined)return rnd(1,9);if(!isVal(a[k]))no(`<code>${k}</code> must be a number or a short text (1 to 12 characters).`);return a[k]};
const numArg=(a,k,what)=>{if(a[k]===undefined)return undefined;if(!isNum(a[k]))no(`${what} are numbers, so <code>${k}</code> must be a number.`);return a[k]};
const intArg=(a,k)=>{if(a[k]!==undefined&&!isIdx(a[k]))no(`<code>${k}</code> must be a whole number, like 0 or 2.`);return a[k]};
const keyArg=a=>{if(a.key!==undefined&&!isKey(a.key))no('<code>key</code> must be a short text (1 to 12 characters).');return a.key};
const mv=(a,b)=>({kind:'move',from:{i:a},to:{i:b}});
const moves=(count,start,delta)=>Array.from({length:count},(_,k)=>mv(start+k,start+k+delta));

const listShape=(shape,max,dflt)=>({shape,
 create(st=dflt){if(!Array.isArray(st)||st.length>max||!st.every(isVal))throw new Error(`${shape}: start must be an array of at most ${max} values`);return {v:[...st]}},
 clone:s=>({v:[...s.v]}),
 snapshot:s=>[...s.v],
 items:s=>idxs(s.v.length),
 pointers:()=>[],
 valid:s=>!s||!Array.isArray(s.v)?`${shape} state needs a list`:s.v.length>max?`${shape} holds more than ${max} values`:s.v.every(isVal)?null:`${shape} holds a bad value`});

const row=listShape('row',10,[4,8,2]);
build(row,[
 ['push','push',(s,a)=>{const n=val(a);if(s.v.length>=10)full(10,'boxes');s.v.push(n);const i=s.v.length-1;
   return {code:`row.push(${fmt(n)});`,say:`<b>push</b> drops ${esc(n)} into a new box at the end. No other box moves, so it is quick.`,hi:[{i}],changes:[{kind:'add',i}]}}],
 ['pop','pop',s=>{if(!s.v.length)empty('row');const i=s.v.length-1;const n=s.v.pop();
   return {code:'const last = row.pop();',say:`<b>pop</b> took the last box (${esc(n)}) off the end and handed it back as <code>last</code>. No other box moved.`,changes:[{kind:'remove',i}],result:n}}],
 ['unshift','unshift',(s,a)=>{const n=val(a);if(s.v.length>=10)full(10,'boxes');const old=s.v.length;s.v.unshift(n);
   return {code:`row.unshift(${fmt(n)});`,say:`<b>unshift</b> adds ${esc(n)} at the <b>front</b>. Every other item had to slide one box to the right to make room. On a row of a million items, that is a million moves.`,hi:idxs(s.v.length),changes:[{kind:'add',i:0},...moves(old,0,1)]}}],
 ['shift','shift',s=>{if(!s.v.length)empty('row');const old=s.v.length;const n=s.v.shift();
   return {code:'const first = row.shift();',say:`<b>shift</b> took ${esc(n)} from the front, so every remaining item slid one box to the left to close the gap.`,hi:idxs(s.v.length),changes:[{kind:'remove',i:0},...moves(old-1,1,-1)],result:n}}],
 ['read','read',(s,a)=>{let i=intArg(a,'i');const len=s.v.length;if(!len)empty('row');
   if(i===undefined)i=rnd(0,len-1);else if(i<0||i>=len)no(`There is no box ${i}: this row has boxes 0 to ${len-1}.`);
   return {code:`row[${i}]  // ${s.v[i]}`,say:`Box ${i} holds ${esc(s.v[i])}. The computer jumps straight to it, with no searching, however long the row is.`,hi:[{i}],result:s.v[i]}}],
 ['indexOf','indexOf',(s,a)=>{if(a.value!==undefined&&!isVal(a.value))no('<code>value</code> must be a number or a short text (1 to 12 characters).');if(!s.v.length)empty('row');
   const t=a.value!==undefined?a.value:Math.random()<.7?pick(s.v):10;const at=s.v.indexOf(t);const upto=at<0?s.v.length:at+1;
   return {code:`row.indexOf(${fmt(t)})  // ${at}`,say:at<0?`${esc(t)} is not in the row. To be sure, it had to look in <b>every</b> box and gave back -1.`:`Found ${esc(t)} in box ${at}. It had to look through ${upto} box${upto===1?'':'es'} to get there: searching an unsorted row means walking it.`,walk:idxs(upto).map(x=>[x]),hi:at<0?[]:[{i:at}],result:at}}],
 ['swap','swap',(s,a)=>{let i=intArg(a,'i'),j=intArg(a,'j');const len=s.v.length;if(len<2)no('Swapping needs two boxes, and this row has fewer. Add something first.');
   for(const x of [i,j])if(x!==undefined&&(x<0||x>=len))no(`There is no box ${x}: this row has boxes 0 to ${len-1}.`);
   const other=x=>{let r;do r=rnd(0,len-1);while(r===x);return r};
   if(i===undefined)i=other(j);if(j===undefined)j=other(i);
   if(i===j)no('A <code>swap</code> needs two different boxes, so pick two box numbers that are not the same.');
   const x=s.v[i],y=s.v[j];s.v[i]=y;s.v[j]=x;
   return {code:`[row[${i}], row[${j}]] = [row[${j}], row[${i}]];`,say:`<code>swap</code> trades boxes ${i} and ${j}: ${esc(x)} and ${esc(y)} change places. Both boxes are read first, then written back, so neither value is lost. Every other box stays put.`,hi:[{i},{i:j}],changes:[{kind:'swap',from:{i},to:{i:j}}]}}]
]);

const pile=listShape('pile',7,[3,7]);
pile.pointers=s=>s.v.length?[{name:'top',i:s.v.length-1}]:[];
build(pile,[
 ['push','push',(s,a)=>{const n=val(a);if(s.v.length>=7)full(7,'plates');s.v.push(n);const i=s.v.length-1;
   return {code:`stack.push(${fmt(n)});`,say:`<b>push</b> puts ${esc(n)} on <b>top</b>. Everything underneath stays exactly where it was.`,hi:[{i}],changes:[{kind:'add',i}]}}],
 ['pop','pop',s=>{if(!s.v.length)empty('stack');const i=s.v.length-1;const n=s.v.pop();
   return {code:'const top = stack.pop();',say:`<b>pop</b> removed the top item, ${esc(n)}, and handed it back. It was the most recent push, which is why this is called last in, first out.`,changes:[{kind:'remove',i}],result:n}}],
 ['peek','peek',s=>{if(!s.v.length)empty('stack');const i=s.v.length-1;
   return {code:`stack[stack.length - 1]  // ${s.v[i]}`,say:`<b>peek</b> looks at the top item (${esc(s.v[i])}) <b>without</b> removing it. The stack is unchanged.`,hi:[{i}],result:s.v[i]}}]
]);

const line=listShape('line',7,[5,2,9]);
line.pointers=s=>s.v.length?[{name:'front',i:0},{name:'back',i:s.v.length-1}]:[];
build(line,[
 ['enqueue','enqueue',(s,a)=>{const n=val(a);if(s.v.length>=7)full(7,'people');s.v.push(n);const i=s.v.length-1;
   return {code:`queue.push(${fmt(n)});  // enqueue`,say:`<b>enqueue</b>: ${esc(n)} joins at the <b>back</b> of the line. Everyone ahead of it keeps their place.`,hi:[{i}],changes:[{kind:'add',i}]}}],
 ['dequeue','dequeue',s=>{if(!s.v.length)empty('queue');const old=s.v.length;const n=s.v.shift();
   return {code:'const next = queue.shift();  // dequeue',say:`<b>dequeue</b>: ${esc(n)} was at the front, so ${esc(n)} is served first and leaves. The others each move up one place.`,changes:[{kind:'remove',i:0},...moves(old-1,1,-1)],result:n}}],
 ['front','front',s=>{if(!s.v.length)empty('queue');
   return {code:`queue[0]  // ${s.v[0]}`,say:`<b>front</b> looks at who is next (${esc(s.v[0])}) without serving them.`,hi:[{i:0}],result:s.v[0]}}]
]);

const LL=arr=>arr.reduceRight((next,value)=>({value,next}),null);
const llLen=h=>{let n=0;for(let c=h;c;c=c.next)n++;return n};
const llVals=h=>{const o=[];for(let c=h;c;c=c.next)o.push(c.value);return o};
const lastNode=h=>{let c=h;while(c.next)c=c.next;return c};
const loose=s=>s.loose||[];
const chain={shape:'chain',
 create(st=[4,7,1]){
  const c=Array.isArray(st)?st:st&&Array.isArray(st.chain)?st.chain:null;
  const l=Array.isArray(st)?[]:st&&st.loose!==undefined?st.loose:[];
  const r=Array.isArray(st)||!st||st.rest===undefined?[]:st.rest;
  if(!c||!Array.isArray(l)||!Array.isArray(r)||c.length+l.length+r.length>7||![...c,...l,...r].every(isVal))throw new Error('chain: start must be values, or {chain, loose, rest}, 7 nodes in all');
  const s={v:LL(c),loose:l.map(value=>({value,next:null}))};
  if(r.length)s.rest=LL(r);
  return s;
 },
 clone(s){const c={v:LL(llVals(s.v)),loose:loose(s).map(n=>({value:n.value,next:null}))};if(s.rest)c.rest=LL(llVals(s.rest));return c},
 snapshot:s=>({chain:llVals(s.v),loose:loose(s).map(n=>n.value),...(s.rest?{rest:llVals(s.rest)}:{})}),
 items:s=>[...idxs(llLen(s.v)),...loose(s).map((_,l)=>({l})),{head:true}],
 pointers:s=>s.v?[{name:s.rest?'prev':'head',i:0}]:[],
 valid(s){
  if(!s||typeof s!=='object')return 'chain state needs an object';
  const seen=new Set();
  for(const h of [s.v,s.rest])for(let c=h;c;c=c.next){if(seen.has(c))return 'chain has a cycle, or a node in two places';seen.add(c);if(!isVal(c.value))return 'chain holds a bad value'}
  const l=s.loose===undefined?[]:s.loose;
  if(!Array.isArray(l))return 'loose must be a list';
  for(const n of l){if(!n||seen.has(n))return 'a node is in the chain and loose, or twice in loose';seen.add(n);if(!isVal(n.value)||n.next!==null)return 'a loose node must be single'}
  return seen.size>7?'chain holds more than 7 nodes':null;
 }};
/* While a reversal is under way (s.rest set) every op but flip is refused, before it touches the state. */
const lock=([n,lab,f])=>[n,lab,n==='flip'?f:(s,a)=>{if(s.rest)no('Finish flipping the arrows first: the chain is half turned around.');return f(s,a)}];
build(chain,[
 ['addFirst','addFirst',(s,a)=>{const n=val(a);if(llLen(s.v)+loose(s).length>=7)full(7,'nodes');const had=!!s.v;s.v={value:n,next:s.v};
   return {code:`head = { value: ${fmt(n)}, next: head };`,say:`<b>addFirst</b>: a new node points at the old head, then becomes the head. Two steps, no matter how long the list is. This is where linked lists beat arrays.`,hi:[{i:0}],
    changes:[{kind:'add',i:0},{kind:'relink',from:{head:true},to:{i:0}},{kind:'relink',from:{i:0},to:had?{i:1}:null}]}}],
 ['addLast','add (end)',(s,a)=>{const n=val(a);const len=llLen(s.v);if(len+loose(s).length>=7)full(7,'nodes');const node={value:n,next:null};
   if(!s.v){s.v=node;return {code:`head = { value: ${fmt(n)}, next: null };`,say:'The list was empty, so the new node becomes the head.',hi:[{i:0}],changes:[{kind:'add',i:0},{kind:'relink',from:{head:true},to:{i:0}}]}}
   lastNode(s.v).next=node;
   return {code:`// walk to the last node, then:\nlast.next = { value: ${fmt(n)}, next: null };`,say:'To add at the <b>end</b> you first have to <b>walk</b> the whole chain to find the last node (the one whose next is null), then point it at the new node.',walk:idxs(len).map(x=>[x]),hi:[{i:len}],changes:[{kind:'add',i:len},{kind:'relink',from:{i:len-1},to:{i:len}}]}}],
 ['removeFirst','removeFirst',s=>{if(!s.v)empty('list');const n=s.v.value;s.v=s.v.next;
   return {code:'head = head.next;',say:`<b>removeFirst</b>: the head just moves on to the next node. The old node (${esc(n)}) is left with nothing pointing at it, so it is gone.`,hi:s.v?[{i:0}]:[],changes:[{kind:'remove',i:0},{kind:'relink',from:{head:true},to:s.v?{i:0}:null}],result:n}}],
 ['find','find',(s,a)=>{if(a.value!==undefined&&!isVal(a.value))no('<code>value</code> must be a number or a short text (1 to 12 characters).');if(!s.v)empty('list');
   const vals=llVals(s.v);const t=a.value!==undefined?a.value:Math.random()<.7?pick(vals):10;const at=vals.indexOf(t);const upto=at<0?vals.length:at+1;
   return {code:`// follow the arrows until value === ${fmt(t)}`,say:at<0?`${esc(t)} is not in the list. You cannot jump ahead, so every node had to be visited to be sure.`:`Found ${esc(t)} at node ${at+1} after visiting ${upto} node${upto===1?'':'s'}. There is no shortcut to the middle of a linked list.`,walk:idxs(upto).map(x=>[x]),hi:at<0?[]:[{i:at}],result:at}}],
 ['reverse','reverse',s=>{if(!s.v||!s.v.next)no('A list of zero or one nodes is already its own reverse. Add a few more nodes first.');
   const n=llLen(s.v);let prev=null,cur=s.v;while(cur){const next=cur.next;cur.next=prev;prev=cur;cur=next}s.v=prev;
   return {code:'let prev = null, cur = head;\nwhile (cur) {\n  const next = cur.next;\n  cur.next = prev;\n  prev = cur;\n  cur = next;\n}\nhead = prev;',say:'<b>reverse</b> flips every arrow to point backwards while walking along. The old last node is the new head.',hi:idxs(n),
    changes:[{kind:'relink',from:{head:true},to:{i:0}},...Array.from({length:n},(_,i)=>({kind:'relink',from:{i},to:i<n-1?{i:i+1}:null}))]}}],
 ['link','link',(s,a)=>{
   if(a.from!==undefined&&!isSel(a.from,'head',x=>x===true)&&!isSel(a.from,'i',isIdx))no('<code>from</code> must be <code>{ head: true }</code> or <code>{ i: 2 }</code>.');
   if(a.to!==undefined&&!isSel(a.to,'l',isIdx))no('<code>to</code> must name a loose node, like <code>{ l: 0 }</code>.');
   const L=loose(s);const len=llLen(s.v);
   if(!L.length)no('There are no loose nodes left to link.');
   const from=a.from!==undefined?a.from:len?{i:len-1}:{head:true};
   const to=a.to!==undefined?a.to:{l:rnd(0,L.length-1)};
   if(to.l<0||to.l>=L.length)no('Pick one of the loose nodes to link in: that one is not a loose node.');
   if(from.head&&len)no('The chain already has a head, so link from its last node instead.');
   if(from.i!==undefined&&(!len||from.i!==len-1))no('Only the last node can take a new link, because every other node already points at its next one.');
   const node=L.splice(to.l,1)[0];
   if(from.head)s.v=node;else lastNode(s.v).next=node;
   return {code:from.head?'head = node;':'last.next = node;',say:from.head?`<code>link</code> made the loose node ${esc(node.value)} the head: the head now points at it.`:`<code>link</code> joined the loose node ${esc(node.value)} onto the end: the last node's <code>next</code> arrow now points at it.`,
    hi:[{i:len}],changes:[{kind:'move',from:{l:to.l},to:{i:len}},{kind:'relink',from,to:{i:len}}],result:len+1}}],
 ['flip','flip',s=>{
   let at;
   if(s.rest){const cur=s.rest;s.rest=cur.next||null;cur.next=s.v;s.v=cur;at=cur.next.value}
   else{if(!s.v||!s.v.next)no('A list of zero or one nodes is already its own reverse. Add a few more nodes first.');s.rest=s.v.next;s.v.next=null}
   return {code:'const next = cur.next;\ncur.next = prev;\nprev = cur;\ncur = next;',say:at===undefined?'The first arrow turns to point at <b>nothing</b>, because this node is now the end of the new chain. The rest of the nodes wait for their turn.':`This node's arrow flips: it now points <b>back</b> at ${esc(at)}, the node you flipped just before. It has joined the front of the turned-around part.`,
    hi:[{i:0}],changes:[{kind:'relink',from:{i:0},to:at===undefined?null:{i:1}}],result:at}}]
].map(lock));

const KEYS=['umbrella','hat','scarf','boot','glove'];
const buckets={shape:'buckets',
 create(st){
  if(st===undefined)st=[['umbrella',3],['hat',7]];
  if(Array.isArray(st)){
   if(st.length>5||!st.every(p=>Array.isArray(p)&&p.length===2&&isKey(p[0])&&isNum(p[1]))||new Set(st.map(p=>p[0])).size!==st.length)throw new Error('map: start must be at most 5 unique [key, number] pairs');
   return {v:new Map(st)};
  }
  if(st&&Array.isArray(st.set)){
   if(st.set.length>6||!st.set.every(isNum)||new Set(st.set).size!==st.set.length)throw new Error('set: start must be at most 6 unique numbers');
   return {v:new Set(st.set)};
  }
  throw new Error('buckets: start must be pairs or {set:[...]}');
 },
 clone:s=>({v:s.v instanceof Set?new Set(s.v):new Map(s.v)}),
 snapshot:s=>s.v instanceof Set?{set:[...s.v]}:[...s.v].map(([k,x])=>[k,x]),
 items:s=>s.v instanceof Set?[...s.v].map(v=>({v})):[...s.v.keys()].map(k=>({k})),
 pointers:()=>[],
 valid(s){
  if(s&&s.v instanceof Set)return s.v.size>6?'set holds more than 6 values':[...s.v].every(isNum)?null:'set holds a bad value';
  if(!s||!(s.v instanceof Map))return 'buckets state needs a Map or a Set';
  return s.v.size>5?'map holds more than 5 pairs':[...s.v].every(([k,x])=>isKey(k)&&isNum(x))?null:'map holds a bad pair';
 }};
build(buckets,[
 ['set','set',(s,a)=>{const k=keyArg(a)??pick(KEYS);const n=numArg(a,'value','Map values')??rnd(1,9);const had=s.v.has(k);if(!had&&s.v.size>=5)full(5,'pairs');s.v.set(k,n);
   return {code:`aisle.set(${fmt(k)}, ${n});`,say:had?`"${esc(k)}" was already a key, so <b>set</b> <b>replaced</b> its value with ${n}. A Map never holds the same key twice.`:`<b>set</b> stored a new pair: "${esc(k)}" → ${n}.`,hi:[{k}],changes:[{kind:had?'set':'add',k}]}}],
 ['get','get',(s,a)=>{let k=keyArg(a);if(k===undefined){if(!s.v.size)empty('map');k=pick([...s.v.keys()])}const found=s.v.has(k);const x=s.v.get(k);
   return found?{code:`aisle.get(${fmt(k)})  // ${x}`,say:`<b>get</b> went straight to "${esc(k)}" and found ${x}, without looking at any other pair.`,hi:[{k}],result:x}
    :{code:`aisle.get(${fmt(k)})  // undefined`,say:'A key that is not in the Map gives <code>undefined</code>, not an error. Use <code>has</code> when you need to tell "missing" from "stored undefined".',result:undefined}}],
 ['delete','delete',(s,a)=>{let k=keyArg(a);if(k===undefined){if(!s.v.size)empty('map');k=pick([...s.v.keys()])}
   if(!s.v.has(k))no(`There is no "${esc(k)}" in the Map, so there is nothing to delete.`);s.v.delete(k);
   return {code:`aisle.delete(${fmt(k)});`,say:`<b>delete</b> removed the pair for "${esc(k)}". The others are untouched.`,changes:[{kind:'remove',k}]}}],
 ['has','has',(s,a)=>{const k=keyArg(a)??(s.v.size&&Math.random()<.5?pick([...s.v.keys()]):pick(KEYS));const yes=s.v.has(k);
   return {code:`aisle.has(${fmt(k)})  // ${yes}`,say:yes?`Yes, "${esc(k)}" is a key in the Map. <code>has</code> answered <code>true</code> without looking through the pairs.`:`No, "${esc(k)}" is not a key here, so <code>has</code> answered <code>false</code>, just as quickly.`,hi:yes?[{k}]:[],result:yes}}]
],[
 ['add','add',(s,a)=>{const n=numArg(a,'value','Set values')??rnd(1,6);const had=s.v.has(n);if(!had&&s.v.size>=6)full(6,'values');s.v.add(n);
   return {code:`seen.add(${n});`,say:had?`${n} was already in the Set, so <b>add</b> did nothing. Still ${s.v.size} value${s.v.size===1?'':'s'}.`:`<b>add</b> put ${n} in. The Set now holds ${s.v.size}.`,hi:[{v:n}],changes:had?[]:[{kind:'add',v:n}]}}],
 ['has','has',(s,a)=>{const n=numArg(a,'value','Set values')??rnd(1,6);const yes=s.v.has(n);
   return {code:`seen.has(${n})  // ${yes}`,say:yes?`Yes, ${n} is in the Set. <b>has</b> answered instantly without checking the values one by one.`:`No, ${n} is not in the Set. <b>has</b> answers false just as quickly.`,hi:yes?[{v:n}]:[],result:yes}}],
 ['delete','delete',(s,a)=>{let n=numArg(a,'value','Set values');if(n===undefined){if(!s.v.size)empty('set');n=pick([...s.v])}
   if(!s.v.has(n))no(`${n} is not in the Set, so there is nothing to delete.`);s.v.delete(n);
   return {code:`seen.delete(${n});`,say:`<b>delete</b> removed ${n}.`,changes:[{kind:'remove',v:n}]}}]
]);

const node=value=>({value,left:null,right:null});
function insertPath(root,v,path){if(!root){path.push(null);return node(v)}path.push(root.value);if(v<root.value)root.left=insertPath(root.left,v,path);else if(v>root.value)root.right=insertPath(root.right,v,path);return root}
const vals=n=>n?[...vals(n.left),n.value,...vals(n.right)]:[];
const pre=n=>n?[n.value,...pre(n.left),...pre(n.right)]:[];
const copyT=n=>n?{value:n.value,left:copyT(n.left),right:copyT(n.right)}:null;
const route=(root,t)=>{const path=[];let c=root;while(c){path.push(c.value);if(t===c.value)break;c=t<c.value?c.left:c.right}return path};
const tree={shape:'tree',
 create(st=[8,3,10]){
  if(!Array.isArray(st)||st.length>11||!st.every(isNum)||new Set(st).size!==st.length)throw new Error('tree: start must be at most 11 unique numbers');
  return {v:st.reduce((r,x)=>insertPath(r,x,[]),null)};
 },
 clone:s=>({v:copyT(s.v)}),
 snapshot:s=>pre(s.v),
 items:s=>vals(s.v).map(v=>({v})),
 pointers:s=>s.v?[{name:'root',v:s.v.value}]:[],
 valid(s){
  if(!s||typeof s!=='object')return 'tree state needs an object';
  const seen=new Set();
  const walk=n=>{if(!n)return null;if(typeof n!=='object'||seen.has(n))return 'tree has a cycle';seen.add(n);if(!isNum(n.value))return 'tree holds a bad value';return walk(n.left)||walk(n.right)};
  const bad=walk(s.v);if(bad)return bad;
  if(seen.size>11)return 'tree holds more than 11 nodes';
  const v=vals(s.v);return v.every((x,i)=>!i||x>v[i-1])?null:'tree is not sorted and unique';
 }};
build(tree,[
 ['insert','insert',(s,a)=>{let n=numArg(a,'value','Tree values');const have=vals(s.v);if(have.length>=11)full(11,'nodes');
   if(n===undefined)do n=rnd(1,15);while(have.includes(n));else if(have.includes(n))no(`${n} is already in the tree, and a search tree keeps each value only once.`);
   const path=[];s.v=insertPath(s.v,n,path);const steps=path.filter(x=>x!==null);
   return {code:`tree = insert(tree, ${n});`,say:`To insert ${n}, start at the root and compare: ${steps.map(p=>`${n} ${n<p?'<':'>'} ${p} so go ${n<p?'left':'right'}`).join(', ')}. The first empty spot is where ${n} goes.`,walk:steps.map(v=>[{v}]),hi:[{v:n}],changes:[{kind:'add',v:n}]}}],
 ['contains','contains',(s,a)=>{let t=numArg(a,'value','Tree values');const have=vals(s.v);
   if(t===undefined){if(!have.length)empty('tree');if(Math.random()<.5)t=pick(have);else do t=rnd(1,15);while(have.includes(t))}
   const path=route(s.v,t);const found=have.includes(t);
   return {code:`contains(tree, ${t})  // ${found}`,say:found?`Looking for ${t}: it visited ${path.length} node${path.length===1?'':'s'} (${path.join(' → ')}), choosing one side each time, instead of checking all ${have.length}.`:path.length?`${t} is not here. The search followed ${path.join(' → ')} and then ran into an empty spot, which proves it is missing, without looking at the rest.`:`The tree is empty, so ${t} cannot be in it.`,walk:path.map(v=>[{v}]),hi:found?[{v:t}]:[],result:found}}],
 ['inorder','in-order walk',s=>{const have=vals(s.v);if(!have.length)empty('tree');
   return {code:`inorder(tree)  // [${have.join(', ')}]`,say:`<b>In-order</b> means left branch, then the node, then right branch. On a search tree that visits the values in sorted order: ${have.join(', ')}.`,walk:have.map(v=>[{v}]),result:have}}]
]);

D.SCENES={row,pile,line,chain,buckets,tree};

const op=(sc,name,label=name,tweak)=>({label,name,run:(s,a)=>sc.op(s,name).run(s,tweak?tweak(s,a):a)});
const absent=s=>{const have=vals(s.v);let t;do t=rnd(1,15);while(have.includes(t));return t};
const demo=(o,sc,ops)=>({...o,shape:sc.shape,ops});
D.DEMOS=[
 demo({id:'array',ch:0,title:'Array: a row of numbered boxes',name:'row',
  about:'Boxes sit side by side and are numbered from 0. Reading box <code>i</code> is instant. Adding or removing at the <b>end</b> is cheap. At the <b>front</b>, everything has to shuffle along: <code>unshift</code> and <code>shift</code> add and remove there (like <code>push</code> and <code>pop</code> do at the end), and <code>indexOf(x)</code> searches for <code>x</code> and gives its box number, or -1 if it is missing.',
  init:()=>row.create().v},row,['push','pop','unshift','shift','read','indexOf','swap'].map(n=>op(row,n))),
 demo({id:'stack',ch:1,title:'Stack: last in, first out',name:'stack',
  about:'A pile of hat boxes. You only ever touch the <b>top</b>. The last thing you put on is the first thing you take off.',
  init:()=>pile.create().v},pile,['push','pop','peek'].map(n=>op(pile,n))),
 demo({id:'queue',ch:2,title:'Queue: first in, first out',name:'queue',
  about:'A line at the claim desk. New people join at the <b>back</b>. The person at the <b>front</b> is served first, so things leave in the same order they arrived.',
  init:()=>line.create().v},line,['enqueue','dequeue','front'].map(n=>op(line,n))),
 demo({id:'list',ch:3,title:'Linked list: a chain of nodes',name:'head',
  about:'Each node holds a <b>value</b> and an arrow to the <b>next</b> node. You only keep hold of the <b>head</b>. To reach anything else you follow the arrows, one node at a time.',
  init:()=>chain.create().v},chain,[op(chain,'addFirst'),op(chain,'addLast','add (end)'),op(chain,'removeFirst'),op(chain,'find'),op(chain,'reverse')]),
 demo({id:'map',ch:4,title:'Map: look things up by key',name:'aisle',
  about:'A Map stores <b>key → value</b> pairs. Give it a key and it finds the value almost instantly, however many pairs it holds, without searching through them. (It does this by hashing, which turns the key into the spot to look.)',
  init:()=>buckets.create().v},buckets,[op(buckets,'set'),op(buckets,'get'),op(buckets,'get','get missing',(s,a)=>({...a,key:'cape'})),op(buckets,'delete'),op(buckets,'has')]),
 demo({id:'set',ch:4,title:'Set: each value only once',name:'seen',
  about:'A Set is a bag where every value appears <b>once</b>. Adding something it already has changes nothing. Asking <code>has(x)</code> is as fast as a Map lookup, which makes Sets perfect for "have I seen this before?".',
  init:()=>buckets.create({set:[2,5]}).v},buckets,['add','has','delete'].map(n=>op(buckets,n))),
 demo({id:'tree',ch:5,title:'Binary search tree: smaller left, bigger right',name:'tree',
  about:'Every node has up to two children. Everything in the <b>left</b> branch is smaller than the node and everything in the <b>right</b> branch is bigger. So to find or place a value you only ever go one way at each step, throwing away about half the tree each time.',
  init:()=>tree.create().v},tree,[op(tree,'insert'),
   op(tree,'contains','contains (found)',(s,a)=>{const have=vals(s.v);return have.length?{...a,value:pick(have)}:a}),
   op(tree,'contains','contains (missing)',(s,a)=>vals(s.v).length?{...a,value:absent(s)}:a),
   op(tree,'inorder','in-order walk')])
];
D.treeVals=vals;D.listVals=llVals;
})();
