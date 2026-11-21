(()=>{
'use strict';
const SCQ=window.SCQ=window.SCQ||{};
// shortcut: a `//` right after a non-colon character starts a comment even inside a string; upgrade if a mission needs such a string.
const strip=s=>String(s||'').replace(/\/\*[^]*?\*\//g,'').replace(/(^|[^:])\/\/[^\n]*/g,'$1');
const ran=(c,file)=>c.cmd==='node'&&!!c.ran&&c.ran.file===file&&c.ok;
const shown=c=>(c.out||[]).join('\n');
const DAY1='ledger/day1.txt';
const SEED={[DAY1]:'Opening night: 120 tickets sold\n'};
SCQ.CH.push(
{name:'Async fs and path',tier:'intermediate',group:'Node in depth',badge:'Ledger Key',story:'Past the gate stands the ledger wagon, where every night\'s takings are filed in folders. Shelve a page, add to it and clear it out without making the queue wait, and win the ledger key.',mode:'sh',
 intro:'The ledger wagon keeps each day\'s takings in its own folder, and nobody waits while a clerk fetches a page. Node works the same way: you ask the file system for a job, hand it a function to call when it is done, and carry on. This chapter builds paths with `path`, makes a folder, then saves, adds to, lists and removes files in a `ledger` folder, first with callbacks and then with `await`. Some missions start with a file the chapter sets up for you, and Reset project puts it back.',
 learned:['path.join, basename and extname','mkdir and mkdir -p','writeFile with a callback','appendFile, then readFile inside it','fs.promises with await','readdir and stat','unlink and the ENOENT code'],
 missions:[
 {title:'Build a path',goal:'Write `paths.js` so it prints `ledger/day1.txt`, then `day1.txt`, then `.txt`. Build the path with `path.join`, then take it apart with `path.basename` and `path.extname`.',code:'const path = require("path")\nconst file = path.join("ledger", "day1.txt")\nconsole.log(file)\nconsole.log(path.basename(file))\nconsole.log(path.extname(file))',
  how:['The whole file: <code>path.join</code> glues folder and file names into one path, and <code>path.basename</code> and <code>path.extname</code> take a path apart again.',
   '<code>const path = require("path")</code> brings in Node\'s <code>path</code> tools. They work on text only, so they never open a file.',
   '<code>path.join("ledger", "day1.txt")</code> gives <code>ledger/day1.txt</code>. Keep it in a box called <code>file</code> and print it.',
   '<code>path.basename(file)</code> is the last piece, <code>day1.txt</code>, and <code>path.extname(file)</code> is the ending with its dot, <code>.txt</code>. Print each on its own line.',
   'Run it with ▶ Run. You see three lines.'],
  anat:[['path.join(…)','fn','glues the pieces'],['path.basename(…)','fn','the last piece'],['path.extname(…)','fn','the ending, with its dot']],
  explain:'<code>path</code> only handles text: it never touches a file. <code>join</code> puts the slashes in for you, so you never glue a path with <code>+ "/" +</code> and end up with a double slash or none. Real Node uses the slash your computer uses, and this playground always shows a forward slash. The checker reads your file, so all three calls must be in the code, not only in what it prints.',
  hint:'Print <code>file</code>, then <code>path.basename(file)</code>, then <code>path.extname(file)</code>, each with its own <code>console.log</code>.',
  editFile:'paths.js',
  check:c=>{
    if(!ran(c,'paths.js'))return false;
    const s=strip(c.ran.code);
    return shown(c)==='ledger/day1.txt\nday1.txt\n.txt'&&/\bjoin\s*\(/.test(s)&&/\bbasename\s*\(/.test(s)&&/\bextname\s*\(/.test(s);
  }},
 {title:'Make a folder',goal:'Make a folder called `ledger` in the terminal with `mkdir ledger`.',code:'mkdir ledger',
  how:['The whole line: <code>mkdir ledger</code> makes an empty folder called <code>ledger</code>. <code>mkdir</code> is short for "make directory", and a directory is another word for a folder.',
   'Type <code>mkdir ledger</code> at the prompt and press Enter. No reply means it worked.',
   'Look at the Project panel: <code>ledger/</code> is there as a folder with nothing in it. <code>ls</code> lists it too.'],
  anat:[['mkdir','cmd'],['ledger','arg']],
  explain:'A folder stays even when it is empty. Here an empty folder is kept as a marker, so it shows in the panel and in <code>ls</code>. If <code>ledger</code> already exists, because you made it before or a file already sits inside it, plain <code>mkdir ledger</code> prints <code>File exists</code> and does not complete this mission. The <code>-p</code> option means "make it, and do not complain if it is already there": <code>mkdir -p ledger</code> works on a new or an old folder, and it also makes any missing folders on the way.',
  check:c=>c.cmd==='mkdir'&&c.ok&&(c.args||[]).some(a=>a.replace(/\/+$/,'')==='ledger')&&'ledger/' in (c.files||{})},
 {title:'Shelve a page',goal:'Write `shelve.js` so it saves a line of takings in `ledger/day1.txt` with `fs.writeFile`, and prints `saved` from the function that runs when the save is done.',code:'const fs = require("fs")\nfs.writeFile("ledger/day1.txt", "Day 1: 120 tickets sold\\n", (err) => {\n  console.log("saved")\n})',
  seed:{'ledger/':''},
  how:['The whole file: <code>fs.writeFile</code> starts the save and your program goes on at once. When the save is done, Node calls your function, and that function prints <code>saved</code>.',
   '<code>const fs = require("fs")</code> brings in the file tools. The setup line made the <code>ledger</code> folder for you if you had not.',
   '<code>fs.writeFile("ledger/day1.txt", "Day 1: 120 tickets sold\\n", (err) => { … })</code> takes the path, the text and then the function. End the text with <code>\\n</code>, a new line, so the next line starts fresh.',
   'Inside the function write <code>console.log("saved")</code>. Run it: <code>saved</code> appears once the file is written, and <code>ledger/day1.txt</code> shows in the Project panel.'],
  anat:[['fs.writeFile(…)','fn','starts the save'],['"ledger/day1.txt"','val','where it goes'],['(err) => { … }','fn','runs when it is saved'],['console.log("saved")','fn']],
  explain:'With the callback kind, the call comes back at once and your function waits for the answer. Its first argument, <code>err</code>, is <code>null</code> when all went well and an error when not, for example when the folder is missing. The checker reads your file: <code>writeFile(</code> is in it, <code>saved</code> is written after it, and every line of <code>ledger/day1.txt</code> is text from your code. Run it twice and the second save replaces the first, because <code>writeFile</code> overwrites.',
  hint:'Put <code>console.log("saved")</code> inside the arrow function that is the last argument of <code>fs.writeFile</code>.',
  editFile:'shelve.js',
  check:c=>{
    if(!ran(c,'shelve.js'))return false;
    const s=strip(c.ran.code),f=(c.files||{})[DAY1];
    const w=s.search(/\bwriteFile\s*\(/),sv=s.search(/["'`]saved["'`]/);
    if(typeof f!=='string'||w<0||sv<w||!/ledger/.test(s)||!/day1\.txt/.test(s))return false;
    const lines=f.split('\n').filter(l=>l.trim());
    return lines.length>0&&lines.every(l=>s.includes(l.trim()))&&(c.out||[]).some(l=>l.trim()==='saved');
  }},
 {title:'Add a line',goal:'Write `addup.js` so it adds a line to `ledger/day1.txt` with `fs.appendFile`, then reads the whole file with `fs.readFile` inside that callback and prints it.',code:'const fs = require("fs")\nfs.appendFile("ledger/day1.txt", "Day 2: 95 tickets sold\\n", (err) => {\n  fs.readFile("ledger/day1.txt", "utf8", (err, text) => {\n    console.log(text)\n  })\n})',
  seed:SEED,
  how:['The whole file: <code>appendFile</code> adds to the end of a file, and only when it is done is the new line really there, so the read goes inside its function: a callback inside a callback.',
   '<code>fs.appendFile("ledger/day1.txt", "Day 2: 95 tickets sold\\n", (err) => { … })</code> adds one line. The file keeps what it held. The setup line gave it a first line if the file was missing.',
   'Inside that function, <code>fs.readFile("ledger/day1.txt", "utf8", (err, text) => { … })</code> reads the file, with your new line at the end.',
   'Inside the second function print <code>text</code> with <code>console.log(text)</code>. Run it: the earlier line comes first and yours comes last.'],
  anat:[['fs.appendFile(…)','fn','adds to the end'],['fs.readFile(…)','fn','reads it back'],['(err, text) => { … }','fn','gets the whole text'],['console.log(text)','fn']],
  explain:'<code>appendFile</code> keeps the old text and puts yours after it, and it creates the file if it is missing. The read starts inside the first function because only then is your line in the file: in real Node, a read written next to the append can run before it. The checker wants <code>appendFile(</code> before <code>readFile(</code> in your file, and the printed text to be the file as it is now, ending with your line, with at least one line before it. If your earlier text had no new line at its end, start your added text with <code>\\n</code>. It does not matter what the earlier line says.',
  hint:'Nest the two calls: <code>fs.readFile</code> goes inside the function you give to <code>fs.appendFile</code>, and <code>console.log(text)</code> goes inside the read\'s function.',
  editFile:'addup.js',
  check:c=>{
    if(!ran(c,'addup.js'))return false;
    const s=strip(c.ran.code),f=(c.files||{})[DAY1];
    if(typeof f!=='string'||!/\bappendFile\s*\([^]*\breadFile\s*\(/.test(s))return false;
    const lines=f.split('\n').filter(l=>l.trim());
    return lines.length>=2&&s.includes(lines[lines.length-1].trim())&&shown(c).trimEnd()===f.trimEnd();
  }},
 {title:'List and measure',goal:'Write `listing.js` so it lists the `ledger` folder with `fs.promises.readdir` and, for each name, prints the name and its size from `fs.promises.stat`, for example `day1.txt 32`.',code:'const fs = require("fs")\nconst path = require("path")\nasync function main() {\n  const names = await fs.promises.readdir("ledger")\n  for (const name of names) {\n    const info = await fs.promises.stat(path.join("ledger", name))\n    console.log(name, info.size)\n  }\n}\nmain()',
  seed:SEED,
  how:['The whole file: an <code>async function</code> lets you put <code>await</code> before a call that gives back a promise, and that line waits for the answer without freezing the program.',
   '<code>const names = await fs.promises.readdir("ledger")</code> gives the names inside the folder, as a list of text.',
   'Go through them with <code>for (const name of names)</code>. For each one, <code>const info = await fs.promises.stat(path.join("ledger", name))</code> asks about the file, and <code>info.size</code> is its size in bytes.',
   'Print <code>console.log(name, info.size)</code>, and call <code>main()</code> at the bottom. Run it: one line per file.'],
  anat:[['fs.promises.readdir(…)','fn','the names in a folder'],['await','kw','waits for the answer'],['fs.promises.stat(…)','fn','facts about a file'],['info.size','name','the size in bytes']],
  explain:'<code>readdir</code> returns the names in a folder. Real Node does not promise an order for them: many disks give them alphabetically, but not all, so sort the names yourself when the order matters. This playground hands them back sorted, and the checker looks at each file on its own, so the order of your lines does not matter. <code>stat</code> returns facts about a file, here its <code>size</code> in bytes, and the checker compares your number with the real size. Calls that end in <code>Sync</code> freeze the program while they wait, so they do not pass here.',
  hint:'Inside the loop print the name and the size together: <code>console.log(name, info.size)</code>.',
  editFile:'listing.js',
  check:c=>{
    if(!ran(c,'listing.js'))return false;
    const s=strip(c.ran.code);
    if(!/\breaddir\s*\(/.test(s)||!/\bstat\s*\(/.test(s)||/\w+Sync\s*\(/.test(s))return false;
    const files=c.files||{},kids=Object.keys(files).filter(k=>k.startsWith('ledger/')&&k.length>7&&!k.slice(7).includes('/'));
    const lines=shown(c).split('\n').map(l=>l.trim());
    return kids.length>0&&kids.every(k=>lines.includes(k.slice(7)+' '+new TextEncoder().encode(files[k]).length));
  }},
 {title:'Clear out',goal:'Write `clearout.js` so it deletes `ledger/day1.txt` with `fs.promises.unlink` and prints `removed`, then asks `fs.promises.stat` about the same file and prints the error code it fails with.',code:'const fs = require("fs")\nasync function main() {\n  await fs.promises.unlink("ledger/day1.txt")\n  console.log("removed")\n  try {\n    await fs.promises.stat("ledger/day1.txt")\n  } catch (err) {\n    console.log(err.code)\n  }\n}\nmain()',
  seed:SEED,
  how:['The whole file: <code>unlink</code> deletes a file, and asking about it afterwards fails. With <code>await</code> inside <code>try</code>, <code>catch</code> catches that failure like a thrown error.',
   '<code>await fs.promises.unlink("ledger/day1.txt")</code> deletes the file. Then print <code>removed</code>.',
   'Inside <code>try { … }</code>, <code>await fs.promises.stat("ledger/day1.txt")</code> asks about the file that is no longer there, so it fails.',
   'In <code>catch (err) { … }</code> print <code>err.code</code>, and call <code>main()</code> at the bottom. Run it: <code>removed</code>, then <code>ENOENT</code>.'],
  anat:[['fs.promises.unlink(…)','fn','deletes the file'],['try { … }','kw','where the failure happens'],['catch (err)','kw','catches it'],['err.code','name','a short name for the trouble']],
  explain:'<code>unlink</code> removes the file and leaves the folder: <code>ledger</code> is still there, empty. A <code>stat</code> of a missing file fails with an error whose <code>code</code> is <code>ENOENT</code>, which stands for "no such entry" and is the code Node gives for a missing file or folder. The checker wants the file gone, <code>removed</code> printed before <code>ENOENT</code>, and <code>unlink(</code>, <code>stat(</code> and <code>.code</code> in your file. Come back to this mission later and the setup line puts the file back, so you can run it again.',
  hint:'Order: <code>await</code> the <code>unlink</code>, print <code>removed</code>, then <code>try</code> the <code>stat</code> and print <code>err.code</code> in <code>catch</code>.',
  editFile:'clearout.js',
  check:c=>{
    if(!ran(c,'clearout.js'))return false;
    const s=strip(c.ran.code);
    if(!/\bunlink\s*\(/.test(s)||!/\bstat\s*\(/.test(s)||!/\.code\b/.test(s)||DAY1 in (c.files||{}))return false;
    const o=(c.out||[]).map(l=>l.trim()).filter(Boolean),last=o.length-1;
    return last>=1&&o[last]==='ENOENT'&&o.filter(l=>l==='ENOENT').length===1&&o.slice(0,last).some(l=>/removed/i.test(l));
  }},
 ]},
);
})();
