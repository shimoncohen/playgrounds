

/* ===== Curriculum ===== */
const R=String.raw;
const P=(body,o={})=>{const inc=['iostream',...(o.inc||[])].map(h=>`#include <${h}>`).join('\n');
  const ind=s=>s.replace(/^\n+|\s+$/g,'').split('\n').map(l=>l.trim()?'    '+l:'').join('\n');
  return `${inc}\nusing namespace std;\n${o.pre?'\n'+o.pre.replace(/^\n+|\s+$/g,'')+'\n':''}\nint main() {\n${ind(body)}\n    return 0;\n}\n`};
const P0=(body,o)=>P(body,o).replace('using namespace std;\n','');

function makeCtx(r){
  const src=r.src||'';const code=src.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,'');
  const info=r.info||{};const snap=info.mainSnap||{};const out=r.out||'';
  const funcs=[];if(r.prog)for(const [n,fl] of r.prog.funcs)for(const f of fl)if(n!=='main')funcs.push(f);
  const nums=s=>(s.match(/-?\d+/g)||[]).map(Number);
  const c={ok:!!r.ok,out,src,code,lines:out.split('\n').map(l=>l.replace(/\s+$/,'')).filter(l=>l.length),
    inputs:info.inputs||[],tokens:(info.inputs||[]).join(' ').split(/\s+/).filter(Boolean),
    has:re=>re.test(code),count:re=>(code.match(new RegExp(re.source,'g'))||[]).length,
    v:n=>snap[n]||null,vars:snap,types:new Set(Object.values(snap).map(x=>x.type)),
    calls:n=>(info.calls||{})[n]||0,funcs,recursed:info.recursed||[],stepDepth:r.stepDepth||0,
    warned:re=>(r.warnings||[]).some(w=>re.test(w.msg)),warnings:r.warnings||[],
    structs:r.prog?[...r.prog.structs.keys()]:[],nums,
    outHas:s=>out.toLowerCase().includes(String(s).toLowerCase())};
  c.fn=pred=>funcs.find(pred);
  c.userCalls=pred=>funcs.filter(pred).reduce((s,f)=>s+c.calls(f.name),0);
  return c}

