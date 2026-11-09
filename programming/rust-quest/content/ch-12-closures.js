/* Append only: a mission's key is '11.<index>' and shipped keys are never renumbered. DOM-free. */
(()=>{
'use strict';
const RQ=globalThis.RQ=globalThis.RQ||{};
const L=(...lines)=>lines.join('\n')+'\n';
const J=(...parts)=>parts.join('\n');
const MAIN=(...body)=>L('fn main() {',...body.map(l=>'    '+l),'}');
const FN=(head,...body)=>L(head+' {',...body.map(l=>'    '+l),'}');
// runs the learner's program on other input and wants what real code gives, so a typed-in answer fails; null means the input text was changed
const OTHER=(c,want,why,...swaps)=>{const r=c.rerun(...swaps);return r===null?'Keep `'+swaps[0][0]+'` as it is, so Rust Quest can try your code on other text.':r.out()!==want?why:true;};
// a closure has no node of its own in the check context, so a closure that is called by name and no `fn` besides main stand for it
const CLOSURE_ONLY=(c,name)=>c.calls(name)<1||c.count('fn')>1?'Make `'+name+'` a closure with `let '+name+' = |...| ...;` and call it, with no `fn` besides `main`.'
  :c.printedCalls(name)<2?'Print what `'+name+'` gives back, in each of the two `println!` lines, so the numbers come from the closure.':null;
const FN_BOUND=g=>!!g&&(g.tparams.some(t=>t.bounds.includes('Fn'))||g.impl.some(b=>!!b&&b.includes('Fn')));
const KIND_BOUND=(g,kind)=>!!g&&(g.tparams.some(t=>t.bounds.includes(kind))||g.impl.some(b=>!!b&&b.includes(kind)));

const TALLY=(sig)=>MAIN('let tally = '+sig+' word.len();','println!("{}", tally("shell"));','println!("{}", tally("crab"));');
const LOG=(...mid)=>MAIN('let mut log = String::from("tide");','let show = || println!("{}", log);',...mid);
const TICK=(decl)=>MAIN('let mut count = 0;',decl,'for _ in 0..3 {','    tick();','}','println!("{}", count);');
const APPLY_MAIN=J('',MAIN('let bonus = 3;','println!("{}", apply(|n: i32| n + bonus, 4));','println!("{}", apply(|n: i32| n * 2, 10));'));
const TWICE=(head)=>J(L(head+' {','    f();','    f();','}'),MAIN('let mut count = 0;','let bump = || count += 1;','run_twice(bump);','println!("{}", count);'));
const ADDER_MAIN=J('',MAIN('let add3 = adder(3);','println!("{}", add3(4));','println!("{}", adder(10)(1));'));
const ADDER=(body)=>FN('fn adder(n: i32) -> impl Fn(i32) -> i32',body);
const LAZY=(let_)=>MAIN('let shells = vec![2, 5, 9];','let doubled = shells.iter().map(|n| {','    println!("doubling {}", n);','    n * 2','});','println!("before");',let_,'println!("{}", list.len());');
const LAZY_OUT='before\ndoubling 2\ndoubling 5\ndoubling 9\n3\n';
const BIG=(tail)=>MAIN('let shells = vec![3, 8, 12, 5, 20];','let big: Vec<i32> = shells.iter().filter(|n| **n > 6)'+tail+';','println!("{:?}", big);','let total: i32 = big.iter().sum();','println!("{}", total);');
const TIDY=(...body)=>FN('fn tidy(sizes: &mut Vec<i32>)',...body);
const TOP=(...body)=>FN('fn top_double(sizes: &Vec<i32>) -> i32',...body);
const SIZES_MAIN=J('',MAIN('let mut sizes = vec![30, 5, 18, 2, 9];','tidy(&mut sizes);','println!("{:?}", sizes);','println!("{}", top_double(&sizes));','let none: Vec<i32> = vec![];','println!("{}", top_double(&none));'));
const STD_TIDY=TIDY('sizes.retain(|s| *s > 4);','sizes.sort_by_key(|s| -*s);');
const STD_TOP=TOP('sizes.first().map(|s| s * 2).unwrap_or_else(|| 0)');

RQ.CH.push({
  name:'Closures and iterators',
  badge:'Tide Weaver',
  intro:`Crabs do not follow a fixed script: Pip counts shells one way on Monday and another way on Tuesday. A <em>closure</em> is a small function you write in the middle of your code, without a name of its own, that can use the variables around it. This chapter writes closures, finds out how they borrow and move what they use, passes them to functions and hands them back, and then chains them into <em>iterators</em>: lazy pipelines that walk a collection one item at a time.`,
  toolbox:`In this chapter: <code>|x| ...</code> closures with and without types, what a closure borrows, <code>move</code>, <code>Fn</code>, <code>FnMut</code> and <code>FnOnce</code>, <code>impl Fn</code> as a parameter and as a result, <code>map</code>, <code>filter</code>, <code>collect</code>, <code>sum</code> and the other iterator methods, <code>sort_by_key</code>, <code>retain</code>, <code>unwrap_or_else</code>, and the errors <code>E0282</code>, <code>E0283</code>, <code>E0502</code>, <code>E0596</code>, <code>E0525</code>, <code>E0373</code> and <code>E0277</code>.`,
  learned:['closure','closure borrows','mutable closure','closure parameter','Fn, FnMut and FnOnce','move','lazy iterator','iterator adapters','closures in std methods'],
  missions:[
    {
      title:'A closure in a variable',kind:'fix',
      goal:`This program keeps a small function in a variable called <code>tally</code> and calls it twice, but it stops with <code>E0282</code>, "type annotations needed". Give the parameter <code>word</code> a type so the program prints <code>5</code> and then <code>4</code>.`,
      how:[
        `The whole program is a <code>main</code> that makes a <em>closure</em> and calls it. <code>|word| word.len()</code> is a function with no name: the bars <code>| |</code> hold its parameters, and what follows is its body. Putting it in a variable, <code>let tally = ...;</code>, lets you call it like any function: <code>tally("shell")</code>.`,
        `A closure is allowed to leave its types out, and Rust works them out from how the closure is used. But the body <code>word.len()</code> is checked first, and a method can only be found when the type is known. At that point nothing has said what <code>word</code> is, so Rust stops with <code>E0282</code>.`,
        `Tell it: <code>|word: &str|</code> puts the type after the name, just like a <code>fn</code> parameter. Everything else stays the same.`,
        `The two calls print the length of each word, so the output is <code>5</code> and then <code>4</code>.`
      ],
      explain:`A closure is a value you can store, pass around and call. Its parameter and result types can be left out when Rust can work them out, but they have to be known by the time the body needs them, and a method call is where that usually happens. When the compiler cannot decide, it asks for the type with <code>E0282</code>, and a type written after the name is the fix.`,
      hint:`Change the first line of the body to <code>let tally = |word: &str| word.len();</code>.`,
      starter:TALLY('|word|'),
      starterErr:'E0282',
      answer:TALLY('|word: &str|'),
      alts:[MAIN('let tally = |word: &str| -> usize { word.len() };','println!("{}", tally("shell"));','println!("{}", tally("crab"));')],
      wrong:[
        {src:TALLY('|word: &str| 1 +'),wrongWhy:'check'},
        {src:MAIN('let tally = |word: &str| -> String { word.len() };','println!("{}", tally("shell"));','println!("{}", tally("crab"));'),wrongWhy:'E0308'}
      ],
      lazy:[
        {src:MAIN('let tally = |word: &str| word.len();','println!("5");','println!("4");'),wrongWhy:'check'},
        {src:J(FN('fn tally(word: &str) -> usize','word.len()'),MAIN('println!("{}", tally("shell"));','println!("{}", tally("crab"));')),wrongWhy:'check'},
        {src:MAIN('let tally = |word: &str| word.len();','let _ = tally("x");','println!("{}", "shell".len());','println!("{}", "crab".len());'),wrongWhy:'check'}
      ],
      defines:['closure'],previews:[],
      check:c=>{
        if(c.out()!=='5\n4\n')return 'The program has to print `5` and then `4`.';
        const bad=CLOSURE_ONLY(c,'tally');
        if(bad)return bad;
        return OTHER(c,'7\n3\n','`tally` has to give the length of the word it is called with.',['"shell"','"anemone"'],['"crab"','"tun"']);
      }
    },
    {
      title:'A closure borrows what it reads',kind:'fix',
      goal:`The closure <code>show</code> prints <code>log</code>. Then the program changes <code>log</code> and calls <code>show</code> afterwards, and it stops with <code>E0502</code>. Reorder the lines so that it prints <code>tide</code> and then <code>tide rising</code>.`,
      how:[
        `The whole program has a <code>String</code> called <code>log</code>, a closure <code>show</code> that prints it, a <code>push_str</code> that makes it longer, a call of <code>show</code> and a last <code>println!</code>. The closure never takes <code>log</code> as a parameter: it uses the variable it finds around it.`,
        `That is called a <em>capture</em>. A closure that only reads a variable captures it with a shared borrow, <code>&log</code>, that lasts as long as the closure is still going to be called. Here that is up to the call <code>show()</code>.`,
        `Chapter 5's rule applies: while a shared borrow is still going to be used, nothing may change the value. <code>log.push_str(" rising")</code> sits between the closure and its call, so Rust says <code>E0502</code>: <code>log</code> is borrowed as mutable while it is also borrowed as immutable.`,
        `Call <code>show()</code> before the change. After its last call the closure's borrow is over, and <code>push_str</code> is free to run.`
      ],
      explain:`A closure borrows what its body uses, for as long as the closure can still be called. That is the same rule as for any <code>&</code> you write by hand, and the same fix: finish with the closure, or stop using it, before the value changes. Rust looks for the last call of the closure, not at where it was written.`,
      hint:`Move the line <code>show();</code> above <code>log.push_str(" rising");</code>.`,
      starter:LOG('log.push_str(" rising");','show();','println!("{}", log);'),
      starterErr:'E0502',
      answer:LOG('show();','log.push_str(" rising");','println!("{}", log);'),
      alts:[MAIN('let mut log = String::from("tide");','let copy = log.clone();','let show = || println!("{}", copy);','log.push_str(" rising");','show();','println!("{}", log);')],
      wrong:[
        {src:LOG('show();','println!("{}", log);','log.push_str(" rising");'),wrongWhy:'check'},
        {src:LOG('show();','log.push_str(" rising");','show();'),wrongWhy:'E0502'}
      ],
      lazy:[
        {src:MAIN('let mut log = String::from("tide");','println!("{}", log);','log.push_str(" rising");','println!("{}", log);'),wrongWhy:'check'},
        {src:MAIN('let mut log = String::from("tide");','let show = || println!("tide");','show();','log.push_str(" rising");','println!("{}", log);'),wrongWhy:'check'}
      ],
      defines:[],previews:[],
      check:c=>{
        if(c.out()!=='tide\ntide rising\n')return 'The program has to print `tide` and then `tide rising`.';
        if(c.calls('show')<1||!c.closures().some(x=>x.caps.length>0))return 'Keep the closure `show`, let it print a variable from around it, and call it, so the borrow is the one this mission is about.';
        return OTHER(c,'moon\nmoon rising\n','The text comes from `log`, so another start has to show up.',['"tide"','"moon"']);
      }
    },
    {
      title:'A closure that changes what it captured',kind:'fix',
      goal:`The closure <code>tick</code> adds one to <code>count</code>, and the loop calls it three times, but calling it stops with <code>E0596</code>. Fix the line that makes the closure, so the program prints <code>3</code>.`,
      how:[
        `The whole program keeps a counter in <code>count</code>, makes a closure <code>tick</code> that does <code>count += 1</code>, calls it three times in a loop, and prints the counter.`,
        `A closure that changes a captured variable captures it with a <code>&mut</code> borrow, and holding that borrow means the closure itself changes every time it runs. Calling it therefore needs the closure to be <code>mut</code>, just like calling <code>push</code> needs a <code>mut</code> vector.`,
        `The error <code>E0596</code> names <code>tick</code>: it cannot be borrowed as mutable, as it is not declared as mutable. The variable <code>count</code> is already <code>mut</code>, so the problem is on the line that declares the closure.`,
        `Write <code>let mut tick = ...</code>. The counter ends up at <code>3</code>, and because the loop is the last user of <code>tick</code>, the final <code>println!</code> may read <code>count</code> again.`
      ],
      explain:`Two things need <code>mut</code> when a closure changes a variable: the variable, because its value changes, and the closure, because a closure that holds a <code>&mut</code> borrow is changed by each call. Rust asks for both. A closure that only reads its captures can be called any number of times without <code>mut</code>.`,
      hint:`Change <code>let tick = || count += 1;</code> to <code>let mut tick = || count += 1;</code>.`,
      starter:TICK('let tick = || count += 1;'),
      starterErr:'E0596',
      answer:TICK('let mut tick = || count += 1;'),
      alts:[TICK('let mut tick = || {\n        count += 1;\n    };')],
      wrong:[
        {src:J(MAIN('let mut count = 0;','let mut tick = || count += 1;','for _ in 0..2 {','    tick();','}','println!("{}", count);')),wrongWhy:'check'},
        {src:TICK('let mut tick = || count += 1;').replace('println!("{}", count);','tick();\n    println!("{}", count);'),wrongWhy:'check'}
      ],
      lazy:[
        {src:MAIN('let mut count = 0;','let mut tick = || count += 1;','count += 3;','println!("{}", count);'),wrongWhy:'check'},
        {src:MAIN('let mut count = 0;','let mut tick = || {};','for _ in 0..3 {','    tick();','    count += 1;','}','println!("{}", count);'),wrongWhy:'check'}
      ],
      defines:[],previews:[],
      check:c=>{
        if(c.out()!=='3\n')return 'The program has to print `3`.';
        if(c.calls('tick')<1||c.count('fn')>1||!c.closures().some(x=>x.caps.some(k=>k.name==='count'&&k.mode==='mut')))return 'Keep `tick` as a closure that changes `count`, and call it, with no `fn` besides `main`.';
        return OTHER(c,'5\n','The loop calls `tick` once per round, so another count has to show up.',['0..3','0..5']);
      }
    },
    {
      title:'Take a closure as a parameter',kind:'write',
      goal:`Write <code>apply</code>: it takes a closure and a number, calls the closure with the number, and returns the result. The hidden <code>main</code> calls <code>apply</code> with two different closures, and should print <code>7</code> and then <code>20</code>.`,
      how:[
        `The whole program is a hidden <code>main</code> that passes a closure to <code>apply</code> twice: one adds a captured <code>bonus</code>, the other doubles. You write the function that receives them.`,
        `Every closure has a type of its own, which no one can write down. The parameter is therefore generic, as in chapter 11: <code>fn apply&lt;F: Fn(i32) -> i32&gt;(f: F, x: i32) -> i32</code>. The bound <code>Fn(i32) -> i32</code> reads "any closure that takes an <code>i32</code> and gives back an <code>i32</code>".`,
        `Inside, <code>f</code> is called like a function: <code>f(x)</code>. The bound is what lets the body do that. <code>impl Fn(i32) -> i32</code> in place of <code>F</code> is the short way of writing the same thing.`,
        `<code>Fn</code> is one of three closure traits. It is the one for closures that can be called again and again without changing anything. The next missions meet the other two.`
      ],
      explain:`A function that takes a closure is generic over the closure's type, with a bound that says how it may be called. Rust builds <code>apply</code> separately for each closure it receives, so the call costs no more than writing the closure's body in place. The bound also says what the closure must be: a closure that does not take an <code>i32</code> is refused at the call.`,
      hint:`Write <code>fn apply&lt;F: Fn(i32) -> i32&gt;(f: F, x: i32) -> i32 {</code>, and make the body <code>f(x)</code>.`,
      harness:APPLY_MAIN,
      starter:L('// Make apply call the closure f on x.','fn apply<F>(f: F, x: i32) -> i32 {','    0','}'),
      answer:FN('fn apply<F: Fn(i32) -> i32>(f: F, x: i32) -> i32','f(x)'),
      alts:[FN('fn apply(f: impl Fn(i32) -> i32, x: i32) -> i32','f(x)'),L('fn apply<F>(f: F, x: i32) -> i32','where','    F: Fn(i32) -> i32,','{','    let r = f(x);','    r','}')],
      wrong:[
        {src:FN('fn apply<F: Fn(i32) -> i32>(f: F, x: i32) -> i32','x'),wrongWhy:'check'},
        {src:FN('fn apply<F: Fn(i32) -> i32>(f: F, x: i32) -> i32','f(x, x)'),wrongWhy:'E0057'}
      ],
      lazy:[
        {src:FN('fn apply<F: Fn(i32) -> i32>(f: F, x: i32) -> i32','if x == 4 {','    7','} else {','    20','}'),wrongWhy:'check'}
      ],
      defines:[],previews:[],
      check:c=>{
        if(c.out()!=='7\n20\n')return 'The program has to print `7` and then `20`.';
        if(!FN_BOUND(c.genericOf('apply')))return 'Make the closure a generic parameter with a bound, like `F: Fn(i32) -> i32`, or write `impl Fn(i32) -> i32` as its type.';
        return OTHER(c,'9\n20\n','`apply` has to call the closure it is given, so a different `bonus` has to change the result.',['bonus = 3','bonus = 5']);
      }
    },
    {
      title:'Fn, FnMut or FnOnce',kind:'fix',
      goal:`<code>run_twice</code> calls the closure it is given two times. The closure <code>bump</code> adds one to <code>count</code>, but passing it stops with <code>E0525</code>. Change the first line of <code>run_twice</code> so the program prints <code>2</code>.`,
      how:[
        `The whole program has a function that calls <code>f()</code> twice, a closure <code>bump</code> that does <code>count += 1</code>, and a call <code>run_twice(bump)</code>. The bound on <code>f</code> is <code>Fn()</code>.`,
        `Closures come in three kinds, and Rust picks the kind from what the body does. A body that only reads its captures is <code>Fn</code>. A body that changes a capture is <code>FnMut</code>. A body that moves a capture out, as <code>drop(name)</code> does, is <code>FnOnce</code>: it can only be called one time.`,
        `<code>bump</code> changes <code>count</code>, so it is <code>FnMut</code>, and <code>E0525</code> says exactly that: the function expected an <code>Fn</code> closure, but this one only implements <code>FnMut</code>. The bound is a promise about what the function may do, and <code>Fn</code> is the strictest.`,
        `Ask for what the closure is: <code>F: FnMut()</code>. Calling an <code>FnMut</code> changes the closure, so the parameter has to be <code>mut f: F</code> as well.`
      ],
      explain:`Each kind is a bigger promise than the next. Every <code>Fn</code> closure can be used where <code>FnMut</code> is asked for, and every <code>FnMut</code> where <code>FnOnce</code> is asked for, but not the other way. So a function that wants flexibility asks for the weakest kind it can live with: <code>FnOnce</code> if it calls the closure once, <code>FnMut</code> if it calls it several times, and <code>Fn</code> only if it needs closures that never change.`,
      hint:`Change the first line to <code>fn run_twice&lt;F: FnMut()&gt;(mut f: F) {</code>.`,
      starter:TWICE('fn run_twice<F: Fn()>(f: F)'),
      starterErr:'E0525',
      answer:TWICE('fn run_twice<F: FnMut()>(mut f: F)'),
      alts:[TWICE('fn run_twice(mut f: impl FnMut())')],
      wrong:[
        {src:TWICE('fn run_twice<F: FnOnce()>(f: F)'),wrongWhy:'E0382'}
      ],
      lazy:[
        {src:J(L('fn run_twice<F: Fn()>(f: F) {','    f();','    f();','}'),MAIN('let mut count = 0;','let bump = || println!("bump");','run_twice(bump);','println!("{}", count);')),wrongWhy:'check'},
        {src:J(L('fn run_twice<F: FnMut()>(mut f: F) {','}'),MAIN('let mut count = 0;','let bump = || count += 1;','run_twice(bump);','count += 2;','println!("{}", count);')),wrongWhy:'check'}
      ],
      defines:[],previews:[],
      check:c=>{
        if(c.out()!=='2\n')return 'The program has to print `2`.';
        if(!c.callsIn('run_twice','f')||c.callArg('run_twice','bump')<1)return 'Keep `run_twice(bump)` in `main`, and let `run_twice` call its closure `f`.';
        if(!KIND_BOUND(c.genericOf('run_twice'),'FnMut'))return 'Ask for the kind of closure `bump` is: the bound `FnMut()`.';
        return OTHER(c,'12\n','`run_twice` has to call the closure twice, so the count must go up by two.',['count = 0','count = 10']);
      }
    },
    {
      title:'Hand a closure back',kind:'fix',
      goal:`<code>adder</code> returns a closure that adds <code>n</code> to its argument, but it stops with <code>E0373</code>. Fix the closure so the program prints <code>7</code> and then <code>11</code>.`,
      how:[
        `The whole program has a function <code>adder</code> that takes a number <code>n</code> and returns a closure, and a hidden <code>main</code> that calls the result. The result type <code>impl Fn(i32) -> i32</code> says "some closure that takes an <code>i32</code> and gives back an <code>i32</code>".`,
        `The closure <code>|x| x + n</code> only reads <code>n</code>, so it captures it with a borrow. But <code>n</code> is a parameter of <code>adder</code>, and it is gone when <code>adder</code> returns. A closure that leaves the function cannot hold a borrow of something that stays behind. That is <code>E0373</code>: the closure may outlive the current function.`,
        `Write <code>move</code> before the bars: <code>move |x| x + n</code>. A <code>move</code> closure takes its captures by value, so it owns its own copy of <code>n</code>.`,
        `A number is copied, so <code>adder</code> still has its own. A <code>String</code> would be moved into the closure instead, and using it again afterwards would be <code>E0382</code>, just like any other move.`
      ],
      explain:`By default a closure borrows what it uses. <code>move</code> makes it own what it uses, which is what a closure needs when it outlives the place it was written in: when it is returned, or sent to another thread. <code>move</code> only changes how the captures arrive. A <code>move</code> closure that merely reads them is still <code>Fn</code>.`,
      hint:`Write <code>move</code> in front of the closure: <code>move |x| x + n</code>.`,
      harness:ADDER_MAIN,
      starter:ADDER('|x| x + n'),
      starterErr:'E0373',
      answer:ADDER('move |x| x + n'),
      alts:[ADDER('move |x| {\n        x + n\n    }')],
      wrong:[
        {src:ADDER('move |x| x + n + 1'),wrongWhy:'check'}
      ],
      lazy:[
        {src:ADDER('move |x| if n == 3 { x + 3 } else { x + 10 }'),wrongWhy:'check'}
      ],
      defines:[],previews:[],
      check:c=>{
        if(c.out()!=='7\n11\n')return 'The program has to print `7` and then `11`.';
        return OTHER(c,'9\n11\n','The number comes from `n`, so a different argument has to change the result.',['adder(3)','adder(5)']);
      }
    },
    {
      title:'Iterators are lazy',kind:'fix',
      goal:`This program builds a pipeline with <code>map</code> that prints a line for every shell, says <code>before</code>, and then collects the results. It stops with <code>E0282</code> at <code>collect</code>. Give the result a type so that it prints <code>before</code> first, then the three <code>doubling</code> lines, then <code>3</code>.`,
      how:[
        `The whole program has a vector of shells, a <code>map</code> that prints and doubles each one, a line that says <code>before</code>, a <code>collect</code> and a count. <code>shells.iter()</code> is an <em>iterator</em>: a value that hands out the items one at a time. <code>map</code> is an <em>adapter</em>: it wraps an iterator and changes each item as it passes.`,
        `Adapters are lazy. The line with <code>map</code> only builds the pipeline, and nothing runs, so none of the <code>doubling</code> lines appears yet. Work starts when something asks for the items. <code>collect</code> does: it pulls every item through, and only then the closure runs.`,
        `That is also why <code>before</code> comes first in the output. And <code>collect</code> can build several kinds of collection, so Rust needs to be told which one you want. Without it, it stops with <code>E0282</code> here, because <code>list.len()</code> was used before the type was fixed.`,
        `Write the type on the variable, <code>let list: Vec&lt;i32&gt; = ...</code>, or on the call, <code>collect::&lt;Vec&lt;i32&gt;&gt;()</code>. Either way the output is the same.`
      ],
      explain:`A pipeline of adapters is a recipe, and a consumer such as <code>collect</code>, <code>sum</code> or <code>count</code> cooks it. Each item goes all the way through the pipeline before the next one starts, which is why a <code>map</code> followed by a <code>filter</code> prints in alternating lines. The target of <code>collect</code> is a choice, and Rust does not guess it: <code>Vec</code>, <code>String</code> and <code>HashMap</code> are all possible. When the variable is not used in a way that decides, you write the type; if nothing at all decides it, Rust says <code>E0283</code> instead of <code>E0282</code>.`,
      hint:`Change <code>let list = doubled.collect();</code> to <code>let list: Vec&lt;i32&gt; = doubled.collect();</code>.`,
      starter:LAZY('let list = doubled.collect();'),
      starterErr:'E0282',
      answer:LAZY('let list: Vec<i32> = doubled.collect();'),
      alts:[LAZY('let list = doubled.collect::<Vec<i32>>();'),LAZY('let list: Vec<_> = doubled.collect();')],
      wrong:[
        {src:MAIN('let shells = vec![2, 5, 9];','let list: Vec<i32> = shells.iter().map(|n| {','    println!("doubling {}", n);','    n * 2','}).collect();','println!("before");','println!("{}", list.len());'),wrongWhy:'check'},
        {src:LAZY('let list: Vec<String> = doubled.collect();'),wrongWhy:'E0277'}
      ],
      lazy:[
        {src:MAIN('let list: Vec<i32> = vec![4, 10, 18];','println!("before");','println!("doubling 2");','println!("doubling 5");','println!("doubling 9");','println!("{}", list.len());'),wrongWhy:'check'},
        {src:MAIN('let shells = vec![2, 5, 9];','let _l: Vec<i32> = shells.iter().map(|n| n * 2).collect();','println!("before");','let mut i = 0;','while i < shells.len() {','    println!("doubling {}", shells[i]);','    i += 1;','}','println!("{}", shells.len());'),wrongWhy:'check'}
      ],
      defines:[],previews:[],
      check:c=>{
        if(c.out()!==LAZY_OUT)return 'The program has to print `before`, then a `doubling` line for each shell, then `3`.';
        if(c.usesMethod('map')<1||c.usesMethod('collect')<1||c.count('for')+c.count('while')+c.count('loop')>0)return 'Keep the pipeline: `iter()`, `map` and `collect`, with no loop.';
        if(c.printsIn(true)<1||c.printsIn(false)>2)return 'The `doubling` lines have to be printed by the closure inside `map`.';
        return OTHER(c,'before\ndoubling 1\ndoubling 3\n2\n','The pipeline has to run on the shells in the vector, so another vector has to show up.',['vec![2, 5, 9]','vec![1, 3]']);
      }
    },
    {
      title:'Filter and add up',kind:'fix',
      goal:`This program keeps the shells bigger than 6 and adds them up, but <code>collect</code> stops with <code>E0277</code>: it cannot build a <code>Vec&lt;i32&gt;</code> from these items. Fix the pipeline so the program prints <code>[8, 12, 20]</code> and then <code>40</code>.`,
      how:[
        `The whole program has five shells, a <code>filter</code> that keeps the big ones, a <code>collect</code> into a <code>Vec&lt;i32&gt;</code>, and a <code>sum</code> of that vector. The closure of <code>filter</code> gets a reference to each item, and the items of <code>iter()</code> are already references, so <code>n</code> is a <code>&&i32</code> and the test needs two stars: <code>**n > 6</code>.`,
        `<code>iter()</code> lends each shell, so its items are <code>&i32</code>, and <code>filter</code> keeps them as they are. <code>collect</code> then has references to build a <code>Vec&lt;i32&gt;</code> from, and a vector of numbers cannot be built from references. That is <code>E0277</code>.`,
        `Turn the references into numbers before collecting. <code>copied()</code> does it for types that are cheap to copy, such as <code>i32</code>: <code>.filter(...).copied().collect()</code>. <code>cloned()</code> does it with <code>clone</code>, and <code>.map(|n| *n)</code> says the same by hand.`,
        `Other consumers work on the same pipelines: <code>count</code>, <code>sum</code>, <code>fold</code>, <code>min</code> and <code>max</code> give one value, <code>any</code> and <code>all</code> give a <code>bool</code>, and <code>find</code> and <code>position</code> give an <code>Option</code>. They stop pulling as soon as the answer is known.`
      ],
      explain:`The two kinds of item are the usual source of trouble with iterators: <code>iter()</code> gives references, <code>into_iter()</code> on a vector you own gives the values themselves, and <code>iter_mut()</code> gives <code>&mut</code>. <code>copied()</code> and <code>cloned()</code> move between them. <code>sum</code> gives back the number type of its items, and the type on the <code>let</code> tells it which one to build. <code>sum</code> on references works because the standard library adds up <code>&i32</code> as well.`,
      hint:`Write <code>.copied()</code> between the <code>filter</code> and the <code>collect</code>.`,
      starter:BIG('.collect()'),
      starterErr:'E0277',
      answer:BIG('.copied().collect()'),
      alts:[BIG('.cloned().collect()'),BIG('.map(|n| *n).collect()')],
      wrong:[
        {src:J(MAIN('let shells = vec![3, 8, 12, 5, 20];','let big: Vec<i32> = shells.iter().filter(|n| **n > 3).copied().collect();','println!("{:?}", big);','let total: i32 = big.iter().sum();','println!("{}", total);')),wrongWhy:'check'}
      ],
      lazy:[
        {src:MAIN('let big: Vec<i32> = vec![8, 12, 20];','println!("{:?}", big);','let total: i32 = big.iter().sum();','println!("{}", total);'),wrongWhy:'check'},
        {src:MAIN('let shells = vec![3, 8, 12, 5, 20];','let mut big: Vec<i32> = Vec::new();','for n in shells.iter() {','    if *n > 6 {','        big.push(*n);','    }','}','println!("{:?}", big);','let total: i32 = big.iter().sum();','println!("{}", total);'),wrongWhy:'check'},
        {src:MAIN('let shells = vec![3, 8, 12, 5, 20];','let _d: Vec<i32> = shells.iter().filter(|n| **n > 6).copied().collect();','let mut big: Vec<i32> = Vec::new();','let mut i = 0;','while i < shells.len() {','    if shells[i] > 6 {','        big.push(shells[i]);','    }','    i += 1;','}','println!("{:?}", big);','let total: i32 = big.iter().sum();','println!("{}", total);'),wrongWhy:'check'}
      ],
      defines:[],previews:[],
      check:c=>{
        if(c.out()!=='[8, 12, 20]\n40\n')return 'The program has to print `[8, 12, 20]` and then `40`.';
        if(c.usesMethod('filter')<1||c.usesMethod('collect')<1||c.count('for')+c.count('while')+c.count('loop')>0)return 'Keep the pipeline: `filter` and `collect`, with no loop.';
        if(c.chainOn('main','collect','filter')<1)return '`big` has to be the result of the `filter` and `collect` pipeline.';
        return OTHER(c,'[10, 7]\n17\n','The pipeline has to keep the shells above 6 from the vector, so another vector has to show up.',['vec![3, 8, 12, 5, 20]','vec![10, 2, 7]']);
      }
    },
    {
      title:'Closures in std methods',kind:'write',
      goal:`Write two functions with closures. <code>tidy</code> keeps only the sizes above <code>4</code> and sorts them largest first. <code>top_double</code> gives back twice the first size, or <code>0</code> when the vector is empty. The hidden <code>main</code> should print <code>[30, 18, 9, 5]</code>, <code>60</code> and <code>0</code>.`,
      how:[
        `The whole program calls <code>tidy</code> on a vector of sizes, prints it, and then calls <code>top_double</code> on the result and on an empty vector. Many standard methods take a closure that says what to do with each item, so you can describe the rule instead of writing the loop.`,
        `<code>sizes.retain(|s| *s > 4)</code> keeps the items the closure says <code>true</code> for. <code>sizes.sort_by_key(|s| -*s)</code> sorts by the number the closure gives back, and a negated size puts the largest first. In both, <code>s</code> is a reference to the item, so it needs a <code>*</code> to be used as a number.`,
        `<code>top_double</code> starts from <code>sizes.first()</code>, an <code>Option</code>. <code>.map(|s| s * 2)</code> changes the value inside <code>Some</code> and leaves <code>None</code> alone, and <code>.unwrap_or_else(|| 0)</code> takes the value out, or runs its closure when there is none.`,
        `<code>Option</code> and <code>Result</code> have these too: <code>map</code>, <code>and_then</code>, <code>unwrap_or_else</code>. A <code>HashMap</code> has <code>entry(key).or_insert_with(|| value)</code>, which builds the value only when the key is missing.`
      ],
      explain:`Passing a closure keeps the method general and the rule yours. A rule with a side effect can also be given: <code>unwrap_or_else</code> runs its closure only when it has to, unlike <code>unwrap_or(expensive())</code>, which computes its argument first every time. The closures here are <code>FnMut</code> or <code>FnOnce</code>, so they may capture and change variables; the method says which it needs.`,
      hint:`In <code>tidy</code> write <code>sizes.retain(|s| *s > 4);</code> and <code>sizes.sort_by_key(|s| -*s);</code>. In <code>top_double</code> write <code>sizes.first().map(|s| s * 2).unwrap_or_else(|| 0)</code>.`,
      harness:SIZES_MAIN,
      starter:J(L('// Fill in both functions.'),FN('fn tidy(sizes: &mut Vec<i32>)'),FN('fn top_double(sizes: &Vec<i32>) -> i32','0')),
      answer:J(STD_TIDY,STD_TOP),
      alts:[J(TIDY('sizes.retain(|s| *s >= 5);','sizes.sort_by_key(|s| 0 - *s);'),TOP('sizes.first().and_then(|s| Some(s * 2)).unwrap_or_else(|| 0)'))],
      wrong:[
        {src:J(TIDY('sizes.retain(|s| *s > 4);','sizes.sort_by_key(|s| *s);'),STD_TOP),wrongWhy:'check'},
        {src:J(STD_TIDY,TOP('sizes.first().map(|s| s * 3).unwrap_or_else(|| 0)')),wrongWhy:'check'}
      ],
      lazy:[
        {src:J(TIDY('sizes.clear();','sizes.push(30);','sizes.push(18);','sizes.push(9);','sizes.push(5);'),STD_TOP),wrongWhy:'check'},
        {src:J(TIDY('let mut other = vec![3, 1];','other.retain(|s| *s > 2);','other.sort_by_key(|s| -*s);','let mut kept: Vec<i32> = Vec::new();','for s in sizes.iter() {','    if *s > 4 {','        kept.push(*s);','    }','}','kept.sort_by_key(|s| -*s);','*sizes = kept;'),TOP('let _z = sizes.first().map(|s| s * 2).unwrap_or_else(|| 0);','let mut best = 0;','for s in sizes.iter() {','    if *s * 2 > best {','        best = *s * 2;','    }','}','best')),wrongWhy:'check'},
        {src:J(STD_TIDY,TOP('let _q = Some(1).map(|s| s * 2).unwrap_or_else(|| 0);','let mut best = 0;','for s in sizes.iter() {','    if *s * 2 > best {','        best = *s * 2;','    }','}','best')),wrongWhy:'check'}
      ],
      defines:[],previews:[],
      check:c=>{
        if(c.out()!=='[30, 18, 9, 5]\n60\n0\n')return 'The program has to print `[30, 18, 9, 5]`, `60` and `0`.';
        const missing=[['retain','tidy'],['sort_by_key','tidy'],['unwrap_or_else','top_double']].filter(([m,fn])=>m==='unwrap_or_else'?c.chainOn(fn,m,'first')<1:c.onRecv(fn,m,'sizes')<1);
        if(missing.length)return 'Use the closure methods on `sizes`, and finish `top_double` with `unwrap_or_else`: still missing '+missing.map(([m])=>'`'+m+'`').join(', ')+'.';
        if(['tidy','top_double'].some(fn=>c.countIn('for',fn)+c.countIn('while',fn)+c.countIn('loop',fn)>0))return 'Let the closure methods do the work, with no loop in `tidy` or `top_double`.';
        if(c.usesMethod('map')<1&&c.usesMethod('and_then')<1)return 'Change the first size inside the `Option` with `map` (or `and_then`).';
        return OTHER(c,'[7, 6]\n14\n0\n','The functions have to work on the vector `main` builds, so another vector has to show up.',['vec![30, 5, 18, 2, 9]','vec![1, 7, 4, 6]']);
      }
    }
  ]
});
})();
