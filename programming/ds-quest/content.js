/* Data Structures Quest: chapters, missions, quick-fire and field guide. Plain data, so Node can test every mission. */
(()=>{
'use strict';
const D=globalThis.DSQ=globalThis.DSQ||{};
// Runs f with the learner's function called `name`, or says what is missing.
const F=(c,name,f)=>{const g=c.fn(name);return g?f(g):`Define a function called ${name}. The starter code shows its shape.`};
const eqs=(c,got,want)=>c.eq(got,want);
const has=(c,re)=>re.test(c.code);

const CH=[
{name:'Arrays',badge:'Brass Tag',story:'Mo\'s first riddle sits in box 0 of the umbrella shelf, so you count and read the boxes by number to find a brass tag marked 0.',intro:'Retired keeper Mo hid the Golden Key of the lost-and-found warehouse behind a trail of riddle cards, and the first card is in box 0 of the umbrella shelf. A data structure is a way of arranging values so a program can use them well. The first three missions use JavaScript. From mission 0.3 you pick a language: JavaScript, Python, C++ or Rust. The first structure is the array: a numbered row of boxes, like that shelf. Each box holds one value, and the numbers start at 0, not 1. Many other structures are built on top of it.',
 learned:['[ ]','index [i]','.length','.push()','.pop()','loops over arrays'],
 missions:[
 {title:'Build a row',goal:'Juno wants to know who is on the crew today. Create an array called <code>staff</code> with <b>three names</b> in it (Mo, Juno and Clatter the crow), then print how many names it holds using <code>.length</code>.',
  anat:[['const','kw'],['staff','var'],['=','op'],['["Mo", "Juno", "Clatter"]','str','array']],
  explain:'The whole line gives a name to a row of three names. A variable is a name for a value: <code>const staff = ...</code> makes one called <code>staff</code> (<code>const</code> locks the name: it cannot be pointed at something else later). Text goes inside quotes, like <code>"Mo"</code>. Square brackets create an array and commas separate the items. The dot reaches a tool that belongs to the array, and <code>.length</code> is the one that counts the items. A <code>;</code> ends an instruction, like a full stop; lines that only open or close a <code>{ }</code> block do not need one. Use <code>print(...)</code> (or <code>console.log(...)</code>) to show things in the console.',
  note:'After you press Run, look at the Structure view on the right: your array appears as a row of numbered boxes.',
  starter:'// Type your code below\n',answer:'const staff = ["Mo", "Juno", "Clatter"];\nprint(staff.length);',
  check:c=>{const a=c.vars.staff;if(!Array.isArray(a))return 'Make a variable called staff that holds an array, like const staff = ["Mo", "Juno", "Clatter"];';
    if(a.length!==3||!a.every(x=>typeof x==='string'))return 'staff needs exactly three names, written as text in quotes.';
    return c.printed('3')&&has(c,/\.length/)?true:'Print staff.length so the console shows 3.'},
  scriptStep:true,
  visual:{kind:'operate',scene:'row',start:[],task:'Fill the empty row with the three crew names, Mo first, then Juno, then Clatter. Each push drops a name into a new box at the end.',
   buttons:[{label:'push Mo',op:'push',arg:{value:'Mo'}},{label:'push Juno',op:'push',arg:{value:'Juno'}},{label:'push Clatter',op:'push',arg:{value:'Clatter'}}],
   goal:{snapshot:['Mo','Juno','Clatter']},
   ref:[{op:'push',arg:{value:'Mo'}},{op:'push',arg:{value:'Juno'}},{op:'push',arg:{value:'Clatter'}}],
   wrong:[{op:'push',arg:{value:'Clatter'}},{op:'push',arg:{value:'Juno'}},{op:'push',arg:{value:'Mo'}}],
   lazy:[{op:'push',arg:{value:'Mo'}},{op:'push',arg:{value:'Mo'}},{op:'push',arg:{value:'Mo'}}]},
  how:['An array is a row of numbered boxes. Each box holds one value.','Start with an empty row, then add the names one at a time, in the order you want them.','The names go in quotes, and the whole row goes in square brackets, with commas between the names.','To count the crew, ask the row for its length.']},
 {title:'Pick a box',goal:'The umbrella shelf has four boxes, and Mo\'s riddles sit in the first and last boxes. Print the <b>first</b> umbrella, then the <b>last</b> one, each on its own line. Use an index (the box number) for each, and work the last one out from <code>.length</code> so it still works if the shelf grows.',
  anat:[['umbrellas','var'],['[','br'],['0','num'],[']','br']],
  explain:'The first box is number <code>0</code>. The last box is number <code>length - 1</code>, because counting started at 0. Reading a box that does not exist gives <code>undefined</code> (JavaScript\'s word for "nothing there"), not an error.',
  starter:'const umbrellas = ["red", "green", "blue", "gold"];\n',answer:'const umbrellas = ["red", "green", "blue", "gold"];\nprint(umbrellas[0]);\nprint(umbrellas[umbrellas.length - 1]);',
  check:c=>{const i=c.lines.indexOf('red'),j=c.lines.indexOf('gold');if(i<0||j<i)return 'The console should show red on one line, then gold on the next.';
    return has(c,/umbrellas\s*\[\s*0\s*\]/)&&(has(c,/umbrellas\s*\[\s*umbrellas\.length\s*-\s*1\s*\]/)||has(c,/\.at\(\s*-1\s*\)/))?true:'Do not type the names. Read them out of the array with umbrellas[0] and umbrellas[umbrellas.length - 1].'},
  scriptStep:true,
  visual:{kind:'operate',scene:'row',start:['red','green','blue','gold'],task:'Mo\'s riddle sits in the <b>last</b> box of the umbrella shelf. Read that box. The number of boxes is the length, so the last box is the length minus 1.',
   buttons:[{label:'read box 0',op:'read',arg:{i:0}},{label:'read box 1',op:'read',arg:{i:1}},{label:'read box 2',op:'read',arg:{i:2}},{label:'read box 3',op:'read',arg:{i:3}}],
   goal:{snapshot:['red','green','blue','gold'],result:'gold'},
   ref:[{op:'read',arg:{i:3}}],
   wrong:[{op:'read',arg:{i:2}}],
   lazy:[{op:'read',arg:{i:0}}]},
  how:['Every box has a number, and the numbers start at 0, so the first box is box 0.','To read a box, give its number in square brackets after the array name.','The row knows how many boxes it has: that is its length.','Boxes start at 0, so the last box is the length minus 1.']},
 {title:'Add and remove',goal:'Clatter wants to slip a <code>"lantern"</code> into Juno\'s bag for a moment. Use <code>push</code> to add it to the end of <code>bag</code>, then use <code>pop</code> to take the last item off again and print what <code>pop</code> gave you.',
  anat:[['bag','var'],['.push','fn'],['("lantern")','str']],
  explain:'<code>push</code> adds to the <b>end</b> of an array. <code>pop</code> removes the end item and <b>hands it back</b>, so you can print or keep it. <code>const</code> locks the name, not the contents, so <code>push</code> and <code>pop</code> still work on <code>bag</code>.',
  starter:'const bag = ["scarf", "mitten"];\n',answer:'const bag = ["scarf", "mitten"];\nbag.push("lantern");\nconst last = bag.pop();\nprint(last);',
  check:c=>{if(!has(c,/\.push\(/)||!has(c,/\.pop\(/))return 'Use bag.push(...) to add and bag.pop() to remove.';
    if(!eqs(c,c.vars.bag,['scarf','mitten']))return 'After pushing and popping, bag should be back to ["scarf", "mitten"].';
    return c.printed('lantern')?true:'Print the value that pop gave back. It should be lantern.'},
  scriptStep:true,
  visual:{kind:'operate',scene:'row',start:['scarf','mitten'],task:'Slip the lantern into the bag, then take the last thing out again and see what comes back. The bag should end up as it began.',
   buttons:[{label:'push lantern',op:'push',arg:{value:'lantern'}},{label:'push candle',op:'push',arg:{value:'candle'}},{label:'unshift lantern',op:'unshift',arg:{value:'lantern'}},{label:'pop',op:'pop'}],
   goal:{snapshot:['scarf','mitten'],result:'lantern'},
   ref:[{op:'push',arg:{value:'lantern'}},{op:'pop'}],
   wrong:[{op:'push',arg:{value:'candle'}},{op:'pop'}],
   lazy:[{op:'pop'}]},
  how:['Adding to the end of an array is called push, and it makes the row one box longer.','Taking from the end is called pop. It removes the last item and hands it back to you.','Pop always takes the last item, so push the lantern first and it is the one that comes off.','The bag ends up as it started, and the value pop handed back is what you print.']},
 {title:'Walk the row',goal:'Each box on the shelf holds a claim number, and Mo\'s riddle wants their total. Write a function (a named recipe) <code>sum(nums)</code> that returns the total of all the numbers in the array. An empty array adds up to <code>0</code>.',
  explain:'A function is a named recipe: you hand it values (here <code>nums</code>, the array to add up) and it gives one answer back with <code>return</code>. To visit every box, loop over the array: <code>for (const n of nums) { ... }</code> gives you each value in turn. Keep a running total in a variable made with <code>let</code> (unlike <code>const</code>, a <code>let</code> variable can change), and update it inside the loop with <code>total += n</code>, which means "add <code>n</code> onto <code>total</code>".',
  note:'A function sends its answer back with <code>return</code>.',
  how:['A function is a named recipe: you hand it values, and it hands one answer back.','Start a running total at 0. An empty row adds up to 0, so this is also the answer for no boxes.','Visit every box in the row, and add each number onto the total.','When every box has been visited, give the total back.'],
  visual:{kind:'predict',scene:'row',start:[14,9,21,6],task:'Follow the walk along the shelf of claim numbers, one box at a time, and say what the running total will be after each box you add.',
   steps:[{op:'read',arg:{i:0}},{op:'read',arg:{i:1}},{op:'read',arg:{i:2}},{op:'read',arg:{i:3}}],
   pauses:[
    {step:1,ask:'The total is 14 after box 0. Box 1 holds 9. What is the total once box 1 is added?',of:'total',choices:[9,14,23,32]},
    {step:2,ask:'Box 2 holds 21. What is the total once box 2 is added?',of:'total',choices:[21,23,44,65]},
    {step:3,ask:'Last box: it holds 6. What is the total now, with every box added?',of:'total',choices:[6,44,50,56]}]},
  practice:{fn:{name:'sum',sig:{args:[['nums','ints']],ret:'int'},tests:[{args:[[1,2,3]],want:6},{args:[[]],want:0},{args:[[-5,5,10]],want:10},{args:[[100]],want:100}]},
   langs:{
    js:{starter:'function sum(nums) {\n  // add up every number in nums\n}\n',answer:'function sum(nums) {\n  let total = 0;\n  for (const n of nums) {\n    total += n;\n  }\n  return total;\n}',
     wrong:'function sum(nums) {\n  let total = 0;\n  for (let i = 1; i < nums.length; i++) {\n    total += nums[i];\n  }\n  return total;\n}',lazy:'function sum(nums) {\n  return 6;\n}'},
    py:{starter:'# your function is named sum, so it hides Python\'s own sum(): add the items up with a loop\ndef sum(nums):\n    pass\n',answer:'def sum(nums):\n    total = 0\n    for n in nums:\n        total += n\n    return total',
     wrong:'def sum(nums):\n    total = 0\n    for i in range(1, len(nums)):\n        total += nums[i]\n    return total',lazy:'def sum(nums):\n    return 6'},
    cpp:{starter:'#include <iostream>\n#include <vector>\n#include <string>\nusing namespace std;\n\nint sum(vector<int> nums) {\n  // add up every number in nums\n  return 0;\n}\n',
     answer:'#include <iostream>\n#include <vector>\n#include <string>\nusing namespace std;\n\nint sum(vector<int> nums) {\n  int total = 0;\n  for (int n : nums) {\n    total += n;\n  }\n  return total;\n}',
     wrong:'#include <iostream>\n#include <vector>\n#include <string>\nusing namespace std;\n\nint sum(vector<int> nums) {\n  int total = 0;\n  for (int i = 1; i < nums.size(); i++) {\n    total += nums[i];\n  }\n  return total;\n}',
     lazy:'#include <iostream>\n#include <vector>\n#include <string>\nusing namespace std;\n\nint sum(vector<int> nums) {\n  return 6;\n}'},
    rs:{starter:'fn sum(nums: Vec<i32>) -> i32 {\n    // add up every number in nums\n    0\n}\n',answer:'fn sum(nums: Vec<i32>) -> i32 {\n    let mut total = 0;\n    for n in nums.iter() {\n        total += *n;\n    }\n    total\n}',
     wrong:'fn sum(nums: Vec<i32>) -> i32 {\n    let mut total = 0;\n    for i in 1..nums.len() {\n        total += nums[i];\n    }\n    total\n}',lazy:'fn sum(nums: Vec<i32>) -> i32 {\n    6\n}'}}}},
 {title:'Find the biggest',goal:'The riddle on the brass tag asks for the biggest claim number on the shelf. Write <code>largest(nums)</code> that returns the biggest number in a non-empty array.',
  explain:'Remember the best value so far, then compare every box against it: <code>if (n &gt; best) best = n;</code> changes <code>best</code> only when the test <code>n &gt; best</code> (is <code>n</code> bigger?) is true. Start from the <b>first</b> item, not from <code>0</code>: what if every number is negative?',
  visual:{kind:'predict',scene:'row',start:[7,3,12,5],task:'Walk along the shelf of claim numbers one box at a time, and say which number is the biggest seen so far after each box.',
   steps:[{op:'read',arg:{i:0}},{op:'read',arg:{i:1}},{op:'read',arg:{i:2}},{op:'read',arg:{i:3}}],
   pauses:[
    {step:1,ask:'The biggest after box 0 is 7. Box 1 holds 3. What is the biggest so far now?',of:'max',choices:[3,7,12]},
    {step:2,ask:'Box 2 holds 12. What is the biggest so far now?',of:'max',choices:[7,12,19]},
    {step:3,ask:'Last box: it holds 5. What is the biggest so far, with every box seen?',of:'max',choices:[5,12,17]}]},
  how:['Keep one number in your head: the biggest seen so far.','Start it as the first box, not as 0, because every number on the shelf could be negative.','Look at each box in turn. When a box is bigger than your number, swap it in.','When every box has been seen, your number is the answer.'],
  practice:{fn:{name:'largest',sig:{args:[['nums','ints']],ret:'int'},tests:[{args:[[3,9,2]],want:9},{args:[[-4,-2,-8]],want:-2},{args:[[7]],want:7},{args:[[1,5,5,2]],want:5}]},
   langs:{
    js:{starter:'function largest(nums) {\n  // return the biggest number\n}\n',answer:'function largest(nums) {\n  let best = nums[0];\n  for (const n of nums) {\n    if (n > best) best = n;\n  }\n  return best;\n}',
     wrong:'function largest(nums) {\n  let best = 0;\n  for (const n of nums) {\n    if (n > best) best = n;\n  }\n  return best;\n}',lazy:'function largest(nums) {\n  return 9;\n}'},
    py:{starter:'def largest(nums):\n    pass\n',answer:'def largest(nums):\n    best = nums[0]\n    for n in nums:\n        if n > best:\n            best = n\n    return best',
     wrong:'def largest(nums):\n    best = 0\n    for n in nums:\n        if n > best:\n            best = n\n    return best',lazy:'def largest(nums):\n    return 9'},
    cpp:{starter:'#include <iostream>\n#include <vector>\n#include <string>\nusing namespace std;\n\nint largest(vector<int> nums) {\n  // return the biggest number\n  return 0;\n}\n',
     answer:'#include <iostream>\n#include <vector>\n#include <string>\nusing namespace std;\n\nint largest(vector<int> nums) {\n  int best = nums[0];\n  for (int n : nums) {\n    if (n > best) best = n;\n  }\n  return best;\n}',
     wrong:'#include <iostream>\n#include <vector>\n#include <string>\nusing namespace std;\n\nint largest(vector<int> nums) {\n  int best = 0;\n  for (int n : nums) {\n    if (n > best) best = n;\n  }\n  return best;\n}',
     lazy:'#include <iostream>\n#include <vector>\n#include <string>\nusing namespace std;\n\nint largest(vector<int> nums) {\n  return 9;\n}'},
    rs:{starter:'fn largest(nums: Vec<i32>) -> i32 {\n    // return the biggest number\n    0\n}\n',answer:'fn largest(nums: Vec<i32>) -> i32 {\n    let mut best = nums[0];\n    for n in nums.iter() {\n        if *n > best {\n            best = *n;\n        }\n    }\n    best\n}',
     wrong:'fn largest(nums: Vec<i32>) -> i32 {\n    let mut best = 0;\n    for n in nums.iter() {\n        if *n > best {\n            best = *n;\n        }\n    }\n    best\n}',lazy:'fn largest(nums: Vec<i32>) -> i32 {\n    9\n}'}}}}
 ]},
{name:'Stacks',badge:'Red Ticket',story:'Clatter has toppled the hat-box pile, so you lift boxes off from the top in the right order and check each riddle bracket is closed, to find a red ticket.',intro:'The brass tag points to the hat-box pile, but Clatter the crow has toppled it, and the riddle card is somewhere in the heap. A stack is a pile of boxes: you add a box on top, and you take a box from the top. The last box you put on is the first one off: <b>last in, first out</b>. Undo buttons and the browser back button work this way.',
 learned:['push / pop','peek','LIFO','class Stack','matching brackets'],
 missions:[
 {title:'A pile of hat boxes',goal:'Write <code>takeOff(boxes)</code>. Put every box onto a stack with <code>push</code>, then pop the stack until it is empty, and return the boxes in the order they came off. For example <code>[1, 2, 3]</code> gives <code>[3, 2, 1]</code>, and an empty pile gives <code>[]</code>.',
  explain:'An array already behaves like a stack if you only use <code>push</code> and <code>pop</code>. Both work at the <b>end</b>, which is the top of the pile of hat boxes.',
  how:['A stack is a pile: push puts a box on top, and pop takes the top box off.','Go through the boxes in order and push each one onto the pile. The last box ends up on top.','Then take boxes off the top, one for each box you pushed, and write each one down as it comes off.','The last box in is the first one out, so the list you wrote down is the boxes in reverse.'],
  visual:{kind:'operate',scene:'pile',start:[],task:'Stack the hat boxes in the order <code>red</code>, <code>green</code>, <code>blue</code> so that blue ends up on top. Pushing puts a box on top, and popping takes the top one off.',
   buttons:[{label:'push red',op:'push',arg:{value:'red'}},{label:'push green',op:'push',arg:{value:'green'}},{label:'push blue',op:'push',arg:{value:'blue'}},{label:'pop',op:'pop'}],
   goal:{snapshot:['red','green','blue']},
   ref:[{op:'push',arg:{value:'red'}},{op:'push',arg:{value:'green'}},{op:'push',arg:{value:'blue'}}],
   wrong:[{op:'push',arg:{value:'blue'}},{op:'push',arg:{value:'green'}},{op:'push',arg:{value:'red'}}],
   lazy:[{op:'push',arg:{value:'red'}},{op:'push',arg:{value:'red'}},{op:'push',arg:{value:'red'}}]},
  practice:{fn:{name:'takeOff',sig:{args:[['boxes','ints']],ret:'ints'},tests:[{args:[[1,2,3]],want:[3,2,1]},{args:[[5]],want:[5]},{args:[[]],want:[]},{args:[[4,9]],want:[9,4]}]},
   langs:{
    js:{starter:'function takeOff(boxes) {\n  // push every box on a stack, then pop them all off\n}\n',answer:'function takeOff(boxes) {\n  const stack = [];\n  for (const b of boxes) {\n    stack.push(b);\n  }\n  const out = [];\n  for (const b of boxes) {\n    out.push(stack.pop());\n  }\n  return out;\n}',
     wrong:'function takeOff(boxes) {\n  const stack = [];\n  for (const b of boxes) {\n    stack.push(b);\n  }\n  const out = [];\n  for (const b of boxes) {\n    out.push(stack.pop());\n  }\n  out.pop();\n  return out;\n}',lazy:'function takeOff(boxes) {\n  return boxes;\n}'},
    py:{starter:'def take_off(boxes):\n    # push every box on a stack, then pop them all off\n    pass\n',answer:'def take_off(boxes):\n    stack = []\n    for b in boxes:\n        stack.append(b)\n    out = []\n    for b in boxes:\n        out.append(stack.pop())\n    return out',
     wrong:'def take_off(boxes):\n    stack = []\n    for b in boxes:\n        stack.append(b)\n    out = []\n    for b in boxes:\n        out.append(stack.pop())\n    out.pop()\n    return out',lazy:'def take_off(boxes):\n    return boxes'},
    cpp:{starter:'#include <iostream>\n#include <vector>\n#include <string>\nusing namespace std;\n\nvector<int> takeOff(vector<int> boxes) {\n  // push every box on a stack, then pop them all off\n  vector<int> out;\n  return out;\n}\n',
     answer:'#include <iostream>\n#include <vector>\n#include <string>\nusing namespace std;\n\nvector<int> takeOff(vector<int> boxes) {\n  vector<int> stack;\n  for (int b : boxes) {\n    stack.push_back(b);\n  }\n  vector<int> out;\n  for (int b : boxes) {\n    out.push_back(stack.back());\n    stack.pop_back();\n  }\n  return out;\n}',
     wrong:'#include <iostream>\n#include <vector>\n#include <string>\nusing namespace std;\n\nvector<int> takeOff(vector<int> boxes) {\n  vector<int> stack;\n  for (int b : boxes) {\n    stack.push_back(b);\n  }\n  vector<int> out;\n  for (int b : boxes) {\n    out.push_back(stack.back());\n    stack.pop_back();\n  }\n  if (out.size() > 0) {\n    out.pop_back();\n  }\n  return out;\n}',
     lazy:'#include <iostream>\n#include <vector>\n#include <string>\nusing namespace std;\n\nvector<int> takeOff(vector<int> boxes) {\n  return boxes;\n}'},
    rs:{starter:'fn take_off(boxes: Vec<i32>) -> Vec<i32> {\n    // push every box on a stack, then pop them all off\n    Vec::new()\n}\n',answer:'fn take_off(boxes: Vec<i32>) -> Vec<i32> {\n    let mut stack: Vec<i32> = Vec::new();\n    for b in boxes.iter() {\n        stack.push(*b);\n    }\n    let mut out: Vec<i32> = Vec::new();\n    for _ in boxes.iter() {\n        out.push(stack.pop().unwrap());\n    }\n    out\n}',
     wrong:'fn take_off(boxes: Vec<i32>) -> Vec<i32> {\n    let mut stack: Vec<i32> = Vec::new();\n    for b in boxes.iter() {\n        stack.push(*b);\n    }\n    let mut out: Vec<i32> = Vec::new();\n    for _ in boxes.iter() {\n        out.push(stack.pop().unwrap());\n    }\n    out.pop();\n    out\n}',lazy:'fn take_off(boxes: Vec<i32>) -> Vec<i32> {\n    boxes\n}'}}}},
 {title:'Peek, do not take',goal:'Write <code>peek(items)</code>. It returns two numbers in an array: the top item, then how many items the stack holds. The stack is not changed. For example <code>[10, 20, 30]</code> gives <code>[30, 3]</code>. An empty stack has no top, so the result is <code>[-1, 0]</code>.',
  explain:'Looking at the top without taking it is called <b>peek</b>. With an array, the top is the item at the last index. Using <code>pop</code> would remove it, so read it with an index instead.',
  how:['Peek means looking at the top box without taking it. Nothing moves, so the pile stays as it is.','The top is the last box in the row, so you can read it by its number.','You need two answers, the top and then the size. Put them together in a list of two numbers.','An empty pile has no top, so answer -1 for the top and 0 for the size.'],
  visual:{kind:'operate',scene:'pile',start:[10,20,30],task:'Mo thinks the riddle is in the top box. Look at the top box without taking it, so the pile stays as it is.',
   buttons:[{label:'peek',op:'peek'},{label:'pop',op:'pop'}],
   goal:{snapshot:[10,20,30],result:30},
   ref:[{op:'peek'}],
   wrong:[{op:'pop'},{op:'pop'}],
   lazy:[{op:'pop'}]},
  practice:{nothing:-1,fn:{name:'peek',sig:{args:[['items','ints']],ret:'ints'},tests:[{args:[[10,20,30]],want:[30,3]},{args:[[7]],want:[7,1]},{args:[[4,9]],want:[9,2]},{args:[[]],want:[-1,0]}]},
   langs:{
    js:{starter:'function peek(items) {\n  // return [top item, how many items]\n}\n',answer:'function peek(items) {\n  if (items.length > 0) {\n    return [items[items.length - 1], items.length];\n  }\n  return [-1, 0];\n}',
     wrong:'function peek(items) {\n  if (items.length > 0) {\n    return [items[0], items.length];\n  }\n  return [-1, 0];\n}',lazy:'function peek(items) {\n  const top = items.pop();\n  return [top, items.length];\n}'},
    py:{starter:'def peek(items):\n    # return [top item, how many items]\n    pass\n',answer:'def peek(items):\n    if len(items) > 0:\n        return [items[len(items) - 1], len(items)]\n    return [-1, 0]',
     wrong:'def peek(items):\n    if len(items) > 0:\n        return [items[0], len(items)]\n    return [-1, 0]',lazy:'def peek(items):\n    top = items.pop()\n    return [top, len(items)]'},
    cpp:{starter:'#include <iostream>\n#include <vector>\n#include <string>\nusing namespace std;\n\nvector<int> peek(vector<int> items) {\n  // return {top item, how many items}\n  vector<int> out;\n  return out;\n}\n',
     answer:'#include <iostream>\n#include <vector>\n#include <string>\nusing namespace std;\n\nvector<int> peek(vector<int> items) {\n  vector<int> out;\n  if (items.size() > 0) {\n    out.push_back(items[items.size() - 1]);\n    out.push_back(items.size());\n    return out;\n  }\n  out.push_back(-1);\n  out.push_back(0);\n  return out;\n}',
     wrong:'#include <iostream>\n#include <vector>\n#include <string>\nusing namespace std;\n\nvector<int> peek(vector<int> items) {\n  vector<int> out;\n  if (items.size() > 0) {\n    out.push_back(items[0]);\n    out.push_back(items.size());\n    return out;\n  }\n  out.push_back(-1);\n  out.push_back(0);\n  return out;\n}',
     lazy:'#include <iostream>\n#include <vector>\n#include <string>\nusing namespace std;\n\nvector<int> peek(vector<int> items) {\n  vector<int> out;\n  out.push_back(items.back());\n  items.pop_back();\n  out.push_back(items.size());\n  return out;\n}'},
    rs:{starter:'fn peek(items: Vec<i32>) -> Vec<i32> {\n    // return [top item, how many items]\n    Vec::new()\n}\n',answer:'fn peek(items: Vec<i32>) -> Vec<i32> {\n    if items.len() > 0 {\n        return vec![items[items.len() - 1], items.len() as i32];\n    }\n    vec![-1, 0]\n}',
     wrong:'fn peek(items: Vec<i32>) -> Vec<i32> {\n    if items.len() > 0 {\n        return vec![items[0], items.len() as i32];\n    }\n    vec![-1, 0]\n}',lazy:'fn peek(mut items: Vec<i32>) -> Vec<i32> {\n    let top = items.pop().unwrap();\n    vec![top, items.len() as i32]\n}'}}}},
 {title:'Build a Stack class',goal:'Juno wants a tidy pile that never topples. Finish the <code>Stack</code> class with the methods (the actions a class can do) <code>push(x)</code>, <code>pop()</code>, <code>peek()</code>, <code>isEmpty()</code> and <code>size()</code>.',
  explain:'A class bundles data with the actions on it. <code>constructor</code> runs when you make a new one with <code>new Stack()</code>, and <code>this</code> means "this stack", so the items live in <code>this.items</code>. Each action is a method, written like a small function inside the class. A real stack hides the array so users only get the stack actions. <code>isEmpty()</code> can test <code>this.items.length === 0</code>, where <code>===</code> asks "is it exactly equal?". An empty <code>pop()</code> or <code>peek()</code> has nothing to hand back, so it should return <code>-1</code> (the value the tests expect), not <code>undefined</code>.',
  how:['A stack class is a small bundle: a list of items kept inside, and the actions push, pop, peek, isEmpty and size that work on that list.','Push puts a new item at the end of the list. Pop takes the last item off and hands it back. Peek hands back the last item but leaves it where it is.','IsEmpty asks whether the list has nothing in it, and size says how many items it holds.','On an empty stack there is nothing to hand back, so pop and peek answer -1.'],
  visual:{kind:'operate',scene:'pile',start:[],task:'A stack class keeps its items in an array underneath, and the number under each box is that array\'s index. Push 5, then push 8, then pop, so that only <code>5</code> is left and pop hands back <code>8</code>.',
   buttons:[{label:'push 5',op:'push',arg:{value:5}},{label:'push 8',op:'push',arg:{value:8}},{label:'pop',op:'pop'},{label:'peek',op:'peek'}],
   goal:{snapshot:[5],result:8},
   ref:[{op:'push',arg:{value:5}},{op:'push',arg:{value:8}},{op:'pop'}],
   wrong:[{op:'push',arg:{value:8}},{op:'push',arg:{value:5}},{op:'pop'}],
   lazy:[{op:'push',arg:{value:5}},{op:'push',arg:{value:8}}]},
  note:'Want to see it work? Add <code>const s = new Stack(); s.push(1);</code> below the class and run it. The Structure view shows what <code>s</code> holds.',
  practice:{nothing:-1,cls:{name:'Stack',methods:{push:{args:[['x','int']],ret:'void'},pop:{args:[],ret:'int'},peek:{args:[],ret:'int'},isEmpty:{args:[],ret:'bool'},size:{args:[],ret:'int'}},
    tests:[
     [{m:'isEmpty',args:[],want:true},{m:'size',args:[],want:0},{m:'push',args:[1]},{m:'push',args:[2]},{m:'push',args:[3]},{m:'size',args:[],want:3},{m:'isEmpty',args:[],want:false},{m:'peek',args:[],want:3},{m:'size',args:[],want:3},{m:'pop',args:[],want:3},{m:'pop',args:[],want:2},{m:'size',args:[],want:1},{m:'peek',args:[],want:1},{m:'pop',args:[],want:1},{m:'isEmpty',args:[],want:true}],
     [{m:'pop',args:[],want:-1},{m:'peek',args:[],want:-1},{m:'size',args:[],want:0}]]},
   langs:{
    js:{starter:'class Stack {\n  constructor() {\n    this.items = [];\n  }\n  // add push, pop, peek, isEmpty and size\n}\n',
     answer:'class Stack {\n  constructor() {\n    this.items = [];\n  }\n  push(x) {\n    this.items.push(x);\n  }\n  pop() {\n    if (this.items.length === 0) {\n      return -1;\n    }\n    return this.items.pop();\n  }\n  peek() {\n    if (this.items.length === 0) {\n      return -1;\n    }\n    return this.items[this.items.length - 1];\n  }\n  isEmpty() {\n    return this.items.length === 0;\n  }\n  size() {\n    return this.items.length;\n  }\n}',
     wrong:'class Stack {\n  constructor() {\n    this.items = [];\n  }\n  push(x) {\n    this.items.push(x);\n  }\n  pop() {\n    if (this.items.length === 0) {\n      return -1;\n    }\n    return this.items.pop();\n  }\n  peek() {\n    if (this.items.length === 0) {\n      return -1;\n    }\n    return this.items[0];\n  }\n  isEmpty() {\n    return this.items.length === 0;\n  }\n  size() {\n    return this.items.length;\n  }\n}',
     lazy:'class Stack {\n  constructor() {\n    this.items = [];\n  }\n  push(x) {\n    this.items.push(x);\n  }\n  pop() {\n    return 3;\n  }\n  peek() {\n    return 3;\n  }\n  isEmpty() {\n    return false;\n  }\n  size() {\n    return 3;\n  }\n}'},
    rs:{starter:'struct Stack {\n    items: Vec<i32>,\n}\n\nimpl Stack {\n    fn new() -> Stack {\n        Stack { items: Vec::new() }\n    }\n    // add push, pop, peek, is_empty and size\n}\n',
     answer:'struct Stack {\n    items: Vec<i32>,\n}\n\nimpl Stack {\n    fn new() -> Stack {\n        Stack { items: Vec::new() }\n    }\n    fn push(&mut self, x: i32) {\n        self.items.push(x);\n    }\n    fn pop(&mut self) -> i32 {\n        match self.items.pop() {\n            Some(v) => v,\n            None => -1,\n        }\n    }\n    fn peek(&self) -> i32 {\n        if self.items.len() == 0 {\n            return -1;\n        }\n        self.items[self.items.len() - 1]\n    }\n    fn is_empty(&self) -> bool {\n        self.items.len() == 0\n    }\n    fn size(&self) -> i32 {\n        self.items.len() as i32\n    }\n}',
     wrong:'struct Stack {\n    items: Vec<i32>,\n}\n\nimpl Stack {\n    fn new() -> Stack {\n        Stack { items: Vec::new() }\n    }\n    fn push(&mut self, x: i32) {\n        self.items.push(x);\n    }\n    fn pop(&mut self) -> i32 {\n        match self.items.pop() {\n            Some(v) => v,\n            None => -1,\n        }\n    }\n    fn peek(&self) -> i32 {\n        if self.items.len() == 0 {\n            return -1;\n        }\n        self.items[0]\n    }\n    fn is_empty(&self) -> bool {\n        self.items.len() == 0\n    }\n    fn size(&self) -> i32 {\n        self.items.len() as i32\n    }\n}',
     lazy:'struct Stack {\n    items: Vec<i32>,\n}\n\nimpl Stack {\n    fn new() -> Stack {\n        Stack { items: Vec::new() }\n    }\n    fn push(&mut self, x: i32) {\n        self.items.push(x);\n    }\n    fn pop(&mut self) -> i32 {\n        3\n    }\n    fn peek(&self) -> i32 {\n        3\n    }\n    fn is_empty(&self) -> bool {\n        false\n    }\n    fn size(&self) -> i32 {\n        3\n    }\n}'}}}},
 {title:'Are the brackets balanced?',goal:'Mo wrote every riddle in brackets, and Clatter has scrambled some. Write <code>balanced(text)</code>. It returns <code>true</code> when every <code>(</code> <code>[</code> <code>{</code> is closed by the matching bracket in the right order, and <code>false</code> otherwise. Other characters are ignored.',
  explain:'Walk through the text. When you see an <b>opening</b> bracket, push it. When you see a <b>closing</b> one, the top of the stack must be its partner: pop it, or fail. At the end the stack must be empty. The most recent opener has to close first, which is exactly what a stack gives you.',
  note:'A handy tool is <code>pairs</code>, an object (a lookup table) like <code>{ ")": "(" }</code>, where <code>pairs[")"]</code> gives <code>"("</code>. If <code>pairs[ch]</code> finds nothing it is <code>undefined</code>, which <code>if</code> treats as false, so only closing brackets pass. <code>!==</code> asks "is it different?". <code>||</code> means "or": true if either side is. <code>else if</code> is the next test, tried only if the earlier one failed. <code>for (const ch of text)</code> visits one character at a time, <code>if</code> runs its block only when its test is true, and <code>return false</code> stops the function right there.',
  how:['Walk through the text one character at a time. Anything that is not a bracket can be ignored.','When you meet an opening bracket, put it on the pile. When you meet a closing bracket, the top of the pile has to be its partner, so take it off and compare.','If the pile is empty at a closing bracket, or the top is the wrong partner, the text is not balanced.','At the end the pile must be empty. Any opener left over was never closed.'],
  visual:{kind:'predict',scene:'pile',start:[],task:'Check the brackets <code>{[()()]}</code> from left to right. Each opening bracket goes on the pile, and each closing bracket takes the top box off.',
   steps:[{op:'push',arg:{value:'{'}},{op:'push',arg:{value:'['}},{op:'push',arg:{value:'('}},{op:'pop'},{op:'push',arg:{value:'('}},{op:'pop'},{op:'pop'},{op:'pop'}],
   pauses:[
    {step:3,ask:'The next character is ). Which opener comes off?',of:'result',choices:['(','[','{']},
    {step:6,ask:'The next character is ]. Which opener comes off?',of:'result',choices:['(','[','{']},
    {step:7,ask:'The last character } takes the bottom box off. How many boxes are left? The text is balanced only when it is 0.',of:'size',choices:[0,1,2]}]},
  practice:{fn:{name:'balanced',sig:{args:[['text','str']],ret:'bool'},tests:[{args:[''],want:true},{args:['()'],want:true},{args:['([]{})'],want:true},{args:['a(b)c'],want:true},{args:['(]'],want:false},{args:['(('],want:false},{args:[')('],want:false},{args:['([)]'],want:false},{args:['}'],want:false},{args:['{[()()]}'],want:true}]},
   langs:{
    js:{starter:'function balanced(text) {\n  // use a stack (an array with push and pop)\n}\n',
     answer:'function balanced(text) {\n  const pairs = { ")": "(", "]": "[", "}": "{" };\n  const stack = [];\n  for (const ch of text) {\n    if (ch === "(" || ch === "[" || ch === "{") {\n      stack.push(ch);\n    } else if (pairs[ch]) {\n      if (stack.pop() !== pairs[ch]) return false;\n    }\n  }\n  return stack.length === 0;\n}',
     wrong:'function balanced(text) {\n  const pairs = { ")": "(", "]": "[", "}": "{" };\n  const stack = [];\n  for (const ch of text) {\n    if (ch === "(" || ch === "[" || ch === "{") {\n      stack.push(ch);\n    } else if (pairs[ch]) {\n      stack.pop();\n    }\n  }\n  return stack.length === 0;\n}',
     lazy:'function balanced(text) {\n  return true;\n}'},
    py:{starter:'def balanced(text):\n    # use a stack (a list with append and pop)\n    pass\n',
     answer:'def balanced(text):\n    pairs = {")": "(", "]": "[", "}": "{"}\n    stack = []\n    for ch in text:\n        if ch == "(" or ch == "[" or ch == "{":\n            stack.append(ch)\n        elif ch in pairs:\n            if len(stack) == 0 or stack.pop() != pairs[ch]:\n                return False\n    return len(stack) == 0',
     wrong:'def balanced(text):\n    pairs = {")": "(", "]": "[", "}": "{"}\n    stack = []\n    for ch in text:\n        if ch == "(" or ch == "[" or ch == "{":\n            stack.append(ch)\n        elif ch in pairs:\n            if len(stack) > 0:\n                stack.pop()\n    return len(stack) == 0',
     lazy:'def balanced(text):\n    return True'},
    cpp:{starter:'#include <iostream>\n#include <vector>\n#include <string>\nusing namespace std;\n\nbool balanced(string text) {\n  // use a stack (a vector with push_back and pop_back)\n  return false;\n}\n',
     answer:'#include <iostream>\n#include <vector>\n#include <string>\nusing namespace std;\n\nbool balanced(string text) {\n  vector<char> stack;\n  for (char ch : text) {\n    if (ch == \'(\' || ch == \'[\' || ch == \'{\') {\n      stack.push_back(ch);\n    } else if (ch == \')\' || ch == \']\' || ch == \'}\') {\n      if (stack.size() == 0) {\n        return false;\n      }\n      char top = stack.back();\n      stack.pop_back();\n      if ((ch == \')\' && top != \'(\') || (ch == \']\' && top != \'[\') || (ch == \'}\' && top != \'{\')) {\n        return false;\n      }\n    }\n  }\n  return stack.size() == 0;\n}',
     wrong:'#include <iostream>\n#include <vector>\n#include <string>\nusing namespace std;\n\nbool balanced(string text) {\n  vector<char> stack;\n  for (char ch : text) {\n    if (ch == \'(\' || ch == \'[\' || ch == \'{\') {\n      stack.push_back(ch);\n    } else if (ch == \')\' || ch == \']\' || ch == \'}\') {\n      if (stack.size() > 0) {\n        stack.pop_back();\n      }\n    }\n  }\n  return stack.size() == 0;\n}',
     lazy:'#include <iostream>\n#include <vector>\n#include <string>\nusing namespace std;\n\nbool balanced(string text) {\n  return true;\n}'},
    rs:{starter:'fn balanced(text: String) -> bool {\n    // use a stack (a Vec with push and pop)\n    false\n}\n',
     answer:'fn balanced(text: String) -> bool {\n    let mut stack: Vec<char> = Vec::new();\n    for ch in text.chars() {\n        if ch == \'(\' || ch == \'[\' || ch == \'{\' {\n            stack.push(ch);\n        } else if ch == \')\' || ch == \']\' || ch == \'}\' {\n            if stack.len() == 0 {\n                return false;\n            }\n            let top = stack.pop().unwrap();\n            if (ch == \')\' && top != \'(\') || (ch == \']\' && top != \'[\') || (ch == \'}\' && top != \'{\') {\n                return false;\n            }\n        }\n    }\n    stack.len() == 0\n}',
     wrong:'fn balanced(text: String) -> bool {\n    let mut stack: Vec<char> = Vec::new();\n    for ch in text.chars() {\n        if ch == \'(\' || ch == \'[\' || ch == \'{\' {\n            stack.push(ch);\n        } else if ch == \')\' || ch == \']\' || ch == \'}\' {\n            if stack.len() > 0 {\n                stack.pop();\n            }\n        }\n    }\n    stack.len() == 0\n}',
     lazy:'fn balanced(text: String) -> bool {\n    true\n}'}}}}
 ]},
{name:'Queues',badge:'Claim Slip',story:'The red ticket gets you a place in the claim-desk line; serve people in the order they came, and win Clatter\'s pass-the-parcel game, to find a stamped claim slip.',intro:'The red ticket gets you a place in the line at the claim desk, where the next riddle waits. A queue is a line at the desk. New people join at the back, and the person at the front is served first: <b>first in, first out</b>. Print jobs, message systems and the order a game processes turns all use queues.',
 learned:['enqueue / dequeue','shift','FIFO','class Queue','rotating a queue'],
 missions:[
 {title:'Join the line',goal:'Let <code>"Juno"</code>, <code>"Mo"</code> and <code>"Clatter"</code> join the claim-desk <code>line</code> in that order with <code>push</code>. Then serve the one at the front with <code>shift</code> (it removes the first item and hands it back) and print their name.',
  explain:'<code>push</code> adds at the back. <code>shift</code> removes from the <b>front</b> and hands the item back. Together they make a queue. Juno joined first, so Juno is served first.',
  starter:'const line = [];\n',answer:'const line = [];\nline.push("Juno");\nline.push("Mo");\nline.push("Clatter");\nprint(line.shift());',
  check:c=>has(c,/\.shift\(/)&&c.printed('Juno')&&eqs(c,c.vars.line,['Mo','Clatter'])?true:'Push Juno, Mo, Clatter, then print line.shift(). It prints Juno, and Mo and Clatter are still waiting.'},
 {title:'Build a Queue class',goal:'Give the claim desk a proper line. Finish the <code>Queue</code> class with <code>enqueue(x)</code>, <code>dequeue()</code>, <code>front()</code>, <code>isEmpty()</code> and <code>size()</code>.',
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
 {title:'Hot potato',goal:'Clatter will only hand over the claim slip if you win its pass-the-parcel game. Everyone stands in a queue and passes a parcel. Write <code>hotPotato(names, n)</code>: the one at the front passes it <b>n times</b> (each pass moves the front one to the back), then whoever is at the front is out. Repeat until one is left, and return that winner\'s name.',
  explain:'This is a queue game. One pass is <code>queue.push(queue.shift())</code>: take the front, add it to the back. After <code>n</code> passes, a plain <code>queue.shift()</code> removes the one who is out. Loop while more than one player remains: <code>while (queue.length &gt; 1)</code> repeats its block as long as its test is true (<code>&gt;</code> means greater than). <code>for (let i = 0; i &lt; n; i++)</code> repeats its block <code>n</code> times. Between its brackets sit three parts separated by <code>;</code>: start <code>i</code> at 0, keep going while <code>i &lt; n</code> (<code>&lt;</code> means less than), and add 1 after each round with <code>i++</code>.',
  note:'Example: <code>hotPotato(["Mo","Juno","Clatter","Pip"], 2)</code> returns <code>"Mo"</code>.',
  starter:'function hotPotato(names, n) {\n  const queue = [...names]; // [...names] makes a copy, so the original is left alone\n  // keep going until one name is left\n}\n',
  answer:'function hotPotato(names, n) {\n  const queue = [...names];\n  while (queue.length > 1) {\n    for (let i = 0; i < n; i++) {\n      queue.push(queue.shift());\n    }\n    queue.shift();\n  }\n  return queue[0];\n}',
  check:c=>F(c,'hotPotato',f=>{const ref=(a,n)=>{const q=[...a];let i=0;while(q.length>1){i=(i+n)%q.length;q.splice(i,1)}return q[0]};
    const t=[[['A','B','C','D'],2],[['Mo','Juno','Clatter','Pip','Tess'],3],[['x'],5],[['p','q'],1],[['a','b','c','d','e','f','g'],0]];
    for(const [a,n] of t){const g=f([...a],n);if(g!==ref(a,n))return `hotPotato(${c.show(a)}, ${n}) should return ${c.show(ref(a,n))}, but gave ${c.show(g)}.`}return true})}
 ]},
{name:'Linked lists',badge:'Ledger Key Tag',story:'Each luggage tag in the corridor names the next one, so you follow them one by one, then turn the trail around, to find the ledger-room key tag.',intro:'The claim slip leads down the luggage-tag corridor, where every tag names the next. A linked list is a chain of nodes, like those tags. Each node holds a value and a pointer (an arrow saying where the next node is) to the next node, and the last node points to <code>null</code>. You cannot jump to the middle: you start at the <b>head</b> and follow the arrows, one node at a time.',
 learned:['node { value, next }','head','walking a chain','null as the end','reversing pointers'],
 missions:[
 {title:'Link three nodes',goal:'Hang three luggage tags in a chain, <code>1 → 2 → 3</code>, in a variable called <code>head</code>. Each node is an object (a small bundle of named fields) with a <code>value</code> and a <code>next</code>. <code>null</code> means "nothing here", so the last node\'s <code>next</code> is <code>null</code>.',
  anat:[['{ value: 1,','num'],['next:','var'],['{ ... }','br','the next node'],['}','br']],
  explain:'A node is an object. The <code>next</code> field holds <b>another node</b> (that very node, not a copy of it), or <code>null</code> when there is no more. Build it from the inside out: write the last node first.',
  note:'After running, the Structure view draws your chain with arrows.',
  starter:'const third = { value: 3, next: null };\n// make the second node point at third,\n// then make head point at the second\n',
  answer:'const third = { value: 3, next: null };\nconst second = { value: 2, next: third };\nconst head = { value: 1, next: second };',
  check:c=>{const h=c.vars.head;if(!h||typeof h!=='object')return 'Make a variable called head that holds the first node.';
    return h.value===1&&h.next&&h.next.value===2&&h.next.next&&h.next.next.value===3&&h.next.next.next===null?true:'head should be 1 → 2 → 3, and the last node\'s next must be null.'}},
 {title:'Walk the chain',goal:'How long is the tag trail? Write <code>length(node)</code> that counts the nodes in a chain, starting from <code>node</code>. An empty chain (<code>null</code>) has length <code>0</code>.',
  explain:'Keep a pointer to the node you are on. While it is not <code>null</code>, count one and move to <code>node.next</code>. Moving the pointer forward is how every linked list loop works. <code>count++</code> adds 1 to <code>count</code>.',
  starter:'const head = { value: 1, next: { value: 2, next: { value: 3, next: null } } };\n\nfunction length(node) {\n  // count the nodes\n}\n\nprint(length(head));\n',
  answer:'const head = { value: 1, next: { value: 2, next: { value: 3, next: null } } };\n\nfunction length(node) {\n  let count = 0;\n  while (node !== null) {\n    count++;\n    node = node.next;\n  }\n  return count;\n}\n\nprint(length(head));',
  check:c=>F(c,'length',f=>{const t=[[null,0],[c.list([9]),1],[c.list([1,2,3]),3],[c.list([5,4,3,2,1,0,9]),7]];
    for(const [h,w] of t){const g=f(h);if(g!==w)return `A chain of ${w} node${w===1?'':'s'} should give ${w}, but length gave ${c.show(g)}.`}return true})},
 {title:'A LinkedList class',goal:'Clatter keeps adding tags to the corridor. Finish the <code>LinkedList</code> class. <code>add(value)</code> puts a new node at the <b>end</b>, <code>addFirst(value)</code> puts one at the <b>start</b>, and <code>toArray()</code> returns the values in order.',
  explain:'The list remembers only its <code>head</code>. <code>addFirst</code> is quick: the new node points at the old head, then becomes the head. <code>add</code> has to walk to the last node (the one whose <code>next</code> is <code>null</code>) first. Do not forget the empty list, where <code>head</code> is <code>null</code>. <code>return;</code> leaves the function early, handy once that case is handled. The shorthand <code>{ value, next: null }</code> means <code>{ value: value, next: null }</code>.',
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
 {title:'Reverse the chain',goal:'The ledger-room key tag is at the far end, so turn the trail around. Write <code>reverse(head)</code> that flips every arrow so the chain runs backwards, and returns the <b>new head</b>. Reversing <code>1 → 2 → 3</code> gives <code>3 → 2 → 1</code>.',
  explain:'Walk the chain with three pointers: <code>prev</code> (starts <code>null</code>), the current node, and the next one. At each node, first save <code>current.next</code>, then point <code>current.next</code> at <code>prev</code>, then step forward. When you run off the end, <code>prev</code> is the new head. Save the next node <b>before</b> you overwrite the arrow.',
  starter:'function reverse(head) {\n  // return the new head\n}\n',
  answer:'function reverse(head) {\n  let prev = null;\n  let current = head;\n  while (current !== null) {\n    const next = current.next;\n    current.next = prev;\n    prev = current;\n    current = next;\n  }\n  return prev;\n}',
  check:c=>F(c,'reverse',f=>{const t=[[],[7],[1,2],[1,2,3,4,5]];
    for(const a of t){const g=f(c.list(a));const want=[...a].reverse();const got=c.toArr(g);
      if(!eqs(c,got,want))return `Reversing ${c.show(a)} should give ${c.show(want)}, but walking the result gave ${c.show(got)}.`;
      if(want.length&&g.next!==undefined){let n=g,k=0;while(n&&k++<50)n=n.next;if(n!==null)return 'The last node of the reversed chain must point at null.'}}
    return true})}
 ]},
{name:'Maps & sets',badge:'Vault Door Number',story:'The ledger room lists every item by name, so you look things up by name instead of searching, count Mo\'s riddle words, and find the vault\'s door number.',intro:'The ledger room lists every lost item by name, so nobody has to search the shelves. A <code>Map</code> stores pairs: look up a <b>key</b>, get its <b>value</b>, almost instantly, no matter how many pairs there are. A <code>Set</code> stores unique values and answers "is it in here?" just as fast. Both use a trick called hashing (turning the key into a number that says where to look), so searching a huge pile takes about the same time as searching a tiny one.',
 learned:['Map set/get/has','Set add/has','counting with a Map','spotting duplicates','looking up a partner'],
 missions:[
 {title:'Name tags',goal:'Create a <code>Map</code> called <code>aisle</code> that says which aisle each item lives in. Store <code>"umbrella"</code> → <code>3</code> and <code>"hat"</code> → <code>7</code>, then print the umbrella\'s aisle by looking it up.',
  anat:[['aisle','var'],['.set','fn'],['("umbrella", 3)','str']],
  explain:'<code>map.set(key, value)</code> stores a pair, and <code>map.get(key)</code> finds the value again. Setting an existing key replaces its value. A missing key gives <code>undefined</code>.',
  starter:'const aisle = new Map();\n',answer:'const aisle = new Map();\naisle.set("umbrella", 3);\naisle.set("hat", 7);\nprint(aisle.get("umbrella"));',
  check:c=>{const m=c.vars.aisle;if(!(m instanceof Map))return 'aisle must stay a Map, made with new Map().';
    if(m.size!==2||m.get('umbrella')!==3||m.get('hat')!==7)return 'aisle should hold exactly two pairs: umbrella → 3 and hat → 7.';
    return c.printed('3')&&has(c,/\.get\(/)?true:'Print the result of aisle.get("umbrella"). It should show 3.'}},
 {title:'Is it in here?',goal:'The ledger notes each item\'s tag code. Add the codes <code>3</code>, <code>5</code> and <code>3</code> again to the Set <code>seen</code>. Then print <code>seen.size</code> on one line and <code>seen.has(5)</code> on the next.',
  explain:'A Set keeps each value <b>once</b>. Adding something it already has changes nothing. <code>has</code> answers true or false.',
  starter:'const seen = new Set();\n',answer:'const seen = new Set();\nseen.add(3);\nseen.add(5);\nseen.add(3);\nprint(seen.size);\nprint(seen.has(5));',
  check:c=>{const s=c.vars.seen;if(!(s instanceof Set))return 'seen must stay a Set.';
    if(!eqs(c,s,new Set([3,5])))return 'seen should hold 3 and 5, once each.';
    return c.lines[0]==='2'&&c.lines[1]==='true'?true:'The console should show 2, then true.'}},
 {title:'Count the words',goal:'Mo\'s riddles repeat favourite words. Write <code>countWords(text)</code> that returns a <code>Map</code> from each word to how many times it appears. Words are separated by single spaces, upper and lower case count as the same word, and empty text has no words.',
  explain:'The plan: cut the text into words, then count each one. <code>text.split(" ")</code> cuts text into an array of words at every space, and <code>toLowerCase()</code> makes every letter small so "A" and "a" match. For each word: if the Map has it, store <code>count + 1</code>, otherwise store <code>1</code>. <code>(map.get(w) || 0) + 1</code> does both in one go, because <code>x || 0</code> means "x, or 0 if x is missing". Careful: <code>"".split(" ")</code> gives <code>[""]</code>, one empty word!',
  starter:'function countWords(text) {\n  const counts = new Map();\n  // fill counts, then return it\n  return counts;\n}\n',
  answer:'function countWords(text) {\n  const counts = new Map();\n  if (text === "") return counts;\n  for (const word of text.toLowerCase().split(" ")) {\n    counts.set(word, (counts.get(word) || 0) + 1);\n  }\n  return counts;\n}',
  check:c=>F(c,'countWords',f=>{const t=[['the key the lock the key',[['the',3],['key',2],['lock',1]]],['A a A',[['a',3]]],['go',[['go',1]]],['',[]]];
    for(const [s,p] of t){const g=f(s);if(!(g instanceof Map))return 'countWords should return a Map.';if(!eqs(c,g,new Map(p)))return `countWords(${JSON.stringify(s)}) should give ${c.show(new Map(p))}, but gave ${c.show(g)}.`}return true})},
 {title:'First repeat',goal:'Clatter keeps handing in the same lost item twice. Write <code>firstRepeat(items)</code> that returns the first item that has <b>already appeared</b> earlier in the array, or <code>undefined</code> if there are no repeats. It has to stay fast on a very long array, so do not search the array again for every item.',
  explain:'Keep a Set of everything you have seen so far. For each item: if the Set has it, that is your answer; otherwise add it. One pass (a single trip through the array), and each check is instant.',
  starter:'function firstRepeat(items) {\n  // return the first item we see for the second time\n}\n',
  answer:'function firstRepeat(items) {\n  const seen = new Set();\n  for (const item of items) {\n    if (seen.has(item)) return item;\n    seen.add(item);\n  }\n  return undefined;\n}',
  check:c=>F(c,'firstRepeat',f=>{const t=[[[1,2,3,2,1],2],[['a','b'],undefined],[[5,5],5],[[],undefined],[[4,1,4,1],4],[['x','y','y','x'],'y']];
    for(const [a,w] of t){const g=f([...a]);if(g!==w)return `firstRepeat(${c.show(a)}) should give ${c.show(w)}, but gave ${c.show(g)}.`}
    const big=Array.from({length:20000},(_,i)=>i);big.push(0);
    try{if(f(big)!==0)return 'Wrong answer on a long array.'}catch(e){return e.message==='LOOP_LIMIT'?'Right answers, but too slow on a long array. Remember what you have seen in a Set instead of searching the array again and again.':'Your code crashed on a long array: '+e.message}
    return true})},
 {title:'Two numbers that add up',goal:'The vault\'s door number is the sum of two ledger entries. Write <code>twoSum(nums, target)</code> that finds two <b>different positions</b> whose numbers add up to <code>target</code>, and returns them as <code>[i, j]</code> with <code>i &lt; j</code>. If there is no such pair, return <code>null</code>. It has to stay fast on a very long array, so do not check every pair.',
  explain:'For each number, its partner is <code>target - number</code>. Keep a Map from every number you have passed to its position. If the partner is already in the Map, you are done. Checking every pair works for small arrays, but it gets very slow on big ones.',
  starter:'function twoSum(nums, target) {\n  // return [i, j] or null\n}\n',
  answer:'function twoSum(nums, target) {\n  const where = new Map();\n  for (let j = 0; j < nums.length; j++) {\n    const partner = target - nums[j];\n    if (where.has(partner)) return [where.get(partner), j];\n    where.set(nums[j], j);\n  }\n  return null;\n}',
  check:c=>F(c,'twoSum',f=>{const t=[[[2,7,11,15],9,[0,1]],[[3,2,4],6,[1,2]],[[1,2],10,null],[[3,3],6,[0,1]],[[5],10,null],[[1,5,3,9],12,[2,3]]];
    for(const [a,n,w] of t){const g=f([...a],n);if(!eqs(c,g,w))return `twoSum(${c.show(a)}, ${n}) should give ${c.show(w)}, but gave ${c.show(g)}.`}
    const big=Array.from({length:20000},(_,i)=>i*2);big.push(7);
    try{const g=f(big,40001);if(!eqs(c,g,[19997,20000]))return 'Wrong answer on a long array.'}catch(e){return e.message==='LOOP_LIMIT'?'Right on small arrays, but too slow on a long one. Look each number\'s partner up in a Map instead of checking every pair.':'Your code crashed on a long array: '+e.message}
    return true})}
 ]},
{name:'Trees',badge:'Golden Key',story:'The vault\'s drawers hang smaller-left, bigger-right, so you plant, sort and search them until you reach the drawer holding the Golden Key.',intro:'Behind the vault door, the drawers hang in a branching pattern, and the Golden Key is in one of them. A tree is a linked list where each node can point to more than one next node. In a <b>binary tree</b> every node has at most two children, called <code>left</code> and <code>right</code>. The top node is the <b>root</b>, and nodes with no children are <b>leaves</b>. Folders on your computer and the page structure of a website are trees.',
 learned:['node { value, left, right }','height','recursion','binary search tree','insert','in-order walk','search'],
 missions:[
 {title:'Plant a tree',goal:'Number the vault drawers as a tree in a variable called <code>root</code>: the root drawer holds <code>8</code>, its <code>left</code> child holds <code>3</code> and its <code>right</code> child holds <code>10</code>. The two children are leaves, so their own <code>left</code> and <code>right</code> are <code>null</code>.',
  explain:'A tree node is an object with three fields: <code>value</code>, <code>left</code> and <code>right</code>. Missing children are <code>null</code>, just like the end of a linked list.',
  starter:'const leftChild = { value: 3, left: null, right: null };\n// add the right child, then the root\n',
  answer:'const leftChild = { value: 3, left: null, right: null };\nconst rightChild = { value: 10, left: null, right: null };\nconst root = { value: 8, left: leftChild, right: rightChild };',
  check:c=>{const r=c.vars.root;if(!r||typeof r!=='object')return 'Make a variable called root that holds the top node.';
    const leaf=(n,v)=>n&&n.value===v&&n.left===null&&n.right===null;
    return r.value===8&&leaf(r.left,3)&&leaf(r.right,10)?true:'root should hold 8, with a left leaf holding 3 and a right leaf holding 10. Leaves have left: null and right: null.'}},
 {title:'How tall is it?',goal:'How many drawers deep does the vault go? Write <code>height(node)</code> that returns how many nodes are on the <b>longest path</b> from <code>node</code> down to a leaf. An empty tree (<code>null</code>) has height <code>0</code>, and a single node has height <code>1</code>.',
  explain:'This is a job for recursion: a function that calls itself on a smaller piece. Each child is itself a smaller tree, so <code>height</code> can call <code>height</code> on it. The height of a node is <code>1 +</code> the taller of its two children\'s heights (<code>Math.max(a, b)</code> gives the bigger of two numbers). When you reach <code>null</code>, stop and answer <code>0</code>. That one stopping rule is called the <b>base case</b>.',
  starter:'function height(node) {\n  // base case first: what is the height of null?\n}\n',
  answer:'function height(node) {\n  if (node === null) return 0;\n  return 1 + Math.max(height(node.left), height(node.right));\n}',
  check:c=>F(c,'height',f=>{const n=c.node;const t=[[null,0],[n(1),1],[n(1,n(2,n(3))),3],[n(1,n(2),n(3,null,n(4,null,n(5)))),4],[n(1,null,n(2)),2]];
    for(const [tr,w] of t){const g=f(tr);if(g!==w)return `A tree of height ${w} gave ${c.show(g)}.`}return true})},
 {title:'Insert into a search tree',goal:'Clatter keeps adding drawers. In a <b>binary search tree</b>, smaller values go left and bigger values go right. Write <code>insert(root, value)</code> that adds <code>value</code> in the right place and returns the root. Inserting into <code>null</code> returns a new node. Ignore duplicates (a value that is already in the tree).',
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
 {title:'Read it in order',goal:'Read the drawer numbers off in order. Write <code>inorder(node)</code> that returns an array of all the values: the <b>left</b> subtree (the smaller tree hanging off the node\'s left child) first, then the node itself, then the <b>right</b> subtree. On a search tree this gives sorted values.',
  explain:'Again the recursive shape: get the left subtree\'s values, add this node\'s value, then the right subtree\'s values. <code>[...inorder(node.left), node.value, ...inorder(node.right)]</code> says it all: <code>...list</code> spreads an array\'s items out into the new array. An empty tree gives <code>[]</code>.',
  starter:'function inorder(node) {\n  // return an array of values\n}\n',
  answer:'function inorder(node) {\n  if (node === null) return [];\n  return [...inorder(node.left), node.value, ...inorder(node.right)];\n}',
  check:c=>F(c,'inorder',f=>{const n=c.node;const t=[[null,[]],[n(4),[4]],[n(2,n(1),n(3)),[1,2,3]],[n(1,n(2),n(3)),[2,1,3]],[n(5,n(3,n(1),n(4)),n(8)),[1,3,4,5,8]]];
    for(const [tr,w] of t){const g=f(tr);if(!eqs(c,g,w))return `Expected ${c.show(w)} but got ${c.show(g)}. Order is left subtree, then the node, then the right subtree.`}return true})},
 {title:'Find a value',goal:'Is the drawer with the Golden Key in here? Write <code>contains(root, value)</code> for a binary search tree. It returns <code>true</code> if the value is in the tree and <code>false</code> if not.',
  explain:'You do not need to look everywhere. If the value is smaller than the current node, it can only be on the left. If bigger, only on the right. In a tree that is reasonably even (not one long lopsided branch), each step throws away about half the tree, which is why search trees are fast. <code>test ? a : b</code> means "if the test is true use <code>a</code>, otherwise <code>b</code>".',
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
