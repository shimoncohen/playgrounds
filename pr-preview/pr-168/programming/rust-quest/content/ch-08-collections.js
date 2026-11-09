/* Append only: a mission's key is '7.<index>' and shipped keys are never renumbered. DOM-free. */
(()=>{
'use strict';
const RQ=globalThis.RQ=globalThis.RQ||{};
const L=(...lines)=>lines.join('\n')+'\n';
const HM='use std::collections::HashMap;';
const BUCKET_MAIN=L('','fn main() {','    let a = bucket(3);','    println!("{:?} {}", a, a.len());','    let b = bucket(0);','    println!("{:?} {}", b, b.len());','    let c = bucket(5);','    println!("{:?} {}", c, c.len());','}');
const BUCKET=(...body)=>L('fn bucket(n: u32) -> Vec<u32> {',...body.map(l=>'    '+l),'}');
const BUCKET_OUT='[1, 2, 3] 3\n[] 0\n[1, 2, 3, 4, 5] 5\n';
const AT_MAIN=L('','fn main() {','    let bucket = vec![4, 8, 15];','    println!("{}", shell_at(&bucket, 1));','    println!("{}", shell_at(&bucket, 2));','    println!("{}", shell_at(&bucket, 7));','    let empty: Vec<u32> = Vec::new();','    println!("{}", shell_at(&empty, 0));','}');
const AT=(...body)=>L('fn shell_at(bucket: &Vec<u32>, i: usize) -> u32 {',...body.map(l=>'    '+l),'}');
const TOTAL_MAIN=L('','fn main() {','    let bucket = vec![4, 8, 15];','    println!("{}", total(&bucket));','    let empty: Vec<u32> = Vec::new();','    println!("{}", total(&empty));','    let big = vec![100, 20, 3, 1000];','    println!("{}", total(&big));','    let twos = vec![2, 2, 2];','    println!("{}", total(&twos));','}');
const TOTAL=(...body)=>L('fn total(bucket: &Vec<u32>) -> u32 {',...body.map(l=>'    '+l),'}');
const DOUBLE_MAIN=L('','fn main() {','    let mut bucket = vec![4, 8, 15];','    double_all(&mut bucket);','    println!("{:?}", bucket);','    let mut one = vec![5];','    double_all(&mut one);','    println!("{:?}", one);','}');
const DOUBLE=(...body)=>L('fn double_all(bucket: &mut Vec<u32>) {',...body.map(l=>'    '+l),'}');
const TALLY_MAIN=L('','fn main() {','    let finds = vec![String::from("crab"), String::from("star"), String::from("crab")];','    let counts = tally(&finds);','    println!("{:?} {:?} {}", counts.get("crab"), counts.get("star"), counts.len());','    let none: Vec<String> = Vec::new();','    println!("{}", tally(&none).len());','    let moons = vec![String::from("moon"), String::from("moon"), String::from("moon"), String::from("moon")];','    println!("{:?}", tally(&moons).get("moon"));','}');
const TALLY=(...body)=>L(HM,'','fn tally(finds: &Vec<String>) -> HashMap<String, u32> {',...body.map(l=>'    '+l),'}');
const TALLY_OUT='Some(2) Some(1) 2\n0\nSome(4)\n';
const MAIN=(...body)=>L('fn main() {',...body.map(l=>'    '+l),'}');
const COUNTS=['let mut counts: HashMap<String, u32> = HashMap::new();','counts.insert(String::from("crab"), 2);','counts.insert(String::from("star"), 1);','counts.insert(String::from("moon"), 5);'];
const WITH_HM=(...body)=>L(HM,'')+MAIN(...body);
const ORDER_OUT='crab 2\nmoon 5\nstar 1\n';

RQ.CH.push({
  name:'Vec and HashMap',
  badge:'Bucket Keeper',
  intro:'So far every variable held one thing. A <code>Vec</code> is a list that grows, and a <code>HashMap</code> is a table that finds a value by its key. Both own what is inside them, so the borrowing rules from the last chapters apply to every element: a reference to one shell is a loan of the whole bucket, and the compiler treats it that way. The memory view draws a <code>Vec</code> and a <code>HashMap</code> as a box on the heap, with a pointer to each element that owns memory of its own.',
  toolbox:'In this chapter: <code>Vec</code> with <code>vec!</code>, <code>push</code>, <code>pop</code>, <code>len</code>, <code>get</code>, <code>sort</code>, <code>extend</code> and indexing with <code>v[i]</code>; <code>for</code> over <code>&amp;v</code>, <code>&amp;mut v</code> and <code>v</code>; <code>HashMap</code> with <code>insert</code>, <code>get</code>, <code>entry</code> and <code>or_insert</code>; and the errors <code>E0502</code> and <code>E0382</code> on a collection. No closures and no iterator adapters yet.',
  learned:['Vec','push','get','for over a Vec','&mut loop','HashMap','entry','map order'],
  missions:[
    {
      title:'A bucket that grows',kind:'write',
      goal:'Write a function <code>bucket</code> that takes <code>n: u32</code> and gives back a <code>Vec&lt;u32&gt;</code> holding the numbers <code>1</code> up to <code>n</code>, put in one at a time with <code>push</code>. <code>bucket(3)</code> is <code>[1, 2, 3]</code>.',
      how:[
        'The whole function builds a list that starts empty and gets one more number on every turn of a loop, then hands the finished list back. A <code>Vec</code> is that list: it lives on the heap and can grow while the program runs, unlike an array.',
        '<code>let mut shells = Vec::new();</code> makes an empty <code>Vec</code>. It is <code>mut</code> because every <code>push</code> changes it, and Rust works out that it holds <code>u32</code> from what you push.',
        '<code>shells.push(i)</code> adds <code>i</code> at the end. A <code>for i in 1..=n</code> loop gives it each number from <code>1</code> to <code>n</code>, and the last line, <code>shells</code> without a <code>;</code>, is the value the function returns.',
        'The program prints each list with <code>{:?}</code> and its <code>len()</code>, the number of elements. For <code>n</code> equal to <code>0</code> the loop never runs, and the list stays empty.'
      ],
      explain:'A <code>Vec&lt;u32&gt;</code> owns its numbers the way a <code>String</code> owns its text: when the <code>Vec</code> is dropped, its heap memory is freed, and moving it moves the ownership. You can also write a starting list in one go with <code>vec![4, 8, 15]</code>. Open the memory view on a <code>Vec</code> to see the box that holds the elements.',
      hint:'Make the list with <code>Vec::new()</code>, loop <code>for i in 1..=n</code>, call <code>shells.push(i)</code> inside the loop, and return <code>shells</code> on the last line.',
      harness:BUCKET_MAIN,
      starter:BUCKET('let mut shells = Vec::new();','shells'),
      answer:BUCKET('let mut shells = Vec::new();','for i in 1..=n {','    shells.push(i);','}','shells'),
      alts:[BUCKET('let mut shells: Vec<u32> = Vec::new();','let mut i = 1;','while i <= n {','    shells.push(i);','    i += 1;','}','shells'),BUCKET('let mut shells = Vec::new();','for i in 0..n {','    shells.push(i + 1);','}','shells')],
      wrong:[{src:BUCKET('let mut shells = Vec::new();','for i in 0..n {','    shells.push(i);','}','shells'),wrongWhy:'check'},{src:BUCKET('let mut shells = Vec::new();','for i in 1..n {','    shells.push(i);','}','shells'),wrongWhy:'check'}],
      lazy:[{src:BUCKET('vec![1, 2, 3]'),wrongWhy:'check'},{src:BUCKET('let mut shells = Vec::new();','shells.push(n);','shells'),wrongWhy:'check'}],
      defines:[],previews:[],
      check:c=>c.out()!==BUCKET_OUT?'`bucket(3)` has to be `[1, 2, 3]`, `bucket(0)` has to be empty and `bucket(5)` has to hold `1` to `5`, so the program prints `'+BUCKET_OUT.split('\n').slice(0,3).join('`, `')+'`.':c.methodIn('bucket','push')<1?'Put the numbers in with `push`, inside `bucket`.':c.forOver('bucket','n')+c.countIn('while','bucket')<1?'Use a loop in `bucket` that runs up to `n`.':true
    },
    {
      title:'A borrowed element blocks a push',kind:'fix',
      goal:'This program stops with an error: it borrows the first shell, then pushes a new one, then uses the borrow. Fix it so it prints <code>first shell: 4</code> and then <code>[4, 8, 15, 16]</code>.',
      how:[
        'The whole program keeps a <code>bucket</code> of shell sizes, looks at the first one through a reference, adds a bigger shell, and prints both. The error says the push came while the reference was still going to be used.',
        '<code>&amp;bucket[0]</code> borrows the first element, but a <code>Vec</code> keeps all its elements in one block, so the loan is on the whole bucket, not on one slot.',
        '<code>bucket.push(16)</code> needs a <code>&amp;mut</code> loan of the bucket, and a push may even move the block to a bigger place on the heap. A reference into the old block would then point at nothing, so Rust refuses with <code>E0502</code> while <code>first</code> is still going to be used.',
        'A loan lasts until its last use. Use <code>first</code> before the push, or copy the number out with <code>let first = bucket[0];</code>, and the loan is over before the push begins.'
      ],
      explain:'This is the classic collection error. Reading <code>bucket[0]</code> as a number copies it, so no loan stays behind. Writing <code>&amp;bucket[0]</code> keeps a reference, and the bucket cannot change while that reference is alive. The compiler stops the push before the program can ever read a dangling reference.',
      hint:'Move the <code>println!</code> that prints <code>first</code> above the <code>push</code>, so the reference is finished first.',
      starter:MAIN('let mut bucket = vec![4, 8, 15];','let first = &bucket[0];','bucket.push(16);','println!("first shell: {}", first);','println!("{:?}", bucket);'),
      starterErr:'E0502',
      answer:MAIN('let mut bucket = vec![4, 8, 15];','let first = &bucket[0];','println!("first shell: {}", first);','bucket.push(16);','println!("{:?}", bucket);'),
      alts:[MAIN('let mut bucket = vec![4, 8, 15];','let first = bucket[0];','bucket.push(16);','println!("first shell: {}", first);','println!("{:?}", bucket);')],
      wrong:[{src:MAIN('let mut bucket = vec![4, 8, 15];','let first = &bucket[0];','bucket.push(16);','println!("first shell: {}", first);','println!("{:?}", bucket);'),wrongWhy:'E0502'},{src:MAIN('let mut bucket = vec![4, 8, 15];','let first = &bucket[1];','println!("first shell: {}", first);','bucket.push(16);','println!("{:?}", bucket);'),wrongWhy:'check'}],
      lazy:[{src:MAIN('let mut bucket = vec![4, 8, 15];','bucket.push(16);','println!("first shell: 4");','println!("{:?}", bucket);'),wrongWhy:'check'},{src:MAIN('let bucket = vec![4, 8, 15, 16];','let first = &bucket[0];','println!("first shell: {}", first);','println!("{:?}", bucket);'),wrongWhy:'check'}],
      defines:[],previews:[],
      check:c=>c.out()!=='first shell: 4\n[4, 8, 15, 16]\n'?'The program has to print `first shell: 4` and then `[4, 8, 15, 16]`.':c.usesMethod('push')<1?'Keep the `push` that adds the shell `16`.':c.count('hole')<2?'Print the shell and the bucket with `{}` and `{:?}`, not as fixed text.':c.count('index')+c.usesMethod('first')+c.usesMethod('get')<1||c.litArgs('print')>0?'Read the first shell out of the bucket, with `bucket[0]`, and print what you read, not a number you typed.':true
    },
    {
      title:'Ask with get',kind:'write',
      goal:'Write a function <code>shell_at</code> that takes <code>bucket: &amp;Vec&lt;u32&gt;</code> and <code>i: usize</code> and gives back the shell at place <code>i</code>, or <code>0</code> when the bucket has no place <code>i</code>. Use <code>get</code>.',
      how:[
        'The whole function looks up one shell and never crashes: a place that does not exist gives <code>0</code> instead. <code>bucket[7]</code> on a bucket of three would stop the program with a panic, because an index past the end is a bug Rust refuses to guess about.',
        '<code>bucket.get(i)</code> asks politely. It gives back an <code>Option</code>: <code>Some(x)</code> when place <code>i</code> exists, and <code>None</code> when it does not. You met <code>Option</code> and <code>match</code> in the last chapter.',
        'The <code>x</code> inside <code>Some(x)</code> is a reference to the shell, a <code>&amp;u32</code>, because <code>get</code> lends the element and does not take it out. Write <code>*x</code> to read the number behind the reference.',
        'So the function is one <code>match</code>: <code>Some(x)</code> gives <code>*x</code>, and <code>None</code> gives <code>0</code>. The index <code>i</code> is a <code>usize</code>, the type Rust uses for every position and length.'
      ],
      explain:'<code>v[i]</code> and <code>v.get(i)</code> look alike but fail differently. The index panics when the place is missing, which is right when a missing place means your program is wrong. <code>get</code> hands the question back to you as an <code>Option</code>, which is right when a missing place is normal. Rust Quest shows the panic message for you in the guide.',
      hint:'<code>match bucket.get(i) { Some(x) =&gt; *x, None =&gt; 0 }</code> is the whole body.',
      harness:AT_MAIN,
      starter:AT('0'),
      answer:AT('match bucket.get(i) {','    Some(x) => *x,','    None => 0,','}'),
      alts:[AT('if let Some(x) = bucket.get(i) {','    *x','} else {','    0','}'),AT('bucket.get(i).copied().unwrap_or(0)')],
      wrong:[{src:AT('match bucket.get(i) {','    Some(x) => *x + 1,','    None => 0,','}'),wrongWhy:'check'},{src:AT('match bucket.get(i) {','    Some(x) => *x,','    None => 1,','}'),wrongWhy:'check'}],
      lazy:[{src:AT('0'),wrongWhy:'check'},{src:AT('if i < bucket.len() {','    bucket[i]','} else {','    0','}'),wrongWhy:'check'}],
      defines:[],previews:[],
      check:c=>c.out()!=='8\n15\n0\n0\n'?'`shell_at(&bucket, 1)` has to be `8`, place `2` has to be `15`, and places that do not exist, like `7` or any place of an empty bucket, have to give `0`. So the program prints `8`, `15`, `0` and `0`.':c.methodIn('shell_at','get')<1?'Ask for the shell with `get` inside `shell_at`.':true
    },
    {
      title:'Walk the bucket with for',kind:'write',
      goal:'Write a function <code>total</code> that takes <code>bucket: &amp;Vec&lt;u32&gt;</code> and gives back the sum of all its shells, using a <code>for</code> loop over the bucket. <code>total</code> of <code>[4, 8, 15]</code> is <code>27</code>.',
      how:[
        'The whole function visits every shell once and keeps a running sum, then returns it. Until now <code>for</code> counted through a range like <code>1..=n</code>. It can also walk straight through a collection.',
        '<code>for shell in bucket</code> visits every element. Here <code>bucket</code> is already a <code>&amp;Vec</code>, a loan, so each <code>shell</code> is a <code>&amp;u32</code>, a reference to one element, and the bucket stays whole.',
        'A reference to a number is not the number, so the sum adds <code>*shell</code>, the number behind it. Start a <code>let mut sum = 0;</code> above the loop and add to it in the body.',
        'With your own bucket in a variable, <code>for shell in &amp;bucket</code> does the same walk: the <code>&amp;</code> says "lend it, do not hand it over".'
      ],
      explain:'A <code>for</code> over a loan reads every element and leaves the collection untouched, so you can use the bucket again afterwards. The loop holds its loan on the whole bucket from the first turn to the last, which is why the bucket cannot change inside the loop. The next missions show both sides of that.',
      hint:'<code>let mut sum = 0;</code>, then <code>for shell in bucket { sum += *shell; }</code>, then <code>sum</code> on the last line.',
      harness:TOTAL_MAIN,
      starter:TOTAL('0'),
      answer:TOTAL('let mut sum = 0;','for shell in bucket {','    sum += *shell;','}','sum'),
      alts:[TOTAL('let mut sum = 0;','for i in 0..bucket.len() {','    sum += bucket[i];','}','sum'),TOTAL('let mut sum = 0;','for shell in bucket.iter() {','    sum = sum + *shell;','}','sum')],
      wrong:[{src:TOTAL('let mut sum = 0;','for shell in bucket {','    sum += 1;','}','sum'),wrongWhy:'check'},{src:TOTAL('let mut sum = 0;','for shell in bucket {','    sum = *shell;','}','sum'),wrongWhy:'check'}],
      lazy:[{src:TOTAL('27'),wrongWhy:'check'},{src:TOTAL('let mut sum = 0;','for shell in bucket {','    sum += 9;','}','sum'),wrongWhy:'check'}],
      defines:[],previews:[],
      check:c=>c.out()!=='27\n0\n1123\n6\n'?'`total` of `[4, 8, 15]` has to be `27`, of an empty bucket `0`, of `[100, 20, 3, 1000]` `1123` and of `[2, 2, 2]` `6`, so the program prints `27`, `0`, `1123` and `6`.':c.forOver('total','bucket')<1?'Walk the bucket with a `for` loop inside `total`.':true
    },
    {
      title:'for takes the bucket away',kind:'fix',
      goal:'This program stops with an error: the <code>for</code> loop uses up the bucket, and then the program asks it for its length. Fix it so it prints <code>3 shells, total 27</code>.',
      how:[
        'The whole program adds up the shells in a bucket, then reports how many there were and the total. The error says <code>bucket</code> was used after it moved.',
        '<code>for shell in bucket</code> with the bucket itself, not a loan, <em>moves</em> the bucket into the loop. Each <code>shell</code> is then an owned number, and when the loop ends the bucket is gone, like a <code>String</code> you passed to a function.',
        '<code>for shell in &amp;bucket</code> lends the bucket instead. The loop only borrows it, so <code>bucket.len()</code> works afterwards. Each <code>shell</code> is then a reference, so you add <code>*shell</code>.',
        'The other fix is <code>for shell in bucket.clone()</code>, which loops over a copy and keeps the original. It works, but it builds a second <code>Vec</code> only to throw it away.'
      ],
      explain:'Looping over a collection by value consumes it: the loop owns every element, and anything left over is dropped when the loop ends. That is exactly what you want when you are done with the collection. When you are not, loop over <code>&amp;bucket</code> to read or <code>&amp;mut bucket</code> to change it.',
      hint:'Write <code>for shell in &amp;bucket</code> and add <code>*shell</code> to the total.',
      starter:MAIN('let bucket = vec![4, 8, 15];','let mut total = 0;','for shell in bucket {','    total += shell;','}','println!("{} shells, total {}", bucket.len(), total);'),
      starterErr:'E0382',
      answer:MAIN('let bucket = vec![4, 8, 15];','let mut total = 0;','for shell in &bucket {','    total += *shell;','}','println!("{} shells, total {}", bucket.len(), total);'),
      alts:[MAIN('let bucket = vec![4, 8, 15];','let mut total = 0;','for shell in bucket.clone() {','    total += shell;','}','println!("{} shells, total {}", bucket.len(), total);')],
      wrong:[{src:MAIN('let bucket = vec![4, 8, 15];','let mut total = 0;','let moved = bucket;','for shell in &moved {','    total += *shell;','}','println!("{} shells, total {}", bucket.len(), total);'),wrongWhy:'E0382'},{src:MAIN('let bucket = vec![4, 8, 15];','let mut total = 0;','for shell in &bucket {','    total += 1;','}','println!("{} shells, total {}", bucket.len(), total);'),wrongWhy:'check'}],
      lazy:[{src:MAIN('let bucket = vec![4, 8, 15];','println!("3 shells, total 27");'),wrongWhy:'check'},{src:MAIN('let bucket = vec![4, 8, 15];','let total = 27;','println!("{} shells, total {}", bucket.len(), total);'),wrongWhy:'check'}],
      defines:[],previews:[],
      check:c=>c.out()!=='3 shells, total 27\n'?'The program has to print `3 shells, total 27`.':c.count('for')<1?'Add up the shells with a `for` loop.':c.count('hole')<2?'Print the length and the total with `{}`, not as fixed text.':c.count('assign')<1||c.usesMethod('len')<1||c.litArgs('print')>0?'Let the loop add each shell to the total, ask the bucket for its `len()`, and print those, not numbers you typed.':true
    },
    {
      title:'Change every shell in place',kind:'write',
      goal:'Write a function <code>double_all</code> that takes <code>bucket: &amp;mut Vec&lt;u32&gt;</code> and doubles every shell in it, in place, with a <code>for</code> loop. <code>[4, 8, 15]</code> becomes <code>[8, 16, 30]</code>.',
      how:[
        'The whole function walks the bucket and makes each shell twice as big, changing the bucket the caller handed over, not a copy. That needs a loan that may change things, a <code>&amp;mut</code>, and the parameter already is one.',
        '<code>for shell in bucket</code> on a <code>&amp;mut Vec</code> gives each turn a <code>&amp;mut u32</code>, a loan of one element that may change it. It uses up the loan <code>bucket</code> you were handed, which is fine, because you are done with it afterwards.',
        '<code>*shell *= 2;</code> writes through the reference: the <code>*</code> reaches the number behind it, and <code>*=</code> multiplies it in place. Without the <code>*</code> Rust would try to multiply the reference itself.',
        'The caller passes <code>&amp;mut bucket</code> and prints the bucket afterwards, so it sees the doubled shells. Only one <code>&amp;mut</code> loan exists at a time, so nothing else can read the bucket while the loop runs.'
      ],
      explain:'A <code>&amp;mut</code> walk is the only way to change elements while you visit them. The loop holds the <code>&amp;mut</code> loan of the whole bucket for its whole run, so inside the body you cannot touch the bucket in any other way, not even to read its length. That is the same rule as before, applied to every turn.',
      hint:'<code>for shell in bucket { *shell *= 2; }</code> is the whole body.',
      harness:DOUBLE_MAIN,
      starter:DOUBLE('let _ = bucket;'),
      answer:DOUBLE('for shell in bucket {','    *shell *= 2;','}'),
      alts:[DOUBLE('for shell in bucket.iter_mut() {','    *shell = *shell * 2;','}'),DOUBLE('for i in 0..bucket.len() {','    bucket[i] *= 2;','}')],
      wrong:[{src:DOUBLE('for shell in bucket {','    *shell += 2;','}'),wrongWhy:'check'},{src:DOUBLE('for shell in bucket {','    *shell *= 3;','}'),wrongWhy:'check'}],
      lazy:[{src:DOUBLE('bucket.clear();','bucket.push(8);','bucket.push(16);','bucket.push(30);'),wrongWhy:'check'},{src:DOUBLE('let _ = bucket;'),wrongWhy:'check'}],
      defines:[],previews:[],
      check:c=>c.out()!=='[8, 16, 30]\n[10]\n'?'`double_all` has to double every shell in place: `[4, 8, 15]` becomes `[8, 16, 30]` and `[5]` becomes `[10]`.':c.forOver('double_all','bucket')<1?'Walk the bucket with a `for` loop inside `double_all`.':true
    },
    {
      title:'No pushing while you loop',kind:'fix',
      goal:'This program stops with an error: it pushes a bigger copy of every big shell while it loops over the bucket. Fix it so it prints <code>[4, 8, 15, 108, 115]</code>.',
      how:[
        'The whole program looks at every shell and, for each one bigger than <code>5</code>, adds a shell that is <code>100</code> bigger. The error is <code>E0502</code>: the bucket was borrowed as mutable while the loop still borrowed it.',
        '<code>for shell in &amp;bucket</code> holds a loan of the bucket until the loop is over. <code>bucket.push(...)</code> inside the body needs a <code>&amp;mut</code> loan of the same bucket at the same time, which <code>E0502</code> forbids. Growing a collection while you walk it could move its elements out from under the loop.',
        'Keep the loop reading, and put the new shells in a second <code>Vec</code>: <code>extras.push(*shell + 100);</code> changes only <code>extras</code>, which the loop is not borrowing.',
        'After the loop is over, its loan is over too. <code>bucket.extend(extras);</code> then moves every shell of <code>extras</code> onto the end of the bucket, and <code>extras</code> is used up.'
      ],
      explain:'This is how Rust avoids a bug other languages let through: changing a list while looping over it. The compiler sees the loop\'s loan and the push\'s loan overlap, and refuses. The fix is always the same shape: collect what you want to change, finish the loop, then apply the changes. Looping by position, <code>for i in 0..bucket.len()</code>, also works, because the range was counted once and holds no loan.',
      hint:'Make <code>let mut extras = Vec::new();</code> before the loop, push into <code>extras</code> inside it, and call <code>bucket.extend(extras);</code> after the loop.',
      starter:MAIN('let mut bucket = vec![4, 8, 15];','for shell in &bucket {','    if *shell > 5 {','        bucket.push(*shell + 100);','    }','}','println!("{:?}", bucket);'),
      starterErr:'E0502',
      answer:MAIN('let mut bucket = vec![4, 8, 15];','let mut extras = Vec::new();','for shell in &bucket {','    if *shell > 5 {','        extras.push(*shell + 100);','    }','}','bucket.extend(extras);','println!("{:?}", bucket);'),
      alts:[MAIN('let mut bucket = vec![4, 8, 15];','for i in 0..bucket.len() {','    if bucket[i] > 5 {','        bucket.push(bucket[i] + 100);','    }','}','println!("{:?}", bucket);')],
      wrong:[{src:MAIN('let mut bucket = vec![4, 8, 15];','for shell in &bucket {','    if *shell > 5 {','        bucket.push(0);','    }','}','println!("{:?}", bucket);'),wrongWhy:'E0502'},{src:MAIN('let mut bucket = vec![4, 8, 15];','let mut extras = Vec::new();','for shell in &bucket {','    if *shell > 5 {','        extras.push(*shell);','    }','}','bucket.extend(extras);','println!("{:?}", bucket);'),wrongWhy:'check'}],
      lazy:[{src:MAIN('let mut bucket = vec![4, 8, 15];','println!("[4, 8, 15, 108, 115]");'),wrongWhy:'check'},{src:MAIN('let mut bucket = vec![4, 8, 15, 108, 115];','println!("{:?}", bucket);'),wrongWhy:'check'}],
      defines:[],previews:[],
      check:c=>c.out()!=='[4, 8, 15, 108, 115]\n'?'The program has to print `[4, 8, 15, 108, 115]`.':c.count('for')<1?'Keep the loop that looks at every shell.':c.usesMethod('push')<1?'Add the new shells with `push`.':c.count('if')<1?'Keep the `if` that picks the shells bigger than `5`.':c.litArgs('push')>0?'Push the shells the loop works out, not numbers you typed.':c.count('hole')<1?'Print the bucket with `{:?}`, not as fixed text.':true
    },
    {
      title:'Count with a HashMap',kind:'write',
      goal:'Write <code>tally</code>, which takes <code>finds: &amp;Vec&lt;String&gt;</code> and gives back a <code>HashMap&lt;String, u32&gt;</code> that says how many times each name appears. <code>["crab", "star", "crab"]</code> gives <code>crab</code> a count of <code>2</code> and <code>star</code> a count of <code>1</code>. Keep the <code>use</code> line at the top.',
      how:[
        'The whole function is a tally sheet: for every name in the list it finds that name\'s row and adds one, starting a new row at <code>0</code> the first time it sees a name. A <code>HashMap&lt;K, V&gt;</code> is such a sheet: it finds a value by its key, here a <code>String</code> name and a <code>u32</code> count.',
        '<code>use std::collections::HashMap;</code> at the top brings the type into view, and <code>HashMap::new()</code> makes an empty one. The caller prints <code>counts.get("crab")</code>, which gives an <code>Option</code> like <code>Some(2)</code>, because a key may be missing.',
        '<code>counts.entry(name).or_insert(0)</code> is the one-line "find the row or start it". It gives back a <code>&amp;mut u32</code> pointing at that row\'s count, so <code>*counts.entry(name).or_insert(0) += 1;</code> adds one in place.',
        'The map owns its keys, so each turn passes <code>name.clone()</code>, a copy of the name. Looping over <code>finds</code> gives <code>&amp;String</code> names, which you cannot hand over without copying.'
      ],
      explain:'A <code>HashMap</code> takes ownership of the keys and values you put in, just like a <code>Vec</code>. <code>entry</code> and <code>or_insert</code> are Rust\'s answer to "look it up, and if it is missing add it" without looking twice. The <code>&amp;mut</code> they hand back borrows the whole map until you are done with it.',
      hint:'Start with <code>let mut counts = HashMap::new();</code>, then <code>for name in finds { *counts.entry(name.clone()).or_insert(0) += 1; }</code>, then return <code>counts</code>.',
      harness:TALLY_MAIN,
      starter:TALLY('let counts = HashMap::new();','counts'),
      answer:TALLY('let mut counts = HashMap::new();','for name in finds {','    *counts.entry(name.clone()).or_insert(0) += 1;','}','counts'),
      alts:[TALLY('let mut counts: HashMap<String, u32> = HashMap::new();','for name in finds {','    let n = counts.entry(name.clone()).or_insert(0);','    *n += 1;','}','counts'),TALLY('let mut counts = HashMap::new();','for name in finds {','    if counts.contains_key(name) {','        *counts.get_mut(name).unwrap() += 1;','    } else {','        counts.insert(name.clone(), 1);','    }','}','counts')],
      wrong:[{src:TALLY('let mut counts = HashMap::new();','for name in finds {','    *counts.entry(name.clone()).or_insert(0) += 2;','}','counts'),wrongWhy:'check'},{src:TALLY('let mut counts = HashMap::new();','for name in finds {','    counts.insert(name.clone(), 1);','}','counts'),wrongWhy:'check'}],
      lazy:[{src:TALLY('let mut counts = HashMap::new();','counts.insert(String::from("crab"), 2);','counts.insert(String::from("star"), 1);','counts'),wrongWhy:'check'},{src:TALLY('let counts = HashMap::new();','counts'),wrongWhy:'check'}],
      defines:[],previews:[],
      check:c=>c.out()!==TALLY_OUT?'`tally` has to count each name: the first list gives `crab` a count of `2`, `star` a count of `1` and a map of `2` names, an empty list gives an empty map, and four `moon`s give `Some(4)`. So the program prints `Some(2) Some(1) 2`, `0` and `Some(4)`.':c.forOver('tally','finds')<1?'Walk the list with a `for` loop inside `tally`.':true
    },
    {
      title:'A HashMap keeps no order',kind:'write',
      goal:'This program prints a <code>HashMap</code> with <code>{:?}</code>, and real Rust prints its entries in a different order on every run. Change it to print one line per find, <code>name count</code>, in alphabetical order: <code>crab 2</code>, <code>moon 5</code>, <code>star 1</code>.',
      how:[
        'The whole program prints a tally table, and the table has to look the same on every run. A <code>HashMap</code> finds keys fast by scrambling them, so it lists its entries in whatever order the scramble gives, and a different order each time you run. Rust Quest runs your program twice with two different scrambles, and refuses an output that changes.',
        'The way out is to fix the order yourself. Copy the keys into a <code>Vec</code> with a loop over <code>counts.keys()</code>, pushing <code>name.clone()</code> each time, because the <code>Vec</code> must own its names.',
        '<code>names.sort();</code> puts the <code>Vec</code> in alphabetical order. A <code>Vec</code> has an order, and sorting makes it the same on every run.',
        'Then loop over <code>&amp;names</code> and look each count up with <code>counts.get(name).unwrap()</code>. <code>unwrap</code> takes the number out of the <code>Some</code>, and it is safe here because every name in the list is a key of the map.'
      ],
      explain:'An order a program must not depend on is a bug waiting to happen, so Rust Quest treats it as one. Anything that does not depend on order is fine: summing the values, asking for one key, or counting entries. Printing the whole map is fine too when it has at most one entry. For anything else, sort the keys first.',
      hint:'Fill a <code>names</code> <code>Vec</code> from <code>counts.keys()</code>, call <code>names.sort()</code>, then <code>for name in &amp;names { println!("{} {}", name, counts.get(name).unwrap()); }</code>.',
      starter:WITH_HM(...COUNTS,'println!("{:?}", counts);'),
      answer:WITH_HM(...COUNTS,'let mut names = Vec::new();','for name in counts.keys() {','    names.push(name.clone());','}','names.sort();','for name in &names {','    println!("{} {}", name, counts.get(name).unwrap());','}'),
      alts:[WITH_HM(...COUNTS,'let mut names = Vec::new();','for (name, _) in &counts {','    names.push(name.clone());','}','names.sort();','for name in &names {','    let n = counts.get(name).unwrap();','    println!("{} {}", name, n);','}')],
      wrong:[{src:WITH_HM(...COUNTS,'for (name, n) in &counts {','    println!("{} {}", name, n);','}'),wrongWhy:'check'},{src:WITH_HM(...COUNTS,'let mut names = Vec::new();','for name in counts.keys() {','    names.push(name.clone());','}','for name in &names {','    println!("{} {}", name, counts.get(name).unwrap());','}'),wrongWhy:'check'}],
      lazy:[{src:WITH_HM(...COUNTS,'println!("crab 2");','println!("moon 5");','println!("star 1");'),wrongWhy:'check'},{src:WITH_HM(...COUNTS,'println!("crab {}", counts.get("crab").unwrap());','println!("moon {}", counts.get("moon").unwrap());','println!("star {}", counts.get("star").unwrap());'),wrongWhy:'check'}],
      defines:[],previews:[],
      check:c=>c.out()!==ORDER_OUT?'The program has to print `crab 2`, `moon 5` and `star 1`, one per line, in alphabetical order.':c.usesMethod('sort')<1?'Sort the names with `sort`, so the order is the same on every run.':c.count('for')<2||c.methodIn('main','push')<1||c.litArgs('push')>0?'Loop over the keys to collect the names with `push`, then loop over the sorted names to print them.':true
    }
  ]
});
})();
