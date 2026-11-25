
/* Builds the helper object every mission check receives. */
function makeCtx(src,res,inputs){const I=res.interp;const g=I?I.glob.vars:new Map();
  const out=res.out||'';const lines=out.replace(/\n$/,'').split('\n').map(l=>l.replace(/\s+$/,'')).filter((l,i,a)=>!(a.length===1&&l===''));
  const code=src.split('\n').map(l=>{let q=null,o='';for(let i=0;i<l.length;i++){const ch=l[i];if(q){o+=ch;if(ch==='\\'){o+=l[++i]||'';continue}if(ch===q)q=null;continue}if(ch==='"'||ch==="'"){q=ch;o+=ch;continue}if(ch==='#')break;o+=ch}return o}).join('\n');
  const c={src,code,out,lines,err:res.error,inputs:inputs||[],
    has:n=>g.has(n),type:n=>g.has(n)?PY.tname(g.get(n)):null,val:n=>g.has(n)?PY.toJS(g.get(n)):undefined,
    fn:n=>g.has(n)&&g.get(n) instanceof PY.PyFunc,
    printed:t=>lines.some(l=>l.trim()===String(t)),printedI:t=>lines.some(l=>l.trim().toLowerCase()===String(t).toLowerCase()),
    call:(n,...a)=>PY.callUser(res,n,a)};
  return c}
