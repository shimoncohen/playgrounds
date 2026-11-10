/* Append only: a mission's key is '8.<index>' and shipped keys are never renumbered. DOM-free. */
(()=>{
'use strict';
const RQ=globalThis.RQ=globalThis.RQ||{};
const L=(...lines)=>lines.join('\n')+'\n';
const SPLIT=L('fn split(shells: u32) -> Result<u32, String> {','    if shells % 2 == 0 {','        Ok(shells / 2)','    } else {','        Err(format!("{} shells will not split", shells))','    }','}');
const SPLIT_FN=(...body)=>L('fn split(shells: u32) -> Result<u32, String> {',...body.map(l=>'    '+l),'}');
const MAIN=(...body)=>L('fn main() {',...body.map(l=>'    '+l),'}');
const OK_ERR=n=>['match split('+n+') {','    Ok(half) => println!("ok {}", half),','    Err(_) => println!("err"),','}'];
const M0_MAIN=L('')+MAIN(...[8,7,0,100,9].flatMap(OK_ERR));
const M0_OUT='ok 4\nerr\nok 0\nok 50\nerr\n';
const REPORT=(...body)=>L(SPLIT,'fn report(shells: u32) {',...body.map(l=>'    '+l),'}');
const M1_MAIN=L('')+MAIN('report(8);','report(7);','report(0);');
const M1_OUT='each kid gets 4\ncannot split: 7 shells will not split\neach kid gets 0\n';
const M1_MATCH=['match split(shells) {','    Ok(half) => println!("each kid gets {}", half),','    Err(reason) => println!("cannot split: {}", reason),','}'];
const TOTAL=(...body)=>L(SPLIT,'fn total(a: u32, b: u32) -> Result<u32, String> {',...body.map(l=>'    '+l),'}');
const M3_MAIN=L('')+MAIN('println!("{:?}", total(8, 6));','println!("{:?}", total(7, 6));','println!("{:?}", total(8, 5));','println!("{:?}", total(7, 5));','println!("{:?}", total(0, 0));');
const M3_OUT='Ok(7)\nErr("7 shells will not split")\nErr("5 shells will not split")\nErr("7 shells will not split")\nOk(0)\n';
const HALF_OF=(...body)=>L(SPLIT,'fn half_of(shells: u32) -> Result<u32, String> {',...body.map(l=>'    '+l),'}');
const M4_MAIN=L('')+MAIN('half_of(8).unwrap();','half_of(20).unwrap();');
const M4_OUT='Ok(4)\ngave 4\nOk(10)\ngave 10\n';
const FIRST=src=>SPLIT+src;
const M5_MAIN=L('')+MAIN('println!("{:?}", first_half(8));','println!("{:?}", first_half(7));');
const M5_OUT='Ok(4)\nErr("7 shells will not split")\n';
const ENUM=L('#[derive(Debug)]','enum ShareError {','    Odd(u32),','    Empty,','}');
const SPLIT_E=(...body)=>L(ENUM,'fn split(shells: u32) -> Result<u32, ShareError> {',...body.map(l=>'    '+l),'}');
const M6_MAIN=L('')+MAIN('println!("{:?}", split(8));','println!("{:?}", split(7));','println!("{:?}", split(0));');
const M6_OUT='Ok(4)\nErr(Odd(7))\nErr(Empty)\n';
const SHELL_AT=(...body)=>L('fn shell_at(bucket: &Vec<u32>, i: usize) -> Result<u32, String> {',...body.map(l=>'    '+l),'}');
const M7_MAIN=L('')+MAIN('let bucket = vec![4, 8, 15];','println!("{:?}", shell_at(&bucket, 1));','println!("{:?}", shell_at(&bucket, 2));','println!("{:?}", shell_at(&bucket, 7));');
const M7_OUT='Ok(8)\nOk(15)\nErr("no shell at 7")\n';
const ODD=L('#[derive(Debug)]','enum ShareError {','    Odd(u32),','}','','fn split(shells: u32) -> Result<u32, ShareError> {','    if shells % 2 == 1 {','        Err(ShareError::Odd(shells))','    } else {','        Ok(shells / 2)','    }','}','');
// runs the learner's program on other input and wants what real code gives, so a typed-in answer fails; null means the input text was changed
const OTHER=RQ.other('numbers');

RQ.CH.push({
  name:'Errors with Result',
  badge:'Sharing Stone',
  story:'Gus wants half of the tally, and some counts will not split; say when a step fails and pass the reason on, and find the sharing stone.',
  intro:'Gus wants half of the tally, and some counts will not split. Some steps can fail: a shell count that will not split between Pip and Gus, a bucket with no shell at that place. Rust has no hidden exceptions. It writes it in the type: a function that can fail gives back a <code>Result</code>, which is either <code>Ok</code> with the value or <code>Err</code> with the reason. The compiler then makes you deal with both. This chapter reads a <code>Result</code> with <code>match</code>, stops on one with <code>expect</code>, passes an error up to the caller with <code>?</code>, and gives errors names of your own.',
  toolbox:'In this chapter: <code>Result&lt;T, E&gt;</code> with <code>Ok</code> and <code>Err</code>, <code>match</code> on a <code>Result</code>, <code>expect</code> and the panic it causes, the <code>?</code> operator, <code>ok_or</code>, an <code>enum</code> as the error type printed with <code>{:?}</code>, <code>main</code> that returns a <code>Result</code>, and the errors <code>E0382</code> and <code>E0277</code> around <code>?</code>. The error types here are all the same inside one function, and there are no closures.',
  learned:['Result','Ok and Err','match on Result','expect','?','? moves','E0277 for ?','error enum','ok_or','main -> Result'],
  missions:[
    {
      title:'A step that can fail',kind:'write',
      goal:'Write a function <code>split</code> that takes <code>shells: u32</code> and gives back a <code>Result&lt;u32, String&gt;</code>. Pip and Gus share the shells, so an even count gives <code>Ok</code> with half of it, and an odd count gives <code>Err</code> with a message of your own.',
      how:[
        'The whole function either hands back a good answer or says why it cannot. <code>Result&lt;u32, String&gt;</code> is the type for that: a value that is <code>Ok(number)</code> when the step worked, or <code>Err(message)</code> when it did not. It is an <code>enum</code> with two variants, like the <code>Option</code> you met with <code>Some</code> and <code>None</code>, but the second variant carries a reason.',
        'The first type in the angle brackets, <code>u32</code>, is what <code>Ok</code> holds, and the second, <code>String</code>, is what <code>Err</code> holds. The last expression of the function is the value it returns, so each branch of an <code>if</code> and <code>else</code> can end in one of them.',
        '<code>shells % 2 == 0</code> asks whether the count is even. Then <code>Ok(shells / 2)</code> wraps half of it, and the <code>else</code> branch builds the failure with <code>Err(String::from("..."))</code>.',
        'The hidden part of the program calls <code>split</code> five times and prints <code>ok</code> with the half, or <code>err</code>. It tries other counts than the ones in the card, so the answer has to be a rule, not a list.'
      ],
      explain:'<code>Result</code> is in the standard library, and <code>Ok</code> and <code>Err</code> are in scope without a <code>use</code>. A function that returns <code>Result</code> tells the caller, in its type, that it can fail, and the caller cannot use the number inside without first saying what happens on <code>Err</code>. The next mission shows how.',
      hint:'Write <code>if shells % 2 == 0 { Ok(shells / 2) } else { Err(String::from("odd count")) }</code> as the whole body.',
      harness:M0_MAIN,
      starter:SPLIT_FN('Ok(shells / 2)'),
      answer:SPLIT_FN('if shells % 2 == 0 {','    Ok(shells / 2)','} else {','    Err(String::from("odd number of shells"))','}'),
      alts:[SPLIT_FN('if shells % 2 == 1 {','    return Err(String::from("odd"));','}','Ok(shells / 2)'),SPLIT_FN('match shells % 2 {','    0 => Ok(shells / 2),','    _ => Err(String::from("odd")),','}')],
      wrong:[{src:SPLIT_FN('if shells % 2 == 1 {','    Ok(shells / 2)','} else {','    Err(String::from("odd"))','}'),wrongWhy:'check'},{src:SPLIT_FN('Err(String::from("odd"))'),wrongWhy:'check'}],
      lazy:[{src:SPLIT_FN('if shells == 7 || shells == 9 {','    Err(String::from("odd"))','} else {','    Ok(shells / 2)','}'),wrongWhy:'check'},{src:SPLIT_FN('if shells == 8 {','    Ok(4)','} else if shells == 0 {','    Ok(0)','} else if shells == 100 {','    Ok(50)','} else {','    Err(String::from("odd"))','}'),wrongWhy:'check'},{src:SPLIT_FN('Ok(shells / 2)'),wrongWhy:'check'}],
      defines:[],previews:[],
      check:c=>c.out()!==M0_OUT?'`split` has to give `Ok` with half the shells for an even count and `Err` for an odd count, so the program prints `ok 4`, `err`, `ok 0`, `ok 50` and `err`.':c.calls('Ok')<1||c.calls('Err')<1?'Build the answer with `Ok(...)` for a count that splits and `Err(...)` for one that does not.':OTHER(c,'ok 15\nerr\nok 3\nok 23\nerr\n','Your `split` only works for the counts in the card. Decide with the count itself, so it works for any count.',['split(8)','split(30)'],['split(7)','split(31)'],['split(0)','split(6)'],['split(100)','split(46)'],['split(9)','split(13)'])
    },
    {
      title:'Open a Result with match',kind:'write',
      goal:'The function <code>split</code> is written. In <code>report</code>, <code>match</code> on <code>split(shells)</code>: on <code>Ok</code> print <code>each kid gets</code> and the half, on <code>Err</code> print <code>cannot split:</code> and the reason.',
      how:[
        'The whole function asks <code>split</code> for an answer and then says something different for each kind of answer (<code>split</code> is written for you: its <code>format!("{} shells will not split", shells)</code> builds the error text as a <code>String</code>, with a <code>{}</code> hole like <code>println!</code> but nothing is printed). A <code>Result</code> is an <code>enum</code>, so <code>match</code> works on it as it did on <code>Option</code>, and it has to cover both variants.',
        '<code>Ok(half) =></code> is the arm for a good answer: the name <code>half</code> takes the number that was inside <code>Ok</code>. <code>Err(reason) =></code> is the arm for a failure: <code>reason</code> takes the <code>String</code> that was inside <code>Err</code>.',
        'Leave one arm out and the compiler stops with <code>E0004</code>, the same error as for a missing variant of your own <code>enum</code>. That is the point of a <code>Result</code>: the failure case cannot be forgotten.',
        'The hidden part of the program calls <code>report</code> with <code>8</code>, <code>7</code> and <code>0</code>. Each arm prints with <code>println!</code>, and <code>reason</code> goes into a <code>{}</code> hole.'
      ],
      explain:'<code>match</code> is the plain way to look inside a <code>Result</code>: nothing is hidden and each case gets its own code. When the failure is a bug that should never happen, a shorter tool exists, and the next mission shows it.',
      hint:'Write <code>match split(shells) {</code>, then the arm <code>Ok(half) => println!("each kid gets {}", half),</code> and the arm <code>Err(reason) => println!("cannot split: {}", reason),</code>.',
      harness:M1_MAIN,
      starter:REPORT(),
      answer:REPORT(...M1_MATCH),
      alts:[REPORT('let result = split(shells);','match result {','    Ok(half) => println!("each kid gets {}", half),','    Err(reason) => println!("cannot split: {}", reason),','}'),REPORT('match split(shells) {','    Err(reason) => {','        println!("cannot split: {}", reason);','    }','    Ok(half) => {','        println!("each kid gets {}", half);','    }','}')],
      wrong:[{src:REPORT('match split(shells) {','    Ok(half) => println!("cannot split: {}", half),','    Err(reason) => println!("each kid gets {}", reason),','}'),wrongWhy:'check'},{src:REPORT('if let Ok(half) = split(shells) {','    println!("each kid gets {}", half);','}'),wrongWhy:'check'}],
      lazy:[{src:REPORT('println!("each kid gets 4");'),wrongWhy:'check'},{src:REPORT('match split(shells) {','    Ok(_) => println!("each kid gets 4"),','    Err(_) => println!("cannot split: 7 shells will not split"),','}'),wrongWhy:'check'},{src:REPORT('match shells % 2 {','    0 => println!("each kid gets {}", shells / 2),','    _ => println!("cannot split: {} shells will not split", shells),','}'),wrongWhy:'check'}],
      defines:[],previews:[],
      check:c=>c.out()!==M1_OUT?'`report(8)` has to print `each kid gets 4`, `report(7)` has to print `cannot split:` and the reason from `split`, and `report(0)` has to print `each kid gets 0`.':c.count('match')<1||!c.callsIn('report','split')?'Call `split` inside `report` and open the `Result` it gives back with a `match`, with one arm for `Ok` and one for `Err`.':OTHER(c,'each kid gets 15\ncannot split: 9 shells will not split\neach kid gets 6\n','Your `report` only works for these counts. Print what `split` gives back, so it works for any count.',['report(8)','report(30)'],['report(7)','report(9)'],['report(0)','report(12)'])
    },
    {
      title:'Trust it with expect',kind:'write',expect:'panic',
      goal:'The function <code>split</code> is written. In <code>main</code>, call <code>split(7)</code> and take the half out with <code>expect("the shells must split")</code>, then print it. Seven shells cannot split, so watch the program stop with a panic.',
      how:[
        'The whole line says "I know this step works, and if it does not, stop the program". <code>split(7)</code> gives a <code>Result</code>, and <code>expect</code> opens it: on <code>Ok</code> it hands out the number inside, on <code>Err</code> it panics.',
        'A panic is the same stop as the one from the overflow in chapter 2: a message on the error output and the exit code <code>101</code>. The message is your text from <code>expect</code>, then a colon, then the <code>Err</code> printed with <code>{:?}</code>.',
        '<code>unwrap()</code> is <code>expect</code> without your own words, and its message starts with <code>called `Result::unwrap()` on an `Err` value</code>. <code>expect</code> is kinder to whoever reads the panic, because it says what you were counting on.',
        'Output printed before the panic stays. So <code>start</code> is printed first, then the panic stops <code>main</code> before the line that prints the half.'
      ],
      explain:'Use <code>expect</code> or <code>unwrap</code> when a failure means the program itself is wrong, like a count that was checked a moment ago, or in a quick test. When the failure is something the caller can handle, pass the error up, as the next missions do. A <code>panic!("...")</code> written by hand stops the program the same way, but it carries no <code>Err</code> value for anyone to look at.',
      hint:'In <code>main</code>, write <code>let half = split(7).expect("the shells must split");</code> and then <code>println!("each kid gets {}", half);</code>.',
      starter:SPLIT+MAIN('println!("start");'),
      answer:SPLIT+MAIN('println!("start");','let half = split(7).expect("the shells must split");','println!("each kid gets {}", half);'),
      alts:[SPLIT+MAIN('println!("start");','println!("each kid gets {}", split(9).expect("an even count"));'),SPLIT+MAIN('println!("start");','let half = split(5).expect("these shells have to split");','println!("{}", half);')],
      wrong:[{src:SPLIT+MAIN('println!("start");','let half = split(8).expect("the shells must split");','println!("each kid gets {}", half);'),wrongWhy:'check'},{src:SPLIT+MAIN('println!("start");','let half = split(7).unwrap();','println!("each kid gets {}", half);'),wrongWhy:'check'}],
      lazy:[{src:SPLIT+MAIN('println!("start");','panic!("the shells must split");'),wrongWhy:'check'},{src:SPLIT+MAIN('println!("start");','let half = split(7);','println!("{:?}", half);'),wrongWhy:'check'},{src:SPLIT+MAIN('println!("start");','let r: Result<u32, String> = Err(String::from("7 shells will not split"));','let half = r.expect("the shells must split");','println!("each kid gets {}", half);'),wrongWhy:'check'},{src:SPLIT+MAIN('let half = split(7).expect("the shells must split");','println!("each kid gets {}", half);'),wrongWhy:'check'}],
      defines:[],previews:[],
      check:c=>c.usesMethod('expect')<1||!c.callsIn('main','split')?'Take the half out of the `Result` that `split` gives back, with `expect`.':c.status!=='panic'?'It ran to the end, because the count splits. Use an odd count, like `7`, so `split` gives `Err`.':c.out()!=='start\n'?'Keep the `println!("start");` line, so `start` is printed before the panic.':/^.+: "\d+ shells will not split"$/.test(c.panic.msg)&&!c.panic.msg.startsWith('called ')?true:'The program panicked, but not from `expect` on an `Err` from `split`. Call `split` with an odd count and give `expect` your own words.'
    },
    {
      title:'Pass the error up with ?',kind:'write',
      goal:'The function <code>split</code> is written. Write <code>total</code>, which takes <code>a</code> and <code>b</code> and gives back <code>Ok</code> with half of <code>a</code> plus half of <code>b</code>. If either count cannot be split, <code>total</code> gives back that <code>Err</code> and goes no further. Use <code>?</code>.',
      how:[
        'The whole function splits two piles and adds the halves, but the moment one pile fails, it gives up and returns that failure to its own caller. Writing <code>match</code> twice for that is long. <code>?</code> is the short way.',
        '<code>split(a)?</code> looks at the <code>Result</code> that <code>split(a)</code> gives. On <code>Ok(half)</code> it gives the number <code>half</code>, so <code>let x = split(a)?;</code> puts that number in <code>x</code>. On <code>Err(e)</code> it leaves <code>total</code> right there and returns that same <code>Err(e)</code>.',
        'Here <code>total</code> itself returns a <code>Result</code> with the same error type as <code>split</code>, <code>String</code>, so the <code>Err</code> goes up as it is. The last line wraps the sum in <code>Ok(x + y)</code>, since the function must return a <code>Result</code> on the happy path too.',
        'The hidden part of the program prints each answer with <code>{:?}</code>. When both piles fail, the first one wins, because <code>total</code> stops at the first <code>?</code> that meets an <code>Err</code>.'
      ],
      explain:'<code>?</code> is a <code>match</code> that returns early on <code>Err</code>, written as one character. It converts the error with <code>From</code>; with the same type nothing changes, which is the case in this chapter. When the function leaves early, the variables it made are dropped as usual. Chapter 11 converts one error type into another with <code>impl From</code>.',
      hint:'Write <code>let x = split(a)?;</code>, then <code>let y = split(b)?;</code>, and finish with <code>Ok(x + y)</code>.',
      harness:M3_MAIN,
      starter:TOTAL('Ok(a + b)'),
      answer:TOTAL('let x = split(a)?;','let y = split(b)?;','Ok(x + y)'),
      alts:[TOTAL('Ok(split(a)? + split(b)?)'),TOTAL('let x = split(a)?;','Ok(x + split(b)?)')],
      wrong:[{src:TOTAL('let x = split(a)?;','Ok(x + b)'),wrongWhy:'check'},{src:TOTAL('let x = split(a)?;','let y = split(b)?;','Ok(x * y)'),wrongWhy:'check'}],
      lazy:[{src:TOTAL('if a == 8 && b == 6 {','    return Ok(7);','}','Ok(0)'),wrongWhy:'check'},{src:TOTAL('Ok(a + b)'),wrongWhy:'check'},{src:TOTAL('let _z = split(0)?;','let _w = split(0)?;','let x = match split(a) {','    Ok(h) => h,','    Err(e) => return Err(e),','};','let y = match split(b) {','    Ok(h) => h,','    Err(e) => return Err(e),','};','Ok(x + y)'),wrongWhy:'check'},{src:TOTAL('let _z = split(a)?;','let _w = split(b)?;','let x = match split(a) {','    Ok(h) => h,','    Err(e) => return Err(e),','};','let y = match split(b) {','    Ok(h) => h,','    Err(e) => return Err(e),','};','Ok(x + y)'),wrongWhy:'check'}],
      defines:['try'],previews:[],
      check:c=>c.out()!==M3_OUT?'`total` has to add the halves, and give back the first `Err` when a count does not split: `total(8, 6)` is `Ok(7)`, `total(7, 6)` and `total(7, 5)` are the `Err` for `7`, and `total(8, 5)` is the `Err` for `5`.':!c.tryOn('total','split','a')||!c.tryOn('total','split','b')?'Use `?` after the call to `split` for `a` and for `b`, and use what each one gives, so an `Err` leaves `total` at once.':OTHER(c,'Ok(25)\nErr("11 shells will not split")\nErr("13 shells will not split")\nErr("9 shells will not split")\nOk(3)\n','Your `total` only works for these counts. Split what `a` and `b` hold, so it works for any counts.',['total(8, 6)','total(20, 30)'],['total(7, 6)','total(11, 6)'],['total(8, 5)','total(8, 13)'],['total(7, 5)','total(9, 5)'],['total(0, 0)','total(2, 4)'])
    },
    {
      title:'A Result is used up by ?',kind:'fix',
      goal:'This program stops with an error: it opens the <code>Result</code> with <code>?</code> and then prints it. Fix it so that <code>half_of(8)</code> prints <code>Ok(4)</code> and then <code>gave 4</code>.',
      how:[
        'The whole function splits a count, prints the <code>Result</code> it got, and prints the number inside. The error says <code>r</code> was moved by the <code>?</code> and then used again, <code>E0382</code>, the borrow of a moved value you know from chapter 4.',
        '<code>r?</code> takes the <code>Result</code> by value: on <code>Ok</code> the number comes out and the <code>Result</code> is gone, and on <code>Err</code> the error is handed to the caller. Either way <code>r</code> does not exist after that line.',
        'So the print of <code>r</code> has to come before the <code>?</code>, while <code>r</code> is still there. Or give <code>?</code> a copy: <code>r.clone()?</code> opens a copy and leaves <code>r</code> for the later print.',
        'The hidden part of the program calls <code>half_of(8)</code> and <code>half_of(20)</code>, and takes the number out with <code>unwrap</code>, because both counts split.'
      ],
      explain:'A <code>Result</code> owns what it holds, so <code>?</code> moves it like any call that takes a value. Often the better fix is to print the number the <code>?</code> gave, or to print before opening. Cloning is the way out when you really need both.',
      hint:'Move <code>println!("{:?}", r);</code> above the line <code>let half = r?;</code>, while <code>r</code> is still whole.',
      harness:M4_MAIN,
      starter:HALF_OF('let r = split(shells);','let half = r?;','println!("{:?}", r);','println!("gave {}", half);','Ok(half)'),
      starterErr:'E0382',
      answer:HALF_OF('let r = split(shells);','println!("{:?}", r);','let half = r?;','println!("gave {}", half);','Ok(half)'),
      alts:[HALF_OF('let r = split(shells);','let half = r.clone()?;','println!("{:?}", r);','println!("gave {}", half);','Ok(half)')],
      wrong:[{src:HALF_OF('let r = split(shells);','let half = r?;','println!("{:?}", r);','println!("gave {}", half);','Ok(half)'),wrongWhy:'E0382'},{src:HALF_OF('let r = split(shells);','let half = r?;','println!("gave {}", half);','Ok(half)'),wrongWhy:'check'}],
      lazy:[{src:HALF_OF('println!("Ok(4)");','println!("gave 4");','Ok(4)'),wrongWhy:'check'},{src:HALF_OF('let r = split(shells);','let half = r?;','println!("Ok(4)");','println!("gave {}", half);','Ok(half)'),wrongWhy:'check'},{src:HALF_OF('let r = split(shells);','println!("{:?}", r);','let _z = split(shells)?;','let half = match r {','    Ok(h) => h,','    Err(e) => return Err(e),','};','println!("gave {}", half);','Ok(half)'),wrongWhy:'check'}],
      defines:[],previews:[],
      check:c=>c.out()!==M4_OUT?'`half_of(8)` has to print `Ok(4)` and then `gave 4`, and `half_of(20)` `Ok(10)` and `gave 10`.':!c.tryOn('half_of','split','shells')?'Keep the `?` that opens the `Result` from `split`, and use the number it gives.':OTHER(c,'Ok(6)\ngave 6\nOk(10)\ngave 10\n','Your program only works for the counts in the card. Print what `split` gave back, so it works for any count.',['half_of(8)','half_of(12)'])
    },
    {
      title:'? needs a Result to return',kind:'fix',
      goal:'This program stops with an error: it uses <code>?</code> in a function that returns a plain number. Fix it so that <code>first_half(8)</code> prints <code>Ok(4)</code> and <code>first_half(7)</code> prints <code>Err("7 shells will not split")</code>.',
      how:[
        'The whole function splits a count and gives back half of it. <code>?</code> has nowhere to send an <code>Err</code>: the function says it returns a <code>u32</code>, and a <code>u32</code> cannot hold an error. The compiler stops with <code>E0277</code> and says <code>?</code> can only be used in a function that returns <code>Result</code> or <code>Option</code>.',
        'The error is about the function, not about the <code>?</code>. When <code>split(shells)</code> fails, <code>?</code> returns the <code>Err</code> from <code>first_half</code>, so the return type of <code>first_half</code> has to be able to be that <code>Err</code>.',
        'Change <code>-> u32</code> to <code>-> Result&lt;u32, String&gt;</code>, the same error type <code>split</code> uses. Then the happy path has to be a <code>Result</code> too: the last line becomes <code>Ok(half)</code>.',
        'The hidden part of the program prints both calls with <code>{:?}</code>, which shows the <code>Ok</code> and the <code>Err</code> as they are.'
      ],
      explain:'A function that can pass an error up must say so in its type. That also makes the whole chain visible: every caller of <code>first_half</code> now sees a <code>Result</code> and has to deal with it. The same rule holds for <code>main</code>, which the last mission uses.',
      hint:'Change the return type of <code>first_half</code> to <code>Result&lt;u32, String&gt;</code> and the last line to <code>Ok(half)</code>.',
      harness:M5_MAIN,
      starter:FIRST(L('fn first_half(shells: u32) -> u32 {','    let half = split(shells)?;','    half','}')),
      starterErr:'E0277',
      answer:FIRST(L('fn first_half(shells: u32) -> Result<u32, String> {','    let half = split(shells)?;','    Ok(half)','}')),
      alts:[FIRST(L('fn first_half(shells: u32) -> Result<u32, String> {','    Ok(split(shells)?)','}'))],
      wrong:[{src:FIRST(L('fn first_half(shells: u32) -> Result<u32, String> {','    let half = split(shells)?;','    half','}')),wrongWhy:'E0308'},{src:FIRST(L('fn first_half(shells: u32) -> Option<u32> {','    let half = split(shells)?;','    Some(half)','}')),wrongWhy:'E0277'}],
      lazy:[{src:FIRST(L('fn first_half(shells: u32) -> Result<u32, String> {','    Ok(shells / 2)','}')),wrongWhy:'check'},{src:FIRST(L('fn first_half(shells: u32) -> Result<u32, String> {','    if shells == 8 {','        return Ok(4);','    }','    Err(String::from("7 shells will not split"))','}')),wrongWhy:'check'}],
      defines:[],previews:[],
      check:c=>c.out()!==M5_OUT?'`first_half(8)` has to print `Ok(4)` and `first_half(7)` has to print `Err("7 shells will not split")`.':c.count('try')<1?'Keep the `?` and change what the function returns.':OTHER(c,'Ok(15)\nErr("9 shells will not split")\n','Your function only works for the count in the card. Pass on what `split` gives back, so it works for any count.',['first_half(8)','first_half(30)'],['first_half(7)','first_half(9)'])
    },
    {
      title:'Name your errors with an enum',kind:'write',
      goal:'The <code>enum</code> <code>ShareError</code> is written, with <code>Odd(u32)</code> and <code>Empty</code>. Fill in <code>split</code> so that <code>0</code> shells give <code>Err(ShareError::Empty)</code>, an odd count gives <code>Err(ShareError::Odd(count))</code> and an even count gives <code>Ok</code> with half.',
      how:[
        'The whole function says what went wrong with a value of your own instead of a text. <code>Result&lt;u32, ShareError&gt;</code> has <code>ShareError</code> in the error slot, so the caller can <code>match</code> on the kind of failure. The variant <code>Odd(u32)</code> even carries the count that failed.',
        '<code>#[derive(Debug)]</code> above the <code>enum</code> lets <code>{:?}</code> print it, so <code>Err(ShareError::Odd(7))</code> shows as <code>Err(Odd(7))</code>. Without the <code>derive</code>, printing the <code>Result</code> would not compile.',
        'Check the cases in an order that makes each one certain. <code>0</code> is even, so test it before the even branch, or it would be called <code>Ok(0)</code>. Then <code>shells % 2 == 1</code> is the odd case, and everything left is <code>Ok(shells / 2)</code>.',
        'The hidden part of the program prints <code>split(8)</code>, <code>split(7)</code> and <code>split(0)</code> with <code>{:?}</code>, and then tries other counts.'
      ],
      explain:'A text error is quick to write but hard to act on: the caller can only print it. An <code>enum</code> error can be matched, so the caller can retry on <code>Odd</code> and give up on <code>Empty</code>. Printing it with <code>{:?}</code> is enough here. A nicer <code>{}</code> text comes from implementing <code>Display</code>, which chapter 11 shows.',
      hint:'Test <code>shells == 0</code> first and return <code>Err(ShareError::Empty)</code>, then <code>shells % 2 == 1</code> and return <code>Err(ShareError::Odd(shells))</code>, and end with <code>Ok(shells / 2)</code>.',
      harness:M6_MAIN,
      starter:SPLIT_E('Ok(shells / 2)'),
      answer:SPLIT_E('if shells == 0 {','    Err(ShareError::Empty)','} else if shells % 2 == 1 {','    Err(ShareError::Odd(shells))','} else {','    Ok(shells / 2)','}'),
      alts:[SPLIT_E('match shells {','    0 => Err(ShareError::Empty),','    n if n % 2 == 1 => Err(ShareError::Odd(n)),','    n => Ok(n / 2),','}')],
      wrong:[{src:SPLIT_E('if shells % 2 == 1 {','    Err(ShareError::Odd(shells))','} else {','    Ok(shells / 2)','}'),wrongWhy:'check'},{src:SPLIT_E('if shells == 0 {','    Err(ShareError::Empty)','} else if shells % 2 == 1 {','    Err(ShareError::Odd(1))','} else {','    Ok(shells / 2)','}'),wrongWhy:'check'}],
      lazy:[{src:SPLIT_E('if shells == 8 {','    Ok(4)','} else if shells == 0 {','    Err(ShareError::Empty)','} else {','    Err(ShareError::Odd(7))','}'),wrongWhy:'check'},{src:SPLIT_E('Ok(shells / 2)'),wrongWhy:'check'}],
      defines:[],previews:[],
      check:c=>c.out()!==M6_OUT?'`split(8)` has to be `Ok(4)`, `split(7)` has to be `Err(Odd(7))` and `split(0)` has to be `Err(Empty)`.':c.count('enum')<1?'Keep the `enum` `ShareError`, and use its variants as the errors.':OTHER(c,'Ok(5)\nErr(Odd(9))\nErr(Empty)\n','Your `split` only works for the counts in the card. Put the count you were given into `Odd`, so it works for any count.',['split(7)','split(9)'],['split(8)','split(10)'])
    },
    {
      title:'A missing value becomes an error',kind:'write',
      goal:'Write <code>shell_at</code>, which takes a <code>&amp;Vec&lt;u32&gt;</code> and a place <code>i</code>. Use <code>get(i)</code> and <code>ok_or</code> to give back <code>Ok</code> with the shell at that place, or <code>Err</code> with the text <code>no shell at 7</code> (with the place in it) when there is none.',
      how:[
        'The whole function looks a shell up and, if the place is empty, says so with an error instead of a panic. <code>bucket.get(i)</code> gives an <code>Option</code>: <code>Some</code> with a reference to the shell, or <code>None</code> past the end. A <code>Result</code> is what you want to return, so the <code>Option</code> has to change shape.',
        '<code>.ok_or(format!("no shell at {}", i))</code> does that. On <code>Some(x)</code> it gives <code>Ok(x)</code>, and on <code>None</code> it gives <code>Err</code> with the value you pass it. Now it is a <code>Result</code> and <code>?</code> can open it.',
        '<code>let shell = ...?;</code> leaves <code>shell</code> as a reference to the number, <code>&amp;u32</code>. <code>Ok(*shell)</code> copies the number out of it, because the function returns a plain <code>u32</code>.',
        'The hidden part of the program asks for places <code>1</code>, <code>2</code> and <code>7</code> of a bucket of three shells, then tries other buckets.'
      ],
      explain:'<code>ok_or</code> is the bridge from <code>Option</code> to <code>Result</code>: it names the error to use for <code>None</code>. The text is built before the call whether or not it is needed, which is fine for a short message. Compare with indexing, <code>bucket[i]</code>, which panics instead of letting the caller decide.',
      hint:'Write <code>let shell = bucket.get(i).ok_or(format!("no shell at {}", i))?;</code> and then <code>Ok(*shell)</code>.',
      harness:M7_MAIN,
      starter:SHELL_AT('Ok(0)'),
      answer:SHELL_AT('let shell = bucket.get(i).ok_or(format!("no shell at {}", i))?;','Ok(*shell)'),
      alts:[SHELL_AT('bucket.get(i).copied().ok_or(format!("no shell at {}", i))'),SHELL_AT('let found = bucket.get(i).ok_or(format!("no shell at {}", i));','match found {','    Ok(shell) => Ok(*shell),','    Err(e) => Err(e),','}')],
      wrong:[{src:SHELL_AT('if i < bucket.len() {','    Ok(bucket[i])','} else {','    Err(String::from("missing"))','}'),wrongWhy:'check'},{src:SHELL_AT('let shell = bucket.get(i).ok_or(String::from("no shell at 7"))?;','Ok(*shell)'),wrongWhy:'check'}],
      lazy:[{src:SHELL_AT('if i == 7 {','    Err(String::from("no shell at 7"))','} else if i == 1 {','    Ok(8)','} else {','    Ok(15)','}'),wrongWhy:'check'},{src:SHELL_AT('Ok(0)'),wrongWhy:'check'},{src:SHELL_AT('let _d = bucket.get(0).ok_or(String::from("none"));','if i < bucket.len() {','    Ok(bucket[i])','} else {','    Err(format!("no shell at {}", i))','}'),wrongWhy:'check'},{src:SHELL_AT('let _d = bucket.get(i).ok_or(format!("no shell at {}", i));','if i < bucket.len() {','    Ok(bucket[i])','} else {','    Err(format!("no shell at {}", i))','}'),wrongWhy:'check'}],
      defines:[],previews:[],
      check:c=>c.out()!==M7_OUT?'`shell_at(&bucket, 1)` has to be `Ok(8)`, place `2` has to be `Ok(15)`, and place `7` has to be `Err("no shell at 7")`.':!c.chainOn('shell_at','ok_or','get')?'Turn the `Option` from `get` into a `Result` with `ok_or`, and use that `Result`.':OTHER(c,'Ok(2)\nOk(7)\nErr("no shell at 3")\n','Your function only works for this bucket. Look the place up with `get`, so it works for any bucket and any place.',['vec![4, 8, 15]','vec![9, 2, 7]'],['shell_at(&bucket, 7)','shell_at(&bucket, 3)'])
    },
    {
      title:'Let main report the error',kind:'write',
      goal:'The <code>enum</code> <code>ShareError</code> and <code>split</code> are written, and <code>main</code> hides the failure with <code>unwrap_or(0)</code>. Change <code>main</code> to return <code>Result&lt;(), ShareError&gt;</code> and use <code>?</code> on <code>split(8)</code> and then <code>split(7)</code>, printing <code>each kid gets</code> and the half after each. The program should print <code>each kid gets 4</code>, then stop with <code>Error: Odd(7)</code> on the error output and the exit code <code>1</code>.',
      how:[
        'The whole program shares two piles of shells and, when one cannot be shared, ends with an error report instead of carrying on. The <code>unwrap_or(0)</code> in the starter does the opposite: it gives <code>0</code> when <code>split</code> fails, so the failure is hidden. <code>main</code> is a function like any other, and it may return a <code>Result</code>. Then a <code>?</code> inside it has somewhere to send an <code>Err</code>: out of <code>main</code> and to the system that ran the program.',
        'The signature is <code>fn main() -&gt; Result&lt;(), ShareError&gt;</code>. The <code>()</code> in the first slot means "nothing to give back when all is well", so the last line is <code>Ok(())</code>. The error type has to be printable with <code>{:?}</code>, which the <code>derive</code> on <code>ShareError</code> gives.',
        '<code>let a = split(8)?;</code> and <code>let b = split(7)?;</code> each open a <code>Result</code> from <code>split</code>. The first is <code>Ok(4)</code> and goes on. The second is <code>Err(Odd(7))</code>, so <code>main</code> returns it on the spot and the line that prints <code>b</code> never runs.',
        'When <code>main</code> returns an <code>Err</code>, the program prints <code>Error: </code> and the <code>{:?}</code> text of the error on the error output, and exits with <code>1</code>. A panic exits with <code>101</code>, so the two can be told apart.'
      ],
      explain:'This is the usual shape of a small Rust program: small functions return <code>Result</code>, <code>?</code> passes errors up, and <code>main</code> is the one place that turns an error into a message and an exit code. Output printed before the failing line stays, as it did with the panic. The error type of <code>main</code> only has to be printable with <code>{:?}</code>, which is why an <code>enum</code> with <code>#[derive(Debug)]</code> works.',
      hint:'Write <code>fn main() -&gt; Result&lt;(), ShareError&gt; {</code>, use <code>let a = split(8)?;</code> and <code>let b = split(7)?;</code> with a <code>println!</code> after each, and end with <code>Ok(())</code>.',
      starter:ODD+MAIN('println!("each kid gets {}", split(8).unwrap_or(0));','println!("each kid gets {}", split(7).unwrap_or(0));'),
      answer:ODD+L('fn main() -> Result<(), ShareError> {','    let a = split(8)?;','    println!("each kid gets {}", a);','    let b = split(7)?;','    println!("each kid gets {}", b);','    Ok(())','}'),
      alts:[ODD+L('fn main() -> Result<(), ShareError> {','    println!("each kid gets {}", split(8)?);','    println!("each kid gets {}", split(7)?);','    Ok(())','}')],
      wrong:[{src:ODD+L('fn main() -> Result<(), ShareError> {','    println!("each kid gets {}", split(8).unwrap_or(0));','    println!("each kid gets {}", split(7).unwrap_or(0));','    Ok(())','}'),wrongWhy:'check'},{src:ODD+L('fn main() -> Result<(), ShareError> {','    let b = split(7)?;','    println!("each kid gets {}", b);','    let a = split(8)?;','    println!("each kid gets {}", a);','    Ok(())','}'),wrongWhy:'check'}],
      lazy:[{src:ODD+MAIN('println!("each kid gets 4");','eprintln!("Error: Odd(7)");'),wrongWhy:'check'},{src:ODD+L('fn main() -> Result<(), ShareError> {','    println!("each kid gets 4");','    Err(ShareError::Odd(7))','}'),wrongWhy:'check'},{src:ODD+L('fn main() -> Result<(), ShareError> {','    let _a = split(8)?;','    println!("each kid gets 4");','    let _b = split(7)?;','    Ok(())','}'),wrongWhy:'check'}],
      defines:[],previews:[],
      check:c=>c.exit!==1?'`main` has to end with an `Err`, so the program exits with `1`. Return `Result<(), ShareError>` from `main` and use `?` on `split(7)`.':c.out()!=='each kid gets 4\n'||c.stderr!=='Error: Odd(7)\n'?'The program has to print `each kid gets 4`, and then Rust prints `Error: Odd(7)` on the error output when `main` returns that `Err`.':c.tryOn('main','split')<2?'Use `?` after both calls to `split` and use what they give, so `main` returns the error.':(()=>{const r=c.rerun(['split(7)','split(9)']);return r===null?'Keep `split(7)` as it is, so Rust Quest can try your code on other numbers.':r.stderr!=='Error: Odd(9)\n'||r.exit!==1?'Your program only reports this one count. Pass on what `split` gives back, so it works for any count.':true;})()
    }
  ]
});
})();
