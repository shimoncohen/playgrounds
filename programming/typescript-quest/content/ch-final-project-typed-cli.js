(()=>{
'use strict';
const TSQ=window.TSQ=window.TSQ||{};
const CFG='{\n  "compilerOptions": {\n    "target": "ES2022",\n    "module": "commonjs",\n    "strict": true\n  }\n}\n';
const J=rows=>'[\n'+rows.map(r=>'  {"wagon": '+r[0]+', "performer": "'+r[1]+'", "time": "'+r[2]+'"}').join(',\n')+'\n]\n';
const DATA={
 'timetable.json':J([[4,'Mumbles','08:15'],[7,'Pepper','09:40'],[2,'Bellamy','11:05']]),
 'smudged.json':J([[4,'Mumbles','08:15'],[4,'Pepper','08:15'],[7,'Bellamy','09:40']]),
 'tour-book.json':J([[4,'Mumbles','08:15'],[7,'Pepper','09:40'],[4,'Bellamy','11:05'],[2,'Cosmo','12:30'],[7,'Dot','14:00']]),
 'broken.json':'[\n  {"wagon": 4, "performer": "Mumbles", "time": "08:15"\n',
};
const WITH=(files)=>({'tsconfig.json':CFG,...files,...DATA});
const IMPORT=names=>'import { '+names+' } from "./book"\n\n';
const UNION='type Command =\n  | { kind: "add"; wagon: number; performer: string; time: string }\n  | { kind: "list"; file: string }\n';
const UNION_CHECK=UNION+'  | { kind: "check"; file: string }\n';
const PARSE=(check,file)=>'\nfunction parse(words: string[]): Command {\n  if (words[0] === "add") {\n    return { kind: "add", wagon: Number(words[1]), performer: words[2], time: words[3] }\n  }\n'+(check?'  if (words[0] === "check") {\n    return { kind: "check", file: words[1] }\n  }\n':'')+'  return { kind: "list", file: '+file+' }\n}\n\nconst command = parse(process.argv.slice(2))\n';
const SAY=verb=>'console.log("'+verb+' " + command.performer + " to wagon " + command.wagon + " at " + command.time)';
const EACH='book.forEach(b => console.log(b.time + " Wagon " + b.wagon + ": " + b.performer))';
const CATCH='  } catch {\n    console.error("Cannot read " + command.file)\n    process.exitCode = 1\n  }\n';

const C1_START='const words = process.argv.slice(2)\nconsole.log("Words typed: " + words.length)\n';
const C1_REF=UNION+PARSE(false,'words[1]')+'\nif (command.kind === "add") {\n  '+SAY('Add')+'\n} else {\n  console.log("List " + command.file)\n}\n';
const C1_WRONG='const words = process.argv.slice(2)\nconsole.log("Add " + words[2] + " to wagon " + words[1] + " at " + words[3])\n';

const BOOK_HEAD='import fs from "node:fs"\n\nexport type Booking = { wagon: number; performer: string; time: string }\n\nexport function load(file: string): Booking[] {\n  return JSON.parse(fs.readFileSync(file, "utf8"))\n}\n';
const C2=(guard,head,tail)=>IMPORT(head)+UNION+PARSE(false,'words[1]')+'\nif (command.kind === "add") {\n  '+SAY('Add')+'\n} else {\n'+(guard?'  try {\n    load(command.file).forEach(b => console.log(b.time + " Wagon " + b.wagon + ": " + b.performer))\n'+CATCH:'  load(command.file).forEach(b => console.log(b.time + " Wagon " + b.wagon + ": " + b.performer))\n')+'}\n'+(tail||'');
const C2_START=C2(false,'load');
const C2_REF=C2(true,'load');
const C2_WRONG=C2_REF.replace('    process.exitCode = 1\n','');

const C3_REF=C2(true,'Booking, load','\nconst draft: Booking = { performer: "Mumbles", time: "08:15" }\n');
const C3_WRONG=C2(true,'Booking, load','\nconst draft: Booking = { wagon: 4, performer: "Mumbles", time: "08:15" }\n');

const STUB='\nexport function findClashes(book: Booking[]): string[] {\n  return []\n}\n';
const CLASH='\nexport function findClashes(book: Booking[]): string[] {\n  return book.flatMap((a, i) =>\n    book\n      .slice(i + 1)\n      .filter(b => b.wagon === a.wagon && b.time === a.time)\n      .map(b => a.performer + " and " + b.performer + " both want wagon " + a.wagon + " at " + a.time)\n  )\n}\n';
const CLASH_ONE=CLASH.replace('a.performer + " and " + b.performer + " both want wagon "','a.performer + " is double booked on wagon "');
const SAVE='\nexport function save(file: string, book: Booking[]): void {\n  fs.writeFileSync(file, JSON.stringify(book, null, 2) + "\\n")\n}\n';
const GROUP='\nexport function groupLines(book: Booking[]): string[] {\n  const wagons = book.map(b => b.wagon).filter((w, i, all) => all.indexOf(w) === i)\n  return wagons.map(w => "Wagon " + w + ": " + book.filter(b => b.wagon === w).map(b => b.performer).join(", "))\n}\n';
const GROUP_FIRST=GROUP.replace('book.filter(b => b.wagon === w).map(b => b.performer).join(", ")','book.find(b => b.wagon === w)?.performer');
const ADD_PRINT='  '+SAY('Add')+'\n';
const ADD_SAVE='  const book = load("timetable.json")\n  book.push({ wagon: command.wagon, performer: command.performer, time: command.time })\n  save("timetable.json", book)\n  '+SAY('Added')+'\n';
const CHECK_PRINT='      findClashes(book).forEach(line => console.log(line))\n';
const CHECK_EXIT='      const clashes = findClashes(book)\n      clashes.forEach(line => console.log(line))\n      if (clashes.length > 0) {\n        process.exitCode = 1\n      }\n';
const CHECK_EXIT_NOW='      const clashes = findClashes(book)\n      clashes.forEach(line => console.log(line))\n      if (clashes.length > 0) {\n        process.exit(1)\n      }\n';
const LIST_EACH='      '+EACH+'\n';
const LIST_GROUP='      groupLines(book).forEach(line => console.log(line))\n';
const CLI=(names,file,add,check,list)=>IMPORT(names)+UNION_CHECK+PARSE(true,file)+'\nif (command.kind === "add") {\n'+add+'} else {\n  try {\n    const book = load(command.file)\n    if (command.kind === "check") {\n'+check+'    } else {\n'+list+'    }\n'+CATCH+'}\n';
const DEFAULT='words[1] || "timetable.json"';
const C4_START=CLI('load, findClashes','words[1]',ADD_PRINT,CHECK_PRINT,LIST_EACH);
const C5_START=CLI('load, save, findClashes','words[1]',ADD_PRINT,CHECK_PRINT,LIST_EACH);
const C5_REF=CLI('load, save, findClashes',DEFAULT,ADD_SAVE,CHECK_PRINT,LIST_EACH);
const C5_WRONG=CLI('load, save, findClashes',DEFAULT,ADD_PRINT,CHECK_PRINT,LIST_EACH);
const C6_REF=CLI('load, save, findClashes',DEFAULT,ADD_SAVE,CHECK_EXIT,LIST_EACH);
const C6_WRONG=CLI('load, save, findClashes',DEFAULT,ADD_SAVE,CHECK_EXIT_NOW,LIST_EACH);
const C8_REF=CLI('load, save, findClashes, groupLines',DEFAULT,ADD_SAVE,CHECK_EXIT,LIST_GROUP);
const BOOK=(...parts)=>BOOK_HEAD+parts.join('');
const TEST_HEAD='import test from "node:test"\nimport assert from "node:assert/strict"\nimport { findClashes } from "./book"\n';
const CLASHED='  const book = [\n    { wagon: 4, performer: "Mumbles", time: "08:15" },\n    { wagon: 4, performer: "Pepper", time: "08:15" },\n  ]\n';
const CLEAN='  const book = [\n    { wagon: 4, performer: "Mumbles", time: "08:15" },\n    { wagon: 7, performer: "Pepper", time: "09:40" },\n  ]\n';
const TEST_CLASH='\ntest("a double booking is named", () => {\n'+CLASHED+'  assert.deepEqual(findClashes(book), ["Mumbles and Pepper both want wagon 4 at 08:15"])\n})\n';
const TEST_CLEAN='\ntest("a clean book has no clash", () => {\n'+CLEAN+'  assert.deepEqual(findClashes(book), [])\n})\n';
const cli=c=>c.files['cli.ts']||'';
const tests=c=>c.files['book.test.ts']||'';
const groups=c=>{const b=JSON.parse(c.files['tour-book.json']||'[]');const ws=b.map(x=>x.wagon).filter((w,i,a)=>a.indexOf(w)===i);return c.out.length===ws.length&&ws.every(w=>{const ls=c.out.filter(l=>new RegExp('^Wagon '+w+'\\b').test(l));return ls.length===1&&b.filter(x=>x.wagon===w).every(x=>ls[0].includes(x.performer))})};
TSQ.CH.push(
{name:'Final project: a typed CLI',tier:'node',badge:'Golden Timetable',mode:'project',terminal:true,
 story:'The last wagon is the engine wagon. Everything you learned goes into one tool: a command-line program called tour that reads the bookings, refuses a double booking and tells the engine what to do by its exit code. Build it, test it, and the Golden Timetable is yours.',
 intro:'A command-line tool is a program you run with words after its name, such as `node cli.ts list tour-book.json`. Here you build one called `tour` in small steps: read the command, survive a broken file, type the data, find a double booking, add and list bookings, set the exit code, test it and group the final list. The project files sit side by side, because the terminal looks for an import from the project folder.',
 learned:['process.argv','subcommand','command union','process.exitCode','console.error','try/catch around a file','typed model','array methods','writeFileSync','node --test on the CLI','exit code convention'],
 first:[[12,'Node.js'],[21,'Async fs and path']],
 missions:[
 {title:'Read the command',goal:'`cli.ts` only counts the words you type. Write `type Command` as a union of an `add` and a `list` command, a `parse` function that builds one from `process.argv.slice(2)`, and print the parsed command. Then run `node cli.ts add 4 Mumbles 08:15`.',
  open:'cli.ts',cmds:['node cli.ts add 4 Mumbles 08:15'],
  start:WITH({'cli.ts':C1_START}),
  code:{'cli.ts':C1_REF},
  wrong:{'cli.ts':C1_WRONG},
  anat:[['process.argv','name','the words the program was started with: node, the file, then yours'],['process.argv.slice(2)','fn','drops the first two and keeps what you typed'],['type Command = | { ... } | { ... }','type','a union: a command is one of these shapes'],['kind','name','the tag that tells the shapes apart'],['parse(words)','fn','turns the typed words into a Command']],
  how:['The whole code: <code>process.argv</code> holds the words you typed, <code>parse</code> turns them into one typed <code>Command</code>, and the <code>kind</code> tag tells the program which command it got.',
   '<code>process.argv</code> is a list of the words the program was started with: first <code>node</code>, then the file, then everything you typed after it. <code>slice(2)</code> keeps only your words. The first of them, such as <code>add</code> or <code>list</code>, is the <b>subcommand</b>: it picks what the program does.',
   'Write <code>type Command</code> as a union of two object types, each with a <code>kind</code> that is a literal, then a <code>parse</code> function that reads the subcommand and returns a <code>Command</code>. <code>Number("4")</code> turns the typed text into the number the type asks for.',
   'Print the command: check <code>command.kind</code>, and the checker lets you use <code>command.performer</code> only on the <code>add</code> side. Run <code>node cli.ts add 4 Mumbles 08:15</code>.'],
  explain:'Typed words are text, and a union with a <code>kind</code> tag gives each command its own shape. Once <code>parse</code> has done its job, the rest of the program works with a <code>Command</code> and the checker knows which fields each kind has.',
  hint:'Write `type Command = | { kind: "add"; wagon: number; performer: string; time: string } | { kind: "list"; file: string }`, a `parse(words)` that returns one, and log it. Run `node cli.ts add 4 Mumbles 08:15`.',
  check:c=>c.cmd==='node'&&c.args[0]==='cli.ts'&&c.args[1]==='add'&&c.exitCode===0&&c.out.some(l=>/Mumbles.*\b4\b.*08:15/.test(l))&&/type Command\s*=/.test(cli(c))&&/kind:/.test(cli(c))},
 {title:'Bad files give an error',goal:'`list broken.json` crashes with a raw error, and the tool says nothing useful. Wrap the load in `try` and `catch`, print `"Cannot read " + command.file` with `console.error`, and set `process.exitCode = 1`. Run `node cli.ts list broken.json`.',
  open:'cli.ts',expectError:true,cmds:['node cli.ts list broken.json'],
  start:WITH({'cli.ts':C2_START,'book.ts':BOOK()}),
  code:{'cli.ts':C2_REF},
  wrong:{'cli.ts':C2_WRONG},
  anat:[['try { ... } catch { ... }','kw','runs the first part and jumps to the second if it throws'],['console.error("...")','fn','prints a message on the error output'],['process.exitCode = 1','name','the number the program ends with'],['exit code','val','0 means it worked, any other number means it failed']],
  how:['The whole code: <code>try</code> catches the crash of a broken file, <code>console.error</code> says what went wrong, and <code>process.exitCode = 1</code> tells whoever ran the program that it failed.',
   'Chapter 17 showed the <b>exit code</b> of a run: 0 means it worked and any other number means it failed. A script or a build reads that number, not your message. <code>process.exitCode = 1</code> sets it, and the program still finishes its work first.',
   'Wrap the <code>load</code> line in <code>try</code> as in chapter 16 of Script Quest. In <code>catch</code>, write <code>console.error("Cannot read " + command.file)</code> and then <code>process.exitCode = 1</code>. Run <code>node cli.ts list broken.json</code>.',
   '<code>console.error</code> prints on the error output, which the terminal shows with the rest. Without the <code>try</code>, the run ends with a raw <code>SyntaxError</code> block and no message of yours.'],
  explain:'A tool that crashes on a bad file tells its user nothing. Catching the error lets the program say what it could not read, and the exit code lets a script around it notice the failure without reading any text.',
  hint:'Wrap `load(command.file).forEach(...)` in `try`, and in `catch` write `console.error("Cannot read " + command.file)` and `process.exitCode = 1`.',
  check:c=>c.cmd==='node'&&c.args[0]==='cli.ts'&&c.args[1]==='list'&&c.args[2]==='broken.json'&&c.exitCode===1&&c.out.some(l=>/broken\.json/.test(l))&&/process\.exitCode\s*=/.test(cli(c))},
 {title:'Typed model',goal:'`Booking` says every booking has a wagon, a performer and a time. In `cli.ts` import `Booking` too and write `const draft: Booking = { performer: "Mumbles", time: "08:15" }` with no wagon. Run `tsc` and read the error.',
  open:'cli.ts',expectError:true,cmds:['tsc'],
  start:WITH({'cli.ts':C2_REF,'book.ts':BOOK()}),
  code:{'cli.ts':C3_REF},
  wrong:{'cli.ts':C3_WRONG},
  anat:[['{ Booking, load } from "./book"','kw','brings the type in with the function'],['const draft: Booking','type','a booking written by hand'],['Property \'wagon\' is missing','err','the object lacks a field the type asks for'],['TS2741','err','a required property is missing']],
  how:['The whole code: the <code>Booking</code> type lists the fields every booking must have, and the checker refuses an object that leaves one out.',
   '<code>Booking</code> lives in <code>book.ts</code> and <code>load</code> already returns a list of them. A type is a promise about the data, so an object typed as <code>Booking</code> with no <code>wagon</code> breaks it.',
   'Add <code>Booking</code> to the import and write <code>const draft: Booking = { performer: "Mumbles", time: "08:15" }</code> at the bottom of <code>cli.ts</code>. Run <code>tsc</code>.',
   '<code>tsc</code> reports <b>TS2741</b> and names the missing <code>wagon</code>. Add <code>wagon: 4</code> to the draft and run <code>tsc</code> again to see it clean.'],
  explain:'The model is only worth having if the checker holds the data to it. A booking with no wagon would book nothing, and the error says so while the program is still just text.',
  hint:'Import `Booking` next to `load`, add `const draft: Booking = { performer: "Mumbles", time: "08:15" }`, and type `tsc`.',
  check:c=>c.cmd==='tsc'&&c.args.length===0&&c.diags.some(d=>d.code===2741)},
 {title:'No double booking',goal:'`check` is wired up but `findClashes` always returns an empty list. Write it with array methods so that a wagon booked twice at the same time gives a line such as `Mumbles and Pepper both want wagon 4 at 08:15`. Run `node cli.ts check smudged.json`.',
  open:'book.ts',cmds:['node cli.ts check smudged.json'],
  start:WITH({'cli.ts':C4_START,'book.ts':BOOK(STUB)}),
  code:{'book.ts':BOOK(CLASH)},
  wrong:{'book.ts':BOOK(CLASH_ONE)},
  anat:[['book.flatMap((a, i) => ...)','fn','builds a list of lines from every booking and joins them into one list'],['book.slice(i + 1)','fn','the bookings after this one'],['.filter(b => ...)','fn','keeps those on the same wagon at the same time'],['.map(b => ...)','fn','turns each match into a line of text']],
  how:['The whole code: for each booking, <code>slice</code> takes the ones after it, <code>filter</code> keeps those with the same wagon and time, and <code>map</code> turns each into a line that names both performers.',
   'Compare a booking only with the ones after it, so each pair shows up once. <code>flatMap</code> is <code>map</code> that joins the small lists it builds into one list.',
   'In <code>book.ts</code>, replace <code>return []</code> with <code>book.flatMap((a, i) =&gt; book.slice(i + 1).filter(b =&gt; b.wagon === a.wagon &amp;&amp; b.time === a.time).map(b =&gt; ...))</code> and have <code>map</code> build the line from <code>a.performer</code> and <code>b.performer</code>. Run <code>node cli.ts check smudged.json</code>.',
   '<code>smudged.json</code> books Mumbles and Pepper on wagon 4 at 08:15, so the tool prints their line. It still ends with exit code 0 for now.'],
  explain:'A clash is two bookings that agree on wagon and time, and array methods say that without any counter to keep track of. The tool now finds exactly what the paper timetable got wrong.',
  hint:'Use `book.flatMap((a, i) => book.slice(i + 1).filter(b => b.wagon === a.wagon && b.time === a.time).map(b => a.performer + " and " + b.performer + " both want wagon " + a.wagon + " at " + a.time))`.',
  check:c=>c.cmd==='node'&&c.args[0]==='cli.ts'&&c.args[1]==='check'&&c.args[2]==='smudged.json'&&c.out.some(l=>/Mumbles/.test(l)&&/Pepper/.test(l))},
 {title:'The commands',goal:'`add` only prints, and `list` needs a file. Make `add` load `timetable.json`, push the new booking and `save` it, and make `list` with no file read `timetable.json`. Run `node cli.ts add 9 Juno 15:30`, then `node cli.ts list`.',
  open:'cli.ts',cmds:['node cli.ts add 9 Juno 15:30','node cli.ts list'],
  start:WITH({'cli.ts':C5_START,'book.ts':BOOK(SAVE,CLASH)}),
  code:{'cli.ts':C5_REF},
  wrong:{'cli.ts':C5_WRONG},
  anat:[['book.push({ ... })','fn','adds a booking at the end of the list'],['save("timetable.json", book)','fn','writes the whole list back with fs.writeFileSync'],['words[1] || "timetable.json"','val','the file you typed, or timetable.json if you typed none'],['node cli.ts list','fn','the list command with no file']],
  how:['The whole code: <code>add</code> loads the book, pushes the new booking and saves it, and <code>list</code> falls back to <code>timetable.json</code> when you name no file.',
   '<code>save</code> in <code>book.ts</code> writes the list back with <code>fs.writeFileSync</code>, the partner of <code>readFileSync</code>. The files live in the terminal, so what <code>add</code> writes is still there when <code>list</code> runs.',
   'In <code>add</code>, write <code>const book = load("timetable.json")</code>, <code>book.push({ wagon: command.wagon, performer: command.performer, time: command.time })</code> and <code>save("timetable.json", book)</code>. In <code>parse</code>, make the list file <code>words[1] || "timetable.json"</code>.',
   'Run <code>node cli.ts add 9 Juno 15:30</code> and then <code>node cli.ts list</code>. The list shows Juno on wagon 9, a booking that was not in <code>timetable.json</code> before.'],
  explain:'Two runs of the program share nothing but the files, so saving is how <code>add</code> talks to <code>list</code>. The fallback file keeps the common case short to type.',
  hint:'In `add`, `load("timetable.json")`, `push` the booking, `save("timetable.json", book)`. In `parse`, use `words[1] || "timetable.json"` for the list file.',
  check:c=>c.cmd==='node'&&c.args[0]==='cli.ts'&&c.args[1]==='list'&&c.args.length===2&&c.out.some(l=>/Juno/.test(l))},
 {title:'Exit codes',goal:'`check` prints the clash and still ends with 0. Set `process.exitCode = 1` when there is at least one clash, and leave `process.exit` alone. Run `node cli.ts check smudged.json`.',
  open:'cli.ts',expectError:true,cmds:['node cli.ts check smudged.json'],
  start:WITH({'cli.ts':C5_REF,'book.ts':BOOK(SAVE,CLASH)}),
  code:{'cli.ts':C6_REF},
  wrong:{'cli.ts':C6_WRONG},
  anat:[['const clashes = findClashes(book)','name','the lines, kept so they can be counted'],['clashes.length > 0','val','true when there is at least one clash'],['process.exitCode = 1','name','a clash ends the run with 1'],['0','val','a clean book ends the run with 0']],
  how:['The whole code: success is 0 and a clash is 1, so <code>check</code> sets <code>process.exitCode</code> to 1 when it found a clash and leaves it alone otherwise.',
   'Mission 2 used the exit code for a broken file. The same rule works here: a script or a build around <code>tour</code> reads 0 as "all good" and 1 as "stop, there is a clash".',
   'Keep the lines in a <code>const clashes</code>, print them, and write <code>if (clashes.length &gt; 0) { process.exitCode = 1 }</code>. Do not call <code>process.exit</code>: it stops the program at once, and <code>process.exitCode</code> lets it finish its output first. Run <code>node cli.ts check smudged.json</code>.',
   'The clash line prints and the run ends with exit code 1. On <code>timetable.json</code> the book is clean and the code stays 0.'],
  explain:'A tool is only useful to other programs if its exit code tells the truth. Setting it at the end of the check lets the output finish and still reports the clash.',
  hint:'Keep `findClashes(book)` in `const clashes`, print each line, and add `if (clashes.length > 0) { process.exitCode = 1 }`.',
  check:c=>c.cmd==='node'&&c.args[0]==='cli.ts'&&c.args[1]==='check'&&c.args[2]==='smudged.json'&&c.exitCode===1&&/process\.exitCode/.test(cli(c))&&!/process\.exit\(/.test(cli(c))},
 {title:'Test it',goal:'`book.test.ts` imports `test`, `assert` and `findClashes` but tests nothing. Write two tests: one where a double booking is named, one where a clean book gives an empty list. Run `node --test`.',
  open:'book.test.ts',cmds:['node --test'],
  start:WITH({'cli.ts':C6_REF,'book.ts':BOOK(SAVE,CLASH),'book.test.ts':TEST_HEAD}),
  code:{'book.test.ts':TEST_HEAD+TEST_CLASH+TEST_CLEAN},
  wrong:{'book.test.ts':TEST_HEAD+TEST_CLASH},
  anat:[['test("...", () => { ... })','fn','one named check'],['findClashes(book)','fn','the function under test'],['assert.deepEqual(..., [...])','fn','compares the whole list'],['assert.deepEqual(..., [])','fn','a clean book gives an empty list']],
  how:['The whole code: one test feeds <code>findClashes</code> a double booking and expects its line, another feeds it a clean book and expects an empty list, and <code>node --test</code> runs both.',
   'Test the function in <code>book.ts</code>, not the program: <code>findClashes</code> takes a list and gives lines back, so a test needs no files. The test file sits next to the code, because the terminal finds an import from the project folder.',
   'Write <code>test("a double booking is named", ...)</code> with two bookings on wagon 4 at 08:15 and <code>assert.deepEqual</code> against the expected line. Then write <code>test("a clean book has no clash", ...)</code> and expect <code>[]</code>. Run <code>node --test</code>.',
   'The summary says <b>pass 2</b> and <b>fail 0</b>. Test both sides: a check that only ever expects a clash would also pass if <code>findClashes</code> invented one.'],
  explain:'The clean-book test guards the opposite mistake: a checker that cries clash on everything would pass the first test. Two tests together pin the behaviour from both sides.',
  hint:'Write a `test` with two bookings on wagon 4 at 08:15 and a `test` with two different wagons, each with `assert.deepEqual(findClashes(book), ...)`. Run `node --test`.',
  check:c=>c.cmd==='node'&&c.args[0]==='--test'&&c.tests.pass>=2&&c.tests.fail===0&&c.exitCode===0&&/findClashes\(\w+\),\s*\[\s*["'`]/.test(tests(c))&&/findClashes\(\w+\),\s*\[\s*\]/.test(tests(c))},
 {title:'Golden Timetable',goal:'`list tour-book.json` prints one line per booking, so a wagon with two bookings shows up twice. Add `groupLines` to `book.ts`, one line per wagon such as `Wagon 4: Mumbles, Bellamy`, and make `list` print it. Run `node cli.ts list tour-book.json`.',
  open:'book.ts',cmds:['node cli.ts list tour-book.json'],
  start:WITH({'cli.ts':C6_REF,'book.ts':BOOK(SAVE,CLASH),'book.test.ts':TEST_HEAD+TEST_CLASH+TEST_CLEAN}),
  code:{'cli.ts':C8_REF,'book.ts':BOOK(SAVE,CLASH,GROUP)},
  wrong:{'cli.ts':C8_REF,'book.ts':BOOK(SAVE,CLASH,GROUP_FIRST)},
  anat:[['book.map(b => b.wagon)','fn','the wagon of each booking'],['all.indexOf(w) === i','fn','keeps a wagon only at its first place'],['wagons.map(w => ...)','fn','one line per wagon'],['book.filter(b => b.wagon === w)','fn','the bookings of that wagon'],['.join(", ")','fn','glues the performers into one text']],
  how:['The whole code: <code>groupLines</code> finds each wagon once, then builds one line per wagon from the performers booked on it.',
   '<code>filter</code> with <code>indexOf</code> keeps only the first time each wagon number shows up. For each of those wagons, <code>filter</code> finds its bookings, <code>map</code> takes the performers and <code>join(", ")</code> glues them into one text.',
   'Write <code>groupLines(book: Booking[]): string[]</code> in <code>book.ts</code>, import it in <code>cli.ts</code>, and print <code>groupLines(book).forEach(line =&gt; console.log(line))</code> in the <code>list</code> branch. Run <code>node cli.ts list tour-book.json</code>.',
   'Three lines come out, one per wagon: <code>Wagon 4: Mumbles, Bellamy</code> is one of them. Run <code>node --test</code> and <code>tsc</code> as well, then the whole tool is checked from both sides.'],
  explain:'Every part of the quest met here: a typed command, files that can fail, a model the checker holds to, array methods, an exit code that tells the truth and a test on each side. The timetable can no longer double-book a wagon, and the Golden Timetable is finished at the engine wagon as a typed command-line tool. Bellamy sends the next telegram himself.',
  hint:'Write `groupLines` with `book.map(b => b.wagon).filter((w, i, all) => all.indexOf(w) === i)` for the wagons, then `map` each to `"Wagon " + w + ": "` and the joined performers.',
  check:c=>c.cmd==='node'&&c.args[0]==='cli.ts'&&c.args[1]==='list'&&c.args[2]==='tour-book.json'&&c.exitCode===0&&groups(c)},
 ]}
);
})();
