/* Append only: a mission's key is '0.<index>' and shipped keys are never renumbered. DOM-free. */
(()=>{
'use strict';
const RQ=globalThis.RQ=globalThis.RQ||{};
const prog=body=>'fn main() {\n'+body+'}\n';
const STUB=(note)=>prog('    // '+note+'\n');

RQ.CH.push({
  name:'Hello, Rust',
  badge:'First Steps',
  intro:'Every Rust program starts in a function called <code>main</code>. In this chapter you print your first line, give values names with <code>let</code>, and meet the compiler\'s favourite rule: values do not change unless you say so.',
  toolbox:'In this chapter: <code>fn main</code>, <code>println!</code>, <code>print!</code>, <code>let</code>, <code>let mut</code>, whole numbers with <code>+ - * / %</code>, and <code>true</code> and <code>false</code>.',
  learned:['fn main','println!','{}','let','let mut','shadowing'],
  missions:[
    {
      title:'Say hello',kind:'write',
      goal:'Make the program print <code>Hello, Rust!</code> on its own line.',
      how:[
        'The whole program is one function, <code>main</code>, where every Rust program starts. Inside it, <code>println!</code> prints one line of text.',
        '<code>fn main() { ... }</code> declares the function <code>main</code>. The curly braces hold what it does.',
        '<code>println!("Hello, Rust!");</code> prints the text between the quotes and then starts a new line. The <code>;</code> ends the statement.',
        'The <code>!</code> in <code>println!</code> marks a macro, a built-in code writer. It isn\'t a normal function.'
      ],
      explain:'Rust runs the lines inside <code>main</code> from top to bottom and then stops. <code>println!</code> is how you see what happened.',
      hint:'Type <code>println!("Hello, Rust!");</code> between the curly braces.',
      starter:STUB('print the greeting here'),
      answer:prog('    println!("Hello, Rust!");\n'),
      alts:[prog('    print!("Hello, ");\n    println!("Rust!");\n'),prog('    println!("Hello, Rust!")\n')],
      wrong:[{src:prog('    println!("Hello Rust!");\n'),wrongWhy:'check'},{src:prog(''),wrongWhy:'check'}],
      lazy:[{src:prog('    print!("Hello, Rust!");\n'),wrongWhy:'check'}],
      defines:['fn-main','println'],
      previews:[{tag:'macro',wording:'The <code>!</code> in <code>println!</code> marks a macro, a built-in code writer. It isn\'t a normal function.'}],
      check:c=>c.out()==='Hello, Rust!\n'?true:c.out()==='Hello, Rust!'?'Close. The line needs to end, so use `println!`: the `ln` starts a new line.':'The program has to print exactly `Hello, Rust!`, capital letters, comma and exclamation mark included.'
    },
    {
      title:'Fill the hole',kind:'write',
      goal:'Print the sum of 6 and 7 with <code>println!</code>, so the line says <code>13</code>.',
      how:[
        'The whole line asks Rust to work out <code>6 + 7</code> and print the answer on its own line.',
        'In <code>println!("{}", 6 + 7);</code> the <code>{}</code> is a hole. <code>println!</code> fills it with the next argument.',
        'After the string comes a comma and then the argument, <code>6 + 7</code>. Rust works it out before it prints.'
      ],
      explain:'One string can have several holes, and each takes the next argument in order. A hole can show a number, text, a character or <code>true</code> and <code>false</code>.',
      hint:'Put <code>{}</code> inside the quotes and <code>6 + 7</code> after a comma.',
      starter:STUB('print 6 + 7 here'),
      answer:prog('    println!("{}", 6 + 7);\n'),
      alts:[prog('    println!("{}", 7 + 6);\n'),prog('    println!("{}", 20 - 7);\n')],
      wrong:[{src:prog('    println!("{}", 6 - 7);\n'),wrongWhy:'check'},{src:prog('    println!("{}", 6 + 7);\n    println!("{}", 6 + 7);\n'),wrongWhy:'check'}],
      lazy:[{src:prog('    println!("13");\n'),wrongWhy:'check'},{src:prog('    println!("{}", 13);\n'),wrongWhy:'check'}],
      defines:['hole'],previews:[],
      check:c=>c.out()!=='13\n'?'The program has to print `13` on one line.':c.count('hole')<1?'Use a hole: write `{}` in the string and give `println!` the sum as an argument.':c.count('op')<1?'Let Rust do the sum: give `println!` the argument `6 + 7` instead of typing `13`.':true
    },
    {
      title:'Name a value with let',kind:'write',
      goal:'Store <code>40</code> in a variable called <code>score</code> and <code>2</code> in one called <code>bonus</code>, then print their sum, <code>42</code>.',
      how:[
        'The whole program gives two numbers names, adds them and prints <code>42</code>.',
        '<code>let score = 40;</code> creates a variable named <code>score</code> that holds <code>40</code>. The <code>=</code> puts the value in.',
        'The same works for <code>bonus</code>. After that the name stands for its value, so <code>score + bonus</code> means <code>40 + 2</code>.',
        '<code>println!("{}", score + bonus);</code> fills the hole with the sum.'
      ],
      explain:'A variable is a name for a value. Names make a program readable: <code>score + bonus</code> says more than <code>40 + 2</code>.',
      hint:'Write two <code>let</code> lines, then <code>println!("{}", score + bonus);</code>.',
      starter:STUB('make score and bonus here, then print their sum'),
      answer:prog('    let score = 40;\n    let bonus = 2;\n    println!("{}", score + bonus);\n'),
      alts:[prog('    let a = 40;\n    let b = 2;\n    println!("{}", a + b);\n'),prog('    let score = 40;\n    let bonus = 2;\n    let total = score + bonus;\n    println!("{}", total);\n')],
      wrong:[{src:prog('    let score = 40;\n    let bonus = 2;\n    println!("{}", score);\n'),wrongWhy:'check'},{src:prog('    let score = 40;\n    let bonus = 2;\n    println!("{}", score - bonus);\n'),wrongWhy:'check'}],
      lazy:[{src:prog('    println!("{}", 42);\n'),wrongWhy:'check'},{src:prog('    println!("{}", 40 + 2);\n'),wrongWhy:'check'},{src:prog('    let score = 40;\n    let bonus = 2;\n    println!("{}", 42);\n'),wrongWhy:'check'}],
      defines:['let'],previews:[],
      check:c=>c.out()!=='42\n'?'The program has to print `42` on one line.':c.count('let')<2?'Give both numbers a name with `let` first, then add the names.':c.count('var-use')<2?'Use the names: add the two variables in `println!` instead of typing the number.':true
    },
    {
      title:'Why can\'t I change it?',kind:'fix',
      goal:'This program stops with an error, because it changes <code>score</code> after creating it. Fix it so it prints <code>1</code> and then <code>2</code>.',
      how:[
        'The whole program shows a value with <code>println!</code>, changes it and shows it again. Rust refuses the change until you say the variable may change.',
        '<code>let score = 1;</code> makes an immutable variable: once it holds <code>1</code>, it cannot be given another value.',
        '<code>score = 2;</code> tries to give <code>score</code> a new value. That is what the error <code>E0384</code> complains about.',
        'Writing <code>let mut score = 1;</code> adds <code>mut</code> (short for mutable), which allows the change.'
      ],
      explain:'The error code is <code>E0384</code>. Rust makes values unchangeable by default, so nothing can change behind your back. Ask for change with <code>mut</code> only where you need it.',
      hint:'Put <code>mut</code> between <code>let</code> and <code>score</code>.',
      starter:prog('    let score = 1;\n    println!("{}", score);\n    score = 2;\n    println!("{}", score);\n'),
      starterErr:'E0384',
      answer:prog('    let mut score = 1;\n    println!("{}", score);\n    score = 2;\n    println!("{}", score);\n'),
      alts:[prog('    let mut score = 1;\n    println!("{}", score);\n    score = 1 + 1;\n    println!("{}", score);\n')],
      wrong:[{src:prog('    let mut score = 1;\n    println!("{}", score);\n    println!("{}", score);\n'),wrongWhy:'check'},{src:prog('    let mut score = 1;\n    println!("{}", score);\n    score = 2;\n'),wrongWhy:'check'}],
      lazy:[{src:prog('    println!("1");\n    println!("2");\n'),wrongWhy:'check'},{src:prog('    println!("{}", 1);\n    println!("{}", 2);\n'),wrongWhy:'check'},{src:prog('    let mut score = 1;\n    println!("{}", 1);\n    println!("{}", 2);\n'),wrongWhy:'check'}],
      defines:['mut','assign'],previews:[],
      check:c=>c.out()!=='1\n2\n'?'The program has to print `1` and then `2`, each on its own line.':c.count('let')<1||c.count('hole')<2||c.count('var-use')<2?'Keep the variable: print `score` twice with `{}`, before and after the change.':c.count('assign')<1?'Change `score` itself: give it the new value with `=` between the two prints.':true
    },
    {
      title:'Lose a life',kind:'write',
      goal:'A game starts with <code>3</code> lives. Make a variable <code>lives</code>, print it, take one life away, and print it again: <code>3</code> and then <code>2</code>.',
      how:[
        'The whole program prints a number with <code>println!</code>, changes the same variable and prints it again.',
        '<code>let mut lives = 3;</code> makes <code>lives</code> a variable that may change, starting at <code>3</code>.',
        '<code>lives = lives - 1;</code> works out the right side with the old value and stores the result back. There is no <code>let</code> this time, because the variable already exists.',
        'Two <code>println!</code> lines, one before and one after the change, show both values.'
      ],
      explain:'<code>mut</code> belongs to the variable. Without it, the line <code>lives = lives - 1;</code> would be the same <code>E0384</code> error you just fixed.',
      hint:'Start with <code>let mut lives = 3;</code>, then print, then change it, then print.',
      starter:STUB('make lives, print it, lose one, print it again'),
      answer:prog('    let mut lives = 3;\n    println!("{}", lives);\n    lives = lives - 1;\n    println!("{}", lives);\n'),
      alts:[prog('    let mut lives = 3;\n    println!("{}", lives);\n    lives = 2;\n    println!("{}", lives);\n')],
      wrong:[{src:prog('    let mut lives = 3;\n    println!("{}", lives);\n    lives = lives - 1;\n    lives = lives - 1;\n    println!("{}", lives);\n'),wrongWhy:'check'},{src:prog('    let lives = 3;\n    println!("{}", lives);\n    lives = lives - 1;\n    println!("{}", lives);\n'),wrongWhy:'E0384'}],
      lazy:[{src:prog('    println!("3");\n    println!("2");\n'),wrongWhy:'check'},{src:prog('    let a = 3;\n    let b = 2;\n    println!("{}", a);\n    println!("{}", b);\n'),wrongWhy:'check'},{src:prog('    let mut lives = 3;\n    println!("3");\n    lives = 2;\n    println!("{}", lives);\n'),wrongWhy:'check'},{src:prog('    let mut lives = 3;\n    lives = 2;\n    println!("3");\n    println!("2");\n'),wrongWhy:'check'}],
      defines:[],previews:[],
      check:c=>c.out()!=='3\n2\n'?'The program has to print `3` and then `2`, each on its own line.':c.count('mut')<1||c.count('assign')<1?'Change the same variable: make it with `let mut` and give it its new value with `=`.':c.count('hole')<2||c.count('var-use')<2?'Print `lives` itself, before and after the change, with `{}`, instead of typing the numbers.':true
    },
    {
      title:'Same name, new variable',kind:'write',
      goal:'A price starts at <code>10</code> coins. Raise it by <code>5</code> with a second <code>let price</code> instead of <code>mut</code>, then print it: <code>15</code>.',
      how:[
        'The whole program replaces <code>price</code> with a new variable of the same name and prints it.',
        '<code>let price = 10;</code> makes the first <code>price</code>.',
        '<code>let price = price + 5;</code> makes a second variable, also named <code>price</code>. The right side still sees the old one, <code>10</code>, so the new one holds <code>15</code>. This is called shadowing.',
        'From that line on, <code>price</code> means the new variable, so <code>println!</code> prints <code>15</code>. Neither variable needed <code>mut</code>.'
      ],
      explain:'Shadowing builds a new variable, so the old value stays untouched while you are not looking at it. <code>mut</code> changes one variable in place; shadowing makes a fresh one.',
      hint:'Repeat the <code>let</code>, this time with <code>price + 5</code> on the right.',
      starter:prog('    let price = 10;\n    // raise it by 5 here, then print it\n'),
      answer:prog('    let price = 10;\n    let price = price + 5;\n    println!("{}", price);\n'),
      alts:[prog('    let price = 10;\n    let price = 5 + price;\n    println!("{}", price);\n'),prog('    let price = 10;\n    let price = price + 2 + 3;\n    println!("{}", price);\n')],
      wrong:[{src:prog('    let price = 10;\n    let price = price + 50;\n    println!("{}", price);\n'),wrongWhy:'check'},{src:prog('    let price = 10;\n    println!("{}", price);\n'),wrongWhy:'check'}],
      lazy:[{src:prog('    println!("{}", 15);\n'),wrongWhy:'check'},{src:prog('    let mut price = 10;\n    price = price + 5;\n    println!("{}", price);\n'),wrongWhy:'check'},{src:prog('    let price = 10;\n    let price = 15;\n    println!("{}", price);\n'),wrongWhy:'check'},{src:prog('    let price = 10;\n    let price = price + 5;\n    println!("15");\n'),wrongWhy:'check'},{src:prog('    let price = 10;\n    let price = price;\n    println!("{}", 15);\n'),wrongWhy:'check'}],
      defines:['shadow'],previews:[],
      check:c=>c.out()!=='15\n'?'The program has to print `15` on one line.':c.count('mut')>0?'This mission is about shadowing: leave out `mut` and write a second `let price`.':c.count('shadow')<1?'Make a second variable with the same name: `let price = ...;` again.':c.count('shadow-use')<1?'The second `let price` should start from the first one: use `price` on its right side, like `price + 5`.':c.count('hole')<1||c.count('var-use')<2?'Print `price` itself with `{}` instead of typing the number.':true
    }
  ]
});
})();
