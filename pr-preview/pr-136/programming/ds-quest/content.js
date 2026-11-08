/* Data Structures Quest: chapters, missions, quick-fire and field guide. Plain data, so Node can test every mission. */
(()=>{
'use strict';
const D=globalThis.DSQ=globalThis.DSQ||{};
// Runs f with the learner's function called `name`, or says what is missing.
const F=(c,name,f)=>{const g=c.fn(name);return g?f(g):`Define a function called ${name}. The starter code shows its shape.`};
const eqs=(c,got,want)=>c.eq(got,want);
const has=(c,re)=>re.test(c.code);

const CH=[
{name:'Arrays',badge:'Row Master',intro:'A data structure is a way of arranging values so a program can use them well. You will build them here in JavaScript, one small program at a time. The first is the array: a numbered row of boxes. Each box holds one value, and the numbers start at 0, not 1. Many other structures are built on top of it.',
 learned:['[ ]','index [i]','.length','.push()','.pop()','loops over arrays'],
 missions:[
 {title:'Build a row',goal:'Create an array called <code>crew</code> with <b>three names</b> in it, then print how many names it holds using <code>.length</code>.',
  anat:[['const','kw'],['crew','var'],['=','op'],['["Ada", "Bo", "Cy"]','str','array']],
  explain:'The whole line gives a name to a row of three names. A variable is a name for a value: <code>const crew = ...</code> makes one called <code>crew</code> (<code>const</code> means the name keeps this value). Text goes inside quotes, like <code>"Ada"</code>. Square brackets create an array and commas separate the items. <code>.length</code> counts them. Use <code>print(...)</code> (or <code>console.log(...)</code>) to show things in the console.',
  note:'After you press Run, look at the Structure view on the right: your array appears as a row of numbered boxes.',
  starter:'// Type your code below\n',answer:'const crew = ["Ada", "Bo", "Cy"];\nprint(crew.length);',
  check:c=>{const a=c.vars.crew;if(!Array.isArray(a))return 'Make a variable called crew that holds an array, like const crew = ["Ada", "Bo", "Cy"];';
    if(a.length!==3||!a.every(x=>typeof x==='string'))return 'crew needs exactly three names, written as text in quotes.';
    return c.printed('3')&&has(c,/\.length/)?true:'Print crew.length so the console shows 3.'}},
 {title:'Pick a box',goal:'Print the <b>first</b> potion, then the <b>last</b> potion, each on its own line. Use an index (the box number) for each, and work the last one out from <code>.length</code> so it still works if the shelf grows.',
  anat:[['potions','var'],['[','br'],['0','num'],[']','br']],
  explain:'The first box is number <code>0</code>. The last box is number <code>length - 1</code>, because counting started at 0. Reading a box that does not exist gives <code>undefined</code> (JavaScript\'s word for "nothing there"), not an error.',
  starter:'const potions = ["red", "green", "blue", "gold"];\n',answer:'const potions = ["red", "green", "blue", "gold"];\nprint(potions[0]);\nprint(potions[potions.length - 1]);',
  check:c=>{const i=c.lines.indexOf('red'),j=c.lines.indexOf('gold');if(i<0||j<i)return 'The console should show red on one line, then gold on the next.';
    return has(c,/potions\s*\[\s*0\s*\]/)&&(has(c,/potions\s*\[\s*potions\.length\s*-\s*1\s*\]/)||has(c,/\.at\(\s*-1\s*\)/))?true:'Do not type the names. Read them out of the array with potions[0] and potions[potions.length - 1].'}},
 {title:'Add and remove',goal:'Use <code>push</code> to add <code>"torch"</code> to the end of <code>bag</code>, then use <code>pop</code> to take the last item off again and print what <code>pop</code> gave you.',
  anat:[['bag','var'],['.push','fn'],['("torch")','str']],
  explain:'<code>push</code> adds to the <b>end</b> of an array. <code>pop</code> removes the end item and <b>hands it back</b>, so you can print or keep it.',
  starter:'const bag = ["rope", "map"];\n',answer:'const bag = ["rope", "map"];\nbag.push("torch");\nconst last = bag.pop();\nprint(last);',
  check:c=>{if(!has(c,/\.push\(/)||!has(c,/\.pop\(/))return 'Use bag.push(...) to add and bag.pop() to remove.';
    if(!eqs(c,c.vars.bag,['rope','map']))return 'After pushing and popping, bag should be back to ["rope", "map"].';
    return c.printed('torch')?true:'Print the value that pop gave back. It should be torch.'}},
 {title:'Walk the row',goal:'Write a function (a named recipe) <code>sum(nums)</code> that returns the total of all the numbers in the array. An empty array adds up to <code>0</code>.',
  explain:'A function is a named recipe: you hand it values (here <code>nums</code>, the array to add up) and it gives one answer back with <code>return</code>. To visit every box, loop over the array: <code>for (const n of nums) { ... }</code> gives you each value in turn. Keep a running total in a variable made with <code>let</code> (unlike <code>const</code>, a <code>let</code> variable can change), and update it inside the loop with <code>total += n</code>, which means "add <code>n</code> onto <code>total</code>".',
  note:'A function sends its answer back with <code>return</code>.',
  starter:'function sum(nums) {\n  // add up every number in nums\n}\n',answer:'function sum(nums) {\n  let total = 0;\n  for (const n of nums) {\n    total += n;\n  }\n  return total;\n}',
  check:c=>F(c,'sum',f=>{const t=[[[1,2,3],6],[[],0],[[-5,5,10],10],[[100],100]];
    for(const [a,w] of t){const g=f([...a]);if(g!==w)return `sum(${c.show(a)}) should give ${w}, but gave ${c.show(g)}.`}return true})},
 {title:'Find the biggest',goal:'Write <code>largest(nums)</code> that returns the biggest number in a non-empty array.',
  explain:'Remember the best value so far, then compare every box against it: <code>if (n &gt; best) best = n;</code> changes <code>best</code> only when the test <code>n &gt; best</code> (is <code>n</code> bigger?) is true. Start from the <b>first</b> item, not from <code>0</code>: what if every number is negative?',
  starter:'function largest(nums) {\n  // return the biggest number\n}\n',answer:'function largest(nums) {\n  let best = nums[0];\n  for (const n of nums) {\n    if (n > best) best = n;\n  }\n  return best;\n}',
  check:c=>F(c,'largest',f=>{const t=[[[3,9,2],9],[[-4,-2,-8],-2],[[7],7],[[1,5,5,2],5]];
    for(const [a,w] of t){const g=f([...a]);if(g!==w)return `largest(${c.show(a)}) should give ${w}, but gave ${c.show(g)}.`+(w<0?' Starting your best at 0 breaks when every number is negative.':'')}return true})}
 ]},
{name:'Stacks',badge:'Plate Stacker',intro:'A stack is a pile of plates. You add a plate on top, and you take a plate from the top. The last plate you put on is the first one off: <b>last in, first out</b>. Undo buttons and the browser back button work this way.',
 learned:['push / pop','peek','LIFO','class Stack','matching brackets'],
 missions:[
 {title:'A pile of plates',goal:'Push <code>"a"</code>, <code>"b"</code> and <code>"c"</code> onto <code>plates</code> in that order, then pop once and print what came off.',
  explain:'An array already behaves like a stack if you only use <code>push</code> and <code>pop</code>. Both work at the <b>end</b>, which is the top of the pile.',
  starter:'const plates = [];\n',answer:'const plates = [];\nplates.push("a");\nplates.push("b");\nplates.push("c");\nprint(plates.pop());',
  check:c=>c.printed('c')&&eqs(c,c.vars.plates,['a','b'])&&has(c,/\.push\(/)?true:'Push a, b, c in that order, then print plates.pop(). It prints c, and plates is left holding a and b.'},
 {title:'Peek, do not take',goal:'Print the top item of <code>stack</code> <b>without removing it</b>, then print how many items it holds.',
  explain:'Looking at the top without taking it is called <b>peek</b>. With an array, the top is the item at the last index. Using <code>pop</code> would remove it, so read it with an index instead.',
  starter:'const stack = [10, 20, 30];\n',answer:'const stack = [10, 20, 30];\nprint(stack[stack.length - 1]);\nprint(stack.length);',
  check:c=>{if(has(c,/\.pop\(|\.shift\(|\.splice\(/))return 'Peeking must not remove anything. Read the last item by its index instead of using pop.';
    return c.lines[0]==='30'&&c.lines[1]==='3'&&eqs(c,c.vars.stack,[10,20,30])?true:'The console should show 30, then 3, and the stack should still hold 10, 20, 30.'}},
 {title:'Build a Stack class',goal:'Finish the <code>Stack</code> class with the methods (the actions a class can do) <code>push(x)</code>, <code>pop()</code>, <code>peek()</code>, <code>isEmpty()</code> and <code>size()</code>.',
  explain:'A class bundles data with the actions on it. <code>constructor</code> runs when you make a new one with <code>new Stack()</code>, and <code>this</code> means "this stack", so the items live in <code>this.items</code>. Each action is a method, written like a small function inside the class. A real stack hides the array so users only get the stack actions. <code>pop()</code> and <code>peek()</code> on an empty stack should return <code>undefined</code>.',
  note:'Want to see it work? Add <code>const s = new Stack(); s.push(1);</code> below the class and run it. The Structure view shows what <code>s</code> holds.',
  starter:'class Stack {\n  constructor() {\n    this.items = [];\n  }\n  // add push, pop, peek, isEmpty and size\n}\n',
  answer:'class Stack {\n  constructor() {\n    this.items = [];\n  }\n  push(x) {\n    this.items.push(x);\n  }\n  pop() {\n    return this.items.pop();\n  }\n  peek() {\n    return this.items[this.items.length - 1];\n  }\n  isEmpty() {\n    return this.items.length === 0;\n  }\n  size() {\n    return this.items.length;\n  }\n}',
  check:c=>{const S=c.vars.Stack;if(typeof S!=='function')return 'Keep the class called Stack.';const s=new S();
    for(const m of ['push','pop','peek','isEmpty','size'])if(typeof s[m]!=='function')return `The Stack needs a ${m}() method.`;
    if(s.isEmpty()!==true||s.size()!==0)return 'A new Stack should be empty: isEmpty() is true and size() is 0.';
    if(s.pop()!==undefined||s.peek()!==undefined)return 'pop() and peek() on an empty stack should give back undefined.';
    s.push(1);s.push(2);s.push(3);
    if(s.size()!==3||s.isEmpty()!==false)return 'After three pushes, size() should be 3 and isEmpty() false.';
    if(s.peek()!==3||s.size()!==3)return 'peek() should show the top item (3) and leave the stack unchanged.';
    if(s.pop()!==3||s.pop()!==2)return 'pop() should give back the most recent push first: 3, then 2.';
    if(s.size()!==1||s.peek()!==1)return 'After two pops, only 1 should be left.';
    s.pop();return s.isEmpty()===true?true:'After popping everything, isEmpty() should be true.'}},
 {title:'Are the brackets balanced?',goal:'Write <code>balanced(text)</code>. It returns <code>true</code> when every <code>(</code> <code>[</code> <code>{</code> is closed by the matching bracket in the right order, and <code>false</code> otherwise. Other characters are ignored.',
  explain:'Walk through the text. When you see an <b>opening</b> bracket, push it. When you see a <b>closing</b> one, the top of the stack must be its partner: pop it, or fail. At the end the stack must be empty. The most recent opener has to close first, which is exactly what a stack gives you.',
  note:'In the hint, <code>pairs</code> is an object, a lookup table: <code>pairs[")"]</code> gives <code>"("</code>. <code>for (const ch of text)</code> visits one character at a time, <code>if</code> runs its block only when its test is true, and <code>return false</code> stops the function right there.',
  starter:'function balanced(text) {\n  // use a stack (an array with push and pop)\n}\n',
  answer:'function balanced(text) {\n  const pairs = { ")": "(", "]": "[", "}": "{" };\n  const stack = [];\n  for (const ch of text) {\n    if (ch === "(" || ch === "[" || ch === "{") {\n      stack.push(ch);\n    } else if (pairs[ch]) {\n      if (stack.pop() !== pairs[ch]) return false;\n    }\n  }\n  return stack.length === 0;\n}',
  check:c=>F(c,'balanced',f=>{const t=[['',true],['()',true],['([]{})',true],['a(b)c',true],['(]',false],['((',false],[')(',false],['([)]',false],['}',false],['{[()()]}',true]];
    for(const [s,w] of t){const g=f(s);if(g!==w)return `balanced(${JSON.stringify(s)}) should be ${w}, but gave ${c.show(g)}.`}return true})}
 ]},
{name:'Queues',badge:'Line Leader',intro:'A queue is a line at the shop. New people join at the back, and the person at the front is served first: <b>first in, first out</b>. Print jobs, message systems and the order a game processes turns all use queues.',
 learned:['enqueue / dequeue','shift','FIFO','class Queue','rotating a queue'],
 missions:[
 {title:'Join the line',goal:'Let <code>"Ada"</code>, <code>"Bo"</code> and <code>"Cy"</code> join <code>line</code> in that order with <code>push</code>. Then serve the person at the front with <code>shift</code> (it removes the first item and hands it back) and print their name.',
  explain:'<code>push</code> adds at the back. <code>shift</code> removes from the <b>front</b> and hands the item back. Together they make a queue. Ada joined first, so Ada is served first.',
  starter:'const line = [];\n',answer:'const line = [];\nline.push("Ada");\nline.push("Bo");\nline.push("Cy");\nprint(line.shift());',
  check:c=>has(c,/\.shift\(/)&&c.printed('Ada')&&eqs(c,c.vars.line,['Bo','Cy'])?true:'Push Ada, Bo, Cy, then print line.shift(). It prints Ada, and Bo and Cy are still waiting.'},
 {title:'Build a Queue class',goal:'Finish the <code>Queue</code> class with <code>enqueue(x)</code>, <code>dequeue()</code>, <code>front()</code>, <code>isEmpty()</code> and <code>size()</code>.',
  explain:'<code>enqueue</code> joins the back, <code>dequeue</code> removes and returns the front, <code>front</code> only looks at it. On an empty queue, <code>dequeue()</code> and <code>front()</code> give back <code>undefined</code>.',
  starter:'class Queue {\n  constructor() {\n    this.items = [];\n  }\n  // add enqueue, dequeue, front, isEmpty and size\n}\n',
  answer:'class Queue {\n  constructor() {\n    this.items = [];\n  }\n  enqueue(x) {\n    this.items.push(x);\n  }\n  dequeue() {\n    return this.items.shift();\n  }\n  front() {\n    return this.items[0];\n  }\n  isEmpty() {\n    return this.items.length === 0;\n  }\n  size() {\n    return this.items.length;\n  }\n}',
  check:c=>{const Q=c.vars.Queue;if(typeof Q!=='function')return 'Keep the class called Queue.';const q=new Q();
    for(const m of ['enqueue','dequeue','front','isEmpty','size'])if(typeof q[m]!=='function')return `The Queue needs a ${m}() method.`;
    if(q.isEmpty()!==true||q.size()!==0)return 'A new Queue should be empty.';
    if(q.dequeue()!==undefined||q.front()!==undefined)return 'dequeue() and front() on an empty queue should give back undefined.';
    q.enqueue('a');q.enqueue('b');q.enqueue('c');
    if(q.size()!==3||q.front()!=='a'||q.size()!==3)return 'After three enqueues, front() should be the first one (a) and should not remove it.';
    if(q.dequeue()!=='a'||q.dequeue()!=='b')return 'dequeue() should serve the oldest first: a, then b. Remember: first in, first out.';
    q.enqueue('d');
    if(q.size()!==2||q.front()!=='c')return 'After serving a and b and adding d, c should be at the front and 2 should be waiting.';
    q.dequeue();q.dequeue();return q.isEmpty()===true?true:'After serving everyone, isEmpty() should be true.'}},
 {title:'Hot potato',goal:'Kids stand in a queue and pass a potato. Write <code>hotPotato(names, n)</code>: the kid at the front passes it <b>n times</b> (each pass moves the front kid to the back), then whoever is at the front is out. Repeat until one kid is left, and return that winner\'s name.',
  explain:'This is a queue game. One pass is <code>queue.push(queue.shift())</code>: take the front, add it to the back. After <code>n</code> passes, a plain <code>queue.shift()</code> removes the loser. Loop while more than one kid remains: <code>while (queue.length &gt; 1)</code> repeats its block as long as its test is true, and <code>for (let i = 0; i &lt; n; i++)</code> repeats its block <code>n</code> times.',
  note:'Example: <code>hotPotato(["A","B","C","D"], 2)</code> returns <code>"A"</code>.',
  starter:'function hotPotato(names, n) {\n  const queue = [...names]; // [...names] makes a copy, so the original is left alone\n  // keep going until one name is left\n}\n',
  answer:'function hotPotato(names, n) {\n  const queue = [...names];\n  while (queue.length > 1) {\n    for (let i = 0; i < n; i++) {\n      queue.push(queue.shift());\n    }\n    queue.shift();\n  }\n  return queue[0];\n}',
  check:c=>F(c,'hotPotato',f=>{const ref=(a,n)=>{const q=[...a];let i=0;while(q.length>1){i=(i+n)%q.length;q.splice(i,1)}return q[0]};
    const t=[[['A','B','C','D'],2],[['Ann','Bo','Cy','Di','Ed'],3],[['x'],5],[['p','q'],1],[['a','b','c','d','e','f','g'],0]];
    for(const [a,n] of t){const g=f([...a],n);if(g!==ref(a,n))return `hotPotato(${c.show(a)}, ${n}) should return ${c.show(ref(a,n))}, but gave ${c.show(g)}.`}return true})}
 ]},
{name:'Linked lists',badge:'Chain Forger',intro:'A linked list is a chain of nodes. Each node holds a value and a pointer (an arrow saying where the next node is) to the next node, and the last node points to <code>null</code>. You cannot jump to the middle: you start at the <b>head</b> and follow the arrows, one node at a time.',
 learned:['node { value, next }','head','walking a chain','null as the end','reversing pointers'],
 missions:[
 {title:'Link three nodes',goal:'Build the chain <code>1 → 2 → 3</code> in a variable called <code>head</code>. Each node is an object (a small bundle of named fields) with a <code>value</code> and a <code>next</code>. <code>null</code> means "nothing here", so the last node\'s <code>next</code> is <code>null</code>.',
  anat:[['{ value: 1,','num'],['next:','var'],['{ ... }','br','the next node'],['}','br']],
  explain:'A node is an object. The <code>next</code> field holds <b>another node</b> (that very node, not a copy of it), or <code>null</code> when there is no more. Build it from the inside out: write the last node first.',
  note:'After running, the Structure view draws your chain with arrows.',
  starter:'const third = { value: 3, next: null };\n// make the second node point at third,\n// then make head point at the second\n',
  answer:'const third = { value: 3, next: null };\nconst second = { value: 2, next: third };\nconst head = { value: 1, next: second };',
  check:c=>{const h=c.vars.head;if(!h||typeof h!=='object')return 'Make a variable called head that holds the first node.';
    return h.value===1&&h.next&&h.next.value===2&&h.next.next&&h.next.next.value===3&&h.next.next.next===null?true:'head should be 1 → 2 → 3, and the last node\'s next must be null.'}},
 {title:'Walk the chain',goal:'Write <code>length(node)</code> that counts the nodes in a chain, starting from <code>node</code>. An empty chain (<code>null</code>) has length <code>0</code>.',
  explain:'Keep a pointer to the node you are on. While it is not <code>null</code>, count one and move to <code>node.next</code>. Moving the pointer forward is how every linked list loop works.',
  starter:'const head = { value: 1, next: { value: 2, next: { value: 3, next: null } } };\n\nfunction length(node) {\n  // count the nodes\n}\n\nprint(length(head));\n',
  answer:'const head = { value: 1, next: { value: 2, next: { value: 3, next: null } } };\n\nfunction length(node) {\n  let count = 0;\n  while (node !== null) {\n    count++;\n    node = node.next;\n  }\n  return count;\n}\n\nprint(length(head));',
  check:c=>F(c,'length',f=>{const t=[[null,0],[c.list([9]),1],[c.list([1,2,3]),3],[c.list([5,4,3,2,1,0,9]),7]];
    for(const [h,w] of t){const g=f(h);if(g!==w)return `A chain of ${w} node${w===1?'':'s'} should give ${w}, but length gave ${c.show(g)}.`}return true})},
 {title:'A LinkedList class',goal:'Finish the <code>LinkedList</code> class. <code>add(value)</code> puts a new node at the <b>end</b>, <code>addFirst(value)</code> puts one at the <b>start</b>, and <code>toArray()</code> returns the values in order.',
  explain:'The list remembers only its <code>head</code>. <code>addFirst</code> is quick: the new node points at the old head, then becomes the head. <code>add</code> has to walk to the last node (the one whose <code>next</code> is <code>null</code>) first. Do not forget the empty list, where <code>head</code> is <code>null</code>. The shorthand <code>{ value, next: null }</code> means <code>{ value: value, next: null }</code>.',
  starter:'class LinkedList {\n  constructor() {\n    this.head = null;\n  }\n  // add(value), addFirst(value), toArray()\n}\n',
  answer:'class LinkedList {\n  constructor() {\n    this.head = null;\n  }\n  add(value) {\n    const node = { value, next: null };\n    if (this.head === null) {\n      this.head = node;\n      return;\n    }\n    let last = this.head;\n    while (last.next !== null) {\n      last = last.next;\n    }\n    last.next = node;\n  }\n  addFirst(value) {\n    this.head = { value, next: this.head };\n  }\n  toArray() {\n    const out = [];\n    let n = this.head;\n    while (n !== null) {\n      out.push(n.value);\n      n = n.next;\n    }\n    return out;\n  }\n}',
  check:c=>{const L=c.vars.LinkedList;if(typeof L!=='function')return 'Keep the class called LinkedList.';const l=new L();
    for(const m of ['add','addFirst','toArray'])if(typeof l[m]!=='function')return `The list needs a ${m}() method.`;
    if(l.head!==null)return 'A new list is empty, so head should start as null.';
    if(!eqs(c,l.toArray(),[]))return 'An empty list\'s toArray() should be [].';
    l.add(1);l.add(2);l.add(3);
    if(!eqs(c,l.toArray(),[1,2,3]))return 'After add(1), add(2), add(3), toArray() should give [1, 2, 3]. Got '+c.show(l.toArray())+'.';
    l.addFirst(0);
    if(!eqs(c,l.toArray(),[0,1,2,3]))return 'addFirst(0) should put 0 at the start: [0, 1, 2, 3]. Got '+c.show(l.toArray())+'.';
    return l.head&&l.head.value===0&&l.head.next&&l.head.next.value===1?true:'Build the list from nodes shaped { value, next }, with head pointing at the first one.'}},
 {title:'Reverse the chain',goal:'Write <code>reverse(head)</code> that flips every arrow so the chain runs backwards, and returns the <b>new head</b>. Reversing <code>1 → 2 → 3</code> gives <code>3 → 2 → 1</code>.',
  explain:'Walk the chain with three pointers: <code>prev</code> (starts <code>null</code>), the current node, and the next one. At each node, first save <code>current.next</code>, then point <code>current.next</code> at <code>prev</code>, then step forward. When you run off the end, <code>prev</code> is the new head. Save the next node <b>before</b> you overwrite the arrow.',
  starter:'function reverse(head) {\n  // return the new head\n}\n',
  answer:'function reverse(head) {\n  let prev = null;\n  let current = head;\n  while (current !== null) {\n    const next = current.next;\n    current.next = prev;\n    prev = current;\n    current = next;\n  }\n  return prev;\n}',
  check:c=>F(c,'reverse',f=>{const t=[[],[7],[1,2],[1,2,3,4,5]];
    for(const a of t){const g=f(c.list(a));const want=[...a].reverse();const got=c.toArr(g);
      if(!eqs(c,got,want))return `Reversing ${c.show(a)} should give ${c.show(want)}, but walking the result gave ${c.show(got)}.`;
      if(want.length&&g.next!==undefined){let n=g,k=0;while(n&&k++<50)n=n.next;if(n!==null)return 'The last node of the reversed chain must point at null.'}}
    return true})}
 ]},
{name:'Maps & sets',badge:'Hash Wizard',intro:'A <code>Map</code> stores pairs: look up a <b>key</b>, get its <b>value</b>, almost instantly, no matter how many pairs there are. A <code>Set</code> stores unique values and answers "is it in here?" just as fast. Both use a trick called hashing (turning the key into a number that says where to look), so searching a huge pile takes about the same time as searching a tiny one.',
 learned:['Map set/get/has','Set add/has','counting with a Map','spotting duplicates','looking up a partner'],
 missions:[
 {title:'Name tags',goal:'Create a <code>Map</code> called <code>ages</code>. Store <code>"ada"</code> → <code>36</code> and <code>"bo"</code> → <code>29</code>, then print Ada\'s age by looking her up.',
  anat:[['ages','var'],['.set','fn'],['("ada", 36)','str']],
  explain:'<code>map.set(key, value)</code> stores a pair, and <code>map.get(key)</code> finds the value again. Setting an existing key replaces its value. A missing key gives <code>undefined</code>.',
  starter:'const ages = new Map();\n',answer:'const ages = new Map();\nages.set("ada", 36);\nages.set("bo", 29);\nprint(ages.get("ada"));',
  check:c=>{const m=c.vars.ages;if(!(m instanceof Map))return 'ages must stay a Map, made with new Map().';
    if(m.size!==2||m.get('ada')!==36||m.get('bo')!==29)return 'ages should hold exactly two pairs: ada → 36 and bo → 29.';
    return c.printed('36')&&has(c,/\.get\(/)?true:'Print the result of ages.get("ada"). It should show 36.'}},
 {title:'Is it in here?',goal:'Add <code>3</code>, <code>5</code> and <code>3</code> again to the Set <code>seen</code>. Then print <code>seen.size</code> on one line and <code>seen.has(5)</code> on the next.',
  explain:'A Set keeps each value <b>once</b>. Adding something it already has changes nothing. <code>has</code> answers true or false.',
  starter:'const seen = new Set();\n',answer:'const seen = new Set();\nseen.add(3);\nseen.add(5);\nseen.add(3);\nprint(seen.size);\nprint(seen.has(5));',
  check:c=>{const s=c.vars.seen;if(!(s instanceof Set))return 'seen must stay a Set.';
    if(!eqs(c,s,new Set([3,5])))return 'seen should hold 3 and 5, once each.';
    return c.lines[0]==='2'&&c.lines[1]==='true'?true:'The console should show 2, then true.'}},
 {title:'Count the words',goal:'Write <code>countWords(text)</code> that returns a <code>Map</code> from each word to how many times it appears. Words are separated by single spaces, upper and lower case count as the same word, and empty text has no words.',
  explain:'The plan: cut the text into words, then count each one. <code>text.split(" ")</code> cuts text into an array of words at every space, and <code>toLowerCase()</code> makes every letter small so "A" and "a" match. For each word: if the Map has it, store <code>count + 1</code>, otherwise store <code>1</code>. <code>(map.get(w) || 0) + 1</code> does both in one go, because <code>x || 0</code> means "x, or 0 if x is missing". Careful: <code>"".split(" ")</code> gives <code>[""]</code>, one empty word!',
  starter:'function countWords(text) {\n  const counts = new Map();\n  // fill counts, then return it\n  return counts;\n}\n',
  answer:'function countWords(text) {\n  const counts = new Map();\n  if (text === "") return counts;\n  for (const word of text.toLowerCase().split(" ")) {\n    counts.set(word, (counts.get(word) || 0) + 1);\n  }\n  return counts;\n}',
  check:c=>F(c,'countWords',f=>{const t=[['the cat the hat',[['the',2],['cat',1],['hat',1]]],['A a A',[['a',3]]],['go',[['go',1]]],['',[]]];
    for(const [s,p] of t){const g=f(s);if(!(g instanceof Map))return 'countWords should return a Map.';if(!eqs(c,g,new Map(p)))return `countWords(${JSON.stringify(s)}) should give ${c.show(new Map(p))}, but gave ${c.show(g)}.`}return true})},
 {title:'First repeat',goal:'Write <code>firstRepeat(items)</code> that returns the first item that has <b>already appeared</b> earlier in the array, or <code>undefined</code> if there are no repeats. It has to stay fast on a very long array, so do not search the array again for every item.',
  explain:'Keep a Set of everything you have seen so far. For each item: if the Set has it, that is your answer; otherwise add it. One pass (a single trip through the array), and each check is instant.',
  starter:'function firstRepeat(items) {\n  // return the first item we see for the second time\n}\n',
  answer:'function firstRepeat(items) {\n  const seen = new Set();\n  for (const item of items) {\n    if (seen.has(item)) return item;\n    seen.add(item);\n  }\n  return undefined;\n}',
  check:c=>F(c,'firstRepeat',f=>{const t=[[[1,2,3,2,1],2],[['a','b'],undefined],[[5,5],5],[[],undefined],[[4,1,4,1],4],[['x','y','y','x'],'y']];
    for(const [a,w] of t){const g=f([...a]);if(g!==w)return `firstRepeat(${c.show(a)}) should give ${c.show(w)}, but gave ${c.show(g)}.`}
    const big=Array.from({length:20000},(_,i)=>i);big.push(0);
    try{if(f(big)!==0)return 'Wrong answer on a long array.'}catch(e){return e.message==='LOOP_LIMIT'?'Right answers, but too slow on a long array. Remember what you have seen in a Set instead of searching the array again and again.':'Your code crashed on a long array: '+e.message}
    return true})},
 {title:'Two numbers that add up',goal:'Write <code>twoSum(nums, target)</code> that finds two <b>different positions</b> whose numbers add up to <code>target</code>, and returns them as <code>[i, j]</code> with <code>i &lt; j</code>. If there is no such pair, return <code>null</code>. It has to stay fast on a very long array, so do not check every pair.',
  explain:'For each number, its partner is <code>target - number</code>. Keep a Map from every number you have passed to its position. If the partner is already in the Map, you are done. Checking every pair works for small arrays, but it gets very slow on big ones.',
  starter:'function twoSum(nums, target) {\n  // return [i, j] or null\n}\n',
  answer:'function twoSum(nums, target) {\n  const where = new Map();\n  for (let j = 0; j < nums.length; j++) {\n    const partner = target - nums[j];\n    if (where.has(partner)) return [where.get(partner), j];\n    where.set(nums[j], j);\n  }\n  return null;\n}',
  check:c=>F(c,'twoSum',f=>{const t=[[[2,7,11,15],9,[0,1]],[[3,2,4],6,[1,2]],[[1,2],10,null],[[3,3],6,[0,1]],[[5],10,null],[[1,5,3,9],12,[2,3]]];
    for(const [a,n,w] of t){const g=f([...a],n);if(!eqs(c,g,w))return `twoSum(${c.show(a)}, ${n}) should give ${c.show(w)}, but gave ${c.show(g)}.`}
    const big=Array.from({length:20000},(_,i)=>i*2);big.push(7);
    try{const g=f(big,40001);if(!eqs(c,g,[19997,20000]))return 'Wrong answer on a long array.'}catch(e){return e.message==='LOOP_LIMIT'?'Right on small arrays, but too slow on a long one. Look each number\'s partner up in a Map instead of checking every pair.':'Your code crashed on a long array: '+e.message}
    return true})}
 ]},
{name:'Trees',badge:'Canopy Climber',intro:'A tree is a linked list where each node can point to more than one next node. In a <b>binary tree</b> every node has at most two children, called <code>left</code> and <code>right</code>. The top node is the <b>root</b>, and nodes with no children are <b>leaves</b>. Folders on your computer and the page structure of a website are trees.',
 learned:['node { value, left, right }','height','recursion','binary search tree','insert','in-order walk','search'],
 missions:[
 {title:'Plant a tree',goal:'Build a tree in a variable called <code>root</code>: the root holds <code>8</code>, its <code>left</code> child holds <code>3</code> and its <code>right</code> child holds <code>10</code>. The two children are leaves, so their own <code>left</code> and <code>right</code> are <code>null</code>.',
  explain:'A tree node is an object with three fields: <code>value</code>, <code>left</code> and <code>right</code>. Missing children are <code>null</code>, just like the end of a linked list.',
  starter:'const leftChild = { value: 3, left: null, right: null };\n// add the right child, then the root\n',
  answer:'const leftChild = { value: 3, left: null, right: null };\nconst rightChild = { value: 10, left: null, right: null };\nconst root = { value: 8, left: leftChild, right: rightChild };',
  check:c=>{const r=c.vars.root;if(!r||typeof r!=='object')return 'Make a variable called root that holds the top node.';
    const leaf=(n,v)=>n&&n.value===v&&n.left===null&&n.right===null;
    return r.value===8&&leaf(r.left,3)&&leaf(r.right,10)?true:'root should hold 8, with a left leaf holding 3 and a right leaf holding 10. Leaves have left: null and right: null.'}},
 {title:'How tall is it?',goal:'Write <code>height(node)</code> that returns how many nodes are on the <b>longest path</b> from <code>node</code> down to a leaf. An empty tree (<code>null</code>) has height <code>0</code>, and a single node has height <code>1</code>.',
  explain:'This is a job for recursion: a function that calls itself on a smaller piece. Each child is itself a smaller tree, so <code>height</code> can call <code>height</code> on it. The height of a node is <code>1 +</code> the taller of its two children\'s heights (<code>Math.max(a, b)</code> gives the bigger of two numbers). When you reach <code>null</code>, stop and answer <code>0</code>. That one stopping rule is called the <b>base case</b>.',
  starter:'function height(node) {\n  // base case first: what is the height of null?\n}\n',
  answer:'function height(node) {\n  if (node === null) return 0;\n  return 1 + Math.max(height(node.left), height(node.right));\n}',
  check:c=>F(c,'height',f=>{const n=c.node;const t=[[null,0],[n(1),1],[n(1,n(2,n(3))),3],[n(1,n(2),n(3,null,n(4,null,n(5)))),4],[n(1,null,n(2)),2]];
    for(const [tr,w] of t){const g=f(tr);if(g!==w)return `A tree of height ${w} gave ${c.show(g)}.`}return true})},
 {title:'Insert into a search tree',goal:'In a <b>binary search tree</b>, smaller values go left and bigger values go right. Write <code>insert(root, value)</code> that adds <code>value</code> in the right place and returns the root. Inserting into <code>null</code> returns a new node. Ignore duplicates (a value that is already in the tree).',
  explain:'Start at the root and compare. Smaller: go to the left child. Bigger: go to the right child. When the spot you want is <code>null</code>, put the new node there. Writing it recursively is short: <code>node.left = insert(node.left, value)</code>.',
  starter:'function insert(root, value) {\n  // return the root of the tree\n}\n\nlet tree = null;\nfor (const v of [5, 3, 8, 1, 4]) {\n  tree = insert(tree, v);\n}\n',
  answer:'function insert(root, value) {\n  if (root === null) {\n    return { value, left: null, right: null };\n  }\n  if (value < root.value) {\n    root.left = insert(root.left, value);\n  } else if (value > root.value) {\n    root.right = insert(root.right, value);\n  }\n  return root;\n}\n\nlet tree = null;\nfor (const v of [5, 3, 8, 1, 4]) {\n  tree = insert(tree, v);\n}',
  check:c=>F(c,'insert',f=>{let t=null;for(const v of [5,3,8,1,4])t=f(t,v);
    if(!t||t.value!==5)return 'Inserting 5 into an empty tree should make 5 the root.';
    if(!(t.left&&t.left.value===3&&t.right&&t.right.value===8&&t.left.left&&t.left.left.value===1&&t.left.right&&t.left.right.value===4))return 'Inserting 5, 3, 8, 1, 4 should give root 5, with 3 and 8 below it, and 1 and 4 below the 3.';
    if(f(null,7)===null)return 'insert(null, 7) should return a new node, not null.';
    f(t,5);f(t,4);if(!c.eq(c.inorder(t),[1,3,4,5,8]))return 'Inserting a value that is already there should change nothing.';
    let u=null;for(const v of [9,2,7,1,12,5])u=f(u,v);
    return c.eq(c.inorder(u),[1,2,5,7,9,12])?true:'After inserting 9, 2, 7, 1, 12, 5 the values should read 1, 2, 5, 7, 9, 12 from left to right.'})},
 {title:'Read it in order',goal:'Write <code>inorder(node)</code> that returns an array of all the values: the <b>left</b> subtree (the smaller tree hanging off the node\'s left child) first, then the node itself, then the <b>right</b> subtree. On a search tree this gives sorted values.',
  explain:'Again the recursive shape: get the left subtree\'s values, add this node\'s value, then the right subtree\'s values. <code>[...inorder(node.left), node.value, ...inorder(node.right)]</code> says it all: <code>...list</code> spreads an array\'s items out into the new array. An empty tree gives <code>[]</code>.',
  starter:'function inorder(node) {\n  // return an array of values\n}\n',
  answer:'function inorder(node) {\n  if (node === null) return [];\n  return [...inorder(node.left), node.value, ...inorder(node.right)];\n}',
  check:c=>F(c,'inorder',f=>{const n=c.node;const t=[[null,[]],[n(4),[4]],[n(2,n(1),n(3)),[1,2,3]],[n(1,n(2),n(3)),[2,1,3]],[n(5,n(3,n(1),n(4)),n(8)),[1,3,4,5,8]]];
    for(const [tr,w] of t){const g=f(tr);if(!eqs(c,g,w))return `Expected ${c.show(w)} but got ${c.show(g)}. Order is left subtree, then the node, then the right subtree.`}return true})},
 {title:'Find a value',goal:'Write <code>contains(root, value)</code> for a binary search tree. It returns <code>true</code> if the value is in the tree and <code>false</code> if not.',
  explain:'You do not need to look everywhere. If the value is smaller than the current node, it can only be on the left. If bigger, only on the right. In a tree that is reasonably even (not one long lopsided branch), each step throws away about half the tree, which is why search trees are fast.',
  starter:'function contains(root, value) {\n  // true or false\n}\n',
  answer:'function contains(root, value) {\n  let node = root;\n  while (node !== null) {\n    if (value === node.value) return true;\n    node = value < node.value ? node.left : node.right;\n  }\n  return false;\n}',
  check:c=>F(c,'contains',f=>{const n=c.node;const tr=n(5,n(3,n(1),n(4)),n(8,n(7),n(9)));
    for(const [v,w] of [[5,true],[1,true],[7,true],[9,true],[6,false],[10,false],[0,false],[2,false]]){const g=f(tr,v);if(g!==w)return `contains(tree, ${v}) should be ${w}, but gave ${c.show(g)}.`}
    return f(null,3)===false?true:'contains(null, 3) should be false: an empty tree has nothing in it.'})}
 ]}
];

const RANKS=[[0,'Array Apprentice'],[60,'Stack Builder'],[140,'List Linker'],[220,'Map Maker'],[300,'Tree Climber'],[380,'Structure Sage']];

/* ch: chapter index that teaches it (the question opens once every mission of that chapter is done), c: code, w: three wrong answers,
   why: shown after a miss. The right answer is found by running c. */
const QF=[
 {ch:0,c:'const a = [10, 20, 30];\nprint(a[1]);',w:['10','30','undefined'],why:'Counting starts at 0, so a[1] is the second box.'},
 {ch:0,c:'const a = [1, 2, 3];\na.push(4);\nprint(a.length);',w:['3','5','undefined'],why:'push adds one more box at the end, so there are 4.'},
 {ch:0,c:'const a = ["x", "y", "z"];\nprint(a.pop());\nprint(a.length);',w:['y\n2','z\n3','x\n2'],why:'pop removes and returns the last item (z), leaving 2.'},
 {ch:0,c:'const a = [1, 2, 3];\nprint(a[3]);',w:['3','0','2'],why:'Boxes are 0, 1, 2. Reading a box that does not exist gives undefined.'},
 {ch:1,c:'const s = [];\ns.push("a");\ns.push("b");\nprint(s.pop());',w:['a','ab','undefined'],why:'A stack gives back the last thing in first: b.'},
 {ch:2,c:'const q = [1, 2, 3];\nq.shift();\nprint(q.length);',w:['3','1','undefined'],why:'shift removes the front item, so 2 are left.'},
 {ch:2,c:'const q = ["a", "b"];\nq.push("c");\nprint(q.shift());',w:['c','b','undefined'],why:'A queue serves the oldest item first: a.'},
 {ch:4,c:'const m = new Map();\nm.set("a", 1);\nm.set("a", 2);\nprint(m.size);',w:['2','0','undefined'],why:'Setting an existing key replaces its value. Still one pair.'},
 {ch:4,c:'const s = new Set();\ns.add(1);\ns.add(2);\ns.add(2);\ns.add(3);\nprint(s.size);',w:['4','2','1'],why:'A Set keeps each value once: 1, 2, 3.'},
 {ch:4,c:'const m = new Map();\nm.set("x", 5);\nprint(m.get("y"));',w:['null','0','5'],why:'Looking up a missing key gives undefined.'},
 {ch:3,c:'const b = { value: 2, next: null };\nconst a = { value: 1, next: b };\nprint(a.next.value);',w:['1','null','undefined'],why:'a.next is node b, so a.next.value is 2.'},
 {ch:3,c:'const b = { value: 2, next: null };\nconst a = { value: 1, next: b };\nb.value = 9;\nprint(a.next.value);',w:['2','1','undefined'],why:'a.next is node b itself, not a copy. Change b and a sees it.'},
 {ch:5,c:'const t = {\n  value: 5,\n  left: { value: 3, left: null, right: null },\n  right: null\n};\nprint(t.left.value);',w:['5','null','undefined'],why:'t.left is the node holding 3.'},
 {ch:5,c:'const t = { value: 5, left: null, right: null };\nprint(t.left === null);',w:['false','null','undefined'],why:'A leaf has no left child, so left is null.'},
 {ch:3,c:'const a = [3, 1, 2];\nconst b = a;\nb.push(9);\nprint(a.length);',w:['3','2','undefined'],why:'b = a does not copy the row: both names point at the same boxes, so a sees the push.'},
 {ch:4,c:'const s = new Set();\ns.add("h");\ns.add("e");\ns.add("l");\ns.add("l");\ns.add("o");\nprint(s.size);',w:['5','3','2'],why:'The five adds are h, e, l, l, o. The two l\'s count once: 4.'}
];

/* ch: chapter index, c: the syntax, what: one line, syn: anatomy tokens, ex: [code, comment] pairs */
const GUIDE=[
 {ch:0,c:'[a, b, c]',what:'An array: an ordered row of boxes, numbered from 0.',syn:[['const','kw'],['row','var'],['=','op'],['[10, 20, 30]','num','array']],ex:[['const row = [10, 20, 30];\nprint(row[0], row[2]);','10 30'],['const row = [10, 20, 30];\nprint(row.length);','3']]},
 {ch:0,c:'push  pop',what:'push adds to the end. pop removes from the end and gives it back.',syn:[['row','var'],['.push','fn'],['(4)','num']],ex:[['const row = [1, 2];\nrow.push(3);\nprint(row.pop(), row);','3 [1, 2]']]},
 {ch:0,c:'for (const x of row)',what:'Visit every item once, in order.',syn:[['for','kw'],['(const x of row)','var']],ex:[['let total = 0;\nfor (const n of [4, 5, 6]) {\n  total += n;\n}\nprint(total);','15']]},
 {ch:1,c:'stack: push + pop',what:'Last in, first out. Both actions happen at the same end.',syn:[['stack','var'],['.push','fn'],['(x)','var']],ex:[['const stack = [];\nstack.push("a");\nstack.push("b");\nprint(stack.pop());','b'],['class Stack {\n  constructor() { this.items = []; }\n  push(x) { this.items.push(x); }\n}\nconst s = new Stack();\ns.push(1);\ns.push(2);','see it in the Structure view']]},
 {ch:1,c:'peek',what:'Look at the top without taking it: read the last index.',syn:[['stack','var'],['[stack.length - 1]','num']],ex:[['const stack = [1, 2, 3];\nprint(stack[stack.length - 1], stack.length);','3 3']]},
 {ch:2,c:'queue: push + shift',what:'First in, first out. Join at the back, leave from the front.',syn:[['line','var'],['.shift','fn'],['()','br']],ex:[['const line = ["Ada", "Bo"];\nline.push("Cy");\nprint(line.shift(), line);','Ada [Bo, Cy]']]},
 {ch:2,c:'rotate',what:'Move the front to the back: push(shift()).',syn:[['q.push','fn'],['(q.shift())','br']],ex:[['const q = [1, 2, 3];\nq.push(q.shift());\nprint(q);','[2, 3, 1]']]},
 {ch:3,c:'{ value, next }',what:'A linked list node. next is another node, or null at the end.',syn:[['{ value: 1,','num'],['next: other','var'],['}','br']],ex:[['const b = { value: 2, next: null };\nconst a = { value: 1, next: b };','see the chain']]},
 {ch:3,c:'walk a chain',what:'Move a pointer along with node = node.next until it is null.',syn:[['while','kw'],['(node !== null)','var']],ex:[['const head = { value: 1, next: { value: 2, next: null } };\nlet node = head;\nwhile (node !== null) {\n  print(node.value);\n  node = node.next;\n}','1 then 2']]},
 {ch:4,c:'new Map()',what:'Key → value pairs with fast lookup. set, get, has, size. delete removes a pair.',syn:[['m.set','fn'],['("k", 1)','str']],ex:[['const m = new Map();\nm.set("hp", 10);\nprint(m.get("hp"), m.has("mp"), m.get("mp"));','10 false undefined']]},
 {ch:4,c:'new Set()',what:'Unique values with fast "is it here?". add, has, size. delete removes a value.',syn:[['s.add','fn'],['(3)','num']],ex:[['const s = new Set([1, 2, 2, 3]);\nprint(s.size, s.has(2));','3 true'],['const unique = [...new Set([5, 5, 6, 5])];\nprint(unique);','[5, 6]']]},
 {ch:5,c:'{ value, left, right }',what:'A binary tree node. Missing children are null.',syn:[['{ value: 5,','num'],['left: a, right: b','var'],['}','br']],ex:[['const root = {\n  value: 5,\n  left: { value: 3, left: null, right: null },\n  right: { value: 8, left: null, right: null }\n};','see the tree']]},
 {ch:5,c:'recursion on a tree',what:'Handle null first, then combine the answers from left and right.',syn:[['if (node === null)','kw','base case'],['return 0','num']],ex:[['function count(node) {\n  if (node === null) return 0;\n  return 1 + count(node.left) + count(node.right);\n}\nprint(count({ value: 1, left: { value: 2, left: null, right: null }, right: null }));','2']]}
];

/* The quick-fire questions a learner may see: only those whose chapter has every mission done in `done` (the saved S.done). */
const qfOpen=done=>QF.filter(q=>CH[q.ch].missions.every((_,i)=>done&&done[q.ch+'.'+i]));

D.CH=CH;D.RANKS=RANKS;D.QF=QF;D.GUIDE=GUIDE;D.qfOpen=qfOpen;
})();
