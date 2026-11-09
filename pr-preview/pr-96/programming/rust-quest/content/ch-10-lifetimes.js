/* Append only: a mission's key is '9.<index>' and shipped keys are never renumbered. DOM-free. */
(()=>{
'use strict';
const RQ=globalThis.RQ=globalThis.RQ||{};
const L=(...lines)=>lines.join('\n')+'\n';
const J=(...parts)=>parts.join('\n');
const MAIN=(...body)=>L('fn main() {',...body.map(l=>'    '+l),'}');
const FN=(head,...body)=>L(head+' {',...body.map(l=>'    '+l),'}');
const LONGEST=(rest,...body)=>FN('fn longest'+rest,...body);
const PICK=(rest,...body)=>FN('fn pick'+rest,...body);
const PICK_IF=['if a.len() > b.len() {','    a','} else {','    b','}'];
const LG="<'a>(a: &'a str, b: &'a str) -> &'a str";
const LONGER=LONGEST(LG,...PICK_IF);
const LONGEST_MAIN=J('',MAIN('println!("{}", longest("tiny", "bigger"));','println!("{}", longest("longer", "hi"));'));
const LONGEST_OUT='bigger\nlonger\n';
const FIRST=rest=>FN('fn first'+rest,'println!("comparing with {}", b);','a');
const POOL_MAIN=(...mid)=>MAIN('let pool = String::from("tide pool");','let result: &str;','{','    let crab = String::from("crab");',...mid,'}','println!("{}", result);');
const PICK_MAIN=J('',MAIN('println!("{}", pick("tiny", "bigger"));','println!("{}", pick("longer", "hi"));'));
const GREET_MAIN=J('',MAIN('println!("{}", greeting());'));
const NOTE=L("struct Note<'a> {","    text: &'a str,",'}');
const NOTE_MAIN=(...body)=>MAIN('let words = String::from("meet at low tide");','let note = Note { text: &words };',...body);
const LEN_MAIN=J('',MAIN('let words = String::from("meet at low tide");','let note = Note { text: &words };','println!("{}", note.len());','let short = String::from("hi");','let other = Note { text: &short };','println!("{}", other.len());'));
const NOTE_IMPL=head=>J(NOTE,FN('impl'+head,'fn len(&self) -> usize {','    self.text.len()','}'));
const OUTER=(...inner)=>J(NOTE,MAIN('let note: Note;','{','    let words = String::from("meet at low tide");',...inner,'}','println!("{}", note.text);'));
const START_IMPL=J(NOTE,FN("impl<'a> Note<'a>",'fn start(&self) -> &str {','    &self.text[..4]','}'));
const START_MAIN=(...steps)=>MAIN('let mut words = String::from("meet at low tide");','let note = Note { text: &words };','let start = note.start();',...steps);
// runs the learner's program on other input and wants what real code gives, so a typed-in answer fails; null means the input text was changed
const OTHER=(c,want,why,...swaps)=>{const r=c.rerun(...swaps);return r===null?'Keep `'+swaps[0][0]+'` as it is, so Rust Quest can try your code on other text.':r.out()!==want?why:true;};
const SAME_LT=s=>!!s&&s.params.length>=2&&!!s.params[0]&&s.params.every(p=>p===s.params[0])&&s.ret===s.params[0];

RQ.CH.push({
  name:'Lifetimes',
  badge:'Tide Map',
  story:'Under the sharing stone, tide notes are pinned to the wall and wash away with the tide; keep each note only while its words last, and find the tide map.',
  intro:`Under the sharing stone, tide notes are pinned to the tide-note wall, and they wash away with the tide. A reference is only good while the thing it points at is still there. Rust checks that for every reference, and most of the time it works the answer out by itself. When a function takes two references and gives one back, it cannot tell which input the answer comes from, so you tell it with a <em>lifetime name</em>. This chapter writes those names on functions and on a <code>struct</code> that holds a reference, and reads the errors that appear when a reference would outlast what it points at.`,
  toolbox:`In this chapter: <code>&'a str</code> with <code>&lt;'a&gt;</code>, one name shared by two inputs and the result, a parameter left out of the name, <code>&'static str</code>, a <code>struct</code> that holds a reference, <code>impl&lt;'a&gt;</code>, and the errors <code>E0597</code>, <code>E0621</code>, <code>E0106</code> and <code>E0726</code>.`,
  learned:['lifetime name','shared lifetime','E0597 through a call','E0621','static','struct with a reference','impl with a lifetime','method result borrow'],
  missions:[
    {
      title:'Name the lifetime',kind:'fix',
      goal:`This program stops with <code>E0106</code>, because <code>longest</code> has two references coming in and one going out. Give them a lifetime name so it compiles. The hidden <code>main</code> prints <code>bigger</code> and then <code>longer</code>.`,
      how:[
        `The whole program picks the longer of two texts and gives back a reference to it. Rust cannot tell whether the answer comes from <code>a</code> or from <code>b</code>, and it needs to know, because the caller may only use the answer while the input it comes from is still there.`,
        `A <em>lifetime name</em> starts with an apostrophe, like <code>'a</code>. You declare it once, in angle brackets after the function name: <code>longest&lt;'a&gt;</code>. Then you write it after the <code>&</code> of each reference that belongs together: <code>&'a str</code>.`,
        `Putting <code>'a</code> on <code>a</code>, on <code>b</code> and on the result says: the answer is one of these two, so it may be used only while both are still there. The name is a label for the compiler's check. It does not make any text live longer or shorter.`,
        `The body does not change. The hidden <code>main</code> calls <code>longest</code> with other texts than the ones in the card, so the answer has to keep picking the longer one.`
      ],
      explain:`The same label on two inputs and the result is the usual way to write "the answer comes from either one". If you label only one input and the body can return the other, Rust rejects it with <code>E0621</code>, which a later mission shows. The name <code>'a</code> is only a habit: <code>'x</code> works too, as long as it is declared and used the same way each time.`,
      hint:`Write <code>fn longest&lt;'a&gt;(a: &'a str, b: &'a str) -> &'a str</code> and leave the body alone.`,
      harness:LONGEST_MAIN,
      starter:LONGEST('(a: &str, b: &str) -> &str',...PICK_IF),
      starterErr:'E0106',
      answer:LONGER,
      alts:[LONGEST("<'x>(a: &'x str, b: &'x str) -> &'x str",...PICK_IF),LONGEST(LG,'if b.len() > a.len() {','    b','} else {','    a','}')],
      wrong:[
        {src:LONGEST("<'a>(a: &'a str, b: &str) -> &'a str",...PICK_IF),wrongWhy:'E0621'},
        {src:LONGEST("<'a>(a: &'a str, b: &'a str) -> &str",...PICK_IF),wrongWhy:'E0106'},
        {src:LONGEST(LG,'if a.len() < b.len() {','    a','} else {','    b','}'),wrongWhy:'check'}
      ],
      lazy:[
        {src:LONGEST('(a: &str, b: &str) -> String','if a.len() > b.len() {','    a.to_string()','} else {','    b.to_string()','}'),wrongWhy:'check'},
        {src:LONGEST(LG,'if a == "tiny" {','    b','} else {','    a','}'),wrongWhy:'check'}
      ],
      defines:['lifetime-param'],previews:[],
      check:c=>{
        const s=c.sigOf('longest');
        if(c.out()!==LONGEST_OUT)return 'The program has to print `bigger` and then `longer`.';
        if(!s||!s.lts.length||!SAME_LT(s))return 'Declare a lifetime name after `longest`, like `<\'a>`, and write it on both parameters and on the result.';
        return OTHER(c,'abc\nlonger\n','`longest` has to give back the longer text, whatever the texts are.',['"tiny", "bigger"','"ab", "abc"']);
      }
    },
    {
      title:'The answer needs both inputs',kind:'fix',
      goal:`This program stops with <code>E0597</code>: <code>result</code> is printed after the block where <code>small</code> lives. Change <code>main</code> so it prints <code>bigger</code> without the error, and keep both texts going into <code>longest</code>.`,
      how:[
        `The whole program makes two texts, asks <code>longest</code> for the longer one, and prints it. <code>small</code> is made inside a block, so it is freed at the closing <code>}</code>.`,
        `Both inputs of <code>longest</code> carry <code>'a</code>, which says the answer may come from either of them. So Rust has to treat <code>result</code> as a reference into <code>small</code> too, even though this time the answer was <code>big</code>. After the <code>}</code> that reference would point at freed memory, and <code>E0597</code> says <code>small</code> "does not live long enough".`,
        `The compiler does not run the program to see which input was longer. It reads the signature, and the signature says either one.`,
        `Two fixes work: use <code>result</code> inside the block, or make <code>small</code> before the block so it lasts as long as <code>big</code>. Either way the reference is used only while both texts exist.`
      ],
      explain:`The error is reported at the borrow of <code>small</code>, not at the line that prints. That is where the reference to a value that is about to go away is made. The chapter 4 rule still holds: a value is freed where its block ends. A lifetime name never changes that. It only lets Rust see which references must not outlast which values.`,
      hint:`Move the <code>println!</code> up into the block, right after the call to <code>longest</code>, or move the line that makes <code>small</code> above the block.`,
      starter:L(LONGER)+MAIN('let big = String::from("bigger");','let result: &str;','{','    let small = String::from("tiny");','    result = longest(&big, &small);','}','println!("{}", result);'),
      starterErr:'E0597',
      answer:L(LONGER)+MAIN('let big = String::from("bigger");','{','    let small = String::from("tiny");','    let result = longest(&big, &small);','    println!("{}", result);','}'),
      alts:[L(LONGER)+MAIN('let big = String::from("bigger");','let small = String::from("tiny");','let result: &str;','{','    result = longest(&big, &small);','}','println!("{}", result);')],
      wrong:[
        {src:L(LONGER)+MAIN('let big = String::from("bigger");','let result: &str;','{','    let small = String::from("tiny");','    result = longest(&big, &small);','    drop(small);','    println!("{}", result);','}'),wrongWhy:'E0505'},
        {src:L(LONGER)+MAIN('let big = String::from("bigger");','let result: &str = &big;','println!("{}", result);'),wrongWhy:'check'}
      ],
      lazy:[
        {src:L(LONGER)+MAIN('let big = String::from("bigger");','let result: &str;','{','    let small = String::from("tiny");','    result = longest(&big, &big);','}','println!("{}", result);'),wrongWhy:'check'},
        {src:L(LONGER)+MAIN('println!("bigger");'),wrongWhy:'check'}
      ],
      defines:[],previews:[],
      check:c=>c.out()!=='bigger\n'?'The program has to print `bigger`.':c.calls('longest')<1?'Keep asking `longest` for the longer of `big` and `small`.':OTHER(c,'enormous\n','Keep `small` as an input of `longest`: if its text were longer, the answer should change.',['"tiny"','"enormous"'])
    },
    {
      title:'Only label what the answer uses',kind:'fix',
      goal:`This program stops with <code>E0597</code>, because <code>first</code> labels <code>b</code> with <code>'a</code> although its answer is always <code>a</code>. Change the signature of <code>first</code>, not <code>main</code>, so the program prints <code>comparing with crab</code> and then <code>tide pool</code>.`,
      how:[
        `The whole program makes <code>pool</code>, makes <code>crab</code> inside a block, calls <code>first</code> on both, and prints the answer after the block. <code>first</code> prints its second input and gives back its first.`,
        `The label <code>'a</code> on <code>b</code> says the answer might come from <code>b</code>, so Rust keeps <code>crab</code> borrowed for as long as <code>result</code> is used. But the body only prints <code>b</code>, so the answer never needs it.`,
        `Take the label off <code>b</code>: write <code>b: &str</code>. With no label on <code>b</code>, the answer promises nothing about it, and <code>crab</code> may go away first.`,
        `A function can also declare two names, <code>&lt;'a, 'b&gt;</code>, and give <code>b</code> the second one. Then the answer is tied to <code>a</code> only, and you say so out loud.`
      ],
      explain:`Labels describe where the answer may come from, so they should be as few as the truth allows. Too many labels, as here, make a correct function annoying to call: the compiler is told the answer might depend on <code>b</code>, and it believes the signature. The fix is in the signature, because that is the claim that was wrong.`,
      hint:`Change <code>b: &'a str</code> to <code>b: &str</code> in the signature of <code>first</code>.`,
      starter:FIRST("<'a>(a: &'a str, b: &'a str) -> &'a str")+'\n'+POOL_MAIN('    result = first(&pool, &crab);'),
      starterErr:'E0597',
      answer:FIRST("<'a>(a: &'a str, b: &str) -> &'a str")+'\n'+POOL_MAIN('    result = first(&pool, &crab);'),
      alts:[FIRST("<'a, 'b>(a: &'a str, b: &'b str) -> &'a str")+'\n'+POOL_MAIN('    result = first(&pool, &crab);')],
      wrong:[
        {src:L("fn first<'a>(a: &'a str, b: &str) -> &'a str {",'    println!("comparing with {}", b);','    b','}')+'\n'+POOL_MAIN('    result = first(&pool, &crab);'),wrongWhy:'E0621'}
      ],
      lazy:[
        {src:FIRST("<'a>(a: &'a str, b: &'a str) -> &'a str")+'\n'+MAIN('let pool = String::from("tide pool");','let crab = String::from("crab");','let result: &str;','{','    result = first(&pool, &crab);','}','println!("{}", result);'),wrongWhy:'check'},
      ],
      defines:[],previews:[],
      check:c=>{
        const s=c.sigOf('first');
        if(c.out()!=='comparing with crab\ntide pool\n')return 'The program has to print `comparing with crab` and then `tide pool`.';
        if(!s||!s.params[0]||s.ret!==s.params[0]||s.params[1]===s.ret)return 'Keep `a` and the result on the same label, and take that label off `b` (or give `b` a name of its own).';
        return c.calls('first')<1?'Keep calling `first` on `pool` and `crab`.':OTHER(c,'comparing with shrimp\ntide pool\n','Keep `crab` as the second input of `first`.',['"crab"','"shrimp"']);
      }
    },
    {
      title:'A parameter without the label',kind:'fix',
      goal:`This program stops with <code>E0621</code>, because <code>pick</code> may give back <code>b</code>, and <code>b</code> has no lifetime name. Fix the signature so the hidden <code>main</code> prints <code>bigger</code> and then <code>longer</code>.`,
      how:[
        `The whole function returns the longer of two texts, like <code>longest</code>, but its signature gives <code>'a</code> to <code>a</code> and to the result only.`,
        `The result promises to be good as long as <code>'a</code>. The body sometimes returns <code>b</code>, and nothing says <code>b</code> is good for that long. Rust refuses with <code>E0621</code>, "explicit lifetime required in the type of <code>b</code>", and the message names the parameter you forgot.`,
        `The earlier mission removed a label because the answer never used the parameter. This time the answer does use <code>b</code>, so the opposite fix is right: write <code>b: &'a str</code>.`,
        `The hidden <code>main</code> tries other texts than the ones in the card.`
      ],
      explain:`Rust checks the body against the signature, not the other way round: it does not guess a label for <code>b</code> from what the body does. <code>E0621</code> is a friendly error. It names the parameter and the label that is missing. A different label on <code>b</code>, like <code>'b</code>, gives an error with no code at all, "lifetime may not live long enough", which Rust Quest does not model.`,
      hint:`Change <code>b: &str</code> to <code>b: &'a str</code>.`,
      harness:PICK_MAIN,
      starter:PICK("<'a>(a: &'a str, b: &str) -> &'a str",'if a.len() >= b.len() {','    a','} else {','    b','}'),
      starterErr:'E0621',
      answer:PICK("<'a>(a: &'a str, b: &'a str) -> &'a str",'if a.len() >= b.len() {','    a','} else {','    b','}'),
      alts:[PICK("<'a>(a: &'a str, b: &'a str) -> &'a str",'if b.len() > a.len() {','    b','} else {','    a','}')],
      wrong:[
        {src:PICK("<'a>(a: &'a str, b: &'a str) -> &'a str",'if a.len() > b.len() {','    a','} else {','    a','}'),wrongWhy:'check'},
        {src:PICK("<'a>(a: &'a str, b: &str) -> &'a str",'if a.len() >= b.len() {','    return b;','}','a'),wrongWhy:'E0621'}
      ],
      lazy:[
        {src:PICK("<'a>(a: &'a str, b: &str) -> &'a str",'a'),wrongWhy:'check'},
        {src:L('fn pick(a: &str, b: &str) -> String {','    if a.len() >= b.len() {','        a.to_string()','    } else {','        b.to_string()','    }','}'),wrongWhy:'check'}
      ],
      defines:[],previews:[],
      check:c=>{
        const s=c.sigOf('pick');
        if(c.out()!==LONGEST_OUT)return 'The program has to print `bigger` and then `longer`.';
        if(!s||!SAME_LT(s))return 'Write the same lifetime name on both parameters and on the result.';
        return OTHER(c,'abc\nlonger\n','`pick` has to give back the longer text, whatever the texts are.',['"tiny", "bigger"','"ab", "abc"']);
      }
    },
    {
      title:'A reference that lasts the whole run',kind:'fix',
      goal:`This program stops with <code>E0106</code>, because <code>greeting</code> returns a reference and has nothing to borrow from. Fix the signature, keeping the reference, so it prints <code>hello from the tide pool</code>.`,
      how:[
        `The whole program has a function that gives back a fixed greeting, and <code>main</code> prints it. No reference comes in, so the result cannot borrow from an input, and <code>E0106</code> says there is no lifetime to take.`,
        `The greeting is a string literal. A literal is written into the program itself, so it is there for as long as the program runs, and a reference to it can be used at any time. That lifetime has a name of its own: <code>'static</code>.`,
        `Write it after the <code>&</code> of the result: <code>-> &'static str</code>. Nothing needs declaring in angle brackets, because <code>'static</code> is always available.`,
        `Chapter 5 fixed this error by returning a <code>String</code>. Both fixes are correct. This one keeps the reference and copies nothing.`
      ],
      explain:`<code>'static</code> is a promise about the data: it never goes away during the run. That is true of a literal and false of almost everything else, so a function that returns <code>&'static str</code> can only give back literals. If its body tried to return a reference into a parameter, Rust would refuse.`,
      hint:`Change the return type to <code>&'static str</code>.`,
      harness:GREET_MAIN,
      starter:L('fn greeting() -> &str {','    "hello from the tide pool"','}'),
      starterErr:'E0106',
      answer:L("fn greeting() -> &'static str {",'    "hello from the tide pool"','}'),
      alts:[L("fn greeting() -> &'static str {",'    return "hello from the tide pool";','}')],
      wrong:[
        {src:L("fn greeting() -> &'a str {",'    "hello from the tide pool"','}'),wrongWhy:'E0261'},
        {src:L("fn greeting() -> &'static str {",'    "hello"','}'),wrongWhy:'check'}
      ],
      lazy:[
        {src:L('fn greeting() -> String {','    String::from("hello from the tide pool")','}'),wrongWhy:'check'}
      ],
      defines:[],previews:[],
      check:c=>{
        const s=c.sigOf('greeting');
        if(c.out()!=='hello from the tide pool\n')return 'The program has to print `hello from the tide pool`.';
        return !s||s.ret!=='static'?'Keep the reference and give it the lifetime `\'static`: `-> &\'static str`.':true;
      }
    },
    {
      title:'A struct that holds a reference',kind:'fix',
      goal:`This program stops with <code>E0106</code>, because the field <code>text</code> is a reference and the <code>struct</code> does not say how long it must stay valid. Fix the <code>struct</code> so the program prints <code>meet at low tide</code>.`,
      how:[
        `The whole program makes a <code>String</code>, builds a <code>Note</code> that points at it, and prints the text through the note. A <code>Note</code> does not own its text: it borrows it.`,
        `A value that holds a reference must not outlive what the reference points at, so the type has to say so. The <code>struct</code> declares a lifetime name just like a function does, in angle brackets after its name: <code>struct Note&lt;'a&gt;</code>.`,
        `Then the field uses that name: <code>text: &'a str</code>. Read the whole thing as: a <code>Note&lt;'a&gt;</code> holds a <code>&str</code> that is good for <code>'a</code>, so the note can be used only while its text is.`,
        `<code>main</code> already builds the note with <code>Note { text: &words }</code> and needs no change: Rust works out the name there.`
      ],
      explain:`Every reference in a type needs a name, and a <code>struct</code> is a type. The name is part of the type's full spelling, <code>Note&lt;'a&gt;</code>. Until now the structs in this course owned everything they held, so none of them needed one.`,
      hint:`Write <code>struct Note&lt;'a&gt; {</code> and change the field to <code>text: &'a str,</code>.`,
      starter:L('struct Note {','    text: &str,','}')+'\n'+NOTE_MAIN('println!("{}", note.text);'),
      starterErr:'E0106',
      answer:L(NOTE)+NOTE_MAIN('println!("{}", note.text);'),
      alts:[L("struct Note<'x> {","    text: &'x str,",'}')+'\n'+NOTE_MAIN('println!("{}", note.text);')],
      wrong:[
        {src:L('struct Note {',"    text: &'a str,",'}')+'\n'+NOTE_MAIN('println!("{}", note.text);'),wrongWhy:'E0261'},
        {src:L("struct Note<'a> {",'    text: &str,','}')+'\n'+NOTE_MAIN('println!("{}", note.text);'),wrongWhy:'E0106'}
      ],
      lazy:[
        {src:L('struct Note {','    text: String,','}')+'\n'+NOTE_MAIN('println!("{}", note.text);'),wrongWhy:'E0308'},
        {src:L(NOTE)+NOTE_MAIN('println!("meet at low tide");'),wrongWhy:'check'}
      ],
      defines:[],previews:[],
      check:c=>{
        const s=c.structLt('Note');
        if(c.out()!=='meet at low tide\n')return 'The program has to print `meet at low tide`.';
        if(!s||s.lts.length!==1||!s.fields[0]||!s.lts.includes(s.fields[0]))return 'Declare one lifetime name on `Note` and use it on the `text` field.';
        if(c.borrowInit('Note')<1||c.fieldRead('text')<1)return 'Keep building the `Note` with a borrow of `words`, and print its `text`.';
        return OTHER(c,'slack water\n','The `Note` has to hold the text of `words`.',['"meet at low tide"','"slack water"']);
      }
    },
    {
      title:'Methods on a struct with a lifetime',kind:'fix',
      goal:`This program stops with <code>E0726</code>, because <code>impl Note</code> leaves out the lifetime that <code>Note</code> declares. Fix the <code>impl</code> so the hidden <code>main</code> prints <code>16</code> and then <code>2</code>.`,
      how:[
        `The whole program has a <code>Note</code> that borrows its text and a method <code>len</code> that counts the letters. <code>main</code> builds two notes and asks each for its length.`,
        `The full type is <code>Note&lt;'a&gt;</code>, not <code>Note</code>, so the <code>impl</code> must write the name too. It does it in two steps: declare the name after <code>impl</code>, then hand it to the type: <code>impl&lt;'a&gt; Note&lt;'a&gt;</code>.`,
        `Inside the block the methods work as in chapter 6: <code>&self</code> lends the note to <code>len</code>, which reads <code>self.text</code>. The body does not mention <code>'a</code>, so it does not change.`,
        `If the body never needs the name, <code>impl Note&lt;'_&gt;</code> says "some lifetime" and works the same. The hidden <code>main</code> uses other text than the card shows.`
      ],
      explain:`<code>E0726</code> is "implicit elided lifetime not allowed here": Rust will not let you drop the name from an <code>impl</code> header the way you can in a function signature, so the header says it out loud. The header spells it out so the methods are written for the full type.`,
      hint:`Write <code>impl&lt;'a&gt; Note&lt;'a&gt; {</code> instead of <code>impl Note {</code>.`,
      harness:LEN_MAIN,
      starter:NOTE_IMPL(' Note'),
      starterErr:'E0726',
      answer:NOTE_IMPL("<'a> Note<'a>"),
      alts:[NOTE_IMPL(" Note<'_>")],
      wrong:[
        {src:NOTE_IMPL(" Note<'a>"),wrongWhy:'E0261'},
        {src:NOTE_IMPL("<'a> Note"),wrongWhy:'E0726'}
      ],
      lazy:[
        {src:L(NOTE,"impl<'a> Note<'a> {",'    fn len(&self) -> usize {','        16','    }','}'),wrongWhy:'check'}
      ],
      defines:[],previews:[],
      check:c=>{
        const m=c.implLt('Note');
        if(c.out()!=='16\n2\n')return 'The program has to print `16` and then `2`.';
        if(!m||!(m.arg==='_'||m.arg&&m.lts.includes(m.arg)))return 'Write the lifetime on `Note` in the `impl`: declare it after `impl` and give it to `Note`.';
        return OTHER(c,'11\n2\n','`len` has to count the letters of the text in the note.',['"meet at low tide"','"slack water"']);
      }
    },
    {
      title:'A struct cannot outlive its text',kind:'fix',
      goal:`This program stops with <code>E0597</code>, because <code>note</code> is printed after the block where <code>words</code> lives. Fix <code>main</code> so it prints <code>meet at low tide</code>, with the note still built from a borrow of <code>words</code>.`,
      how:[
        `The whole program builds a <code>Note</code> inside a block, from a <code>String</code> that is also made in that block, and prints the note afterwards. <code>words</code> is freed at the closing <code>}</code>.`,
        `A <code>Note&lt;'a&gt;</code> may only be used while the text behind its <code>'a</code> is still there. <code>note</code> lives to the end of <code>main</code>, longer than <code>words</code>, so Rust reports <code>E0597</code> at the borrow <code>&words</code>: that is the reference that would be left pointing at nothing.`,
        `The same two fixes as before apply: use the note inside the block, or make <code>words</code> before the block so it outlasts the note.`,
        `Giving the note a string literal instead would compile, because a literal lasts the whole run. That is not the mission: the note has to borrow <code>words</code>.`
      ],
      explain:`A <code>struct</code> that holds a reference is a loan with a name: the loan on <code>words</code> lasts as long as <code>note</code> is used. Moving <code>note</code> into another variable moves the loan along with it, and so does passing it to a function by value.`,
      hint:`Make <code>words</code> before the block, above <code>let note: Note;</code>, or move the <code>println!</code> inside the block.`,
      starter:OUTER('    note = Note { text: &words };'),
      starterErr:'E0597',
      answer:L(NOTE)+MAIN('let words = String::from("meet at low tide");','let note: Note;','{','    note = Note { text: &words };','}','println!("{}", note.text);'),
      alts:[L(NOTE)+MAIN('let note: Note;','{','    let words = String::from("meet at low tide");','    note = Note { text: &words };','    println!("{}", note.text);','}')],
      wrong:[
        {src:J(NOTE,MAIN('let note: Note;','{','    let words = String::from("meet at low tide");','    note = Note { text: &words };','    drop(words);','    println!("{}", note.text);','}')),wrongWhy:'E0505'}
      ],
      lazy:[
        {src:OUTER('    note = Note { text: "meet at low tide" };'),wrongWhy:'check'},
        {src:L(NOTE)+MAIN('println!("meet at low tide");'),wrongWhy:'check'}
      ],
      defines:[],previews:[],
      check:c=>c.out()!=='meet at low tide\n'?'The program has to print `meet at low tide`.':c.borrowInit('Note')<1||c.fieldRead('text')<1?'Build the `Note` from a borrow of `words`, like `Note { text: &words }`, and print its `text`.':OTHER(c,'slack water\n','The `Note` has to hold the text of `words`.',['"meet at low tide"','"slack water"'])
    },
    {
      title:'A method result keeps the text borrowed',kind:'fix',
      goal:`This program stops with <code>E0502</code>: <code>words</code> changes while <code>start</code> still points into it. Reorder <code>main</code> so it prints <code>meet</code> and then <code>meet at low tide!</code>, without copying the start into a new <code>String</code>.`,
      how:[
        `The whole program makes a text, borrows it in a <code>Note</code>, asks the note for its first four letters, adds a <code>!</code> to the text, and prints both. The method <code>start</code> gives back a slice of the note's text.`,
        `A method with <code>&self</code> and no other reference ties its result to <code>self</code>: the slice may be used while the note is still borrowed. And the note holds a borrow of <code>words</code>. So while <code>start</code> is in use, <code>words</code> counts as borrowed too, and <code>push_str</code> needs to change it: that is <code>E0502</code>.`,
        `Nothing is wrong with the methods. Only the order is: read <code>start</code> first, and add the <code>!</code> after the last time it is used. Then the borrow is over and <code>push_str</code> is allowed.`,
        `Writing <code>.to_string()</code> after <code>note.start()</code> would also compile, but it copies the letters into a new <code>String</code>. The mission asks for the borrow itself.`
      ],
      explain:`The loan from a method result goes all the way back to the text: result, then the note, then <code>words</code>. Rust follows that chain when it checks the next use of <code>words</code>. As in chapter 5, a borrow lasts until its last use, not until the end of the block, so reordering is often all it takes.`,
      hint:`Print <code>start</code> before the line that calls <code>push_str</code>.`,
      starter:START_IMPL+'\n'+START_MAIN('words.push_str("!");','println!("{}", start);','println!("{}", words);'),
      starterErr:'E0502',
      answer:START_IMPL+'\n'+START_MAIN('println!("{}", start);','words.push_str("!");','println!("{}", words);'),
      alts:[START_IMPL+'\n'+MAIN('let mut words = String::from("meet at low tide");','words.push_str("!");','let note = Note { text: &words };','let start = note.start();','println!("{}", start);','println!("{}", words);')],
      wrong:[
        {src:START_IMPL+'\n'+START_MAIN('words.push_str("!");','println!("{}", words);'),wrongWhy:'check'}
      ],
      lazy:[
        {src:START_IMPL+'\n'+MAIN('let mut words = String::from("meet at low tide");','let note = Note { text: &words };','let start = note.start().to_string();','words.push_str("!");','println!("{}", start);','println!("{}", words);'),wrongWhy:'check'},
        {src:START_IMPL+'\n'+MAIN('let mut words = String::from("meet at low tide");','println!("meet");','words.push_str("!");','println!("{}", words);'),wrongWhy:'check'}
      ],
      defines:[],previews:[],
      check:c=>{
        if(c.out()!=='meet\nmeet at low tide!\n')return 'The program has to print `meet` and then `meet at low tide!`.';
        if(c.allocs('String')!==1)return 'Keep a single `String`: use the slice from `start` itself, without copying it.';
        if(c.methodIn('main','start')<1)return 'Take the first letters with `note.start()`.';
        return OTHER(c,'cold\ncold deep water!\n','The first letters have to come from the text in `words`.',['"meet at low tide"','"cold deep water"']);
      }
    }
  ]
});
})();
