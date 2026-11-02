/* Quick-fire options and explanations are plain text where a pair of backticks shows code. */
(()=>{
'use strict';
const RQ=globalThis.RQ=globalThis.RQ||{};

/* [xp, title]. The thresholds are provisional until the course size is known; the top title is only reachable once the
   whole course exists. */
RQ.RANKS=[[0,'Tide-Pool Newcomer'],[60,'Let Binder'],[300,'Borrow Tamer'],[900,'Lifetime Keeper'],[1500,'Borrow Checker Whisperer']];

/* ch: the chapter whose missions must all be done before the question is played
   c: the question (HTML), a: the answer, w: wrong answers, why: shown after a miss */
RQ.QF=[
 {ch:0,c:'A name ends in <code>!</code>, like <code>println!</code>. What does the <code>!</code> mark?',a:'a macro, a built-in code writer',w:['a function that can fail','a comment','a type'],why:'A `!` after a name means a macro, not a normal function.'},
 {ch:0,c:'What does <code>{}</code> do inside the string of a <code>println!</code>?',a:'it is a hole that the next argument fills',w:['it prints two curly braces','it starts a comment','it ends the line'],why:'`println!("{}", 5)` prints `5`: the hole takes the next argument.'},
 {ch:0,c:'You write <code>let x = 5;</code> and later <code>x = 6;</code>. What does the compiler do?',a:'it stops with an error, because `x` is immutable',w:['it prints 6','it keeps 5 and ignores the line','it makes a second variable'],why:'Variables cannot change unless you add `mut`. The error code is `E0384`.'},
 {ch:0,c:'Which line makes <code>count</code> a variable you can change later?',a:'`let mut count = 0;`',w:['`let count = 0;`','`mut let count = 0;`','`let count mut = 0;`'],why:'`mut` goes right after `let`.'},
 {ch:0,c:'After <code>let price = 10;</code> comes <code>let price = price + 5;</code>. What is <code>price</code> afterwards?',a:'15, in a new variable that shadows the old one',w:['10, because the first one wins','15, in the same variable, changed in place','an error, because the name is taken'],why:'A second `let` with the same name makes a new variable, and the old one is hidden from then on.'},
 {ch:0,c:'What does <code>print!</code> do that <code>println!</code> does not?',a:'it does not start a new line afterwards',w:['it prints in capital letters','it prints twice','it only prints numbers'],why:'The `ln` in `println!` stands for line: it ends the line after printing.'},
 {ch:1,c:'What is the biggest value a <code>u8</code> can hold?',a:'255',w:['256','127','65535'],why:'A `u8` holds `0` to `255`. A `u16` goes up to `65535`.'},
 {ch:1,c:'Which expression turns the whole number <code>n</code> into an <code>f64</code>?',a:'`n as f64`',w:['`f64(n)`','`n.f64`','`n to f64`'],why:'`as` converts between number types: `n as f64`.'},
 {ch:1,c:'After <code>let t = (7, \'a\');</code>, what does <code>t.0</code> hold?',a:'7',w:['\'a\'','(7, \'a\')','nothing, it is an error'],why:'A tuple is read by position, and counting starts at `0`.'},
 {ch:1,c:'An array holds <code>[5, 6, 7]</code>. What is <code>a[1]</code>?',a:'6',w:['5','7','1'],why:'Places count from `0`, so `a[0]` is `5` and `a[1]` is `6`.'},
 {ch:1,c:'A function adds two <code>u8</code> values that come in as parameters, and the sum is <code>260</code>. What happens when it runs?',a:'the program panics and exits with code 101',w:['the sum wraps around to 4','the compiler refuses to build it','it prints 260 anyway'],why:'The compiler cannot see the numbers, so the check happens at run time and stops the program with a panic.'},
 {ch:2,c:'In <code>fn f() -> i32 { 5 }</code>, what makes <code>5</code> the value the function returns?',a:'it is the last line and has no `;`',w:['the word `return` is required','it is the biggest number','the function is called `f`'],why:'The last expression without a `;` is the value. Adding a `;` leaves nothing to return, which is `E0308`.'},
 {ch:2,c:'Which loop checks a condition before every round?',a:'`while`',w:['`for`','`if`','`let`'],why:'`while` runs its block only while the condition is true.'},
 {ch:2,c:'What numbers does <code>for i in 0..3</code> give to <code>i</code>?',a:'0, 1 and 2',w:['1, 2 and 3','0, 1, 2 and 3','only 3'],why:'`0..3` stops before `3`. Write `0..=3` to include it.'},
 {ch:2,c:'What does the error <code>E0425</code> tell you?',a:'Rust cannot find a name you used',w:['two types do not match','a value was changed twice','a number is too big'],why:'Usually a typo, or a variable used outside the block that made it.'}
];

/* ch: chapter; c: title; what: HTML; ex: [[code, note]], code is copied to the clipboard */
RQ.GUIDE=[
 {ch:0,c:'println! and {}',what:'<code>println!</code> prints a line of text. Put <code>{}</code> holes in the string and list one argument per hole after it. <code>print!</code> does the same without starting a new line.',
  ex:[['fn main() {\n    println!("Hello, Rust!");\n}\n','prints a line'],['fn main() {\n    println!("{} and {}", 1, "two");\n}\n','two holes, two arguments']]},
 {ch:0,c:'let and mut',what:'<code>let</code> gives a value a name. The variable cannot change unless you write <code>let mut</code>. A second <code>let</code> with the same name makes a new variable that shadows the old one.',
  ex:[['fn main() {\n    let mut lives = 3;\n    lives = lives - 1;\n    println!("{}", lives);\n}\n','<code>mut</code> allows the change'],['fn main() {\n    let price = 10;\n    let price = price + 5;\n    println!("{}", price);\n}\n','shadowing: a new variable']]},
 {ch:0,c:'E0384: assigned twice to an immutable variable',what:'The compiler says this when you give a new value to a variable made with plain <code>let</code>. Add <code>mut</code> after <code>let</code> if the value should change.',
  ex:[['fn main() {\n    let x = 5;\n    x = 6;\n}\n','this one is rejected, try it']]},
 {ch:1,c:'Number types, as and decimals',what:'Whole numbers come as <code>i32</code>, <code>i64</code> and <code>u8</code> (no negatives, <code>0</code> to <code>255</code>), among others. Decimal numbers are <code>f64</code>. Rust never mixes types for you: <code>as</code> converts, so <code>n as f64</code> gives a decimal copy of <code>n</code>.',
  ex:[['fn main() {\n    let coins: i32 = 7;\n    let price: f64 = 2.5;\n    println!("{}", coins as f64 * price);\n}\n','<code>as</code> makes the types match'],['fn main() {\n    let x: f64 = 2;\n}\n','rejected: <code>2</code> is a whole number, write <code>2.0</code>']]},
 {ch:1,c:'Tuples, arrays and {:?}',what:'A tuple groups values of different types, read by place with <code>t.0</code>. An array holds values of one type, read with <code>a[1]</code>. Places count from <code>0</code>. Print a whole tuple or array with the <code>{:?}</code> hole.',
  ex:[['fn main() {\n    let pet = ("Pip", 3);\n    let shelf = [10, 20, 30];\n    println!("{} {} {:?}", pet.0, shelf[1], shelf);\n}\n','one tuple, one array']]},
 {ch:1,c:'arithmetic_overflow, overflowing_literals and unconditional_panic',what:'These lints are checks the compiler runs on its own, and each stops the build. <code>arithmetic_overflow</code>: a sum it can work out is too big for its type. <code>overflowing_literals</code>: a number you typed does not fit its type. <code>unconditional_panic</code>: something that always fails, like dividing by zero or a place past the end of an array.',
  ex:[['fn main() {\n    let x: u8 = 255 + 1;\n}\n','rejected: <code>arithmetic_overflow</code>'],['fn main() {\n    let x: u8 = 256;\n}\n','rejected: <code>overflowing_literals</code>'],['fn main() {\n    println!("{}", 1 / 0);\n}\n','rejected: <code>unconditional_panic</code>']]},
 {ch:1,c:'panic',what:'A panic is how a Rust program stops itself when it cannot go on, for example when a sum overflows at run time. The program prints a message on the error output and exits with code <code>101</code>. What it printed before stays.',
  ex:[['fn add(a: u8, b: u8) -> u8 {\n    a + b\n}\n\nfn main() {\n    println!("before");\n    println!("{}", add(250, 10));\n}\n','builds, then panics','panic']]},
 {ch:2,c:'E0308: mismatched types',what:'The compiler says this when a value has one type and the place it goes needs another: a <code>let</code> with a type, an argument, a returned value, the two parts of an <code>if</code> and <code>else</code>, or a condition that is not <code>true</code> or <code>false</code>. A stray <code>;</code> after the last line of a function does it too.',
  ex:[['fn main() {\n    let x: i32 = "a";\n}\n','rejected, try it'],['fn add_one(n: i32) -> i32 {\n    n + 1;\n}\n\nfn main() {\n    println!("{}", add_one(1));\n}\n','rejected: the <code>;</code> returns nothing']]},
 {ch:2,c:'E0425: cannot find a name',what:'The compiler says this when you use a variable or function it does not know: a typo, a name used before it is made, or a variable that lived in a block that already ended.',
  ex:[['fn main() {\n    let score = 1;\n    println!("{}", scor);\n}\n','rejected, try it']]},
 {ch:2,c:'if, loop, while and for',what:'<code>if</code> and <code>else</code> choose, and the pair also gives a value. <code>loop</code> repeats until a <code>break</code>, which can carry a value. <code>while</code> repeats while a condition holds. <code>for i in 1..=5</code> walks through a range; <code>1..5</code> stops before <code>5</code>.',
  ex:[['fn main() {\n    let mut total = 0;\n    for i in 1..=5 {\n        total = total + i;\n    }\n    let label = if total > 10 { 1 } else { 0 };\n    println!("{} {}", total, label);\n}\n','a <code>for</code> and an <code>if</code> together']]}
];
})();
