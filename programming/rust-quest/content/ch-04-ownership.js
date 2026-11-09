/* Append only: a mission's key is '3.<index>' and shipped keys are never renumbered. DOM-free. */
(()=>{
'use strict';
const RQ=globalThis.RQ=globalThis.RQ||{};
const prog=body=>'fn main() {\n'+body+'}\n';
const STUB=note=>prog('    // '+note+'\n');
const SHOUT_MAIN='fn main() {\n    let a = String::from("hey");\n    let a = shout(a);\n    shout(a);\n    let b = String::from("yo");\n    shout(b);\n}\n';
const SHOUT=body=>'fn shout(s: String) -> String {\n'+body+'}\n';
const TWO='    let first = String::from("one");\n    let second = String::from("two");\n';

RQ.CH.push({
  name:'Ownership',
  badge:'Driftwood Key',
  story:'The tide clock points at a heap of driftwood where each piece has one owner; hand pieces on carefully, and find the driftwood key.',
  intro:'The tide clock points at a heap of driftwood where each piece has one owner, and Gus the gull snatches anything left lying about. Text that can grow lives in a piece of memory called the heap, and in Rust every such value has exactly one owner: the variable that holds it. This chapter shows what that means when you hand a value to another variable or to a function, and when Rust frees it. Press Run on any mission and a memory view appears, so you can watch the stack and the heap change one line at a time.',
  toolbox:'In this chapter: <code>String::from</code>, <code>push_str</code>, <code>.clone()</code>, <code>drop</code>, functions that take and return a <code>String</code>, and the memory view.',
  learned:['String','heap','move','Copy','clone','drop'],
  missions:[
    {
      title:'Put text on the heap',kind:'write',
      goal:'Make a <code>String</code> that holds <code>ahoy</code>, add <code>, Rust</code> to the end of it, and print it, so the line says <code>ahoy, Rust</code>.',
      how:[
        'The whole program builds a piece of text that can grow, adds to it, and prints it. Text that can grow is a <code>String</code>, and its letters live on the heap, not in the variable itself.',
        '<code>String::from("ahoy")</code> makes a <code>String</code> from a piece of text. <code>::</code> names a function that belongs to a type. Chapter 6 shows how to write your own.',
        '<code>s.push_str(", Rust")</code> adds text to the end of <code>s</code>. <code>.</code> calls a function that belongs to the value. Chapter 6 shows how to write your own. Changing <code>s</code> means it has to be declared with <code>let mut</code>.',
        'Both <code>println!("{}", s)</code> and <code>push_str</code> leave <code>s</code> usable afterwards. They borrow <code>s</code> for a moment and give it back. Chapter 5 explains borrowing.'
      ],
      explain:'A variable such as <code>s</code> sits on the stack and holds only a small note: where the text is, and how long it is. The letters themselves sit on the heap. When the text grows, the heap part grows, and <code>s</code> still owns it. Run the program and drag the step slider to see both.',
      hint:'Write <code>let mut s = String::from("ahoy");</code>, then <code>s.push_str(", Rust");</code>, then print <code>s</code>.',
      starter:STUB('make the String, add to it, print it'),
      answer:prog('    let mut s = String::from("ahoy");\n    s.push_str(", Rust");\n    println!("{}", s);\n'),
      alts:[prog('    let mut s = String::new();\n    s.push_str("ahoy");\n    s.push_str(", Rust");\n    println!("{}", s);\n'),prog('    let mut greeting = String::from("ahoy");\n    greeting.push_str(", Rust");\n    println!("{}", greeting);\n')],
      wrong:[{src:prog('    let mut s = String::from("ahoy");\n    s.push_str(" Rust");\n    println!("{}", s);\n'),wrongWhy:'check'},{src:prog('    let s = String::from("ahoy");\n    s.push_str(", Rust");\n    println!("{}", s);\n'),wrongWhy:'E0596'}],
      lazy:[{src:prog('    println!("ahoy, Rust");\n'),wrongWhy:'check'},{src:prog('    let s = String::from("ahoy, Rust");\n    println!("{}", s);\n'),wrongWhy:'check'}],
      defines:[],
      previews:[
        {tag:'path-call',wording:'<code>::</code> names a function that belongs to a type. Chapter 6 shows how to write your own.',home:6},
        {tag:'method-call',wording:'<code>.</code> calls a function that belongs to the value. Chapter 6 shows how to write your own.',home:6},
        {tag:'borrow-note',wording:'They borrow <code>s</code> for a moment and give it back. Chapter 5 explains borrowing.',home:5}
      ],
      check:c=>c.out()!=='ahoy, Rust\n'?'The program has to print `ahoy, Rust` on one line, with the comma after `ahoy`.':c.allocs('String')!==1?'Build one `String` with `String::from` (or `String::new`) and grow that same `String`.':c.usesMethod('push_str')<1?'Add the second part with `push_str`, so the same `String` grows.':true
    },
    {
      title:'One owner at a time',kind:'fix',
      goal:'This program stops with an error, because <code>a</code> is used after it has moved to <code>b</code>. Fix it so it prints <code>hi</code>, and keep a single <code>String</code>.',
      how:[
        'The whole program makes a <code>String</code>, hands it to a second variable and then prints the first. Rust refuses, because a <code>String</code> has exactly one owner.',
        '<code>let b = a;</code> does not copy the text. It moves the <code>String</code>: <code>b</code> is the owner now, and <code>a</code> is left empty-handed.',
        'Using <code>a</code> after that is the error <code>E0382</code>, use of a moved value.',
        'Print the new owner <code>b</code> instead, or skip the move and keep using <code>a</code>.'
      ],
      explain:'<code>E0382</code> means a value was used after it moved. Moving is how Rust makes sure only one variable frees a <code>String</code>: if two names both owned it, it would be freed twice. Run it and watch <code>a</code> turn grey in the memory view once it has moved.',
      hint:'Change the <code>println!</code> to print <code>b</code>.',
      starter:prog('    let a = String::from("hi");\n    let b = a;\n    println!("{}", a);\n'),
      starterErr:'E0382',
      answer:prog('    let a = String::from("hi");\n    let b = a;\n    println!("{}", b);\n'),
      alts:[prog('    let a = String::from("hi");\n    println!("{}", a);\n'),prog('    let a = String::from("hi");\n    let b = a;\n    let c = b;\n    println!("{}", c);\n')],
      wrong:[{src:prog('    let a = String::from("hi");\n    let b = a;\n    println!("{} {}", a, b);\n'),wrongWhy:'E0382'},{src:prog('    let a = String::from("hi");\n    let b = a.clone();\n    println!("{}", b);\n'),wrongWhy:'check'}],
      lazy:[{src:prog('    println!("hi");\n'),wrongWhy:'check'},{src:prog('    let a = String::from("hi");\n    let b = String::from("hi");\n    println!("{}", b);\n'),wrongWhy:'check'}],
      defines:[],previews:[],
      check:c=>c.out()!=='hi\n'?'The program has to print `hi` on one line.':c.allocs('String')!==1?'Keep a single `String`: do not copy or rebuild the text.':c.count('var-use')<1?'Print the variable that owns the `String`.':true
    },
    {
      title:'Numbers just copy',kind:'write',
      goal:'Give <code>price</code> the value <code>7</code>, make <code>copy</code> from it, and print both on one line, so it says <code>7 7</code>.',
      how:[
        'The whole program copies a number into a second variable with <code>let</code> and prints both, to show that the first one still works.',
        '<code>let copy = price;</code> copies the number, because a plain number is small and cheap to copy. A type that works like this is called <code>Copy</code>.',
        '<code>println!("{} {}", price, copy);</code> fills two holes, one with each variable. Both are still usable.',
        'A <code>String</code> is different: it owns heap memory, so <code>let b = a;</code> moves it instead.'
      ],
      explain:'Numbers, <code>bool</code> and <code>char</code> are <code>Copy</code> types: assigning one never moves it. That is why <code>price</code> still works after <code>let copy = price;</code>, while a <code>String</code> would not.',
      hint:'Write <code>let price = 7;</code>, then <code>let copy = price;</code>, then print both.',
      starter:STUB('make price, copy it, print both'),
      answer:prog('    let price = 7;\n    let copy = price;\n    println!("{} {}", price, copy);\n'),
      alts:[prog('    let price = 7;\n    let copy = price;\n    print!("{} ", price);\n    println!("{}", copy);\n'),prog('    let price: i32 = 7;\n    let copy = price;\n    println!("{} {}", price, copy);\n')],
      wrong:[{src:prog('    let price = 7;\n    let copy = price + 1;\n    println!("{} {}", price, copy);\n'),wrongWhy:'check'},{src:prog('    let price = 7;\n    let copy = price;\n    println!("{} {}", copy, price + 1);\n'),wrongWhy:'check'}],
      lazy:[{src:prog('    println!("7 7");\n'),wrongWhy:'check'},{src:prog('    let price = 7;\n    let copy = 7;\n    println!("{} {}", price, copy);\n'),wrongWhy:'check'}],
      defines:[],previews:[],
      check:c=>c.out()!=='7 7\n'?'The program has to print `7 7` on one line.':c.count('var-use')<3?'Make `copy` from `price` (`let copy = price;`) and then print both variables.':true
    },
    {
      title:'Copy a String on purpose',kind:'fix',
      goal:'This program wants to print <code>hi hi</code>, but it moves <code>a</code> into <code>b</code> and then uses <code>a</code>. Fix it so both variables hold their own <code>String</code>.',
      how:[
        'The whole program wants two independent Strings with the same text. Today <code>b</code> takes the only one, so printing <code>a</code> fails with <code>E0382</code>.',
        '<code>a.clone()</code> builds a second <code>String</code> on the heap with the same letters. Nothing moves, so <code>a</code> keeps working.',
        '<code>let b = a.clone();</code> gives <code>b</code> its own copy to own.',
        'A copy costs time and memory, so Rust makes you ask for it in writing. A plain <code>let b = a;</code> never copies a <code>String</code>.'
      ],
      explain:'<code>.clone()</code> is the way to say "I really want a second copy". Afterwards there are two owners of two separate pieces of heap memory. The memory view shows two heap boxes, one per variable.',
      hint:'Replace <code>a</code> with <code>a.clone()</code> on the <code>let b</code> line.',
      starter:prog('    let a = String::from("hi");\n    let b = a;\n    println!("{} {}", a, b);\n'),
      starterErr:'E0382',
      answer:prog('    let a = String::from("hi");\n    let b = a.clone();\n    println!("{} {}", a, b);\n'),
      alts:[prog('    let a = String::from("hi");\n    let b = a.to_string();\n    println!("{} {}", a, b);\n'),prog('    let a = String::from("hi");\n    let b = String::from("hi");\n    println!("{} {}", a, b);\n')],
      wrong:[{src:prog('    let a = String::from("hi");\n    let b = a.clone();\n    println!("{}", b);\n'),wrongWhy:'check'},{src:prog('    let a = String::from("hi");\n    let b = a.len();\n    println!("{} {}", a, b);\n'),wrongWhy:'check'}],
      lazy:[{src:prog('    println!("hi hi");\n'),wrongWhy:'check'},{src:prog('    let a = String::from("hi");\n    let b = a;\n    println!("{} {}", b, b);\n'),wrongWhy:'check'},{src:prog('    let a = String::from("hi");\n    println!("{} {}", a, a);\n'),wrongWhy:'check'}],
      defines:[],previews:[],
      check:c=>c.out()!=='hi hi\n'?'The program has to print `hi hi` on one line.':c.moved('a')?'`a` still moves. Copy it with `.clone()` instead of handing it over.':c.allocs('String')!==2?'You need exactly two `String`s: the original and one copy.':true
    },
    {
      title:'Take it in, give it back',kind:'fix',
      goal:'The hidden <code>main</code> shouts <code>hey</code> twice and then <code>yo</code>. <code>shout</code> swallows its <code>String</code>, so the second call has nothing to use. Change <code>shout</code> so it gives the <code>String</code> back. The program should print <code>hey!</code>, <code>hey!</code> and <code>yo!</code>, with no copies.',
      how:[
        'The whole program passes Strings into <code>shout</code>, which prints them. Today the function keeps each one and frees it, so <code>main</code> cannot use it again.',
        'A parameter such as <code>s: String</code> takes ownership: the caller\'s variable moves into the function, and the function frees it at its end.',
        'Add <code>-> String</code> and finish the body with <code>s</code> as the last line, with no <code>;</code>. Now ownership goes back to the caller.',
        '<code>let a = shout(a);</code> in <code>main</code> makes a new <code>a</code> from the returned value, so it can be used again.'
      ],
      explain:'Passing a <code>String</code> to a function moves it, and returning it moves it back. You never need a copy for that: there is still exactly one owner at every moment. Chapter 5 shows a lighter way, borrowing: <code>&</code> in front of a name lends the value without moving it. Chapter 5 explains the <code>&</code>.',
      hint:'Make <code>shout</code> return its parameter: add <code>-> String</code> after the parentheses, and put <code>s</code> as the last line of the body.',
      previews:[{tag:'ref-type',wording:'<code>&</code> in front of a name lends the value without moving it. Chapter 5 explains the <code>&</code>.',home:5}],
      harness:SHOUT_MAIN,
      starter:'fn shout(s: String) {\n    println!("{}!", s);\n}\n',
      starterErr:'E0308',
      answer:SHOUT('    println!("{}!", s);\n    s\n'),
      alts:[SHOUT('    println!("{}!", s);\n    return s;\n'),SHOUT('    let t = s;\n    println!("{}!", t);\n    t\n')],
      wrong:[{src:SHOUT('    println!("{}", s);\n    s\n'),wrongWhy:'check'},{src:SHOUT('    println!("{}!", s);\n    println!("{}!", s);\n    s\n'),wrongWhy:'check'}],
      lazy:[
        {src:SHOUT('    println!("{}!", s);\n    s.clone()\n'),wrongWhy:'check'},
        {src:SHOUT('    println!("{}!", s);\n    s.to_owned()\n'),wrongWhy:'check'},
        {src:SHOUT('    println!("{}!", s);\n    s.to_string()\n'),wrongWhy:'check'},
        {src:SHOUT('    println!("{}!", s);\n    String::from(s.as_str())\n'),wrongWhy:'check'},
        {src:SHOUT('    println!("{}!", s);\n    format!("{}", s)\n'),wrongWhy:'check'},
        {src:SHOUT('    println!("{}!", s);\n    Clone::clone(&s)\n'),wrongWhy:'check'},
        {src:SHOUT('    s\n'),wrongWhy:'check'},
        {src:SHOUT('    println!("hey!");\n    s\n'),wrongWhy:'check'},
        {src:SHOUT('    println!("{}!", s);\n    String::from("hey")\n'),wrongWhy:'check'}
      ],
      defines:[],
      check:c=>c.out()!=='hey!\nhey!\nyo!\n'?'`shout` has to print each word with a `!`, and `main` has to be able to shout `hey` twice and then `yo`: the output is `hey!`, `hey!`, `yo!`.':c.allocs('String')!==2?'The only `String`s should be the two that `main` builds. Hand the same `String` back; do not copy it.':true
    },
    {
      title:'Free a String early',kind:'write',
      goal:'Two Strings are made and printed. Free <code>first</code> yourself, before <code>done</code> is printed, so that <code>first</code> goes away before <code>second</code> does.',
      how:[
        'The whole program makes two Strings, prints them, and ends. Rust frees a variable\'s memory when it goes out of scope, so at the closing <code>}</code> it frees <code>second</code> first and <code>first</code> after, the reverse of the order they were made in.',
        '<code>drop(first);</code> frees <code>first</code> right now. It takes ownership of the value, so <code>first</code> moves into <code>drop</code> and its memory is freed.',
        'After <code>drop(first)</code> the name <code>first</code> is empty-handed, so do not use it again: that would be <code>E0382</code>.',
        'In the memory view, the heap box for <code>first</code> disappears at the <code>drop</code> step, not at the end.'
      ],
      explain:'Rust frees memory for you, always at a known place: the end of the block, in reverse order of declaration. Calling <code>drop</code> lets you pick an earlier moment, for example to release something big as soon as you are done with it.',
      hint:'Write <code>drop(first);</code> on the line after the <code>println!</code> that prints both, before the line that prints <code>done</code>.',
      starter:prog(TWO+'    println!("{} {}", first, second);\n    // free first here\n    println!("done");\n'),
      answer:prog(TWO+'    println!("{} {}", first, second);\n    drop(first);\n    println!("done");\n'),
      alts:[prog(TWO+'    print!("{} ", first);\n    println!("{}", second);\n    drop(first);\n    println!("done");\n'),prog(TWO+'    let size = second.len();\n    println!("{} {}", first, second);\n    drop(first);\n    println!("done");\n')],
      wrong:[{src:prog(TWO+'    println!("{} {}", first, second);\n    drop(second);\n    println!("done");\n'),wrongWhy:'check'},{src:prog(TWO+'    drop(first);\n    println!("{} {}", first, second);\n    println!("done");\n'),wrongWhy:'E0382'},{src:prog(TWO+'    println!("{} {}", first, second);\n    println!("done");\n    drop(first);\n'),wrongWhy:'check'}],
      lazy:[{src:prog('    let second = String::from("two");\n    let first = String::from("one");\n    println!("{} {}", first, second);\n    println!("done");\n'),wrongWhy:'check'},{src:prog(TWO+'    println!("{} {}", first, second);\n    println!("done");\n'),wrongWhy:'check'}],
      defines:[],previews:[],
      check:c=>c.out()!=='one two\ndone\n'?'The program has to print `one two` and then `done`.':c.calls('drop')<1?'Free `first` yourself with `drop(first);`.':c.dropOrder().join(',')!=='first,second'?'`first` has to be freed before `second`. Call `drop(first);` before the program ends.':c.events.findIndex(e=>e.t==='drop'&&e.name==='first')>c.events.map(e=>e.t).lastIndexOf('print')?'Free `first` before `done` is printed, not after.':true
    }
  ]
});
})();
