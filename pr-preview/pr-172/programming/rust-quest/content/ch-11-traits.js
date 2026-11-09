/* Append only: a mission's key is '10.<index>' and shipped keys are never renumbered. DOM-free. */
(()=>{
'use strict';
const RQ=globalThis.RQ=globalThis.RQ||{};
const L=(...lines)=>lines.join('\n')+'\n';
const J=(...parts)=>parts.join('\n');
const MAIN=(...body)=>L('fn main() {',...body.map(l=>'    '+l),'}');
const FN=(head,...body)=>L(head+' {',...body.map(l=>'    '+l),'}');
const CRAB=L('struct Crab {','    name: String,','}');
const GULL=L('struct Gull {','    name: String,','}');
const CRY=L('trait Cry {','    fn sound(&self) -> String;','}');
const CRY2=L('trait Cry {','    fn name(&self) -> String;','    fn sound(&self) -> String;','}');
const IMPL=(ty,body)=>L('impl Cry for '+ty+' {','    fn sound(&self) -> String {','        '+body,'    }','}');
const IMPL2=(ty,word)=>L('impl Cry for '+ty+' {','    fn name(&self) -> String {','        self.name.clone()','    }','    fn sound(&self) -> String {','        String::from("'+word+'")','    }','}');
const CLICKS=IMPL('Crab','format!("{} clicks", self.name)'),SQUAWKS=IMPL('Gull','format!("{} squawks", self.name)');
const PAIR_MAIN=(call)=>J('',MAIN('let c = Crab { name: String::from("Pip") };','let g = Gull { name: String::from("Gus") };',call+'(&c);',call+'(&g);'));
const ANNOUNCE=head=>FN(head,'println!("{}", x.sound());');
// runs the learner's program on other input and wants what real code gives, so a typed-in answer fails; null means the input text was changed
const OTHER=(c,want,why,...swaps)=>{const r=c.rerun(...swaps);return r===null?'Keep `'+swaps[0][0]+'` as it is, so Rust Quest can try your code on other text.':r.out()!==want?why:true;};
const BOUND=(g,name)=>!!g&&g.tparams.some(t=>t.bounds.includes(name));
const MEET=J('',L('fn meet<T: Cry>(x: &T) {','    println!("{}", x.intro());','}'),MAIN('let c = Crab { name: String::from("Pip") };','let g = Gull { name: String::from("Gus") };','meet(&c);','meet(&g);'));
const INTRO=L('    fn intro(&self) -> String {','        format!("{} says {}", self.name(), self.sound())','    }');
const CRY_INTRO=L('trait Cry {','    fn name(&self) -> String;','    fn sound(&self) -> String;',INTRO.trimEnd(),'}');
const LARGER=(head,...tail)=>FN('fn larger'+head,'if a > b {','    a','} else {','    b','}');
const LARGER_MAIN=J('',MAIN('println!("{}", larger(3, 9));','println!("{}", larger(2.5, 1.5));',"println!(\"{}\", larger('a', 'z'));"));
const SHELL=L('struct Shell {','    size: u32,','}');
const SHOW=J('',L('fn show(s: &Shell) {','    println!("{}", s);','}'),MAIN('let a = Shell { size: 4 };','let b = Shell { size: 12 };','show(&a);','show(&b);'));
const FMT=(...body)=>L('impl fmt::Display for Shell {','    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {',...body.map(l=>'        '+l),'    }','}');
const GUARD=L('struct Guard {','    name: String,','}');
const GUARD_MAIN=J('',MAIN('let _outer = Guard { name: String::from("outer") };','{','    let _inner = Guard { name: String::from("inner") };','    println!("in the block");','}','println!("after the block");'));
const DROP=(...body)=>L('impl Drop for Guard {','    fn drop(&mut self) {',...body.map(l=>'        '+l),'    }','}');
const GUARD_OUT='in the block\nclosing inner\nafter the block\nclosing outer\n';
const TIDE=L('#[derive(Debug)]','enum TideError {','    TooLow(i32),','}');
const CHECK=FN('fn check(depth: i32) -> Result<i32, i32>','if depth < 0 {','    Err(depth)','} else {','    Ok(depth)','}');
const PLAN=FN('fn plan(depth: i32) -> Result<i32, TideError>','let d = check(depth)?;','Ok(d * 2)');
const PLAN_MAIN=J('',MAIN('println!("{:?}", plan(5));','println!("{:?}", plan(-3));'));
const FROM=(ty,...body)=>L('impl From<'+ty+'> for TideError {','    fn from(n: '+ty+') -> TideError {',...body.map(l=>'        '+l),'    }','}');
const CRATE_MAIN=J('',MAIN('let a = Crate { item: 3 };','let b = Crate { item: String::from("shell") };','println!("{}", a.open());','println!("{}", b.open());'));

RQ.CH.push({
  name:'Traits and generics',
  badge:'Rule Weaver',
  intro:`Crabs click, gulls squawk, and the tide pool needs one way to ask any of them to make a sound. A <em>trait</em> is a written promise that a type has certain methods, and a <em>generic</em> is code that works for any type that keeps a promise. This chapter writes both, then uses traits to print your own types with <code>{}</code>, run code when a value goes away, and turn one error into another for <code>?</code>. It ends with a <code>struct</code> that holds any type, built the way <code>Option</code> is.`,
  toolbox:`In this chapter: <code>trait</code>, <code>impl Trait for Type</code>, default methods, <code>&lt;T: Trait&gt;</code> and <code>impl Trait</code> parameters, <code>where</code>, <code>fmt::Display</code>, <code>Drop</code>, <code>From</code> with <code>?</code>, a generic <code>struct</code>, and the errors <code>E0599</code>, <code>E0308</code>, <code>E0369</code>, <code>E0277</code> and <code>E0407</code>.`,
  learned:['trait','default method','trait bound','E0369 on a type parameter','impl Trait','Display','Drop','From and ?','generic struct'],
  missions:[
    {
      title:'Give a type a trait',kind:'fix',
      goal:`This program declares a <code>trait</code> named <code>Cry</code> and a <code>Crab</code>, but the hidden <code>main</code> asks the crab for its <code>sound</code> and stops with <code>E0599</code>. Write the <code>impl</code> block that gives <code>Crab</code> the trait, so the program prints <code>Pip: click</code>.`,
      how:[
        `The whole program declares a <em>trait</em>, builds a crab called <code>Pip</code>, and asks it for a <code>sound</code>. A trait is a list of abilities: <code>trait Cry { fn sound(&self) -> String; }</code> says that anything with the <code>Cry</code> promise has a method <code>sound</code> that reads itself and gives back a <code>String</code>. The method ends in <code>;</code> instead of a body, because each type writes its own.`,
        `A type keeps the promise with an <code>impl</code> block that names both the trait and the type: <code>impl Cry for Crab { ... }</code>. The <code>impl Crab</code> of chapter 6 added methods to one type; <code>impl Cry for Crab</code> adds the methods of a trait, and Rust makes you write every one the trait lists, with the same signature.`,
        `The error <code>E0599</code> says <code>Crab</code> has no method <code>sound</code>. The trait exists, but the crab never promised it, so nothing connects them yet.`,
        `Give the crab the sound <code>click</code>. The hidden <code>main</code> also builds crabs with other names, so only the sound belongs in your code.`
      ],
      explain:`A trait is written once and kept once per type. Two types can keep the same promise in different ways, which is what lets code ask for the promise and not for one type. A type has a method from a trait only after it writes an <code>impl</code> for it: a plain <code>impl Crab</code> with a <code>sound</code> method would also run, but it would not make the crab a <code>Cry</code>, and the next missions need that.`,
      hint:`Write <code>impl Cry for Crab {</code>, and inside it <code>fn sound(&self) -> String</code> with the body <code>String::from("click")</code>.`,
      harness:J('',MAIN('let c = Crab { name: String::from("Pip") };','println!("{}: {}", c.name, c.sound());')),
      starter:J(CRY,CRAB),
      starterErr:'E0599',
      answer:J(CRY,CRAB,IMPL('Crab','String::from("click")')),
      alts:[J(CRY,CRAB,IMPL('Crab','"click".to_string()')),J(CRY,CRAB,IMPL('Crab','format!("click")'))],
      wrong:[
        {src:J(CRY,CRAB,IMPL('Crab','String::from("clack")')),wrongWhy:'check'},
        {src:J(CRY,CRAB,'impl Cry for Crab {','}'),wrongWhy:'E0046'},
        {src:J(CRY,CRAB,L('struct Gull;'),L('impl Cry for Gull {','    fn sound(&self) -> String {','        String::from("click")','    }','}')),wrongWhy:'E0599'}
      ],
      lazy:[
        {src:J(CRY,CRAB,L('impl Crab {','    fn sound(&self) -> String {','        String::from("click")','    }','}')),wrongWhy:'check'},
        {src:J(CRY,CRAB,IMPL('Crab','self.name.clone()')),wrongWhy:'check'}
      ],
      defines:['trait-decl','trait-impl'],previews:[],
      check:c=>{
        if(c.out()!=='Pip: click\n')return 'The program has to print `Pip: click`.';
        if(!c.implOf('Cry','Crab'))return 'Give `Crab` the trait with `<code>impl</code> Cry for Crab`. A plain `<code>impl</code> Crab` adds a method but does not make the crab a `Cry`.';
        return OTHER(c,'Zed: click\n','The name comes from the crab, so another name has to show up in the output.',['"Pip"','"Zed"']);
      }
    },
    {
      title:'One function for many types',kind:'fix',
      goal:`This program has a crab and a gull that both keep the <code>Cry</code> promise, but <code>announce</code> takes only a <code>Crab</code>, so the call with the gull stops with <code>E0308</code>. Change the first line of <code>announce</code> so that it accepts any type with the <code>Cry</code> trait. The hidden <code>main</code> should print <code>Pip clicks</code> and then <code>Gus squawks</code>.`,
      how:[
        `The whole program has two creatures and one function that prints what a creature says. Right now the function's parameter is <code>&Crab</code>, so only a crab fits, and the call with the gull is <code>E0308</code>, mismatched types.`,
        `A <em>generic</em> function stands for any type. You declare a type name in angle brackets after the function name, <code>announce&lt;T&gt;</code>, and then write <code>T</code> wherever a type goes: <code>x: &T</code>.`,
        `Plain <code>T</code> could be anything, and the body calls <code>x.sound()</code>, which only some types have. A <em>bound</em> narrows <code>T</code>: <code>T: Cry</code> reads "any type <code>T</code> that has the <code>Cry</code> trait". Inside the body, <code>sound</code> is allowed because the bound promises it.`,
        `A call checks the bound for you: <code>announce(&c)</code> works because <code>Crab</code> has an <code>impl Cry</code>, and a type without one would be refused.`
      ],
      explain:`The angle brackets declare the type name; the bound after the colon is what the body may rely on. Rust checks the body once against the bound, then builds the function for each type it is called with, so a generic function costs nothing extra when it runs. <code>T</code> is only a habit: <code>U</code> or <code>Animal</code> work the same way.`,
      hint:`Change the first line to <code>fn announce&lt;T: Cry&gt;(x: &T) {</code> and leave the body alone.`,
      harness:PAIR_MAIN('announce'),
      starter:J(CRY,CRAB,GULL,CLICKS,SQUAWKS,ANNOUNCE('fn announce(x: &Crab)')),
      starterErr:'E0308',
      answer:J(CRY,CRAB,GULL,CLICKS,SQUAWKS,ANNOUNCE('fn announce<T: Cry>(x: &T)')),
      alts:[J(CRY,CRAB,GULL,CLICKS,SQUAWKS,ANNOUNCE('fn announce<U: Cry>(x: &U)')),J(CRY,CRAB,GULL,CLICKS,SQUAWKS,L('fn announce<T>(x: &T)','where','    T: Cry,','{','    println!("{}", x.sound());','}'))],
      wrong:[
        {src:J(CRY,CRAB,GULL,CLICKS,SQUAWKS,ANNOUNCE('fn announce<T>(x: &T)')),wrongWhy:'E0599'},
        {src:J(CRY,CRAB,GULL,CLICKS,SQUAWKS,FN('fn announce<T: Cry>(x: &T)','println!("Pip clicks");')),wrongWhy:'check'}
      ],
      lazy:[
        {src:J(CRY,CRAB,GULL,CLICKS,SQUAWKS,FN('fn announce<T: Cry>(x: &T)','let s = x.sound();')),wrongWhy:'check'}
      ],
      defines:['generic-decl'],previews:[],
      check:c=>{
        if(c.out()!=='Pip clicks\nGus squawks\n')return 'The program has to print `Pip clicks` and then `Gus squawks`.';
        if(!BOUND(c.genericOf('announce'),'Cry'))return 'Declare a type name after `announce`, like `<T: Cry>`, and write it as the parameter type, `&T`.';
        return OTHER(c,'Rex clicks\nIvy squawks\n','`announce` has to print what each creature says, with its own name.',['"Pip"','"Rex"'],['"Gus"','"Ivy"']);
      }
    },
    {
      title:'A default method to share',kind:'fix',
      goal:`Every creature should be able to introduce itself: <code>Pip says clicks</code>. This program calls <code>intro</code> on each one, but the trait does not list it, so it stops with <code>E0599</code>. Add <code>intro</code> to the trait, with a body that uses <code>name</code> and <code>sound</code>, and leave both impls as they are. The hidden <code>main</code> should print <code>Pip says click</code> and <code>Gus says squawk</code>.`,
      how:[
        `The whole program has two creatures, each with a <code>name</code> and a <code>sound</code>, and a function <code>meet</code> that asks any <code>Cry</code> to introduce itself. <code>E0599</code> says the trait has no <code>intro</code> to call.`,
        `A trait method may have a body. That is a <em>default method</em>: every type with the trait gets it for free, and an <code>impl</code> may write its own to replace it. Inside the body, <code>self</code> can call the trait's other methods, because any type with the trait has them.`,
        `Put <code>intro</code> in the <code>trait</code>, built with <code>format!</code> from <code>self.name()</code> and <code>self.sound()</code>. The two impls stay as they are.`,
        `Writing <code>intro</code> in an <code>impl</code> instead does not help: an <code>impl</code> may hold only the methods its trait lists, and <code>E0407</code> says so when it holds more.`
      ],
      explain:`Required methods are what a type must supply; default methods are what the trait builds on top of them. A default method written once serves every type, today's and tomorrow's, and the <code>impl</code> of a type that wants a different <code>intro</code> only has to write that one method.`,
      hint:`Inside the <code>trait</code>, below <code>sound</code>, write <code>fn intro(&self) -> String</code> with a body in braces: <code>format!("{} says {}", self.name(), self.sound())</code>.`,
      harness:MEET,
      starter:J(CRY2,CRAB,GULL,IMPL2('Crab','click'),IMPL2('Gull','squawk')),
      starterErr:'E0599',
      answer:J(CRY_INTRO,CRAB,GULL,IMPL2('Crab','click'),IMPL2('Gull','squawk')),
      alts:[J(L('trait Cry {','    fn name(&self) -> String;','    fn sound(&self) -> String;','    fn intro(&self) -> String {','        let n = self.name();','        let s = self.sound();','        format!("{} says {}", n, s)','    }','}'),CRAB,GULL,IMPL2('Crab','click'),IMPL2('Gull','squawk'))],
      wrong:[
        {src:J(L('trait Cry {','    fn name(&self) -> String;','    fn sound(&self) -> String;','    fn intro(&self) -> String {','        format!("{} says {}", self.title(), self.sound())','    }','}'),CRAB,GULL,IMPL2('Crab','click'),IMPL2('Gull','squawk')),wrongWhy:'E0599'},
        {src:J(L('trait Cry {','    fn name(&self) -> String;','    fn sound(&self) -> String;','    fn intro(&self) -> String {','        format!("{} says click", self.name())','    }','}'),CRAB,GULL,IMPL2('Crab','click'),IMPL2('Gull','squawk')),wrongWhy:'check'}
      ],
      lazy:[
        {src:J(CRY2,CRAB,GULL,IMPL2('Crab','click'),IMPL2('Gull','squawk'),L('impl Crab {','    fn intro(&self) -> String {','        String::from("Pip says click")','    }','}')),wrongWhy:'E0599'}
      ],
      defines:[],previews:[],
      check:c=>{
        if(c.out()!=='Pip says click\nGus says squawk\n')return 'The program has to print `Pip says click` and then `Gus says squawk`.';
        const t=c.traitOf('Cry');
        if(!t||!t.methods.some(m=>m.name==='intro'&&m.body))return 'Write `intro` inside the `trait`, with a body, so every creature gets it.';
        if(['Crab','Gull'].some(ty=>c.implOf('Cry',ty).methods.includes('intro')))return 'Leave the impls as they were: the default method in the trait does the work for both.';
        return OTHER(c,'Rex says click\nIvy says squawk\n','`intro` has to use each creature\'s own name and sound.',['"Pip"','"Rex"'],['"Gus"','"Ivy"']);
      }
    },
    {
      title:'The bound opens the body',kind:'fix',
      goal:`<code>larger</code> should give back the bigger of two values of any type, but it stops with <code>E0369</code> at <code>a > b</code>. Change the first line of <code>larger</code> so the body is allowed to compare them. The hidden <code>main</code> should print <code>9</code>, <code>2.5</code> and <code>z</code>.`,
      how:[
        `The whole function takes two values of one type <code>T</code> and gives back the bigger. It is written once, so it has to work for whole numbers, decimals and letters alike.`,
        `Inside a generic function, <code>T</code> is known only by its bounds, and Rust lets the body use only what they promise. A plain <code>T</code> promises nothing, not even that two of them can be compared. That is why <code>E0369</code> names the type <code>T</code> and not a number type: it is complaining about the signature's promise, not about a value.`,
        `Comparing with <code>></code> is a promise too. It is called <code>PartialOrd</code>, "can be put in order, when they can be compared at all". Add it as the bound: <code>T: PartialOrd</code>.`,
        `A decimal number like <code>2.5</code> has <code>PartialOrd</code> but not <code>Ord</code>, because the special value <code>NaN</code> is neither bigger nor smaller than anything. That is why the bound is the partial one, and why all three calls in <code>main</code> work.`
      ],
      explain:`Each bound is a key. <code>PartialOrd</code> opens <code>&lt;</code> and <code>&gt;</code>, <code>PartialEq</code> opens <code>==</code>, <code>Clone</code> opens <code>.clone()</code>, and your own traits open their methods. A bound can also be written after the parameter list in a <code>where</code> clause, <code>where T: PartialOrd</code>, which reads better when there are several.`,
      hint:`Write <code>fn larger&lt;T: PartialOrd&gt;(a: T, b: T) -> T</code> and leave the body alone.`,
      harness:LARGER_MAIN,
      starter:LARGER('<T>(a: T, b: T) -> T'),
      starterErr:'E0369',
      answer:LARGER('<T: PartialOrd>(a: T, b: T) -> T'),
      alts:[LARGER('<T>(a: T, b: T) -> T where T: PartialOrd'),LARGER('<T: std::cmp::PartialOrd>(a: T, b: T) -> T')],
      wrong:[
        {src:LARGER('<T: PartialEq>(a: T, b: T) -> T'),wrongWhy:'E0369'},
        {src:LARGER('<T: Clone>(a: T, b: T) -> T'),wrongWhy:'E0369'},
        {src:FN('fn larger<T: PartialOrd>(a: T, b: T) -> T','if a < b {','    a','} else {','    b','}'),wrongWhy:'check'}
      ],
      lazy:[
        {src:FN('fn larger<T: PartialOrd>(a: T, b: T) -> T','a'),wrongWhy:'check'}
      ],
      defines:[],previews:[],
      check:c=>{
        if(c.out()!=='9\n2.5\nz\n')return 'The program has to print `9`, `2.5` and `z`: the bigger of each pair.';
        if(!BOUND(c.genericOf('larger'),'PartialOrd'))return 'Give `larger` a type name with the bound `PartialOrd`, like `<T: PartialOrd>`.';
        return OTHER(c,'40\n7.5\nq\n','`larger` has to give back the bigger of the two values, whatever they are.',['larger(3, 9)','larger(40, 12)'],['larger(2.5, 1.5)','larger(7.5, 1.5)'],["larger('a', 'z')","larger('q', 'a')"]);
      }
    },
    {
      title:'Say it with impl Trait',kind:'write',
      goal:`<code>announce</code> works, but its first line is long for what it says. Rewrite the first line so the parameter is written <code>&impl Cry</code> and there is no <code>&lt;T: Cry&gt;</code> list after the name. The hidden <code>main</code> should still print <code>Pip clicks</code>.`,
      how:[
        `The whole function prints what a creature says, for any creature with the <code>Cry</code> trait. It already does that with <code>&lt;T: Cry&gt;(x: &T)</code>: a type name, a bound, and the name used once in the parameter.`,
        `When the type name is used only once, in a parameter, Rust lets you skip the list: <code>x: &impl Cry</code> means "a reference to some type that has <code>Cry</code>". It is the same bound, written where the type goes.`,
        `Use the longer form when the same type must appear twice, as in <code>fn larger&lt;T: PartialOrd&gt;(a: T, b: T)</code>, where both values have to be the same type. <code>a: impl PartialOrd, b: impl PartialOrd</code> would let a caller pass two different types.`,
        `Keep the <code>&</code>: a bare <code>impl Cry</code> wants the creature itself, and the call passes a reference to it.`
      ],
      explain:`<code>impl Trait</code> in a parameter is shorthand for a generic with one bound. The caller sees no difference, and the body can do exactly what the trait allows, no more. Shorthand and long form can be mixed in one signature.`,
      hint:`Write <code>fn announce(x: &impl Cry) {</code> and leave the body alone.`,
      harness:J('',MAIN('let c = Crab { name: String::from("Pip") };','announce(&c);')),
      starter:J(CRY,CRAB,CLICKS,ANNOUNCE('fn announce<T: Cry>(x: &T)')),
      answer:J(CRY,CRAB,CLICKS,ANNOUNCE('fn announce(x: &impl Cry)')),
      alts:[J(CRY,CRAB,CLICKS,FN('fn announce(x: &impl Cry)','let said = x.sound();','println!("{}", said);'))],
      wrong:[
        {src:J(CRY,CRAB,CLICKS,ANNOUNCE('fn announce(x: impl Cry)')),wrongWhy:'E0277'},
        {src:J(CRY,CRAB,CLICKS,FN('fn announce(x: &impl Cry)','println!("Pip clicks");')),wrongWhy:'check'}
      ],
      lazy:[
        {src:J(CRY,CRAB,CLICKS,ANNOUNCE('fn announce(x: &Crab)')),wrongWhy:'check'}
      ],
      defines:[],previews:[],
      check:c=>{
        if(c.out()!=='Pip clicks\n')return 'The program has to print `Pip clicks`.';
        const g=c.genericOf('announce');
        if(!g||g.tparams.length||!g.impl[0]||!g.impl[0].includes('Cry'))return 'Write the parameter as `x: &<code>impl</code> Cry` and remove the angle-bracket list after `announce`.';
        return OTHER(c,'Rex clicks\n','`announce` has to print what the creature says, with its own name.',['"Pip"','"Rex"']);
      }
    },
    {
      title:'Teach a type to print with {}',kind:'fix',
      goal:`<code>{}</code> prints a <code>Shell</code>? Not yet: this program stops with <code>E0277</code>, because the compiler does not know how to show a <code>Shell</code>. Write the <code>impl</code> that teaches it, so the program prints <code>shell:4</code> and then <code>shell:12</code>.`,
      how:[
        `The whole program prints two shells with <code>{}</code>. For a number or a string Rust knows how. For your own <code>struct</code> it does not, and <code>E0277</code> says <code>Shell</code> does not implement <code>Display</code>, the trait behind <code>{}</code>.`,
        `You met a trait before without the name: <code>#[derive(Debug)]</code> asks the compiler to write the <code>Debug</code> <code>impl</code> for you, with one fixed layout, and <code>{:?}</code> uses it. Plain <code>{}</code> has no fixed layout, because a shell could print as <code>shell:4</code> or as a picture, so nothing can be derived. You write <code>Display</code> by hand.`,
        `The <code>impl</code> names the trait with its module, <code>impl fmt::Display for Shell</code> (the <code>use std::fmt;</code> line at the top brings in <code>fmt</code>), and has one method: <code>fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result</code>.`,
        `Inside, <code>write!(f, "shell:{}", self.size)</code> works like <code>println!</code>, but it writes into <code>f</code> and gives back the <code>fmt::Result</code> that <code>fmt</code> returns. End the method with it, without a <code>;</code>.`
      ],
      explain:`Display is what <code>{}</code> calls, and <code>to_string()</code> comes with it for free. Whatever <code>write!</code> puts into <code>f</code> is the text, so the same <code>impl</code> serves <code>println!</code>, <code>format!</code> and <code>to_string()</code>. Derive covers the traits with one obvious layout; the ones about meaning, like how to show a value, are yours to write.`,
      hint:`Write <code>impl fmt::Display for Shell {</code>, then <code>fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {</code>, and in it <code>write!(f, "shell:{}", self.size)</code>.`,
      harness:SHOW,
      starter:J(L('use std::fmt;'),SHELL),
      starterErr:'E0277',
      answer:J(L('use std::fmt;'),SHELL,FMT('write!(f, "shell:{}", self.size)')),
      alts:[J(L('use std::fmt;'),SHELL,FMT('write!(f, "shell:")?;','write!(f, "{}", self.size)'))],
      wrong:[
        {src:J(L('use std::fmt;'),SHELL,FMT('write!(f, "shell:4")')),wrongWhy:'check'},
        {src:J(L('use std::fmt;'),SHELL,L('impl fmt::Display for Shell {','    fn fmt(&self, f: &mut fmt::Formatter) -> String {','        String::from("shell")','    }','}')),wrongWhy:'E0053'},
        {src:J(L('use std::fmt;'),SHELL,L('impl fmt::Display for Shell {','}')),wrongWhy:'E0046'}
      ],
      lazy:[
        {src:J(L('use std::fmt;'),SHELL,FMT('write!(f, "{}", self.size)')),wrongWhy:'check'}
      ],
      defines:[],previews:[],
      check:c=>{
        if(c.out()!=='shell:4\nshell:12\n')return 'The program has to print `shell:4` and then `shell:12`.';
        if(!c.implOf('Display','Shell'))return 'Teach `Shell` to print with `<code>impl</code> fmt::Display for Shell`.';
        return OTHER(c,'shell:7\nshell:30\n','The size comes from the shell, so other shells have to print their own size.',['size: 4','size: 7'],['size: 12','size: 30']);
      }
    },
    {
      title:'Run code when a value goes',kind:'write',
      goal:`A <code>Guard</code> should say <code>closing</code> and its name at the moment it is dropped. Write the <code>impl Drop for Guard</code> that does it. The hidden <code>main</code> should print <code>in the block</code>, <code>closing inner</code>, <code>after the block</code> and <code>closing outer</code>, in that order.`,
      how:[
        `The whole program makes a guard called <code>outer</code>, then a block with a guard called <code>inner</code>, and prints a line from inside and one after the block. Chapter 4 showed that a value is freed where its block ends, the newest first. <code>Drop</code> is the trait that lets a type run code at that moment.`,
        `The <code>impl</code> has one method: <code>fn drop(&mut self)</code>. It takes <code>&mut self</code>, because the value is still whole while the method runs, and it returns nothing. Rust calls it for you at the closing <code>}</code>, once per value, in the same order as before.`,
        `Print the guard's name inside it, with <code>println!("closing {}", self.name);</code>. The body may do anything a method may: print, call other functions, make local variables.`,
        `You never call <code>drop</code> yourself on the value with <code>guard.drop()</code>: that is <code>E0040</code>, because Rust would run it a second time at the end. The function <code>drop(guard)</code> from chapter 4 is how you end a value early.`
      ],
      explain:`The order is the lesson: <code>inner</code> closes at the end of its block, before the line that follows, and <code>outer</code> closes last, when <code>main</code> ends. A <code>struct</code>'s own <code>drop</code> runs first, then its fields are dropped. That makes <code>Drop</code> the right place to release something a value holds, such as a file or a lock.`,
      hint:`Write <code>impl Drop for Guard {</code>, then <code>fn drop(&mut self) {</code> and the line <code>println!("closing {}", self.name);</code>.`,
      harness:GUARD_MAIN,
      starter:GUARD,
      answer:J(GUARD,DROP('println!("closing {}", self.name);')),
      alts:[J(GUARD,DROP('let name = self.name.clone();','println!("closing {}", name);'))],
      wrong:[
        {src:J(GUARD,DROP('println!("closing");')),wrongWhy:'check'},
        {src:J(GUARD,'impl Drop for Guard {','}'),wrongWhy:'E0046'}
      ],
      lazy:[
        {src:J(GUARD,DROP('println!("closing outer");')),wrongWhy:'check'}
      ],
      defines:[],previews:[],
      check:c=>{
        if(c.out()!==GUARD_OUT)return 'The program has to print `in the block`, `closing inner`, `after the block` and `closing outer`.';
        if(!c.implOf('Drop','Guard'))return 'Write `<code>impl</code> Drop for Guard`, with a `drop` method, so Rust runs it when a guard goes.';
        return OTHER(c,'in the block\nclosing wave\nafter the block\nclosing reef\n','The guard\'s own name has to be printed, so other names show up.',['"outer"','"reef"'],['"inner"','"wave"']);
      }
    },
    {
      title:'Turn one error into another',kind:'fix',
      goal:`<code>plan</code> returns a <code>TideError</code>, but <code>check</code> fails with a plain <code>i32</code>, so the <code>?</code> stops with <code>E0277</code>. Teach Rust to turn an <code>i32</code> into a <code>TideError</code> with an <code>impl From</code>, and change nothing else. The hidden <code>main</code> should print <code>Ok(10)</code> and then <code>Err(TooLow(-3))</code>.`,
      how:[
        `The whole program asks <code>check</code> for a depth, passes a failure up with <code>?</code>, and doubles a good depth. The failure of <code>check</code> is an <code>i32</code>, but <code>plan</code> promises a <code>TideError</code>, so the <code>?</code> has nothing to hand the caller. That is <code>E0277</code>: <code>?</code> could not convert the error.`,
        `Chapter 9's <code>?</code> needed the same error type on both sides. It really does more: it passes the error through <code>From::from</code>, the trait that says how to build one type out of another. When an <code>impl From</code> exists, <code>?</code> converts for you.`,
        `The <code>impl</code> names the source in angle brackets and the target after <code>for</code>: <code>impl From&lt;i32&gt; for TideError</code>. Its one method, <code>fn from(n: i32) -> TideError</code>, builds the variant: <code>TideError::TooLow(n)</code>.`,
        `Do not change <code>plan</code>: the <code>?</code> stays. Once the <code>impl</code> exists, <code>TideError::from(7)</code> and <code>7.into()</code> work too, which is why one <code>impl</code> is enough.`
      ],
      explain:`<code>From</code> is the trait for "build this from that", and <code>?</code> calls it on the error, so a function can mix several errors under one type of its own. You can have several <code>From</code> impls for one error type, one per source type. Without a matching one, the compiler stops at the <code>?</code> and names both types.`,
      hint:`Add <code>impl From&lt;i32&gt; for TideError {</code> with <code>fn from(n: i32) -> TideError</code> that returns <code>TideError::TooLow(n)</code>.`,
      harness:PLAN_MAIN,
      starter:J(TIDE,CHECK,PLAN),
      starterErr:'E0277',
      answer:J(TIDE,CHECK,PLAN,FROM('i32','TideError::TooLow(n)')),
      alts:[J(TIDE,FROM('i32','TideError::TooLow(n)'),CHECK,PLAN),J(TIDE,CHECK,PLAN,L('impl From<i32> for TideError {','    fn from(n: i32) -> Self {','        TideError::TooLow(n)','    }','}'))],
      wrong:[
        {src:J(TIDE,CHECK,PLAN,FROM('String','TideError::TooLow(0)')),wrongWhy:'E0277'},
        {src:J(TIDE,CHECK,PLAN,FROM('i32','TideError::TooLow(0)')),wrongWhy:'check'}
      ],
      lazy:[
        {src:J(TIDE,CHECK,FN('fn plan(depth: i32) -> Result<i32, i32>','let d = check(depth)?;','Ok(d * 2)')),wrongWhy:'check'}
      ],
      defines:[],previews:[],
      check:c=>{
        if(c.out()!=='Ok(10)\nErr(TooLow(-3))\n')return 'The program has to print `Ok(10)` and then `Err(TooLow(-3))`.';
        if(!c.implOf('From','TideError'))return 'Write `<code>impl</code> From<i32> for TideError` so `?` knows how to convert the error.';
        if(!c.tryOn('plan','check'))return 'Keep the `?` on `check(depth)` in `plan`: the `From` impl is what makes it work.';
        return OTHER(c,'Ok(10)\nErr(TooLow(-8))\n','The error has to carry the depth that failed.',['plan(-3)','plan(-8)']);
      }
    },
    {
      title:'A struct that holds any type',kind:'fix',
      goal:`A <code>Crate</code> holds one item, and this one holds only an <code>i32</code>, so the crate with a <code>String</code> in it stops with <code>E0308</code>. Make <code>Crate</code> hold any type, in the <code>struct</code> and in the <code>impl</code>. The hidden <code>main</code> should print <code>3</code> and then <code>shell</code>.`,
      how:[
        `The whole program makes a crate with a number, a crate with a word, and opens both. A <code>struct</code> can take a type name the way a function can: <code>struct Crate&lt;T&gt; { item: T }</code>. The <code>&lt;T&gt;</code> says <code>T</code> stands for any type, and the field uses it.`,
        `That is how <code>Option&lt;T&gt;</code> from chapter 7 is made: <code>Option</code> is an <code>enum</code> with a <code>T</code> in its <code>Some</code>. Your own types can have a <code>T</code> too, one or several, like <code>Pair&lt;T, U&gt;</code>.`,
        `The <code>impl</code> repeats the name, because the methods are written for every <code>T</code>: <code>impl&lt;T&gt; Crate&lt;T&gt;</code>. The first <code>&lt;T&gt;</code> declares it, the second uses it. The method then returns <code>&T</code>, a reference to whatever the crate holds.`,
        `Each crate in <code>main</code> picks its own <code>T</code> from what you put in: <code>Crate { item: 3 }</code> is a <code>Crate&lt;i32&gt;</code>, and the word makes the other a <code>Crate&lt;String&gt;</code>. A <code>T</code> that is never used in a field is <code>E0392</code>.`
      ],
      explain:`Generics work the same for types as for functions: declare the name once in angle brackets, use it where a type goes. A <code>Crate&lt;i32&gt;</code> and a <code>Crate&lt;String&gt;</code> are different types, and Rust checks each use. You can still narrow an <code>impl</code>: <code>impl Crate&lt;i32&gt;</code> would give methods to number crates only, and a bound like <code>impl&lt;T: Display&gt; Crate&lt;T&gt;</code> only to crates whose item can be shown.`,
      hint:`Write <code>struct Crate&lt;T&gt;</code> with <code>item: T</code>, then <code>impl&lt;T&gt; Crate&lt;T&gt;</code> with <code>fn open(&self) -> &T</code>.`,
      harness:CRATE_MAIN,
      starter:J(L('struct Crate {','    item: i32,','}'),L('impl Crate {','    fn open(&self) -> &i32 {','        &self.item','    }','}')),
      starterErr:'E0308',
      answer:J(L('struct Crate<T> {','    item: T,','}'),L('impl<T> Crate<T> {','    fn open(&self) -> &T {','        &self.item','    }','}')),
      alts:[J(L('struct Crate<Item> {','    item: Item,','}'),L('impl<Item> Crate<Item> {','    fn open(&self) -> &Item {','        &self.item','    }','}'))],
      wrong:[
        {src:J(L('struct Crate<T> {','    item: T,','}'),L('impl Crate<i32> {','    fn open(&self) -> &i32 {','        &self.item','    }','}')),wrongWhy:'E0599'},
        {src:J(L('struct Crate<T> {','    item: T,','}'),L('impl<T> Crate<T> {','    fn open(&self) -> &i32 {','        &self.item','    }','}')),wrongWhy:'E0308'}
      ],
      lazy:[
        {src:J(L('struct Crate {','    item: String,','}'),L('impl Crate {','    fn open(&self) -> &String {','        &self.item','    }','}')),wrongWhy:'E0308'}
      ],
      defines:[],previews:[],
      check:c=>{
        if(c.out()!=='3\nshell\n')return 'The program has to print `3` and then `shell`.';
        const p=c.adtParams('Crate');
        if(!p||!p.length)return 'Declare a type name on the struct, `<code>struct</code> Crate<T>`, and use it for the field.';
        return OTHER(c,'40\nreef\n','The crates have to hold what `main` puts in them.',['item: 3','item: 40'],['"shell"','"reef"']);
      }
    }
  ]
});
})();
