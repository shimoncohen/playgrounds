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
 {ch:0,c:'What does <code>print!</code> do that <code>println!</code> does not?',a:'it does not start a new line afterwards',w:['it prints in capital letters','it prints twice','it only prints numbers'],why:'The `ln` in `println!` stands for line: it ends the line after printing.'}
];

/* ch: chapter; c: title; what: HTML; ex: [[code, note]], code is copied to the clipboard */
RQ.GUIDE=[
 {ch:0,c:'println! and {}',what:'<code>println!</code> prints a line of text. Put <code>{}</code> holes in the string and list one argument per hole after it. <code>print!</code> does the same without starting a new line.',
  ex:[['fn main() {\n    println!("Hello, Rust!");\n}\n','prints a line'],['fn main() {\n    println!("{} and {}", 1, "two");\n}\n','two holes, two arguments']]},
 {ch:0,c:'let and mut',what:'<code>let</code> gives a value a name. The variable cannot change unless you write <code>let mut</code>. A second <code>let</code> with the same name makes a new variable that shadows the old one.',
  ex:[['fn main() {\n    let mut lives = 3;\n    lives = lives - 1;\n    println!("{}", lives);\n}\n','<code>mut</code> allows the change'],['fn main() {\n    let price = 10;\n    let price = price + 5;\n    println!("{}", price);\n}\n','shadowing: a new variable']]},
 {ch:0,c:'E0384: assigned twice to an immutable variable',what:'The compiler says this when you give a new value to a variable made with plain <code>let</code>. Add <code>mut</code> after <code>let</code> if the value should change.',
  ex:[['fn main() {\n    let x = 5;\n    x = 6;\n}\n','this one is rejected, try it']]}
];
})();
