/* Append only: a mission's key is '12.<index>' and shipped keys are never renumbered. DOM-free. */
(()=>{
'use strict';
const RQ=globalThis.RQ=globalThis.RQ||{};
const L=(...lines)=>lines.join('\n')+'\n';
const J=(...parts)=>parts.join('\n');
const MAIN=(...body)=>L('fn main() {',...body.map(l=>'    '+l),'}');
const FN=(head,...body)=>L(head+' {',...body.map(l=>'    '+l),'}');
// runs the learner's program on other input and wants what real code gives, so a typed-in answer fails; null means the input text was changed
const OTHER=(c,want,why,...swaps)=>{const r=c.rerun(...swaps);return r===null?'Keep `'+swaps[0][0]+'` as it is, so Rust Quest can try your code on other text.':r.out()!==want?why:true;};
const EACH=(c,why,...cases)=>{for(const [want,...swaps] of cases){const r=OTHER(c,want,why,...swaps);if(r!==true)return r;}return true;};
const BOUND=(g,name)=>!!g&&(g.tparams.some(t=>t.bounds.includes(name))||g.impl.some(b=>!!b&&b.includes(name)));
const FN_BOUND=g=>!!g&&(g.tparams.some(t=>t.bounds.includes('Fn'))||g.impl.some(b=>!!b&&b.includes('Fn')));

const KIND=L('#[derive(Debug)]','enum Kind {','    Shell,','    Pearl,','    Weed,','}');
const FIND=L('#[derive(Debug)]','struct Find {','    kind: Kind,','    weight: u32,','}');
const TYPES=J(KIND,FIND);
const NEW=L('    fn new(kind: Kind, weight: u32) -> Find {','        Find { kind, weight }','    }');
const VALUE=(...body)=>L('    fn value(&self) -> u32 {',...body.map(l=>'        '+l),'    }');
const VALUE_OK=VALUE('match self.kind {','    Kind::Shell => self.weight,','    Kind::Pearl => self.weight * 10,','    Kind::Weed => 0,','}');
const IMPL=(...methods)=>'impl Find {\n'+methods.map(m=>m.trimEnd()).join('\n\n')+'\n}\n';
const FIND_IMPL=IMPL(NEW,VALUE_OK);
const FINDS3='let finds = vec![Find::new(Kind::Shell, 4), Find::new(Kind::Pearl, 2), Find::new(Kind::Weed, 9)];';

const VALUE_MAIN=J('',MAIN('let shell = Find::new(Kind::Shell, 4);','let pearl = Find::new(Kind::Pearl, 2);','let weed = Find::new(Kind::Weed, 9);','println!("{}", shell.value());','println!("{}", pearl.value());','println!("{}", weed.value());'));
const VALUE_PROG=(...body)=>J(TYPES,IMPL(NEW,VALUE(...body)));
const VALUE_SWAPS=[['Find::new(Kind::Shell, 4)','Find::new(Kind::Shell, 7)'],['Find::new(Kind::Pearl, 2)','Find::new(Kind::Pearl, 3)'],['Find::new(Kind::Weed, 9)','Find::new(Kind::Weed, 1)']];

const TOTAL=(head,...body)=>FN(head,'let mut sum = 0;','for f in '+body[0]+' {','    sum += f.value();','}','sum');
const OWN_MAIN=(arg)=>MAIN(FINDS3,'println!("{}", total('+arg+'));','println!("{}", finds.len());');
const OWN_PROG=(sig,arg,iter)=>J(TYPES,FIND_IMPL,TOTAL(sig,iter),OWN_MAIN(arg));
const OWN_OUT='24\n3\n';

const HASH_USE=L('use std::collections::HashMap;');
const LABELED=IMPL(NEW,L('    fn label(&self) -> String {','        match self.kind {','            Kind::Shell => String::from("Shell"),','            Kind::Pearl => String::from("Pearl"),','            Kind::Weed => String::from("Weed"),','        }','    }'));
const TALLY=(...body)=>FN('fn tally(finds: &Vec<Find>) -> HashMap<String, u32>',...body);
const TALLY_MAIN=J('',MAIN('let finds = vec![Find::new(Kind::Shell, 4), Find::new(Kind::Pearl, 2), Find::new(Kind::Shell, 6), Find::new(Kind::Weed, 9)];','let sums = tally(&finds);','println!("{:?}", sums.get("Shell"));','println!("{:?}", sums.get("Pearl"));','println!("{:?}", sums.get("Weed"));','println!("{:?}", sums.get("Gem"));'));
const TALLY_PROG=(...body)=>J(HASH_USE,TYPES,LABELED,TALLY(...body));
const TALLY_BODY=['let mut sums: HashMap<String, u32> = HashMap::new();','for f in finds.iter() {','    *sums.entry(f.label()).or_insert(0) += f.weight;','}','sums'];
const TALLY_OUT='Some(10)\nSome(2)\nSome(9)\nNone\n';

const ERRS=L('#[derive(Debug)]','enum LogError {','    Unknown(String),','    TooHeavy(u32),','}');
const KIND_OF=FN('fn kind_of(name: &str) -> Result<Kind, LogError>','match name {','    "shell" => Ok(Kind::Shell),','    "pearl" => Ok(Kind::Pearl),','    "weed" => Ok(Kind::Weed),','    _ => Err(LogError::Unknown(name.to_string())),','}');
const MAKE=(...body)=>FN('fn make_find(name: &str, weight: u32) -> Result<Find, LogError>','if weight > 50 {','    return Err(LogError::TooHeavy(weight));','}',...body);
const MAKE_OK=MAKE('let kind = kind_of(name)?;','Ok(Find::new(kind, weight))');
const MAKE_MAIN=J('',MAIN('println!("{:?}", make_find("pearl", 3));','println!("{:?}", make_find("gem", 3));','println!("{:?}", make_find("weed", 80));'));
const MAKE_OUT='Ok(Find { kind: Pearl, weight: 3 })\nErr(Unknown("gem"))\nErr(TooHeavy(80))\n';

const HEAVIEST=(head,...body)=>FN(head,'let mut best = floor;','for f in finds.iter() {','    if f.weight > best.weight {','        best = f;','    }','}','best');
const HEAVY_MAIN=J('',MAIN(FINDS3,'let floor = Find::new(Kind::Weed, 3);','let low = Find::new(Kind::Pearl, 20);','println!("{:?}", heaviest(&finds, &floor));','println!("{:?}", heaviest(&finds, &low));'));
const HEAVY_OUT='Find { kind: Weed, weight: 9 }\nFind { kind: Pearl, weight: 20 }\n';
const SAME_LT=s=>!!s&&s.params.length>=2&&!!s.params[0]&&s.params.every(p=>p===s.params[0])&&s.ret===s.params[0];

const PRICED=L('trait Priced {','    fn price(&self) -> u32;','}');
const CRATE=L('struct Crate {','    count: u32,','}');
const PRICE_IMPLS=J(L('impl Priced for Find {','    fn price(&self) -> u32 {','        self.value()','    }','}'),L('impl Priced for Crate {','    fn price(&self) -> u32 {','        self.count * 2','    }','}'));
const SUM_PRICE=(head)=>FN(head,'let mut total = 0;','for i in items.iter() {','    total += i.price();','}','total');
const PRICE_MAIN=J('',MAIN(FINDS3,'let crates = vec![Crate { count: 5 }, Crate { count: 1 }];','println!("{}", total_price(&finds));','println!("{}", total_price(&crates));'));
const PRICE_PROG=(...fns)=>J(TYPES,FIND_IMPL,PRICED,CRATE,PRICE_IMPLS,...fns,PRICE_MAIN);
const PRICE_OUT='24\n12\n';

const COUNT=(...body)=>FN('fn count_where<F: Fn(&Find) -> bool>(finds: &Vec<Find>, rule: F) -> usize',...body);
const COUNT_MAIN=J('',MAIN(FINDS3,'let limit = 3;','println!("{}", count_where(&finds, |f| f.weight > limit));','println!("{}", count_where(&finds, |f| f.value() > 10));'));
const COUNT_PROG=(...body)=>J(TYPES,FIND_IMPL,COUNT(...body));
const COUNT_SWAPS=[['Find::new(Kind::Pearl, 2)','Find::new(Kind::Pearl, 1)'],['let limit = 3;','let limit = 8;']];

const ENTRY=L('struct Entry {','    name: String,','    weight: u32,','}');
const DAY_PRICED=J(PRICED,L('impl Priced for Find {','    fn price(&self) -> u32 {','        self.value()','    }','}'));
const TOTAL_PRICE=FN('fn total_price<T: Priced>(items: &Vec<T>) -> u32','items.iter().map(|i: &T| i.price()).sum()');
const DAY=(...body)=>FN('fn day_total(entries: &Vec<Entry>) -> Result<u32, LogError>',...body);
const DAY_OK=DAY('let mut finds: Vec<Find> = Vec::new();','for e in entries.iter() {','    let find = make_find(&e.name, e.weight)?;','    finds.push(find);','}','Ok(total_price(&finds))');
const DAY_PROG=(...body)=>J(TYPES,FIND_IMPL,ERRS,KIND_OF,MAKE_OK,DAY_PRICED,TOTAL_PRICE,ENTRY,DAY(...body));
const ENT=(n,w)=>'Entry { name: String::from("'+n+'"), weight: '+w+' }';
const DAY_MAIN=J('',MAIN('let good = vec!['+ENT('shell',4)+', '+ENT('pearl',2)+'];','let bad = vec!['+ENT('shell',4)+', '+ENT('gem',1)+', '+ENT('weed',99)+'];','let empty: Vec<Entry> = Vec::new();','println!("{:?}", day_total(&good));','println!("{:?}", day_total(&bad));','println!("{:?}", day_total(&empty));'));
const GOOD='let good = vec!['+ENT('shell',4)+', '+ENT('pearl',2)+'];',EMPTY='let empty: Vec<Entry> = Vec::new();';
const DAY_OUT='Ok(24)\nErr(Unknown("gem"))\nOk(0)\n';

RQ.CH.push({
  name:'The tide ledger',
  badge:'Moon Pearl',
  story:'The last low tide of the season has come, as Moss\'s first note said; write the whole day of finds into the ledger, add it up, and find the Moon Pearl in the deepest pool.',
  intro:`The last low tide of the season has come, just as Moss's first note said, and the Moon Pearl waits in the deepest pool. First Pip has a whole day of finds to write down: shells, pearls and tangles of weed. Nothing in the ledger is new. Each mission is a small job that uses several things you already know, side by side, the way real programs do: a <code>struct</code> and an <code>enum</code>, a <code>Vec</code> and a <code>HashMap</code>, references and lifetimes, a trait with a generic function, a closure, and <code>Result</code> with <code>?</code>. When the last job works, the ledger adds up the day.`,
  toolbox:`In this chapter: nothing new. It puts <code>struct</code>, <code>enum</code> and <code>match</code>, ownership and <code>&amp;</code> borrows, <code>Vec</code> and <code>HashMap</code>, <code>Result</code> and <code>?</code>, lifetime names, <code>trait</code> bounds, closures and iterator chains to work together, with the errors <code>E0382</code>, <code>E0308</code>, <code>E0106</code>, <code>E0599</code> and <code>E0004</code> you have met on the way.`,
  learned:['a struct and an enum together','borrowing a Vec','a HashMap tally','Result and ? in a chain','lifetimes on a search','a trait bound on a generic','a closure rule','the whole ledger'],
  missions:[
    {
      title:'Value a find',kind:'write',
      goal:`Pip's ledger has a <code>Kind</code> of find (shell, pearl or weed) and a <code>Find</code> with a kind and a weight. Write the method <code>value</code>: a shell is worth its weight, a pearl is worth ten times its weight and weed is worth nothing. The hidden <code>main</code> should print <code>4</code>, <code>20</code> and <code>0</code>.`,
      how:[
        `The whole program has an <code>enum</code> for the kind of find, a <code>struct</code> that pairs a kind with a weight, and a method <code>value</code> that turns one <code>Find</code> into a number. <code>main</code> makes three finds and prints what each is worth.`,
        `<code>value</code> has to look at the kind, so it uses a <code>match</code> on <code>self.kind</code>, with one arm for each variant. The arms can read the other field of the same <code>struct</code>: <code>self.weight</code>.`,
        `A <code>match</code> gives back a value, so the whole method body can be the <code>match</code>, with no <code>return</code> and no <code>;</code> at the end. Every variant needs an arm, or Rust stops with <code>E0004</code>.`,
        `The hidden <code>main</code> uses other weights than the ones on this card, so each arm has to work from <code>self.weight</code> and not from a number you typed.`
      ],
      explain:`An <code>enum</code> says which kind of thing you have, a <code>struct</code> says what it is made of, and a method ties them together: the <code>match</code> picks the rule, and the fields feed it. This shape, a <code>struct</code> with an <code>enum</code> field and a method that matches on it, is how a lot of Rust programs start.`,
      hint:`Write a <code>match self.kind { ... }</code> with <code>Kind::Shell => self.weight</code>, <code>Kind::Pearl => self.weight * 10</code> and <code>Kind::Weed => 0</code>.`,
      harness:VALUE_MAIN,
      starter:VALUE_PROG('0'),
      answer:VALUE_PROG('match self.kind {','    Kind::Shell => self.weight,','    Kind::Pearl => self.weight * 10,','    Kind::Weed => 0,','}'),
      alts:[VALUE_PROG('match self.kind {','    Kind::Weed => 0,','    Kind::Pearl => 10 * self.weight,','    Kind::Shell => self.weight,','}'),VALUE_PROG('match self.kind {','    Kind::Shell => self.weight,','    Kind::Pearl => self.weight * 10,','    _ => 0,','}')],
      wrong:[
        {src:VALUE_PROG('match self.kind {','    Kind::Shell => self.weight,','    Kind::Pearl => self.weight * 10,','}'),wrongWhy:'E0004'},
        {src:VALUE_PROG('match self.kind {','    Kind::Shell => self.weight,','    Kind::Pearl => self.weight * 100,','    Kind::Weed => 0,','}'),wrongWhy:'check'}
      ],
      lazy:[
        {src:VALUE_PROG('match self.kind {','    Kind::Shell => 4,','    Kind::Pearl => 20,','    Kind::Weed => 0,','}'),wrongWhy:'check'},
        {src:VALUE_PROG('if self.weight == 4 {','    4','} else if self.weight == 2 {','    20','} else {','    0','}'),wrongWhy:'check'}
      ],
      defines:[],previews:[],
      check:c=>{
        if(c.out()!=='4\n20\n0\n')return 'The program has to print `4`, `20` and `0`: a shell is worth its weight, a pearl ten times its weight and weed nothing.';
        if(c.count('match')<1)return 'Pick the rule with a `match` on `self.kind`.';
        return OTHER(c,'7\n30\n0\n','`value` has to work from `self.weight` in each arm, so another weight has to show up.',...VALUE_SWAPS);
      }
    },
    {
      title:'Lend the ledger, do not hand it over',kind:'fix',
      goal:`The function <code>total</code> adds up what a whole <code>Vec</code> of finds is worth, but the program stops with <code>E0382</code>: <code>main</code> uses <code>finds</code> after handing it over. Change <code>total</code> and its call so that <code>main</code> keeps its ledger and prints <code>24</code> and then <code>3</code>.`,
      how:[
        `The whole program builds three finds in a <code>Vec</code>, asks <code>total</code> for their value and then asks the same <code>Vec</code> how long it is. <code>total</code> only reads the finds, but its parameter is a <code>Vec&lt;Find&gt;</code> by value, so the call <code>total(finds)</code> moves the whole <code>Vec</code> into the function.`,
        `After a move the old name is empty, like in chapter 4. <code>finds.len()</code> comes after the move, so Rust says <code>E0382</code>: borrow of moved value. A <code>Vec</code> of structs is not <code>Copy</code>, and cloning it is not even possible here, because <code>Find</code> has no <code>Clone</code>.`,
        `Lend it instead, as in chapter 5: write the parameter as <code>finds: &amp;Vec&lt;Find&gt;</code> and call <code>total(&amp;finds)</code>. The loop <code>for f in finds.iter()</code> works the same on a borrowed <code>Vec</code>, and <code>main</code> still owns it afterwards.`
      ],
      explain:`A function that only reads should borrow. The signature tells the reader, and the compiler, what the function may do: <code>&amp;Vec&lt;Find&gt;</code> says "I will look, not keep". The owner can go on using the value as soon as the loan ends.`,
      hint:`Change the parameter to <code>finds: &amp;Vec&lt;Find&gt;</code> and the call to <code>total(&amp;finds)</code>.`,
      starter:OWN_PROG('fn total(finds: Vec<Find>) -> u32','finds','finds.iter()'),
      starterErr:'E0382',
      answer:OWN_PROG('fn total(finds: &Vec<Find>) -> u32','&finds','finds.iter()'),
      alts:[OWN_PROG('fn total(finds: &Vec<Find>) -> u32','&finds','finds'),],
      wrong:[
        {src:J(TYPES,FIND_IMPL,FN('fn total(finds: &Vec<Find>) -> u32','let mut sum = 0;','for f in finds.iter() {','    sum += f.weight;','}','sum'),OWN_MAIN('&finds')),wrongWhy:'check'},
        {src:OWN_PROG('fn total(finds: Vec<Find>) -> u32','finds.clone()','finds.iter()'),wrongWhy:'E0599'}
      ],
      lazy:[
        {src:J(TYPES,FIND_IMPL,TOTAL('fn total(finds: &Vec<Find>) -> u32','finds.iter()'),MAIN(FINDS3,'println!("24");','println!("{}", finds.len());')),wrongWhy:'check'},
        {src:J(TYPES,FIND_IMPL,TOTAL('fn total(finds: &Vec<Find>) -> u32','finds.iter()'),MAIN(FINDS3,'println!("{}", total(&finds));','println!("3");')),wrongWhy:'check'},
        {src:J(TYPES,FIND_IMPL,FN('fn total(finds: &Vec<Find>) -> u32','finds[0].value() + finds[1].value() + finds[2].value()'),OWN_MAIN('&finds')),wrongWhy:'check'}
      ],
      defines:[],previews:[],
      check:c=>{
        if(c.out()!==OWN_OUT)return 'The program has to print `24` and then `3`.';
        if(!c.paramIsRef('total',0,'shared'))return 'Make `total` borrow the `Vec` with `&Vec<Find>`, and lend `finds` at the call with `&finds`.';
        if(c.usesMethod('len')<1||c.calls('total')<1)return 'Keep calling `total` on `finds`, then asking `finds` for its `len`.';
        return EACH(c,'`total` has to add up the finds in the `Vec`, whatever their weights and however many there are.',['33\n3\n',['Find::new(Kind::Weed, 9)','Find::new(Kind::Shell, 9)']],['29\n4\n',[FINDS3,FINDS3.replace('Weed, 9)]','Weed, 9), Find::new(Kind::Shell, 5)]')]]);
      }
    },
    {
      title:'Tally the finds by kind',kind:'write',
      goal:`The method <code>label</code> gives each kind its name as a <code>String</code>. Write <code>tally</code>: it takes the ledger by reference and gives back a <code>HashMap</code> from each kind's label to the total weight of that kind. The hidden <code>main</code> should print <code>Some(10)</code>, <code>Some(2)</code>, <code>Some(9)</code> and <code>None</code>.`,
      how:[
        `The whole program has four finds, two of them shells, and a <code>tally</code> that adds the weights up per kind. <code>main</code> asks the map for three kinds that exist and one that does not, so the last answer is <code>None</code>.`,
        `Start with an empty map, <code>let mut sums: HashMap&lt;String, u32&gt; = HashMap::new();</code>, and loop over the finds with <code>for f in finds.iter()</code>. The key of each find is its <code>label()</code>.`,
        `<code>*sums.entry(f.label()).or_insert(0) += f.weight;</code> does the counting in one line: <code>entry</code> finds the slot for that label, <code>or_insert(0)</code> starts it at <code>0</code> when it is new and hands back a <code>&amp;mut</code> to it, and the <code>*</code> and <code>+=</code> add the weight through that reference.`,
        `The last line of <code>tally</code> is <code>sums</code> with no <code>;</code>, which gives the map back to the caller. <code>main</code> reads it with <code>get</code>, and <code>get</code> gives an <code>Option</code>, so a kind with no finds is <code>None</code>.`
      ],
      explain:`A <code>HashMap</code> is the right tool when you want a total for each name, and <code>entry</code> with <code>or_insert</code> is the usual way to fill one. The loop borrows the finds, so the caller still has them. The order inside a <code>HashMap</code> is not fixed, which is why <code>main</code> asks for keys one by one.`,
      hint:`Make <code>sums</code>, loop with <code>for f in finds.iter()</code>, add <code>*sums.entry(f.label()).or_insert(0) += f.weight;</code> and end with <code>sums</code>.`,
      harness:TALLY_MAIN,
      starter:TALLY_PROG('HashMap::new()'),
      answer:TALLY_PROG(...TALLY_BODY),
      alts:[TALLY_PROG('let mut sums: HashMap<String, u32> = HashMap::new();','for f in finds.iter() {','    let slot = sums.entry(f.label()).or_insert(0);','    *slot = *slot + f.weight;','}','sums'),
        TALLY_PROG('let mut sums: HashMap<String, u32> = HashMap::new();','for f in finds.iter() {','    let key = f.label();','    if sums.contains_key(&key) {','        let slot = sums.get_mut(&key).unwrap();','        *slot += f.weight;','    } else {','        sums.insert(key, f.weight);','    }','}','sums'),
        TALLY_PROG('let mut sums: HashMap<String, u32> = HashMap::new();','for f in finds.iter() {','    let key = f.label();','    match sums.get_mut(&key) {','        Some(n) => {','            *n += f.weight;','        }','        None => {','            sums.insert(key, f.weight);','        }','    }','}','sums'),
        TALLY_PROG('let mut sums: HashMap<String, u32> = HashMap::new();','for f in finds.iter() {','    let key = f.label();','    let old = match sums.get(&key) {','        Some(n) => *n,','        None => 0,','    };','    sums.insert(key, old + f.weight);','}','sums')],
      wrong:[
        {src:TALLY_PROG('let mut sums: HashMap<String, u32> = HashMap::new();','for f in finds.iter() {','    *sums.entry(f.label()).or_insert(0) += 1;','}','sums'),wrongWhy:'check'},
        {src:TALLY_PROG('let mut sums: HashMap<String, u32> = HashMap::new();','for f in finds.iter() {','    sums.insert(f.label(), f.weight);','}','sums'),wrongWhy:'check'}
      ],
      lazy:[
        {src:TALLY_PROG('let mut sums: HashMap<String, u32> = HashMap::new();','sums.insert(String::from("Shell"), 10);','sums.insert(String::from("Pearl"), 2);','sums.insert(String::from("Weed"), 9);','sums'),wrongWhy:'check'},
        {src:TALLY_PROG(...TALLY_BODY.slice(0,3),'}','sums.insert(String::from("Pearl"), 2);','sums.insert(String::from("Weed"), 9);','sums'),wrongWhy:'check'},
        {src:TALLY_PROG('let mut sums: HashMap<String, u32> = HashMap::new();','for f in finds.iter() {','    *sums.entry(f.label()).or_insert(0) += 0;','}','sums.insert(String::from("Shell"), 10);','sums.insert(String::from("Pearl"), 2);','sums.insert(String::from("Weed"), 9);','sums'),wrongWhy:'check'}
      ],
      defines:[],previews:[],
      check:c=>{
        if(c.out()!==TALLY_OUT)return 'The program has to print `Some(10)`, `Some(2)`, `Some(9)` and `None`: the weight of each kind, and nothing for a kind with no finds.';
        const W=(k,w)=>'Find::new(Kind::'+k+', '+w+')';
        return EACH(c,'`tally` has to add up the weights of the finds in the `Vec`, whatever the weights are, and give nothing for a kind that has no finds.',
          ['Some(11)\nSome(5)\nSome(1)\nNone\n',[W('Shell',6),W('Shell',7)],[W('Pearl',2),W('Pearl',5)],[W('Weed',9),W('Weed',1)]],
          ['Some(10)\nNone\nSome(4)\nNone\n',[W('Pearl',2)+', ',''],[W('Weed',9),W('Weed',4)]],
          ['Some(4)\nSome(5)\nNone\nNone\n',[W('Shell',6)+', '+W('Weed',9),W('Pearl',3)]]);
      }
    },
    {
      title:'Send the error up with ?',kind:'fix',
      goal:`The function <code>make_find</code> turns a name and a weight into a <code>Find</code>, or into a <code>LogError</code>. It stops with <code>E0308</code>, because <code>kind_of</code> gives back a <code>Result</code> and <code>Find::new</code> wants a <code>Kind</code>. Fix <code>make_find</code> with <code>?</code> so that <code>main</code> prints the three answers: <code>Ok(...)</code> for a pearl, then the error for an unknown name and the error for a find that is too heavy.`,
      how:[
        `The whole program has two functions that can fail. <code>kind_of</code> reads the name and fails with <code>Unknown</code> when it is not shell, pearl or weed. <code>make_find</code> fails with <code>TooHeavy</code> above 50, calls <code>kind_of</code>, and builds the <code>Find</code>.`,
        `<code>let kind = kind_of(name);</code> puts the whole <code>Result</code> in <code>kind</code>, and then <code>Find::new(kind, weight)</code> is a <code>Result&lt;Kind, LogError&gt;</code> where a <code>Kind</code> should be. That is <code>E0308</code>, the mismatch from chapter 3, in a new place.`,
        `Chapter 9's <code>?</code> opens it: <code>kind_of(name)?</code> gives the <code>Kind</code> inside an <code>Ok</code>, and on an <code>Err</code> it returns that <code>Err</code> from <code>make_find</code> right away. The two functions share the error type <code>LogError</code>, so it goes up as it is.`,
        `The weight check comes first and returns by hand with <code>return Err(...)</code>. That is why <code>"weed"</code> with weight <code>80</code> reports <code>TooHeavy</code>, while <code>"gem"</code> with weight <code>3</code> gets as far as <code>kind_of</code>.`
      ],
      explain:`<code>?</code> keeps the happy path in a straight line: the lines that follow it can use the plain value. The errors are an <code>enum</code> of your own, so each failure says what went wrong and carries the data that matters, such as the weight that was too heavy.`,
      hint:`Write <code>let kind = kind_of(name)?;</code> with a <code>?</code> at the end.`,
      harness:MAKE_MAIN,
      starter:J(TYPES,IMPL(NEW),ERRS,KIND_OF,MAKE('let kind = kind_of(name);','Ok(Find::new(kind, weight))')),
      starterErr:'E0308',
      answer:J(TYPES,IMPL(NEW),ERRS,KIND_OF,MAKE_OK),
      alts:[J(TYPES,IMPL(NEW),ERRS,KIND_OF,MAKE('Ok(Find::new(kind_of(name)?, weight))'))],
      wrong:[
        {src:J(TYPES,IMPL(NEW),ERRS,KIND_OF,MAKE('let kind = kind_of(name)?;','Find::new(kind, weight)')),wrongWhy:'E0308'},
        {src:J(TYPES,IMPL(NEW),ERRS,KIND_OF,MAKE('let kind = kind_of(name)?;','Ok(Find::new(Kind::Shell, weight))')),wrongWhy:'check'}
      ],
      lazy:[
        {src:J(TYPES,IMPL(NEW),ERRS,KIND_OF,MAKE('if name == "gem" {','    return Err(LogError::Unknown(name.to_string()));','}','Ok(Find::new(Kind::Pearl, weight))')),wrongWhy:'check'},
        {src:J(TYPES,IMPL(NEW),ERRS,KIND_OF,MAKE('let kind = match kind_of(name) {','    Ok(k) => k,','    Err(e) => return Err(e),','};','Ok(Find::new(kind, weight))')),wrongWhy:'check'},
        {src:J(TYPES,IMPL(NEW),ERRS,KIND_OF,MAKE('let kind = kind_of(name)?;','if weight == 0 {','    return Ok(Find::new(kind, 0));','}','Ok(Find::new(Kind::Pearl, weight))')),wrongWhy:'check'}
      ],
      defines:[],previews:[],
      check:c=>{
        if(c.out()!==MAKE_OUT)return 'The program has to print `Ok(Find { kind: Pearl, weight: 3 })`, `Err(Unknown("gem"))` and `Err(TooHeavy(80))`.';
        if(!c.tryOn('make_find','kind_of'))return 'Open the `Result` from `kind_of` with `?`, so an `Err` leaves `make_find` and an `Ok` gives the `Kind`.';
        return EACH(c,'`make_find` has to build the `Find` from the name and the weight it is given, and pass on the errors.',
          ['Ok(Find { kind: Shell, weight: 5 })\nErr(Unknown("coral"))\nErr(TooHeavy(60))\n',['"pearl", 3','"shell", 5'],['"gem"','"coral"'],['"weed", 80','"weed", 60']],
          ['Ok(Find { kind: Weed, weight: 50 })\nErr(TooHeavy(51))\nErr(Unknown("gem"))\n',['"pearl", 3','"weed", 50'],['"gem", 3','"pearl", 51'],['"weed", 80','"gem", 9']]);
      }
    },
    {
      title:'The heaviest find lives on',kind:'fix',
      goal:`<code>heaviest</code> looks through a ledger and gives back a reference to the heaviest find, or to the <code>floor</code> find when none is heavier. It stops with <code>E0106</code>. Give <code>heaviest</code> a lifetime name so the program prints <code>Find { kind: Weed, weight: 9 }</code> and then <code>Find { kind: Pearl, weight: 20 }</code>.`,
      how:[
        `The whole program has a <code>Vec</code> of finds and two other finds, <code>floor</code> and <code>low</code>. <code>heaviest</code> starts with <code>floor</code> as the best so far, goes through the ledger, and keeps whichever has the bigger weight. What it returns is a reference into one of its two inputs.`,
        `Two references come in and one goes out, so Rust cannot tell which input the answer borrows from: <code>E0106</code>, the same as chapter 10. Here the answer really can be either, because <code>best</code> may be <code>floor</code> or any find in the <code>Vec</code>.`,
        `Declare one name, <code>heaviest&lt;'a&gt;</code>, and put it on both inputs and on the result: <code>finds: &amp;'a Vec&lt;Find&gt;</code>, <code>floor: &amp;'a Find</code> and <code>-&gt; &amp;'a Find</code>. The answer then may be used only while both inputs are still there.`
      ],
      explain:`When a function hands back a borrow of what it was given, the lifetime name is the promise about which inputs the answer may point into. The body never changes: the names only describe what it already does. This is the search you would write in any program that picks one item out of a collection.`,
      hint:`Write <code>fn heaviest&lt;'a&gt;(finds: &amp;'a Vec&lt;Find&gt;, floor: &amp;'a Find) -&gt; &amp;'a Find</code> and leave the body alone.`,
      harness:HEAVY_MAIN,
      starter:J(TYPES,IMPL(NEW),HEAVIEST('fn heaviest(finds: &Vec<Find>, floor: &Find) -> &Find')),
      starterErr:'E0106',
      answer:J(TYPES,IMPL(NEW),HEAVIEST(`fn heaviest<'a>(finds: &'a Vec<Find>, floor: &'a Find) -> &'a Find`)),
      alts:[J(TYPES,IMPL(NEW),HEAVIEST(`fn heaviest<'x>(finds: &'x Vec<Find>, floor: &'x Find) -> &'x Find`))],
      wrong:[
        {src:J(TYPES,IMPL(NEW),HEAVIEST(`fn heaviest<'a>(finds: &'a Vec<Find>, floor: &Find) -> &'a Find`)),wrongWhy:'E0621'},
        {src:J(TYPES,IMPL(NEW),FN(`fn heaviest<'a>(finds: &'a Vec<Find>, floor: &'a Find) -> &'a Find`,'let mut best = floor;','for f in finds.iter() {','    if f.weight < best.weight {','        best = f;','    }','}','best')),wrongWhy:'check'}
      ],
      lazy:[
        {src:J(TYPES,IMPL(NEW),FN(`fn heaviest<'a>(finds: &'a Vec<Find>, floor: &'a Find) -> &'a Find`,'if finds.len() > 2 {','    &finds[2]','} else {','    floor','}')),wrongWhy:'check'},
        {src:J(TYPES,IMPL(NEW),FN(`fn heaviest<'a>(finds: &'a Vec<Find>, floor: &'a Find) -> &'a Find`,'if floor.weight == 20 {','    floor','} else {','    &finds[2]','}')),wrongWhy:'check'},
        {src:J(TYPES,IMPL(NEW),FN(`fn heaviest<'a>(finds: &'a Vec<Find>, floor: &'a Find) -> &'a Find`,'if floor.weight > 9 {','    floor','} else {','    &finds[2]','}')),wrongWhy:'check'},
        {src:J(TYPES,IMPL(NEW),FN(`fn heaviest<'a>(finds: &'a Vec<Find>, floor: &'a Find) -> &'a Find`,'if floor.weight == 3 {','    &finds[2]','} else {','    floor','}')),wrongWhy:'check'}
      ],
      defines:[],previews:[],
      check:c=>{
        const s=c.sigOf('heaviest');
        if(c.out()!==HEAVY_OUT)return 'The program has to print `Find { kind: Weed, weight: 9 }` and then `Find { kind: Pearl, weight: 20 }`.';
        if(!s||!s.lts.length||!SAME_LT(s))return 'Declare a lifetime name after `heaviest`, like `<\'a>`, and write it on both parameters and on the result.';
        const W=(k,w)=>'Find::new(Kind::'+k+', '+w+')';
        return EACH(c,'`heaviest` has to compare every find in the `Vec` with the best so far, whatever the weights are and wherever the heaviest one sits.',
          ['Find { kind: Shell, weight: 15 }\nFind { kind: Pearl, weight: 30 }\n',[W('Shell',4),W('Shell',15)],[W('Weed',3),W('Weed',11)],[W('Pearl',20),W('Pearl',30)]],
          ['Find { kind: Pearl, weight: 13 }\nFind { kind: Pearl, weight: 13 }\n',[W('Pearl',2),W('Pearl',13)],[W('Weed',3),W('Shell',8)],[W('Pearl',20),W('Weed',1)]],
          ['Find { kind: Shell, weight: 40 }\nFind { kind: Pearl, weight: 20 }\n',[W('Weed',3),W('Shell',40)]]);
      }
    },
    {
      title:'One total for every kind of thing',kind:'fix',
      goal:`<code>total_price</code> adds up the prices of a <code>Vec</code> of anything that has a price. Finds and crates both do, through the trait <code>Priced</code>, but the program stops with <code>E0599</code>: no method <code>price</code> on the generic type. Fix the function so <code>main</code> prints <code>24</code> and then <code>12</code>.`,
      how:[
        `The whole program has a trait <code>Priced</code> with one method, an <code>impl</code> of it for <code>Find</code> and one for <code>Crate</code>, and a generic <code>total_price</code> that loops over the items and adds up their prices. <code>main</code> calls it on a <code>Vec&lt;Find&gt;</code> and on a <code>Vec&lt;Crate&gt;</code>.`,
        `Inside <code>total_price</code>, the type <code>T</code> could be anything, so Rust only allows what every type can do. <code>i.price()</code> is not on that list, which is <code>E0599</code>. You met this in chapter 11: the bound opens the body.`,
        `Add the bound: <code>total_price&lt;T: Priced&gt;</code>. Now Rust knows every <code>T</code> has <code>price</code>, and the loop may call it on each item.`,
        `The function is written once and works for both calls. At each call Rust checks that the type of the items really has an <code>impl Priced</code>, so a <code>Vec</code> of something with no price would be refused at the call instead.`
      ],
      explain:`A trait bound makes one function work for any type that keeps a promise, and the compiler checks the promise at each call. Write the loop once and it totals finds, crates or anything you later give an <code>impl Priced</code>.`,
      hint:`Change the first line to <code>fn total_price&lt;T: Priced&gt;(items: &amp;Vec&lt;T&gt;) -&gt; u32</code>.`,
      starter:PRICE_PROG(SUM_PRICE('fn total_price<T>(items: &Vec<T>) -> u32')),
      starterErr:'E0599',
      answer:PRICE_PROG(SUM_PRICE('fn total_price<T: Priced>(items: &Vec<T>) -> u32')),
      alts:[PRICE_PROG(SUM_PRICE('fn total_price(items: &Vec<impl Priced>) -> u32')),PRICE_PROG(L('fn total_price<T>(items: &Vec<T>) -> u32','where','    T: Priced,','{','    let mut total = 0;','    for i in items.iter() {','        total += i.price();','    }','    total','}')),PRICE_PROG(FN('fn total_price<T: Priced>(items: &Vec<T>) -> u32','items.iter().map(|i: &T| i.price()).sum()'))],
      wrong:[
        {src:PRICE_PROG(FN('fn total_price<T: Priced>(items: &Vec<T>) -> u32','items[0].price()')),wrongWhy:'check'},
        {src:PRICE_PROG(FN('fn total_price<T: Priced>(items: &Vec<T>) -> u32','let mut total = 0;','for i in items.iter() {','    total += i.price() + 1;','}','total')),wrongWhy:'check'}
      ],
      lazy:[
        {src:PRICE_PROG(FN('fn total_price<T: Priced>(items: &Vec<T>) -> u32','if items.len() == 3 {','    24','} else {','    12','}')),wrongWhy:'check'},
        {src:PRICE_PROG(FN('fn total_price<T: Priced>(items: &Vec<T>) -> u32','let mut total = 0;','for i in items.iter() {','    total += i.price();','}','if items.len() == 3 {','    24','} else {','    total','}')),wrongWhy:'check'},
        {src:PRICE_PROG(FN('fn total_price<T: Priced>(items: &Vec<T>) -> u32','let mut total = 0;','for i in items.iter() {','    total += 0 * i.price();','}','if items.len() == 3 {','    24 + total','} else {','    12 + total','}')),wrongWhy:'check'}
      ],
      defines:[],previews:[],
      check:c=>{
        if(c.out()!==PRICE_OUT)return 'The program has to print `24` and then `12`.';
        if(!BOUND(c.genericOf('total_price'),'Priced'))return 'Give `total_price` a type name with the bound `Priced`, like `<T: Priced>`.';
        if(c.methodIn('total_price','price')<1)return 'Ask every item for its `price()` inside `total_price`.';
        return EACH(c,'`total_price` has to add up the price of every item, whatever it is and however many there are.',
          ['33\n22\n',['Find::new(Kind::Weed, 9)','Find::new(Kind::Shell, 9)'],['Crate { count: 5 }','Crate { count: 10 }']],
          ['30\n26\n',[FINDS3,'let finds = vec![Find::new(Kind::Pearl, 3)];'],['Crate { count: 1 }]','Crate { count: 1 }, Crate { count: 7 }]']]);
      }
    },
    {
      title:'A rule as a closure',kind:'write',
      goal:`Write <code>count_where</code> with an iterator chain and no loop: it takes the ledger and a closure <code>rule</code> that says <code>true</code> or <code>false</code> for a find, and gives back how many finds the rule says <code>true</code> for. The hidden <code>main</code> should print <code>2</code> and then <code>1</code>.`,
      how:[
        `The whole program has a ledger of three finds and calls <code>count_where</code> twice with two different rules: finds heavier than a <code>limit</code> variable, and finds worth more than <code>10</code>. The function does not know the rules. It only knows how to count the finds a rule accepts.`,
        `The parameter <code>rule: F</code> with the bound <code>F: Fn(&amp;Find) -&gt; bool</code> takes any closure that reads a find and answers with a <code>bool</code>. The first rule also uses <code>limit</code> from <code>main</code>, so it captures a variable, which <code>Fn</code> allows when the closure only reads.`,
        `Chain it: <code>finds.iter().filter(|f| rule(*f)).count()</code>. <code>iter()</code> gives <code>&amp;Find</code> items, <code>filter</code> hands the closure a reference to each item, so <code>f</code> is a <code>&amp;&amp;Find</code>, and the <code>*</code> peels one level off before calling <code>rule</code>. Rust also peels it for you, so <code>rule(f)</code> works too. <code>count</code> then says how many got through.`
      ],
      explain:`Passing the rule in keeps the function small and reusable: the caller decides what counts, and the closure may use variables around it. This is the same idea as <code>sort_by_key</code> or <code>retain</code> in the standard library, which take a rule and apply it to a collection.`,
      hint:`Write <code>finds.iter().filter(|f| rule(*f)).count()</code> as the whole body.`,
      harness:COUNT_MAIN,
      starter:COUNT_PROG('0'),
      answer:COUNT_PROG('finds.iter().filter(|f| rule(*f)).count()'),
      alts:[COUNT_PROG('finds.iter().map(|f| rule(f)).filter(|ok| *ok).count()'),COUNT_PROG('finds.iter().filter(|f| rule(f)).count()'),COUNT_PROG('finds.iter().fold(0, |n, f| if rule(f) { n + 1 } else { n })')],
      wrong:[
        {src:COUNT_PROG('finds.iter().filter(|f| !rule(*f)).count()'),wrongWhy:'check'},
        {src:COUNT_PROG('finds.iter().take(3).filter(|f| rule(f)).count()'),wrongWhy:'check'},
        {src:COUNT_PROG('finds.iter().count()'),wrongWhy:'check'}
      ],
      lazy:[
        {src:COUNT_PROG('let _n = finds.iter().filter(|f| rule(*f)).count();','if finds.len() > 2 {','    2','} else {','    1','}'),wrongWhy:'check'},
        {src:COUNT_PROG('let mut n = 0;','for f in finds.iter() {','    if rule(f) {','        n += 1;','    }','}','n'),wrongWhy:'check'}
      ],
      defines:[],previews:[],
      check:c=>{
        if(c.out()!=='2\n1\n')return 'The program has to print `2` and then `1`: the finds heavier than `limit`, and the finds worth more than `10`.';
        if(!FN_BOUND(c.genericOf('count_where')))return 'Keep `rule` as a closure bound, `F: Fn(&Find) -> bool`.';
        if(c.usesMethod('iter')<1||c.countIn('for','count_where')+c.countIn('while','count_where')+c.countIn('loop','count_where')>0)return 'Count with an iterator chain that starts with `iter()`, like `filter` and `count`, and no loop in `count_where`.';
        if(!c.closures().some(x=>x.caps.length>0))return 'Keep the first rule in `main` as a closure that uses `limit`.';
        return EACH(c,'`count_where` has to count the finds the rule accepts, whatever the weights are and however many finds there are.',['1\n0\n',...COUNT_SWAPS],['3\n2\n',[FINDS3,FINDS3.replace('Weed, 9)]','Weed, 9), Find::new(Kind::Shell, 20)]')]]);
      }
    },
    {
      title:'Add up a whole day',kind:'write',
      goal:`Everything is written except <code>day_total</code>. It takes a <code>Vec</code> of <code>Entry</code> notes (a name and a weight each), turns each into a <code>Find</code> with <code>make_find</code> and <code>?</code>, and gives back the total price of the finds with <code>total_price</code>. If any note fails, the whole day fails with that error. The hidden <code>main</code> should print <code>Ok(24)</code>, then <code>Err(Unknown("gem"))</code>, then <code>Ok(0)</code>.`,
      how:[
        `The whole program turns a day of notes into one number, or into the first thing that went wrong. <code>day_total</code> has to borrow the notes, build a <code>Vec&lt;Find&gt;</code> from them one at a time, and hand that <code>Vec</code> to the generic <code>total_price</code> from the last missions.`,
        `Make the empty <code>Vec</code> first, <code>let mut finds: Vec&lt;Find&gt; = Vec::new();</code>, then loop with <code>for e in entries.iter()</code>. Each <code>e</code> is a borrow of an <code>Entry</code>, so <code>&amp;e.name</code> lends its text to <code>make_find</code> and <code>e.weight</code> is a plain number.`,
        `<code>make_find(&amp;e.name, e.weight)?</code> gives the <code>Find</code>, or leaves <code>day_total</code> with the error as soon as a note fails. The notes after the bad one are never looked at, which is why the second day stops at <code>"gem"</code> and never meets the weed of weight <code>99</code>. Push each find into the <code>Vec</code>.`,
        `End with <code>Ok(total_price(&amp;finds))</code>. An empty day has no finds to price, so it gives <code>Ok(0)</code>.`
      ],
      explain:`This is the pattern behind most real programs: borrow the input, convert each piece with a function that can fail, let <code>?</code> stop at the first failure, and finish with a pure calculation on what you collected. Ownership, borrowing, <code>Result</code>, a generic function and a trait each do their own small part.`,
      hint:`Loop with <code>for e in entries.iter()</code>, push <code>make_find(&amp;e.name, e.weight)?</code> into a <code>Vec</code>, and end with <code>Ok(total_price(&amp;finds))</code>.`,
      harness:DAY_MAIN,
      starter:DAY_PROG('Ok(0)'),
      answer:DAY_PROG('let mut finds: Vec<Find> = Vec::new();','for e in entries.iter() {','    let find = make_find(&e.name, e.weight)?;','    finds.push(find);','}','Ok(total_price(&finds))'),
      alts:[DAY_PROG('let mut finds: Vec<Find> = Vec::new();','for e in entries.iter() {','    finds.push(make_find(&e.name, e.weight)?);','}','let total = total_price(&finds);','Ok(total)')],
      wrong:[
        {src:DAY_PROG('let mut finds: Vec<Find> = Vec::new();','for e in entries.iter() {','    let find = make_find(&e.name, e.weight)?;','    finds.push(find);','}','Ok(finds.len() as u32)'),wrongWhy:'check'},
        {src:DAY_PROG('let mut finds: Vec<Find> = Vec::new();','for e in entries.iter() {','    let find = make_find(&e.name, e.weight)?;','    finds.push(find);','}','Ok(total_price(&finds) + 1)'),wrongWhy:'check'}
      ],
      lazy:[
        {src:DAY_PROG('if entries.len() == 0 {','    return Ok(0);','}','if entries.len() == 2 {','    return Ok(24);','}','Err(LogError::Unknown(String::from("gem")))'),wrongWhy:'check'},
        {src:DAY_PROG('let mut finds: Vec<Find> = Vec::new();','for e in entries.iter() {','    let find = match make_find(&e.name, e.weight) {','        Ok(f) => f,','        Err(err) => return Err(err),','    };','    finds.push(find);','}','Ok(total_price(&finds))'),wrongWhy:'check'},
        {src:DAY_PROG('if entries.len() == 3 {','    return Err(LogError::Unknown(String::from("gem")));','}','let mut finds: Vec<Find> = Vec::new();','for e in entries.iter() {','    let find = make_find(&e.name, e.weight)?;','    finds.push(find);','}','Ok(total_price(&finds))'),wrongWhy:'check'},
        {src:DAY_PROG('let mut finds: Vec<Find> = Vec::new();','for e in entries.iter().take(2) {','    let find = make_find(&e.name, e.weight)?;','    finds.push(find);','}','Ok(total_price(&finds))'),wrongWhy:'check'},
        {src:DAY_PROG('if entries.len() < 2 {','    return Ok(0);','}','let mut finds: Vec<Find> = Vec::new();','for e in entries.iter() {','    let find = make_find(&e.name, e.weight)?;','    finds.push(find);','}','Ok(total_price(&finds))'),wrongWhy:'check'},
        {src:DAY_PROG('let mut finds: Vec<Find> = Vec::new();','for e in entries.iter() {','    let find = make_find(&e.name, e.weight)?;','    finds.push(find);','}','let mut sum = 0;','for f in finds.iter() {','    sum += f.value();','}','Ok(sum)'),wrongWhy:'check'}
      ],
      defines:[],previews:[],
      check:c=>{
        if(c.out()!==DAY_OUT)return 'The program has to print `Ok(24)` for the good day, `Err(Unknown("gem"))` for the bad day, and `Ok(0)` for the empty day.';
        if(!c.tryOn('day_total','make_find'))return 'Open each `Result` from `make_find` with `?`, so the first bad note ends `day_total`.';
        if(c.callsIn('day_total','total_price')<1)return 'Finish with `total_price` on the finds you collected, so the price comes from the `Priced` trait.';
        return EACH(c,'`day_total` has to price the finds the notes make and stop at the first bad note, whatever the notes are and however many there are.',
          ['Ok(44)\nErr(Unknown("coral"))\nOk(0)\n',['"pearl"), weight: 2','"pearl"), weight: 4'],[ENT('gem',1),ENT('coral',1)]],
          ['Ok(4)\nErr(TooHeavy(70))\nOk(3)\n',[GOOD,'let good = vec!['+ENT('weed',7)+', '+ENT('shell',3)+', '+ENT('shell',1)+'];'],[ENT('gem',1),ENT('weed',70)],[EMPTY,'let empty: Vec<Entry> = vec!['+ENT('shell',3)+'];']]);
      }
    }
  ]
});
})();
