/* Append only: a mission's key is '1.<index>' and shipped keys are never renumbered. DOM-free. */
(()=>{
'use strict';
const RQ=globalThis.RQ=globalThis.RQ||{};
const prog=body=>'fn main() {\n'+body+'}\n';
const STUB=note=>prog('    // '+note+'\n');
const withConst=(decl,body)=>decl+'\n\nfn main() {\n'+body+'}\n';
const ADD='fn add(a: u8, b: u8) -> u8 {\n    a + b\n}\n\n';

RQ.CH.push({
  name:'Types and numbers',
  badge:'Brass Weight',
  story:'Moss\'s note says to weigh every find; learn the shell scale\'s numbers, line up its weights, and find the scale\'s brass weight.',
  intro:'Moss\'s first note says to weigh every find, so Pip heads for the shell scale, which gives up its brass weight only to someone who knows its numbers. Every value in Rust has a type: a label that says what kind of thing it is and how much room it gets. In this chapter you meet the number types, mix them with <code>as</code>, group values into tuples and arrays, and watch what happens when a number does not fit.',
  toolbox:'In this chapter: <code>i32</code>, <code>u8</code> and <code>f64</code>, type annotations, <code>as</code>, tuples and <code>.0</code>, arrays and <code>a[1]</code>, <code>{:?}</code>, and <code>const</code>.',
  learned:['type annotations','f64','as','tuples','arrays','const','overflow'],
  missions:[
    {
      title:'Say what kind of number',kind:'write',
      goal:'Store <code>12</code> in a variable called <code>coins</code>, say in the code that it is an <code>i32</code>, and print it.',
      how:[
        'The whole program stores the number <code>12</code> under the name <code>coins</code>, states what kind of number it is, and prints it.',
        'In <code>let coins: i32 = 12;</code>, the <code>: i32</code> after the name is a type annotation. <code>i32</code> is a whole number that may be negative.',
        'Rust normally works the type out for itself. Writing it down tells the compiler what you meant, and it complains if the value does not fit.',
        '<code>println!("{}", coins);</code> fills the hole with the number.'
      ],
      explain:'Whole numbers come in sizes. <code>i32</code> is the everyday one. <code>i64</code> is bigger, and <code>u8</code> holds only <code>0</code> to <code>255</code> (the <code>u</code> means unsigned: no negatives). A value of one type never quietly becomes another.',
      hint:'Write <code>let coins: i32 = 12;</code>, then print <code>coins</code>.',
      starter:STUB('make coins as an i32, then print it'),
      answer:prog('    let coins: i32 = 12;\n    println!("{}", coins);\n'),
      alts:[prog('    let coins: i32 = 10 + 2;\n    println!("{}", coins);\n'),prog('    let coins: i64 = 12;\n    println!("{}", coins);\n')],
      wrong:[{src:prog('    let coins: i32 = 13;\n    println!("{}", coins);\n'),wrongWhy:'check'},{src:prog('    let coins: i32 = "twelve";\n    println!("{}", coins);\n'),wrongWhy:'E0308'}],
      lazy:[{src:prog('    println!("12");\n'),wrongWhy:'check'},{src:prog('    println!("{}", 12);\n'),wrongWhy:'check'},{src:prog('    let coins = 12;\n    println!("{}", coins);\n'),wrongWhy:'check'}],
      defines:['type-annotation'],previews:[],
      check:c=>c.out()!=='12\n'?'The program has to print `12` on one line.':c.count('let')<1?'Give the number a name with `let` first.':c.count('annot')<1?'Say the type in the code: write `: i32` after the name.':c.count('var-use')<1?'Print the variable `coins` instead of typing the number.':true
    },
    {
      title:'Numbers with a decimal point',kind:'write',
      goal:'A cake costs <code>2.5</code> coins. Work out the price of <code>3</code> cakes in a variable called <code>total</code> and print it: <code>7.5</code>.',
      how:[
        'The whole program multiplies a price by a count with <code>*</code> and prints the total.',
        'A number with a decimal point is an <code>f64</code>, a floating-point number. <code>let price: f64 = 2.5;</code> stores the price.',
        '<code>price * 3.0</code> multiplies. The <code>3.0</code> has a decimal point on purpose: Rust will not mix a whole number and an <code>f64</code> in one sum.',
        '<code>println!("{}", total);</code> prints <code>7.5</code>.'
      ],
      explain:'<code>f64</code> is the decimal type. <code>let price: f64 = 2;</code> is an error, because <code>2</code> is a whole number: write <code>2.0</code>. Printing with <code>{}</code> leaves off a useless <code>.0</code>, so <code>2.5 * 2.0</code> prints <code>5</code>.',
      hint:'Write <code>let total = price * 3.0;</code> after you create <code>price</code>.',
      starter:STUB('make price and total, then print total'),
      answer:prog('    let price: f64 = 2.5;\n    let total = price * 3.0;\n    println!("{}", total);\n'),
      alts:[prog('    let price = 2.5;\n    let total = price * 3.0;\n    println!("{}", total);\n'),prog('    let price: f64 = 2.5;\n    let total = price + price + price;\n    println!("{}", total);\n')],
      wrong:[{src:prog('    let price: f64 = 2.5;\n    let total = price * 2.0;\n    println!("{}", total);\n'),wrongWhy:'check'},{src:prog('    let price: f64 = 2;\n    let total = price * 3.0;\n    println!("{}", total);\n'),wrongWhy:'E0308'}],
      lazy:[{src:prog('    println!("7.5");\n'),wrongWhy:'check'},{src:prog('    println!("{}", 7.5);\n'),wrongWhy:'check'},{src:prog('    let total = 7.5;\n    println!("{}", total);\n'),wrongWhy:'check'}],
      defines:[],previews:[],
      check:c=>c.out()!=='7.5\n'?'The program has to print `7.5` on one line.':c.count('let')<2?'Give the price and the total each a name with `let`.':c.count('op')<1?'Let Rust do the maths: multiply the price instead of typing `7.5`.':c.count('var-use')<2?'Use the names: multiply `price` and print `total`.':true
    },
    {
      title:'Change a type with as',kind:'write',
      goal:'You have <code>7</code> coins (an <code>i32</code>) and a price of <code>2.5</code> (an <code>f64</code>). Turn the coins into an <code>f64</code> with <code>as</code>, multiply, and print <code>17.5</code>.',
      how:[
        'The whole program uses <code>as</code> to convert a whole number to a decimal number, multiplies it by a price and prints the result.',
        '<code>coins as f64</code> reads the value of <code>coins</code> and gives you the same number as an <code>f64</code>. The variable itself keeps its type.',
        '<code>coins as f64 * price</code> does the conversion first, then multiplies two <code>f64</code> values.',
        'Rust never converts for you, so without <code>as</code> the sum would not compile.'
      ],
      explain:'<code>as</code> converts between number types. Going from decimals to whole numbers cuts off the decimals: <code>2.5 as i32</code> is <code>2</code>. Going to a smaller whole-number type keeps only what fits.',
      hint:'Write <code>coins as f64 * price</code> inside the <code>println!</code>, or in a <code>let</code>.',
      starter:prog('    let coins: i32 = 7;\n    let price: f64 = 2.5;\n    // multiply them and print the total\n'),
      answer:prog('    let coins: i32 = 7;\n    let price: f64 = 2.5;\n    let total = coins as f64 * price;\n    println!("{}", total);\n'),
      alts:[prog('    let coins: i32 = 7;\n    let price: f64 = 2.5;\n    println!("{}", (coins as f64) * price);\n'),prog('    let coins: i32 = 7;\n    let price: f64 = 2.5;\n    let total = price * coins as f64;\n    println!("{}", total);\n')],
      wrong:[{src:prog('    let coins: i32 = 7;\n    let price: f64 = 2.5;\n    println!("{}", coins as f64 + price);\n'),wrongWhy:'check'},{src:prog('    let coins: i32 = 7;\n    let price: f64 = 2.5;\n    println!("{}", price as i32 * coins);\n'),wrongWhy:'check'}],
      lazy:[{src:prog('    println!("17.5");\n'),wrongWhy:'check'},{src:prog('    println!("{}", 7.0 * 2.5);\n'),wrongWhy:'check'},{src:prog('    let coins: i32 = 7;\n    let price: f64 = 2.5;\n    let total = 17.5;\n    println!("{}", total);\n'),wrongWhy:'check'}],
      defines:['cast'],previews:[],
      check:c=>c.out()!=='17.5\n'?'The program has to print `17.5` on one line.':c.count('cast')<1?'Convert the coins with `as f64` before you multiply.':c.count('var-use')<2?'Use the variables `coins` and `price` instead of typing the numbers.':true
    },
    {
      title:'Keep values together in a tuple',kind:'write',
      goal:'Make a tuple that holds the pet name <code>"Pip"</code> and the age <code>3</code>, and print <code>Pip is 3</code> by reading its two parts.',
      how:[
        'The whole program packs a name and an age into one value with <code>( )</code>, then takes them out again to print a sentence.',
        'A tuple groups several values, possibly of different types, in parentheses: <code>("Pip", 3)</code>.',
        '<code>pet.0</code> is the first part and <code>pet.1</code> the second. Counting starts at <code>0</code>.',
        '<code>println!("{} is {}", pet.0, pet.1);</code> fills two holes, one with each part.'
      ],
      explain:'A tuple has a fixed size, and each place keeps its own type. Its parts are named by position, so <code>pet.2</code> would be an error here.',
      hint:'Write <code>let pet = ("Pip", 3);</code> and then read <code>pet.0</code> and <code>pet.1</code>.',
      starter:STUB('make the tuple, then print the sentence'),
      answer:prog('    let pet = ("Pip", 3);\n    println!("{} is {}", pet.0, pet.1);\n'),
      alts:[prog('    let pet = ("Pip", 3);\n    let name = pet.0;\n    let age = pet.1;\n    println!("{} is {}", name, age);\n'),prog('    let pet = ("Pip", 3i32);\n    println!("{} is {}", pet.0, pet.1);\n')],
      wrong:[{src:prog('    let pet = ("Pip", 3);\n    println!("{} is {}", pet.1, pet.0);\n'),wrongWhy:'check'},{src:prog('    let pet = ("Pip", 3);\n    println!("{} is {}", pet.0, pet.0);\n'),wrongWhy:'check'}],
      lazy:[{src:prog('    println!("Pip is 3");\n'),wrongWhy:'check'},{src:prog('    let name = "Pip";\n    let age = 3;\n    println!("{} is {}", name, age);\n'),wrongWhy:'check'},{src:prog('    let pet = ("Pip", 3);\n    println!("Pip is {}", pet.1);\n'),wrongWhy:'check'}],
      defines:['tuple','field'],previews:[],
      check:c=>c.out()!=='Pip is 3\n'?'The program has to print `Pip is 3` on one line.':c.count('tuple')<1?'Group the name and the age in a tuple: `("Pip", 3)`.':c.count('field')<2?'Read both parts back out of the tuple, with `.0` and `.1`.':true
    },
    {
      title:'Line values up in an array',kind:'write',
      goal:'The shell scale shows three weights, <code>[10, 20, 30]</code>. Print the middle one, <code>20</code>, and then all of them with <code>{:?}</code>.',
      how:[
        'The whole program stores three numbers in one array with <code>[ ]</code>, prints one of them by its place, then prints all three.',
        'An array holds several values of the <em>same</em> type in square brackets: <code>let weights = [10, 20, 30];</code>.',
        '<code>weights[1]</code> is the value at place <code>1</code>. Places count from <code>0</code>, so <code>weights[0]</code> is <code>10</code> and <code>weights[1]</code> is <code>20</code>.',
        '<code>{:?}</code> is a hole that prints a whole tuple or array in a debugging layout: <code>[10, 20, 30]</code>. Plain <code>{}</code> cannot print one.'
      ],
      explain:'Asking for a place past the end, like <code>weights[3]</code>, is a mistake Rust refuses to build when it can see it. Arrays also show their size in their type: <code>[i32; 3]</code> is three <code>i32</code> values.',
      hint:'Write <code>println!("{}", weights[1]);</code> and then <code>println!("{:?}", weights);</code>.',
      starter:STUB('make weights, print the middle one, then print all of them'),
      answer:prog('    let weights = [10, 20, 30];\n    println!("{}", weights[1]);\n    println!("{:?}", weights);\n'),
      alts:[prog('    let weights: [i32; 3] = [10, 20, 30];\n    println!("{}", weights[1]);\n    println!("{:?}", weights);\n'),prog('    let weights = [10, 20, 30];\n    let mid = weights[1];\n    println!("{}", mid);\n    println!("{:?}", weights);\n')],
      wrong:[{src:prog('    let weights = [10, 20, 30];\n    println!("{}", weights[0]);\n    println!("{:?}", weights);\n'),wrongWhy:'check'},{src:prog('    let weights = [10, 20, 30];\n    println!("{}", weights[3]);\n    println!("{:?}", weights);\n'),wrongWhy:'unconditional_panic'}],
      lazy:[{src:prog('    println!("20");\n    println!("[10, 20, 30]");\n'),wrongWhy:'check'},{src:prog('    println!("{}", [10, 20, 30][1]);\n    println!("{:?}", [10, 20, 30]);\n'),wrongWhy:'check'},{src:prog('    let weights = [10, 20, 30];\n    println!("{}", 20);\n    println!("{:?}", weights);\n'),wrongWhy:'check'}],
      defines:['array','index'],previews:[],
      check:c=>c.out()!=='20\n[10, 20, 30]\n'?'The program has to print `20` and then `[10, 20, 30]`, each on its own line.':c.count('let')<1?'Give the array a name with `let` first.':c.count('array')<1||c.count('index')<1?'Make an array with square brackets and read its middle with `[1]`.':c.count('var-use')<2?'Use the name of the array in both prints.':true
    },
    {
      title:'A value that never changes',kind:'write',
      goal:'A player starts with <code>MAX_LIVES</code> lives, which is <code>3</code>, and has lost one. Print how many remain: <code>2</code>.',
      how:[
        'The whole program names a fixed number once, outside <code>main</code>, then uses it in a sum.',
        '<code>const MAX_LIVES: i32 = 3;</code> declares a constant. It is written outside <code>main</code>, and the type is required.',
        'Constants are written in capital letters with underscores, so they stand out. The value can never change, not even with <code>mut</code>.',
        '<code>MAX_LIVES - 1</code> uses the constant like any other value.'
      ],
      explain:'A <code>const</code> is for a value the whole program agrees on. Changing it in one place changes it everywhere, so no number gets forgotten.',
      hint:'Put <code>const MAX_LIVES: i32 = 3;</code> above <code>main</code>, then print <code>MAX_LIVES - 1</code>.',
      starter:STUB('print the lives that remain'),
      answer:withConst('const MAX_LIVES: i32 = 3;','    println!("{}", MAX_LIVES - 1);\n'),
      alts:[withConst('const MAX_LIVES: i32 = 3;','    let lives = MAX_LIVES - 1;\n    println!("{}", lives);\n'),withConst('const MAX_LIVES: i32 = 3;','    let lost = 1;\n    println!("{}", MAX_LIVES - lost);\n')],
      wrong:[{src:withConst('const MAX_LIVES: i32 = 3;','    println!("{}", MAX_LIVES + 1);\n'),wrongWhy:'check'},{src:withConst('const MAX_LIVES: i32 = 3;','    println!("{}", MAX_LIVES);\n'),wrongWhy:'check'}],
      lazy:[{src:withConst('const MAX_LIVES: i32 = 3;','    println!("2");\n'),wrongWhy:'check'},{src:withConst('const MAX_LIVES: i32 = 3;','    println!("{}", 3 - 1);\n'),wrongWhy:'check'},{src:withConst('const MAX_LIVES: i32 = 2;','    println!("{}", MAX_LIVES);\n'),wrongWhy:'check'},{src:prog('    let max_lives = 3;\n    println!("{}", max_lives - 1);\n'),wrongWhy:'check'}],
      defines:['const'],previews:[],
      check:c=>c.out()!=='2\n'?'The program has to print `2` on one line.':c.count('const')<1?'Declare `MAX_LIVES` with `const`, above `main`.':c.count('const-use')<1?'Use the constant: write `MAX_LIVES` in the sum instead of typing `3`.':c.count('op')<1?'Take one life away with maths instead of typing the answer.':c.count('hole')<1?'Print the result with a `{}` hole.':true
    },
    {
      title:'A number too big for its type',kind:'fix',
      goal:'This program stops with an error before it runs: <code>pools</code> is a <code>u8</code>, and <code>255 + 1</code> is too big for one. Fix it so it prints <code>256</code>.',
      how:[
        'The whole program adds two numbers into <code>pools</code> and prints it. Rust refuses to build it, because the answer cannot be stored.',
        'A <code>u8</code> holds <code>0</code> to <code>255</code>. In <code>let pools: u8 = 255 + 1;</code> the compiler works out the sum, sees <code>256</code>, and stops.',
        'The stop is a lint called <code>arithmetic_overflow</code>. A lint is an extra check the compiler runs, and this one is on by default.',
        'Give <code>pools</code> a bigger type, such as <code>u16</code>, which holds up to <code>65535</code>, and the sum fits.'
      ],
      explain:'The lint is called <code>arithmetic_overflow</code>. Writing <code>let pools: u8 = 256;</code> trips a sister lint, <code>overflowing_literals</code>, because the number itself is too big. Either way the fix is the same: pick a type with more room.',
      hint:'Change <code>u8</code> to <code>u16</code>.',
      starter:prog('    let pools: u8 = 255 + 1;\n    println!("{}", pools);\n'),
      starterErr:'arithmetic_overflow',
      answer:prog('    let pools: u16 = 255 + 1;\n    println!("{}", pools);\n'),
      alts:[prog('    let pools: i32 = 255 + 1;\n    println!("{}", pools);\n'),prog('    let pools: u32 = 256;\n    println!("{}", pools);\n')],
      wrong:[{src:prog('    let pools: u8 = 255;\n    println!("{}", pools);\n'),wrongWhy:'check'},{src:prog('    let pools: u8 = 200 + 56;\n    println!("{}", pools);\n'),wrongWhy:'arithmetic_overflow'},{src:prog('    let pools: u8 = 256;\n    println!("{}", pools);\n'),wrongWhy:'overflowing_literals'}],
      lazy:[{src:prog('    println!("256");\n'),wrongWhy:'check'},{src:prog('    println!("{}", 256);\n'),wrongWhy:'check'},{src:prog('    let pools: u16 = 255;\n    println!("256");\n'),wrongWhy:'check'}],
      defines:[],previews:[],
      check:c=>c.out()!=='256\n'?'The program has to print `256` on one line.':c.count('let')<1||c.count('annot')<1?'Keep the variable and its type: change the type, do not remove it.':c.count('var-use')<1?'Print the variable `pools` instead of typing the number.':true
    },
    {
      title:'When a program panics',kind:'write',expect:'panic',
      goal:'The function <code>add</code> is already written. Call it from <code>main</code> with <code>250</code> and <code>10</code> and print the result, then watch the program stop with a panic.',
      how:[
        'The whole program asks <code>add</code> to add two <code>u8</code> numbers whose sum does not fit, so it builds, runs, and then stops on the spot.',
        'This time the compiler cannot see the problem. The numbers only meet when <code>add</code> runs, so there is nothing to refuse at build time.',
        'The numbers go to <code>add</code> as <code>add(250, 10)</code>. Inside, <code>a + b</code> is <code>260</code>, and a <code>u8</code> cannot hold that.',
        'Rust stops the program with a panic: a message on the error output and the exit code <code>101</code>. Output printed earlier is kept.'
      ],
      explain:'A panic is how a Rust program stops itself when it cannot go on. Last mission the compiler spotted the overflow and refused to build. Here it could not, so the check happens while the program runs. Compare <code>250u8 + 10</code> written straight in <code>main</code>: the compiler sees both numbers and stops it with <code>arithmetic_overflow</code>, a lint, or <code>unconditional_panic</code> for a division by zero. The <code>fn add</code> part declares a function of your own: Chapter 3 shows how to write one. The list <code>(a: u8, b: u8)</code> names the values it receives (Chapter 3 covers parameters), and <code>-> u8</code> says what type it gives back (Chapter 3 covers return types).',
      hint:'Inside <code>main</code>, write <code>println!("{}", add(250, 10));</code>.',
      starter:ADD+'fn main() {\n}\n',
      answer:ADD+'fn main() {\n    println!("{}", add(250, 10));\n}\n',
      alts:[ADD+'fn main() {\n    let n = add(250, 10);\n    println!("{}", n);\n}\n',ADD+'fn main() {\n    println!("{}", add(255, 1));\n}\n'],
      wrong:[{src:ADD+'fn main() {\n    println!("{}", 250u8 + 10);\n}\n',wrongWhy:'arithmetic_overflow'},{src:ADD+'fn main() {\n    println!("{}", add(100, 100));\n}\n',wrongWhy:'check'}],
      lazy:[{src:ADD+'fn main() {\n    println!("{}", add(1, 2));\n}\n',wrongWhy:'check'},{src:ADD+'fn main() {\n    println!("101");\n}\n',wrongWhy:'check'},{src:'fn add(a: u8, b: u8) -> u8 {\n    panic!("attempt to add with overflow");\n}\n\nfn main() {\n    println!("{}", add(1, 2));\n}\n',wrongWhy:'check'}],
      defines:[],
      previews:[
        {tag:'fn-decl',wording:'The <code>fn add</code> part declares a function of your own: Chapter 3 shows how to write one.',home:3},
        {tag:'fn-params',wording:'The list <code>(a: u8, b: u8)</code> names the values it receives (Chapter 3 covers parameters)',home:3},
        {tag:'fn-ret',wording:'<code>-> u8</code> says what type it gives back (Chapter 3 covers return types)',home:3}
      ],
      check:c=>c.calls('add')<1?'Call `add` from `main`, and print what it gives back.':c.usesMacro('panic')>0?'Do not call `panic!` yourself. Let the addition in `add` overflow, so Rust panics for you.':c.status!=='panic'?'It ran to the end, because the sum fits in a `u8`. Pick numbers that add up to more than `255`.':c.exit===101&&c.panic.msg==='attempt to add with overflow'?true:'The program panicked, but not from the addition. Add two numbers that are too big for a `u8`.'
    }
  ]
});
})();
