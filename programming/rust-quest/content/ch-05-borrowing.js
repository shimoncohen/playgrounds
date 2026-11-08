/* Append only: a mission's key is '4.<index>' and shipped keys are never renumbered. DOM-free. */
(()=>{
'use strict';
const RQ=globalThis.RQ=globalThis.RQ||{};
const prog=body=>'fn main() {\n'+body+'}\n';
const SHOUT=(sig,body)=>'fn shout('+sig+') {\n'+body+'}\n\nfn main() {\n    let a = String::from("hey");\n    shout(&a);\n    println!("{} is still here", a);\n}\n';
const HEAD='fn head(s: &str, n: usize) -> &str {\n    &s[..n]\n}\n';
const HEAD_MAIN='fn main() {\n    let s = String::from("hello world");\n    println!("{}", head(&s, 5));\n    println!("{}", head(&s, 3));\n    let t = String::from("rustacean");\n    println!("{}", head(&t, 4));\n}\n';
const HEADFN=(sig,body)=>'fn head('+sig+' {\n'+body+'}\n';
const LOCKED=(mid)=>HEAD+'\nfn main() {\n    let mut s = String::from("hello world");\n    let word = head(&s, 5);\n'+mid+'}\n';
const LONGEST_MAIN='fn main() {\n    println!("{}", longest("tiny", "bigger"));\n    println!("{}", longest("longer", "hi"));\n}\n';
const LONGEST=(ret,body)=>'fn longest(a: &str, b: &str) -> '+ret+' {\n'+body+'}\n';
const PICK='    if a.len() > b.len() {\n        a.to_string()\n    } else {\n        b.to_string()\n    }\n';
const TWO_MAIN='fn main() {\n    println!("{}", first_two("hello"));\n    println!("{}", first_two("world"));\n}\n';
const TWO=(body)=>'fn first_two(s: &str) -> &str {\n'+body+'}\n';
const ONE='    let s = String::from("hello");\n';

RQ.CH.push({
  name:'Borrowing',
  badge:'Loan Keeper',
  intro:'Moving a value around is safe, but handing it over every time is clumsy. Rust lets you lend a value instead: you give out a <em>reference</em>, the borrower looks at the value (or, with a stricter kind of loan, changes it), and the owner keeps ownership. The compiler checks every loan, and its error messages in this chapter tell you what it saw. The memory view draws each loan as a dashed arrow back to the borrowed value.',
  toolbox:'In this chapter: <code>&</code> and <code>&mut</code> parameters, <code>&s[0..5]</code> slices, a function that returns a <code>&str</code>, and the errors <code>E0502</code>, <code>E0596</code>, <code>E0106</code> and <code>E0515</code>.',
  learned:['&','&mut','borrow','slice','E0502'],
  missions:[
    {
      title:'Lend instead of give',kind:'fix',
      goal:'This program stops with an error, because <code>main</code> lends its <code>String</code> to <code>shout</code> with <code>&</code>, but <code>shout</code> still wants to own it. Change <code>shout</code> so it only borrows. The program should print <code>hey!</code> and then <code>hey is still here</code>, with no copies.',
      how:[
        'The whole program makes a <code>String</code>, lets <code>shout</code> print it, and then prints it again. Today <code>shout</code> takes the <code>String</code> by value, and a plain <code>String</code> parameter does not accept a loan.',
        '<code>&a</code> in <code>main</code> is a <em>reference</em> to <code>a</code>: it lends <code>a</code> to the function and does not move it. <code>main</code> still owns <code>a</code>.',
        'A parameter written <code>s: &String</code> is the matching type: a reference to a <code>String</code>. Reading through it works like reading the <code>String</code> itself, so <code>println!("{}!", s)</code> needs no change.',
        'When <code>shout</code> ends, the loan ends and nothing is freed, because the owner is still <code>main</code>. That is what <code>println!</code> was doing all along in chapter 4: it borrowed its arguments for a moment and gave them back.'
      ],
      explain:'A reference lets a function look at a value without taking it over. Compare with chapter 4: there the function had to return the <code>String</code> so the caller could use it again. Here <code>main</code> never lets go of <code>a</code>, so there are no copies and no hand-backs. Press Run and look for the dashed arrow: it points from the parameter back to the variable it borrows.',
      hint:'Change the parameter type from <code>String</code> to <code>&String</code>. The body stays the same.',
      starter:SHOUT('s: String','    println!("{}!", s);\n'),
      starterErr:'E0308',
      answer:SHOUT('s: &String','    println!("{}!", s);\n'),
      alts:[SHOUT('s: &str','    println!("{}!", s);\n'),SHOUT('text: &String','    println!("{}!", text);\n')],
      wrong:[
        {src:SHOUT('s: &String','    println!("{}", s);\n'),wrongWhy:'check'},
        {src:SHOUT('s: &mut String','    println!("{}!", s);\n'),wrongWhy:'E0308'}
      ],
      lazy:[
        {src:SHOUT('s: &String','    let t = s.clone();\n    println!("{}!", t);\n'),wrongWhy:'check'},
        {src:SHOUT('s: &String','    let t = s.to_owned();\n    println!("{}!", t);\n'),wrongWhy:'check'},
        {src:SHOUT('s: &String','    let t = s.to_string();\n    println!("{}!", t);\n'),wrongWhy:'check'},
        {src:SHOUT('s: &String','    let t = String::from(s.as_str());\n    println!("{}!", t);\n'),wrongWhy:'check'},
        {src:SHOUT('s: &String','    let t = format!("{}", s);\n    println!("{}!", t);\n'),wrongWhy:'check'},
        {src:SHOUT('s: &String','    let t = Clone::clone(s);\n    println!("{}!", t);\n'),wrongWhy:'check'},
        {src:SHOUT('s: &String',''),wrongWhy:'check'},
        {src:SHOUT('s: &String','    println!("hey!");\n'),wrongWhy:'check'}
      ],
      defines:['ref-type'],previews:[],
      check:c=>c.out()!=='hey!\nhey is still here\n'?'`shout` has to print the word with a `!`, and then `main` prints `hey is still here`.':!c.paramIsRef('shout',0)?'Make the parameter a reference, so `shout` borrows its `String` instead of taking it.':c.calls('shout')<1?'Keep the call to `shout` in `main`.':c.allocs('String')!==1?'The only `String` should be the one `main` builds. Borrow it; do not copy it.':c.count('hole')<2?'Print the `String` that `shout` was lent through a `{}` hole.':true
    },
    {
      title:'Borrow it to change it',kind:'fix',
      goal:'This program stops with an error, because <code>shout</code> tries to add a <code>!</code> through a plain <code>&</code> reference. Fix it so it prints <code>hey!</code>.',
      how:[
        'The whole program lends <code>word</code> to <code>shout</code>, which adds a <code>!</code> to it, and then prints it. A plain <code>&</code> loan is read-only, so Rust refuses the change with <code>E0596</code>.',
        '<code>&mut</code> is the second kind of loan. A <code>&mut String</code> lets the borrower change the <code>String</code>, so <code>s.push_str("!")</code> is allowed through it.',
        'Both ends have to say <code>mut</code>: the parameter is <code>s: &mut String</code> and the caller lends with <code>&mut word</code>. The variable itself is already declared with <code>let mut</code>, because a loan cannot allow more than its owner does.',
        'The change lands in <code>word</code> itself, so the last line prints <code>hey!</code>.'
      ],
      explain:'<code>E0596</code> means you tried to change something through a loan that only lets you look. A <code>&mut</code> loan is exclusive: while it is in use, nothing else may look at the same value. That is why Rust asks you to write <code>mut</code> in both places: it makes every change visible in the code. If you change only the parameter, the call <code>shout(&word)</code> no longer fits (<code>E0308</code>).',
      hint:'Write <code>&mut String</code> for the parameter and <code>&mut word</code> in the call.',
      starter:'fn shout(s: &String) {\n    s.push_str("!");\n}\n\nfn main() {\n    let mut word = String::from("hey");\n    shout(&word);\n    println!("{}", word);\n}\n',
      starterErr:'E0596',
      answer:'fn shout(s: &mut String) {\n    s.push_str("!");\n}\n\nfn main() {\n    let mut word = String::from("hey");\n    shout(&mut word);\n    println!("{}", word);\n}\n',
      alts:['fn shout(text: &mut String) {\n    text.push_str("!");\n}\n\nfn main() {\n    let mut word = String::from("hey");\n    shout(&mut word);\n    println!("{}", word);\n}\n'],
      wrong:[
        {src:'fn shout(s: &mut String) {\n    s.push_str("!");\n}\n\nfn main() {\n    let mut word = String::from("hey");\n    shout(&word);\n    println!("{}", word);\n}\n',wrongWhy:'E0308'},
        {src:'fn shout(s: &String) {\n    s.push_str("!");\n}\n\nfn main() {\n    let mut word = String::from("hey");\n    shout(&word);\n    word.push_str("!");\n    println!("{}", word);\n}\n',wrongWhy:'E0596'},
        {src:'fn shout(s: &mut String) {\n    s.push_str("!!");\n}\n\nfn main() {\n    let mut word = String::from("hey");\n    shout(&mut word);\n    println!("{}", word);\n}\n',wrongWhy:'check'},
        {src:'fn shout(s: &mut String) {\n    s.push_str("!");\n}\n\nfn main() {\n    let word = String::from("hey");\n    shout(&mut word);\n    println!("{}", word);\n}\n',wrongWhy:'E0596'}
      ],
      lazy:[
        {src:'fn shout(s: &mut String) {\n}\n\nfn main() {\n    let mut word = String::from("hey");\n    shout(&mut word);\n    word.push_str("!");\n    println!("{}", word);\n}\n',wrongWhy:'check'},
        {src:'fn shout(s: &mut String) {\n    s.push_str("!");\n}\n\nfn main() {\n    let mut word = String::from("hey!");\n    println!("{}", word);\n}\n',wrongWhy:'check'},
        {src:'fn shout(s: &mut String) {\n    s.push_str("!");\n}\n\nfn main() {\n    println!("hey!");\n}\n',wrongWhy:'check'}
      ],
      defines:[],previews:[],
      check:c=>c.out()!=='hey!\n'?'The program has to print `hey!` on one line.':!c.paramIsRef('shout',0,'mut')?'`shout` has to take a `&mut String`, so it is allowed to change the text.':c.methodIn('shout','push_str')<1?'Let `shout` itself add the `!` with `push_str`.':c.calls('shout')<1?'Call `shout` from `main`.':c.allocs('String')!==1?'Keep the single `String`: do not copy it.':true
    },
    {
      title:'Many readers at once',kind:'write',
      goal:'Borrow <code>s</code> twice with <code>&</code>, into <code>first</code> and <code>second</code>, and print both on one line, so it says <code>hello hello</code>. Both borrows have to be alive at the same time.',
      how:[
        'The whole program makes one <code>String</code>, lends it out twice, and prints both loans together. The loans overlap, and Rust is fine with that.',
        '<code>let first = &s;</code> and <code>let second = &s;</code> are two <code>&</code> loans of the same <code>String</code>. Any number of them may exist at once, because nobody can change the text through a <code>&</code>.',
        '<code>println!("{} {}", first, second);</code> uses both in one line, so both loans are still alive when it runs. The memory view shows two dashed arrows pointing at <code>s</code>.'
      ],
      explain:'Rust has one rule for loans: many readers, or one writer, never both at the same time. Many <code>&</code> loans are many readers, so they can pile up freely. That rule is why a reader never sees a value change under its feet.',
      hint:'Write <code>let first = &s;</code>, then <code>let second = &s;</code>, then print both in a single <code>println!</code>.',
      starter:prog(ONE+'    // borrow s twice with &, then print both loans on one line\n'),
      answer:prog(ONE+'    let first = &s;\n    let second = &s;\n    println!("{} {}", first, second);\n'),
      alts:[prog(ONE+'    let first = &s;\n    println!("{} {}", first, &s);\n'),prog(ONE+'    let a = &s;\n    let b = &s;\n    println!("{} {}", b, a);\n')],
      wrong:[
        {src:prog('    let mut s = String::from("hello");\n    let first = &mut s;\n    let second = &mut s;\n    println!("{} {}", first, second);\n'),wrongWhy:'E0499'},
        {src:prog(ONE+'    let first = &s;\n    println!("{}", first);\n    let second = &s;\n    println!("{}", second);\n'),wrongWhy:'check'},
        {src:prog(ONE+'    let first = &s;\n    let second = &s;\n    println!("{}", first);\n'),wrongWhy:'check'}
      ],
      lazy:[
        {src:prog(ONE+'    println!("{} {}", s, s);\n'),wrongWhy:'check'},
        {src:prog(ONE+'    let first = s.clone();\n    let second = s.clone();\n    println!("{} {}", first, second);\n'),wrongWhy:'check'},
        {src:prog(ONE+'    let first = &s;\n    let second = first;\n    println!("{} {}", first, second);\n'),wrongWhy:'check'},
        {src:prog('    println!("hello hello");\n'),wrongWhy:'check'}
      ],
      defines:[],previews:[],
      check:c=>c.out()!=='hello hello\n'?'The program has to print `hello hello` on one line.':c.allocs('String')!==1?'Keep a single `String`: borrow it, do not copy it.':c.maxLive('shared')<2?'Borrow `s` twice with `&` and use both borrows in the same `println!`, so two loans are alive at once.':true
    },
    {
      title:'Readers first, then the writer',kind:'fix',
      goal:'This program stops with an error, because a <code>&mut</code> loan starts while the <code>&</code> loan <code>r</code> is still going to be used. Fix it so it prints <code>hello</code> and then <code>hello world</code>, and keep <code>r</code> and <code>m</code>.',
      how:[
        'The whole program reads <code>s</code> through <code>r</code>, then changes it through <code>m</code>, then prints it. Today the line that reads through <code>r</code> comes after <code>m</code> is made, so a reader and a writer overlap and Rust refuses with <code>E0502</code>.',
        'A loan lasts until its last use, not until the end of the block. Once the last line that uses <code>r</code> has run, <code>r</code> is finished and <code>s</code> is free to be borrowed again.',
        'So the order matters: use <code>r</code> up first, and only then make <code>m</code> with <code>let m = &mut s;</code>. The code does not need any other change.'
      ],
      explain:'<code>E0502</code> says a value is borrowed as mutable and as immutable at once. Many readers or one writer: here the writer <code>m</code> begins while the reader <code>r</code> is still needed later. Rust looks ahead for the last use of every loan, so moving the <code>println!</code> of <code>r</code> up shortens its life and the overlap is gone. The gutter next to the editor shows each loan as a bar over the lines where it is alive.',
      hint:'Move the line <code>println!("{}", r);</code> up so it comes before <code>let m = &mut s;</code>.',
      starter:prog('    let mut s = String::from("hello");\n    let r = &s;\n    let m = &mut s;\n    m.push_str(" world");\n    println!("{}", r);\n    println!("{}", s);\n'),
      starterErr:'E0502',
      answer:prog('    let mut s = String::from("hello");\n    let r = &s;\n    println!("{}", r);\n    let m = &mut s;\n    m.push_str(" world");\n    println!("{}", s);\n'),
      alts:[prog('    let mut s = String::from("hello");\n    let r = &s;\n    println!("{}", r);\n    let m = &mut s;\n    m.push_str(" world");\n    println!("{}", m);\n')],
      wrong:[
        {src:prog('    let mut s = String::from("hello");\n    let r = &s;\n    let m = &mut s;\n    println!("{}", r);\n    m.push_str(" world");\n    println!("{}", s);\n'),wrongWhy:'E0502'},
        {src:prog('    let mut s = String::from("hello");\n    let r = &s;\n    let m = &mut s;\n    m.push_str(" world");\n    println!("{}", s);\n    println!("{}", r);\n'),wrongWhy:'E0502'},
        {src:prog('    let mut s = String::from("hello");\n    let r = &s;\n    let m = &mut s;\n    m.push_str(" world");\n    println!("{}", s);\n'),wrongWhy:'check'}
      ],
      lazy:[
        {src:prog('    let mut s = String::from("hello");\n    let r = s.clone();\n    let m = &mut s;\n    m.push_str(" world");\n    println!("{}", r);\n    println!("{}", s);\n'),wrongWhy:'check'},
        {src:prog('    println!("hello");\n    println!("hello world");\n'),wrongWhy:'check'},
        {src:prog('    let mut s = String::from("hello");\n    let r = &s;\n    println!("{}", r);\n    s.push_str(" world");\n    println!("{}", s);\n'),wrongWhy:'check'}
      ],
      defines:[],previews:[],
      check:c=>c.out()!=='hello\nhello world\n'?'The program has to print `hello` and then `hello world`, one per line.':c.allocs('String')!==1?'Keep a single `String`: borrow it, do not copy it.':c.maxLive('mut')<1||c.maxLive('shared')<1?'Keep both loans, `r` with `&` and `m` with `&mut`, and put them in the right order.':true
    },
    {
      title:'Take a slice',kind:'write',
      goal:'<code>s</code> holds <code>hello world</code>. Print the two words on separate lines, <code>hello</code> and then <code>world</code>, each as a slice of <code>s</code>.',
      how:[
        'The whole program points at two parts of one <code>String</code> and prints each part. A <em>slice</em> is a reference to a stretch of a value: it borrows part of <code>s</code> and copies nothing.',
        '<code>&s[0..5]</code> is the slice of <code>s</code> from byte <code>0</code> up to, but not including, byte <code>5</code>. Its type is <code>&str</code>, the same type as text written in quotes, like <code>"hello"</code>.',
        '<code>&s[6..11]</code> takes the second word. A slice counts bytes, which is the same as counting letters for plain English text. Leave out one end and the range runs to that end: <code>&s[..5]</code> starts at the front, <code>&s[6..]</code> runs to the back.',
        'A slice is a loan like any other, so <code>s</code> stays borrowed while a slice of it is in use. The memory view shows the slice as a dashed arrow back to <code>s</code>.'
      ],
      explain:'That is why text written in quotes is a <code>&str</code>: it is a slice of text stored inside the program. Slicing a <code>String</code> gives the same type, so one function that takes <code>&str</code> accepts both. If the range reaches past the end, the program panics at run time with a message that names the byte index.',
      hint:'Write <code>let hello = &s[0..5];</code> and <code>let world = &s[6..11];</code>, then print each one.',
      starter:prog('    let s = String::from("hello world");\n    // print each word as a slice of s\n'),
      answer:prog('    let s = String::from("hello world");\n    let hello = &s[0..5];\n    let world = &s[6..11];\n    println!("{}", hello);\n    println!("{}", world);\n'),
      alts:[prog('    let s = String::from("hello world");\n    println!("{}", &s[..5]);\n    println!("{}", &s[6..]);\n'),prog('    let s = String::from("hello world");\n    let a = &s[0..5];\n    let b = &s[6..];\n    println!("{}\\n{}", a, b);\n')],
      wrong:[
        {src:prog('    let s = String::from("hello world");\n    let hello = &s[0..4];\n    let world = &s[6..11];\n    println!("{}", hello);\n    println!("{}", world);\n'),wrongWhy:'check'},
        {src:prog('    let s = String::from("hello world");\n    let hello = &s[0..5];\n    let world = &s[6..11];\n    println!("{}", world);\n    println!("{}", hello);\n'),wrongWhy:'check'}
      ],
      lazy:[
        {src:prog('    println!("hello");\n    println!("world");\n'),wrongWhy:'check'},
        {src:prog('    let hello = "hello";\n    let world = "world";\n    println!("{}", hello);\n    println!("{}", world);\n'),wrongWhy:'check'},
        {src:prog('    let hello = String::from("hello");\n    let world = String::from("world");\n    println!("{}", hello);\n    println!("{}", world);\n'),wrongWhy:'check'}
      ],
      defines:[],previews:[],
      check:c=>c.out()!=='hello\nworld\n'?'The program has to print `hello` and then `world`, one per line.':c.allocs('String')!==1?'Keep a single `String`: take the words as slices of `s`, do not build new Strings.':c.count('index')<2?'Take both words from `s` with a slice, like `&s[0..5]`.':true
    },
    {
      title:'A function that hands back a slice',kind:'write',
      goal:'The hidden <code>main</code> calls <code>head(&s, n)</code> three times and prints each answer. Write <code>head</code> so it returns the first <code>n</code> letters of its text as a slice. The output is <code>hello</code>, <code>hel</code> and <code>rust</code>.',
      how:[
        'The whole program asks <code>head</code> for the front of three different texts. <code>head</code> does not build a new <code>String</code>: it hands back a slice that points into the text it was lent.',
        'The signature <code>fn head(s: &str, n: usize) -> &str</code> takes one reference and gives one reference back. Rust reads that as "the result borrows from <code>s</code>", because <code>s</code> is the only reference that comes in.',
        'The body is the slice itself: <code>&s[..n]</code>. It is the last line and has no <code>;</code>, so it is the value the function returns.',
        'The slice from <code>head</code> points into the <code>String</code> in <code>main</code>, so it can be used until that <code>String</code> is changed or moved.'
      ],
      explain:'With exactly one reference going in, Rust assumes the reference coming out borrows from it, so you do not have to say so. Because the result borrows from <code>s</code>, the caller\'s <code>String</code> stays borrowed for as long as the result is in use, so it cannot be changed. The next missions show what that means, and what happens when there are not exactly one.',
      hint:'The signature is <code>fn head(s: &str, n: usize) -> &str</code> and the body is <code>&s[..n]</code>.',
      harness:HEAD_MAIN,
      starter:HEADFN('s: &str, n: usize) -> &str','    // return the first n letters of s as a slice\n    s\n'),
      answer:HEAD,
      alts:[HEADFN('s: &str, n: usize) -> &str','    &s[0..n]\n'),HEADFN('text: &String, n: usize) -> &str','    &text[..n]\n')],
      wrong:[
        {src:HEADFN('s: &str, n: usize) -> &str','    &s[..n + 1]\n'),wrongWhy:'check'},
        {src:HEADFN('s: &str, n: usize) -> String','    &s[..n]\n'),wrongWhy:'E0308'},
        {src:HEADFN('s: &str, n: usize) -> &str','    &s[n..]\n'),wrongWhy:'check'}
      ],
      lazy:[
        {src:HEADFN('s: &str, n: usize) -> &str','    if n == 5 {\n        "hello"\n    } else if n == 3 {\n        "hel"\n    } else {\n        "rust"\n    }\n'),wrongWhy:'check'},
        {src:HEADFN('s: &str, n: usize) -> &str','    s\n'),wrongWhy:'check'},
        {src:HEADFN('s: &str, n: usize) -> String','    String::from(&s[..n])\n'),wrongWhy:'check'}
      ],
      defines:[],previews:[],
      check:c=>c.out()!=='hello\nhel\nrust\n'?'`head(&s, n)` has to give back the first `n` letters: `hello`, `hel` and `rust`.':!c.paramIsRef('head',0)?'Take the text by reference, so `head` borrows it.':c.allocs('String')!==2?'The only `String`s should be the two that `main` builds. Hand back a slice; do not build a new `String`.':c.count('index')<1?'Take the front of `s` with a slice, like `&s[..n]`.':true
    },
    {
      title:'A slice keeps its String borrowed',kind:'fix',
      goal:'This program stops with an error, because <code>word</code> is a slice of <code>s</code> that is still going to be printed when <code>s.push_str</code> tries to change <code>s</code>. Fix it so it prints <code>hello</code> and then <code>hello world!</code>.',
      how:[
        'The whole program takes the first word of <code>s</code> with <code>head</code>, adds a <code>!</code> to <code>s</code>, and prints both. A slice of <code>s</code> is a loan of <code>s</code>, so <code>word</code> is a reader. <code>push_str</code> needs a writer, and the two overlap: <code>E0502</code>.',
        'A <code>String</code> may grow when you push to it, which can move its letters somewhere else on the heap. A slice that pointed at the old place would point at nothing. That is exactly what Rust protects you from.',
        'Use <code>word</code> up first, then change <code>s</code>. After the last use of <code>word</code> the loan is over, so the <code>push_str</code> is allowed.',
        'Copying the word into a new <code>String</code> would also silence the error, but it hides the lesson and builds a second <code>String</code> on the heap, so this mission asks for the borrowing fix.'
      ],
      explain:'This is the classic borrowing mistake: hold on to a piece of a string, change the string, and then use the piece. In many languages that is a bug you meet at run time. In Rust the compiler stops you at build time. The memory view of the error shows the loan bar of <code>word</code> reaching down over the <code>push_str</code> line.',
      hint:'Move the line that prints <code>word</code> above <code>s.push_str("!");</code>.',
      starter:LOCKED('    s.push_str("!");\n    println!("{}", word);\n    println!("{}", s);\n'),
      starterErr:'E0502',
      answer:LOCKED('    println!("{}", word);\n    s.push_str("!");\n    println!("{}", s);\n'),
      alts:[LOCKED('    println!("{}", word);\n    s.push_str("!");\n    let all = &s;\n    println!("{}", all);\n')],
      wrong:[
        {src:LOCKED('    s.push_str("!");\n    println!("{}", s);\n    println!("{}", word);\n'),wrongWhy:'E0502'},
        {src:LOCKED('    println!("{}", s);\n    s.push_str("!");\n    println!("{}", word);\n'),wrongWhy:'E0502'},
        {src:LOCKED('    println!("{}", word);\n    println!("{}", s);\n'),wrongWhy:'check'}
      ],
      lazy:[
        {src:LOCKED('    println!("hello");\n    println!("hello world!");\n'),wrongWhy:'check'},
        {src:HEAD+'\nfn main() {\n    let mut s = String::from("hello world");\n    let word = String::from(head(&s, 5));\n    s.push_str("!");\n    println!("{}", word);\n    println!("{}", s);\n}\n',wrongWhy:'check'},
        {src:HEAD+'\nfn main() {\n    let mut s = String::from("hello world");\n    let word = head(&s, 5).to_string();\n    s.push_str("!");\n    println!("{}", word);\n    println!("{}", s);\n}\n',wrongWhy:'check'}
      ],
      defines:[],previews:[],
      check:c=>c.out()!=='hello\nhello world!\n'?'The program has to print `hello` and then `hello world!`, one per line.':c.allocs('String')!==1?'Keep a single `String`: do not copy the word into a new one.':c.calls('head')<1?'Take the word with `head`, as the program does.':c.methodIn('main','push_str')<1?'Keep the `push_str` that adds the `!`.':true
    },
    {
      title:'Which input does it borrow from?',kind:'fix',
      goal:'This program stops with an error, because <code>longest</code> returns a reference and has two references coming in. Fix it so it gives back an owned <code>String</code>. The hidden <code>main</code> prints <code>bigger</code> and then <code>longer</code>.',
      how:[
        'The whole program picks the longer of two texts. Today it returns a <code>&str</code>, and Rust cannot tell whether that reference borrows from <code>a</code> or from <code>b</code>. It stops with <code>E0106</code>, "missing lifetime specifier".',
        'A <em>lifetime</em> is how long a reference stays valid. With one reference coming in, Rust knows the answer borrows from it (last mission). With two, it needs to be told which, and with none it has nothing to borrow from at all.',
        'Chapter 10 shows how to tell it. Until then the fix is to return an owned <code>String</code>: change <code>-> &str</code> to <code>-> String</code>, so the caller becomes the owner and nothing is borrowed.',
        '<code>a.to_string()</code> and <code>b.to_string()</code> build the owned <code>String</code> in each branch. Now the answer does not depend on either input, so it can outlive both.'
      ],
      explain:'<code>E0106</code> also appears for a function with no reference parameter at all, like <code>fn make() -> &String</code>: the reference would have nothing to point at. In every case the way out is the same for now: return the value itself, as a <code>String</code>, instead of a reference to it. Ownership moves to the caller, as it did in chapter 4.',
      hint:'Change the return type to <code>String</code> and write <code>a.to_string()</code> and <code>b.to_string()</code> in the two branches.',
      harness:LONGEST_MAIN,
      starter:LONGEST('&str','    if a.len() > b.len() {\n        a\n    } else {\n        b\n    }\n'),
      starterErr:'E0106',
      answer:LONGEST('String',PICK),
      alts:[LONGEST('String','    if a.len() > b.len() {\n        a.to_owned()\n    } else {\n        b.to_owned()\n    }\n'),LONGEST('String','    if a.len() > b.len() {\n        String::from(a)\n    } else {\n        String::from(b)\n    }\n')],
      wrong:[
        {src:LONGEST('String','    if a.len() > b.len() {\n        a.to_string()\n    } else {\n        b\n    }\n'),wrongWhy:'E0308'},
        {src:LONGEST('String','    if a.len() > b.len() {\n        b.to_string()\n    } else {\n        a.to_string()\n    }\n'),wrongWhy:'check'}
      ],
      lazy:[
        {src:LONGEST('&\'static str','    "bigger"\n'),wrongWhy:'check'},
        {src:LONGEST('String','    String::from("bigger")\n'),wrongWhy:'check'},
        {src:LONGEST('&\'static str','    if a.len() > b.len() {\n        "bigger"\n    } else {\n        "longer"\n    }\n'),wrongWhy:'check'}
      ],
      defines:[],previews:[],
      check:c=>c.out()!=='bigger\nlonger\n'?'`longest` has to give back the longer text: `bigger` and then `longer`.':c.allocs('String')!==2?'Return an owned `String` built from the longer input, one per call.':true
    },
    {
      title:'A reference to something that is gone',kind:'fix',
      goal:'This program stops with an error, because <code>first_two</code> returns a slice of <code>copy</code>, and <code>copy</code> is freed when the function ends. Fix it so it prints <code>he</code> and then <code>wo</code>.',
      how:[
        'The whole program makes a copy of the text and hands back the first two letters of the copy. The copy is a local variable, so it is freed at the closing <code>}</code> of the function. A reference to it would point at freed memory, so Rust refuses with <code>E0515</code>.',
        'Here the one-reference rule from the earlier mission is not the problem: there is exactly one reference coming in. The slice borrows from the wrong thing: a value that belongs to the function.',
        'Borrow from what the caller owns instead: slice <code>s</code> itself, with <code>&s[..2]</code>. The copy is not needed, and the slice stays valid for as long as the caller keeps its text.'
      ],
      explain:'<code>E0515</code> means a function tried to return a reference to one of its own locals, or to a parameter it owns. That is called a dangling reference: a pointer to memory that is already gone. Many languages let it compile and fail strangely at run time. Rust cannot: a reference you return has to point at something that outlives the call, such as the input you were lent. If you really need a new text, return an owned <code>String</code> instead.',
      hint:'Slice the parameter <code>s</code> instead of the local <code>copy</code>: <code>&s[..2]</code>.',
      harness:TWO_MAIN,
      starter:TWO('    let copy = s.to_owned();\n    &copy[..2]\n'),
      starterErr:'E0515',
      answer:TWO('    &s[..2]\n'),
      alts:[TWO('    let front = &s[..2];\n    front\n'),'fn first_two(s: &str) -> String {\n    let copy = s.to_owned();\n    String::from(&copy[..2])\n}\n'],
      wrong:[
        {src:TWO('    let copy = s.to_owned();\n    let front = &copy[..2];\n    front\n'),wrongWhy:'E0515'},
        {src:TWO('    &s[..3]\n'),wrongWhy:'check'},
        {src:TWO('    &s[2..]\n'),wrongWhy:'check'}
      ],
      lazy:[
        {src:TWO('    if s == "hello" {\n        "he"\n    } else {\n        "wo"\n    }\n'),wrongWhy:'check'},
        {src:TWO('    s\n'),wrongWhy:'check'}
      ],
      defines:[],previews:[],
      check:c=>c.out()!=='he\nwo\n'?'`first_two` has to give back the first two letters: `he` and then `wo`.':c.count('index')<1?'Take the first two letters with a slice, like `&s[..2]`.':true
    }
  ]
});
})();
