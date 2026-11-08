/* Append only: a mission's key is '5.<index>' and shipped keys are never renumbered. DOM-free. */
(()=>{
'use strict';
const RQ=globalThis.RQ=globalThis.RQ||{};
const L=(...lines)=>lines.join('\n')+'\n';
const PET=L('struct Pet {','    name: String,','    age: u32,','}');
const DPET=L('#[derive(Debug)]','struct Pet {','    name: String,','    age: u32,','}');
const MAIN=(...body)=>L('','fn main() {',...body.map(l=>'    '+l),'}');
const RECT=L('struct Rect {','    w: u32,','    h: u32,','}');
const AREA_MAIN=L('fn main() {','    let a = Rect { w: 3, h: 4 };','    let b = Rect { w: 10, h: 2 };','    println!("{} {}", a.area(), b.area());','}');
const BUMP=sig=>L('struct Counter {','    n: u32,','}','','impl Counter {',...sig,'}');
const BUMP_MAIN=L('','fn main() {','    let mut a = Counter { n: 0 };','    a.bump();','    a.bump();','    let mut b = Counter { n: 10 };','    b.bump();','    println!("{} {}", a.n, b.n);','}');
const NEW_MAIN=L('','fn main() {','    let a = Pet::new("Pip", 3);','    let b = Pet::new("Moss", 11);','    println!("{} is {}", a.name, a.age);','    println!("{} is {}", b.name, b.age);','}');
const NEW=(body)=>L(PET.trim(),'','impl Pet {','    fn new(name: &str, age: u32) -> Pet {',...body,'    }','}');
const OWN=(...body)=>L(PET.trim(),'','impl Pet {','    fn new(name: &str, age: u32) -> Pet {','        Pet { name: String::from(name), age }','    }','','    fn into_name(self) -> String {','        self.name','    }','}',...MAIN(...body).split('\n').slice(0,-1));

RQ.CH.push({
  name:'Structs and methods',
  badge:'Shape Maker',
  intro:'A tuple keeps values together, but you have to remember what each position means. A <code>struct</code> is a type of your own whose parts have names. In this chapter you build one, give it functions that belong to it, and meet the three ways a function can take the thing it works on: by value, by <code>&amp;</code> and by <code>&amp;mut</code>, which are the loans from chapter 5 again.',
  toolbox:'In this chapter: <code>struct</code> with named fields, <code>pet.name</code>, <code>#[derive(Debug)]</code> with <code>{:?}</code>, <code>impl</code> blocks, functions like <code>Pet::new</code>, and methods that take <code>&amp;self</code>, <code>&amp;mut self</code> or <code>self</code>, plus the error <code>E0594</code>.',
  learned:['struct','fields','derive(Debug)','impl','Type::new','&self','&mut self','self','E0594'],
  missions:[
    {
      title:'Name the parts with a struct',kind:'write',
      goal:'Write a <code>struct</code> called <code>Pet</code> with a <code>name</code> (a <code>String</code>) and an <code>age</code> (a <code>u32</code>). In <code>main</code>, build a <code>Pet</code> called <code>Pip</code> who is <code>3</code>, and print <code>Pip is 3</code> by reading the two fields back.',
      how:[
        'The whole program describes a pet, builds one, and reads its parts back. A <code>struct</code> is a type you design yourself: a group of fields, each with a name and a type. A tuple keeps values together by position, and a <code>struct</code> gives every part a name.',
        '<code>struct Pet { name: String, age: u32 }</code> declares it. Each field is a name, a <code>:</code> and a type, and the fields are separated by commas.',
        '<code>Pet { name: String::from("Pip"), age: 3 }</code> builds one. Every field gets a value, in any order.',
        '<code>pet.name</code> and <code>pet.age</code> read the fields with a <code>.</code>, like the <code>.0</code> on a tuple, but with names.'
      ],
      explain:'A <code>struct</code> is a new type made of other types. The <code>Pet</code> owns its <code>String</code>, so when the <code>Pet</code> goes away, its text is freed with it. Press Run and step to the last line: the memory view shows <code>pet</code> with both of its fields, and its <code>name</code> pointing to the <code>String</code> on the heap. Two shorter forms exist too: <code>struct Meters(u32);</code> has fields numbered like a tuple, read as <code>m.0</code>, and <code>struct Marker;</code> has no fields at all.',
      hint:'Declare the <code>struct</code> above <code>main</code>. Then build it with <code>Pet { name: ..., age: ... }</code> and print <code>pet.name</code> and <code>pet.age</code> with two <code>{}</code> holes.',
      starter:L(PET.trim(),'','fn main() {','    // build a Pet and print it','}'),
      answer:L(PET.trim(),'','fn main() {','    let pet = Pet {','        name: String::from("Pip"),','        age: 3,','    };','    println!("{} is {}", pet.name, pet.age);','}'),
      alts:[L('struct Pet {','    age: u32,','    name: String,','}','','fn main() {','    let p = Pet { age: 3, name: String::from("Pip") };','    println!("{} is {}", p.name, p.age);','}'),
        L(PET.trim(),'','fn main() {','    let pet = Pet { name: String::from("Pip"), age: 3 };','    print!("{} is ", pet.name);','    println!("{}", pet.age);','}')],
      wrong:[{src:L(PET.trim(),'','fn main() {','    let pet = Pet { name: String::from("Pip"), age: 4 };','    println!("{} is {}", pet.name, pet.age);','}'),wrongWhy:'check'},
        {src:L(PET.trim(),'','fn main() {','    let pet = Pet { name: String::from("Pip"), age: 3 };','    println!("{} is {}", pet.age, pet.name);','}'),wrongWhy:'check'}],
      lazy:[{src:L(PET.trim(),'','fn main() {','    println!("Pip is 3");','}'),wrongWhy:'check'},
        {src:L(PET.trim(),'','fn main() {','    let pet = Pet { name: String::from("Pip"), age: 3 };','    println!("Pip is {}", pet.age);','}'),wrongWhy:'check'},
        {src:L('fn main() {','    println!("{} is {}", "Pip", 3);','}'),wrongWhy:'check'}],
      defines:['struct'],previews:[],
      check:c=>c.out()!=='Pip is 3\n'?'The program has to print `Pip is 3` on one line, with the name first and then the age.':c.count('struct')<1?'Declare a `struct` called `Pet` above `main`.':c.fieldsPrinted()<2?'Build a `Pet`, then print its `name` and `age` into two `{}` holes by reading them with a dot, instead of typing them again.':true
    },
    {
      title:'Fields change only on a mut variable',kind:'fix',
      goal:'This program stops with an error, because it changes <code>pet.age</code> on a variable that is not <code>mut</code>. Fix it so it gives Pip a birthday and prints <code>Pip is 4</code>.',
      how:[
        'The whole program builds a pet who is 3, gives it a birthday by assigning a new <code>age</code>, and prints the pet. Rust stops at the assignment.',
        'A field belongs to the <code>struct</code> that holds it, so a field can only change when the whole variable can. The error <code>E0594</code> says it: you cannot assign to a field of a variable that is not <code>mut</code>.',
        'There is no way to make just one field <code>mut</code>. The <code>mut</code> goes on the <code>let</code> of the whole <code>struct</code>, as it did for plain numbers in chapter 1.',
        'Keep the line <code>pet.age = 4;</code>. It is the birthday, and the fix is on the line above it.'
      ],
      explain:'Mutability belongs to the variable, never to a single field. One <code>mut</code> on the <code>let</code> unlocks every field of the <code>struct</code>, and without it none of them can change.',
      hint:'Write <code>let mut pet</code> instead of <code>let pet</code>.',
      starter:L(PET.trim(),MAIN('let pet = Pet { name: String::from("Pip"), age: 3 };','pet.age = 4;','println!("{} is {}", pet.name, pet.age);').trim()),
      starterErr:'E0594',
      answer:L(PET.trim(),MAIN('let mut pet = Pet { name: String::from("Pip"), age: 3 };','pet.age = 4;','println!("{} is {}", pet.name, pet.age);').trim()),
      alts:[L(PET.trim(),MAIN('let mut p = Pet { name: String::from("Pip"), age: 3 };','p.age = p.age + 1;','println!("{} is {}", p.name, p.age);').trim())],
      wrong:[{src:L(PET.trim(),MAIN('let mut pet = Pet { name: String::from("Pip"), age: 3 };','pet.age = 5;','println!("{} is {}", pet.name, pet.age);').trim()),wrongWhy:'check'},
        {src:L(PET.trim(),MAIN('let mut pet = Pet { name: String::from("Pip"), age: 3 };','println!("{} is {}", pet.name, pet.age);').trim()),wrongWhy:'check'}],
      lazy:[{src:L(PET.trim(),MAIN('let pet = Pet { name: String::from("Pip"), age: 4 };','println!("{} is {}", pet.name, pet.age);').trim()),wrongWhy:'check'},
        {src:L(PET.trim(),MAIN('println!("Pip is 4");').trim()),wrongWhy:'check'}],
      defines:[],previews:[],
      check:c=>c.out()!=='Pip is 4\n'?'The program has to print `Pip is 4`: Pip starts at 3 and has a birthday.':c.count('assign')<1?'Keep the birthday: assign the new `age` to the field instead of building the pet with 4 already in it.':c.count('mut')<1?'Put `mut` on the `let` of the variable that holds the pet.':c.fieldsPrinted()<2?'Print the name and the age of the `pet` through two `{}` holes, so the program shows what the pet holds.':true
    },
    {
      title:'Print a whole struct',kind:'fix',
      goal:'This program stops with an error, because <code>{:?}</code> does not know how to print a <code>Pet</code>. Fix it so it prints <code>Pet { name: "Pip", age: 3 }</code>.',
      how:[
        'The whole program builds a pet and asks <code>println!</code> to print all of it at once with the <code>{:?}</code> hole from chapter 2. A tuple or an array knows how to print itself that way, but a <code>struct</code> you made does not yet.',
        'Rust cannot guess how you want your type shown, so it reports <code>E0277</code>: the type does not implement <code>Debug</code>.',
        'The line <code>#[derive(Debug)]</code> goes right above the <code>struct</code>. This line asks the compiler to write the <code>{:?}</code> printing code for you. Chapter 11 explains traits.',
        'Nothing else changes: the <code>println!</code> stays the same.'
      ],
      explain:'<code>#[derive(Debug)]</code> writes the debugging printout for you. It shows the name of the type, then every field with its name and value, and text is shown in quotes. Press Run to see the layout.',
      hint:'Add <code>#[derive(Debug)]</code> on the line above <code>struct Pet</code>.',
      starter:L(PET.trim(),MAIN('let pet = Pet { name: String::from("Pip"), age: 3 };','println!("{:?}", pet);').trim()),
      starterErr:'E0277',
      answer:L(DPET.trim(),MAIN('let pet = Pet { name: String::from("Pip"), age: 3 };','println!("{:?}", pet);').trim()),
      alts:[L(DPET.trim(),MAIN('let p = Pet { age: 3, name: String::from("Pip") };','println!("{:?}", p);').trim())],
      wrong:[{src:L(DPET.trim(),MAIN('let pet = Pet { name: String::from("Pip"), age: 3 };','println!("{}", pet.name);').trim()),wrongWhy:'check'},
        {src:L(DPET.trim(),MAIN('let pet = Pet { name: String::from("Moss"), age: 3 };','println!("{:?}", pet);').trim()),wrongWhy:'check'}],
      lazy:[{src:L(PET.trim(),MAIN('let pet = Pet { name: String::from("Pip"), age: 3 };','println!("Pet {{ name: \\"{}\\", age: {} }}", pet.name, pet.age);').trim()),wrongWhy:'check'},
        {src:L(PET.trim(),MAIN('println!("Pet {{ name: \\"Pip\\", age: 3 }}");').trim()),wrongWhy:'check'}],
      defines:[],
      previews:[{tag:'derive',wording:'This line asks the compiler to write the <code>{:?}</code> printing code for you. Chapter 11 explains traits.',home:11}],
      check:c=>c.out()!=='Pet { name: "Pip", age: 3 }\n'?'The program has to print `Pet { name: "Pip", age: 3 }` by printing the whole `Pet` with `{:?}`.':c.count('derive')<1||c.count('hole')<1?'Ask the compiler to write the printing code with `#[derive(Debug)]` above the `struct`, and print the whole `Pet` through a `{:?}` hole; do not rebuild the text by hand.':true
    },
    {
      title:'A function that belongs to a type',kind:'write',
      goal:'Add a function <code>new</code> to <code>Pet</code> that takes a name (a <code>&amp;str</code>) and an age (a <code>u32</code>) and gives back a <code>Pet</code>. The hidden <code>main</code> calls <code>Pet::new("Pip", 3)</code> and <code>Pet::new("Moss", 11)</code> and prints each pet, so the program should print <code>Pip is 3</code> and then <code>Moss is 11</code>.',
      how:[
        'The whole program puts the building of a <code>Pet</code> inside the <code>Pet</code> type itself, so every caller builds pets the same way. This is the promise from chapter 4: <code>::</code> names a function that belongs to a type, and now you write your own.',
        '<code>impl Pet { ... }</code> opens a block of functions that belong to <code>Pet</code>. A function in it with no <code>self</code> parameter is an <em>associated function</em>, and you call it with <code>Pet::new(...)</code>.',
        '<code>fn new(name: &amp;str, age: u32) -> Pet</code> takes the pieces and returns a finished <code>Pet</code>. Inside, <code>String::from(name)</code> turns the borrowed text into an owned <code>String</code> for the <code>name</code> field.',
        'The last expression of the body, <code>Pet { name: ..., age: ... }</code>, has no <code>;</code>, so it is the value the function returns. <code>Self</code> is another way to write <code>Pet</code> inside an <code>impl</code>.'
      ],
      explain:'<code>String::from</code> is exactly this kind of function: a function that belongs to <code>String</code> and builds one. An <code>impl</code> block is how you give your own types the same thing. Naming it <code>new</code> is only a habit, not a rule.',
      hint:'Inside the <code>impl Pet</code> block, write a function whose last line is <code>Pet { name: String::from(name), age: age }</code>.',
      harness:NEW_MAIN,
      starter:NEW(['        Pet { name: String::new(), age: 0 }']),
      answer:NEW(['        Pet { name: String::from(name), age: age }']),
      alts:[NEW(['        Pet { name: name.to_string(), age: age }']),NEW(['        Pet { name: String::from(name), age }']),NEW(['        Self { name: String::from(name), age }']),NEW(['        let pet = Pet { name: String::from(name), age: age };','        pet'])],
      wrong:[{src:NEW(['        Pet { name: String::from(name), age: 0 }']),wrongWhy:'check'},{src:NEW(['        Pet { name: String::from("Pip"), age }']),wrongWhy:'check'}],
      lazy:[{src:NEW(['        Pet { name: String::new(), age: 3 }']),wrongWhy:'check'},{src:NEW(['        Pet { name: String::from(name), age: 3 }']),wrongWhy:'check'}],
      defines:['impl','path-call'],previews:[],
      check:c=>c.out()!=='Pip is 3\nMoss is 11\n'?'`Pet::new` has to give back a `Pet` with the name and the age it was given. The program should print `Pip is 3` and then `Moss is 11`.':c.count('assoc')<1?'Put the function `new` inside an `impl Pet { ... }` block, so `Pet::new(...)` finds it.':true
    },
    {
      title:'A method that reads its struct',kind:'write',
      goal:'A <code>Rect</code> has a width <code>w</code> and a height <code>h</code>. Add a method <code>area</code> that gives back <code>w * h</code>. The hidden <code>main</code> prints <code>a.area()</code> for a 3 by 4 rectangle and <code>b.area()</code> for a 10 by 2 one, so the program should print <code>12 20</code>.',
      how:[
        'The whole program asks a rectangle for its own area. A <em>method</em> is a function in an <code>impl</code> block whose first parameter is <code>self</code>, and you call it with a dot: <code>a.area()</code>. This is the other promise from chapter 4: the dot calls a function that belongs to the value.',
        '<code>fn area(&amp;self) -> u32</code> declares it. <code>&amp;self</code> is short for <code>self: &amp;Rect</code>: the method borrows the rectangle it was called on, like the <code>&amp;</code> loans of chapter 5, so the caller keeps its rectangle.',
        'Inside, <code>self.w</code> and <code>self.h</code> read the fields of that rectangle, and <code>self.w * self.h</code> is the answer.',
        'The hidden <code>main</code> builds two rectangles and calls <code>area</code> on each, so a method that only works for one size will not pass.'
      ],
      explain:'<code>a.area()</code> is a nicer way to write <code>Rect::area(&amp;a)</code>: Rust fills in the loan for you, and <code>self</code> inside the method is that loan. Because it only borrows, <code>a</code> and <code>b</code> are still there to use after the call.',
      hint:'Write <code>impl Rect { fn area(&amp;self) -> u32 { self.w * self.h } }</code>.',
      harness:L(RECT.trim(),AREA_MAIN.trim()),
      starter:L('impl Rect {','    fn area(&self) -> u32 {','        0','    }','}'),
      answer:L('impl Rect {','    fn area(&self) -> u32 {','        self.w * self.h','    }','}'),
      alts:[L('impl Rect {','    fn area(&self) -> u32 {','        self.h * self.w','    }','}'),L('impl Rect {','    fn area(&self) -> u32 {','        return self.w * self.h;','    }','}')],
      wrong:[{src:L('impl Rect {','    fn area(&self) -> u32 {','        self.w + self.h','    }','}'),wrongWhy:'check'},{src:L('impl Rect {','    fn area(&self) -> u32 {','        self.w * self.w','    }','}'),wrongWhy:'check'},{src:L('impl Rect {','    fn area(self) -> u32 {','        self.w * self.h','    }','}'),wrongWhy:'check'}],
      lazy:[{src:L('impl Rect {','    fn area(&self) -> u32 {','        12','    }','}'),wrongWhy:'check'},{src:L('impl Rect {','    fn area(&self) -> u32 {','        3 * 4','    }','}'),wrongWhy:'check'}],
      defines:['method-call'],previews:[],
      check:c=>c.out()!=='12 20\n'?'`area` has to give back the width times the height of the rectangle it was called on, so the program prints `12 20`.':c.count('method')<1?'Write `area` inside an `impl Rect` block, with `&self` as its first parameter.':c.selfOf('area')!=='&'?'Take `&self`, so `area` only borrows the rectangle and the caller keeps it.':true
    },
    {
      title:'A method that changes its struct',kind:'fix',
      goal:'This program stops with an error, because <code>bump</code> changes <code>self.n</code> through a plain <code>&amp;self</code> loan. Fix it so two bumps on the first counter and one on the second print <code>2 11</code>.',
      how:[
        'The whole program makes two counters, bumps the first one twice and the second once, and prints both. <code>bump</code> adds one to the counter it was called on.',
        'A plain <code>&amp;self</code> is a read-only loan, like a plain <code>&amp;</code> in chapter 5, so changing <code>self.n</code> through it is the error <code>E0594</code>.',
        'A method that changes its <code>struct</code> borrows it mutably: <code>&amp;mut self</code>. The caller then needs the variable to be <code>mut</code>, and the hidden <code>main</code> already declares its counters that way.',
        'Only the signature changes. The body <code>self.n += 1;</code> stays as it is.'
      ],
      explain:'The three ways to take the value are the three ways to take any argument. <code>self</code> takes it away, <code>&amp;self</code> reads it, and <code>&amp;mut self</code> changes it. Choose the weakest one that does the job, and the caller can do more with its variable afterwards.',
      hint:'Change <code>&amp;self</code> to <code>&amp;mut self</code> in the signature of <code>bump</code>.',
      harness:BUMP_MAIN,
      starter:BUMP(['    fn bump(&self) {','        self.n += 1;','    }']),
      starterErr:'E0594',
      answer:BUMP(['    fn bump(&mut self) {','        self.n += 1;','    }']),
      alts:[BUMP(['    fn bump(&mut self) {','        self.n = self.n + 1;','    }'])],
      wrong:[{src:BUMP(['    fn bump(&mut self) {','        self.n += 2;','    }']),wrongWhy:'check'},{src:BUMP(['    fn bump(&mut self) {','        self.n = self.n * 2;','    }']),wrongWhy:'check'}],
      lazy:[{src:BUMP(['    fn bump(&mut self) {','        self.n = 2;','    }']),wrongWhy:'check'},{src:BUMP(['    fn bump(&mut self) {','    }']),wrongWhy:'check'}],
      defines:[],previews:[],
      check:c=>c.out()!=='2 11\n'?'Each `bump` has to add one to the counter it was called on, so the harness prints `2 11`.':c.selfOf('bump')!=='&mut'?'Take `&mut self`, so `bump` borrows the counter and may change it.':true
    },
    {
      title:'A method that takes self',kind:'fix',
      goal:'This program stops with an error, because <code>into_name</code> takes <code>self</code> and uses up the <code>Pet</code>, and then <code>main</code> reads <code>pet.age</code>. Fix it so it prints <code>Pip was 3</code>.',
      how:[
        'The whole program builds a pet, takes its name out with <code>into_name</code>, and then prints the name and the age. Rust refuses the last line.',
        'A plain <code>self</code> takes the value itself, not a loan. Calling <code>pet.into_name()</code> moves the <code>Pet</code> into the method, exactly like passing a <code>String</code> to a function in chapter 4, and <code>pet</code> is gone afterwards: <code>E0382</code>.',
        'You can read what you still need before the call, or you can change the method to borrow instead. Both keep the output the same.',
        'A method called <code>into_something</code> that takes <code>self</code> is a hint to the reader: "this uses the value up".'
      ],
      explain:'Methods follow the same ownership rules as functions, because they are functions. Taking <code>self</code> is the right choice when the method really uses the value up, like a function that turns a <code>Pet</code> into something else and has no use for the original. When it only looks, take <code>&amp;self</code>, and the caller keeps what it had.',
      hint:'Print the age before you call <code>into_name</code>, by copying it into a variable first.',
      starter:OWN('let pet = Pet::new("Pip", 3);','let name = pet.into_name();','println!("{} was {}", name, pet.age);'),
      starterErr:'E0382',
      answer:OWN('let pet = Pet::new("Pip", 3);','let age = pet.age;','let name = pet.into_name();','println!("{} was {}", name, age);'),
      alts:[L(PET.trim(),'','impl Pet {','    fn new(name: &str, age: u32) -> Pet {','        Pet { name: String::from(name), age }','    }','','    fn into_name(&self) -> String {','        self.name.clone()','    }','}',MAIN('let pet = Pet::new("Pip", 3);','let name = pet.into_name();','println!("{} was {}", name, pet.age);').trim())],
      wrong:[{src:OWN('let pet = Pet::new("Pip", 3);','let age = pet.age;','let name = pet.into_name();','println!("{} was {}", name, pet.age);'),wrongWhy:'E0382'},{src:OWN('let pet = Pet::new("Pip", 3);','let age = pet.age;','let name = pet.into_name();','println!("{} was {}", age, name);'),wrongWhy:'check'}],
      lazy:[{src:OWN('println!("Pip was 3");'),wrongWhy:'check'},{src:OWN('let pet = Pet::new("Pip", 3);','let name = pet.into_name();','println!("{} was {}", name, 3);'),wrongWhy:'check'}],
      defines:[],previews:[],
      check:c=>c.out()!=='Pip was 3\n'?'The program has to print `Pip was 3`: the name first, and then the age.':c.usesMethod('into_name')<1?'Keep using `into_name` to get the name.':c.count('field')<2?'Read the age out of the `pet` itself, instead of typing it again.':true
    }
  ]
});
})();