if(typeof module!=='undefined')module.exports=makeCtx;
/* ---------- Python Quest: chapters and missions ---------- */
const CH=[
{name:'First words',badge:'Torn Note',story:'A torn note on the front door says "read me out loud"; make Python speak it, read the error when it stumbles, and take down the note, the first half of the Last Page.',intro:'A torn note on the front door of Quillby Library says "read me out loud". Every program is a list of instructions that Python reads from top to bottom. The first instruction most people learn is print, which shows something on the screen.',
 learned:['print()','"text"','numbers','# comments','reading errors'],
 missions:[
 {title:'Say hello',goal:'Read the note out loud: make Python show <code>Welcome to Quillby Library!</code> in the console (the output panel under your editor).',
  anat:[['print','fn'],['(','br'],['"Welcome to Quillby Library!"','str'],[')','br']],
  explain:'<code>print</code> is a <b>function</b>: a built-in tool that does a job. The round brackets hold what you give it. The quotes tell Python this is <b>text</b> (Python calls text a <i>string</i>). A line starting with <code>#</code> is a note Python ignores; type your code below it.',
  note:'Press <kbd>Ctrl</kbd>+<kbd>Enter</kbd> (or the Run button) to run your code.',
  starter:'# Type your code below this line\n',answer:'print("Welcome to Quillby Library!")',
  check:c=>c.printed('Welcome to Quillby Library!')||(c.printedI('welcome to quillby library!')?'Close! Python is picky about capital letters and punctuation. Match it exactly: Welcome to Quillby Library!':'The console should show exactly: Welcome to Quillby Library!')},
 {title:'Read the whole note',goal:'Print <b>two lines</b>: first <code>The note says:</code>, then <code>Read me out loud</code> on the next line.',
  anat:[['print','fn'],['("The note says:")','str']],
  explain:'Each <code>print</code> puts its text on a new line. Python runs line 1, then line 2, in order. That order is how every program works.',
  starter:'print("The note says:")\n',answer:'print("The note says:")\nprint("Read me out loud")',
  check:c=>c.lines.length>=2&&c.lines[0]==='The note says:'&&c.lines[1]==='Read me out loud'?true:c.lines[0]!=='The note says:'?'The first line should be exactly: The note says:':'The second line should be exactly: Read me out loud'},
 {title:'Numbers do math',goal:'Add up the day\'s late fees: print the answer to <code>7 + 5</code>. Let Python do the adding, so <b>no quotes</b> this time.',
  anat:[['print','fn'],['(','br'],['7','num'],['+','op'],['5','num'],[')','br']],
  explain:'Without quotes, <code>7</code> is a <b>number</b>, and Python calculates <code>7 + 5</code> before printing it. Python works out the inside of the brackets first.',
  starter:'',answer:'print(7 + 5)',
  check:c=>c.printed('12')&&/\+/.test(c.code)?true:c.printed('7 + 5')?'You printed the text "7 + 5". Remove the quotes so Python does the math.':'The console should show 12, calculated with +.'},
 {title:'Text is not a number',goal:'Inky copied the fees into the ledger as text. Run <code>print("7" + "5")</code> and see what happens.',
  anat:[['print','fn'],['"7"','str'],['+','op'],['"5"','str']],
  explain:'With quotes, <code>"7"</code> is text, not a number. Adding two pieces of text glues them together. Programmers call this <b>concatenation</b>. So you get <code>75</code>, not 12.',
  note:'Look at the memory map later: text boxes are green, whole numbers are blue.',
  starter:'',answer:'print("7" + "5")',
  check:c=>c.printed('75')||'The console should show 75 (two pieces of text joined).'},
 {title:'Leave a note',goal:'Leave a note for Miss Quill: write a <b>comment</b> (a line starting with <code>#</code>), then print anything you like below it.',
  anat:[['# this is a note','cm','comment'],['print','fn'],['("...")','str']],
  explain:'Python ignores everything after a <code>#</code> on a line. Comments are notes for humans: what the code does, or a reminder for later.',
  starter:'',answer:'# A note for Miss Quill\nprint("Opening the library...")',
  check:c=>!/^\s*#/m.test(c.src)?'Add a line that starts with # .':c.lines.length?true:'Now add a print below your comment.'},
 {title:'Fix your first bug',goal:'The door code crashes. Run it, read the red error, and fix it so it prints <code>The door is open!</code>.',
  anat:[['print','fn'],['(','br'],['"The door is open!"','str'],[')','br','missing?']],
  explain:'Errors are normal, and every programmer sees them all day. Python tells you <b>what</b> went wrong and <b>which line</b>. Here a bracket was opened and never closed.',
  starter:'print("The door is open!"\n',answer:'print("The door is open!")',
  check:c=>c.printed('The door is open!')||'Close the bracket so the line reads print("The door is open!")'}
 ]},
{name:'Variables',badge:'Brass Key',story:'Miss Quill\'s drawers each need a label; store your name and the coin count, and find a brass key in the labelled drawer.',intro:'Each drawer in Miss Quill\'s desk needs a label, and so does each variable. A variable is a labelled box that stores a value so you can use it later. Watch the memory map: every variable you create appears there as a box.',
 learned:['name = value','int, float, str, bool','x = x + 1','+= and -=','f"...{x}..."','NameError'],
 missions:[
 {title:'Make a box',goal:'Label the first drawer: store the text <code>"Nell"</code> in a variable called <code>reader</code>, then print <code>reader</code>.',
  anat:[['reader','var'],['=','op','assign'],['"Nell"','str']],
  explain:'The <code>=</code> sign means <b>put the value on the right into the box on the left</b>. It is not "equals" from math class. When you write <code>print(reader)</code> with no quotes, Python looks inside the box.',
  starter:'',answer:'reader = "Nell"\nprint(reader)',
  check:c=>c.type('reader')!=='str'?'Make a variable called reader that holds text, like reader = "Nell"':!c.printed(c.val('reader'))?'Now print(reader) so the name appears. No quotes around reader!':true},
 {title:'Number boxes',goal:'Fill the ink and coin drawers: set <code>ink</code> to <code>100</code> and <code>coins</code> to <code>25</code>. Print both.',
  anat:[['ink','var'],['=','op'],['100','num']],
  explain:'Whole numbers are called <b>integers</b> (<code>int</code>). Notice the memory map: two blue boxes with labels.',
  note:'Variable names: lowercase, no spaces (use_underscores), and they cannot start with a digit.',
  starter:'ink = 100\n',answer:'ink = 100\ncoins = 25\nprint(ink)\nprint(coins)',
  check:c=>c.val('ink')!==100?'ink should hold 100':c.val('coins')!==25?'Make coins hold 25 (no quotes, it is a number)':!(c.printed('100')&&c.out.includes('25'))?'Print both ink and coins.':true},
 {title:'Change what\'s inside',goal:'Miss Quill tips you 10 coins. Use <code>coins = coins + 10</code> so <code>coins</code> goes from 25 to 35, then print it.',
  anat:[['coins','var'],['=','op'],['coins','var'],['+','op'],['10','num']],
  explain:'Python works out the right side first (<code>25 + 10</code>), then puts the result back into the same box. After running, drag the <b>Watch it run</b> slider to see the box change.',
  starter:'coins = 25\n',answer:'coins = 25\ncoins = coins + 10\nprint(coins)',
  check:c=>c.val('coins')!==35?'coins should end at 35':!/coins\s*=\s*coins\s*\+|coins\s*\+=/.test(c.code)?'Use coins = coins + 10 instead of typing 35 directly.':!c.printed('35')?'Print coins at the end.':true},
 {title:'The shortcut',goal:'Inky knocks over the inkwell and 30 ink spills. Use <code>-=</code> to take 30 from <code>ink</code> (100 becomes 70) and print it.',
  anat:[['ink','var'],['-=','op','subtract & store'],['30','num']],
  explain:'<code>ink -= 30</code> is short for <code>ink = ink - 30</code>. There is also <code>+=</code>, and matching shortcuts for the other maths symbols (you will meet them in the next chapter). You will use <code>+=</code> constantly for scores and counters.',
  starter:'ink = 100\n',answer:'ink = 100\nink -= 30\nprint(ink)',
  check:c=>!/ink\s*-=/.test(c.code)?'Use the -= shortcut.':c.val('ink')!==70?'ink should end at 70.':c.printed('70')||'Print ink.'},
 {title:'Four kinds of value',goal:'Record the late fee and the opening sign: set <code>fee = 1.5</code> and <code>open_now = True</code>. Then print <code>type(fee)</code> and <code>type(open_now)</code>.',
  anat:[['type','fn'],['(','br'],['fee','var'],[')','br']],
  explain:'Every value has a <b>type</b>. <code>int</code> = whole number, <code>float</code> = number with a decimal point, <code>str</code> = text, <code>bool</code> = <code>True</code> or <code>False</code>. <code>type()</code> tells you which one a value is.',
  note:'True and False start with a capital letter and have no quotes. Printing a type shows a label like <code>&lt;class \'float\'&gt;</code>: the word after <code>class</code> is the type. Python writes text inside labels and lists with single quotes, and <code>\'hi\'</code> is the same text as <code>"hi"</code>.',
  starter:'',answer:'fee = 1.5\nopen_now = True\nprint(type(fee))\nprint(type(open_now))',
  check:c=>c.type('fee')!=='float'?'fee should be 1.5 (a float).':c.type('open_now')!=='bool'?'open_now should be True (capital T, no quotes).':c.out.includes("<class 'float'>")&&c.out.includes("<class 'bool'>")?true:'Print type(fee) and type(open_now).'},
 {title:'Mix text and values',goal:'Print the sentence <code>Nell has 70 ink and 35 coins</code> using an <b>f-string</b> and the three variables.',
  anat:[['f','kw','f-string'],['"','str'],['{reader}','var','slot'],[' has ','str'],['{ink}','var','slot'],['...','str'],['"','str']],
  explain:'Put an <code>f</code> before the quotes, then write variable names inside <code>{curly brackets}</code>. Python swaps each <code>{name}</code> for the value in that box. You can even put a small calculation inside the braces: <code>{2 + 3}</code> shows 5.',
  starter:'reader = "Nell"\nink = 70\ncoins = 35\n',answer:'reader = "Nell"\nink = 70\ncoins = 35\nprint(f"{reader} has {ink} ink and {coins} coins")',
  check:c=>!/f["']/.test(c.code)?'Use an f-string: print(f"...")':c.printed(`${c.val('reader')} has ${c.val('ink')} ink and ${c.val('coins')} coins`)||'Make it read exactly: Nell has 70 ink and 35 coins'},
 {title:'Bug hunt: the missing box',goal:'This crashes with a <code>NameError</code>. Find out why and fix it.',
  anat:[['Reader','var','≠ reader']],
  explain:'Python is <b>case-sensitive</b>: <code>reader</code> and <code>Reader</code> are two different names. A <code>NameError</code> means "I have no box with that name".',
  starter:'reader = "Kai"\nprint("Welcome back,")\nprint(Reader)\n',answer:'reader = "Kai"\nprint("Welcome back,")\nprint(reader)',
  check:c=>c.printed('Kai')||'Print the reader variable so Kai appears.'}
 ]},
{name:'Math & text',badge:'Ledger Page',story:'The ledger desk is a mess of late fees and book titles; add, divide and slice them, and find the stamped ledger page.',intro:'The ledger desk is a mess of late fees and book titles. Python is a great calculator and handles text well too. This chapter covers the operators, then how to slice and change text.',
 learned:['+ - * /','// and %','**','len()','.upper()','s[0], s[-1]','s[1:4]','input()','int()'],
 missions:[
 {title:'Late-fee calculator',goal:'Three late books cost 7 coins each. Store <code>fees = 7 * 3</code> and print it.',
  anat:[['fees','var'],['=','op'],['7','num'],['*','op','times'],['3','num']],
  explain:'Math operators: <code>+</code> add, <code>-</code> subtract, <code>*</code> multiply, <code>/</code> divide. Python follows the usual order: <code>*</code> and <code>/</code> before <code>+</code> and <code>-</code>. Brackets go first. The shortcuts work for these too: <code>x *= 2</code> means <code>x = x * 2</code>, and <code>/=</code> divides the same way.',
  starter:'',answer:'fees = 7 * 3\nprint(fees)',
  check:c=>c.val('fees')!==21?'fees should be 7 * 3.':!/\*/.test(c.code)?'Use * to multiply.':c.printed('21')||'Print fees.'},
 {title:'Three ways to divide',goal:'Split 17 coins between 5 readers. Print <code>17 / 5</code>, <code>17 // 5</code> and <code>17 % 5</code> on three lines.',
  anat:[['17','num'],['//','op','whole part'],['5','num'],['%','op','remainder']],
  explain:'<code>/</code> gives an exact answer with decimals (3.4). <code>//</code> gives the whole part only: each reader gets 3. <code>%</code> (modulo) gives what is left over: 2 coins.',
  note:'% is great for "every Nth time" checks: <code>n % 2</code> is 0 for every even number, because even numbers divide by 2 with nothing left over.',
  starter:'',answer:'print(17 / 5)\nprint(17 // 5)\nprint(17 % 5)',
  check:c=>c.lines.join('|')==='3.4|3|2'||'The console should show 3.4, then 3, then 2.'},
 {title:'Power up',goal:'A rumour about Inky spreads: the number of listeners doubles every night for 10 nights. Print <code>2 ** 10</code>.',
  anat:[['2','num'],['**','op','to the power'],['10','num']],
  explain:'<code>**</code> means "to the power of". <code>2 ** 10</code> is 2×2×2×2×2×2×2×2×2×2. Python integers can get as big as you like.',
  starter:'',answer:'print(2 ** 10)',check:c=>c.printed('1024')&&/\*\*/.test(c.code)||'Use ** to print 1024.'},
 {title:'Text tools',goal:'Label a book: with <code>title = "inkwell"</code>, print <code>title.upper()</code> and then <code>len(title)</code>.',
  anat:[['title','var'],['.','op','dot'],['upper','fn','method'],['()','br']],
  explain:'Text has built-in tools called <b>methods</b>. You use them with a dot: <code>title.upper()</code>. <code>len()</code> counts the characters.',
  note:'Try <code>.lower()</code> (all small letters), <code>.title()</code> (Capital Letters) and <code>.replace("k", "t")</code> (swap every "k" for a "t") too. You can chain methods, left to right: <code>title.upper().lower()</code>.',
  starter:'title = "inkwell"\n',answer:'title = "inkwell"\nprint(title.upper())\nprint(len(title))',
  check:c=>c.printed('INKWELL')&&c.printed('7')||'You should see INKWELL and 7.'},
 {title:'Pick one letter',goal:'With <code>word = "bookmark"</code>, print the first letter and the last letter.',
  anat:[['word','var'],['[','br'],['0','num','position'],[']','br']],
  explain:'Each character has a position number called an <b>index</b>. Counting starts at <b>0</b>, so <code>word[0]</code> is "b". Negative numbers count from the end: <code>word[-1]</code> is "k".',
  starter:'word = "bookmark"\n',answer:'word = "bookmark"\nprint(word[0])\nprint(word[-1])',
  check:c=>c.printed('b')&&c.printed('k')&&/\[/.test(c.code)||'Use word[0] and word[-1] to print b and k.'},
 {title:'Slice it',goal:'Print the first three letters of <code>word</code> (that is <code>boo</code>) using a <b>slice</b>.',
  anat:[['word','var'],['[','br'],['0','num','start'],[':','op'],['3','num','stop before'],[']','br']],
  explain:'<code>word[0:3]</code> means "from position 0 up to, but not including, 3". Leave a side out to go to the edge: <code>word[:3]</code> or <code>word[3:]</code>.',
  starter:'word = "bookmark"\n',answer:'word = "bookmark"\nprint(word[0:3])',
  check:c=>c.printed('boo')&&/\[[^\]]*:/.test(c.code)||'Use a slice like word[0:3] to print boo.'},
 {title:'Ask the reader',goal:'A reader walks in: use <code>input()</code> to ask for a name, then print <code>Welcome, NAME!</code>. Your answers go in the <b>Answers tray</b> under the editor.',
  anat:[['name','var'],['=','op'],['input','fn'],['("Your name? ")','str','question']],
  explain:'<code>input()</code> pauses, shows the question, and waits for the player to type. Whatever they type is stored as text. In this playground, you type the answers ahead of time in the tray.',
  inputs:['Nell'],starter:'',answer:'name = input("What is your name? ")\nprint(f"Welcome, {name}!")',
  check:c=>!/input\(/.test(c.code)?'Use input() to ask for the name.':c.type('name')!=='str'?'Store the answer in a variable called name.':c.printed(`Welcome, ${c.val('name')}!`)||c.out.includes(`Welcome, ${c.val('name')}!`)||'Print Welcome, followed by the name and !'},
 {title:'Turn text into a number',goal:'The ledger wants numbers, not text: ask for a number with <code>input()</code>, turn it into an int with <code>int()</code>, and print double it.',
  anat:[['int','fn','convert'],['(','br'],['input("Pick a number: ")','fn'],[')','br']],
  explain:'<code>input()</code> always gives you text, even "21". Text times 2 would repeat it ("2121": <code>"ha" * 3</code> is <code>hahaha</code>). Wrap it in <code>int()</code> to turn it into a real number. <code>float()</code> and <code>str()</code> convert the same way.',
  inputs:['21'],starter:'number = input("Pick a number: ")\nprint(number * 2)\n',answer:'number = int(input("Pick a number: "))\nprint(number * 2)',
  check:c=>c.type('number')!=='int'?'number is still text. Wrap the input() in int(...).':c.printed(String(c.val('number')*2))||'Print number * 2.'}
 ]},
{name:'Decisions',badge:'Reading Pass',story:'The reading-room door opens only for the right card; teach it to choose, and find your reading-room pass.',intro:'The reading-room door opens only for the right card. Programs react to what happens too: low ink, enough coins, a locked door. if lets your program choose which lines to run.',
 learned:['== != < > <= >=','True / False','if','else','elif','and, or, not','indentation'],
 missions:[
 {title:'Yes or no questions',goal:'The door guard asks yes-or-no questions: print the results of <code>5 > 3</code>, <code>10 == 9</code> and <code>"a" != "b"</code>.',
  anat:[['5','num'],['>','op','greater than'],['3','num']],
  explain:'A comparison gives back <code>True</code> or <code>False</code>. <code>==</code> asks "are these equal?" (two signs, because one <code>=</code> means "store"). <code>!=</code> means "not equal". The rest: <code>&gt;</code> greater than, <code>&lt;</code> less than, <code>&gt;=</code> greater than or equal, <code>&lt;=</code> less than or equal.',
  starter:'',answer:'print(5 > 3)\nprint(10 == 9)\nprint("a" != "b")',
  check:c=>c.lines.join('|')==='True|False|True'||'You should see True, False, True.'},
 {title:'Your first if',goal:'With <code>ink = 20</code>, print <code>Low ink! Refill the inkwell.</code> only if <code>ink</code> is below 30.',
  anat:[['if','kw'],['ink < 30','var','condition'],[':','op','colon!']],
  explain:'<code>if</code> runs the indented lines underneath only when the condition is True. Two things matter: the <b>colon</b> at the end says "a block follows", and the <b>4-space indent</b> on the next line says which lines belong to it. Press <kbd>Tab</kbd> to indent. The condition does not have to be a comparison: a <code>0</code> or empty text <code>""</code> counts as False, and any other number or text counts as True.',
  starter:'ink = 20\n',answer:'ink = 20\nif ink < 30:\n    print("Low ink! Refill the inkwell.")',
  check:c=>!/^\s*if\b/m.test(c.code)?'Use an if.':c.printed('Low ink! Refill the inkwell.')||'Print the warning inside the if.'},
 {title:'Otherwise...',goal:'A library card costs 10 coins. With <code>coins = 5</code>: if coins is at least 10, print <code>You buy a library card</code>, else print <code>Not enough coins</code>.',
  anat:[['if','kw'],['coins >= 10','var'],[':','op'],['else','kw'],[':','op']],
  explain:'<code>else</code> catches every case the <code>if</code> did not. Exactly one of the two groups of indented lines runs. <code>else</code> lines up with its <code>if</code>, not with the indented lines.',
  starter:'coins = 5\n',answer:'coins = 5\nif coins >= 10:\n    print("You buy a library card")\nelse:\n    print("Not enough coins")',
  check:c=>!/^\s*else\s*:/m.test(c.code)?'Add an else: line.':c.printed('Not enough coins')&&!c.printed('You buy a library card')?true:'With 5 coins, only "Not enough coins" should print.'},
 {title:'More than two paths',goal:'Choose a card colour for <code>books_read = 85</code>: 90 or more is <code>Gold</code>, 70 or more is <code>Silver</code>, anything else is <code>Bronze</code>.',
  anat:[['if','kw'],['elif','kw','else if'],['else','kw']],
  explain:'<code>elif</code> means "else if". Python checks each condition from top to bottom and runs only the <b>first</b> one that is True. That is why the order matters: check the biggest books_read first.',
  note:'Try changing books_read to 95 and 40 and run it again.',
  starter:'books_read = 85\n',answer:'books_read = 85\nif books_read >= 90:\n    print("Gold")\nelif books_read >= 70:\n    print("Silver")\nelse:\n    print("Bronze")',
  check:c=>!/^\s*elif\b/m.test(c.code)?'Use elif for the middle case.':c.val('books_read')===85&&c.lines.join('|')!=='Silver'?'With books_read 85 only Silver should print.':true},
 {title:'Two things at once',goal:'Print <code>The reading-room door opens</code> only if <code>has_card</code> is True <b>and</b> <code>hour</code> is below 18 (on a 24-hour clock).',
  anat:[['has_card','var'],['and','kw','both'],['hour < 18','var']],
  explain:'<code>and</code> needs both sides True. <code>or</code> needs at least one. <code>not</code> flips True and False.',
  starter:'has_card = True\nhour = 14\n',answer:'has_card = True\nhour = 14\nif has_card and hour < 18:\n    print("The reading-room door opens")',
  check:c=>!/\band\b/.test(c.code)?'Join the two conditions with and.':c.printed('The reading-room door opens')||'Print The reading-room door opens inside the if.'},
 {title:'Bug hunt: indentation',goal:'This crashes with an <code>IndentationError</code>. Fix it so the warning prints.',
  anat:[['    ','op','4 spaces']],
  explain:'In Python, <b>indentation is part of the code</b>. The spaces tell Python which lines belong inside the if. Other languages use curly brackets; Python uses spaces.',
  starter:'puddles = 3\nif puddles > 0:\nprint("Mind the ink puddles!")\n',answer:'puddles = 3\nif puddles > 0:\n    print("Mind the ink puddles!")',
  check:c=>c.printed('Mind the ink puddles!')||'Indent the print line by 4 spaces.'}
 ]},
{name:'Lists',badge:'Book Cart',story:'The long shelves hold hundreds of books; pack, check and swap what is in your satchel, and find the book cart.',intro:'The long shelves hold hundreds of books, and you carry your things in a satchel. A list holds many values in order, inside one box. Satchels, book carts, books on a shelf: all lists.',
 learned:['[a, b, c]','list[0]','.append()','.remove()  .pop()','in','list[i] = x','len(list)'],
 missions:[
 {title:'Pack your satchel',goal:'Pack your satchel: set <code>satchel</code> to a list with <code>"lantern"</code>, <code>"bookmark"</code> and <code>"tea"</code>. Print it.',
  anat:[['satchel','var'],['=','op'],['[','br','list'],['"lantern", "bookmark", "tea"','str','items'],[']','br']],
  explain:'Square brackets make a list. Commas separate the items. Look at the memory map: one box with numbered slots.',
  starter:'',answer:'satchel = ["lantern", "bookmark", "tea"]\nprint(satchel)',
  check:c=>c.type('satchel')!=='list'?'Make satchel a list with square brackets.':JSON.stringify(c.val('satchel'))!=='["lantern","bookmark","tea"]'?'The list should be ["lantern", "bookmark", "tea"] in that order.':c.printed("['lantern', 'bookmark', 'tea']")||'Print satchel.'},
 {title:'Reach into the bag',goal:'Print the first item and the last item of <code>satchel</code>.',
  anat:[['satchel','var'],['[0]','num','first'],['satchel','var'],['[-1]','num','last']],
  explain:'Lists use the same index numbers as text: 0 for the first item, -1 for the last. The memory map shows each slot\'s number.',
  starter:'satchel = ["lantern", "bookmark", "tea"]\n',answer:'satchel = ["lantern", "bookmark", "tea"]\nprint(satchel[0])\nprint(satchel[-1])',
  check:c=>c.printed('lantern')&&c.printed('tea')||'Print lantern and tea using indexes.'},
 {title:'Pick something up',goal:'You found a map under a shelf. Use <code>.append()</code> to add <code>"map"</code> to the end, then print <code>len(satchel)</code>.',
  anat:[['satchel','var'],['.append','fn','add to end'],['("map")','str']],
  explain:'<code>.append()</code> adds one item to the end. Lists can grow and shrink, unlike text. Use the step slider to watch the new slot appear.',
  starter:'satchel = ["lantern", "bookmark", "tea"]\n',answer:'satchel = ["lantern", "bookmark", "tea"]\nsatchel.append("map")\nprint(len(satchel))',
  check:c=>!/\.append\(/.test(c.code)?'Use satchel.append("map").':!(c.val('satchel')||[]).includes('map')?'Add "map" to the list.':c.printed(String(c.val('satchel').length))||'Print len(satchel).'},
 {title:'Use it up',goal:'Sip the tea: remove <code>"tea"</code> from the list with <code>.remove()</code> and print the list.',
  anat:[['satchel','var'],['.remove','fn'],['("tea")','str']],
  explain:'<code>.remove(x)</code> deletes the first item equal to x. <code>.pop()</code> removes the last item and gives it back to you, so <code>item = satchel.pop()</code> keeps it in a box.',
  starter:'satchel = ["lantern", "bookmark", "tea", "map"]\n',answer:'satchel = ["lantern", "bookmark", "tea", "map"]\nsatchel.remove("tea")\nprint(satchel)',
  check:c=>(c.val('satchel')||[]).includes('tea')?'tea is still in the list.':!/\.remove\(|\.pop\(/.test(c.code)?'Use .remove("tea").':c.out.includes("['lantern', 'bookmark', 'map']")||'Print the satchel.'},
 {title:'Check the bag',goal:'If <code>"lantern"</code> is <b>in</b> the satchel, print <code>Ready to read!</code>.',
  anat:[['"lantern"','str'],['in','kw','is inside?'],['satchel','var']],
  explain:'<code>in</code> asks "is this item somewhere in the list?" and gives back True or False. It works on text too: <code>"Moon" in "Moon Atlas"</code> is True.',
  starter:'satchel = ["lantern", "bookmark", "map"]\n',answer:'satchel = ["lantern", "bookmark", "map"]\nif "lantern" in satchel:\n    print("Ready to read!")',
  check:c=>!/\bin\b/.test(c.code.replace(/print\(.*\)/g,''))?'Use the word in.':c.printed('Ready to read!')||'Print Ready to read!'},
 {title:'Upgrade an item',goal:'Swap the bookmark for a better one: set <code>satchel[1]</code> to <code>"golden bookmark"</code> and print the list.',
  anat:[['satchel','var'],['[1]','num'],['=','op'],['"golden bookmark"','str']],
  explain:'You can replace any slot by assigning to its index. Text cannot do this (text is <b>immutable</b>), but lists can (they are <b>mutable</b>): mutable means you can change it in place. Careful: <code>b = a</code> does not copy a list. Both names point to the same list, so changing one changes the other.',
  starter:'satchel = ["lantern", "bookmark", "map"]\n',answer:'satchel = ["lantern", "bookmark", "map"]\nsatchel[1] = "golden bookmark"\nprint(satchel)',
  check:c=>(c.val('satchel')||[])[1]!=='golden bookmark'?'satchel[1] should be "golden bookmark".':!/satchel\[1\]\s*=/.test(c.code)?'Assign to satchel[1] directly.':c.out.includes('golden bookmark')||'Print the list.'}
 ]},
{name:'Loops',badge:'Brass Lantern',story:'Every lamp in the corridor needs lighting at closing time; repeat the round without copying it, and find the brass lantern.',intro:'Every lamp in the corridor needs lighting at closing time. Loops repeat code so you do not have to copy it. A for loop goes through items one by one. A while loop keeps going as long as something is True.',
 learned:['for x in list','range(a, b)','total += x','while','break','infinite loops'],
 missions:[
 {title:'Check every item',goal:'Use a <code>for</code> loop to print each item in <code>satchel</code> on its own line.',
  anat:[['for','kw'],['item','var','each one'],['in','kw'],['satchel','var'],[':','op']],
  explain:'The loop takes each item in turn, puts it in the <code>item</code> box, and runs the indented lines. Then it moves to the next item. (Text works too: a <code>for</code> loop over <code>"hi"</code> gives <code>"h"</code>, then <code>"i"</code>.) After running, step through it and watch the line marker jump back up.',
  starter:'satchel = ["lantern", "bookmark", "map", "candle"]\n',answer:'satchel = ["lantern", "bookmark", "map", "candle"]\nfor item in satchel:\n    print(item)',
  check:c=>!/^\s*for\b/m.test(c.code)?'Use a for loop.':c.lines.join('|')==='lantern|bookmark|map|candle'||'Print each item, one per line.'},
 {title:'Count with range',goal:'Light the lamps numbered 1 to 5: print the numbers using <code>for</code> and <code>range()</code>.',
  anat:[['for','kw'],['i','var'],['in','kw'],['range','fn'],['(1, 6)','num','1 up to 6']],
  explain:'<code>range(1, 6)</code> gives 1, 2, 3, 4, 5. Like slices, it stops <b>before</b> the second number. <code>range(5)</code> alone gives 0 to 4.',
  starter:'',answer:'for i in range(1, 6):\n    print(i)',
  check:c=>!/range\(/.test(c.code)?'Use range().':c.lines.join('|')==='1|2|3|4|5'||'Print 1, 2, 3, 4, 5 on separate lines.'},
 {title:'Add it all up',goal:'Count the lamp fund: add up the coins in <code>coins</code> with a loop. Start <code>total = 0</code>, add each coin, then print the total.',
  anat:[['total','var'],['+=','op'],['coin','var']],
  explain:'This is the <b>accumulator pattern</b>: start a box at 0, then add to it each time around the loop. You will use it for scores, totals and counts.',
  note:'Python also has <code>sum(coins)</code>, which adds up a whole list in one go, but writing the loop shows how it works.',
  starter:'coins = [5, 10, 20, 15]\ntotal = 0\n',answer:'coins = [5, 10, 20, 15]\ntotal = 0\nfor coin in coins:\n    total += coin\nprint(total)',
  check:c=>!/^\s*for\b/m.test(c.code)?'Use a for loop to add each coin.':c.val('total')!==50?'total should end at 50.':c.printed('50')||'Print total after the loop (not indented).'},
 {title:'Clear the dust',goal:'Inky stirs up a dust cloud, <code>dust = 50</code>. Use <code>while dust > 0:</code> to blow away 15 each time and print dust after every puff.',
  anat:[['while','kw'],['dust > 0','var','keep going if'],[':','op']],
  explain:'A <code>while</code> loop checks its condition, runs the indented lines, then checks again. It stops the moment the condition is False. Something inside must change, or it never ends.',
  starter:'dust = 50\n',answer:'dust = 50\nwhile dust > 0:\n    dust -= 15\n    print(dust)',
  check:c=>!/^\s*while\b/m.test(c.code)?'Use a while loop.':c.val('dust')>0?'Keep blowing until dust is 0 or less.':c.lines.join('|')==='35|20|5|-10'||'Print dust after each puff: 35, 20, 5, -10.'},
 {title:'Stop early',goal:'Find the first shelf number whose square is more than 50. Loop over <code>range(1, 100)</code>, and when <code>n * n > 50</code>, print n and <code>break</code>.',
  anat:[['if','kw'],['n * n > 50','var'],[':','op'],['break','kw','leave loop']],
  explain:'<code>break</code> jumps straight out of the loop, even if there are items left. <code>continue</code> skips to the next round.',
  starter:'for n in range(1, 100):\n',answer:'for n in range(1, 100):\n    if n * n > 50:\n        print(n)\n        break',
  check:c=>!/\bbreak\b/.test(c.code)?'Use break to stop the loop.':c.lines.join('|')==='8'||'Only 8 should print.'},
 {title:'Countdown',goal:'Closing time: count down from 5 to 1 with <code>range(5, 0, -1)</code>, then print <code>Lights out!</code>.',
  anat:[['range','fn'],['(5,','num','start'],['0,','num','stop'],['-1)','num','step']],
  explain:'A third number in <code>range</code> is the <b>step</b>. A step of -1 counts backwards. A step of 2 skips every other number.',
  starter:'',answer:'for i in range(5, 0, -1):\n    print(i)\nprint("Lights out!")',
  check:c=>c.lines.join('|')==='5|4|3|2|1|Lights out!'||'You should see 5, 4, 3, 2, 1 then Lights out! (print Lights out! once, after the loop).'},
 {title:'Bug hunt: the endless loop',goal:'Inky stuck the closing bell on repeat. This loop never stops, so the playground halts it. Fix it so it prints 0 to 4.',
  anat:[['count','var'],['+=','op'],['1','num']],
  explain:'<code>count</code> never changes, so <code>count < 5</code> is True forever. This is an <b>infinite loop</b>. On a real computer, press <kbd>Ctrl</kbd>+<kbd>C</kbd> to stop one.',
  starter:'count = 0\nwhile count < 5:\n    print(count)\n',answer:'count = 0\nwhile count < 5:\n    print(count)\n    count += 1',
  check:c=>c.lines.join('|')==='0|1|2|3|4'||'Make count grow by 1 inside the loop.'}
 ]},
{name:'Functions',badge:'Master Stamp',story:'The stamp room has a recipe for each job; write your own named recipes, and find the master stamp.',intro:'The stamp room has a recipe for each job. A function is a named recipe. You write it once with def, then call it whenever you need it. Watch the memory map: each call gets its own fresh set of boxes.',
 learned:['def name():','parameters','return','default values','local variables'],
 missions:[
 {title:'Your first recipe',goal:'Define <code>greet()</code> that prints <code>Welcome to Quillby!</code>, then call it <b>twice</b>.',
  anat:[['def','kw','define'],['greet','fn'],['()','br'],[':','op']],
  explain:'<code>def</code> creates the function but does not run it. Running it is called <b>calling</b> it: write its name with brackets, <code>greet()</code>. The call goes below the definition, not indented.',
  starter:'',answer:'def greet():\n    print("Welcome to Quillby!")\n\ngreet()\ngreet()',
  check:c=>!c.fn('greet')?'Define a function called greet with def.':c.lines.filter(l=>l==='Welcome to Quillby!').length!==2?'Call greet() two times so the message prints twice.':true},
 {title:'Give it something',goal:'Change greet to take a <code>name</code> parameter and print <code>Hello, NAME!</code>. Call it with "Nell" and with "Kai".',
  anat:[['def','kw'],['greet','fn'],['(name)','var','parameter']],
  explain:'A <b>parameter</b> is a box the function fills when you call it. <code>greet("Nell")</code> puts "Nell" into <code>name</code> for that call only. The value you pass in is called an <b>argument</b>.',
  starter:'def greet():\n    print("Welcome to Quillby!")\n',answer:'def greet(name):\n    print(f"Hello, {name}!")\n\ngreet("Nell")\ngreet("Kai")',
  check:c=>{if(!c.fn('greet'))return 'Keep a function called greet.';try{const r=c.call('greet','Zed');if(!r.out.includes('Hello, Zed!'))return 'greet("Zed") should print Hello, Zed!'}catch(e){return 'greet should take one parameter, name.'}return c.printed('Hello, Nell!')&&c.printed('Hello, Kai!')||'Call greet("Nell") and greet("Kai").'}},
 {title:'Get an answer back',goal:'Make a double stamp: write <code>double(n)</code> that <b>returns</b> n times 2. Store <code>result = double(21)</code> and print it.',
  anat:[['return','kw','send back'],['n * 2','var']],
  explain:'<code>print</code> shows a value on screen. <code>return</code> hands a value back to whoever called the function, so they can store it or use it in more math. Most useful functions return something. A function with no <code>return</code> hands back <code>None</code>, Python\'s word for "nothing here".',
  starter:'',answer:'def double(n):\n    return n * 2\n\nresult = double(21)\nprint(result)',
  check:c=>{if(!c.fn('double'))return 'Define double(n).';let r;try{r=c.call('double',5)}catch(e){return 'double should take one number.'}if(r.v!==10)return 'double(5) should return 10. Did you use return?';return c.val('result')===42&&c.printed('42')||'Store double(21) in result and print it.'}},
 {title:'Optional extras',goal:'Late fees are 2 coins a book, plus an optional extra: write <code>fee(books, extra=0)</code> that returns <code>books * 2 + extra</code>. Print <code>fee(5)</code> and <code>fee(5, 3)</code>.',
  anat:[['fee','fn'],['(books,','var'],['extra=0','var','default'],[')','br']],
  explain:'<code>extra=0</code> is a <b>default value</b>. If the caller leaves it out, extra is 0. If they pass a number, that is used instead.',
  starter:'',answer:'def fee(books, extra=0):\n    return books * 2 + extra\n\nprint(fee(5))\nprint(fee(5, 3))',
  check:c=>{if(!c.fn('fee'))return 'Define fee(books, extra=0).';try{if(c.call('fee',5).v!==10)return 'fee(5) should return 10.';if(c.call('fee',5,3).v!==13)return 'fee(5, 3) should return 13.'}catch(e){return 'fee needs a default: extra=0'}return c.printed('10')&&c.printed('13')||'Print both results.'}},
 {title:'Boxes inside functions',goal:'Inky drained the inkwell: write <code>refill(ink)</code> that adds 20 and returns the new value. Then run <code>ink = refill(ink)</code> and print ink (50 becomes 70).',
  anat:[['ink','var','outside box'],['=','op'],['refill','fn'],['(ink)','var','copy goes in']],
  explain:'Variables made inside a function are <b>local</b>: they live in the function\'s own <b>frame</b> (its private set of boxes) and disappear when it returns. Step through and watch the <code>refill()</code> frame appear, then vanish. The only way out is <code>return</code>. Assigning to <code>ink</code> inside the function only changes the function\'s own <code>ink</code>, so assign the returned value back.',
  starter:'ink = 50\n',answer:'ink = 50\n\ndef refill(ink):\n    ink = ink + 20\n    return ink\n\nink = refill(ink)\nprint(ink)',
  check:c=>{if(!c.fn('refill'))return 'Define refill(ink).';try{if(c.call('refill',10).v!==30)return 'refill(10) should return 30.'}catch(e){return 'refill should take one number and return it plus 20.'}return c.val('ink')===70&&c.printed('70')||'Set ink = refill(ink) and print it.'}},
 {title:'Functions + lists',goal:'Write <code>total_coins(jars)</code> to count the lamp fund jars; it uses a loop to add up a list of numbers and returns the total.',
  anat:[['def','kw'],['total_coins','fn'],['(jars)','var','a list']],
  explain:'A function can take a list, loop over it, and return one answer. This is the accumulator pattern from Loops, wrapped in a reusable name.',
  starter:'def total_coins(jars):\n    total = 0\n    # loop here\n    return total\n\nprint(total_coins([3, 7, 10]))\n',answer:'def total_coins(jars):\n    total = 0\n    for jar in jars:\n        total += jar\n    return total\n\nprint(total_coins([3, 7, 10]))',
  check:c=>{if(!c.fn('total_coins'))return 'Keep the total_coins function.';if(!/^\s*for\b/m.test(c.code))return 'Use a for loop inside the function.';try{if(c.call('total_coins',[1,2,3]).v!==6)return 'total_coins([1, 2, 3]) should return 6.';if(c.call('total_coins',[]).v!==0)return 'total_coins([]) should return 0.'}catch(e){return 'total_coins should return a number.'}return true}}
 ]},
{name:'Dictionaries',badge:'Catalog Card',story:'The card catalog finds a book by its name, not its place; look up and update entries, and find the catalog card that names Mr. Grumble.',intro:'The card catalog finds a book by its name, not its place. A dictionary (dict) stores pairs: a key and its value. Instead of a position number, you look things up by name, like a real dictionary.',
 learned:['{"key": value}','d["key"]','d["new"] = x','.get(key, default)','.items()','in (keys)'],
 missions:[
 {title:'A reader\'s card',goal:'Create <code>reader = {"name": "Nell", "books": 12, "coins": 25}</code> for the reader\'s card and print <code>reader["name"]</code>.',
  anat:[['{','br','dict'],['"name"','str','key'],[':','op'],['"Nell"','str','value'],['}','br']],
  explain:'Curly brackets make a dict. Each entry is <code>key: value</code>. To read a value, put its key in square brackets. In the memory map, each key points to its value. <code>len()</code> counts a dict\'s keys.',
  starter:'',answer:'reader = {"name": "Nell", "books": 12, "coins": 25}\nprint(reader["name"])',
  check:c=>c.type('reader')!=='dict'?'Make reader a dict with curly brackets.':(()=>{const h=c.val('reader');return h.name&&h.books===12&&h.coins===25?(c.printed(h.name)||'Print reader["name"].'):'reader needs keys "name", "books" (12) and "coins" (25).'})()},
 {title:'Update the card',goal:'Add 50 to <code>reader["coins"]</code> and add a new key <code>"cards"</code> with value 2. Print the dict.',
  anat:[['reader','var'],['["cards"]','str','new key'],['=','op'],['2','num']],
  explain:'Assigning to a key that exists changes it. Assigning to a new key adds it. <code>reader["coins"] += 50</code> works just like with a normal variable.',
  starter:'reader = {"name": "Nell", "books": 12, "coins": 25}\n',answer:'reader = {"name": "Nell", "books": 12, "coins": 25}\nreader["coins"] += 50\nreader["cards"] = 2\nprint(reader)',
  check:c=>{const h=c.val('reader')||{};return h.coins!==75?'reader["coins"] should become 75.':h.cards!==2?'Add reader["cards"] = 2.':c.out.includes("'cards': 2")||'Print reader.'}},
 {title:'Safe lookups',goal:'Print <code>reader.get("fines", 0)</code>. The key does not exist, so you should see 0 instead of a crash.',
  anat:[['reader','var'],['.get','fn'],['("fines",','str','key'],['0)','num','if missing']],
  explain:'<code>reader["fines"]</code> would crash with a <code>KeyError</code> because there is no such key. <code>.get(key, default)</code> gives back the default instead. Use <code>"fines" in reader</code> to check first.',
  starter:'reader = {"name": "Nell", "books": 12}\n',answer:'reader = {"name": "Nell", "books": 12}\nprint(reader.get("fines", 0))',
  check:c=>!/\.get\(/.test(c.code)?'Use reader.get("fines", 0).':c.printed('0')||'Print the result of .get().'},
 {title:'Read the whole sheet',goal:'Loop over <code>reader.items()</code> and print each pair as <code>key: value</code>.',
  anat:[['for','kw'],['key, value','var','two boxes'],['in','kw'],['reader.items()','fn']],
  explain:'<code>.items()</code> gives each pair. Writing <code>key, value</code> unpacks the pair into two boxes at once. Looping over a dict on its own gives just the keys.',
  starter:'reader = {"name": "Nell", "books": 12, "coins": 75}\n',answer:'reader = {"name": "Nell", "books": 12, "coins": 75}\nfor key, value in reader.items():\n    print(f"{key}: {value}")',
  check:c=>!/\.items\(\)/.test(c.code)?'Loop over reader.items().':c.printed('name: Nell')&&c.printed('books: 12')||'Print each line as key: value.'},
 {title:'Find a book',goal:'Mr. Grumble files books by shelf. Ask which book to find with <code>input()</code> and store it in <code>book</code>. If it is in <code>shelves</code>, print <code>It is on shelf N</code>, otherwise print <code>We don\'t have that book</code>.',
  anat:[['if','kw'],['book','var'],['in','kw'],['shelves','var'],[':','op']],
  explain:'This mixes everything so far: input, a dict lookup, and an if/else. <code>book in shelves</code> checks the keys, and <code>{shelves[book]}</code> inside the f-string looks the shelf up.',
  note:'Change the answer in the tray to "Sky Atlas" and run again to test the else path.',
  inputs:['Dragon Tales'],starter:'shelves = {"Moon Atlas": 3, "Tea Recipes": 8, "Dragon Tales": 15}\n',answer:'shelves = {"Moon Atlas": 3, "Tea Recipes": 8, "Dragon Tales": 15}\nbook = input("Which book? ")\nif book in shelves:\n    print(f"It is on shelf {shelves[book]}")\nelse:\n    print("We don\'t have that book")',
  check:c=>{if(!/input\(/.test(c.code))return 'Ask with input().';if(!/^\s*else\s*:/m.test(c.code))return 'Add an else for books the library does not hold.';const it=c.val('book'),p=c.val('shelves')||{};
    return it in p?(c.out.includes(`It is on shelf ${p[it]}`)||`Print It is on shelf ${p[it]}`):(c.out.includes("We don't have that book")||"Print We don't have that book")}}
 ]},
{name:'Build a game',badge:'Last Page',story:'Mr. Grumble guards the last page with a guessing riddle; use everything you have learned to beat it, and find the Last Page.',intro:'Mr. Grumble hid the last page behind a guessing riddle. Time to combine it all. You will use the random module, catch bad input, and build a guessing game and a battle loop.',
 learned:['import random','random.randint()','random.choice()','try / except','while True + break','putting it together'],
 missions:[
 {title:'Roll the dice',goal:'Mr. Grumble throws a riddle die: import random and store <code>roll = random.randint(1, 6)</code>. Print the roll. Run it a few times.',
  anat:[['import','kw'],['random','var','module'],['random.randint','fn'],['(1, 6)','num','1 to 6']],
  explain:'A <b>module</b> is a bundle of extra tools that comes with Python, and <code>import</code> loads one. The <code>random</code> module picks random numbers, and <code>random.randint</code> means the <code>randint</code> tool inside the <code>random</code> module. <code>randint(1, 6)</code> includes both ends, unlike range.',
  starter:'',answer:'import random\n\nroll = random.randint(1, 6)\nprint(f"You rolled a {roll}")',
  check:c=>!/import random|from random/.test(c.code)?'Start with import random.':c.type('roll')!=='int'||c.val('roll')<1||c.val('roll')>6?'roll should be random.randint(1, 6).':c.out.includes(String(c.val('roll')))||'Print the roll.'},
 {title:'Random find',goal:'Pull something from Mr. Grumble\'s drawer: create a list for the drawer and use <code>random.choice()</code> to pick one. Print <code>You found: ITEM</code>.',
  anat:[['random.choice','fn'],['(drawer)','var','a list']],
  explain:'<code>random.choice(list)</code> picks one item at random. Games use it for surprise finds, riddle picks and dialogue.',
  starter:'import random\n\ndrawer = ["brass key", "old map", "ink bottle", "apple core"]\n',answer:'import random\n\ndrawer = ["brass key", "old map", "ink bottle", "apple core"]\nfound = random.choice(drawer)\nprint(f"You found: {found}")',
  check:c=>!/random\.choice\(|choice\(/.test(c.code)?'Use random.choice(drawer).':/You found: /.test(c.out)||'Print You found: and the item.'},
 {title:'Catch bad input',goal:'Mr. Grumble asks for a page number. Ask for a number. If the player types something that is not a number, print <code>That is not a number</code> instead of crashing.',
  anat:[['try','kw','attempt'],[':','op'],['except','kw'],['ValueError','fn','this error'],[':','op']],
  explain:'<code>int("abc")</code> crashes with a <code>ValueError</code>. Put risky code under <code>try:</code>. If that error happens, Python jumps to <code>except ValueError:</code> instead of stopping. Naming <code>ValueError</code> catches only that mistake; other bugs still show up.',
  note:'The tray has "abc" in it. Change it to "12" to test a normal number.',
  inputs:['abc'],starter:'',answer:'try:\n    number = int(input("Enter a number: "))\n    print(f"Double that is {number * 2}")\nexcept ValueError:\n    print("That is not a number")',
  check:c=>!/^\s*try\s*:/m.test(c.code)||!/^\s*except\b/m.test(c.code)?'Use try: and except ValueError:':c.inputs[0]!==undefined&&!/^\s*-?\d+\s*$/.test(c.inputs[0])?(c.out.includes('That is not a number')||'Print That is not a number in the except block.'):true},
 {title:'Guess the number',goal:'Build Mr. Grumble\'s guessing riddle: the page is on shelf 7. Keep asking until the guess is right. Say <code>Too low</code> or <code>Too high</code> each time, and <code>You got it!</code> at the end.',
  anat:[['while','kw'],['True','kw','forever...'],[':','op'],['break','kw','...until this']],
  explain:'<code>while True:</code> loops forever, so you need a <code>break</code> when the player wins. The tray holds three guesses: 3, 9, then 7.',
  note:'When it works, change shelf = 7 to shelf = <code>random.randint(1, 10)</code> and import random. Now it is a real game.',
  inputs:['3','9','7'],starter:'shelf = 7\n\nwhile True:\n    guess = int(input("Which shelf (1-10)? "))\n    # compare guess to shelf here\n',answer:'shelf = 7\n\nwhile True:\n    guess = int(input("Which shelf (1-10)? "))\n    if guess < shelf:\n        print("Too low")\n    elif guess > shelf:\n        print("Too high")\n    else:\n        print("You got it!")\n        break',
  check:c=>{if(!/\bbreak\b/.test(c.code))return 'Use break when the guess is right.';if(c.err&&c.err.type==='EOFError')return 'The loop kept asking after the right guess. Add break after You got it!';
    return !/Too low/i.test(c.out)?'Print Too low when the guess is smaller.':!/Too high/i.test(c.out)?'Print Too high when the guess is bigger.':/You got it!/.test(c.out)||'Print You got it! when they guess right.'}},
 {title:'Beat the riddle',goal:'Finish the riddle loop: while both still have wits, you score points against Mr. Grumble with <code>riddle()</code>, then he answers back for 8. Print who won.',
  anat:[['while','kw'],['reader["wits"] > 0','var'],['and','kw'],['grumble["wits"] > 0','var'],[':','op']],
  explain:'Two dicts, a function, a loop and decisions together. This is how real games are built: small pieces you already know, combined. Inside an f-string, braces can hold a lookup like <code>{grumble[\'wits\']}</code>; use single quotes for the key there, because double quotes would end the f-string early.',
  note:'Step through it with the slider and watch both wits values drop each round.',
  starter:'import random\n\nreader = {"name": "Nell", "wits": 40}\ngrumble = {"name": "Mr. Grumble", "wits": 50}\n\ndef riddle():\n    return random.randint(6, 12)\n\nround_number = 1\nwhile reader["wits"] > 0 and grumble["wits"] > 0:\n    points = riddle()\n    grumble["wits"] -= points\n    print(f"Round {round_number}: your riddle scores {points}. Grumble has {grumble[\'wits\']} wits left")\n    # Grumble answers back for 8 here (only if he is still in the game)\n\n    round_number += 1\n\n# print who won here\n',
  answer:'import random\n\nreader = {"name": "Nell", "wits": 40}\ngrumble = {"name": "Mr. Grumble", "wits": 50}\n\ndef riddle():\n    return random.randint(6, 12)\n\nround_number = 1\nwhile reader["wits"] > 0 and grumble["wits"] > 0:\n    points = riddle()\n    grumble["wits"] -= points\n    print(f"Round {round_number}: your riddle scores {points}. Grumble has {grumble[\'wits\']} wits left")\n    if grumble["wits"] > 0:\n        reader["wits"] -= 8\n        print(f"Grumble snaps back! You have {reader[\'wits\']} wits left")\n    round_number += 1\n\nif reader["wits"] > 0:\n    print("You solved the riddle and found the Last Page!")\nelse:\n    print("Mr. Grumble wins this time.")',
  check:c=>{const h=c.val('reader')||{},d=c.val('grumble')||{};if(h.wits===40)return 'Grumble should answer back: reader["wits"] -= 8 inside the loop.';
    if(h.wits>0&&d.wits>0)return 'The loop should run until one of them reaches 0.';return /solved|defeated|win|won|wins|lost|lose/i.test(c.lines.slice(-1)[0]||'')||'After the loop, print who won.'}},
 {title:'Make it yours',goal:'Add your own page to the library: write a small game or program, at least 8 lines, that uses a <b>function</b> and a <b>loop</b> and runs without errors.',
  anat:[['def','kw'],['for / while','kw'],['if','kw'],['print','fn']],
  explain:'Ideas: a dice duel against the computer, a book fair where you spend coins until they run out, a quiz that keeps score, a times-table trainer. Use the Field guide when you forget something.',
  starter:'# Your game goes here\n',answer:'import random\n\ndef roll():\n    return random.randint(1, 6)\n\nscore = 0\nfor turn in range(1, 4):\n    mine = roll()\n    theirs = roll()\n    print(f"Turn {turn}: you {mine}, computer {theirs}")\n    if mine > theirs:\n        score += 1\nprint(f"You won {score} of 3 turns")',
  check:c=>{const n=c.code.split('\n').filter(l=>l.trim()).length;return n<8?`Write at least 8 lines of code (you have ${n}).`:!/^\s*def\b/m.test(c.code)?'Include a function (def).':!/^\s*(for|while)\b/m.test(c.code)?'Include a loop (for or while).':!c.out.trim()?'Make it print something.':true}}
 ]}
];

/* ---------- Quick-fire: predict the output ---------- */
/* Each question carries `ch`, the chapter that teaches everything it uses; Quick-fire only offers a question once every mission of that chapter is done. */
const QF=[
 {ch:2,c:'print(3 + 4 * 2)',w:['14','10','34'],why:'* happens before +, so 4 * 2 = 8, then 3 + 8.'},
 {ch:0,c:'print("3" + "4")',w:['7','3 + 4','TypeError'],why:'Quotes make text. + joins text.'},
 {ch:2,c:'print(10 / 4)',w:['2','2.0','2.25'],why:'/ always gives a float with the exact answer.'},
 {ch:2,c:'print(10 // 4)',w:['2.5','3','2.0'],why:'// keeps only the whole part.'},
 {ch:2,c:'print(10 % 4)',w:['2.5','0','4'],why:'% is the remainder: 10 = 4 × 2 + 2.'},
 {ch:2,c:'print(2 ** 3)',w:['6','5','23'],why:'** is power: 2 × 2 × 2.'},
 {ch:1,c:'x = 5\nx = x + 2\nprint(x)',w:['5','x + 2','52'],why:'The right side is worked out first (5 + 2), then stored back in x.'},
 {ch:2,c:'x = 10\nx -= 3\nx *= 2\nprint(x)',w:['17','4','20'],why:'10 - 3 = 7, then 7 × 2 = 14.'},
 {ch:1,c:'name = "Kai"\nprint("Hi " + name)',w:['Hi name','Hi+Kai','HiKai'],why:'name without quotes means the value in the box.'},
 {ch:2,c:'print("ha" * 3)',w:['ha3','ha ha ha','TypeError'],why:'Text times a number repeats it.'},
 {ch:2,c:'word = "python"\nprint(word[1])',w:['p','t','py'],why:'Indexes start at 0, so [1] is the second letter.'},
 {ch:2,c:'word = "python"\nprint(word[-1])',w:['p','o','IndexError'],why:'-1 is the last character.'},
 {ch:2,c:'word = "python"\nprint(word[0:2])',w:['pyt','y','yt'],why:'A slice stops before the end number.'},
 {ch:2,c:'print(len("hello"))',w:['4','6','hello'],why:'len counts characters: h e l l o.'},
 {ch:1,c:'print(type(3.0))',w:["<class 'int'>","<class 'str'>",'3.0'],why:'A decimal point makes a float, even .0.'},
 {ch:2,c:'print(int("7") + 1)',w:['71','"8"','TypeError'],why:'int() turns the text "7" into the number 7.'},
 {ch:2,c:'print(str(7) + "1")',w:['8','7 1','TypeError'],why:'str(7) is the text "7", so + joins.'},
 {ch:3,c:'print(5 > 3 and 2 > 4)',w:['True','5','0'],why:'and needs both sides True. 2 > 4 is False.'},
 {ch:3,c:'print(5 > 3 or 2 > 4)',w:['False','3','0'],why:'or needs only one side True.'},
 {ch:3,c:'print(not (5 == 5))',w:['True','5','1'],why:'5 == 5 is True, and not flips it.'},
 {ch:3,c:'hp = 25\nif hp > 50:\n    print("Strong")\nelif hp > 20:\n    print("OK")\nelse:\n    print("Weak")',w:['Strong','Weak','OK\nWeak'],why:'Only the first True branch runs: 25 > 20.'},
 {ch:3,c:'x = 0\nif x:\n    print("yes")\nelse:\n    print("no")',w:['yes','0','False'],why:'0 counts as False, so the else branch runs.'},
 {ch:4,c:'items = ["a", "b", "c"]\nprint(items[1])',w:['a','c','["b"]'],why:'Lists start counting at 0 too.'},
 {ch:4,c:'items = ["a", "b"]\nitems.append("c")\nprint(len(items))',w:['2','4','c'],why:'append adds one item, so 3.'},
 {ch:4,c:'items = [1, 2, 3]\nitems[0] = 9\nprint(items)',w:['[1, 2, 3]','[9, 1, 2, 3]','[1, 9, 3]'],why:'Index 0 is replaced. Lists can change.'},
 {ch:4,c:'print("b" in ["a", "b", "c"])',w:['False','1','b'],why:'in checks if the item is anywhere in the list.'},
 {ch:4,c:'nums = [4, 1, 3]\nnums.remove(1)\nprint(nums)',w:['[4, 1]','[1, 3]','[4, 3, 1]'],why:'remove deletes the first item equal to 1, leaving 4 and 3.'},
 {ch:5,c:'for i in range(3):\n    print(i)',w:['1\n2\n3','0\n1\n2\n3','3'],why:'range(3) is 0, 1, 2. It stops before 3.'},
 {ch:5,c:'total = 0\nfor n in [1, 2, 3]:\n    total += n\nprint(total)',w:['3','123','0'],why:'The loop adds 1, then 2, then 3.'},
 {ch:5,c:'for c in "hi":\n    print(c)',w:['hi','h i','c\nc'],why:'A for loop over text gives one character at a time.'},
 {ch:5,c:'n = 3\nwhile n > 0:\n    n -= 1\nprint(n)',w:['3','1','-1'],why:'The loop stops when n reaches 0.'},
 {ch:5,c:'for i in range(10):\n    if i == 3:\n        break\nprint(i)',w:['10','9','2'],why:'break leaves the loop while i is 3.'},
 {ch:5,c:'for i in range(1, 10, 3):\n    print(i)',w:['1\n2\n3','3\n6\n9','1\n3\n9'],why:'Start at 1, step by 3, stop before 10.'},
 {ch:6,c:'def add(a, b):\n    return a + b\nprint(add(2, 3))',w:['23','a + b','None'],why:'return sends back 2 + 3.'},
 {ch:6,c:'def say():\n    print("hi")\nx = say()\nprint(x)',w:['hi','hi\nhi','None'],why:'say prints hi but has no return, so x holds None, the "nothing here" value.'},
 {ch:6,c:'def f(x=2):\n    return x * 10\nprint(f())',w:['0','x10','TypeError'],why:'Nothing was given for x, so the default 2 is used.'},
 {ch:7,c:'d = {"a": 1, "b": 2}\nprint(d["b"])',w:['1','b','["b"]'],why:'Square brackets look up a key.'},
 {ch:7,c:'d = {"a": 1}\nprint(d.get("z", 0))',w:['1','KeyError','z'],why:'.get returns the default when the key is missing.'},
 {ch:7,c:'d = {"a": 1}\nd["a"] += 5\nprint(d)',w:["{'a': 1}","{'a': 15}","{'a': 1, 'a': 6}"],why:'The value for the key "a" goes up by 5, from 1 to 6.'},
 {ch:7,c:'print(len({"x": 1, "y": 2}))',w:['4','1','3'],why:'len of a dict counts its keys.'},
 {ch:1,c:'print(f"{2 + 3} cats")',w:['{2 + 3} cats','2 + 3 cats','23 cats'],why:'The braces hold a small calculation, so 2 + 3 becomes 5.'},
 {ch:2,c:'print(7 // 2 + 7 % 2)',w:['3','3.5','5'],why:'7 // 2 is 3 and 7 % 2 is 1, so 3 + 1.'},
 {ch:4,c:'a = [1, 2]\nb = a\nb.append(3)\nprint(a)',w:['[1, 2]','[3]','[1, 2, 3, 3]'],why:'b = a does not copy. Both names point to the same list.'},
 {ch:2,c:'print("Hello".upper().lower())',w:['HELLO','Hello','hELLO'],why:'Methods run left to right: upper, then lower.'},
 {ch:4,c:'bag = ["a", "b", "c"]\nbag.pop()\nprint(bag)',w:["['a', 'b', 'c']","['b', 'c']",'c'],why:'pop removes the last item, so c is gone.'},
 {ch:0,c:'print("Hi " + "Ada")',w:['HiAda','Hi+Ada','"Hi " + "Ada"'],why:'+ glues the two pieces of text together, space included.'}
];

/* ---------- Field guide cards ---------- */
const GUIDE=[
 {ch:0,c:'print()',what:'Shows values in the console. Separate several values with commas.',syn:[['print','fn'],['(','br'],['"Score:", 10','str'],[')','br']],ex:[['print("Score:", 10)','Score: 10'],['print("a", "b", sep="-")','a-b'],['print("no newline", end="")','stays on the line']]},
 {ch:0,c:'# comments',what:'Python skips everything after # on a line.',syn:[['# note to self','cm','comment']],ex:[['# TODO: add a boss\nprint("ok")','only ok prints']]},
 {ch:1,c:'name = value',what:'Store a value in a variable. Using the name later reads the box.',syn:[['gold','var'],['=','op'],['25','num']],ex:[['gold = 25\ngold = gold + 5\nprint(gold)','30'],['a, b = 1, 2\nprint(a, b)','two at once']]},
 {ch:1,c:'types',what:'int (5), float (2.5), str ("hi"), bool (True/False).',syn:[['type','fn'],['(x)','var']],ex:[['print(type(5), type(2.5))',''],['print(type("hi"), type(True))','']]},
 {ch:1,c:'f"...{x}..."',what:'An f-string drops values into text. Add :.2f to round to 2 decimals.',syn:[['f','kw'],['"HP: {hp}"','str']],ex:[['hp = 72.456\nprint(f"HP: {hp:.1f}")','HP: 72.5'],['n = "Ada"\nprint(f"Hi {n}!")','Hi Ada!']]},
 {ch:2,c:'+  -  *  /  //  %  **',what:'Add, subtract, multiply, divide, whole divide, remainder, power.',syn:[['17','num'],['//','op'],['5','num']],ex:[['print(17 / 5, 17 // 5, 17 % 5)','3.4 3 2'],['print(2 ** 8)','256']]},
 {ch:2,c:'text methods',what:'.upper() .lower() .title() .strip() .replace(a, b) .split()',syn:[['s','var'],['.upper','fn'],['()','br']],ex:[['print("  hi ".strip())','hi'],['print("a,b,c".split(","))',"['a', 'b', 'c']"],['print("cat".replace("c", "b"))','bat']]},
 {ch:2,c:'s[i]  s[a:b]',what:'Index from 0, negative from the end. Slices stop before b.',syn:[['s','var'],['[1:4]','num']],ex:[['s = "dragon"\nprint(s[0], s[-1], s[1:4])','d n rag'],['print("dragon"[::-1])','reversed']]},
 {ch:2,c:'input()  int()',what:'input() always returns text. Convert with int() or float().',syn:[['age','var'],['=','op'],['int','fn'],['(input("Age? "))','fn']],ex:[['age = int(input("Age? "))\nprint(age + 1)','uses the tray']]},
 {ch:3,c:'comparisons',what:'== equal, != not equal, < > <= >=. Each gives True or False.',syn:[['hp','var'],['<=','op'],['0','num']],ex:[['print(3 == 3, 3 != 4, 2 >= 5)','True True False']]},
 {ch:3,c:'if / elif / else',what:'Run a block only when a condition is True. Colon at the end, indent 4 spaces.',syn:[['if','kw'],['x > 0','var'],[':','op']],ex:[['x = 7\nif x > 5:\n    print("big")\nelif x > 0:\n    print("small")\nelse:\n    print("zero or less")','big']]},
 {ch:3,c:'and  or  not',what:'Combine conditions. and = both, or = either, not = flip.',syn:[['a','var'],['and','kw'],['not','kw'],['b','var']],ex:[['print(True and False, True or False, not True)','False True False']]},
 {ch:4,c:'[a, b, c]',what:'A list keeps items in order. Index like text.',syn:[['bag','var'],['=','op'],['["a", "b"]','str']],ex:[['bag = ["sword", "map"]\nprint(bag[0], len(bag))','sword 2']]},
 {ch:4,c:'list methods',what:'.append(x) .remove(x) .pop() .insert(i, x) .sort() .index(x)',syn:[['bag','var'],['.append','fn'],['("rope")','str']],ex:[['bag = ["b", "a"]\nbag.append("c")\nbag.sort()\nprint(bag)',"['a', 'b', 'c']"],['bag = [1, 2, 3]\nlast = bag.pop()\nprint(last, bag)','3 [1, 2]']]},
 {ch:4,c:'in',what:'Is this item inside the list, text, or dict keys?',syn:[['"a"','str'],['in','kw'],['bag','var']],ex:[['print("map" in ["map", "rope"])','True'],['print("rag" in "dragon")','True']]},
 {ch:5,c:'for x in ...',what:'Repeat once per item in a list, text, range or dict.',syn:[['for','kw'],['x','var'],['in','kw'],['items','var'],[':','op']],ex:[['for item in ["a", "b"]:\n    print(item)',''],['for i, item in enumerate(["a", "b"]):\n    print(i, item)','with positions']]},
 {ch:5,c:'range()',what:'range(stop), range(start, stop), range(start, stop, step). Stops before stop.',syn:[['range','fn'],['(1, 10, 2)','num']],ex:[['print(list(range(5)))','[0, 1, 2, 3, 4]'],['print(list(range(10, 0, -3)))','[10, 7, 4, 1]']]},
 {ch:5,c:'while  break  continue',what:'while repeats as long as the condition is True. break leaves, continue skips ahead.',syn:[['while','kw'],['n < 3','var'],[':','op']],ex:[['n = 0\nwhile n < 3:\n    print(n)\n    n += 1',''],['for i in range(6):\n    if i % 2 == 0:\n        continue\n    print(i)','odd numbers']]},
 {ch:6,c:'def',what:'Define a function once, call it many times. return sends a value back (with no return you get None, "nothing here").',syn:[['def','kw'],['area','fn'],['(w, h)','var'],[':','op']],ex:[['def area(w, h):\n    return w * h\nprint(area(3, 4))','12']]},
 {ch:6,c:'defaults & keywords',what:'Give parameters a default. Callers can name arguments.',syn:[['def','kw'],['hit','fn'],['(power=5)','var']],ex:[['def hit(power=5, crit=False):\n    return power * 2 if crit else power\nprint(hit(), hit(8, crit=True))','5 16']]},
 {ch:7,c:'{key: value}',what:'A dict maps keys to values. Look up, change or add by key.',syn:[['d','var'],['["hp"]','str']],ex:[['d = {"hp": 10}\nd["hp"] -= 3\nd["xp"] = 5\nprint(d)',"{'hp': 7, 'xp': 5}"]]},
 {ch:7,c:'dict methods',what:'.get(k, default) .keys() .values() .items() .pop(k)',syn:[['d','var'],['.items','fn'],['()','br']],ex:[['d = {"a": 1, "b": 2}\nfor k, v in d.items():\n    print(k, v)',''],['print({"a": 1}.get("z", "none"))','none']]},
 {ch:8,c:'import random',what:'randint(a, b) includes both ends. choice(list) picks one. shuffle(list) mixes in place.',syn:[['random','var'],['.randint','fn'],['(1, 6)','num']],ex:[['import random\nprint(random.randint(1, 6), random.choice(["a", "b"]))','random each run']]},
 {ch:8,c:'try / except',what:'Catch an error and handle it instead of crashing.',syn:[['try','kw'],[':','op'],['except','kw'],['ValueError','fn'],[':','op']],ex:[['try:\n    print(int("abc"))\nexcept ValueError:\n    print("not a number")','not a number']]}
];
/* The quick-fire questions a learner may see: only those whose chapter has every mission done in `done` (the saved S.done). */
const qfOpen=done=>QF.filter(q=>CH[q.ch].missions.every((_,i)=>done&&done[q.ch+'.'+i]));
const ERRS={
 SyntaxError:['Python could not read this line.','Check for a missing bracket, quote or colon, or a typo near the marked line.'],
 IndentationError:['The spaces at the start of a line are wrong.','Lines inside if, for, while and def need 4 spaces. Lines at the same level must line up exactly.'],
 NameError:['Python has no variable or function with that name.','Check the spelling and capital letters. Make sure the variable is created above the line that uses it.'],
 TypeError:['You used a value in a way its type does not allow.','A common one: joining text and a number with +. Use str(number), or an f-string.'],
 ValueError:['The type is right but the value is not usable.','Often int() on text that is not a whole number, like "abc" or "3.5".'],
 ZeroDivisionError:['You divided by zero.','Check the number after / or // or % before dividing.'],
 IndexError:['That position does not exist.','A list of 3 items has positions 0, 1 and 2. Check len() first.'],
 KeyError:['That key is not in the dictionary.','Check the spelling, or use .get(key, default) or "key in d" first.'],
 AttributeError:['That value does not have that method.','Check the spelling and the type. Lists use .append, text uses .upper, and so on.'],
 UnboundLocalError:['A function tried to change an outside variable.','Return the new value from the function and store it outside, like hp = heal(hp).'],
 TooManySteps:['Your program kept running, so the playground stopped it.','This is usually an infinite loop: something in the while condition never changes.'],
 EOFError:['input() ran out of answers.','Add another line to the Answers tray below the editor, one answer per line.'],
 RecursionError:['A function kept calling itself with no end.','Make sure there is a case where it stops calling itself.'],
 ModuleNotFoundError:['That module is not available here.','This playground includes random, math and time.'],
 OutputLimit:['Your program printed a huge amount of text.','Check for a loop that prints more than you meant.']
};
/* ---------- Python Quest app ---------- */
(()=>{
const KEY='python-quest-v1';
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function fresh(){return {ch:0,mi:0,done:{},xp:0,best:0,badges:{},code:{},tray:{},free:null,tab:'quest'}}
let S=fresh();
try{const raw=localStorage.getItem(KEY);if(raw){const o=JSON.parse(raw);if(o&&typeof o==='object')S=Object.assign(fresh(),o)}}catch(e){}
let saveT=0;function save(){clearTimeout(saveT);saveT=setTimeout(()=>{try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}},200)}
if(S.ch>=CH.length)S.ch=0;

const codeEl=$('#code'),hlEl=$('#hl'),gutEl=$('#gutter'),bandEl=$('#band'),consoleEl=$('#console'),mapEl=$('#map'),missionEl=$('#mission'),chaptersEl=$('#chapters');
const trayBox=$('#trayBox'),trayEl=$('#tray'),stepperEl=$('#stepper'),sRange=$('#sRange'),sInfo=$('#sInfo');
const mkey=()=>S.free?'free':S.ch+'.'+S.mi;
const curMission=()=>S.free?null:(CH[S.ch].missions[S.mi]||null);

/* ---------- syntax highlight ---------- */
const KW=new Set(['and','as','assert','break','class','continue','def','del','elif','else','except','finally','for','from','global','if','import','in','is','lambda','nonlocal','not','or','pass','raise','return','try','while','with','yield']);
const CONST=new Set(['True','False','None']);
const BI=new Set(['print','input','len','int','float','str','bool','list','dict','tuple','range','type','abs','min','max','sum','round','sorted','reversed','enumerate','zip','isinstance','chr','ord','any','all']);
function highlight(src){let h='';const re=/(#[^\n]*)|([rRfFbB]{0,2}(?:"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?))|(\b\d[\d_]*\.?\d*(?:[eE][+-]?\d+)?\b)|([A-Za-z_]\w*)|([^#'"A-Za-z_\d]+|.)/g;let m;
  while((m=re.exec(src))){if(m[1])h+=`<span class="sy-cm">${esc(m[1])}</span>`;else if(m[2])h+=`<span class="sy-str">${esc(m[2])}</span>`;else if(m[3])h+=`<span class="sy-num">${esc(m[3])}</span>`;
    else if(m[4]){const w=m[4],next=src.slice(re.lastIndex).match(/^\s*\(/);h+=KW.has(w)?`<span class="sy-kw">${w}</span>`:CONST.has(w)?`<span class="sy-const">${w}</span>`:(BI.has(w)||next)?`<span class="sy-fn">${w}</span>`:esc(w)}
    else h+=esc(m[5])}return h}

/* ---------- editor ---------- */
let lastRes=null,stepIdx=0,errLine=null;
function lh(){const d=gutEl.firstElementChild;return d?d.getBoundingClientRect().height||22:22}
function renderEditor(){const v=codeEl.value;hlEl.innerHTML=highlight(v)+'\n ';const n=v.split('\n').length;
  let g='';const cur=stepLine();for(let i=1;i<=n;i++)g+=`<div class="${i===cur?'cur':i===errLine?'bad':''}">${i}</div>`;gutEl.innerHTML=g;placeBand()}
function stepLine(){if(!lastRes||stepperEl.hidden)return null;const st=lastRes.steps[stepIdx];return st&&!st.end?st.line:null}
function placeBand(){const cur=stepLine();const line=cur||errLine;if(!line){bandEl.hidden=true;return}bandEl.hidden=false;bandEl.classList.toggle('err',!cur);bandEl.style.top=(12+(line-1)*lh())+'px';
  bandEl.style.height=lh()+'px'}
function scrollToLine(line){const ed=$('#editor');const y=12+(line-1)*lh();if(y<ed.scrollTop+10||y>ed.scrollTop+ed.clientHeight-40)ed.scrollTop=Math.max(0,y-ed.clientHeight/2)}
function setCode(v,keepRes){codeEl.value=v;S.code[mkey()]=v;save();if(!keepRes)clearRun();renderEditor();updateTray()}
function insertText(t){codeEl.focus();if(!document.execCommand||!document.execCommand('insertText',false,t)){const a=codeEl.selectionStart,b=codeEl.selectionEnd;codeEl.setRangeText(t,a,b,'end');codeEl.dispatchEvent(new Event('input'))}}
let tabEscape=false;
codeEl.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();run();return}
  if(e.key==='Escape'){tabEscape=true;return}
  if(e.key==='Tab'){if(tabEscape){tabEscape=false;return}e.preventDefault();const v=codeEl.value,a=codeEl.selectionStart,b=codeEl.selectionEnd;
    if(a!==b&&v.slice(a,b).includes('\n')||e.shiftKey){const ls=v.lastIndexOf('\n',a-1)+1;const block=v.slice(ls,b);const nb=e.shiftKey?block.replace(/^ {1,4}/gm,''):block.replace(/^/gm,'    ');
      codeEl.setSelectionRange(ls,b);insertText(nb);codeEl.setSelectionRange(ls,ls+nb.length);return}
    insertText('    ');return}
  tabEscape=false;
  if(e.key==='Enter'&&!e.shiftKey){const v=codeEl.value,a=codeEl.selectionStart;const ls=v.lastIndexOf('\n',a-1)+1;const line=v.slice(ls,a);let ind=(line.match(/^ */)||[''])[0];
    if(/:\s*(#.*)?$/.test(line))ind+='    ';else if(/^\s*(return|break|continue|pass)\b/.test(line))ind=ind.slice(4);e.preventDefault();insertText('\n'+ind);return}
  if(e.key==='Backspace'&&codeEl.selectionStart===codeEl.selectionEnd){const v=codeEl.value,a=codeEl.selectionStart;const ls=v.lastIndexOf('\n',a-1)+1;const before=v.slice(ls,a);
    if(before.length>=4&&/^ +$/.test(before)){e.preventDefault();const k=before.length%4||4;codeEl.setSelectionRange(a-k,a);insertText('')}}
});
codeEl.addEventListener('input',()=>{S.code[mkey()]=codeEl.value;save();if(lastRes)clearRun(true);renderEditor();updateTray()});
$('#keys').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const k=b.dataset.k;if(k==='TAB')insertText('    ');else insertText(k)});
trayEl.addEventListener('input',()=>{S.tray[mkey()]=trayEl.value;save()});
function updateTray(){const m=curMission();const need=/input\s*\(/.test(codeEl.value)||(m&&m.inputs);trayBox.hidden=!need;
  if(need&&document.activeElement!==trayEl){const k=mkey();trayEl.value=S.tray[k]!==undefined?S.tray[k]:(m&&m.inputs?m.inputs.join('\n'):'')}}
let armReset=0;$('#resetCode').addEventListener('click',e=>{const b=e.currentTarget;if(!b.classList.contains('armed')){b.classList.add('armed');b.textContent='Click again to reset';clearTimeout(armReset);armReset=setTimeout(()=>{b.classList.remove('armed');b.textContent='Reset code'},3000);return}
  b.classList.remove('armed');b.textContent='Reset code';const m=curMission();setCode(S.free?S.free.code:m?m.starter:'');delete S.tray[mkey()];updateTray();codeEl.focus()});

/* ---------- run ---------- */
function inputsNow(){return trayBox.hidden?[]:trayEl.value.split('\n').map(s=>s.replace(/\r/g,'')).filter((s,i,a)=>!(i===a.length-1&&s===''))}
let lastCheck=null;
function run(){stopPlay();const src=codeEl.value,inputs=inputsNow();let res;
  try{res=PY.run(src,{inputs})}catch(e){res={out:'',inEcho:[],steps:[],error:{type:'InternalError',msg:'the playground hit a problem running this code: '+e.message,line:1},ok:false}}
  lastRes=res;errLine=res.error?res.error.line:null;lastCheck=null;const m=curMission();
  if(m){let r;try{r=m.check(makeCtx(src,res,inputs))}catch(e){r='Something in your code made the check fail. Make sure the variables named in the goal exist.'}
    if(!res.error&&r===true){lastCheck={win:true,first:!S.done[mkey()]};if(!S.done[mkey()]){S.done[mkey()]=true;S.xp+=10;
        const ch=CH[S.ch];if(!S.badges[S.ch]&&ch.missions.every((_,i)=>S.done[S.ch+'.'+i])){S.badges[S.ch]=true;S.xp+=25;lastCheck.badge=true}}
      pop=true;save()}
    else lastCheck={win:false,tip:typeof r==='string'?r:null}}
  stepperEl.hidden=!res.steps||res.steps.length<2;sRange.max=Math.max(0,(res.steps||[]).length-1);stepIdx=+sRange.max;sRange.value=stepIdx;
  renderStep();renderEditor();if(errLine)scrollToLine(errLine);if(lastCheck&&lastCheck.win){renderChapters();renderMission();renderXP()}}
function clearRun(keepConsole){lastRes=null;errLine=null;stepperEl.hidden=true;stopPlay();if(!keepConsole){renderConsole();renderMap(null)}else{renderMap(null,true)}placeBand()}
$('#run').addEventListener('click',run);

/* ---------- console ---------- */
function outHTML(out,inEcho,upto){let h='',pos=0;const lim=upto===undefined?out.length:upto;
  for(const [a,b] of inEcho){if(a>=lim)break;h+=esc(out.slice(pos,Math.min(a,lim)));h+=`<span class="in">${esc(out.slice(a,Math.min(b,lim)).replace(/\n$/,''))}</span>`+(b<=lim&&out[b-1]==='\n'?'\n':'');pos=Math.min(b,lim)}
  return h+esc(out.slice(pos,lim))}
function renderConsole(){const r=lastRes;let h='<div class="ttl">Console</div>';
  if(!r){h+=`<pre class="sys">${S.free?'Free play. Write anything and press Run.':'Press Run to see what your code prints.'}</pre>`;consoleEl.innerHTML=h;return}
  const st=r.steps&&r.steps[stepIdx],final=!st||st.end||stepperEl.hidden;
  const body=outHTML(r.out,r.inEcho||[],final?undefined:st.out);
  h+=`<pre>${body||(final&&!r.error?'<span class="sys">(nothing was printed)</span>':'')}${final?'':'<span class="caret"></span>'}</pre>`;
  if(final&&r.error){const E=ERRS[r.error.type]||['Something went wrong while running.','Read the message above and check the marked line.'];const lineTxt=(codeEl.value.split('\n')[r.error.line-1]||'').trim();
    const nice={TooManySteps:'Stopped: too many steps',EOFError:'input() ran out of answers'}[r.error.type]||`${r.error.type} on line ${r.error.line}`;
    h+=`<div class="msg err"><span class="h">${esc(nice)}</span>${lineTxt?`<span class="py">line ${r.error.line}: ${esc(lineTxt)}</span>`:''}<span class="py">${esc(r.error.type)}: ${esc(r.error.msg)}</span><p><b>What it means:</b> ${esc(E[0])}</p><p><b>How to fix it:</b> ${esc(E[1])}</p></div>`}
  if(final&&lastCheck){if(lastCheck.win){const last=S.mi>=CH[S.ch].missions.length-1;
      h+=`<div class="msg win"><span class="h">${lastCheck.first?'Mission complete! +10 XP':'Mission complete'}${lastCheck.badge?' · Badge earned: '+esc(CH[S.ch].badge)+' +25 XP':''}</span><p>${winLine()}</p><button class="btn" data-act="next">${last?'Finish the chapter':'Next mission'} →</button></div>`}
    else if(lastCheck.tip)h+=`<div class="msg tip"><span class="h">${r.error?'Mission tip':'Not quite yet'}</span><p>${esc(lastCheck.tip)}</p></div>`}
  consoleEl.innerHTML=h;if(final)consoleEl.scrollTop=consoleEl.scrollHeight}
const WINS=['Nice work. Drag the step slider to replay exactly how it ran.','That runs perfectly. Try changing a value and running it again to see what changes.','Clean. Look at the memory map to see what your code left behind.','Solid. Every program you will ever write is made of pieces like this one.'];
function winLine(){return WINS[(S.ch*7+S.mi)%WINS.length]}
consoleEl.addEventListener('click',e=>{const b=e.target.closest('[data-act="next"]');if(b)gotoMission(S.ch,S.mi+1)});

/* ---------- stepper ---------- */
function renderStep(){const r=lastRes;if(!r)return;const st=r.steps[stepIdx];
  if(!stepperEl.hidden&&st){const n=r.steps.length;const lineTxt=st.end?'':(codeEl.value.split('\n')[st.line-1]||'').trim();
    sInfo.innerHTML=st.end?`Step <b>${n}</b> of ${n} · <b>${r.error?'stopped by an error':'finished'}</b>${r.truncated?` · replay shows the first ${n-1} steps`:''}`:`Step <b>${stepIdx+1}</b> of ${n} · about to run line <b>${st.line}</b>: <code>${esc(lineTxt.length>48?lineTxt.slice(0,46)+'…':lineTxt)}</code>`}
  renderConsole();renderMap(st,false,stepIdx>0?r.steps[stepIdx-1]:null);renderEditor();if(st&&!st.end)scrollToLine(st.line)}
function setStep(i){if(!lastRes)return;stepIdx=Math.max(0,Math.min(+sRange.max,i));sRange.value=stepIdx;renderStep()}
sRange.addEventListener('input',()=>{stopPlay();setStep(+sRange.value)});
$('#sFirst').onclick=()=>{stopPlay();setStep(0)};$('#sPrev').onclick=()=>{stopPlay();setStep(stepIdx-1)};$('#sNext').onclick=()=>{stopPlay();setStep(stepIdx+1)};$('#sLast').onclick=()=>{stopPlay();setStep(+sRange.max)};
let playT=0;function stopPlay(){clearInterval(playT);playT=0;const p=$('#sPlay');p.setAttribute('aria-pressed','false');p.textContent='▷';p.setAttribute('aria-label','Play')}
$('#sPlay').onclick=()=>{if(playT){stopPlay();return}if(stepIdx>=+sRange.max)setStep(0);const p=$('#sPlay');p.setAttribute('aria-pressed','true');p.textContent='❚❚';p.setAttribute('aria-label','Pause');
  playT=setInterval(()=>{if(stepIdx>=+sRange.max){stopPlay();return}setStep(stepIdx+1)},650)};

/* ---------- memory map ---------- */
function valHTML(v,nested){const cls='t-'+(['int','float','str','bool','NoneType','list','tuple','dict','function'].includes(v.t)?v.t:'other');
  if(v.items){const open=v.t==='tuple'?['(',')']:['[',']'];
    return `<div class="coll ${cls}"><em>${v.t} · ${v.items.length+v.more} item${v.items.length+v.more===1?'':'s'}${v.id&&aliases[v.id]?`<span class="alias" title="Several names point to this same ${v.t}">shared with ${esc(aliases[v.id])}</span>`:''}</em>${v.items.length?`<div class="cells">${v.items.map((x,i)=>`<div class="cell">${valHTML(x,true)}<i>${i}</i></div>`).join('')}${v.more?`<div class="cell"><span class="empty">+${v.more} more</span></div>`:''}</div>`:`<span class="empty">empty ${esc(open.join(''))}</span>`}</div>`}
  if(v.pairs){return `<div class="coll ${cls}"><em>dict · ${v.pairs.length+v.more} key${v.pairs.length+v.more===1?'':'s'}${v.id&&aliases[v.id]?`<span class="alias">shared with ${esc(aliases[v.id])}</span>`:''}</em>${v.pairs.length?v.pairs.map(([k,x])=>`<div class="pair">${valHTML(k,true)}<span class="ar">→</span>${valHTML(x,true)}</div>`).join(''):'<span class="empty">empty {}</span>'}${v.more?`<span class="empty">+${v.more} more</span>`:''}</div>`}
  const label=v.t==='function'?'def':v.t==='NoneType'?'':v.t;
  return `<span class="val ${cls}">${esc(v.t==='function'?v.r:v.r)}${label&&!nested?`<em>${esc(label)}</em>`:''}</span>`}
let aliases={};
function renderMap(st,stale,prev){$('#mapSub').textContent=st?(st.end?'What your program left in memory when it ended.':`Memory just before line ${st.line} runs.`):stale?'Code changed. Run it again to refresh the map.':'Every variable your program creates, drawn as a labelled box.';
  if(!st){mapEl.innerHTML=`<div class="mapEmpty"><p style="margin:0">Run your code and each variable appears here as a labelled box, coloured by its type. Lists show numbered slots. Function calls get their own frame.</p>
    <div class="demo" aria-hidden="true"><div class="var"><span class="vname">hero</span><div class="vbox"><span class="val t-str">'Ada'<em>str</em></span></div></div><div class="var"><span class="vname">hp</span><div class="vbox"><span class="val t-int">100<em>int</em></span></div></div><div class="var"><span class="vname">bag</span><div class="vbox"><div class="coll t-list"><em>list · 2 items</em><div class="cells"><div class="cell"><span class="val t-str">'sword'</span><i>0</i></div><div class="cell"><span class="val t-str">'map'</span><i>1</i></div></div></div></div></div></div></div>`;return}
  const names={};st.frames.forEach(f=>f.vars.forEach(([n,v])=>{if(v.id){(names[v.id]=names[v.id]||[]).push(n)}}));aliases={};
  const prevMap={};if(prev)prev.frames.forEach(f=>f.vars.forEach(([n,v])=>prevMap[f.name+'|'+n]=JSON.stringify(v)));
  mapEl.innerHTML=st.frames.map((f,fi)=>{const vars=f.vars;return `<div class="frame${fi?' fn':''}"><div class="fh"><span>${fi?'Inside '+esc(f.name):'Global'}</span><span>${vars.length} variable${vars.length===1?'':'s'}</span></div>${vars.length?vars.map(([n,v])=>{
      aliases={};if(v.id&&names[v.id]&&names[v.id].length>1)aliases[v.id]=names[v.id].filter(x=>x!==n).join(', ');
      const changed=prev&&prevMap[f.name+'|'+n]!==JSON.stringify(v);return `<div class="var${changed?' flash':''}"><span class="vname">${esc(n)}</span><div class="vbox">${valHTML(v)}</div></div>`}).join(''):`<span class="empty">${fi?'no local variables':'nothing stored yet'}</span>`}</div>`}).join('')}

/* ---------- mission panel ---------- */
let pop=false;
function anatomy(t){if(!t)return '';const L={fn:'function',str:'text',num:'number',var:'variable',kw:'keyword',op:'operator',br:'brackets',cm:'comment'};
  return `<div class="anat" aria-label="Parts of the code">${t.map(([s,k,l])=>`<div class="tok k-${k}"><b>${esc(s)}</b><span>${esc(l||L[k]||k)}</span></div>`).join('')}</div>`}
const totalDone=ci=>CH[ci].missions.filter((_,i)=>S.done[ci+'.'+i]).length;
function renderChapters(){chaptersEl.innerHTML=CH.map((c,i)=>`<button class="chap${S.badges[i]?' earned':''}" data-ch="${i}" aria-current="${i===S.ch&&!S.free}"><span class="num">${S.badges[i]?'★':i+1}</span><span class="nm">${esc(c.name)}</span><span class="ct">${totalDone(i)}/${c.missions.length}</span></button>`).join('')}
function renderMission(){
  if(S.free){missionEl.innerHTML=`<span class="freeTag">Free play</span><h2>Your sandbox</h2><p class="explain">Experiment with anything here. Nothing is checked and nothing can break. The memory map and the step slider still work.</p>
    <p class="note">Tip: change one thing at a time and run it again. Predict what will happen before you press Run.</p><div class="actions"><button class="btn" data-act="back">Back to Chapter ${S.ch+1}, mission ${Math.min(S.mi+1,CH[S.ch].missions.length)}</button></div>`;return}
  const ch=CH[S.ch],n=ch.missions.length;
  const dots=`<div class="dots" aria-label="Missions in this chapter">${ch.missions.map((m,i)=>`<button class="dot${S.done[S.ch+'.'+i]?' done':''}${i===S.mi?' cur':''}" data-mi="${i}" title="${esc(m.title)}" aria-label="Mission ${i+1}: ${esc(m.title)}">${i+1}</button>`).join('')}</div>`;
  let h;
  if(S.mi>=n){const all=totalDone(S.ch)===n,last=S.ch===CH.length-1;
    h=`<div class="eyebrow">Chapter ${S.ch+1} complete</div><div class="badge-art${all?'':' dim'}">${all?'★':S.ch+1}</div>
    <h2>${last?'You finished Python Quest':all?'Badge earned: '+esc(ch.badge):'Chapter finished'}</h2>
    <p class="explain">${last?'You can store values, make decisions, loop over lists, write functions, organise data in dictionaries and build small games. That is the core of Python.':'You can now use these in any Python program:'}</p>
    <div class="learned">${ch.learned.map(x=>`<code>${esc(x)}</code>`).join('')}</div>
    ${last?`<p class="note">Next: play Quick-fire until reading code feels natural, then install Python on your computer. The field guide shows how.</p><div class="actions"><button class="btn" data-act="tab-fire">Play Quick-fire</button><button class="btn ghost" data-act="tab-guide">Open the field guide</button></div>`
      :`<div class="actions"><button class="btn" data-act="nextch">Start chapter ${S.ch+2}: ${esc(CH[S.ch+1].name)}</button><button class="btn ghost" data-act="free">Free play</button></div>`}${dots}`}
  else{const m=ch.missions[S.mi];
    h=`${Trail.html(ch.story)}<div class="eyebrow">Chapter ${S.ch+1} · Mission ${S.mi+1} of ${n}${S.done[S.ch+'.'+S.mi]?' · done ✓':''}</div>
    ${S.mi===0?`<p class="intro">${HowSteps.tick(ch.intro,esc)}</p>`:''}
    <h2>${esc(m.title)}</h2>
    <div class="goal"><div class="label">Your goal</div><p>${m.goal}</p></div>
    ${anatomy(m.anat)}
    ${HowSteps.html(m.how)}
    <p class="explain">${m.explain}</p>
    ${m.note?`<p class="note">${m.note}</p>`:''}
    <div class="actions"><button class="btn ghost" data-act="hint" aria-expanded="false">Show a hint</button><button class="btn ghost" data-act="fill">Type it for me</button></div>
    <div class="hint" id="hintBox" hidden><span>One way to write it:</span><pre>${highlight(m.answer)}</pre></div>${dots}`}
  missionEl.innerHTML=h;if(pop){missionEl.classList.remove('pop');void missionEl.offsetWidth;missionEl.classList.add('pop');pop=false}}
missionEl.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.mi!==undefined){gotoMission(S.ch,+b.dataset.mi);return}const a=b.dataset.act;
  if(a==='hint'){const hb=$('#hintBox');hb.hidden=!hb.hidden;b.setAttribute('aria-expanded',String(!hb.hidden));b.textContent=hb.hidden?'Show a hint':'Hide the hint'}
  else if(a==='fill'){const m=curMission();if(m){setCode(m.answer);codeEl.focus()}}
  else if(a==='nextch')gotoMission(S.ch+1,0);else if(a==='back'){S.free=null;loadMission()}
  else if(a==='free'){goFree('# Free play: try anything!\n')}else if(a&&a.startsWith('tab-'))showTab(a.slice(4))});
chaptersEl.addEventListener('click',e=>{const b=e.target.closest('.chap');if(!b)return;const ci=+b.dataset.ch;const ch=CH[ci];let mi=ch.missions.findIndex((_,i)=>!S.done[ci+'.'+i]);if(mi<0)mi=0;gotoMission(ci,mi)});
function gotoMission(ci,mi){S.free=null;S.ch=ci;S.mi=mi;save();loadMission();if(innerWidth<820)missionEl.scrollIntoView({behavior:'smooth',block:'start'})}
function loadMission(){const m=curMission();const k=mkey();codeEl.value=S.free?S.free.code:S.code[k]!==undefined?S.code[k]:m?m.starter:'';
  $('#fileName').textContent=S.free?'sandbox.py':m?`mission_${S.ch+1}_${S.mi+1}.py`:'quest.py';$('#edNote').textContent=S.free?'Free play':m?'Write your code here':'Chapter complete';
  clearRun();renderChapters();renderMission();renderEditor();updateTray()}
function goFree(code){S.free={code};S.code.free=code;save();showTab('quest');loadMission();codeEl.focus()}

/* ---------- XP ---------- */
const RANKS=[[0,'Hatchling'],[120,'Coder'],[280,'Builder'],[460,'Pythonista'],[640,'Python Wizard']];
function renderXP(){let i=0;while(i+1<RANKS.length&&S.xp>=RANKS[i+1][0])i++;const lo=RANKS[i][0],hi=i+1<RANKS.length?RANKS[i+1][0]:lo;
  $('#rank').textContent=RANKS[i][1];$('#xpText').textContent=S.xp+' XP';$('#xpFill').style.width=(hi>lo?Math.min(100,(S.xp-lo)/(hi-lo)*100):100)+'%'}

/* ---------- tabs ---------- */
function showTab(t){S.tab=t;save();document.querySelectorAll('.tabs button').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===t)));
  ['quest','fire','guide'].forEach(x=>$('#tab-'+x).hidden=x!==t);if(t!=='fire')stopFire(true);if(t==='guide'&&!$('#guide').innerHTML)renderGuide();if(t==='fire'&&!fireOn)fireIdle()}
document.querySelector('.tabs').addEventListener('click',e=>{const b=e.target.closest('button');if(b)showTab(b.dataset.tab)});
document.querySelector('.tabs').addEventListener('keydown',e=>{if(e.key!=='ArrowRight'&&e.key!=='ArrowLeft')return;const bs=[...document.querySelectorAll('.tabs button')];let i=bs.findIndex(b=>b.getAttribute('aria-selected')==='true');i=(i+(e.key==='ArrowRight'?1:bs.length-1))%bs.length;showTab(bs[i].dataset.tab);bs[i].focus()});

/* ---------- quick-fire ---------- */
const fStage=$('#fStage');let fireOn=false,fT=0,fLeft=75,fScore=0,fStreak=0,fQ=null,fDeck=[],fMiss=[],fLocked=false;
function setStats(){$('#fScore').textContent=fScore;$('#fStreak').textContent=fStreak;$('#fBest').textContent=S.best;$('#fTime').textContent=fLeft;$('#fTimer').style.width=(fLeft/75*100)+'%'}
function fireIdle(){const open=qfOpen(S.done);
  if(!open.length){fStage.innerHTML=`<div class="example panel" style="padding:12px 14px;border-style:dashed;display:flex;flex-direction:column;gap:8px"><span class="eyebrow">Locked for now</span><p class="explain" style="margin:0">Quick-fire only asks about things the quest has already taught. Finish all of <b>Chapter 1: ${esc(CH[0].name)}</b> first, and the first questions open up. Each later chapter you finish adds more.</p></div>
  <div class="actions"><button class="btn" id="fGo">Go to the quest</button></div>`;setStats();return}
  const ex=QF[1],more=open.length<QF.length;
  fStage.innerHTML=`<div class="example panel" style="padding:12px 14px;border-style:dashed;display:flex;flex-direction:column;gap:8px"><span class="eyebrow">Example round</span><pre class="snippet">${highlight(ex.c)}</pre><p class="note" style="margin:0">Pick the output: <code>7</code>, <code>34</code> or <code>3 + 4</code>? The answer is <code>34</code>. ${esc(ex.why)}</p></div>
  ${more?`<p class="note" style="margin:0">${open.length} of ${QF.length} questions are open. Finish more chapters to unlock the rest.</p>`:''}
  <div class="actions"><button class="btn" id="fStart">Start the clock</button><span class="note" style="align-self:center">Keys <kbd>1</kbd>–<kbd>4</kbd> pick an answer.</span></div>`;setStats()}
function answerOf(q){if(q.ans===undefined){const r=PY.run(q.c,{trace:false});q.ans=r.out.replace(/\n$/,'')}return q.ans}
function nextQ(){if(!fDeck.length)fDeck=qfOpen(S.done).sort(()=>Math.random()-.5);fQ=fDeck.pop();const ans=answerOf(fQ);
  const opts=[ans,...fQ.w.filter(w=>w!==ans).slice(0,3)].sort(()=>Math.random()-.5);fQ.opts=opts;fLocked=false;
  fStage.innerHTML=`<div class="task">What does this print?</div><pre class="snippet">${highlight(fQ.c)}</pre><div class="opts">${opts.map((o,i)=>`<button class="opt" data-i="${i}"><span class="n">${i+1}</span><pre>${esc(o)}</pre></button>`).join('')}</div>
  <p class="fb" id="fFb" aria-live="polite"></p><div class="actions"><button class="btn ghost" id="fStop">End round</button></div>`;fStage.querySelector('.opt').focus({preventScroll:true})}
function pick(i){if(!fireOn||fLocked||!fQ)return;fLocked=true;const ans=fQ.ans,ok=fQ.opts[i]===ans;const bs=[...fStage.querySelectorAll('.opt')];
  bs.forEach((b,j)=>{b.disabled=true;if(fQ.opts[j]===ans)b.classList.add('right');else if(j===i)b.classList.add('wrong')});const fb=$('#fFb');
  if(ok){fStreak++;const pts=10+Math.min(fStreak-1,5)*2;fScore+=pts;fb.className='fb good';fb.textContent=`Correct! +${pts}${fStreak>1?` (streak ${fStreak})`:''}`}
  else{fStreak=0;fMiss.push(fQ);fb.className='fb bad';fb.textContent='Not this time. '+fQ.why}
  setStats();setTimeout(()=>{if(fireOn)nextQ()},ok?650:2200)}
function startFire(){if(!qfOpen(S.done).length){fireIdle();return}fDeck=[];fireOn=true;fLeft=75;fScore=0;fStreak=0;fMiss=[];setStats();nextQ();clearInterval(fT);fT=setInterval(()=>{fLeft--;setStats();if(fLeft<=0)stopFire()},1000)}
function stopFire(silent){if(!fireOn)return;fireOn=false;clearInterval(fT);if(silent){fireIdle();return}if(fScore>S.best){S.best=fScore;save()}setStats();
  fStage.innerHTML=`<div class="task">Round over: ${fScore} points</div><p class="note" style="margin:0">${fScore>=S.best&&fScore>0?'That is your best score so far.':`Your best is ${S.best}.`}</p>
  ${fMiss.length?`<div><p class="explain" style="margin:0 0 8px"><b>Review these:</b></p><ul class="misses">${fMiss.map((q,i)=>`<li><pre class="snippet">${highlight(q.c)}</pre><div class="row"><span>Prints <code>${esc(q.ans)}</code></span><span class="note">${esc(q.why)}</span><button class="try" data-miss="${i}">Try it</button></div></li>`).join('')}</ul></div>`:'<p class="explain" style="margin:0">No misses. Excellent reading.</p>'}
  <div class="actions"><button class="btn" id="fStart">Play again</button></div>`}
fStage.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.id==='fStart')startFire();else if(b.id==='fGo')showTab('quest');else if(b.id==='fStop')stopFire();else if(b.dataset.i!==undefined)pick(+b.dataset.i);else if(b.dataset.miss!==undefined)goFree(fMiss[+b.dataset.miss].c)});
document.addEventListener('keydown',e=>{if(!fireOn||$('#tab-fire').hidden)return;if(/^[1-4]$/.test(e.key)){e.preventDefault();pick(+e.key-1)}});

/* ---------- field guide ---------- */
function exHTML(g){return `<div class="ex">${g.ex.map(([c,n])=>`<div class="exrow"><pre class="snippet">${highlight(c)}</pre><div class="meta">${n?`<small># ${esc(n)}</small>`:''}<button class="try" data-code="${esc(c)}">Try it</button></div></div>`).join('')}</div>`}
function renderGuide(){const groups=CH.map(c=>c.name);
  const TY=[['int','Whole numbers','42, -7, 0'],['float','Decimal numbers','3.14, 2.0'],['str','Text, in quotes','"Ada", \'hi\''],['bool','Yes or no','True, False'],['list','Ordered items','["a", "b"]'],['dict','Key → value pairs','{"hp": 10}'],['function','Reusable code','def heal(hp):'],['NoneType','Nothing here (see Functions)','None']];
  $('#guide').innerHTML=`<div><h2>Field guide</h2><p class="lede">Everything from the quest on one page. Every example has a Try it button that opens it in the editor, where you can run it and step through it.</p></div>
  <section class="gsec"><h3>How to read a line of Python</h3><div class="panel bigan">${anatomy([['total','var'],['=','op'],['price','var'],['*','op'],['int','fn'],['(','br'],['input','fn'],['("How many? ")','str'],[')','br']])}
    <p class="explain" style="margin:0">Read it from the inside out. <code>input()</code> asks the question and gives back text. <code>int()</code> turns that text into a number. <code>price * …</code> multiplies. Finally <code>=</code> stores the result in the box called <code>total</code>.</p></div></section>
  <section class="gsec"><h3>Types at a glance</h3><div class="types">${TY.map(([t,d,e])=>`<article class="card panel t-${t}"><h4>${t}</h4><p>${esc(d)}</p><code>${esc(e)}</code></article>`).join('')}</div></section>
  <section class="gsec"><h3>Reading an error</h3><div class="errdemo"><div class="console"><div class="ttl">Console</div><div class="msg err" style="margin-top:4px"><span class="h">TypeError on line 3</span><span class="py">line 3: print("Gold: " + gold)</span><span class="py">TypeError: can only concatenate str (not "int") to str</span></div></div>
    <ol><li><b>Find the line number.</b> The editor marks it in red.</li><li><b>Read the error type.</b> TypeError means a value was the wrong kind for the job.</li><li><b>Read the message.</b> Here, text and a number were joined with +.</li><li><b>Fix and run again.</b> Use <code>str(gold)</code> or an f-string: <code>f"Gold: {gold}"</code>.</li></ol></div></section>
  <section class="gsec"><h3>Indentation rules</h3><ol class="panel rules"><li>A line ending in a colon (<code>if</code>, <code>elif</code>, <code>else</code>, <code>for</code>, <code>while</code>, <code>def</code>, <code>try</code>) starts a block.</li><li>Every line in the block is indented 4 spaces more than the line with the colon.</li><li>The block ends at the first line that goes back out to the earlier level.</li><li>Lines at the same level must line up exactly. Mixing 2 and 4 spaces causes an IndentationError.</li></ol></section>
  ${groups.map((gname,gi)=>{const items=GUIDE.filter(g=>g.ch===gi);return items.length?`<section class="gsec"><h3>Chapter ${gi+1}: ${esc(gname)}</h3><div class="cards">${items.map(g=>`<article class="card panel"><h4>${esc(g.c)}</h4><p>${esc(g.what)}</p>${anatomy(g.syn)}${exHTML(g)}</article>`).join('')}</div></section>`:''}).join('')}
  <section class="gsec"><h3>Run Python on your computer</h3><div class="os">
    <article class="card panel"><h4>Windows</h4><p>Download Python 3 from python.org and run the installer. Tick <b>Add python.exe to PATH</b> on the first screen. Then open <b>IDLE</b> from the Start menu, choose File → New File, paste your code and press F5.</p></article>
    <article class="card panel"><h4>Mac</h4><p>Download Python 3 from python.org and install it. Open <b>IDLE</b> from Applications → Python 3, or type <code>python3</code> in Terminal. Save files as <code>game.py</code> and run them with <code>python3 game.py</code>.</p></article>
    <article class="card panel"><h4>Linux</h4><p>Python 3 is usually installed already. In a terminal, type <code>python3</code> to try code line by line, or <code>python3 game.py</code> to run a file. Your Shell Quest skills apply here.</p></article>
    <article class="card panel"><h4>An editor to grow into</h4><p><b>Thonny</b> is built for beginners and has a debugger that works a lot like the step slider here. <b>VS Code</b> with the Python extension is what many professionals use.</p></article>
  </div></section>
  <section class="gsec"><h3>After this course</h3><div class="panel" style="padding:14px 16px;display:flex;flex-direction:column;gap:12px"><p class="explain">Good next topics, roughly in order: list comprehensions (<code>[x * 2 for x in nums]</code>), tuples and sets, reading and writing files, classes and objects, then modules you install with <code>pip</code>. For games, try the <b>pygame</b> library or the built-in <b>turtle</b> module for drawing. Python Tutor (pythontutor.com) shows memory diagrams like this one for any code.</p>
   <div class="actions"><button class="linkbtn" id="resetProgress">Reset all progress</button></div></div></section>`}
let armProg=0;$('#guide').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.code!==undefined){goFree(b.dataset.code);run();return}
  if(b.id==='resetProgress'){if(!b.classList.contains('armed')){b.classList.add('armed');b.textContent='Click again to erase XP, badges and saved code';clearTimeout(armProg);armProg=setTimeout(()=>{b.classList.remove('armed');b.textContent='Reset all progress'},4000);return}
    S=fresh();save();renderXP();showTab('quest');loadMission()}});

/* ---------- boot ---------- */
window.addEventListener('resize',()=>placeBand());
renderXP();loadMission();showTab(S.tab==='guide'||S.tab==='fire'?S.tab:'quest');
})();