const CH=[
{name:'Hello, World',badge:'First Gear',story:'A brass plate on the tower door will not open until the workshop speaks; make it talk, read what it grumbles when it sticks, and find the first gear.',intro:'A brass plate on the tower door will not open until the workshop speaks. Every C++ program has the same skeleton. Learn its parts, make it talk, and learn to read what the compiler complains about.',
 learned:['#include','main()','cout <<','endl','"\\n"','std::'],
 missions:[
 {title:'Run your first program',goal:'Knock on the plate: press <b>Run</b> (or <kbd>Ctrl</kbd>+<kbd>Enter</kbd>) and read what appears in the console.',
  anat:[['#include <iostream>','pp'],['int main()','fn'],['cout','name'],['<<','op'],['"Hello, Tick Tower!"','val'],[';','op']],
  explain:`This is a complete C++ program. When you press Run, two things happen. First the <b>compiler</b> (g++) translates your C++ into machine code. Then the machine code <b>runs</b>. Every program starts at <code>main</code> and runs the lines inside its <code>{ }</code> from top to bottom.`,
  note:'<code>#include &lt;iostream&gt;</code> brings in the input/output library. <code>cout</code> (say "see-out") is the console. <code>&lt;&lt;</code> sends something to it, and <code>endl</code> ends the line. Every instruction line ends with <code>;</code>. Two lines you did not write: <code>using namespace std;</code> lets you type <code>cout</code> instead of <code>std::cout</code> (a few missions on you will see why), and <code>return 0;</code> at the end of <code>main</code> tells the computer the program finished fine: the <code>int</code> in <code>int main()</code> says <code>main</code> hands back a whole number when it ends, and that number is the <code>0</code> (the console shows that as <code>exit code 0</code>). In the console, the <code>g++</code> line is the compile step and <code>./main</code> is the run step.',
  start:P(R`cout << "Hello, Tick Tower!" << endl;`),hint:'Press the Run button above the editor.',
  check:c=>c.ok&&/Hello/.test(c.out)},
 {title:'Make it yours',goal:'The plate asks who is knocking: change the text so the program prints <code>Hello, </code> followed by your name.',keep:true,
  explain:`Text inside double quotes is a <b>string</b>. The program prints it exactly as written, letter for letter, but without the quotes. Change only what is between the quotes, and keep both <code>"</code> marks.`,
  start:P(R`cout << "Hello, Tick Tower!" << endl;`),ans:P(R`cout << "Hello, Ada!" << endl;`),hint:'Replace Tick Tower with your name, inside the quotes.',
  check:c=>c.ok&&/hello/i.test(c.out)&&!/Hello, Tick Tower!/.test(c.out)},
 {title:'Two lines',goal:'The plate wants one more line: add a second <code>cout</code> line that prints <code>I am learning C++</code>.',keep:true,
  anat:[['cout','name'],['<<','op'],['"I am learning C++"','val'],['<<','op'],['endl','name'],[';','op']],
  explain:`<code>endl</code> means <b>end line</b>: the next output starts on a fresh line. Try deleting the first <code>&lt;&lt; endl</code> and running again: both texts squash onto one line.`,
  start:P(R`cout << "The tower clock is ticking" << endl;`),ans:P(R`cout << "The tower clock is ticking" << endl;
cout << "I am learning C++" << endl;`),hint:'Copy the first cout line, paste it underneath, and change the text.',
  check:c=>c.ok&&c.lines.length>=2&&c.count(/\bcout\b/)>=2},
 {title:'The \\n shortcut',goal:'Let the clock tick and tock: print two lines, <code>Tick</code> then <code>Tock</code>, with a <b>single</b> <code>cout</code>, using <code>\\n</code> inside the text.',
  anat:[['"Line one\\nLine two"','val']],
  explain:`<code>\\n</code> is an <b>escape sequence</b>: a backslash plus a letter that stands for a character you can't type into a string directly. <code>\\n</code> is a new line, <code>\\t</code> is a tab, <code>\\"</code> is a double quote and <code>\\\\</code> is a backslash. Lines that start with <code>//</code> (like the one in the starter code) are <b>comments</b>: notes for humans that the computer skips.`,
  start:P(R`// One cout, two lines of output
cout << "Tick" << endl;`),ans:P(R`cout << "Tick\nTock\n";`),hint:'Put \\n between the two pieces of text: "Tick\\nTock\\n". The first line must be Tick and the second Tock.',
  check:c=>c.ok&&c.lines[0]==='Tick'&&c.lines[1]==='Tock'&&c.count(/\bcout\b/)===1&&/"[^"\n]*\\n[^"\n]*"/.test(c.code)},
 {title:'Bug hunt: the missing semicolon',goal:'The workshop door sticks: press Run, read the error, then fix the program.',
  explain:`<code>main.cpp:5:30: error</code> means file <b><code>main.cpp</code></b>, line <b>5</b>, column <b>30</b>. The compiler reports the spot where it got confused, and with a missing <code>;</code> that is usually the end of the line <i>before</i> the next line of code. Fix the first error first: one mistake often causes several messages.`,
  start:P(R`cout << "Winding gears 1..." << endl
cout << "Ready!" << endl;`),ans:P(R`cout << "Winding gears 1..." << endl;
cout << "Ready!" << endl;`),hint:'Line 5 is missing its ; at the end.',
  check:c=>c.ok&&/Ready/.test(c.out)},
 {title:'Bug hunt: who is cout?',goal:'The speaking tube mumbles. This program has no <code>using namespace std;</code> line. Fix it by writing <code>std::</code> in front of <code>cout</code> and <code>endl</code>.',
  anat:[['std','name'],['::','op'],['cout','name']],
  explain:`The standard library keeps its names in a <b>namespace</b> called <code>std</code>, like a family name. <code>std::cout</code> is the full name. The line <code>using namespace std;</code> lets you skip the family name. Most beginner code uses it; many professionals write <code>std::</code> every time so it's clear where a name comes from. Both are correct.`,
  start:P0(R`cout << "Who goes there?" << endl;`),ans:P0(R`std::cout << "Who goes there?" << std::endl;`),hint:'Change cout to std::cout and endl to std::endl. (Adding using namespace std; under the #include also works.)',
  check:c=>c.ok&&/Who goes there/.test(c.out)},
 {title:'ASCII art',goal:'Odile left a doodle on the workshop wall: finish the drawing so the console shows at least <b>4 lines</b>. Add ears, a body, a name tag, anything.',
  explain:`A backslash starts an escape sequence, so to print one <code>\\</code> you must write two: <code>\\\\</code>. That's why the cat's ears look doubled in the code but print correctly. Programmers drew whole games this way before graphics.`,
  start:P(R`cout << " /\\_/\\ " << endl;
cout << "( o.o )" << endl;
cout << " > ^ < " << endl;`),ans:P(R`cout << " /\\_/\\ " << endl;
cout << "( o.o )" << endl;
cout << " > ^ < " << endl;
cout << "  Tock" << endl;`),hint:'Add one more cout line, for example cout << "  Tock" << endl;',
  check:c=>c.ok&&c.lines.length>=4}
 ]},
{name:'Variables',badge:'Pigeonhole Key',story:'Brass pigeonholes hold the tower\'s numbers; label them, change what is inside, and find the pigeonhole key.',intro:'Brass pigeonholes hold the tower\'s numbers. Variables are named boxes in memory. Watch them appear in the Memory panel as your program runs.',
 learned:['int','double','bool','char','string','=','+ - * /','%','++ +=','const'],
 missions:[
 {title:'Your first variable',goal:'Label the first pigeonhole: create <code>int gears = 0;</code> and print it with <code>cout</code>. Then look at the <b>Memory</b> panel.',
  anat:[['int','type'],['gears','name'],['=','op'],['0','val'],[';','op']],
  explain:`A <b>variable</b> is a named box in memory. <code>int</code> is the <b>type</b>: what kind of thing the box holds (whole numbers). <code>gears</code> is the <b>name</b>. <code>= 0</code> puts a starting value in. The Memory panel shows the box, its value, and its <b>address</b>: the box's position in your computer's memory.`,
  start:P(R`// Create gears here, then print it
`),ans:P(R`int gears = 0;
cout << "Gears: " << gears << endl;`),hint:'int gears = 0;  then  cout << gears << endl;',
  check:c=>c.ok&&c.v('gears')&&/^(int|long)/.test(c.v('gears').type)&&/\d/.test(c.out)},
 {title:'Change the value',goal:'Ten more gears arrive. Below the print, add <code>gears = gears + 10;</code> and print the gears again. Press <b>Step</b> to watch the box change.',keep:true,
  explain:`In C++, <code>=</code> means <b>store</b>, not "is equal to". The right side is worked out first, using the old value (0 + 10), then the result goes into the box. Notice you don't write <code>int</code> again: <code>int</code> creates a box, and you only create it once.`,
  note:'<b>Step</b> runs one line at a time. The highlighted line is the one about to run.',
  start:P(R`int gears = 0;
cout << "Gears: " << gears << endl;`),ans:P(R`int gears = 0;
cout << "Gears: " << gears << endl;
gears = gears + 10;
cout << "Gears: " << gears << endl;`),hint:'gears = gears + 10;  then the same cout line again.',
  check:c=>c.ok&&c.v('gears')&&c.v('gears').v>0&&c.lines.length>=2},
 {title:'Meet the types',goal:'Describe a gear: create one variable of each type: a <code>double</code> ratio, a <code>bool</code> worn, a <code>char</code> grade and a <code>string</code> name. Print them all.',
  anat:[['double','type'],['bool','type'],['char','type'],['string','type']],
  explain:`<code>double</code> holds numbers with a decimal point. <code>bool</code> holds <code>true</code> or <code>false</code>, and cout prints those as <b>1</b> and <b>0</b>. <code>char</code> holds one character in <b>single</b> quotes, like <code>'A'</code>. Underneath, a <code>char</code> is a small number (<code>'A'</code> is 65), so <code>grade += 1</code> turns <code>'A'</code> into <code>'B'</code>. <code>string</code> holds text in <b>double</b> quotes. Look at the Memory panel: each box is a different size, and each type gets its own color.`,
  start:P(R`string name = "Tock";
// add a double, a bool and a char
cout << name << endl;`),ans:P(R`string name = "Tock";
double ratio = 2.5;
bool worn = true;
char grade = 'A';
cout << name << " " << ratio << " " << worn << " " << grade << endl;`),hint:"double ratio = 2.5;  bool worn = true;  char grade = 'A';",
  check:c=>c.ok&&['double','bool','char','string'].every(t=>c.types.has(t))},
 {title:'Do the math',goal:'The stairs have <code>steps = 100</code>. Subtract the 35 you climbed, add 10 for a ride on the lift, and print the steps left.',
  anat:[['steps','name'],['=','op'],['steps','name'],['-','op'],['climbed','name']],
  explain:`C++ math uses <code>+</code> <code>-</code> <code>*</code> (times) and <code>/</code> (divide). Normal math order applies: <code>*</code> and <code>/</code> happen before <code>+</code> and <code>-</code>, and parentheses go first. Use variables with good names: <code>steps - climbed</code> says more than <code>100 - 35</code>.`,
  start:P(R`int steps = 100;
int climbed = 35;
int lift = 10;
// update steps, then print it
`),ans:P(R`int steps = 100;
int climbed = 35;
int lift = 10;
steps = steps - climbed;
steps = steps + lift;
cout << "Steps left: " << steps << endl;`),hint:'steps = steps - climbed;  steps = steps + lift;',
  check:c=>c.ok&&c.v('steps')&&c.v('steps').v===75&&/75/.test(c.out)},
 {title:'The integer division trap',goal:'Tock shares 7 gears between 2 pigeonholes. Print <code>7 / 2</code> and then <code>7.0 / 2</code>. Compare the answers.',
  explain:`When both sides are <code>int</code>, C++ does <b>integer division</b>: the answer is a whole number and the decimal part is chopped off (not rounded). 7 / 2 gives 3, and even 99 / 100 gives 0. If either side is a <code>double</code>, you get the decimal answer, 3.5. This trips up every new C++ programmer at least once.`,
  start:P(R`cout << 7 / 2 << endl;
// now print 7.0 / 2
`),ans:P(R`cout << 7 / 2 << endl;
cout << 7.0 / 2 << endl;`),hint:'cout << 7.0 / 2 << endl;',
  check:c=>c.ok&&c.lines.includes('3')&&c.lines.includes('3.5')},
 {title:'Remainders with %',goal:'Sort 17 gears into 5 pigeonholes and count the leftovers: print <code>17 % 5</code>, then print <code>10 % 2</code> to test whether 10 is even.',
  explain:`<code>%</code> (modulo) gives the <b>remainder</b> after dividing. 17 / 5 is 3 with 2 left over, so 17 % 5 is 2. A number is even when <code>n % 2</code> is 0. Games use % constantly, for example to take turns between players: <code>turn % 2</code> flips between 0 and 1.`,
  start:P(R`// remainders
`),ans:P(R`cout << 17 % 5 << endl;
cout << 10 % 2 << endl;`),hint:'cout << 17 % 5 << endl;',
  check:c=>c.ok&&c.has(/%/)&&c.lines.includes('2')&&c.lines.includes('0')},
 {title:'Shortcuts: ++ and +=',goal:'Climb a level of the tower: use <code>level++</code> once, and <code>turns += 50</code> twice to wind the clock. Print both.',
  anat:[['level','name'],['++','op'],['turns','name'],['+=','op'],['50','val']],
  explain:`<code>level++</code> adds 1 (that's where the name C++ comes from: one step beyond C, the older language it grew out of). <code>turns += 50</code> is short for <code>turns = turns + 50</code>. There are matching <code>--</code>, <code>-=</code>, <code>*=</code> and <code>/=</code>. On its own line, <code>level++</code> and <code>++level</code> do the same thing. Inside a bigger line they differ: <code>cout &lt;&lt; level++</code> prints the old value and then adds 1, while <code>cout &lt;&lt; ++level</code> adds 1 first and then prints.`,
  start:P(R`int level = 1;
int turns = 0;
// level up here
cout << "Level " << level << ", Turns " << turns << endl;`),ans:P(R`int level = 1;
int turns = 0;
level++;
turns += 50;
turns += 50;
cout << "Level " << level << ", Turns " << turns << endl;`),hint:'level++;  turns += 50;  turns += 50;',
  check:c=>c.ok&&c.has(/\+\+/)&&c.has(/\+=/)&&c.v('level')&&c.v('level').v===2&&c.v('turns').v===100},
 {title:'The garbage value',goal:'A pigeonhole holds a strange number. Run this first and look at it. Then fix it: give <code>weights</code> a starting value of <code>3</code>.',
  explain:`A variable created without a value is <b>uninitialized</b>. C++ doesn't clean the box first (that would cost time), so it holds whatever leftover bits were there: a <b>garbage value</b>. The Memory panel marks it <code>??</code>. The compiler warns about it, but still runs the program. Always give variables a starting value.`,
  start:P(R`int weights;
cout << "Weights: " << weights << endl;`),ans:P(R`int weights = 3;
cout << "Weights: " << weights << endl;`),hint:'int weights = 3;',
  check:c=>c.ok&&c.v('weights')&&c.v('weights').v===3&&!c.warned(/uninitialized/)},
 {title:'Constants',goal:'The stairs never grow: create <code>const int MAX_STEPS = 100;</code>. Try adding <code>MAX_STEPS = 200;</code> to see the error, then delete that line and print MAX_STEPS.',
  anat:[['const','kw'],['int','type'],['MAX_STEPS','name'],['=','op'],['100','val']],
  explain:`<code>const</code> makes a variable whose value can never change. The compiler stops you if you try, which protects you from your own mistakes. Programmers usually name constants in <code>ALL_CAPS</code> so they stand out.`,
  start:P(R`// a constant that never changes
`),ans:P(R`const int MAX_STEPS = 100;
cout << "Max steps: " << MAX_STEPS << endl;`),hint:'const int MAX_STEPS = 100;  cout << MAX_STEPS << endl;',
  check:c=>c.ok&&c.has(/const\s+int\s+MAX_STEPS/)&&/100/.test(c.out)}
 ]},
{name:'Input & text',badge:'Visitors\' Book',story:'Odile\'s speaking tube takes messages from visitors; read what they say and join the words, and find the visitors\' book.',intro:'Odile\'s speaking tube takes messages from visitors. Programs get interesting when they react to the player. Read from the keyboard with cin and work with text.',
 learned:['cin >>','getline','+ (join)','.length()'],
 missions:[
 {title:'Ask a question',goal:'A visitor calls up the speaking tube: read their name with <code>cin &gt;&gt; name;</code> and greet them. Type your answer in the console and press Enter.',
  anat:[['cin','name'],['>>','op'],['name','name'],[';','op']],
  explain:`<code>cin</code> (say "see-in") is the keyboard. The program <b>pauses</b> at <code>cin &gt;&gt;</code> until you type something and press Enter. Read the arrows as the direction data flows: <code>cout &lt;&lt; x</code> sends x out to the screen, <code>cin &gt;&gt; x</code> moves keyboard input into x.`,
  start:P(R`string name;
cout << "What is your name? ";
// read the name, then say hello
`),ans:P(R`string name;
cout << "What is your name? ";
cin >> name;
cout << "Welcome, " << name << "!" << endl;`),hint:'cin >> name;  then  cout << "Welcome, " << name << endl;',test:['Ada'],
  check:c=>c.ok&&c.inputs.length>=1&&c.has(/cin\s*>>/)&&c.tokens[0]&&c.out.includes(c.tokens[0])},
 {title:'Numbers from the keyboard',goal:'The visitor shouts their age up the tube: ask for it as an <code>int</code> and print how old they will be next year.',
  explain:`cin converts what you type into the variable's type. For an <code>int</code> it reads digits. Try typing a word instead: cin <b>fails</b>, sets the variable to 0, and ignores later cin lines. Real programs check for that; for now, notice what happens.`,
  start:P(R`int age;
cout << "How old are you? ";
`),ans:P(R`int age;
cout << "How old are you? ";
cin >> age;
cout << "Next year you will be " << age + 1 << endl;`),hint:'cin >> age;  then print age + 1',test:['12'],
  check:c=>{const n=parseInt(c.tokens[0],10);return c.ok&&c.has(/cin\s*>>/)&&!isNaN(n)&&c.out.includes(String(n+1))}},
 {title:'Calculator',goal:'The tube carries two numbers at once: read two whole numbers with one line, <code>cin &gt;&gt; a &gt;&gt; b;</code>, and print their sum, difference and product.',
  explain:`You can chain <code>&gt;&gt;</code> just like <code>&lt;&lt;</code>. cin skips spaces and Enters between values, so you can type <code>8 5</code> on one line or press Enter after each number. And <code>int a, b;</code> is a shortcut for making two <code>int</code> boxes in one line.`,
  start:P(R`int a, b;
cout << "Two numbers: ";
`),ans:P(R`int a, b;
cout << "Two numbers: ";
cin >> a >> b;
cout << a << " + " << b << " = " << a + b << endl;
cout << a << " - " << b << " = " << a - b << endl;
cout << a << " * " << b << " = " << a * b << endl;`),hint:'cin >> a >> b;  then three cout lines',test:['8 5'],
  check:c=>{const n=c.tokens.map(Number);return c.ok&&n.length>=2&&!isNaN(n[0]+n[1])&&c.out.includes(String(n[0]+n[1]))&&c.out.includes(String(n[0]*n[1]))}},
 {title:'Whole lines with getline',goal:'Read a full name with a space in it, like <code>Mabel Cog</code>, using <code>getline(cin, fullName);</code> and print it back.',
  anat:[['getline','fn'],['(','op'],['cin','name'],['fullName','name'],[')','op']],
  explain:`<code>cin &gt;&gt;</code> stops at the first space, so it reads one word. <code>getline</code> reads everything up to Enter. It is a ready-made <b>tool</b> (programmers say <b>function</b>; you will write your own in a later chapter): you hand it what it needs inside the parentheses, here the keyboard <code>cin</code> and the variable to fill. Try it with <code>cin &gt;&gt;</code> first and see what happens to the last name.`,
  start:P(R`string fullName;
cout << "Full name: ";
cin >> fullName;
cout << "Hello, " << fullName << endl;`),ans:P(R`string fullName;
cout << "Full name: ";
getline(cin, fullName);
cout << "Hello, " << fullName << endl;`),hint:'Replace cin >> fullName; with getline(cin, fullName);',test:['Mabel Cog'],
  check:c=>c.ok&&c.has(/getline\s*\(/)&&c.inputs.some(x=>/\S\s+\S/.test(x)&&c.out.includes(x.trim()))},
 {title:'Gluing text together',goal:'Greet the mouse that answers the tube: build <code>greeting</code> from <code>"Hello, " + name + "!"</code>, print it, then print how many letters are in <code>name</code> with <code>name.length()</code>.',
  anat:[['greeting','name'],['=','op'],['"Hello, "','val'],['+','op'],['name','name'],['+','op'],['"!"','val']],
  explain:`For strings, <code>+</code> joins text end to end, and <code>+=</code> adds more onto the end (<code>s += "!"</code>). <code>.length()</code> asks the string how many characters it holds. The dot means "use a ready-made tool that belongs to this string", and the empty <code>()</code> says this tool needs nothing extra. Other useful ones: <code>name.substr(0, 3)</code> starts at position 0 and takes 3 letters, and <code>name[0]</code> is the character at position 0 (positions count from 0; the Arrays chapter explains why).`,
  start:P(R`string name = "Tock";
`),ans:P(R`string name = "Tock";
string greeting = "Hello, " + name + "!";
cout << greeting << endl;
cout << name << " has " << name.length() << " letters" << endl;`),hint:'string greeting = "Hello, " + name + "!";',
  check:c=>c.ok&&c.v('greeting')&&c.v('greeting').type==='string'&&String(c.v('greeting').v).includes(String((c.v('name')||{}).v||'~'))&&c.has(/\.(length|size)\s*\(\)/)},
 {title:'Mini game: Mad Libs',goal:'The visitors\' book wants a silly entry: ask for an <b>adjective</b>, an <b>animal</b> and a <b>verb</b>, then print a silly sentence that uses all three.',
  explain:`This is your first interactive program: questions, answers, and output built from the answers. Use one <code>cout</code> for each question, then <code>cin</code> right after it, so the player knows what to type. And <code>string adjective, animal, verb;</code> makes three <code>string</code> boxes in one line.`,
  start:P(R`string adjective, animal, verb;
cout << "An adjective: ";
cin >> adjective;
// ask for an animal and a verb, then tell the story
`),ans:P(R`string adjective, animal, verb;
cout << "An adjective: ";
cin >> adjective;
cout << "An animal: ";
cin >> animal;
cout << "A verb: ";
cin >> verb;
cout << "The " << adjective << " " << animal << " started to " << verb << " in the clock tower!" << endl;`),hint:'Repeat the cout + cin pair twice, then one cout that mixes text and the three variables.',test:['sparkly','penguin','dance'],
  check:c=>c.ok&&c.tokens.length>=3&&c.tokens.slice(0,3).every(w=>c.lines.some(l=>l.includes(w)&&l.split(/\s+/).length>3))}
 ]},
{name:'Decisions',badge:'Brass Combination',story:'The combination lock only opens for the right code, and Tock rolls dice to pick the day\'s order; teach the lock to choose, and find the brass combination.',intro:'The combination lock only opens for the right code. Let your program choose. if, else and switch make it react, and <code>rand()</code> adds luck.',
 learned:['if','else','else if','== != < >','&& || !','rand()','switch'],
 missions:[
 {title:'if',goal:'The clock runs on weights. Print <code>Clock stopped</code> only when <code>weights</code> is 0 or less. Then change weights to 50 and run again.',
  anat:[['if','kw'],['(','op'],['weights <= 0','name'],[')','op'],['{ ... }','op']],
  explain:`<code>if (condition) { ... }</code> runs the code in the braces only when the condition is true. Conditions compare things: <code>&lt;</code> less than, <code>&gt;</code> greater than, <code>&lt;=</code> at most, <code>&gt;=</code> at least, <code>==</code> equal, <code>!=</code> not equal. When there is just one line inside, the braces are optional: <code>if (weights &lt;= 0) cout &lt;&lt; "Clock stopped";</code>. Loops follow the same rule.`,
  start:P(R`int weights = 0;
// if weights is 0 or less, print Clock stopped
`),ans:P(R`int weights = 0;
if (weights <= 0) {
    cout << "Clock stopped" << endl;
}`),hint:'if (weights <= 0) { cout << "Clock stopped" << endl; }',
  check:c=>c.ok&&c.has(/\bif\s*\(/)&&(/clock stopped/i.test(c.out)||(c.v('weights')&&c.v('weights').v>0))},
 {title:'if / else',goal:'Ask for the lock code. If it is <code>1247</code>, print <code>The lock clicks open</code>; otherwise print <code>Wrong code</code>.',
  explain:`<code>else</code> is the "otherwise" path: exactly one of the two blocks runs, never both. Remember <code>==</code> (two equals signs) compares, while <code>=</code> stores. There is also a one-line way to choose between two values, the <b>ternary</b> <code>condition ? a : b</code>: it gives <code>a</code> when the condition is true and <code>b</code> otherwise, so <code>weights &gt; 10 ? "safe" : "danger"</code> is <code>"safe"</code> while weights is above 10.`,
  start:P(R`int code;
cout << "Enter the lock code: ";
cin >> code;
`),ans:P(R`int code;
cout << "Enter the lock code: ";
cin >> code;
if (code == 1247) {
    cout << "The lock clicks open" << endl;
} else {
    cout << "Wrong code" << endl;
}`),hint:'if (code == 1247) { ... } else { ... }',test:['1247'],
  check:c=>c.ok&&c.has(/\belse\b/)&&c.has(/==/)&&c.inputs.length>=1&&c.lines.length>=1},
 {title:'Grade machine',goal:'Odile graded every cog by its polish. Read the cog\'s polish. Print <code>A</code> for 90+, <code>B</code> for 80+, <code>C</code> for 70+, otherwise <code>F</code>. Use <code>else if</code>.',
  explain:`An <code>else if</code> chain checks each condition from top to bottom and runs the <b>first</b> one that's true, then skips the rest. That's why the order matters: checking <code>polish &gt;= 70</code> first would give everyone at 70 or above a C.`,
  start:P(R`int polish;
cout << "Polish: ";
cin >> polish;
if (polish >= 90) {
    cout << "A" << endl;
}`),ans:P(R`int polish;
cout << "Polish: ";
cin >> polish;
if (polish >= 90) {
    cout << "A" << endl;
} else if (polish >= 80) {
    cout << "B" << endl;
} else if (polish >= 70) {
    cout << "C" << endl;
} else {
    cout << "F" << endl;
}`),hint:'} else if (polish >= 80) { ... } else if (polish >= 70) { ... } else { ... }',test:['85'],
  check:c=>c.ok&&c.count(/else\s+if/)>=2&&c.has(/\belse\s*\{/)&&c.inputs.length>=1},
 {title:'Bug hunt: = vs ==',goal:'This prints the wrong thing. Run it, read the warning, and fix the condition.',
  explain:`<code>weights = 0</code> <b>stores</b> 0 in weights, and then the if checks that 0, which counts as false. So the program both breaks your variable and takes the wrong path. The compiler warns but still runs it. This is one of the most famous bugs in C and C++.`,
  start:P(R`int weights = 3;
if (weights = 0) {
    cout << "Clock stopped" << endl;
} else {
    cout << "Still ticking with " << weights << " weights" << endl;
}`),ans:P(R`int weights = 3;
if (weights == 0) {
    cout << "Clock stopped" << endl;
} else {
    cout << "Still ticking with " << weights << " weights" << endl;
}`),hint:'Change weights = 0 to weights == 0',
  check:c=>c.ok&&!c.warned(/assignment used as truth/)&&/with 3 weights/.test(c.out)},
 {title:'And, or, not',goal:'The workshop opens if the visitor <b>has the key AND is level 3 or higher</b>, OR is Odile herself. Write that condition.',
  anat:[['hasKey','name'],['&&','op'],['level >= 3','name'],['||','op'],['isOdile','name']],
  explain:`<code>&amp;&amp;</code> (and) is true only if both sides are true. <code>||</code> (or) is true if at least one side is. <code>!</code> (not) flips true and false. Add parentheses to make your meaning clear: <code>(hasKey &amp;&amp; level &gt;= 3) || isOdile</code>.`,
  start:P(R`bool hasKey = true;
int level = 2;
bool isOdile = false;
// open the vault?
`),ans:P(R`bool hasKey = true;
int level = 2;
bool isOdile = false;
if ((hasKey && level >= 3) || isOdile) {
    cout << "The workshop opens!" << endl;
} else {
    cout << "Access denied" << endl;
}`),hint:'if ((hasKey && level >= 3) || isOdile) { ... } else { ... }',
  check:c=>c.ok&&c.has(/&&/)&&c.has(/\|\|/)&&c.lines.length>=1},
 {title:'Roll the dice',goal:'Tock rolls a die to pick the day\'s order: print a dice roll from 1 to 6 using <code>rand() % 6 + 1</code>. Run it several times. Then delete the <code>srand</code> line and run it a few more times.',
  anat:[['rand()','fn'],['%','op'],['6','val'],['+','op'],['1','val']],
  explain:`<code>rand()</code> gives a big random-looking number. <code>% 6</code> turns it into 0 to 5, and <code>+ 1</code> shifts that to 1 to 6. The numbers come from a formula that starts from a <b>seed</b>. Without <code>srand</code>, the seed is always the same, so every run rolls the same numbers. <code>srand(time(0))</code> uses the current time as the seed. (<code>rand</code>, <code>srand</code> and <code>time</code> are ready-made tools you call by name with parentheses; <code>time(0)</code> is the clock reading in seconds, and you can ignore the <code>0</code> for now.) The C++ standard puts <code>rand</code> and <code>srand</code> in <code>#include &lt;cstdlib&gt;</code> and <code>time</code> in <code>#include &lt;ctime&gt;</code>, so portable code includes them, and this quest's compiler requires them.`,
  start:P(R`srand(time(0));
// roll a six-sided die
`,{inc:['cstdlib','ctime']}),ans:P(R`srand(time(0));
int roll = rand() % 6 + 1;
cout << "You rolled a " << roll << endl;`,{inc:['cstdlib','ctime']}),hint:'int roll = rand() % 6 + 1;',
  check:c=>c.ok&&c.has(/rand\s*\(\s*\)\s*%\s*6/)&&/[1-6]/.test(c.out)},
 {title:'switch: the errand menu',goal:'Tock offers three errands: read a menu choice. Use <code>switch</code> to print <code>Wind</code> for 1, <code>Oil</code> for 2, <code>Rest</code> for 3 and <code>Unknown choice</code> otherwise.',
  explain:`<code>switch</code> jumps to the <code>case</code> that matches the value. A <code>case</code> label ends with <code>:</code>, and the lines after it run when the value matches. Each case needs a <code>break;</code>, or the program "falls through" into the next case and runs that too. Try deleting one break to see it. <code>default</code> catches everything else. switch works with whole numbers and chars, not strings.`,
  start:P(R`int choice;
cout << "1) Wind  2) Oil  3) Rest: ";
cin >> choice;
switch (choice) {
    case 1:
        cout << "Wind" << endl;
        break;
}`),ans:P(R`int choice;
cout << "1) Wind  2) Oil  3) Rest: ";
cin >> choice;
switch (choice) {
    case 1:
        cout << "Wind" << endl;
        break;
    case 2:
        cout << "Oil" << endl;
        break;
    case 3:
        cout << "Rest" << endl;
        break;
    default:
        cout << "Unknown choice" << endl;
}`),hint:'Add case 2:, case 3: and default: blocks, each ending in break;',test:['2'],
  check:c=>c.ok&&c.count(/\bcase\b/)>=3&&c.has(/\bdefault\s*:/)&&c.count(/\bbreak\b/)>=3},
 {title:"Tock's challenge: Rock, Paper, Scissors",goal:'Tock challenges you to a game. The player types 0 (rock), 1 (paper) or 2 (scissors). The computer picks randomly. Print both choices and who <b>wins</b>, <b>loses</b> or <b>ties</b>.',
  explain:`Plan before you code. A tie is when both are equal. The player wins when they beat the computer: paper (1) beats rock (0), scissors (2) beat paper (1), rock (0) beats scissors (2). Notice the pattern: the player wins when <code>(player + 3 - computer) % 3 == 1</code> (adding 3 first keeps the number from going negative before <code>%</code>). Any other case is a loss.`,
  start:P(R`srand(time(0));
int player;
cout << "0 = rock, 1 = paper, 2 = scissors: ";
cin >> player;
int computer = rand() % 3;
cout << "Computer chose " << computer << endl;
// decide who wins
`,{inc:['cstdlib','ctime']}),ans:P(R`srand(time(0));
int player;
cout << "0 = rock, 1 = paper, 2 = scissors: ";
cin >> player;
int computer = rand() % 3;
cout << "Computer chose " << computer << endl;
if (player == computer) {
    cout << "It's a tie!" << endl;
} else if ((player + 3 - computer) % 3 == 1) {
    cout << "You win!" << endl;
} else {
    cout << "You lose!" << endl;
}`,{inc:['cstdlib','ctime']}),hint:'if (player == computer) tie; else if ((player + 3 - computer) % 3 == 1) win; else lose.',test:['1'],
  check:c=>c.ok&&c.has(/rand\s*\(/)&&c.has(/\bif\b/)&&c.inputs.length>=1&&/\b(win|lose|tie|won|lost)\b/i.test(c.out)}
 ]},
{name:'Loops',badge:'Winding Key',story:'The spiral stairs climb forever unless you count the steps; repeat work, draw the steps, and find the winding key.',intro:'The spiral stairs climb forever unless you count the steps. Make the computer repeat work. Draw shapes, add up numbers, and build a full guessing game.',
 learned:['while','for','nested loops','break','continue'],
 missions:[
 {title:'while: countdown',goal:'Count the last 10 steps down from 10 to 1 with a <code>while</code> loop, then print <code>Chime!</code>.',
  anat:[['while','kw'],['(','op'],['count > 0','name'],[')','op'],['{ ... count--; }','op']],
  explain:`A <code>while</code> loop repeats its block <b>as long as</b> the condition is true. It checks the condition before every round. Something inside must change the condition, or the loop never stops. Press <b>Watch</b> to see the program run in slow motion.`,
  start:P(R`int count = 10;
// loop while count is above 0
cout << "Chime!" << endl;`),ans:P(R`int count = 10;
while (count > 0) {
    cout << count << endl;
    count--;
}
cout << "Chime!" << endl;`),hint:'while (count > 0) { cout << count << endl; count--; }',
  check:c=>c.ok&&c.has(/\bwhile\s*\(/)&&c.nums(c.out).slice(0,10).join()==='10,9,8,7,6,5,4,3,2,1'&&/chime/i.test(c.out)},
 {title:'for: counting made compact',goal:'Print the numbers 1 to 10 with a <code>for</code> loop.',
  anat:[['for','kw'],['int i = 1','name'],[';','op'],['i <= 10','name'],[';','op'],['i++','name']],
  explain:`A <code>for</code> loop puts the three parts of counting on one line: <b>start</b> (<code>int i = 1</code>), <b>keep going while</b> (<code>i &lt;= 10</code>), and <b>step</b> (<code>i++</code>). It does exactly what a while loop does, but you can't forget the step. Watch <code>i</code> count up in the Memory panel. As with <code>if</code>, a loop with just one line inside may skip the braces.`,
  start:P(R`// print 1 to 10
`),ans:P(R`for (int i = 1; i <= 10; i++) {
    cout << i << " ";
}
cout << endl;`),hint:'for (int i = 1; i <= 10; i++) { cout << i << " "; }',
  check:c=>c.ok&&c.has(/\bfor\s*\(/)&&c.nums(c.out).join().includes('1,2,3,4,5,6,7,8,9,10')},
 {title:'Draw a row',goal:'Rivet a row on the stair rail: print a row of exactly <b>20</b> stars (<code>*</code>) using a loop, all on one line.',
  explain:`Print one <code>*</code> per round without <code>endl</code> so the stars stay on the same line, then one <code>endl</code> after the loop ends. Notice what's inside the braces repeats; what's after them runs once.`,
  start:P(R`// 20 stars in a row
`),ans:P(R`for (int i = 0; i < 20; i++) {
    cout << "*";
}
cout << endl;`),hint:'for (int i = 0; i < 20; i++) cout << "*";',
  check:c=>c.ok&&c.has(/\b(for|while)\b/)&&c.lines.some(l=>l.trim()==='*'.repeat(20))},
 {title:'Nested loops: a square',goal:'Draw the landing, a 5 by 5 square of <code>#</code>. Use a loop inside a loop.',
  explain:`The <b>outer</b> loop runs once per row. The <b>inner</b> loop draws the 5 characters of that row. After the inner loop finishes, print <code>endl</code> to start the next row. The inner loop runs completely for every single round of the outer loop: 5 × 5 = 25 characters in total.`,
  start:P(R`for (int row = 0; row < 5; row++) {
    // draw one row here
}`),ans:P(R`for (int row = 0; row < 5; row++) {
    for (int col = 0; col < 5; col++) {
        cout << "#";
    }
    cout << endl;
}`),hint:'Inside: for (int col = 0; col < 5; col++) cout << "#";  then cout << endl;',
  check:c=>c.ok&&c.count(/\bfor\b/)>=2&&c.lines.filter(l=>l.trim()==='#####').length>=5},
 {title:'Nested loops: a staircase',goal:'Draw the steps themselves, a triangle: 1 star on row 1, 2 stars on row 2, up to 5 stars.',
  explain:`The trick is to make the inner loop depend on the outer one. Row 1 needs 1 star, row 2 needs 2, so the inner loop should run <code>row</code> times: <code>col &lt;= row</code>. Once it works, try making it upside down or 10 rows tall.`,
  start:P(R`for (int row = 1; row <= 5; row++) {
    for (int col = 1; col <= 5; col++) {
        cout << "*";
    }
    cout << endl;
}`),ans:P(R`for (int row = 1; row <= 5; row++) {
    for (int col = 1; col <= row; col++) {
        cout << "*";
    }
    cout << endl;
}`),hint:'Change the inner condition from col <= 5 to col <= row.',
  check:c=>c.ok&&[1,2,3,4,5].every(n=>c.lines.some(l=>l.trim()==='*'.repeat(n)))},
 {title:'Add it all up',goal:'Number the steps 1 to 100: use a loop to add up every number from 1 to 100 and print the total.',
  explain:`This pattern is called an <b>accumulator</b>: start a variable at 0 before the loop, and add to it inside. Step through the first few rounds and watch <code>total</code> grow. (The answer is 5050. A young Carl Friedrich Gauss supposedly worked it out in his head.)`,
  start:P(R`int total = 0;
// add 1 + 2 + ... + 100 to total
cout << "Total: " << total << endl;`),ans:P(R`int total = 0;
for (int i = 1; i <= 100; i++) {
    total += i;
}
cout << "Total: " << total << endl;`),hint:'for (int i = 1; i <= 100; i++) total += i;',
  check:c=>c.ok&&c.has(/\b(for|while)\b/)&&/5050/.test(c.out)},
 {title:'break and continue',goal:'Loop from 1 to 20. <b>Skip</b> numbers divisible by 3 with <code>continue</code>, and <b>stop</b> when you reach a number above 15 with <code>break</code>.',
  explain:`<code>continue</code> skips the rest of this round and jumps to the next one. <code>break</code> leaves the loop completely. Both are handy, but a loop full of them gets hard to follow, so use them for clear special cases.`,
  start:P(R`for (int i = 1; i <= 20; i++) {
    cout << i << " ";
}
cout << endl;`),ans:P(R`for (int i = 1; i <= 20; i++) {
    if (i > 15) {
        break;
    }
    if (i % 3 == 0) {
        continue;
    }
    cout << i << " ";
}
cout << endl;`),hint:'Inside the loop, before the cout: if (i > 15) break;  if (i % 3 == 0) continue;',
  check:c=>c.ok&&c.has(/\bbreak\b/)&&c.has(/\bcontinue\b/)&&c.nums(c.out).join()==='1,2,4,5,7,8,10,11,13,14'},
 {title:'Bug hunt: the endless loop',goal:'The stair counter is stuck. Run this. It never finishes, so the playground stops it. Find out why and fix it.',
  explain:`The loop checks <code>i &lt; 5</code>, but nothing ever changes <code>i</code>, so the condition stays true forever. That's an <b>infinite loop</b>. On a real computer the program would hang; you'd stop it with <kbd>Ctrl</kbd>+<kbd>C</kbd>. Step through it and watch <code>i</code> stay at 0.`,
  start:P(R`int i = 0;
while (i < 5) {
    cout << i << " ";
}
cout << endl;`),ans:P(R`int i = 0;
while (i < 5) {
    cout << i << " ";
    i++;
}
cout << endl;`),hint:'Add i++; inside the loop.',
  check:c=>c.ok&&c.has(/\bwhile\b/)&&c.nums(c.out).join()==='0,1,2,3,4'},
 {title:'Game: Guess the Number',goal:'Tock hid the winding key behind a number. Build the full game: pick a secret number from 1 to 100. Keep asking for guesses, say <b>Too high</b> or <b>Too low</b>, and when the player gets it, say how many tries it took. Then win it.',
  explain:`This combines everything so far: variables, input, random numbers, decisions and a loop. The loop must keep going while <code>guess != secret</code>. Count the tries with <code>tries++</code> inside the loop. Best strategy as a player: always guess the middle of what's left. You'll never need more than 7 tries.`,
  start:P(R`srand(time(0));
int secret = rand() % 100 + 1;
int guess = 0;
int tries = 0;
cout << "The key hides behind a number from 1 to 100." << endl;
// loop until guess == secret
`,{inc:['cstdlib','ctime']}),ans:P(R`srand(time(0));
int secret = rand() % 100 + 1;
int guess = 0;
int tries = 0;
cout << "The key hides behind a number from 1 to 100." << endl;
while (guess != secret) {
    cout << "Your guess: ";
    cin >> guess;
    tries++;
    if (guess > secret) {
        cout << "Too high!" << endl;
    } else if (guess < secret) {
        cout << "Too low!" << endl;
    }
}
cout << "You got it in " << tries << " tries!" << endl;`,{inc:['cstdlib','ctime']}),hint:'while (guess != secret) { cin >> guess; tries++; if (guess > secret) ... else if (guess < secret) ... }',test:Array.from({length:100},(_,i)=>String(i+1)),
  check:c=>c.ok&&c.has(/rand\s*\(/)&&c.has(/\b(while|for|do)\b/)&&c.inputs.length>=1&&c.has(/cin\s*>>/)}
 ]},
{name:'Functions',badge:'Master Spanner',story:'Odile\'s toolbox room has a tool for every job; make your own and reuse them, and find the master spanner.',intro:'Odile\'s toolbox room has a tool for every job. Package code into named tools you can reuse. Watch each call get its own set of boxes in Memory.',
 learned:['void f()','parameters','return','call stack','& references','scope','recursion'],
 missions:[
 {title:'Your first function',goal:'Make the first tool: write a function <code>void sayHello()</code> that prints a greeting, and call it <b>twice</b> from main.',
  anat:[['void','type'],['sayHello','name'],['()','op'],['{ ... }','op']],
  explain:`A <b>function</b> is a named block of code. Writing it doesn't run it; <b>calling</b> it does: <code>sayHello();</code>. <code>void</code> means it doesn't give back a value. Functions must be written <b>above</b> the code that calls them, because the compiler reads top to bottom.`,
  start:P(R`// call sayHello() twice
`,{pre:R`// write sayHello here
`}),ans:P(R`sayHello();
sayHello();`,{pre:R`void sayHello() {
    cout << "Tick, tock!" << endl;
}`}),hint:'void sayHello() { cout << "Hi!" << endl; }  above main, then sayHello(); twice inside main.',
  check:c=>c.ok&&c.userCalls(f=>f.params.length===0&&f.ret.base==='void')>=2},
 {title:'Parameters',goal:'Teach the tube to greet by name: write <code>void greet(string name)</code> that prints <code>Hello, </code> plus the name. Call it with two different names.',
  anat:[['void','type'],['greet','name'],['(','op'],['string','type'],['name','name'],[')','op']],
  explain:`A <b>parameter</b> is a variable that gets its value from the call. <code>greet("Tock")</code> runs the function with <code>name</code> set to "Tock". Step into the call and look at Memory: <code>greet</code> gets its own box called <code>name</code>, separate from main.`,
  start:P(R`greet("Tock");
`,{pre:R`// write greet here
`}),ans:P(R`greet("Tock");
greet("Odile");`,{pre:R`void greet(string name) {
    cout << "Hello, " << name << "!" << endl;
}`}),hint:'void greet(string name) { cout << "Hello, " << name << endl; }',
  check:c=>c.ok&&c.userCalls(f=>f.params.length>=1)>=2},
 {title:'Return values',goal:'Gear sizes grow by squares: write <code>int square(int n)</code> that <b>returns</b> n times n. Print <code>square(7)</code> and <code>square(12)</code>.',
  anat:[['int','type'],['square','name'],['(int n)','op'],['return','kw'],['n * n','name']],
  explain:`<code>return</code> sends a value back to whoever called the function, and the call is replaced by that value. So <code>cout &lt;&lt; square(7)</code> becomes <code>cout &lt;&lt; 49</code>. The type before the name (<code>int</code>) says what kind of value comes back.`,
  start:P(R`cout << square(7) << endl;
`,{pre:R`// write square here
`}),ans:P(R`cout << square(7) << endl;
cout << square(12) << endl;`,{pre:R`int square(int n) {
    return n * n;
}`}),hint:'int square(int n) { return n * n; }',
  check:c=>c.ok&&c.lines.includes('49')&&c.lines.includes('144')&&!!c.fn(f=>f.ret.base!=='void'&&f.params.length===1)},
 {title:'Watch the call stack',goal:'Press <b>Step</b> repeatedly (or <b>Watch</b>) until a second <b>frame</b> (the fresh set of boxes a call gets), <code>area</code>, appears in the Memory panel. Keep stepping until it disappears.',
  explain:`Every call creates a new <b>stack frame</b>: a fresh set of boxes for that function's parameters and variables. When the function returns, its frame is thrown away, and only the returned value survives. This is why a function's variables don't exist outside it.`,
  start:P(R`double w = 4.5;
double h = 2;
double a = area(w, h);
cout << "Area: " << a << endl;`,{pre:R`double area(double width, double height) {
    double result = width * height;
    return result;
}`}),hint:'Use the Step button above the editor, not Run.',
  check:c=>c.ok&&c.stepDepth>=2},
 {title:'Copy or the real thing?',goal:'The winder spins but nothing sticks. Run this: <code>windUp</code> doesn\'t change main\'s turns. Fix it by adding <code>&amp;</code> to make the parameter a <b>reference</b>: <code>int&amp; turns</code>.',
  anat:[['void','type'],['windUp','name'],['(','op'],['int&','type'],['turns','name'],[')','op']],
  explain:`Normally a parameter gets a <b>copy</b> of the value (pass by value), so changing it changes only the copy. With <code>&amp;</code>, the parameter becomes another name for the caller's variable (pass by reference). Step through both versions: with &amp;, Memory shows an arrow from <code>windUp</code>'s turns to main's.`,
  start:P(R`int turns = 50;
windUp(turns);
cout << "Turns: " << turns << endl;`,{pre:R`void windUp(int turns) {
    turns += 20;
}`}),ans:P(R`int turns = 50;
windUp(turns);
cout << "Turns: " << turns << endl;`,{pre:R`void windUp(int& turns) {
    turns += 20;
}`}),hint:'void windUp(int& turns)',
  check:c=>c.ok&&c.v('turns')&&c.v('turns').v===70&&!!c.fn(f=>f.params.some(p=>p.type.ref))},
 {title:'Bug hunt: out of scope',goal:'This won\'t compile: <code>showSpanners</code> can\'t see <code>spanners</code>. Fix it by giving <code>showSpanners</code> a parameter.',
  explain:`A variable only exists inside the <code>{ }</code> where it was created. That region is its <b>scope</b>. <code>spanners</code> lives in main, so other functions can't see it. To share it, pass it in as a parameter. (Global variables declared outside every function would also work, but they make big programs hard to follow.)`,
  start:P(R`int spanners = 25;
showSpanners();`,{pre:R`void showSpanners() {
    cout << "Spanners: " << spanners << endl;
}`}),ans:P(R`int spanners = 25;
showSpanners(spanners);`,{pre:R`void showSpanners(int spanners) {
    cout << "Spanners: " << spanners << endl;
}`}),hint:'void showSpanners(int spanners)  and call it with showSpanners(spanners);',
  check:c=>c.ok&&/Spanners: 25/.test(c.out)},
 {title:'Bug hunt: order matters',goal:'main calls <code>crank</code> before the compiler has seen it. Fix it with a <b>prototype</b> line above main, or by moving the function up.',
  explain:`The compiler reads the file once, top to bottom. A <b>prototype</b> is a promise: "a function with this name and these types exists, its body comes later". It's the first line of the function with a <code>;</code> instead of a body: <code>int crank(int turns);</code>`,
  start:R`#include <iostream>
using namespace std;

int main() {
    cout << "The crank makes " << crank(7) << " ticks" << endl;
    return 0;
}

int crank(int turns) {
    return turns * 2 + 1;
}
`,ans:R`#include <iostream>
using namespace std;

int crank(int turns);

int main() {
    cout << "The crank makes " << crank(7) << " ticks" << endl;
    return 0;
}

int crank(int turns) {
    return turns * 2 + 1;
}
`,hint:'Above main, add: int crank(int turns);',
  check:c=>c.ok&&/15/.test(c.out)},
 {title:'Recursion',goal:'The clock strikes midnight: write <code>void countdown(int n)</code> that prints n and then calls <b>itself</b> with n - 1. When n reaches 0, print <code>Bong!</code> and stop.',
  explain:`A function that calls itself is <b>recursive</b>. It needs a <b>base case</b>: a condition where it stops calling itself, or it runs until the computer runs out of room for more calls. A bare <code>return;</code> (no value) ends a <code>void</code> function early. Step through it and watch the frames pile up in Memory, then unwind one by one.`,
  start:P(R`countdown(5);`,{pre:R`void countdown(int n) {
    // base case: n == 0
    // otherwise print n and call countdown(n - 1)
}`}),ans:P(R`countdown(5);`,{pre:R`void countdown(int n) {
    if (n == 0) {
        cout << "Bong!" << endl;
        return;
    }
    cout << n << endl;
    countdown(n - 1);
}`}),hint:'if (n == 0) { cout << "Bong!"; return; }  cout << n << endl;  countdown(n - 1);',
  check:c=>c.ok&&c.recursed.length>0&&/bong/i.test(c.out)},
 {title:"Tock's dice: rollDice",goal:'Tock needs dice for the day\'s order: write <code>int rollDice(int sides)</code> that returns a random number from 1 to sides. Roll two six-sided dice and print the total.',
  explain:`Good functions do one job and have a clear name. Now rolling dice is one readable line anywhere in your game: <code>rollDice(20)</code> for a 20-sided die, <code>rollDice(6) + rollDice(6)</code> for two six-sided dice. You'll reuse this in the final battle.`,
  start:P(R`srand(time(0));
// roll two dice and add them
`,{inc:['cstdlib','ctime'],pre:R`// write rollDice here
`}),ans:P(R`srand(time(0));
int a = rollDice(6);
int b = rollDice(6);
cout << "Rolled " << a << " and " << b << ": " << a + b << " ticks!" << endl;`,{inc:['cstdlib','ctime'],pre:R`int rollDice(int sides) {
    return rand() % sides + 1;
}`}),hint:'int rollDice(int sides) { return rand() % sides + 1; }',
  check:c=>c.ok&&c.has(/rand\s*\(/)&&c.userCalls(f=>f.ret.base==='int'&&f.params.length===1)>=2}
 ]},
{name:'Arrays & vectors',badge:'Cog Cabinet',story:'The gear cabinets hold many gears in a row; store, loop over and remove them, and find the cog cabinet.',intro:'The gear cabinets hold many gears in a row. Store many values under one name. Arrays have a fixed size; vectors grow as you add things.',
 learned:['int a[5]','a[i]','vector<T>','push_back','.size()','range-for','erase','2D arrays'],
 missions:[
 {title:'Your first array',goal:'Count the teeth on five cogs: create <code>int cogs[5] = {90, 72, 85, 60, 99};</code>, then print the <b>first</b> and the <b>last</b> cog count.',
  anat:[['int','type'],['cogs','name'],['[5]','op'],['=','op'],['{90, 72, 85, 60, 99}','val']],
  explain:`An <b>array</b> is a row of boxes side by side in memory, all the same type. You pick one with its <b>index</b> in square brackets. Indexes start at <b>0</b>, so the first is <code>cogs[0]</code> and the last of five is <code>cogs[4]</code>. The <code>{90, 72, 85, 60, 99}</code> list fills the boxes in order. Look at Memory: the addresses go up by 4, because one int takes 4 <b>bytes</b> (a byte is the smallest piece of memory that has its own address).`,
  start:P(R`// create the cogs array, then print the first and last
`),ans:P(R`int cogs[5] = {90, 72, 85, 60, 99};
cout << "First: " << cogs[0] << endl;
cout << "Last: " << cogs[4] << endl;`),hint:'cout << cogs[0];  and  cout << cogs[4];',
  check:c=>c.ok&&c.v('cogs')&&/\[5\]/.test(c.v('cogs').type)&&/90/.test(c.out)&&/99/.test(c.out)},
 {title:'Loop through it',goal:'Print every cog count with a <code>for</code> loop, using <code>cogs[i]</code>.',keep:true,
  explain:`Loops and arrays are made for each other. The loop counter <code>i</code> runs 0, 1, 2, 3, 4, and <code>cogs[i]</code> picks each box in turn. Step through it and watch which box is being read.`,
  start:P(R`int cogs[5] = {90, 72, 85, 60, 99};
`),ans:P(R`int cogs[5] = {90, 72, 85, 60, 99};
for (int i = 0; i < 5; i++) {
    cout << cogs[i] << endl;
}`),hint:'for (int i = 0; i < 5; i++) cout << cogs[i] << endl;',
  check:c=>c.ok&&c.has(/\[\s*i\s*\]/)&&['90','72','85','60','99'].every(x=>c.lines.includes(x))},
 {title:'Bug hunt: off by one',goal:'This loop reads one box too many. Run it, read the error, fix it.',
  explain:`An array of 5 has indexes 0 to 4. The condition <code>i &lt;= 5</code> also tries index 5, which isn't there. Real C++ <b>doesn't check</b>: it reads whatever memory comes next and carries on with garbage, or crashes. This playground catches it for you. Off-by-one errors are among the most common bugs in programming.`,
  start:P(R`int cogs[5] = {90, 72, 85, 60, 99};
for (int i = 0; i <= 5; i++) {
    cout << cogs[i] << endl;
}`),ans:P(R`int cogs[5] = {90, 72, 85, 60, 99};
for (int i = 0; i < 5; i++) {
    cout << cogs[i] << endl;
}`),hint:'Use i < 5, not i <= 5.',
  check:c=>c.ok&&['90','72','85','60','99'].every(x=>c.lines.includes(x))},
 {title:'Vectors grow',goal:'Odile\'s toolbox keeps growing: create <code>vector&lt;string&gt; toolbox;</code>, add three items with <code>push_back</code>, and print <code>toolbox.size()</code>.',
  anat:[['vector','type'],['<string>','type'],['toolbox','name'],[';','op']],
  explain:`A <b>vector</b> is an array that can grow. It starts empty, and <code>push_back</code> adds an item to the end. <code>.size()</code> tells you how many it holds. <code>vector&lt;string&gt;</code> reads "vector of strings": the part in <code>&lt; &gt;</code> is the type of each item. You need <code>#include &lt;vector&gt;</code>. Use Step and watch new boxes appear in Memory.`,
  start:P(R`vector<string> toolbox;
// add three items
`,{inc:['vector']}),ans:P(R`vector<string> toolbox;
toolbox.push_back("spanner");
toolbox.push_back("oil can");
toolbox.push_back("cog");
cout << "Items: " << toolbox.size() << endl;`,{inc:['vector']}),hint:'toolbox.push_back("spanner");',
  check:c=>c.ok&&c.v('toolbox')&&c.v('toolbox').type==='vector<string>'&&c.v('toolbox').v.length>=3&&c.has(/\.size\s*\(\)/)},
 {title:'Range-for',goal:'Print each item on its own line with <code>for (string item : toolbox)</code>.',keep:true,
  anat:[['for','kw'],['(string item','name'],[':','op'],['toolbox)','name']],
  explain:`The <b>range-for</b> loop reads "for each item in toolbox". No index, no size, no off-by-one. Use it when you want every element in order. It also works on arrays and strings (giving one char at a time). Writing <code>auto</code> instead of <code>string</code> lets C++ figure out the type.`,
  start:P(R`vector<string> toolbox;
toolbox.push_back("spanner");
toolbox.push_back("oil can");
toolbox.push_back("cog");
`,{inc:['vector']}),ans:P(R`vector<string> toolbox;
toolbox.push_back("spanner");
toolbox.push_back("oil can");
toolbox.push_back("cog");
for (string item : toolbox) {
    cout << "- " << item << endl;
}`,{inc:['vector']}),hint:'for (string item : toolbox) { cout << "- " << item << endl; }',
  check:c=>c.ok&&c.has(/for\s*\(\s*(const\s+)?(auto|string|std::string)\s*&?\s*\w+\s*:/)&&c.lines.length>=3},
 {title:'Find the biggest cog',goal:'Find the biggest number in <code>cogs</code> with a loop, and print <code>Biggest cog: 99</code>. Don\'t just type 99.',
  explain:`A <code>{ }</code> list after a vector's name fills it with those items at the start, just like an array. Start with <code>best</code> set to the first cog. Then check every cog: if one is bigger than <code>best</code>, it becomes the new best. Step through and watch <code>best</code> update. This "keep the best so far" pattern finds minimums, longest names, closest enemies and much more.`,
  start:P(R`vector<int> cogs = {72, 99, 85, 60, 91};
int best = cogs[0];
// check every cog
cout << "Biggest cog: " << best << endl;`,{inc:['vector']}),ans:P(R`vector<int> cogs = {72, 99, 85, 60, 91};
int best = cogs[0];
for (int s : cogs) {
    if (s > best) {
        best = s;
    }
}
cout << "Biggest cog: " << best << endl;`,{inc:['vector']}),hint:'for (int s : cogs) { if (s > best) best = s; }',
  check:c=>c.ok&&c.has(/\bfor\b/)&&/Biggest cog: 99/.test(c.out)&&!c.has(/best\s*=\s*99/)},
 {title:'Drop items',goal:'Remove <code>"oil can"</code> with <code>erase</code> and the last item with <code>pop_back()</code>, leaving just spanner and cog.',
  anat:[['toolbox','name'],['.erase(','fn'],['toolbox.begin() + 1','name'],[')','op']],
  explain:`<code>pop_back()</code> removes the last item. <code>erase</code> removes from any position, but it wants a position written as <code>toolbox.begin() + index</code>. <code>begin()</code> is the position of the first item, so adding <code>1</code> moves to the second. Watch Memory: everything after the erased item slides down one place.`,
  start:P(R`vector<string> toolbox = {"spanner", "oil can", "cog", "map"};
// remove the oil can (index 1), then remove the last item
for (string item : toolbox) {
    cout << item << endl;
}`,{inc:['vector']}),ans:P(R`vector<string> toolbox = {"spanner", "oil can", "cog", "map"};
toolbox.erase(toolbox.begin() + 1);
toolbox.pop_back();
for (string item : toolbox) {
    cout << item << endl;
}`,{inc:['vector']}),hint:'toolbox.erase(toolbox.begin() + 1);  toolbox.pop_back();',
  check:c=>c.ok&&c.v('toolbox')&&JSON.stringify(c.v('toolbox').v)==='["spanner","cog"]'},
 {title:'2D grid: tic-tac-toe',goal:'Tock and Odile left a tic-tac-toe game on the cabinet doors: put an <code>X</code> in the center square with <code>board[1][1] = \'X\';</code> and print the board with <code>|</code> between columns.',
  explain:`A 2D array is an array of rows. <code>board[row][col]</code> picks one square, and both indexes start at 0, so the center of a 3×3 board is <code>[1][1]</code>. Nested loops walk it: the outer loop picks the row, the inner loop walks across it. Game maps, puzzles and pixels all work this way.`,
  start:P(R`char board[3][3] = {
    {'O', ' ', ' '},
    {' ', ' ', ' '},
    {' ', ' ', 'O'}
};
// place X in the center, then print the board
`),ans:P(R`char board[3][3] = {
    {'O', ' ', ' '},
    {' ', ' ', ' '},
    {' ', ' ', 'O'}
};
board[1][1] = 'X';
for (int row = 0; row < 3; row++) {
    for (int col = 0; col < 3; col++) {
        cout << board[row][col];
        if (col < 2) cout << "|";
    }
    cout << endl;
}`),hint:"board[1][1] = 'X'; then a row loop with a col loop inside.",
  check:c=>c.ok&&c.v('board')&&c.v('board').v[1][1]==='X'&&c.lines.filter(l=>l.includes('|')).length>=3}
 ]},
{name:'Structs',badge:'Figure Blueprint',story:'The parade figures on the clock face each have a name and strength; build their blueprints and make them march, and find the figure blueprint.',intro:'The parade figures on the clock face each have a name and a strength. Bundle related data into your own types. Build the figures, then make them march.',
 learned:['struct','.field','{ } init','const &','vector<Struct>'],
 missions:[
 {title:'Design a Figure',goal:'Finish <code>struct Figure</code> with a <code>string name</code>, <code>int wind</code> and <code>int strength</code>. Create <code>tilly</code>, fill in its fields, and print them.',
  anat:[['struct','kw'],['Figure','type'],['{','op'],['string name; int wind; int strength;','name'],['};','op']],
  explain:`A <b>struct</b> creates a new type made of several named fields. <code>Figure tilly;</code> creates one, and the dot reaches inside: <code>tilly.wind = 100;</code>. In Memory, tilly is one big box holding smaller boxes. Note the <code>;</code> after the struct's closing brace.`,
  start:P(R`Figure tilly;
tilly.name = "Tilly";
// set wind and strength, then print all three
`,{pre:R`struct Figure {
    string name;
    // add wind and strength
};`}),ans:P(R`Figure tilly;
tilly.name = "Tilly";
tilly.wind = 100;
tilly.strength = 12;
cout << tilly.name << " wind:" << tilly.wind << " strength:" << tilly.strength << endl;`,{pre:R`struct Figure {
    string name;
    int wind;
    int strength;
};`}),hint:'In the struct: int wind; int strength;   In main: tilly.wind = 100; tilly.strength = 12;',
  check:c=>c.ok&&c.structs.length>=1&&Object.values(c.vars).some(x=>x.v&&typeof x.v==='object'&&'wind'in x.v&&'strength'in x.v&&typeof x.v.wind==='number')&&!c.warned(/uninitialized/)},
 {title:'Quick setup with braces',goal:'Create two figures in one line each: <code>Figure tilly = {"Tilly", 100, 12};</code> and a rival. Print both.',keep:true,
  explain:`Values in curly braces fill the fields <b>in the order they're listed</b> in the struct: name, then wind, then strength. Much shorter than setting each field, but you have to remember the order.`,
  start:P(R`Figure tilly = {"Tilly", 100, 12};
`,{pre:R`struct Figure {
    string name;
    int wind;
    int strength;
};`}),ans:P(R`Figure tilly = {"Tilly", 100, 12};
Figure rival = {"Rustwick", 30, 5};
cout << tilly.name << " vs " << rival.name << endl;`,{pre:R`struct Figure {
    string name;
    int wind;
    int strength;
};`}),hint:'Figure rival = {"Rustwick", 30, 5};',
  check:c=>c.ok&&Object.values(c.vars).filter(x=>x.type==='Figure').length>=2&&c.count(/=\s*\{/)>=2},
 {title:'Structs in functions',goal:'Write <code>void printFigure(const Figure&amp; p)</code> that prints <code>Tilly (wind 100)</code>. Call it for both figures.',
  explain:`Passing a struct by value copies every field. <code>const Figure&amp;</code> passes a reference instead (no copy) and <code>const</code> promises the function won't change it. That's the standard way to pass structs, strings and vectors you only want to read.`,
  start:P(R`Figure tilly = {"Tilly", 100, 12};
Figure rival = {"Rustwick", 30, 5};
`,{pre:R`struct Figure {
    string name;
    int wind;
    int strength;
};

// write printFigure here
`}),ans:P(R`Figure tilly = {"Tilly", 100, 12};
Figure rival = {"Rustwick", 30, 5};
printFigure(tilly);
printFigure(rival);`,{pre:R`struct Figure {
    string name;
    int wind;
    int strength;
};

void printFigure(const Figure& p) {
    cout << p.name << " (wind " << p.wind << ")" << endl;
}`}),hint:'void printFigure(const Figure& p) { cout << p.name << " (wind " << p.wind << ")" << endl; }',
  check:c=>c.ok&&c.userCalls(f=>f.params.some(p=>p.type.base==='struct'))>=2&&/\(wind 100\)/.test(c.out)},
 {title:'Run a figure down',goal:'Write <code>void unwind(Figure&amp; p, int loss)</code>. It lowers wind by loss, but never below 0. Run the rival down by 50.',
  explain:`This time the function must change the figure, so the parameter is <code>Figure&amp;</code> without const. The "never below 0" rule is called <b>clamping</b>: after subtracting, if wind went negative, set it to 0.`,
  start:P(R`Figure rival = {"Rustwick", 30, 5};
unwind(rival, 50);
cout << rival.name << " wind: " << rival.wind << endl;`,{pre:R`struct Figure {
    string name;
    int wind;
    int strength;
};

void unwind(Figure& p, int loss) {
    // lower wind, but not below 0
}`}),ans:P(R`Figure rival = {"Rustwick", 30, 5};
unwind(rival, 50);
cout << rival.name << " wind: " << rival.wind << endl;`,{pre:R`struct Figure {
    string name;
    int wind;
    int strength;
};

void unwind(Figure& p, int loss) {
    p.wind -= loss;
    if (p.wind < 0) {
        p.wind = 0;
    }
}`}),hint:'p.wind -= loss;  if (p.wind < 0) p.wind = 0;',
  check:c=>c.ok&&c.v('rival')&&c.v('rival').v.wind===0},
 {title:'A parade of figures',goal:'Create a <code>vector&lt;Figure&gt; parade</code> with three figures. Loop over it to print each name, then print the parade\'s total wind.',
  explain:`Vectors can hold structs too. <code>parade[0].name</code> reads the first figure's name, and a range-for gives you each figure in turn. Use <code>const Figure&amp; p</code> in the loop to avoid copying each figure.`,
  start:P(R`vector<Figure> parade = {
    {"Tilly", 100, 12},
    {"Bolt", 80, 15},
    {"Pip", 60, 20}
};
int total = 0;
// print each name and add up the wind
cout << "Total wind: " << total << endl;`,{inc:['vector'],pre:R`struct Figure {
    string name;
    int wind;
    int strength;
};`}),ans:P(R`vector<Figure> parade = {
    {"Tilly", 100, 12},
    {"Bolt", 80, 15},
    {"Pip", 60, 20}
};
int total = 0;
for (const Figure& p : parade) {
    cout << p.name << endl;
    total += p.wind;
}
cout << "Total wind: " << total << endl;`,{inc:['vector'],pre:R`struct Figure {
    string name;
    int wind;
    int strength;
};`}),hint:'for (const Figure& p : parade) { cout << p.name << endl; total += p.wind; }',
  check:c=>c.ok&&c.v('parade')&&c.v('parade').v.length>=3&&c.v('total')&&c.v('total').v===c.v('parade').v.reduce((s,p)=>s+p.wind,0)&&c.v('parade').v.every(p=>c.out.includes(p.name))},
 {title:'Tilly versus Rustwick',goal:'Make Tilly and Baron Rustwick\'s figure take turns winding each other down with random loss until one of them reaches 0 wind. Print each round, then announce who <b>wins</b>.',
  explain:`Everything comes together: a struct for fighters, functions for actions, random numbers for luck, a loop for rounds, and ifs to stop at the right moment. Check after <b>each</b> hit: if the boss figure runs down from Tilly's hit, it shouldn't get to hit back.`,
  start:P(R`srand(time(0));
Figure tilly = {"Tilly", 100, 12};
Figure boss = {"Baron Rustwick", 120, 10};
int round = 1;
// while both are alive: tilly attacks, check, boss attacks, round++
`,{inc:['cstdlib','ctime'],pre:R`struct Figure {
    string name;
    int wind;
    int strength;
};

int rollDice(int sides) {
    return rand() % sides + 1;
}

void hit(Figure& attacker, Figure& target) {
    int loss = attacker.strength + rollDice(6);
    target.wind -= loss;
    if (target.wind < 0) target.wind = 0;
    cout << attacker.name << " hits " << target.name << " for " << loss
         << " (" << target.name << " wind " << target.wind << ")" << endl;
}`}),ans:P(R`srand(time(0));
Figure tilly = {"Tilly", 100, 12};
Figure boss = {"Baron Rustwick", 120, 10};
int round = 1;
while (tilly.wind > 0 && boss.wind > 0) {
    cout << "-- Round " << round << " --" << endl;
    hit(tilly, boss);
    if (boss.wind == 0) break;
    hit(boss, tilly);
    round++;
}
if (tilly.wind > 0) {
    cout << tilly.name << " wins!" << endl;
} else {
    cout << boss.name << " wins!" << endl;
}`,{inc:['cstdlib','ctime'],pre:R`struct Figure {
    string name;
    int wind;
    int strength;
};

int rollDice(int sides) {
    return rand() % sides + 1;
}

void hit(Figure& attacker, Figure& target) {
    int loss = attacker.strength + rollDice(6);
    target.wind -= loss;
    if (target.wind < 0) target.wind = 0;
    cout << attacker.name << " hits " << target.name << " for " << loss
         << " (" << target.name << " wind " << target.wind << ")" << endl;
}`}),hint:'while (tilly.wind > 0 && boss.wind > 0) { hit(tilly, boss); if (boss.wind == 0) break; hit(boss, tilly); round++; }',
  check:c=>c.ok&&c.has(/\bwhile\b/)&&/wins/i.test(c.out)&&((c.v('tilly')&&c.v('tilly').v.wind===0)||(c.v('boss')&&c.v('boss').v.wind===0))}
 ]},
{name:'Pointers',badge:'Midnight Chime',story:'Rustwick hid the clock\'s heart behind a hatch you can only reach by its address; follow addresses carefully, and find the Midnight Chime.',intro:'Rustwick hid the clock\'s heart behind a hatch you can only reach by its address. Every box in memory has an address. Pointers store addresses, and they are C++\'s superpower and its sharpest edge.',
 learned:['&x','int* p','*p','nullptr','p++','int& r'],
 missions:[
 {title:'Every box has an address',goal:'The hatch can only be found by address: print <code>&amp;gears</code>. Compare the number with the address shown under <code>gears</code> in the Memory panel.',
  anat:[['&','op'],['gears','name']],
  explain:`Memory is one huge row of numbered slots called <b>bytes</b>. A variable's <b>address</b> is the number of its first byte, usually shown in hexadecimal (base 16, starting with <code>0x</code>). <code>&amp;gears</code> means "the address of gears". (On a real computer the address changes every run.)`,
  start:P(R`int gears = 42;
cout << "gears is " << gears << endl;
// print where gears lives
`),ans:P(R`int gears = 42;
cout << "gears is " << gears << endl;
cout << "gears lives at " << &gears << endl;`),hint:'cout << &gears << endl;',
  check:c=>c.ok&&/0x[0-9a-f]+/.test(c.out)&&c.has(/&\s*gears/)},
 {title:'A pointer stores an address',goal:'Create <code>int* p = &amp;gears;</code>. Print <code>p</code>, then print <code>*p</code>.',
  anat:[['int*','type'],['p','name'],['=','op'],['&gears','name']],
  explain:`A <b>pointer</b> is a variable whose value is an address. <code>int*</code> means "pointer to an int". In Memory, p's box holds the address of <code>gears</code> and draws an arrow to it. Putting <code>*</code> in front of a pointer <b>follows the arrow</b>: <code>*p</code> reads the value at that address, 42.`,
  start:P(R`int gears = 42;
// make p point at gears
`),ans:P(R`int gears = 42;
int* p = &gears;
cout << "p holds " << p << endl;
cout << "*p is " << *p << endl;`),hint:'int* p = &gears;  cout << p;  cout << *p;',
  check:c=>c.ok&&c.v('p')&&c.v('p').type==='int*'&&c.lines.some(l=>/\b42\b/.test(l))&&c.has(/\*\s*p/)},
 {title:'Change it through the pointer',goal:'Use <code>*p = 99;</code>, then print <code>gears</code>. You never touch gears directly.',keep:true,
  explain:`<code>*p = 99</code> means "store 99 at the address in p". Since p points at gears, gears becomes 99. Step through it and watch the arrow: this is the same idea as references (&amp; parameters), but a pointer can be re-aimed at something else later.`,
  start:P(R`int gears = 42;
int* p = &gears;
`),ans:P(R`int gears = 42;
int* p = &gears;
*p = 99;
cout << "gears is now " << gears << endl;`),hint:'*p = 99;',
  check:c=>c.ok&&c.v('gears')&&c.v('gears').v===99&&c.has(/\*\s*p\s*=/)},
 {title:'Bug hunt: the null pointer',goal:'The hatch handle is missing, so this crashes. Run it, read the error, then guard the read with <code>if (p != nullptr)</code> and print <code>Nothing here</code> otherwise.',
  explain:`<code>nullptr</code> means "points at nothing". Following it with <code>*</code> is a crash: a <b>segmentation fault</b>, the operating system stopping a program for touching memory it doesn't own. Uninitialized pointers are even worse: they point at random places. Always give a pointer a value, and check it before following it.`,
  start:P(R`int* p = nullptr;
cout << *p << endl;`),ans:P(R`int* p = nullptr;
if (p != nullptr) {
    cout << *p << endl;
} else {
    cout << "Nothing here" << endl;
}`),hint:'if (p != nullptr) { cout << *p; } else { cout << "Nothing here"; }',
  check:c=>c.ok&&c.has(/nullptr/)&&c.has(/\bif\b/)&&/nothing here/i.test(c.out)},
 {title:'Pointers walk arrays',goal:'The gear teeth sit in a row: point <code>p</code> at the start of the array and use a loop with <code>p++</code> to print every value.',
  explain:`An array's name turns into a pointer to its first box, so <code>int* p = teeth;</code> works. <code>p++</code> moves the pointer to the <b>next box</b>, which is 4 bytes along for an int. Watch the arrow in Memory slide along the row. Walking with <code>p++</code> visits the same boxes that <code>teeth[i]</code> does.`,
  start:P(R`int teeth[4] = {5, 10, 20, 50};
int* p = teeth;
cout << *p << endl;`),ans:P(R`int teeth[4] = {5, 10, 20, 50};
int* p = teeth;
for (int i = 0; i < 4; i++) {
    cout << *p << endl;
    p++;
}`),hint:'for (int i = 0; i < 4; i++) { cout << *p << endl; p++; }',
  check:c=>c.ok&&c.has(/p\s*\+\+|\+\+\s*p|p\s*\+=|p\s*\+\s*\w/)&&['5','10','20','50'].every(x=>c.lines.includes(x))},
 {title:'References vs pointers',goal:'Create <code>int&amp; ref = gears;</code> and add 5 through it. Then create <code>int* ptr = &amp;gears;</code> and add 5 through that. gears should end at 20.',
  explain:`Both let you reach gears from another name. A <b>reference</b> is a permanent second name: no <code>*</code> needed, can't be null, can't be re-aimed. A <b>pointer</b> is a separate variable holding an address: you need <code>*</code>, it can be nullptr, and it can move. Prefer references when you can, pointers when you must.`,
  start:P(R`int gears = 10;
// reference version, then pointer version
cout << "gears: " << gears << endl;`),ans:P(R`int gears = 10;
int& ref = gears;
ref += 5;
int* ptr = &gears;
*ptr += 5;
cout << "gears: " << gears << endl;`),hint:'int& ref = gears;  ref += 5;  int* ptr = &gears;  *ptr += 5;',
  check:c=>c.ok&&c.v('gears')&&c.v('gears').v===20&&Object.values(c.vars).some(x=>/&$/.test(x.type))&&Object.values(c.vars).some(x=>/\*$/.test(x.type))}
 ]}
];
if(typeof module!=='undefined')module.exports={CH,makeCtx,P};

/* ---------- quick-fire pool (DOM-free, so tests can load it) ---------- */
const rnd=(a,b)=>a+Math.floor(Math.random()*(b-a+1)),pick=a=>a[Math.floor(Math.random()*a.length)];
// Each question carries the chapter (0-based) that teaches everything it uses; Quick-fire only offers it once that whole chapter is done.
const T=(ch,gen)=>({ch,gen});
const QT=[
 T(1,()=>{const a=rnd(7,29),b=rnd(2,5);return {body:`int a = ${a};\nint b = ${b};\ncout << a / b;`,why:'Both are int, so the decimal part is chopped off.'}}),
 T(1,()=>{const a=rnd(10,40),b=rnd(3,7);return {body:`cout << ${a} % ${b};`,why:'% gives the remainder after dividing.'}}),
 T(1,()=>{const x=rnd(2,9),y=rnd(2,6);return {body:`int x = ${x};\nx += ${y};\nx *= 2;\ncout << x;`,why:'Each line updates x in turn: add first, then double.'}}),
 T(1,()=>{const i=rnd(3,9);return {body:`int i = ${i};\ncout << i++ << " " << i;`,why:'i++ hands over the old value, then adds 1.'}}),
 T(1,()=>{const i=rnd(3,9);return {body:`int i = ${i};\ncout << ++i << " " << i;`,why:'++i adds 1 first, then hands over the new value.'}}),
 T(2,()=>{const w=pick(['dragon','pixel','quest','sword','castle','wizard']);return {body:`string s = "${w}";\ncout << s.length();`,why:'length() counts the characters.'}}),
 T(4,()=>{const n=rnd(3,6);return {body:`for (int i = 0; i < ${n}; i++) {\n    cout << i;\n}`,why:`Starts at 0 and stops before ${n}. No spaces are printed.`}}),
 T(4,()=>{const a=rnd(2,4),b=rnd(2,5);return {body:`int count = 0;\nfor (int i = 0; i < ${a}; i++) {\n    for (int j = 0; j < ${b}; j++) {\n        count++;\n    }\n}\ncout << count;`,why:`The inner loop runs ${b} times for each of the ${a} outer rounds.`}}),
 T(3,()=>{const x=rnd(1,9),y=rnd(1,9);return {body:`bool b = ${x} > ${y};\ncout << b;`,why:'cout prints true as 1 and false as 0.'}}),
 T(3,()=>{const x=rnd(1,20);return {body:`int hp = ${x};\ncout << (hp > 10 ? "safe" : "danger");`,why:'? : gives the first answer when the condition is true, the second when false.'}}),
 T(6,()=>{const n=rnd(2,4),z=rnd(1,9);const items=Array.from({length:n},()=>rnd(1,9));return {body:`vector<int> v = {${items.join(', ')}};\nv.push_back(${z});\ncout << v.size();`,inc:['vector'],why:'size() counts items, and push_back adds one.'}}),
 T(6,()=>{const arr=Array.from({length:5},()=>rnd(1,50));const k=rnd(1,4);return {body:`int a[5] = {${arr.join(', ')}};\ncout << a[${k}];`,why:'Indexes start at 0, so a[1] is the second number.'}}),
 T(1,()=>{const x=pick([5,7,9,11,13]);return {body:`double d = ${x} / 2;\ncout << d;`,why:'Two ints divide first and lose the decimal; only then is the result stored in d.'}}),
 T(1,()=>{const k=rnd(1,5);const c=pick(['A','a','M']);return {body:`char ch = '${c}';\nch += ${k};\ncout << ch;`,why:'A char is a number underneath, so + moves along the alphabet.'}}),
 T(4,()=>{const x=rnd(10,30),y=rnd(3,7);return {body:`int n = ${x};\nwhile (n > 0) {\n    n -= ${y};\n}\ncout << n;`,why:'The loop stops at the first value that is 0 or below.'}}),
 T(0,()=>{const a=rnd(1,9),b=rnd(1,9);return {body:`cout << ${a} << ${b};`,why:'cout never adds spaces for you.'}}),
 T(0,()=>{const w=pick(['sword','shield','potion','map']),v=pick(['gold','key','torch','bow']);return {body:`cout << "${w}" << " " << "${v}";`,why:'The text inside the quotes prints exactly as written, without the quotes.'}}),
 T(0,()=>{const w=pick(['Hi','Go','Run','Win']),v=pick(['now','fast','Ada','Bo']);return {body:`cout << "${w}" << "!" << "${v}";`,why:'Each piece is printed right after the last one, so the pieces touch.'}}),
 T(2,()=>{const w=pick(['KNIGHT','ROGUE','WIZARD','GOBLIN']);const k=rnd(0,w.length-1);return {body:`string s = "${w}";\ncout << s[${k}];`,why:'s[0] is the first letter.'}}),
 T(3,()=>{const x=rnd(1,20);return {body:`int x = ${x};\nif (x > 10) {\n    cout << "big";\n} else {\n    cout << "small";\n}`,why:'Compare x with 10.'}}),
 T(5,()=>{const n=rnd(2,7);return {pre:`int twice(int n) {\n    return n * 2 + 1;\n}`,body:`cout << twice(${n});`,why:'The call is replaced by the value it returns.'}}),
 T(5,()=>{const x=rnd(2,6);return {pre:`void bump(int n) {\n    n += 10;\n}`,body:`int score = ${x};\nbump(score);\ncout << score;`,why:'Without &, bump changes its own copy only.'}}),
 T(5,()=>{const x=rnd(2,6);return {pre:`void bump(int& n) {\n    n += 10;\n}`,body:`int score = ${x};\nbump(score);\ncout << score;`,why:'With &, n is another name for score itself.'}}),
 T(2,()=>{const a=rnd(1,5),b=rnd(1,5);return {body:`string s = "${a}";\ns += "${b}";\ncout << s;`,why:'+= on strings joins text; it does not add numbers.'}}),
 T(8,()=>{const x=rnd(2,9);return {body:`int x = ${x};\nint* p = &x;\n*p = *p * 3;\ncout << x;`,why:'*p is x itself, so this triples x.'}}),
 T(4,()=>{const n=rnd(3,5),c=pick(['*','#','o']);return {body:`for (int i = 0; i < ${n}; i++) {\n    cout << "${c}";\n}\ncout << "!";`,why:'Only what is inside the braces repeats. The "!" comes after the loop, so it prints once, at the end.'}}),
 T(4,()=>{const n=rnd(4,9);return {body:`int total = 0;\nfor (int i = 1; i <= ${n}; i++) {\n    if (i % 2 == 0) continue;\n    total += i;\n}\ncout << total;`,why:'continue skips the even numbers, so only odd ones are added.'}}),
];
const qfOpen=done=>QT.filter(q=>CH[q.ch].missions.every((_,j)=>done&&done[q.ch+'-'+j]));

(()=>{
const KEY='cpp-quest-v1';
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
function fresh(){return {ch:0,mi:0,done:{},xp:0,best:0,badges:{},codes:{},sandbox:null,inSandbox:false}}
let S=fresh();
try{const raw=localStorage.getItem(KEY);if(raw){const o=JSON.parse(raw);if(o&&typeof o==='object')S=Object.assign(fresh(),o)}}catch(e){}
if(!CH[S.ch]){S.ch=0;S.mi=0}if(!CH[S.ch].missions[S.mi])S.mi=0;
function save(){try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}}
const mkey=(c,m)=>c+'-'+m;
const SANDBOX=P(R`// Sandbox: write anything you like.
string hero = "Pixel";
int coins = 3;
for (int i = 1; i <= coins; i++) {
    cout << hero << " found coin " << i << endl;
}`,{inc:['string','vector']});

/* ---------- syntax highlight ---------- */
const HKW=new Set('if else while for do return break continue switch case default struct class const using namespace true false nullptr static_cast sizeof new delete auto'.split(' '));
const HTY=new Set('int double float bool char void long short unsigned string vector size_t'.split(' '));
const HSTD=new Set('cout cin endl cerr getline std'.split(' '));
function hl(code){
  const sn=new Set();for(const m of code.matchAll(/struct\s+(\w+)/g))sn.add(m[1]);
  const re=/(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|("(?:[^"\\\n]|\\.)*"?)|('(?:[^'\\\n]|\\.)*'?)|(^[ \t]*#[^\n]*)|(\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?[fFuUlL]*\b)|([A-Za-z_]\w*)/gm;
  let out='',last=0,m;
  while((m=re.exec(code))){out+=esc(code.slice(last,m.index));const t=m[0];let cls='';
    if(m[1])cls='com';else if(m[2]||m[3])cls='str';else if(m[4])cls='pp';else if(m[5])cls='num';
    else if(m[6]){if(HKW.has(t))cls='kw';else if(HTY.has(t)||sn.has(t))cls='ty';else if(HSTD.has(t))cls='std';else if(/^\s*\(/.test(code.slice(re.lastIndex,re.lastIndex+40)))cls='fn'}
    out+=cls?`<span class="s-${cls}">${esc(t)}</span>`:esc(t);last=re.lastIndex;if(!t)re.lastIndex++}
  return out+esc(code.slice(last))}

/* ---------- editor ---------- */
const ta=$('code'),hlEl=$('hl'),gutter=$('gutter'),lhl=$('lhl'),editor=$('editor');
let gutN=0,marks={err:0,warn:[],step:0};
function lh(){return parseFloat(getComputedStyle(ta).lineHeight)||22}
function syncEd(){hlEl.innerHTML=hl(ta.value)+'\n';const n=ta.value.split('\n').length;
  if(n!==gutN){gutter.innerHTML=Array.from({length:n},(_,i)=>`<div>${i+1}</div>`).join('');gutN=n;paintMarks()}
  sizeTa()}
function sizeTa(){ta.style.height=Math.max(hlEl.offsetHeight,editor.clientHeight)+'px'}
function paintMarks(){const kids=gutter.children;for(let i=0;i<kids.length;i++){const l=i+1;kids[i].className=l===marks.step?'stepl':l===marks.err?'errl':marks.warn.includes(l)?'warnl':''}
  const L=marks.step||marks.err;if(!L){lhl.hidden=true;return}
  lhl.hidden=false;lhl.className='lhl '+(marks.step?'step':'err');const h=lh();lhl.style.top=(12+(L-1)*h)+'px';lhl.style.height=h+'px'}
function setMarks(m){Object.assign(marks,m);paintMarks()}
function reveal(line){const h=lh(),top=12+(line-1)*h;if(top<editor.scrollTop+h||top>editor.scrollTop+editor.clientHeight-2*h)editor.scrollTop=Math.max(0,top-editor.clientHeight/3)}
function setCode(src){ta.value=src;syncEd();setMarks({err:0,warn:[],step:0});editor.scrollTop=0}
ta.addEventListener('input',()=>{syncEd();if(M&&running)stop('edited');if(marks.err||marks.warn.length)setMarks({err:0,warn:[]});saveCode()});
let saveT;function saveCode(){clearTimeout(saveT);saveT=setTimeout(()=>{if(S.inSandbox)S.sandbox=ta.value;else S.codes[mkey(S.ch,S.mi)]=ta.value;save()},300)}
function insert(text,sel0,sel1){const s=ta.selectionStart,e=ta.selectionEnd;ta.setRangeText(text,s,e,'end');if(sel0!=null){ta.selectionStart=s+sel0;ta.selectionEnd=s+(sel1??sel0)}ta.dispatchEvent(new Event('input'))}
ta.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();runBtn();return}
  if(e.key==='F10'){e.preventDefault();stepBtn();return}
  if(ta.readOnly)return;
  if(e.key==='Tab'&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();
    const v=ta.value,s=ta.selectionStart,ls=v.lastIndexOf('\n',s-1)+1;
    if(e.shiftKey){const m=v.slice(ls).match(/^ {1,4}/);if(m){ta.setRangeText('',ls,ls+m[0].length,'preserve');ta.selectionStart=ta.selectionEnd=Math.max(ls,s-m[0].length);ta.dispatchEvent(new Event('input'))}}
    else insert('    ');return}
  if(e.key==='Enter'&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();
    const v=ta.value,s=ta.selectionStart,ls=v.lastIndexOf('\n',s-1)+1;const cur=v.slice(ls,s);let ind=cur.match(/^\s*/)[0];
    const before=cur.trimEnd(),after=v.slice(ta.selectionEnd).match(/^[^\n]*/)[0];
    if(before.endsWith('{')){if(after.trim().startsWith('}')){insert('\n'+ind+'    \n'+ind,1+ind.length+4);return}ind+='    '}
    insert('\n'+ind);return}
  if(e.key==='}'&&!e.ctrlKey&&!e.metaKey){const v=ta.value,s=ta.selectionStart,ls=v.lastIndexOf('\n',s-1)+1;const cur=v.slice(ls,s);
    if(/^\s+$/.test(cur)&&cur.length>=4&&ta.selectionStart===ta.selectionEnd){e.preventDefault();ta.setRangeText(cur.slice(4)+'}',ls,s,'end');ta.dispatchEvent(new Event('input'))}}
});
$('keys').addEventListener('click',e=>{const b=e.target.closest('button');if(!b||ta.readOnly)return;const k=b.dataset.k;ta.focus();
  if(k==='TAB')insert('    ');else insert(k)});
new ResizeObserver(()=>{sizeTa();paintMarks()}).observe(hlEl);new ResizeObserver(sizeTa).observe(editor);

/* ---------- console ---------- */
const conOut=$('conOut'),con=$('con'),inrow=$('inrow'),stdin=$('stdin');let curOut=null,conChars=0;
function cw(text,cls){if(cls==='out'){if(!curOut){curOut=document.createElement('span');curOut.className='o';conOut.append(curOut)}
    curOut.append(text);conChars+=text.length;if(conChars>200000){conOut.firstChild&&conOut.firstChild.remove();conChars=150000}}
  else{if(curOut&&!/\n$/.test(curOut.textContent))curOut.append('\n');curOut=null;const d=document.createElement('div');d.className='cl '+cls;d.innerHTML=text;conOut.append(d)}
  con.scrollTop=con.scrollHeight}
function clearCon(){conOut.innerHTML='';curOut=null;conChars=0}
$('clearCon').onclick=()=>{clearCon();if(!running)cw('Console cleared.','sys')};
function showError(err,src,phase){const L=err.line,line=(src.split('\n')[L-1]??'');
  if(err.kind==='runtime'){cw(`<b>${esc(err.message)}</b>`,'err');if(L)cw(`happened on line ${L}:  ${esc(line.trim())}`,'where')}
  else{const head=err.kind==='link'?`/usr/bin/ld: main.o: in function '_start': `:`main.cpp:${L}${err.col?':'+err.col:''}: `;
    cw(`<span style="color:var(--term-dim)">${esc(head)}</span><b>${err.kind==='link'?'error: ':'error: '}</b>${esc(err.message)}`,'err');
    if(L&&line){cw(`${String(L).padStart(5)} | ${esc(line)}`,'src');if(err.col)cw(`      | ${' '.repeat(Math.max(0,err.col-1))}^`,'caret')}}
  if(err.tip)cw('▸ In plain English: '+esc(err.tip),'tip')}
function showWarn(w,src){const line=(src.split('\n')[w.line-1]??'');
  cw(`<span style="color:var(--term-dim)">main.cpp:${w.line}: </span>warning: ${esc(w.msg.replace(/^warning: /,''))}`,'warn');
  if(w.tip)cw('▸ '+esc(w.tip),'tip')}

/* ---------- memory view ---------- */
const memEl=$('mem');
function tcls(t){if(/[*&]$/.test(t)&&/\*$/.test(t))return 't-ptr';if(/^(int|long)/.test(t))return 't-int';if(/^double/.test(t))return 't-dbl';if(/^string/.test(t))return 't-str';if(/^bool/.test(t))return 't-bool';if(/^char/.test(t))return 't-char';return 't-agg'}
function cellVal(it){if(it.kind==='prim')return it.val;if(it.kind==='ptr')return it.target?'→'+it.target.replace(/^.*\./,'.'):it.val;return '…'}
function itemHTML(it){
  const tc=tcls(it.type);const fl=it.changed?' flash':'';
  if(it.kind==='ref')return `<div class="var ref ${tcls(it.type.replace('&',''))}${fl}" data-tid="${it.tid}"><div class="vh"><span class="tchip">${esc(it.type)}</span><span class="vn">${esc(it.name)}</span><span class="vv">${esc(it.val)}</span></div><div class="addr"><span class="arrow">same box as ${esc(it.target)}</span></div></div>`;
  if(it.kind==='prim')return `<div class="var ${tc}${fl}" data-cid="${it.id}"><div class="vh"><span class="tchip">${it.isConst?'const ':''}${esc(it.type)}</span><span class="vn">${esc(it.name)}</span><span class="vv${it.init?'':' garb'}" ${it.init?'':`title="Uninitialized: holds garbage ${esc(it.garbage)}"`}>${esc(it.val)}</span></div><div class="addr"><span>${it.addr}</span>${it.init?'':'<span style="color:var(--err)">uninitialized</span>'}</div></div>`;
  if(it.kind==='ptr')return `<div class="var t-ptr${fl}" data-cid="${it.id}" ${it.tid?`data-tid="${it.tid}"`:''}><div class="vh"><span class="tchip">${esc(it.type)}</span><span class="vn">${esc(it.name)}</span><span class="vv${it.val==='??'?' garb':''}">${esc(it.val)}</span></div><div class="addr"><span>${it.addr}</span>${it.target?`<span class="arrow">→ ${esc(it.target)}</span>`:it.val==='nullptr'?'<span>points at nothing</span>':it.val==='??'?'<span style="color:var(--err)">wild pointer</span>':''}</div></div>`;
  const head=`<div class="vh"><span class="tchip">${esc(it.type)}</span><span class="vn">${esc(it.name)}</span>${it.kind==='vector'?`<span class="vv" style="font-size:12px;color:var(--muted)">size ${it.items.length}</span>`:''}</div><div class="addr"><span>${it.addr}</span></div>`;
  if(it.kind==='struct')return `<div class="var t-agg${fl}" data-cid="${it.id}">${head}<div class="sub">${it.items.map(itemHTML).join('')}</div></div>`;
  const simple=it.items.every(x=>x.kind==='prim'||x.kind==='ptr');const MAX=48;const shown=it.items.slice(0,MAX);
  const more=it.items.length>MAX?`<span class="more">+${it.items.length-MAX} more</span>`:'';
  if(simple)return `<div class="var ${tc.replace('t-agg',tcls(it.type.replace(/^vector<|>$|\[.*$/g,'')))}${fl}" data-cid="${it.id}">${head}<div class="row">${shown.map(c=>`<div class="cell${c.changed?' flash':''}${c.init===false?' garb':''}" data-cid="${c.id}" ${c.tid?`data-tid="${c.tid}"`:''}><span class="cv">${esc(cellVal(c))}</span><span class="ci">${c.name}</span></div>`).join('')}${more}${!it.items.length?'<span class="more">empty</span>':''}</div></div>`;
  return `<div class="var t-agg${fl}" data-cid="${it.id}">${head}<div class="sub">${shown.map(c=>itemHTML({...c,name:'['+c.name+']'})).join('')}${more}</div></div>`}
function renderMem(frames,finished){
  if(!frames||!frames.length){memEl.innerHTML=`<p class="memempty">Press <b>Step</b> or <b>Run</b> to see your variables here.</p>`;return}
  memEl.innerHTML=frames.map(f=>`<section class="frame${f.top&&!finished?' top':''}${finished&&f.name==='main'?' done':''}"><header><b>${f.global?'global variables':esc(f.name)+'()'}</b>${f.callLine?`<span>called from line ${f.callLine}</span>`:''}</header><div class="cells">${f.items.length?f.items.map(itemHTML).join(''):'<p class="none">No variables yet</p>'}</div></section>`).join('')}
memEl.addEventListener('mouseover',e=>{const el=e.target.closest('[data-tid]');memEl.querySelectorAll('.target').forEach(x=>x.classList.remove('target'));if(el)memEl.querySelectorAll(`[data-cid="${el.dataset.tid}"]`).forEach(x=>x.classList.add('target'))});
memEl.addEventListener('mouseleave',()=>memEl.querySelectorAll('.target').forEach(x=>x.classList.remove('target')));

/* ---------- runner ---------- */
let M=null,running=false,mode=null,timer=null,pendingIn=undefined,runSrc='',runOut='',runWarns=[],stepDepth=1,lastLine=0,compiled=null;
const st=$('st'),stx=$('stx');
function status(cls,text,extra){st.className='st '+cls;st.textContent=text;stx.innerHTML=extra||''}
function buttons(){const live=!!M&&running;
  $('bRun').querySelector('span').textContent=live&&mode!=='run'?'Continue':'Run';
  $('bRun').disabled=live&&mode==='run'&&!waiting;
  $('bStop').disabled=!live;
  $('bWatch').querySelector('span').textContent=live&&mode==='watch'?'Pause':'Watch';
  ta.readOnly=live&&(mode==='step'||mode==='watch')}
let waiting=false;
function begin(m){
  clearTimeout(timer);clearCon();runSrc=ta.value;runOut='';runWarns=[];stepDepth=1;
  setMarks({err:0,warn:[],step:0});
  cw('<b>$</b> g++ -Wall main.cpp -o main','sys');
  const c=CPP.compile(runSrc);compiled=c;
  if(!c.ok){showError(c.error,runSrc);setMarks({err:c.error.line||0});if(c.error.line)reveal(c.error.line);
    status('bad',c.error.kind==='link'?'Link error':'Compile error',c.error.line?`on line ${c.error.line}. Nothing ran: fix the code and run again.`:'');
    renderMem(null);M=null;running=false;buttons();afterRun(false);return false}
  c.warnings.forEach(w=>showWarn(w,runSrc));setMarks({warn:c.warnings.map(w=>w.line)});
  cw('<b>$</b> ./main','sys');
  M=CPP.Machine(c.prog,{out:s=>{runOut+=s;cw(s,'out')},warn:w=>{runWarns.push(w);showWarn(w,runSrc)}});
  running=true;mode=m;pendingIn=undefined;waiting=false;return true}
function advance(){let r;
  try{r=M.next(pendingIn)}catch(err){pendingIn=undefined;crash(err);return false}
  pendingIn=undefined;
  if(r.done){finish(r.code);return false}
  if(r.input){askInput();return false}
  lastLine=r.line;if(mode!=='run')stepDepth=Math.max(stepDepth,M.depth);return true}
function pump(){if(!running)return;const t0=performance.now();
  while(performance.now()-t0<16){if(!advance())return}
  status('run','Running…',`line ${lastLine}`);timer=setTimeout(pump,0)}
function stepOnce(){if(!running)return false;M.clearChanged();const ok=advance();if(!running)return false;
  if(ok){setMarks({step:lastLine});reveal(lastLine);renderMem(M.view());status('pause','Paused',`line ${lastLine} runs next${M.depth>1?` · inside ${esc(M.view().slice(-1)[0].name)}()`:''}`)}
  return ok}
function watchTick(){if(!running||mode!=='watch')return;if(stepOnce())timer=setTimeout(watchTick,+$('speed').value)}
function askInput(){waiting=true;inrow.hidden=false;stdin.value='';con.scrollTop=con.scrollHeight;
  renderMem(M.view());if(mode!=='run'){setMarks({step:M.line});reveal(M.line)}
  status('wait','Waiting for input',`type in the console below and press Enter`);buttons();stdin.focus({preventScroll:true});con.scrollTop=con.scrollHeight}
stdin.addEventListener('keydown',e=>{if(e.key!=='Enter'||!waiting)return;e.preventDefault();const v=stdin.value;
  if(!curOut){curOut=document.createElement('span');curOut.className='o';conOut.append(curOut)}
  const s=document.createElement('span');s.className='in';s.textContent=v+'\n';curOut.append(s);
  inrow.hidden=true;waiting=false;pendingIn=v;buttons();
  if(mode==='run'){status('run','Running…');pump()}else{M.clearChanged();if(advance()){setMarks({step:lastLine});reveal(lastLine);renderMem(M.view());status('pause','Paused',`line ${lastLine} runs next`);if(mode==='watch')timer=setTimeout(watchTick,+$('speed').value)}}
  if(mode!=='run'&&running)ta.focus({preventScroll:true})});
function crash(err){running=false;waiting=false;inrow.hidden=true;clearTimeout(timer);
  if(curOut&&!/\n$/.test(curOut.textContent))curOut.append('\n');curOut=null;
  showError(err,runSrc);setMarks({step:0,err:err.line||0});if(err.line)reveal(err.line);
  renderMem(M.view(),true);
  status('bad',err.head==='loop'||/steps/.test(err.message)?'Stopped':'Crashed',err.line?`on line ${err.line}`:'');
  buttons();afterRun(false)}
function finish(code){running=false;waiting=false;inrow.hidden=true;clearTimeout(timer);
  if(curOut&&!/\n$/.test(curOut.textContent))curOut.append('\n');curOut=null;
  cw(`Program finished · exit code ${code}`,'done');setMarks({step:0});renderMem(M.view(),true);
  status('ok','Finished',`${M.info().steps.toLocaleString('en-US')} steps`);buttons();afterRun(true)}
function stop(why){if(!M||!running)return;running=false;waiting=false;inrow.hidden=true;clearTimeout(timer);
  if(curOut&&!/\n$/.test(curOut.textContent))curOut.append('\n');curOut=null;
  cw(why==='edited'?'^C  (stopped because you edited the code)':'^C  (stopped)','sys');setMarks({step:0});status('','Stopped','');buttons()}
function runBtn(){if(running&&M){if(waiting){stdin.focus();return}mode='run';buttons();status('run','Running…');setMarks({step:0});pump();return}
  if(begin('run')){buttons();status('run','Running…');pump()}}
function stepBtn(){if(running&&M){if(waiting){stdin.focus();return}clearTimeout(timer);mode='step';buttons();stepOnce();return}
  if(begin('step')){buttons();stepOnce()}}
function watchBtn(){if(running&&M){if(waiting){stdin.focus();return}if(mode==='watch'){clearTimeout(timer);mode='step';buttons();status('pause','Paused',`line ${lastLine} runs next`);return}mode='watch';buttons();watchTick();return}
  if(begin('watch')){buttons();watchTick()}}
$('bRun').onclick=runBtn;$('bStep').onclick=stepBtn;$('bWatch').onclick=watchBtn;$('bStop').onclick=()=>stop();
let armed=null;$('resetCode').onclick=e=>{const b=e.currentTarget;if(armed!==b){armed=b;b.classList.add('armed');b.textContent='Click again to reset';setTimeout(()=>{if(armed===b){armed=null;b.classList.remove('armed');b.textContent='Reset code'}},2600);return}
  armed=null;b.classList.remove('armed');b.textContent='Reset code';stop();setCode(S.inSandbox?SANDBOX:curM().start);saveCode();clearCon();cw('Code reset to the starting version.','sys');renderMem(null);status('','Ready','')};

/* ---------- missions ---------- */
const curM=()=>CH[S.ch].missions[S.mi];
const RANKS=[[0,'Rookie'],[80,'Tinkerer'],[200,'Coder'],[380,'Builder'],[560,'Engineer'],[760,'Wizard']];
const MAXXP=CH.reduce((s,c)=>s+c.missions.length*10+25,0);
function renderXP(){let r=RANKS[0];for(const x of RANKS)if(S.xp>=x[0])r=x;$('rank').textContent=r[1];$('xpText').textContent=S.xp+' XP';$('xpFill').style.width=Math.min(100,S.xp/MAXXP*100)+'%'}
function chDone(ci){return CH[ci].missions.filter((_,mi)=>S.done[mkey(ci,mi)]).length}
function renderChapters(){$('chapters').innerHTML=CH.map((c,ci)=>`<button class="chap${S.badges[ci]?' earned':''}" ${!S.inSandbox&&ci===S.ch?'aria-current="true"':''} data-ch="${ci}"><span class="num">${ci+1}</span><span class="nm">${esc(c.name)}</span><span class="ct">${chDone(ci)}/${c.missions.length}</span></button>`).join('')+
  `<button class="chap sb" ${S.inSandbox?'aria-current="true"':''} data-ch="sb"><span class="num">{ }</span><span class="nm">Sandbox</span></button>`}
$('chapters').addEventListener('click',e=>{const b=e.target.closest('.chap');if(!b)return;
  if(b.dataset.ch==='sb'){openSandbox();return}const ci=+b.dataset.ch;
  let mi=CH[ci].missions.findIndex((_,i)=>!S.done[mkey(ci,i)]);if(mi<0)mi=0;goMission(ci,mi,false)});
const KLAB={kw:'keyword',type:'type',name:'name',val:'value',op:'symbol',pp:'directive',fn:'tool'};
let showHint=false,showAns=false,justWon=false;
function anatHTML(a){return a?`<div class="anat">${a.map(([t,k,l])=>`<span class="tok k-${k}"><b>${esc(t)}</b><span>${l?esc(l):KLAB[k]}</span></span>`).join('')}</div>`:''}
function renderMission(){const card=$('mission');
  if(S.inSandbox){card.innerHTML=`<div class="eyebrow">Free play</div><h2>Sandbox</h2>
    <p class="explain">No goals, no checks. Write any program, run it, step through it. Field guide examples open here when you press Try.</p>
    <div class="goal"><div class="label">Ideas to try</div><ul class="ideas"><li>Print a multiplication table with two loops</li><li>Ask for a word and print it backwards</li><li>Create a vector of names and sort it (needs #include &lt;algorithm&gt;)</li><li>Write a function that tells you if a number is prime</li><li>Draw a diamond of stars</li></ul></div>
    <div class="actions"><button class="btn" id="backQuest">Back to chapter ${S.ch+1}</button><button class="btn ghost" id="blankSb">Blank program</button></div>`;
    $('backQuest').onclick=()=>goMission(S.ch,S.mi,false);$('blankSb').onclick=()=>{stop();setCode(P(R`// your code here
`));saveCode()};return}
  const ch=CH[S.ch],m=curM(),k=mkey(S.ch,S.mi),done=!!S.done[k];
  const allDone=chDone(S.ch)===ch.missions.length;
  let html=`${Trail.html(ch.story)}<div class="eyebrow">Chapter ${S.ch+1} · ${esc(ch.name)} · Mission ${S.mi+1} of ${ch.missions.length}</div><h2>${esc(m.title)}</h2>`;
  if(S.mi===0)html+=`<p class="intro">${ch.intro}</p>`;
  html+=`<div class="goal"><div class="label">Your goal</div><p>${m.goal}</p></div>`;
  html+=anatHTML(m.anat);html+=HowSteps.html(m.how);
  html+=`<p class="explain">${m.explain}</p>`;if(m.note)html+=`<p class="note">${m.note}</p>`;
  if(done&&justWon){const last=S.mi===ch.missions.length-1;
    html+=`<div class="won"><span><b>Mission complete!</b>${justWon===2?' +10 XP':''}</span><button class="btn" id="nextM">${last?(allDone?'Chapter reward':'Next mission'):'Next mission →'}</button></div>`}
  html+=`<div class="actions">${done&&!justWon?`<button class="btn" id="nextM">Next mission →</button>`:''}<button class="btn ghost" id="hintB">${showHint?'Hide hint':'Hint'}</button>${m.ans?`<button class="btn ghost" id="ansB">${showAns?'Hide answer':'Show answer'}</button>`:''}</div>`;
  if(showHint)html+=`<p class="hint">${esc(m.hint)}</p>`;
  if(showAns&&m.ans)html+=`<div class="ansbox"><pre>${hl(m.ans)}</pre><div class="actions"><button class="btn ghost" id="useAns">Put it in the editor</button></div></div>`;
  html+=`<div class="dots" aria-label="Missions in this chapter">${ch.missions.map((x,i)=>`<button class="dot${S.done[mkey(S.ch,i)]?' done':''}${i===S.mi?' cur':''}" data-mi="${i}" title="${esc(x.title)}" aria-label="Mission ${i+1}: ${esc(x.title)}">${i+1}</button>`).join('')}</div>`;
  card.innerHTML=html;
  $('hintB').onclick=()=>{showHint=!showHint;renderMission()};
  if($('ansB'))$('ansB').onclick=()=>{showAns=!showAns;renderMission()};
  if($('useAns'))$('useAns').onclick=()=>{stop();setCode(m.ans);saveCode();ta.focus()};
  if($('nextM'))$('nextM').onclick=nextMission;
  card.querySelectorAll('.dot').forEach(d=>d.onclick=()=>goMission(S.ch,+d.dataset.mi,false))}
function renderBadge(){const ch=CH[S.ch];const card=$('mission');
  card.innerHTML=`<div class="eyebrow">Chapter ${S.ch+1} complete</div><div class="badge-art">${S.ch+1}</div><h2>${esc(ch.badge)}</h2>
  <p class="explain">You finished <b>${esc(ch.name)}</b>. You can now use:</p><div class="learned">${ch.learned.map(x=>`<code>${esc(x)}</code>`).join('')}</div>
  <p class="note">Try Quick-fire to practice reading code fast, or open the Field guide to review.</p>
  <div class="actions">${S.ch<CH.length-1?`<button class="btn" id="nextCh">Start chapter ${S.ch+2}: ${esc(CH[S.ch+1].name)}</button>`:`<button class="btn" id="toSb">Open the sandbox</button>`}<button class="btn ghost" id="stay">Back to the chapter</button></div>`;
  if($('nextCh'))$('nextCh').onclick=()=>goMission(S.ch+1,0,false);if($('toSb'))$('toSb').onclick=openSandbox;
  $('stay').onclick=()=>{justWon=false;renderMission()}}
function nextMission(){const ch=CH[S.ch];
  if(S.mi<ch.missions.length-1){goMission(S.ch,S.mi+1,true);return}
  if(chDone(S.ch)===ch.missions.length){renderBadge();return}
  const mi=ch.missions.findIndex((_,i)=>!S.done[mkey(S.ch,i)]);goMission(S.ch,mi,false)}
function goMission(ci,mi,sequential){
  const carry=sequential&&CH[ci].missions[mi].keep?ta.value:null;
  stop();S.inSandbox=false;S.ch=ci;S.mi=mi;showHint=false;showAns=false;justWon=false;
  const k=mkey(ci,mi);const m=curM();
  const code=S.codes[k]??carry??m.start;setCode(code);if(carry&&!S.codes[k])S.codes[k]=carry;
  save();clearCon();cw(`Mission: ${esc(m.title)}`,'sys');renderMem(null);status('','Ready','');
  renderChapters();renderMission();buttons();
  if(window.innerWidth<820)$('mission').scrollIntoView({behavior:'smooth',block:'start'})}
function openSandbox(){stop();S.inSandbox=true;setCode(S.sandbox||SANDBOX);save();clearCon();cw('Sandbox: free play. Nothing is checked here.','sys');renderMem(null);status('','Ready','');renderChapters();renderMission();buttons()}
function afterRun(ok){if(S.inSandbox||!compiled)return;
  const info=M?M.info():{};const ctx=makeCtx({ok,out:runOut,src:runSrc,warnings:[...(compiled.warnings||[]),...runWarns],info,prog:compiled.prog,stepDepth});
  const m=curM(),k=mkey(S.ch,S.mi);let good=false;try{good=!!m.check(ctx)}catch(e){}
  if(!good||S.done[k]){if(good){justWon=1;renderMission()}return}
  S.done[k]=true;S.xp+=10;justWon=2;
  cw('✓ Mission complete! +10 XP','win');
  const ch=CH[S.ch];if(chDone(S.ch)===ch.missions.length&&!S.badges[S.ch]){S.badges[S.ch]=true;S.xp+=25;cw(`★ Chapter ${S.ch+1} complete: ${esc(ch.badge)} badge +25 XP`,'win')}
  save();renderXP();renderChapters();renderMission();const card=$('mission');card.classList.remove('pop');void card.offsetWidth;card.classList.add('pop')}

/* ---------- arcade ---------- */
function makeQ(){const pool=qfOpen(S.done);if(!pool.length)return null;for(let tries=0;tries<8;tries++){const t=pick(pool).gen();const src=P(t.body,{inc:t.inc,pre:t.pre});const r=CPP.runAll(src,null,20000);if(!r.ok)continue;
  const show=t.pre?`${t.pre}\n\nint main() {\n${t.body.split('\n').map(l=>'    '+l).join('\n')}\n}`:t.body;return {show,ans:r.out.trim(),why:t.why}}}
const norm=s=>s.replace(/\s+$/,'').replace(/^\s+/,'');
let F={on:false,score:0,streak:0,left:90,q:null,misses:[],int:null};
function fireStage(){const st=$('fStage');
  if(!F.on&&!F.q){const ex=makeQ();
    if(!ex){st.innerHTML=`<div class="example"><div class="label" style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)">Locked for now</div><p class="fb" style="margin:0">Quick-fire only asks about things the quest has already taught. Finish all of <b>Chapter 1: ${esc(CH[0].name)}</b> first, and the first questions open up. Each later chapter you finish adds more.</p></div><div class="actions" style="margin-top:12px"><button class="btn" id="fGo">Go to the quest</button></div>`;$('fGo').onclick=()=>switchTab('quest');return}
    const open=qfOpen(S.done).length;
    st.innerHTML=`<div class="example"><div class="label" style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)">Example round</div><pre class="snip">${hl(ex.show)}</pre><p class="fb" style="margin:0">It prints <code>${esc(ex.ans)}</code>. ${esc(ex.why)}</p></div>${open<QT.length?`<p class="lede" style="margin:0">Questions from chapters you have finished are open. Finish more chapters to unlock the rest.</p>`:''}<div class="actions"><button class="btn" id="fGo">Start a 90-second round</button></div>`;$('fGo').onclick=fireStart;return}
  if(!F.on){st.innerHTML=`<p class="q">Time! You scored ${F.score}.${F.score>=S.best&&F.score>0?' New best!':''}</p>${F.misses.length?`<p class="lede" style="margin:0">Review the ones you missed:</p><ul class="misses">${F.misses.map(m=>`<li><pre class="snip">${hl(m.show)}</pre><span>Prints <code>${esc(m.ans)}</code>${m.got?` · you wrote <code>${esc(m.got)}</code>`:''}. ${esc(m.why)}</span></li>`).join('')}</ul>`:'<p class="fb good">No misses. Clean round.</p>'}<div class="actions"><button class="btn" id="fGo">Play again</button></div>`;$('fGo').onclick=fireStart;return}
  st.innerHTML=`<p class="q">What does this print?</p><pre class="snip">${hl(F.q.show)}</pre><div class="fterm"><span>output ›</span><input id="fIn" aria-label="Type the exact output" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></div><p class="fb" id="fFb"></p><div class="actions"><button class="btn ghost" id="fSkip">Skip</button></div>`;
  const inp=$('fIn');inp.focus();inp.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();fireAnswer(inp.value)}};$('fSkip').onclick=()=>fireAnswer(null)}
function fireStats(){$('fScore').textContent=F.score;$('fStreak').textContent=F.streak;$('fBest').textContent=S.best||0;$('fTime').textContent=F.left;$('fTimer').style.width=(F.left/90*100)+'%'}
function fireStart(){const q0=makeQ();if(!q0)return;F={on:true,score:0,streak:0,left:90,q:q0,misses:[],int:null};fireStats();fireStage();
  F.int=setInterval(()=>{F.left--;fireStats();if(F.left<=0){clearInterval(F.int);F.on=false;if(F.score>(S.best||0)){S.best=F.score;save()}fireStats();fireStage()}},1000)}
function fireAnswer(v){if(!F.on)return;const q=F.q;const fb=$('fFb');
  if(v!==null&&norm(v)===norm(q.ans)){F.streak++;F.score+=10+Math.min(F.streak-1,5)*2;fb.className='fb good';fb.textContent='Correct!'+(F.streak>1?` Streak ×${F.streak}`:'')}
  else{F.streak=0;F.misses.push({...q,got:v});fb.className='fb bad';fb.innerHTML=`It prints <code>${esc(q.ans)}</code>. ${esc(q.why)}`}
  fireStats();const delay=fb.classList.contains('good')?550:2200;const inp=$('fIn');inp.disabled=true;
  setTimeout(()=>{if(!F.on)return;F.q=makeQ();fireStage()},delay)}

/* ---------- field guide ---------- */
const G=[
 {sec:'Output & input',cards:[
  {c:'cout <<',what:'Prints to the console. Chain several values with more <<. Nothing is added between them, not even spaces.',ex:[['cout << "Score: " << 42 << endl;','prints Score: 42 and ends the line']]},
  {c:'endl  and  "\\n"',what:'Both end the line. \\n goes inside text; endl goes between <<.',ex:[['cout << "one\\ntwo" << endl;','two lines from one cout']]},
  {c:'cin >>',what:'Waits for the keyboard and stores what was typed. Reads one word or number; stops at spaces.',ex:[['int age;\ncin >> age;\ncout << age * 2;','type a number in the console']]},
  {c:'getline',what:'Reads a whole line, spaces included. After a cin >>, add cin.ignore(); first to skip the leftover Enter.',ex:[['string line;\ngetline(cin, line);\ncout << "[" << line << "]";','type a sentence']]},
 ]},
 {sec:'Variables & math',cards:[
  {c:'Declare a variable',what:'Type, name, starting value. Create it once; after that, assign without the type.',ex:[['int coins = 10;\ncoins = coins + 5;\ncout << coins;','prints 15']]},
  {c:'+  -  *  /  %',what:'Math operators. int / int drops the decimal part. % is the remainder.',ex:[['cout << 17 / 5 << " " << 17 % 5 << " " << 17.0 / 5;','3 2 3.4']]},
  {c:'++  --  +=  -=',what:'Shortcuts for changing a variable by itself.',ex:[['int lvl = 1;\nlvl++;\nlvl += 3;\ncout << lvl;','prints 5']]},
  {c:'const',what:'A variable whose value can never change. Name it in ALL_CAPS.',ex:[['const double PI = 3.14159;\ncout << PI * 2 * 2;','area of a circle with radius 2']]},
  {c:'sqrt  pow  abs',what:'Math functions from <cmath>. They work with doubles.',inc:['cmath'],ex:[['cout << sqrt(16) << " " << pow(2, 10) << " " << abs(-7);','4 1024 7']]},
  {c:'to_string  stoi',what:'Turn a number into text, or text into a number.',ex:[['string s = "Level " + to_string(3);\nint n = stoi("42");\ncout << s << " " << n + 1;','Level 3 43']]},
 ]},
 {sec:'Decisions',cards:[
  {c:'if / else if / else',what:'Runs the first block whose condition is true. With just one line inside, the braces are optional.',ex:[['int hp = 35;\nif (hp > 50) {\n    cout << "healthy";\n} else if (hp > 20) {\n    cout << "hurt";\n} else {\n    cout << "critical";\n}','prints hurt']]},
  {c:'==  !=  <  >  <=  >=',what:'Comparisons give true or false. == compares; = stores.',ex:[['int a = 3;\ncout << (a == 3) << (a != 3) << (a < 10);','prints 101']]},
  {c:'&&  ||  !',what:'and, or, not. Combine conditions; use parentheses to make the order clear.',ex:[['bool key = true;\nint lvl = 4;\nif (key && lvl >= 3) cout << "open";','prints open']]},
  {c:'switch',what:'Jumps to a matching case. Every case needs break; or it falls through to the next one.',ex:[['int day = 2;\nswitch (day) {\n    case 1: cout << "Mon"; break;\n    case 2: cout << "Tue"; break;\n    default: cout << "?";\n}','prints Tue']]},
  {c:'rand()',what:'A pseudo-random number. rand() % 6 + 1 gives 1 to 6. Call srand(time(0)) once at the start for different numbers each run.',inc:['cstdlib','ctime'],ex:[['srand(time(0));\ncout << rand() % 6 + 1;','a dice roll']]},
 ]},
 {sec:'Loops',cards:[
  {c:'while',what:'Repeats while the condition is true. Something inside must change it.',ex:[['int n = 3;\nwhile (n > 0) {\n    cout << n << " ";\n    n--;\n}','3 2 1']]},
  {c:'for',what:'Start; keep going while; step. The usual way to count.',ex:[['for (int i = 0; i < 5; i++) {\n    cout << i << " ";\n}','0 1 2 3 4']]},
  {c:'do … while',what:'Like while, but checks at the end, so the body always runs at least once. Good for menus.',ex:[['int n = 10;\ndo {\n    cout << n;\n} while (n < 5);','prints 10 once']]},
  {c:'break  continue',what:'break leaves the loop. continue skips to the next round.',ex:[['for (int i = 1; i <= 10; i++) {\n    if (i == 6) break;\n    if (i % 2 == 0) continue;\n    cout << i;\n}','prints 135']]},
  {c:'Nested loops',what:'A loop inside a loop. The inner one runs fully for each round of the outer one.',ex:[['for (int r = 1; r <= 3; r++) {\n    for (int c = 1; c <= 3; c++) cout << r * c << " ";\n    cout << endl;\n}','a times table']]},
 ]},
 {sec:'Functions',cards:[
  {c:'void function',what:'A named block of code that does a job and returns nothing. Define it above main.',pre:'void banner() {\n    cout << "=== QUEST ===" << endl;\n}',ex:[['banner();\nbanner();','call it twice']]},
  {c:'return a value',what:'The type before the name is what comes back.',pre:'int add(int a, int b) {\n    return a + b;\n}',ex:[['cout << add(2, 3);','prints 5']]},
  {c:'& reference parameter',what:'Without & the function gets a copy. With & it works on the caller\'s variable.',pre:'void addGold(int& gold, int amount) {\n    gold += amount;\n}',ex:[['int gold = 10;\naddGold(gold, 5);\ncout << gold;','prints 15']]},
  {c:'Prototype',what:'Declares a function above main so you can write its body below. Ends with ;',ex:[['// int area(int w, int h);   <- above main\n// int area(int w, int h) { return w * h; }   <- below main\ncout << "see the Functions chapter";','']]},
 ]},
 {sec:'Collections',cards:[
  {c:'Array',what:'Fixed number of boxes in a row. Indexes run from 0 to size − 1.',ex:[['int s[3] = {7, 8, 9};\ncout << s[0] << s[2];','prints 79']]},
  {c:'vector',what:'An array that grows. Needs #include <vector>.',inc:['vector'],ex:[['vector<int> v;\nv.push_back(4);\nv.push_back(2);\ncout << v.size() << " " << v[1];','prints 2 2']]},
  {c:'Range-for',what:'Visit every element in order, no index needed. Add & to change elements in place.',inc:['vector'],ex:[['vector<int> v = {1, 2, 3};\nfor (int& x : v) x *= 10;\nfor (int x : v) cout << x << " ";','10 20 30']]},
  {c:'string tools',what:'length(), s[i], substr(start, count), find(text), += to add text.',ex:[['string s = "dragon";\ncout << s.length() << " " << s[0] << " " << s.substr(1, 3);','6 d rag']]},
  {c:'sort',what:'Sorts a vector from smallest to biggest. Needs #include <algorithm>.',inc:['vector','algorithm'],ex:[['vector<int> v = {5, 1, 4};\nsort(v.begin(), v.end());\nfor (int x : v) cout << x;','prints 145']]},
 ]},
 {sec:'Structs & pointers',cards:[
  {c:'struct',what:'Your own type made of named fields. Ends with };',pre:'struct Item {\n    string name;\n    int price;\n};',ex:[['Item sword = {"Sword", 50};\nsword.price -= 10;\ncout << sword.name << " " << sword.price;','Sword 40']]},
  {c:'&x  address-of',what:'Where a variable lives in memory.',ex:[['int x = 5;\ncout << &x;','an address like 0x7ffd...']]},
  {c:'int* p  pointer',what:'Stores an address. *p follows it to read or change the value.',ex:[['int x = 5;\nint* p = &x;\n*p = 8;\ncout << x;','prints 8']]},
  {c:'nullptr',what:'A pointer that points at nothing. Check before using * on it.',ex:[['int* p = nullptr;\nif (p == nullptr) cout << "empty";','prints empty']]},
  {c:'->',what:'Reach a field through a pointer to a struct. p->hp is short for (*p).hp.',pre:'struct Mob {\n    int hp;\n};',ex:[['Mob m = {20};\nMob* p = &m;\np->hp -= 5;\ncout << m.hp;','prints 15']]},
 ]},
];
const ERRS=[
 ["expected ';' before '…'",'A statement is missing its semicolon.','Look at the end of the line before the one reported, and add ;'],
 ["'x' was not declared in this scope",'C++ has never seen that name here: a typo, a variable created inside other { }, or a missing #include.','Check spelling (names are case-sensitive), declare it with a type first, or add the right #include.'],
 ["'cout' was not declared … did you mean 'std::cout'?",'The standard library names live in std.','Add using namespace std; below the #include lines, or write std::cout.'],
 ["expected '}' at end of input",'A { never got closed.','Count your braces. Each { needs a matching }.'],
 ["cannot convert 'string' to 'int'",'You put text where a number belongs.','Remove the quotes, change the variable type, or convert with stoi().'],
 ["no match for 'operator+' (operand types are 'string' and 'int')",'You tried to add a number to text.','Convert the number first: "Level " + to_string(n)'],
 ["no match for 'operator<<' … 'vector<int>'",'cout can\'t print a whole vector or struct.','Loop over it and print each element or field.'],
 ["too few arguments to function …",'The call doesn\'t pass the number of values the function expects.','Match the parameter list exactly.'],
 ["assignment of read-only variable",'You tried to change a const.','Remove const, or don\'t change it.'],
 ["warning: suggest parentheses around assignment used as truth value",'You wrote = in a condition where you meant ==.','Use == to compare.'],
 ["warning: … is used uninitialized",'You read a variable before giving it a value. It holds garbage.','Give it a starting value when you create it.'],
 ["Segmentation fault (core dumped)",'The program touched memory it doesn\'t own: usually a null or unset pointer, or going far past the end of an array.','Check pointers before using *, and keep indexes between 0 and size − 1.'],
 ["Floating point exception (core dumped)",'A whole-number division or % by zero.','Check the divisor is not 0 before dividing.'],
 ["undefined reference to 'main'",'The program has no main function, or it is misspelled.','Every program needs int main() { ... }'],
];
const TYPES=[['int','whole numbers, about ±2.1 billion','int lives = 3;',4],['double','numbers with decimals','double speed = 2.5;',8],['bool','true or false','bool alive = true;',1],['char','one character','char grade = \'A\';',1],['string','text of any length','string name = "Pixel";',32],['long long','very big whole numbers','long long stars = 9000000000;',8]];
function renderGuide(){const g=$('guide');
  const anat=[['#include <iostream>',1],['using namespace std;',2],['',0],['int main() {',3],['    int score = 10;',4],['    cout << "Score: " << score << endl;',5],['    return 0;',6],['}',0]];
  g.innerHTML=`<div><h2>Field guide</h2><p class="lede">Everything from the quest on one page, plus a few extras to look ahead to (like <code>do … while</code>, <code>-&gt;</code> and <code>to_string</code>). Press <b>Try</b> on any example to open it in the sandbox and run it.</p></div>
  <section class="gsec"><h3>How a C++ program runs</h3><p>C++ is a compiled language: your text is translated into machine code before anything runs. Errors can happen at each stage, and the console tells you which.</p>
   <div class="panel pipe">${[['1','main.cpp','You write C++ source code as plain text.',''],['2','g++ compiler','Checks the code follows the rules, then translates it to machine code.','Compile errors stop here. Warnings let it continue.'],['3','linker','Joins your code with the libraries it uses, like iostream.','Link errors: a missing main or function body.'],['4','./main runs','The CPU runs main from top to bottom.','Crashes, endless loops and wrong answers happen here.']].map(s=>`<div class="stage"><span class="n">${s[0]}</span><h4>${s[1]}</h4><p>${s[2]}</p>${s[3]?`<span class="fail${s[0]==='2'?'':' w'}">${s[3]}</span>`:''}</div>`).join('')}</div></section>
  <section class="gsec"><h3>Anatomy of a program</h3><div class="panel anatomy"><pre>${anat.map(([l,n])=>`<span class="al"${n?` data-n="${n}"`:''}>${hl(l)||' '}</span>`).join('')}</pre><ol>
   <li><b>Directive.</b> Copies in the iostream library so you can use cout and cin.</li><li><b>Namespace.</b> Lets you write cout instead of std::cout.</li><li><b>main.</b> Where every program starts. It returns an int to the operating system.</li><li><b>Variable.</b> A box named score holding the int 10.</li><li><b>Output.</b> Sends text and the value of score to the console, then ends the line.</li><li><b>Return 0.</b> Tells the operating system the program finished without problems.</li></ol></div></section>
  <section class="gsec"><h3>Types at a glance</h3><div class="panel tbl"><table><thead><tr><th>Type</th><th>Holds</th><th>Example</th><th>Bytes</th></tr></thead><tbody>${TYPES.map(t=>`<tr><td><code>${t[0]}</code></td><td>${t[1]}</td><td><code>${esc(t[2])}</code></td><td><div class="bytes" title="${t[3]} bytes">${'<i></i>'.repeat(Math.min(t[3],16))}${t[3]>16?'<span style="font-size:12px;color:var(--muted);margin-left:4px">'+t[3]+'</span>':''}</div></td></tr>`).join('')}</tbody></table></div></section>
  ${G.map((s,si)=>`<section class="gsec"><h3>${esc(s.sec)}</h3><div class="cards">${s.cards.map((c,ci)=>`<div class="card panel"><h4>${esc(c.c)}</h4><p>${esc(c.what)}</p>${c.pre?`<div class="exrow"><pre>${hl(c.pre)}</pre></div>`:''}<div class="ex">${c.ex.map((x,xi)=>`<div class="exrow"><div class="top"><pre>${hl(x[0])}</pre><button class="try" data-g="${si}-${ci}-${xi}">Try</button></div>${x[1]?`<small>${esc(x[1])}</small>`:''}</div>`).join('')}</div></div>`).join('')}</div></section>`).join('')}
  <section class="gsec"><h3>Error decoder</h3><p>What the compiler says, what it means, and how to fix it.</p><div class="errs">${ERRS.map(e=>`<div class="panel errc"><div class="m">${esc(e[0])}</div><div><div class="w">${esc(e[1])}</div><div class="f">${esc(e[2])}</div></div></div>`).join('')}</div></section>`;
  g.querySelectorAll('.try').forEach(b=>b.onclick=()=>{const [si,ci,xi]=b.dataset.g.split('-').map(Number);const c=G[si].cards[ci];const code=P(c.ex[xi][0],{inc:c.inc,pre:c.pre});
    S.inSandbox=true;S.sandbox=code;save();switchTab('quest');stop();setCode(code);clearCon();cw('Loaded from the field guide. Press Run or Step.','sys');renderMem(null);status('','Ready','');renderChapters();renderMission();buttons()})}

/* ---------- tabs ---------- */
function switchTab(t){document.querySelectorAll('.tabs button').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===t));
  ['quest','fire','guide'].forEach(x=>$('tab-'+x).hidden=x!==t);if(t==='quest')syncEd();if(t==='fire'&&!F.on)fireStage()}
document.querySelector('.tabs').addEventListener('click',e=>{const b=e.target.closest('button');if(b)switchTab(b.dataset.tab)});
document.addEventListener('keydown',e=>{if(e.key==='F10'&&!$('tab-quest').hidden&&document.activeElement!==ta){e.preventDefault();stepBtn()}});

/* ---------- boot ---------- */
renderXP();renderChapters();renderGuide();fireStats();
if(S.inSandbox)setCode(S.sandbox||SANDBOX);else setCode(S.codes[mkey(S.ch,S.mi)]??curM().start);
renderMission();renderMem(null);buttons();
cw(S.inSandbox?'Sandbox: free play. Nothing is checked here.':(Object.keys(S.done).length?`Welcome back. Mission: ${esc(curM().title)}`:'Welcome to C++ Quest. Read your mission, then press Run.'),'sys');
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>{syncEd();paintMarks()});
})();

