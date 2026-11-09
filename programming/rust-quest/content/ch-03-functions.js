/* Append only: a mission's key is '2.<index>' and shipped keys are never renumbered. DOM-free. */
(()=>{
'use strict';
const RQ=globalThis.RQ=globalThis.RQ||{};
const prog=body=>'fn main() {\n'+body+'}\n';
const STUB=note=>prog('    // '+note+'\n');
const DOUBLE_MAIN='fn main() {\n    println!("{}", double(21));\n    println!("{}", double(4));\n}\n';
const DESCRIBE='fn main() {\n    describe(25);\n    describe(21);\n    describe(20);\n    describe(5);\n}\n';
const BONUS='fn main() {\n    println!("{}", bonus(7));\n    println!("{}", bonus(6));\n    println!("{}", bonus(5));\n    println!("{}", bonus(2));\n}\n';
const FIRST_MAIN='fn main() {\n    println!("{}", first_square_over(50));\n    println!("{}", first_square_over(100));\n}\n';

RQ.CH.push({
  name:'Functions and flow',
  badge:'Tide Clock',
  story:'The brass weight opens the tide steps, which only count down at low tide; write your own steps, choose and repeat, and find the tide clock.',
  intro:'The brass weight opens the tide steps, which only count down at low tide. So far everything happened in <code>main</code>, top to bottom. Now you write functions of your own and steer the program: choose with <code>if</code>, and repeat with <code>loop</code>, <code>while</code> and <code>for</code>.',
  toolbox:'In this chapter: <code>fn</code> with parameters and a return type, <code>if</code> and <code>else</code>, <code>loop</code> and <code>break</code>, <code>while</code>, and <code>for</code> over <code>0..5</code> and <code>1..=5</code>.',
  learned:['functions','parameters','return values','if','loop','while','for','ranges'],
  missions:[
    {
      title:'Write your own function',kind:'write',
      goal:'Write a function <code>double</code> that takes an <code>i32</code> and gives back twice that number. The hidden <code>main</code> prints <code>double(21)</code> and <code>double(4)</code>, so the program should print <code>42</code> and then <code>8</code>.',
      how:[
        'The whole function, started with <code>fn</code>, takes one number in, does a bit of maths, and hands one number back to whoever called it.',
        '<code>fn double(n: i32) -> i32</code> declares it. <code>double</code> is its name, <code>(n: i32)</code> is the parameter list (a name and a type for each value it receives), and <code>-> i32</code> is the type it gives back.',
        'The body is <code>{ n * 2 }</code>. The last line has no <code>;</code> after it, and that is what makes it the value the function returns.',
        'Calling <code>double(21)</code> runs the body with <code>n</code> set to <code>21</code> and gives back <code>42</code>.'
      ],
      explain:'A function is a named piece of code you can run again and again with different values. <code>return n * 2;</code> also works, with the <code>;</code>. Leaving off the <code>;</code> on the last line is the usual style.',
      hint:'Write <code>fn double(n: i32) -> i32 { n * 2 }</code> above <code>main</code>.',
      harness:DOUBLE_MAIN,
      starter:'fn double(n: i32) -> i32 {\n    // double n here\n    n\n}\n',
      answer:'fn double(n: i32) -> i32 {\n    n * 2\n}\n',
      alts:['fn double(n: i32) -> i32 {\n    return n * 2;\n}\n','fn double(n: i32) -> i32 {\n    n + n\n}\n'],
      wrong:[{src:'fn double(n: i32) -> i32 {\n    n * 3\n}\n',wrongWhy:'check'},{src:'fn double(n: i32) -> i32 {\n    n + 20\n}\n',wrongWhy:'check'}],
      lazy:[{src:'fn double(n: i32) -> i32 {\n    42\n}\n',wrongWhy:'check'},{src:'fn double(n: i32) -> i32 {\n    n\n}\n',wrongWhy:'check'},{src:'fn double(n: i32) -> i32 {\n    21 * 2\n}\n',wrongWhy:'check'}],
      defines:['fn-decl','fn-params','fn-ret'],previews:[],
      check:c=>c.out()!=='42\n8\n'?'`double(21)` has to give back `42` and `double(4)` has to give back `8`, so the program prints `42` and then `8`.':c.count('var-use')<1?'Do the maths with the parameter `n`: use it in the body instead of typing numbers.':true
    },
    {
      title:'The semicolon that ate the value',kind:'fix',
      goal:'This program stops with an error: <code>add_one</code> promises an <code>i32</code> but hands back nothing. Fix it so it prints <code>42</code>.',
      how:[
        'The whole program asks <code>add_one</code> for <code>41 + 1</code> and prints it. Rust refuses to build it, because the function does not return the number it promises.',
        '<code>-> i32</code> promises a number. The last line of the body is <code>n + 1;</code>, and the <code>;</code> turns that line into a statement, which gives back nothing.',
        'That clash between what is promised and what is returned is the error <code>E0308</code>, mismatched types.',
        'Remove the <code>;</code> and <code>n + 1</code> becomes the value the function gives back.'
      ],
      explain:'<code>E0308</code> means a value of one type was found where another type was needed. Here the function needed an <code>i32</code> and found nothing at all, because of one <code>;</code>. The same error appears whenever two sides of a <code>let</code>, a call or a return disagree about the type.',
      hint:'Delete the <code>;</code> after <code>n + 1</code>.',
      starter:'fn add_one(n: i32) -> i32 {\n    n + 1;\n}\n\nfn main() {\n    println!("{}", add_one(41));\n}\n',
      starterErr:'E0308',
      answer:'fn add_one(n: i32) -> i32 {\n    n + 1\n}\n\nfn main() {\n    println!("{}", add_one(41));\n}\n',
      alts:['fn add_one(n: i32) -> i32 {\n    return n + 1;\n}\n\nfn main() {\n    println!("{}", add_one(41));\n}\n'],
      wrong:[{src:'fn add_one(n: i32) -> i32 {\n    n + 2\n}\n\nfn main() {\n    println!("{}", add_one(41));\n}\n',wrongWhy:'check'},{src:'fn add_one(n: i32) -> u8 {\n    n + 1\n}\n\nfn main() {\n    println!("{}", add_one(41));\n}\n',wrongWhy:'E0308'}],
      lazy:[{src:'fn add_one(n: i32) -> i32 {\n    42\n}\n\nfn main() {\n    println!("{}", add_one(41));\n}\n',wrongWhy:'check'},{src:'fn add_one(n: i32) -> i32 {\n    n + 1\n}\n\nfn main() {\n    println!("42");\n}\n',wrongWhy:'check'},{src:'fn add_one(n: i32) -> i32 {\n    41 + 1\n}\n\nfn main() {\n    println!("{}", add_one(41));\n}\n',wrongWhy:'check'}],
      defines:[],previews:[],
      check:c=>c.out()!=='42\n'?'The program has to print `42` on one line.':c.calls('add_one')<1?'Keep calling `add_one` from `main`.':c.count('op')<1||c.count('var-use')<1?'Keep the maths inside `add_one`: it should work out `n + 1` from its parameter.':true
    },
    {
      title:'Choose with if and else',kind:'write',
      goal:'Write <code>describe(temp: i32)</code>. It prints <code>warm</code> when <code>temp</code> is above <code>20</code> and <code>cold</code> otherwise. A hidden <code>main</code> calls <code>describe(25)</code>, <code>describe(21)</code>, <code>describe(20)</code> and <code>describe(5)</code>, so the program should print <code>warm</code>, <code>warm</code>, <code>cold</code> and <code>cold</code>.',
      how:[
        'The whole function uses <code>if</code> to look at one number and prints one of two words, depending on it.',
        '<code>if temp > 20 { ... }</code> runs the code between its braces only when the condition is true. A condition has to be <code>true</code> or <code>false</code>.',
        '<code>else { ... }</code> holds the code to run when the condition is false.',
        'With <code>25</code> and <code>21</code> the condition is true, so those calls print <code>warm</code>. With <code>20</code> and <code>5</code> it is false, so they print <code>cold</code>: <code>></code> means strictly above, so <code>20</code> itself is not enough.'
      ],
      explain:'Only one of the two blocks runs each time. A condition such as <code>temp > 20</code> compares two numbers and gives <code>true</code> or <code>false</code>; a plain number like <code>1</code> is not a condition, and Rust says so with <code>E0308</code>.',
      hint:'Write <code>if temp > 20 { println!("warm"); } else { println!("cold"); }</code> inside the function.',
      harness:DESCRIBE,
      starter:'fn describe(temp: i32) {\n    // print warm or cold here\n}\n',
      answer:'fn describe(temp: i32) {\n    if temp > 20 {\n        println!("warm");\n    } else {\n        println!("cold");\n    }\n}\n',
      alts:['fn describe(temp: i32) {\n    if temp <= 20 {\n        println!("cold");\n    } else {\n        println!("warm");\n    }\n}\n','fn describe(temp: i32) {\n    if temp >= 21 {\n        println!("warm");\n    } else {\n        println!("cold");\n    }\n}\n'],
      wrong:[{src:'fn describe(temp: i32) {\n    if temp >= 20 {\n        println!("warm");\n    } else {\n        println!("cold");\n    }\n}\n',wrongWhy:'check'},{src:'fn describe(temp: i32) {\n    if temp > 30 {\n        println!("warm");\n    } else {\n        println!("cold");\n    }\n}\n',wrongWhy:'check'},{src:'fn describe(temp: i32) {\n    if temp < 20 {\n        println!("warm");\n    } else {\n        println!("cold");\n    }\n}\n',wrongWhy:'check'},{src:'fn describe(temp: i32) {\n    if temp {\n        println!("warm");\n    } else {\n        println!("cold");\n    }\n}\n',wrongWhy:'E0308'}],
      lazy:[{src:'fn describe(temp: i32) {\n    if temp == 25 {\n        println!("warm");\n    } else {\n        println!("cold");\n    }\n}\n',wrongWhy:'check'},{src:'fn describe(temp: i32) {\n    println!("warm");\n    println!("cold");\n}\n',wrongWhy:'check'},{src:'fn describe(temp: i32) {\n    if true {\n        println!("warm");\n    } else {\n        println!("cold");\n    }\n}\n',wrongWhy:'check'}],
      defines:['if'],previews:[],
      check:c=>c.out()!=='warm\nwarm\ncold\ncold\n'?'The program has to print `warm` for `25` and `21`, and `cold` for `20` and `5`, each on its own line. Remember that `20` is not above `20`.':c.count('if')<1?'Choose with `if` and `else`, based on `temp`.':true
    },
    {
      title:'An if that gives back a value',kind:'write',
      goal:'Write <code>bonus(level: i32) -> i32</code>. It gives back <code>10</code> when <code>level</code> is above <code>5</code> and <code>0</code> otherwise. A hidden <code>main</code> prints <code>bonus(7)</code>, <code>bonus(6)</code>, <code>bonus(5)</code> and <code>bonus(2)</code>, so the program should print <code>10</code>, <code>10</code>, <code>0</code> and <code>0</code>.',
      how:[
        'The whole function picks one of two numbers and hands it back, so the <code>if</code> itself is the answer.',
        'In <code>if level > 5 { 10 } else { 0 }</code>, each block ends with a value and no <code>;</code>. The block that runs supplies the value of the whole <code>if</code>.',
        'Because the <code>if</code> is the last thing in the function, with no <code>;</code> after it, that value is what the function returns.',
        'Both blocks must give the same type. A <code>10</code> in one and a word in the other would be <code>E0308</code>.'
      ],
      explain:'Most things in Rust are expressions: they have a value. An <code>if</code> and <code>else</code> pair is one too, which is why you can write <code>let b = if level > 5 { 10 } else { 0 };</code>. The two blocks have to agree on the type, because the variable can only have one.',
      hint:'Write <code>if level > 5 { 10 } else { 0 }</code> as the last line of the function.',
      harness:BONUS,
      starter:'fn bonus(level: i32) -> i32 {\n    // give back 10 or 0\n    0\n}\n',
      answer:'fn bonus(level: i32) -> i32 {\n    if level > 5 { 10 } else { 0 }\n}\n',
      alts:['fn bonus(level: i32) -> i32 {\n    let b = if level >= 6 { 10 } else { 0 };\n    b\n}\n','fn bonus(level: i32) -> i32 {\n    if level > 5 {\n        return 10;\n    }\n    0\n}\n'],
      wrong:[{src:'fn bonus(level: i32) -> i32 {\n    if level > 8 { 10 } else { 0 }\n}\n',wrongWhy:'check'},{src:'fn bonus(level: i32) -> i32 {\n    if level > 3 { 10 } else { 0 }\n}\n',wrongWhy:'check'},{src:'fn bonus(level: i32) -> i32 {\n    if level > 6 { 10 } else { 0 }\n}\n',wrongWhy:'check'},{src:'fn bonus(level: i32) -> i32 {\n    if level == 7 { 10 } else { 0 }\n}\n',wrongWhy:'check'},{src:'fn bonus(level: i32) -> i32 {\n    if level > 5 { 0 } else { 10 }\n}\n',wrongWhy:'check'},{src:'fn bonus(level: i32) -> i32 {\n    if level > 5 { 10 } else { "none" }\n}\n',wrongWhy:'E0308'}],
      lazy:[{src:'fn bonus(level: i32) -> i32 {\n    10\n}\n',wrongWhy:'check'},{src:'fn bonus(level: i32) -> i32 {\n    0\n}\n',wrongWhy:'check'}],
      defines:[],previews:[],
      check:c=>c.out()!=='10\n10\n0\n0\n'?'The program has to print `10` for `bonus(7)` and `bonus(6)`, and `0` for `bonus(5)` and `bonus(2)`, each on its own line. Remember that `5` is not above `5`.':c.count('if')<1?'Choose the number with `if` and `else`, based on `level`.':true
    },
    {
      title:'Repeat until you break out',kind:'write',
      goal:'Write <code>first_square_over(limit: i32) -> i32</code>. It counts up from <code>1</code> with a <code>loop</code> and gives back the first number whose square is over <code>limit</code>. A hidden <code>main</code> prints <code>first_square_over(50)</code> and <code>first_square_over(100)</code>, so the program should print <code>8</code> and then <code>11</code>.',
      how:[
        'The whole function keeps trying numbers with a <code>loop</code>, one after another, until one passes a test, and then hands that number back.',
        '<code>loop { ... }</code> repeats its block again and again. Nothing stops it until the code says so.',
        '<code>break n;</code> leaves the loop, and the value after <code>break</code> becomes the value of the whole <code>loop</code>. As the last thing in the function, that is what the function returns.',
        'Each time round, <code>n = n + 1;</code> moves on to the next number, and <code>if n * n > limit</code> checks the square. For <code>50</code>, <code>8 * 8</code> is <code>64</code>, while <code>7 * 7</code> is only <code>49</code>.'
      ],
      explain:'A <code>loop</code> without a <code>break</code> runs forever, and Rust Quest stops it after a fixed number of steps. <code>break</code> can carry a value out, or stand alone as <code>break;</code> and just leave. <code>continue;</code> skips to the next round.',
      hint:'Start with <code>let mut n = 1;</code>, then <code>loop</code> with an <code>if</code> that does <code>break n;</code>, and <code>n = n + 1;</code> after it.',
      harness:FIRST_MAIN,
      starter:'fn first_square_over(limit: i32) -> i32 {\n    // count up in a loop and break out with the first n whose square is over limit\n    0\n}\n',
      answer:'fn first_square_over(limit: i32) -> i32 {\n    let mut n = 1;\n    loop {\n        if n * n > limit {\n            break n;\n        }\n        n = n + 1;\n    }\n}\n',
      alts:['fn first_square_over(limit: i32) -> i32 {\n    let mut n = 1;\n    let found = loop {\n        if n * n > limit {\n            break n;\n        }\n        n = n + 1;\n    };\n    found\n}\n','fn first_square_over(limit: i32) -> i32 {\n    let mut n = 1;\n    loop {\n        if n * n > limit {\n            return n;\n        }\n        n += 1;\n    }\n}\n'],
      wrong:[{src:'fn first_square_over(limit: i32) -> i32 {\n    let mut n = 1;\n    loop {\n        if n * n >= limit {\n            break n;\n        }\n        n = n + 1;\n    }\n}\n',wrongWhy:'check'},{src:'fn first_square_over(limit: i32) -> i32 {\n    let mut n = 1;\n    loop {\n        if n * n > limit + 20 {\n            break n;\n        }\n        n = n + 1;\n    }\n}\n',wrongWhy:'check'}],
      lazy:[{src:'fn first_square_over(limit: i32) -> i32 {\n    8\n}\n',wrongWhy:'check'},{src:'fn first_square_over(limit: i32) -> i32 {\n    let mut n = 1;\n    loop {\n        if n == 8 {\n            break n;\n        }\n        n = n + 1;\n    }\n}\n',wrongWhy:'check'},{src:'fn first_square_over(limit: i32) -> i32 {\n    let mut n = 1;\n    while n * n <= limit {\n        n = n + 1;\n    }\n    n\n}\n',wrongWhy:'check'}],
      defines:['loop'],previews:[],
      check:c=>c.out()!=='8\n11\n'?'The program has to print `8` for `first_square_over(50)` and `11` for `first_square_over(100)`, each on its own line.':c.count('loop')<1?'This mission is about `loop`: repeat the test with a `loop` and leave it with `break`.':c.count('break')+c.count('return')<1?'Leave the loop with `break` once the square is over `limit`.':c.count('assign')<1?'Move on to the next number each round: give `n` its new value with `=`.':true
    },
    {
      title:'Count down with while',kind:'write',
      goal:'Print <code>3</code>, <code>2</code> and <code>1</code> on their own lines, then <code>Low tide!</code>, using a <code>while</code> loop.',
      how:[
        'The whole program counts down with <code>while</code> a number is still above zero, then announces the launch.',
        '<code>while n > 0 { ... }</code> checks the condition before every round and runs the block only while it is true. When it turns false, the loop ends.',
        'Inside the block, <code>println!("{}", n);</code> prints the number and <code>n = n - 1;</code> makes it smaller. Without that line the condition would stay true forever.',
        'After the loop, one last <code>println!</code> prints <code>Low tide!</code>.'
      ],
      explain:'Use <code>while</code> when you do not know ahead of time how many rounds you need, only when to stop. If the condition is false from the start, the block never runs at all.',
      hint:'Start with <code>let mut n = 3;</code>, then <code>while n > 0 { ... }</code>.',
      starter:STUB('count down from 3, then print Low tide!'),
      answer:prog('    let mut n = 3;\n    while n > 0 {\n        println!("{}", n);\n        n = n - 1;\n    }\n    println!("Low tide!");\n'),
      alts:[prog('    let mut n = 3;\n    while n >= 1 {\n        println!("{}", n);\n        n = n - 1;\n    }\n    println!("Low tide!");\n')],
      wrong:[{src:prog('    let mut n = 3;\n    while n >= 0 {\n        println!("{}", n);\n        n = n - 1;\n    }\n    println!("Low tide!");\n'),wrongWhy:'check'},{src:prog('    let mut n = 4;\n    while n > 0 {\n        println!("{}", n);\n        n = n - 1;\n    }\n    println!("Low tide!");\n'),wrongWhy:'check'}],
      lazy:[{src:prog('    println!("3");\n    println!("2");\n    println!("1");\n    println!("Low tide!");\n'),wrongWhy:'check'},{src:prog('    let mut n = 3;\n    while n > 0 {\n        n = n - 1;\n    }\n    println!("3");\n    println!("2");\n    println!("1");\n    println!("Low tide!");\n'),wrongWhy:'check'},{src:prog('    let mut n = 3;\n    loop {\n        println!("{}", n);\n        n = n - 1;\n        if n == 0 {\n            break;\n        }\n    }\n    println!("Low tide!");\n'),wrongWhy:'check'}],
      defines:[],previews:[],
      check:c=>c.out()!=='3\n2\n1\nLow tide!\n'?'The program has to print `3`, `2`, `1` and `Low tide!`, each on its own line.':c.count('while')<1?'This mission is about `while`: repeat the printing with a `while` loop.':c.count('assign')<1?'Make `n` smaller each round, or the loop never ends.':c.count('var-use')<3?'Let the loop do the counting: test `n`, print `n` and change `n` inside the loop, instead of typing the numbers.':true
    },
    {
      title:'Walk through a range with for',kind:'write',
      goal:'Add up the numbers <code>1</code> to <code>5</code> with a <code>for</code> loop, and print the total: <code>15</code>.',
      how:[
        'The whole program uses <code>for</code> to visit every number from one to five, adds each to a running total, and prints the total.',
        '<code>1..=5</code> is a range: the numbers from <code>1</code> up to and including <code>5</code>. <code>1..5</code>, without the <code>=</code>, stops before <code>5</code>.',
        '<code>for i in 1..=5 { ... }</code> runs the block once for each number in the range, with <code>i</code> holding the current one.',
        'Inside, <code>total = total + i;</code> adds it to <code>total</code>, which starts at <code>0</code> and is a <code>let mut</code> so it can grow.'
      ],
      explain:'Use <code>for</code> when you know what to walk through. The loop variable <code>i</code> needs no <code>let</code>, and no <code>mut</code>: each round gets a fresh one. A range such as <code>0..5</code> gives <code>0</code> to <code>4</code>, which is five numbers.',
      hint:'Write <code>for i in 1..=5 { total = total + i; }</code> after <code>let mut total = 0;</code>.',
      starter:STUB('add up 1 to 5 with a for loop, then print the total'),
      answer:prog('    let mut total = 0;\n    for i in 1..=5 {\n        total = total + i;\n    }\n    println!("{}", total);\n'),
      alts:[prog('    let mut total = 0;\n    for i in 1..6 {\n        total = i + total;\n    }\n    println!("{}", total);\n')],
      wrong:[{src:prog('    let mut total = 0;\n    for i in 1..5 {\n        total = total + i;\n    }\n    println!("{}", total);\n'),wrongWhy:'check'},{src:prog('    let mut total = 0;\n    for i in 2..=5 {\n        total = total + i;\n    }\n    println!("{}", total);\n'),wrongWhy:'check'}],
      lazy:[{src:prog('    println!("15");\n'),wrongWhy:'check'},{src:prog('    let mut total = 0;\n    for _ in 0..1 {\n        total = 15;\n    }\n    println!("{}", total);\n'),wrongWhy:'check'},{src:prog('    let total = 1 + 2 + 3 + 4 + 5;\n    println!("{}", total);\n'),wrongWhy:'check'}],
      defines:['range'],previews:[],
      check:c=>c.out()!=='15\n'?'The program has to print `15` on one line.':c.count('for')<1?'This mission is about `for`: walk through the numbers with a `for` loop.':c.count('assign')<1?'Add each number to a running total with `=`.':c.count('var-use')<3?'Use the loop variable `i` and the running total in the sum, and print the total, instead of typing numbers.':true
    },
    {
      title:'A typo in a name',kind:'fix',
      goal:'This program stops with an error because it uses a name Rust cannot find. Fix it so it prints <code>42</code>.',
      how:[
        'The whole program stores <code>40</code> in <code>shells</code>, adds <code>2</code> and prints the sum. Rust refuses to build it, because one name is spelled differently from the variable.',
        '<code>let shells = 40;</code> creates the variable <code>shells</code>.',
        'The print asks for <code>shell</code>, with a letter missing. Rust has no variable by that name, and reports <code>E0425</code>: it cannot find the name.',
        'Spell the name the same way in both places and the error goes away.'
      ],
      explain:'<code>E0425</code> means the compiler met a name it does not know. Usually it is a typo, or the variable lives in a block that has already ended. Rust is strict about spelling and capital letters: <code>shells</code> and <code>Shells</code> are different names.',
      hint:'Change <code>shell</code> to <code>shells</code>.',
      starter:prog('    let shells = 40;\n    println!("{}", shell + 2);\n'),
      starterErr:'E0425',
      answer:prog('    let shells = 40;\n    println!("{}", shells + 2);\n'),
      alts:[prog('    let shell = 40;\n    println!("{}", shell + 2);\n')],
      wrong:[{src:prog('    let shells = 40;\n    println!("{}", shells + 3);\n'),wrongWhy:'check'},{src:prog('    let shells = 40;\n    println!("{}", shellss + 2);\n'),wrongWhy:'E0425'}],
      lazy:[{src:prog('    println!("42");\n'),wrongWhy:'check'},{src:prog('    let shells = 40;\n    println!("{}", 40 + 2);\n'),wrongWhy:'check'}],
      defines:[],previews:[],
      check:c=>c.out()!=='42\n'?'The program has to print `42` on one line.':c.count('var-use')<1?'Use the variable in the print: add `2` to it instead of typing the number.':true
    }
  ]
});
})();
