/* Data Structures Quest: the "see it work" explainers. Each demo owns a real structure and a list of operations that really change it,
   and says what happened in plain words. DOM-free, so Node can test it. The UI (app.js) draws the structure and plays the highlights. */
(()=>{
'use strict';
const D=globalThis.DSQ=globalThis.DSQ||{};
const rnd=(a,b)=>a+Math.floor(Math.random()*(b-a+1));
const pick=a=>a[Math.floor(Math.random()*a.length)];
const full=(n,what)=>({code:'',say:`This page keeps the picture small (${n} ${what} at most). Remove something first.`,hi:[]});
const empty=what=>({code:'',say:`The ${what} is empty, so there is nothing to take. Add something first.`,hi:[]});
const idxs=n=>Array.from({length:n},(_,i)=>({i}));

/* ---------- arrays ---------- */
const ARRAY={id:'array',ch:0,title:'Array: a row of numbered boxes',name:'row',
 about:'Boxes sit side by side and are numbered from 0. Reading box <code>i</code> is instant. Adding or removing at the <b>end</b> is cheap. At the <b>front</b>, everything has to shuffle along.',
 init:()=>[4,8,2],
 ops:[
  {label:'push',run:s=>{if(s.v.length>=10)return full(10,'boxes');const n=rnd(1,9);s.v.push(n);return {code:`row.push(${n});`,say:`<b>push</b> drops ${n} into a new box at the end. No other box moves, so it is quick.`,hi:[{i:s.v.length-1}]}}},
  {label:'pop',run:s=>{if(!s.v.length)return empty('row');const n=s.v.pop();return {code:'const last = row.pop();',say:`<b>pop</b> took the last box (${n}) off the end and handed it back as <code>last</code>. No other box moved.`,hi:[]}}},
  {label:'unshift',run:s=>{if(s.v.length>=10)return full(10,'boxes');const n=rnd(1,9);s.v.unshift(n);return {code:`row.unshift(${n});`,say:`<b>unshift</b> adds ${n} at the <b>front</b>. Every other item had to slide one box to the right to make room. On a row of a million items, that is a million moves.`,hi:idxs(s.v.length)}}},
  {label:'shift',run:s=>{if(!s.v.length)return empty('row');const n=s.v.shift();return {code:'const first = row.shift();',say:`<b>shift</b> took ${n} from the front, so every remaining item slid one box to the left to close the gap.`,hi:idxs(s.v.length)}}},
  {label:'read',run:s=>{if(!s.v.length)return empty('row');const i=rnd(0,s.v.length-1);return {code:`row[${i}]  // ${s.v[i]}`,say:`Box ${i} holds ${s.v[i]}. The computer jumps straight to it, with no searching, however long the row is.`,hi:[{i}]}}},
  {label:'indexOf',run:s=>{if(!s.v.length)return empty('row');const t=Math.random()<.7?pick(s.v):10;const at=s.v.indexOf(t);const upto=at<0?s.v.length:at+1;
    return {code:`row.indexOf(${t})  // ${at}`,say:at<0?`${t} is not in the row. To be sure, it had to look in <b>every</b> box and gave back -1.`:`Found ${t} in box ${at}. It had to look through ${upto} box${upto===1?'':'es'} to get there: searching an unsorted row means walking it.`,walk:idxs(upto).map(x=>[x]),hi:at<0?[]:[{i:at}]}}}
 ]};

/* ---------- stacks ---------- */
const slab=t=>`<span class="slab">${t}</span>`;
const STACK={id:'stack',ch:1,title:'Stack: last in, first out',name:'stack',
 about:'A pile of plates. You only ever touch the <b>top</b>. The last thing you put on is the first thing you take off.',
 init:()=>[3,7],
 render:s=>`<div class="stackviz">${slab('top')}${s.v.map((x,i)=>`<div class="sbox" data-i="${i}">${x}</div>`).reverse().join('')||'<span class="empty">empty stack</span>'}<div class="sbase"></div></div>`,
 ops:[
  {label:'push',run:s=>{if(s.v.length>=7)return full(7,'plates');const n=rnd(1,9);s.v.push(n);return {code:`stack.push(${n});`,say:`<b>push</b> puts ${n} on <b>top</b>. Everything underneath stays exactly where it was.`,hi:[{i:s.v.length-1}]}}},
  {label:'pop',run:s=>{if(!s.v.length)return empty('stack');const n=s.v.pop();return {code:'const top = stack.pop();',say:`<b>pop</b> removed the top item, ${n}, and handed it back. It was the most recent push, which is why this is called last in, first out.`,hi:[]}}},
  {label:'peek',run:s=>{if(!s.v.length)return empty('stack');const i=s.v.length-1;return {code:`stack[stack.length - 1]  // ${s.v[i]}`,say:`<b>peek</b> looks at the top item (${s.v[i]}) <b>without</b> removing it. The stack is unchanged.`,hi:[{i}]}}}
 ]};

/* ---------- queues ---------- */
const QUEUE={id:'queue',ch:2,title:'Queue: first in, first out',name:'queue',
 about:'A line at the shop. New people join at the <b>back</b>. The person at the <b>front</b> is served first, so things leave in the same order they arrived.',
 init:()=>[5,2,9],
 render:s=>`<div class="queueviz">${slab('front →')}${s.v.map((x,i)=>`<div class="sbox" data-i="${i}">${x}</div>`).join('')||'<span class="empty">empty queue</span>'}${slab('← back')}</div>`,
 ops:[
  {label:'enqueue',run:s=>{if(s.v.length>=7)return full(7,'people');const n=rnd(1,9);s.v.push(n);return {code:`queue.push(${n});  // enqueue`,say:`<b>enqueue</b>: ${n} joins at the <b>back</b> of the line. Everyone ahead of it keeps their place.`,hi:[{i:s.v.length-1}]}}},
  {label:'dequeue',run:s=>{if(!s.v.length)return empty('queue');const n=s.v.shift();return {code:'const next = queue.shift();  // dequeue',say:`<b>dequeue</b>: ${n} was at the front, so ${n} is served first and leaves. The others each move up one place.`,hi:[]}}},
  {label:'front',run:s=>{if(!s.v.length)return empty('queue');return {code:`queue[0]  // ${s.v[0]}`,say:`<b>front</b> looks at who is next (${s.v[0]}) without serving them.`,hi:[{i:0}]}}}
 ]};

/* ---------- linked lists ---------- */
const LL=(arr)=>arr.reduceRight((next,value)=>({value,next}),null);
const llLen=h=>{let n=0;for(let c=h;c;c=c.next)n++;return n};
const llVals=h=>{const o=[];for(let c=h;c;c=c.next)o.push(c.value);return o};
const LIST={id:'list',ch:3,title:'Linked list: a chain of nodes',name:'head',
 about:'Each node holds a <b>value</b> and an arrow to the <b>next</b> node. You only keep hold of the <b>head</b>. To reach anything else you follow the arrows, one node at a time.',
 init:()=>LL([4,7,1]),
 ops:[
  {label:'addFirst',run:s=>{if(llLen(s.v)>=7)return full(7,'nodes');const n=rnd(1,9);s.v={value:n,next:s.v};return {code:`head = { value: ${n}, next: head };`,say:`<b>addFirst</b>: a new node points at the old head, then becomes the head. Two steps, no matter how long the list is. This is where linked lists beat arrays.`,hi:[{i:0}]}}},
  {label:'add (end)',run:s=>{const len=llLen(s.v);if(len>=7)return full(7,'nodes');const n=rnd(1,9);const node={value:n,next:null};
    if(!s.v){s.v=node;return {code:`head = { value: ${n}, next: null };`,say:'The list was empty, so the new node simply becomes the head.',hi:[{i:0}]}}
    let last=s.v;while(last.next)last=last.next;last.next=node;
    return {code:`// walk to the last node, then:\nlast.next = { value: ${n}, next: null };`,say:`To add at the <b>end</b> you first have to <b>walk</b> the whole chain to find the last node (the one whose next is null), then point it at the new node.`,walk:idxs(len).map(x=>[x]),hi:[{i:len}]}}},
  {label:'removeFirst',run:s=>{if(!s.v)return empty('list');const n=s.v.value;s.v=s.v.next;return {code:'head = head.next;',say:`<b>removeFirst</b>: the head just moves on to the next node. The old node (${n}) is left with nothing pointing at it, so it is gone.`,hi:s.v?[{i:0}]:[]}}},
  {label:'find',run:s=>{if(!s.v)return empty('list');const vals=llVals(s.v);const t=Math.random()<.7?pick(vals):10;const at=vals.indexOf(t);const upto=at<0?vals.length:at+1;
    return {code:`// follow the arrows until value === ${t}`,say:at<0?`${t} is not in the list. You cannot jump ahead, so every node had to be visited to be sure.`:`Found ${t} at node ${at+1} after visiting ${upto} node${upto===1?'':'s'}. There is no shortcut to the middle of a linked list.`,walk:idxs(upto).map(x=>[x]),hi:at<0?[]:[{i:at}]}}},
  {label:'reverse',run:s=>{if(!s.v||!s.v.next)return {code:'',say:'A list of zero or one nodes is already its own reverse. Add a few more nodes first.',hi:[]};
    let prev=null,cur=s.v;while(cur){const next=cur.next;cur.next=prev;prev=cur;cur=next}s.v=prev;
    return {code:'let prev = null, cur = head;\nwhile (cur) {\n  const next = cur.next;\n  cur.next = prev;\n  prev = cur;\n  cur = next;\n}\nhead = prev;',say:'<b>reverse</b> flips every arrow to point backwards while walking along. The old last node is the new head.',hi:idxs(llLen(s.v))}}}
 ]};

/* ---------- maps ---------- */
const KEYS=['ada','bo','cy','di','ed'];
const MAP={id:'map',ch:4,title:'Map: look things up by key',name:'ages',
 about:'A Map stores <b>key → value</b> pairs. Give it a key and it finds the value almost instantly, however many pairs it holds, without searching through them. (It does this by hashing, which turns the key into the spot to look.)',
 init:()=>new Map([['ada',36],['bo',29]]),
 ops:[
  {label:'set',run:s=>{const k=pick(KEYS);if(!s.v.has(k)&&s.v.size>=5)return full(5,'pairs');const n=rnd(18,60);const had=s.v.has(k);s.v.set(k,n);return {code:`ages.set("${k}", ${n});`,say:had?`"${k}" was already a key, so <b>set</b> <b>replaced</b> its value with ${n}. A Map never holds the same key twice.`:`<b>set</b> stored a new pair: "${k}" → ${n}.`,hi:[{k}]}}},
  {label:'get',run:s=>{if(!s.v.size)return empty('map');const k=pick([...s.v.keys()]);return {code:`ages.get("${k}")  // ${s.v.get(k)}`,say:`<b>get</b> went straight to "${k}" and found ${s.v.get(k)}, without looking at any other pair.`,hi:[{k}]}}},
  {label:'get missing',run:s=>({code:'ages.get("zed")  // undefined',say:'A key that is not in the Map gives <code>undefined</code>, not an error. Use <code>has</code> when you need to tell "missing" from "stored undefined".',hi:[]})},
  {label:'delete',run:s=>{if(!s.v.size)return empty('map');const k=pick([...s.v.keys()]);s.v.delete(k);return {code:`ages.delete("${k}");`,say:`<b>delete</b> removed the pair for "${k}". The others are untouched.`,hi:[]}}}
 ]};

/* ---------- sets ---------- */
const SET={id:'set',ch:4,title:'Set: each value only once',name:'seen',
 about:'A Set is a bag where every value appears <b>once</b>. Adding something it already has changes nothing. Asking <code>has(x)</code> is as fast as a Map lookup, which makes Sets perfect for "have I seen this before?".',
 init:()=>new Set([2,5]),
 ops:[
  {label:'add',run:s=>{const n=rnd(1,6);const had=s.v.has(n);if(!had&&s.v.size>=6)return full(6,'values');s.v.add(n);return {code:`seen.add(${n});`,say:had?`${n} was already in the Set, so <b>add</b> did nothing. Still ${s.v.size} value${s.v.size===1?'':'s'}.`:`<b>add</b> put ${n} in. The Set now holds ${s.v.size}.`,hi:[{v:n}]}}},
  {label:'has',run:s=>{const n=rnd(1,6);const yes=s.v.has(n);return {code:`seen.has(${n})  // ${yes}`,say:yes?`Yes, ${n} is in the Set. <b>has</b> answered instantly without checking the values one by one.`:`No, ${n} is not in the Set. <b>has</b> answers false just as quickly.`,hi:yes?[{v:n}]:[]}}},
  {label:'delete',run:s=>{if(!s.v.size)return empty('set');const n=pick([...s.v]);s.v.delete(n);return {code:`seen.delete(${n});`,say:`<b>delete</b> removed ${n}.`,hi:[]}}}
 ]};

/* ---------- binary search trees ---------- */
const mk=value=>({value,left:null,right:null});
function insertPath(root,v,path){if(!root){path.push(null);return mk(v)}path.push(root.value);if(v<root.value)root.left=insertPath(root.left,v,path);else if(v>root.value)root.right=insertPath(root.right,v,path);return root}
const vals=n=>n?[...vals(n.left),n.value,...vals(n.right)]:[];
const TREE={id:'tree',ch:5,title:'Binary search tree: smaller left, bigger right',name:'tree',
 about:'Every node has up to two children. Everything in the <b>left</b> branch is smaller than the node and everything in the <b>right</b> branch is bigger. So to find or place a value you only ever go one way at each step, throwing away about half the tree each time.',
 init:()=>[8,3,10].reduce((r,v)=>insertPath(r,v,[]),null),
 ops:[
  {label:'insert',run:s=>{const have=vals(s.v);if(have.length>=11)return full(11,'nodes');let n;do n=rnd(1,15);while(have.includes(n));const path=[];s.v=insertPath(s.v,n,path);const steps=path.filter(x=>x!==null);
    return {code:`tree = insert(tree, ${n});`,say:`To insert ${n}, start at the root and compare: ${steps.map(p=>`${n} ${n<p?'<':'>'} ${p} so go ${n<p?'left':'right'}`).join(', ')}. The first empty spot is where ${n} goes.`,walk:steps.map(v=>[{v}]),hi:[{v:n}]}}},
  {label:'contains (found)',run:s=>{const have=vals(s.v);if(!have.length)return empty('tree');const t=pick(have);const path=[];let c=s.v;while(c){path.push(c.value);if(t===c.value)break;c=t<c.value?c.left:c.right}
    return {code:`contains(tree, ${t})  // true`,say:`Looking for ${t}: it visited ${path.length} node${path.length===1?'':'s'} (${path.join(' → ')}), choosing one side each time, instead of checking all ${have.length}.`,walk:path.map(v=>[{v}]),hi:[{v:t}]}}},
  {label:'contains (missing)',run:s=>{const have=vals(s.v);if(!have.length)return empty('tree');let t;do t=rnd(1,15);while(have.includes(t));const path=[];let c=s.v;while(c){path.push(c.value);c=t<c.value?c.left:c.right}
    return {code:`contains(tree, ${t})  // false`,say:`${t} is not here. The search followed ${path.join(' → ')} and then ran into an empty spot, which proves it is missing, without looking at the rest.`,walk:path.map(v=>[{v}]),hi:[]}}},
  {label:'in-order walk',run:s=>{const have=vals(s.v);if(!have.length)return empty('tree');return {code:`inorder(tree)  // [${have.join(', ')}]`,say:`<b>In-order</b> means left branch, then the node, then right branch. On a search tree that visits the values in sorted order: ${have.join(', ')}.`,walk:have.map(v=>[{v}]),hi:[]}}}
 ]};

D.DEMOS=[ARRAY,STACK,QUEUE,LIST,MAP,SET,TREE];
D.treeVals=vals;D.listVals=llVals;
})();
