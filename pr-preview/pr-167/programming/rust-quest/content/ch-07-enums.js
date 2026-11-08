/* Append only: a mission's key is '6.<index>' and shipped keys are never renumbered. DOM-free. */
(()=>{
'use strict';
const RQ=globalThis.RQ=globalThis.RQ||{};
const L=(...lines)=>lines.join('\n')+'\n';
const LIGHT=L('enum Light {','    Red,','    Yellow,','    Green,','}');
const LIGHT_MAIN=L('','fn main() {','    println!("{}", wait(Light::Red));','    println!("{}", wait(Light::Yellow));','    println!("{}", wait(Light::Green));','}');
const WAIT=(...arms)=>L('fn wait(light: Light) -> u32 {','    match light {',...arms.map(a=>'        '+a),'    }','}');
const SHAPE=L('enum Shape {','    Dot,','    Square(u32),','    Rect { w: u32, h: u32 },','}');
const SHAPE_MAIN=L('','fn main() {','    println!("{}", area(Shape::Square(3)));','    println!("{}", area(Shape::Rect { w: 2, h: 5 }));','    println!("{}", area(Shape::Dot));','    println!("{}", area(Shape::Square(4)));','    println!("{}", area(Shape::Rect { w: 6, h: 7 }));','}');
const AREA=(...arms)=>L('fn area(shape: Shape) -> u32 {','    match shape {',...arms.map(a=>'        '+a),'    }','}');
const EVEN_MAIN=L('','fn main() {','    match first_even(3, 8) {','        Some(n) => println!("found {}", n),','        None => println!("none"),','    }','    match first_even(5, 7) {','        Some(n) => println!("found {}", n),','        None => println!("none"),','    }','    match first_even(4, 6) {','        Some(n) => println!("found {}", n),','        None => println!("none"),','    }','}');
const EVEN=(...body)=>L('fn first_even(a: i32, b: i32) -> Option<i32> {',...body.map(l=>'    '+l),'}');
const GRADE_MAIN=L('','fn main() {','    println!("{}", grade(100));','    println!("{}", grade(95));','    println!("{}", grade(89));','    println!("{}", grade(80));','    println!("{}", grade(79));','    println!("{}", grade(12));','}');
const GRADE=(...arms)=>L('fn grade(score: u32) -> char {','    match score {',...arms.map(a=>'        '+a),'    }','}');
const SIZE_MAIN=L('','fn main() {','    println!("{}", size(0));','    println!("{}", size(5));','    println!("{}", size(50));','    println!("{}", size(200));','}');
const SIZE=(...arms)=>L('fn size(n: u8) -> u8 {','    match n {',...arms.map(a=>'        '+a),'    }','}');
const KIND_MAIN=L('','fn main() {','    println!("{}", kind(0));','    println!("{}", kind(-4));','    println!("{}", kind(8));','    println!("{}", kind(7));','}');
const KIND=(...arms)=>L('fn kind(n: i32) -> u32 {','    match n {',...arms.map(a=>'        '+a),'    }','}');
const FIZZ_MAIN=L('','fn main() {','    for n in 1..=15 {','        show(n);','    }','}');
const FIZZ_OUT='1\n2\nFizz\n4\nBuzz\nFizz\n7\n8\nFizz\nBuzz\n11\nFizz\n13\n14\nFizzBuzz\n';
const SHOW=(...arms)=>L('fn show(n: u32) {','    match (n % 3, n % 5) {',...arms.map(a=>'        '+a),'    }','}');
const OPT_MAIN=L('','fn main() {','    show(Some(7));','    show(None);','    show(Some(3));','}');
const OPT=(...body)=>L('fn show(o: Option<u32>) {',...body.map(l=>'    '+l),'}');
const STEP=L('fn step(n: u32) -> Option<u32> {','    if n == 0 {','        None','    } else {','        Some(n - 1)','    }','}');
const MAIN=(...body)=>L('fn main() {',...body.map(l=>'    '+l),'}');
const PLUS_MAIN=L('','fn main() {','    println!("{}", plus_one(Some(4)));','    println!("{}", plus_one(None));','    println!("{}", plus_one(Some(9)));','}');
const PLUS=(...body)=>L('fn plus_one(o: Option<i32>) -> i32 {',...body.map(l=>'    '+l),'}');
const SWAP_MAIN=L('','fn main() {','    let (a, b) = swap((1, 2));','    println!("{} {}", a, b);','    let (c, d) = swap((3, 9));','    println!("{} {}", c, d);','}');
const SWAP=(...body)=>L('fn swap(p: (i32, i32)) -> (i32, i32) {',...body.map(l=>'    '+l),'}');

RQ.CH.push({
  name:'Enums and match',
  badge:'Pattern Matcher',
  intro:'A <code>struct</code> says "all of these parts at once". An <code>enum</code> says "exactly one of these choices". You list the choices, and <code>match</code> makes you handle every one of them, so a case you forgot is an error you see before the program runs. This chapter also meets <code>Option</code>, Rust\'s way to say "a value, or nothing", and the shorter forms <code>if let</code>, <code>while let</code> and <code>let ... else</code> for when only one case matters.',
  toolbox:'In this chapter: <code>enum</code> with plain, tuple and named variants, <code>match</code> with literals, ranges, <code>|</code>, <code>_</code>, names, guards and pairs, <code>Option</code> with <code>Some</code> and <code>None</code>, <code>if let</code>, <code>while let</code>, <code>let ... else</code>, taking a tuple apart with <code>let</code>, and the errors <code>E0004</code> and <code>E0005</code>.',
  learned:['enum','match','E0004','_','ranges in match','guards','Option','if let','while let','let else','destructuring'],
  missions:[
    {
      title:'Name the choices with an enum',kind:'write',
      goal:'Write an <code>enum</code> called <code>Light</code> with the variants <code>Red</code>, <code>Yellow</code> and <code>Green</code>, and a function <code>wait</code> that takes a <code>Light</code> and gives back how many seconds to wait: <code>30</code> for red, <code>5</code> for yellow and <code>0</code> for green. The hidden <code>main</code> prints <code>wait</code> for each light, so the program should print <code>30</code>, <code>5</code> and <code>0</code>.',
      how:[
        'The whole program names the three states a traffic light can be in, and gives one answer for each. An <code>enum</code> is a type with a fixed list of choices, and a value of it is exactly one of them.',
        '<code>enum Light { Red, Yellow, Green }</code> declares it. Each choice is a <em>variant</em>, and you name one with <code>::</code>, like <code>Light::Red</code>.',
        '<code>match light { ... }</code> compares the value with a list of <em>arms</em>. An arm is a pattern (a shape the value is compared with), then <code>=&gt;</code>, then the value for that case, and arms are separated by commas.',
        'The patterns are tried from the top down, and the first one that fits gives the value of the whole <code>match</code>. Here <code>Light::Red =&gt; 30</code> fits a red light and nothing else.'
      ],
      explain:'A <code>match</code> is an <code>if</code>/<code>else</code> chain that knows about your choices. Unlike a chain of <code>if</code>s, Rust checks that you wrote an arm for every variant. The next mission shows what happens when you forget one. Press Run and look at the memory view: a value of an <code>enum</code> is drawn with the name of its variant.',
      hint:'Write one arm per variant: <code>Light::Red =&gt; 30,</code> and so on. The whole <code>match</code> is the last line of <code>wait</code>, with no <code>;</code> after it.',
      harness:LIGHT_MAIN,
      starter:L(LIGHT.trim(),'',WAIT('_ => 0').trim()),
      answer:L(LIGHT.trim(),'',WAIT('Light::Red => 30,','Light::Yellow => 5,','Light::Green => 0,').trim()),
      alts:[L('enum Light {','    Green,','    Yellow,','    Red,','}','',WAIT('Light::Green => 0,','Light::Yellow => 5,','Light::Red => 30,').trim()),L(LIGHT.trim(),'','fn wait(light: Light) -> u32 {','    let seconds = match light {','        Light::Red => 30,','        Light::Yellow => 5,','        Light::Green => 0,','    };','    seconds','}')],
      wrong:[{src:L(LIGHT.trim(),'',WAIT('Light::Red => 5,','Light::Yellow => 30,','Light::Green => 0,').trim()),wrongWhy:'check'},{src:L(LIGHT.trim(),'',WAIT('Light::Red => 30,','Light::Yellow => 5,').trim()),wrongWhy:'E0004'},{src:L(LIGHT.trim(),'',WAIT('Light::Red => 30,','Light::Yellow => 5,','Light::Green => "0",').trim()),wrongWhy:'E0308'}],
      lazy:[{src:L(LIGHT.trim(),'',WAIT('Light::Red => 30,','Light::Yellow => 30,','Light::Green => 30,').trim()),wrongWhy:'check'},{src:L(LIGHT.trim(),'','fn wait(light: Light) -> u32 {','    30','}'),wrongWhy:'check'}],
      defines:['enum','match'],previews:[],
      check:c=>c.out()!=='30\n5\n0\n'?'`wait` has to give `30` for red, `5` for yellow and `0` for green, so the program prints `30`, `5` and `0`.':c.count('enum')<1?'Declare an `enum` called `Light` above `wait`.':c.count('match')<1?'Choose the number with a `match` on the light.':c.count('arm')<3?'Give each of the three variants its own arm.':true
    },
    {
      title:'A match must cover every variant',kind:'fix',
      goal:'This program stops with an error, because the <code>match</code> in <code>wait</code> forgets the green light. Fix it so it prints <code>30</code>, <code>5</code> and <code>0</code>.',
      how:[
        'The whole program is the traffic light again, but the <code>match</code> has arms for red and yellow only. Rust refuses to build a <code>match</code> that could meet a value with no arm.',
        'The error is <code>E0004</code>, non-exhaustive patterns, and it names the case you left out: <code>Light::Green</code> not covered. Read the message, it is a to-do list.',
        'Add the missing arm, <code>Light::Green =&gt; 0,</code>. Another way is a last arm that starts with <code>_</code>, which means "anything else".',
        'Either way, every possible light now has an arm, and the program builds.'
      ],
      explain:'Rust checks that a <code>match</code> is <em>exhaustive</em>: whatever value arrives, some arm fits. That is why adding a variant to an <code>enum</code> later makes the compiler point at every <code>match</code> that needs updating. The arm <code>_ =&gt; ...</code> fits anything, so use it when the remaining cases really are the same.',
      hint:'Add the line <code>Light::Green =&gt; 0,</code> below the other two arms.',
      harness:LIGHT_MAIN,
      starter:L(LIGHT.trim(),'',WAIT('Light::Red => 30,','Light::Yellow => 5,').trim()),
      starterErr:'E0004',
      answer:L(LIGHT.trim(),'',WAIT('Light::Red => 30,','Light::Yellow => 5,','Light::Green => 0,').trim()),
      alts:[L(LIGHT.trim(),'',WAIT('Light::Red => 30,','Light::Yellow => 5,','_ => 0,').trim()),L(LIGHT.trim(),'',WAIT('Light::Green => 0,','Light::Red => 30,','Light::Yellow => 5,').trim())],
      wrong:[{src:L(LIGHT.trim(),'',WAIT('Light::Red => 30,','Light::Yellow => 5,','Light::Green => 1,').trim()),wrongWhy:'check'},{src:L(LIGHT.trim(),'',WAIT('Light::Red => 30,','Light::Yellow => 5,','Light::Yellow => 0,').trim()),wrongWhy:'E0004'}],
      lazy:[{src:L(LIGHT.trim(),'',WAIT('_ => 0,').trim()),wrongWhy:'check'},{src:L(LIGHT.trim(),'','fn wait(light: Light) -> u32 {','    0','}'),wrongWhy:'check'}],
      defines:[],previews:[],
      check:c=>c.out()!=='30\n5\n0\n'?'`wait` has to give `30` for red, `5` for yellow and `0` for green, so the program prints `30`, `5` and `0`.':c.count('match')<1?'Keep the `match` in `wait`, and cover the green light in it.':true
    },
    {
      title:'Variants that carry data',kind:'write',
      goal:'Write an <code>enum</code> called <code>Shape</code> with three variants: <code>Dot</code> (no data), <code>Square(u32)</code> (one side) and <code>Rect { w: u32, h: u32 }</code> (a width and a height). Write <code>area</code>, which takes a <code>Shape</code> and gives back its area, and <code>0</code> for a dot. The hidden <code>main</code> prints the area of a square with side 3, a 2 by 5 rectangle, a dot, a square with side 4 and a 6 by 7 rectangle, so the program should print <code>9</code>, <code>10</code>, <code>0</code>, <code>16</code> and <code>42</code>.',
      how:[
        'The whole program keeps a shape and the numbers that belong to it in one value. Each variant of an <code>enum</code> can carry its own data, and different variants can carry different data.',
        '<code>Square(u32)</code> holds one unnamed number, like a tuple. <code>Rect { w: u32, h: u32 }</code> holds named fields, like a <code>struct</code>. <code>Dot</code> holds nothing.',
        'A pattern can take a variant apart. <code>Shape::Square(side) =&gt; side * side</code> matches a square and gives the number inside the name <code>side</code> for that arm. <code>Shape::Rect { w, h } =&gt; w * h</code> does the same with the fields named <code>w</code> and <code>h</code>.',
        'A name in a pattern is a new variable that only lives in its arm. The number is copied into it, because a <code>u32</code> is <code>Copy</code>.'
      ],
      explain:'This is the part of enums that tuples and structs cannot do: one type, several shapes of data, and <code>match</code> hands you exactly the data that belongs to the case you are in. You cannot read a side from a <code>Dot</code> by mistake, because the pattern only gives you names for the variant you matched.',
      hint:'Three arms: <code>Shape::Dot =&gt; 0</code>, <code>Shape::Square(side) =&gt; side * side</code> and <code>Shape::Rect { w, h } =&gt; w * h</code>.',
      harness:SHAPE_MAIN,
      starter:L(SHAPE.trim(),'','fn area(shape: Shape) -> u32 {','    0','}'),
      answer:L(SHAPE.trim(),'',AREA('Shape::Dot => 0,','Shape::Square(side) => side * side,','Shape::Rect { w, h } => w * h,').trim()),
      alts:[L(SHAPE.trim(),'',AREA('Shape::Square(s) => s * s,','Shape::Rect { w: width, h: height } => width * height,','Shape::Dot => 0,').trim()),L(SHAPE.trim(),'',AREA('Shape::Dot => 0,','Shape::Square(side) => side * side,','Shape::Rect { w, .. } if w == 0 => 0,','Shape::Rect { w, h } => w * h,').trim())],
      wrong:[{src:L(SHAPE.trim(),'',AREA('Shape::Dot => 0,','Shape::Square(side) => side + side,','Shape::Rect { w, h } => w * h,').trim()),wrongWhy:'check'},{src:L(SHAPE.trim(),'',AREA('Shape::Dot => 0,','Shape::Square(side) => side * side,','Shape::Rect { w, h } => w + h,').trim()),wrongWhy:'check'}],
      lazy:[{src:L(SHAPE.trim(),'',AREA('Shape::Dot => 0,','Shape::Square(_) => 9,','Shape::Rect { .. } => 10,').trim()),wrongWhy:'check'},{src:L(SHAPE.trim(),'',AREA('_ => 0,').trim()),wrongWhy:'check'}],
      defines:[],previews:[],
      check:c=>c.out()!=='9\n10\n0\n16\n42\n'?'`area` has to give the side times the side for a square, the width times the height for a rectangle, and `0` for a dot, so the program prints `9`, `10`, `0`, `16` and `42`.':c.count('arm')<3?'Give each of the three variants its own arm.':c.count('catch-all')>0?'Give every variant its own arm with its own pattern, instead of one arm that catches several.':true
    },
    {
      title:'Option: a value that might be missing',kind:'write',
      goal:'Write <code>first_even</code>, which takes two <code>i32</code> numbers and gives back an <code>Option&lt;i32&gt;</code>: <code>Some(a)</code> if the first number is even, otherwise <code>Some(b)</code> if the second is even, otherwise <code>None</code>. The hidden <code>main</code> asks about <code>(3, 8)</code>, <code>(5, 7)</code> and <code>(4, 6)</code>, so the program should print <code>found 8</code>, <code>none</code> and <code>found 4</code>.',
      how:[
        'The whole program looks for something that may not exist, and says so in the type instead of inventing a fake value like <code>-1</code>. <code>Option</code> is an <code>enum</code> that comes with Rust: it is either <code>Some(value)</code> or <code>None</code>.',
        'The return type <code>Option&lt;i32&gt;</code> says "an <code>i32</code>, or nothing". The <code>&lt;i32&gt;</code> says what\'s inside. <code>Option&lt;T&gt;</code> means <code>T</code> stands for any type. Chapter 11 shows how to write your own.',
        'Inside, <code>if a % 2 == 0 { Some(a) } ...</code> builds the <code>Some</code> case, and <code>None</code> is the empty case. Both are written without <code>Option::</code> in front.',
        'The caller has to <code>match</code> on the result, and because <code>match</code> is exhaustive it cannot forget the <code>None</code> case. That is the whole point.'
      ],
      explain:'Other languages use <code>null</code>, which any value might secretly be. In Rust a plain <code>i32</code> is always a number, and only an <code>Option&lt;i32&gt;</code> can be empty, so you are forced to handle the empty case where it can happen.',
      hint:'Check <code>a % 2 == 0</code> first and return <code>Some(a)</code>, then check <code>b</code> the same way, and end with <code>None</code>.',
      harness:EVEN_MAIN,
      starter:EVEN('None'),
      answer:EVEN('if a % 2 == 0 {','    Some(a)','} else if b % 2 == 0 {','    Some(b)','} else {','    None','}'),
      alts:[EVEN('if a % 2 == 0 {','    return Some(a);','}','if b % 2 == 0 {','    return Some(b);','}','None'),EVEN('match (a % 2, b % 2) {','    (0, _) => Some(a),','    (_, 0) => Some(b),','    _ => None,','}')],
      wrong:[{src:EVEN('if b % 2 == 0 {','    Some(b)','} else if a % 2 == 0 {','    Some(a)','} else {','    None','}'),wrongWhy:'check'},{src:EVEN('if a % 2 == 0 {','    Some(a)','} else {','    Some(b)','}'),wrongWhy:'check'}],
      lazy:[{src:EVEN('Some(8)'),wrongWhy:'check'},{src:EVEN('None'),wrongWhy:'check'}],
      defines:[],
      previews:[{tag:'type-args',wording:'The <code>&lt;i32&gt;</code> says what\'s inside. <code>Option&lt;T&gt;</code> means <code>T</code> stands for any type. Chapter 11 shows how to write your own.',home:11}],
      check:c=>c.out()!=='found 8\nnone\nfound 4\n'?'`first_even(3, 8)` has to be `Some(8)`, `first_even(5, 7)` has to be `None` and `first_even(4, 6)` has to be `Some(4)`, so the program prints `found 8`, `none` and `found 4`.':true
    },
    {
      title:'Ranges and a last arm',kind:'write',
      goal:'Write <code>grade</code>, which takes a <code>u32</code> score and gives back a <code>char</code>: <code>\'A\'</code> for 90 to 100, <code>\'B\'</code> for 80 to 89, <code>\'C\'</code> for 70 to 79 and <code>\'F\'</code> for anything else. Use a <code>match</code>. The hidden <code>main</code> grades 100, 95, 89, 80, 79 and 12, so the program should print <code>A</code>, <code>A</code>, <code>B</code>, <code>B</code>, <code>C</code> and <code>F</code>.',
      how:[
        'The whole program turns a number into a letter by asking which band the number falls in. A <code>match</code> works on numbers too, not only on enums. The letter is a <code>char</code>: a single letter in single quotes, like <code>\'A\'</code>, which is a different type from text in double quotes.',
        'A pattern can be a range: <code>90..=100</code> fits every number from 90 up to and including 100, with the <code>=</code> meaning the end is included, as in <code>1..=5</code> of chapter 3.',
        'A <code>u32</code> has billions of values, and no list of ranges you write will cover them all by accident. The last arm <code>_ =&gt; \'F\'</code> fits whatever the other arms did not, and Rust asks for it, because a <code>match</code> must cover every value.',
        'Arms are tried from the top, so the order matters when ranges overlap. Here the bands do not overlap, so any order works.'
      ],
      explain:'Use <code>|</code> to give one arm several patterns, like <code>1 | 2 | 3 =&gt; ...</code>, and <code>a..=b</code> for a whole band. The <code>_</code> pattern fits anything and binds nothing, so it is the usual way to say "all the rest". Rust checks the ranges you wrote and will tell you exactly which numbers are left out if you forget it.',
      hint:'Write four arms: <code>90..=100 =&gt; \'A\'</code>, <code>80..=89 =&gt; \'B\'</code>, <code>70..=79 =&gt; \'C\'</code> and <code>_ =&gt; \'F\'</code>.',
      harness:GRADE_MAIN,
      starter:L('fn grade(score: u32) -> char {','    \'F\'','}'),
      answer:GRADE('90..=100 => \'A\',','80..=89 => \'B\',','70..=79 => \'C\',','_ => \'F\','),
      alts:[GRADE('80..=89 => \'B\',','90..=100 => \'A\',','70..=79 => \'C\',','_ => \'F\','),GRADE('90..=100 => \'A\',','80..90 => \'B\',','70..=79 => \'C\',','_ => \'F\',')],
      wrong:[{src:GRADE('90..100 => \'A\',','80..=89 => \'B\',','70..=79 => \'C\',','_ => \'F\','),wrongWhy:'check'},{src:GRADE('90..=100 => \'A\',','81..=89 => \'B\',','70..=79 => \'C\',','_ => \'F\','),wrongWhy:'check'}],
      lazy:[{src:L('fn grade(score: u32) -> char {','    if score >= 90 {','        \'A\'','    } else if score >= 80 {','        \'B\'','    } else if score >= 70 {','        \'C\'','    } else {','        \'F\'','    }','}'),wrongWhy:'check'},{src:GRADE('_ => \'A\','),wrongWhy:'check'}],
      defines:[],previews:[],
      check:c=>c.out()!=='A\nA\nB\nB\nC\nF\n'?'`grade` has to give `A` for 90 to 100, `B` for 80 to 89, `C` for 70 to 79 and `F` for the rest, so the program prints `A`, `A`, `B`, `B`, `C` and `F`.':c.count('match')<1?'Choose the letter with a `match` on the score, using a range in each band.':c.count('arm')<4?'Give each band its own arm, and a last arm for the rest.':true
    },
    {
      title:'A number match needs a last arm',kind:'fix',
      goal:'This program stops with an error, because the <code>match</code> in <code>size</code> does not say what happens to a <code>u8</code> of 100 or more. Fix it so <code>size</code> gives <code>3</code> for those numbers, and the program prints <code>0</code>, <code>1</code>, <code>2</code> and <code>3</code>.',
      how:[
        'The whole program sorts a small number into a size with a <code>match</code>: 0 is size 0, 1 to 9 is size 1, 10 to 99 is size 2, and 100 or more is meant to be size 3. The last band is missing.',
        '<code>E0004</code> again, and this time it names a range instead of a variant: <code>100_u8..=u8::MAX</code> not covered. <code>u8::MAX</code> is 255, the biggest number a <code>u8</code> can hold, so the message says "everything from 100 up to the top".',
        'Fix it with the same range the message names, written <code>100..=255 =&gt; 3</code>, or with a last arm <code>_ =&gt; 3</code>.',
        'Both work. The range says exactly which numbers you mean; the <code>_</code> is shorter.'
      ],
      explain:'Rust works out which numbers your ranges leave out and prints them. Read the numbers in the message as a to-do list, as you did with the missing variants. A <code>match</code> on a number is only complete when every value of the type has an arm, and for a <code>u8</code> that means 0 up to 255.',
      hint:'Add the arm <code>_ =&gt; 3,</code> as the last line of the <code>match</code>.',
      harness:SIZE_MAIN,
      starter:SIZE('0 => 0,','1..=9 => 1,','10..=99 => 2,'),
      starterErr:'E0004',
      answer:SIZE('0 => 0,','1..=9 => 1,','10..=99 => 2,','_ => 3,'),
      alts:[SIZE('0 => 0,','1..=9 => 1,','10..=99 => 2,','100..=255 => 3,'),SIZE('0 => 0,','1..=9 => 1,','10..=99 => 2,','100.. => 3,')],
      wrong:[{src:SIZE('0 => 0,','1..=9 => 1,','10..=99 => 2,','_ => 2,'),wrongWhy:'check'},{src:SIZE('0 => 0,','1..=9 => 1,','10..=99 => 2,','100..=199 => 3,'),wrongWhy:'E0004'}],
      lazy:[{src:SIZE('_ => 3,'),wrongWhy:'check'},{src:L('fn size(n: u8) -> u8 {','    3','}'),wrongWhy:'check'}],
      defines:[],previews:[],
      check:c=>c.out()!=='0\n1\n2\n3\n'?'`size` has to give `0`, `1`, `2` and `3` for 0, 5, 50 and 200, so the program prints those four numbers.':c.count('match')<1?'Keep the `match` in `size`.':c.count('arm')<4?'Keep an arm for each band, and add the one for 100 and more.':true
    },
    {
      title:'A guard adds a test',kind:'write',
      goal:'Write <code>kind</code>, which takes an <code>i32</code> and gives back <code>0</code> for zero, <code>1</code> for a negative number, <code>2</code> for an even number above zero and <code>3</code> for an odd number above zero. Use a <code>match</code> with <code>if</code> guards. The hidden <code>main</code> asks about 0, -4, 8 and 7, so the program should print <code>0</code>, <code>1</code>, <code>2</code> and <code>3</code>.',
      how:[
        'The whole program sorts numbers by questions that a range cannot ask, like "is it even?". A <em>guard</em> adds an <code>if</code> condition to an arm: the arm only fires when its pattern fits and the condition is true.',
        '<code>n if n &lt; 0 =&gt; 1</code> reads "any number, call it <code>n</code>, as long as <code>n &lt; 0</code>". A plain name in a pattern fits anything and holds the value for the arm and its guard.',
        'Arms are tried from the top, so <code>0 =&gt; 0</code> goes first. After that, <code>n if n % 2 == 0</code> only ever sees numbers above zero, because the negative ones were already caught.',
        'Rust cannot read inside a guard to know what it covers, so a <code>match</code> that uses guards still needs a last arm without one, here <code>_ =&gt; 3</code>.'
      ],
      explain:'A guard is the right tool when the pattern alone cannot say it. Put the specific arms first and the general ones after them, because the first arm that fits wins. Rust skips an arm for the purpose of the "did I cover everything" check when it has a guard, since the guard might be false.',
      hint:'Four arms, in this order: <code>0 =&gt; 0</code>, <code>n if n &lt; 0 =&gt; 1</code>, <code>n if n % 2 == 0 =&gt; 2</code> and <code>_ =&gt; 3</code>.',
      harness:KIND_MAIN,
      starter:L('fn kind(n: i32) -> u32 {','    0','}'),
      answer:KIND('0 => 0,','n if n < 0 => 1,','n if n % 2 == 0 => 2,','_ => 3,'),
      alts:[KIND('0 => 0,','x if x < 0 => 1,','x if x % 2 == 0 => 2,','x if x % 2 == 1 => 3,','_ => 3,'),KIND('n if n < 0 => 1,','0 => 0,','n if n % 2 == 0 => 2,','_ => 3,')],
      wrong:[{src:KIND('0 => 0,','n if n < 0 => 1,','n if n % 2 == 0 => 3,','_ => 2,'),wrongWhy:'check'},{src:KIND('n if n % 2 == 0 => 2,','n if n < 0 => 1,','0 => 0,','_ => 3,'),wrongWhy:'check'}],
      lazy:[{src:L('fn kind(n: i32) -> u32 {','    if n == 0 {','        0','    } else if n < 0 {','        1','    } else if n % 2 == 0 {','        2','    } else {','        3','    }','}'),wrongWhy:'check'},{src:KIND('0 => 0,','_ => 3,'),wrongWhy:'check'}],
      defines:[],previews:[],
      check:c=>c.out()!=='0\n1\n2\n3\n'?'`kind` has to give `0` for 0, `1` for -4, `2` for 8 and `3` for 7, so the program prints `0`, `1`, `2` and `3`.':c.count('match')<1?'Choose the number with a `match` on `n`.':c.count('guard')<1?'Use at least one `if` guard on an arm to ask a question that a pattern cannot.':true
    },
    {
      title:'Match a pair',kind:'write',
      goal:'Write <code>show</code>, which takes a <code>u32</code> and prints <code>FizzBuzz</code> if it divides by 3 and by 5, <code>Fizz</code> if it divides by 3, <code>Buzz</code> if it divides by 5, and the number itself otherwise. Use one <code>match</code> on the pair <code>(n % 3, n % 5)</code>. The hidden <code>main</code> calls <code>show</code> for 1 to 15.',
      how:[
        'The whole program asks two questions about a number at once and answers according to the pair of replies. A tuple can be matched too: <code>match (n % 3, n % 5)</code> builds a pair of remainders and matches that pair.',
        'A tuple pattern is written like a tuple. <code>(0, 0)</code> fits when both remainders are zero, <code>(0, _)</code> when only the first is, and <code>(_, 0)</code> when only the second is. The <code>_</code> means "whatever it is".',
        'The most specific arm goes first, because <code>(0, _)</code> would also fit a number that divides by 15. The last arm, <code>_ =&gt; println!("{}", n)</code>, takes the rest.',
        'Each arm runs a <code>println!</code>, so the <code>match</code> gives back nothing. Arms that give back nothing are separated by commas as usual.'
      ],
      explain:'Matching a tuple lets you read a two-way decision as a table: one row per combination you care about. This is also how a <code>match</code> on two enums works, and Rust still checks that the table has no missing row.',
      hint:'Four arms in this order: <code>(0, 0)</code>, <code>(0, _)</code>, <code>(_, 0)</code> and <code>_</code>, each with a <code>println!</code>.',
      harness:FIZZ_MAIN,
      starter:L('fn show(n: u32) {','    println!("{}", n);','}'),
      answer:SHOW('(0, 0) => println!("FizzBuzz"),','(0, _) => println!("Fizz"),','(_, 0) => println!("Buzz"),','_ => println!("{}", n),'),
      alts:[SHOW('(0, 0) => println!("FizzBuzz"),','(0, _) => println!("Fizz"),','(_, 0) => println!("Buzz"),','(_, _) => println!("{}", n),'),SHOW('(0, 0) => {','    println!("FizzBuzz");','}','(0, _) => {','    println!("Fizz");','}','(_, 0) => {','    println!("Buzz");','}','_ => {','    println!("{}", n);','}')],
      wrong:[{src:SHOW('(0, _) => println!("Fizz"),','(_, 0) => println!("Buzz"),','(0, 0) => println!("FizzBuzz"),','_ => println!("{}", n),'),wrongWhy:'check'},{src:SHOW('(0, 0) => println!("FizzBuzz"),','(0, _) => println!("Buzz"),','(_, 0) => println!("Fizz"),','_ => println!("{}", n),'),wrongWhy:'check'}],
      lazy:[{src:L('fn show(n: u32) {','    if n % 15 == 0 {','        println!("FizzBuzz");','    } else if n % 3 == 0 {','        println!("Fizz");','    } else if n % 5 == 0 {','        println!("Buzz");','    } else {','        println!("{}", n);','    }','}'),wrongWhy:'check'},{src:SHOW('_ => println!("{}", n),'),wrongWhy:'check'}],
      defines:[],previews:[],
      check:c=>c.out()!==FIZZ_OUT?'The numbers 1 to 15 should print as `1`, `2`, `Fizz`, `4`, `Buzz`, and so on, with `FizzBuzz` for 15.':c.count('match')<1?'Choose what to print with a `match` on the pair `(n % 3, n % 5)`.':c.count('arm')<4?'Give each of the four cases its own arm.':true
    },
    {
      title:'if let: when only one case matters',kind:'write',
      goal:'Write <code>show</code>, which takes an <code>Option&lt;u32&gt;</code> and prints <code>got 7</code> if it holds a 7, and prints nothing at all if it is empty. Use <code>if let</code>. The hidden <code>main</code> calls <code>show</code> with <code>Some(7)</code>, <code>None</code> and <code>Some(3)</code>, so the program should print <code>got 7</code> and then <code>got 3</code>.',
      how:[
        'The whole program reacts to one case and ignores the other. Writing a <code>match</code> with an empty <code>None =&gt; {}</code> arm works, but it is a lot of ceremony for "do this if there is a value".',
        '<code>if let Some(n) = o { ... }</code> means: if <code>o</code> fits the pattern <code>Some(n)</code>, bind the inside to <code>n</code> and run the block. Otherwise skip the block.',
        'It is a <code>match</code> with one arm you care about and a silent <code>_</code> for the rest. It does not ask you to list the other cases, so it never gives <code>E0004</code>.',
        'You can add an <code>else</code> block after it for the case that did not fit, exactly like with a plain <code>if</code>.'
      ],
      explain:'Reach for <code>if let</code> when only one variant matters. Reach for <code>match</code> when all of them do, because then the compiler checks you for it. The two are the same machinery, so you can always change one into the other. Step into the block in the memory view: <code>o</code> shows the variant <code>Some</code> and its part <code>Some.0</code>, and <code>n</code> holds a copy of that number.',
      hint:'Write <code>if let Some(n) = o { println!("got {}", n); }</code> as the body of <code>show</code>.',
      harness:OPT_MAIN,
      starter:OPT('println!("nothing");'),
      answer:OPT('if let Some(n) = o {','    println!("got {}", n);','}'),
      alts:[OPT('if let Some(n) = o {','    println!("got {}", n);','} else {','}'),OPT('if let Some(value) = o {','    println!("got {}", value);','}')],
      wrong:[{src:OPT('if let Some(n) = o {','    println!("{}", n);','}'),wrongWhy:'check'},{src:OPT('if let Some(n) = o {','    println!("got {}", n);','} else {','    println!("got nothing");','}'),wrongWhy:'check'}],
      lazy:[{src:OPT('match o {','    Some(n) => println!("got {}", n),','    None => {}','}'),wrongWhy:'check'},{src:OPT('println!("got 7");'),wrongWhy:'check'}],
      defines:['if-let'],previews:[],
      check:c=>c.out()!=='got 7\ngot 3\n'?'`show` has to print `got` and the number when it holds one, and nothing when it is empty, so the program prints `got 7` and then `got 3`.':c.count('iflet')<1?'Use `if let` to look inside the `Option`.':true
    },
    {
      title:'while let: keep going until it runs out',kind:'write',
      goal:'The hidden code gives you <code>step(n)</code>, which gives back <code>Some(n - 1)</code>, or <code>None</code> when <code>n</code> is 0. In <code>main</code>, start with <code>n</code> at 3 and use <code>while let</code> to print <code>n</code> and move on to the next one for as long as <code>step</code> gives a value, so the program prints <code>3</code>, <code>2</code> and <code>1</code>.',
      how:[
        'The whole program walks down a chain of steps and stops when the chain says <code>None</code>. You do not know in advance how many steps there are, so a <code>for</code> over a range does not fit.',
        '<code>while let Some(next) = step(n) { ... }</code> runs the block again and again. Each time it calls <code>step(n)</code>, and while the answer fits <code>Some(next)</code> it binds the inside to <code>next</code> and runs the block. The first <code>None</code> ends the loop.',
        'Inside the block you print <code>n</code> and then move on with <code>n = next;</code>. This needs <code>let mut n = 3;</code> because <code>n</code> changes.',
        'It is a <code>while</code> loop whose condition is a pattern. The loop stops the first time the pattern does not fit.'
      ],
      explain:'<code>while let</code> is to <code>loop</code> and <code>match</code> what <code>if let</code> is to <code>match</code>: the common "keep going while there is a value" in one line. It fits anything that hands out values one at a time and then runs dry.',
      hint:'Start with <code>let mut n = 3;</code>, then <code>while let Some(next) = step(n) { println!("{}", n); n = next; }</code>.',
      harness:STEP,
      starter:MAIN('let n = 3;','println!("{}", n);'),
      answer:MAIN('let mut n = 3;','while let Some(next) = step(n) {','    println!("{}", n);','    n = next;','}'),
      alts:[MAIN('let mut n = 3;','while let Some(m) = step(n) {','    println!("{}", n);','    n = m;','}')],
      wrong:[{src:MAIN('let mut n = 3;','while let Some(next) = step(n) {','    n = next;','    println!("{}", n);','}'),wrongWhy:'check'},{src:MAIN('let mut n = 3;','while let Some(next) = step(n) {','    println!("{}", n);','    n = next;','}','println!("{}", n);'),wrongWhy:'check'}],
      lazy:[{src:MAIN('println!("3");','println!("2");','println!("1");'),wrongWhy:'check'},{src:MAIN('let mut n = 3;','while n > 0 {','    println!("{}", n);','    n -= 1;','}'),wrongWhy:'check'}],
      defines:['while-let'],previews:[],
      check:c=>c.out()!=='3\n2\n1\n'?'The program has to print `3`, `2` and `1`, one per line, and stop when `step` says `None`.':c.count('whilelet')<1?'Use `while let` to keep going for as long as `step` gives a value.':c.calls('step')<1?'Ask `step` for the next number instead of counting yourself.':true
    },
    {
      title:'let else: leave early',kind:'write',
      goal:'Write <code>plus_one</code>, which takes an <code>Option&lt;i32&gt;</code> and gives back the number plus one, or <code>0</code> when it is empty. Use <code>let ... else</code>. The hidden <code>main</code> asks about <code>Some(4)</code>, <code>None</code> and <code>Some(9)</code>, so the program should print <code>5</code>, <code>0</code> and <code>10</code>.',
      how:[
        'The whole function wants a number to work with, and bails out early when there is none. The ordinary way is a <code>match</code> whose <code>Some</code> arm holds the whole rest of the function, which pushes the real work to the right.',
        '<code>let Some(v) = o else { return 0; };</code> says: if <code>o</code> fits <code>Some(v)</code>, bind <code>v</code> and carry on with the next line. If not, run the <code>else</code> block.',
        'The <code>else</code> block has to leave: it ends in <code>return</code>, or <code>break</code> or <code>continue</code> inside a loop. Rust checks that, because otherwise the code below would run without a <code>v</code>.',
        'After that line <code>v</code> is an ordinary variable that lives to the end of the function, so the last line is <code>v + 1</code>.'
      ],
      explain:'<code>let ... else</code> handles the unwelcome case first and then gets out of your way. The happy path stays at the left edge of the function instead of nesting inside an arm. If the <code>else</code> block can fall through, Rust reports an error: the block must not finish normally.',
      hint:'Write <code>let Some(v) = o else { return 0; };</code> and then <code>v + 1</code> as the last line.',
      harness:PLUS_MAIN,
      starter:PLUS('0'),
      answer:PLUS('let Some(v) = o else {','    return 0;','};','v + 1'),
      alts:[PLUS('let Some(number) = o else {','    return 0;','};','return number + 1;')],
      wrong:[{src:PLUS('let Some(v) = o else {','    return 0;','};','v'),wrongWhy:'check'},{src:PLUS('let Some(v) = o else {','    return 1;','};','v + 1'),wrongWhy:'check'}],
      lazy:[{src:PLUS('match o {','    Some(v) => v + 1,','    None => 0,','}'),wrongWhy:'check'},{src:PLUS('if let Some(v) = o {','    return v + 1;','}','0'),wrongWhy:'check'}],
      defines:['let-else'],previews:[],
      check:c=>c.out()!=='5\n0\n10\n'?'`plus_one` has to give `5` for `Some(4)`, `0` for `None` and `10` for `Some(9)`, so the program prints `5`, `0` and `10`.':c.count('letelse')<1?'Use `let ... else` to leave early when there is no number.':true
    },
    {
      title:'Take a pair apart with let',kind:'write',
      goal:'Write <code>swap</code>, which takes a pair of <code>i32</code> numbers and gives back the pair the other way round. Take the pair apart with a pattern in a <code>let</code>. The hidden <code>main</code> swaps <code>(1, 2)</code> and <code>(3, 9)</code>, so the program should print <code>2 1</code> and then <code>9 3</code>.',
      how:[
        'The whole function opens a pair, looks at both halves, and builds a new pair from them. You already read a half with <code>p.0</code>. A pattern after <code>let</code> names both halves in one go.',
        '<code>let (a, b) = p;</code> matches the pair against the pattern <code>(a, b)</code> and creates two variables, <code>a</code> from the first half and <code>b</code> from the second. The same trick works for a <code>struct</code>: <code>let Pet { name, age } = pet;</code>.',
        'The pattern must fit every possible value, because a plain <code>let</code> has no <code>else</code> block. A pair always fits <code>(a, b)</code>. For something that might not fit, like <code>Some(v)</code>, Rust reports <code>E0005</code> and asks for <code>let ... else</code>.',
        'The last line of the function is the new pair, <code>(b, a)</code>.'
      ],
      explain:'This is the same pattern machinery that <code>match</code> uses, in the one place where there is only a single arm. Because it cannot say "or else", the pattern has to be one that always fits: tuples and structs do, and <code>Some(v)</code> does not.',
      hint:'Write <code>let (a, b) = p;</code> and then <code>(b, a)</code> on the last line.',
      harness:SWAP_MAIN,
      starter:SWAP('p'),
      answer:SWAP('let (a, b) = p;','(b, a)'),
      alts:[SWAP('let (x, y) = p;','(y, x)'),SWAP('let (a, b) = p;','return (b, a);')],
      wrong:[{src:SWAP('let (a, b) = p;','(a, a)'),wrongWhy:'check'},{src:SWAP('let (a, b) = p;','(a, b)'),wrongWhy:'check'}],
      lazy:[{src:SWAP('(p.1, p.0)'),wrongWhy:'check'},{src:SWAP('(2, 1)'),wrongWhy:'check'}],
      defines:['destructure'],previews:[],
      check:c=>c.out()!=='2 1\n9 3\n'?'`swap` has to give the pair the other way round, so the program prints `2 1` and then `9 3`.':c.count('destructure')<3?'Take the pair apart with a pattern, `let (a, b) = p;`, instead of reading `p.0` and `p.1`.':true
    }
  ]
});
})();
