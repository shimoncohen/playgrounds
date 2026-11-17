(()=>{
'use strict';
const SCQ=window.SCQ=window.SCQ||{};
const CH=SCQ.CH;
// ---------- Quick-fire bank: predict the output ----------
const FIRE=[
{ch:0,c:'console.log("2" + 2)',o:['"22"','4','22','"2 2"'],a:2,w:'A string plus anything glues. console.log shows strings without quotes, so you see 22.'},
{ch:0,c:'console.log(2 + 2 + "2")',o:['42','222','6','"42"'],a:0,w:'Left to right: 2 + 2 is 4 first, then 4 + "2" glues to "42".'},
{ch:2,c:'console.log("5" - 2)',o:['3','"52"','NaN','"3"'],a:0,w:'Minus has no string meaning, so JavaScript converts "5" to a number. Only + glues.'},
{ch:0,c:'console.log(typeof "42")',o:['string','number','"42"','text'],a:0,w:'Quotes make it a string, whatever is inside.'},
{ch:7,c:'console.log(typeof [])',o:['object','array','list','undefined'],a:0,w:'Arrays are a special kind of object, so typeof says object.'},
{ch:7,c:'console.log(typeof null)',o:['object','null','undefined','boolean'],a:0,w:'A famous old bug in JavaScript that can never be fixed, because fixing it would break existing websites.'},
{ch:2,c:'console.log(1 === "1")',o:['false','true','undefined','TypeError'],a:0,w:'=== checks type as well as value. Number vs string: false.'},
{ch:2,c:'console.log(1 == "1")',o:['true','false','"1"','TypeError'],a:0,w:'== converts types first, then compares. That is why we prefer ===.'},
{ch:2,c:'console.log(Boolean("false"))',o:['true','false','undefined','"false"'],a:0,w:'Any non-empty string is truthy, even the word "false".'},
{ch:2,c:'console.log(Boolean(0))',o:['false','true','0','NaN'],a:0,w:'0 is one of the six falsy values.'},
{ch:5,c:'const a = [1, 2, 3]\nconsole.log(a[3])',o:['undefined','3','null','Error'],a:0,w:'Slots are 0, 1 and 2. Reading past the end gives undefined, not an error.'},
{ch:5,c:'const a = [1, 2, 3]\nconsole.log(a.length)',o:['3','2','4','[1, 2, 3]'],a:0,w:'length counts items. The last index is length - 1.'},
{ch:1,c:'let x = 5\nx += 3\nconsole.log(x)',o:['8','53','5','3'],a:0,w:'x += 3 means x = x + 3.'},
{ch:1,c:'let n = 10\nn++\nn++\nconsole.log(n)',o:['12','11','10','"10++"'],a:0,w:'Each ++ adds one.'},
{ch:0,c:'console.log(10 % 3)',o:['1','3','3.33','0'],a:0,w:'% is remainder: 10 divided by 3 is 3, remainder 1.'},
{ch:8,c:'console.log([1, 2, 3].map(n => n * 2))',o:['[2, 4, 6]','[1, 2, 3]','12','[2]'],a:0,w:'map makes a new array with each item transformed.'},
{ch:8,c:'console.log([5, 12, 8].filter(n => n > 6))',o:['[12, 8]','[12]','[5]','true'],a:0,w:'filter keeps every item where the function returns true.'},
{ch:8,c:'console.log([5, 12, 8].find(n => n > 6))',o:['12','[12, 8]','8','true'],a:0,w:'find returns only the first match, not an array.'},
{ch:8,c:'console.log([1, 2, 3].reduce((t, n) => t + n, 0))',o:['6','[1, 2, 3]','123','0'],a:0,w:'reduce carries a running total: 0+1, then +2, then +3.'},
{ch:8,c:'console.log([10, 9, 100].sort())',o:['[10, 100, 9]','[9, 10, 100]','[100, 10, 9]','Error'],a:0,w:'Without a compare function, sort compares as text. "1" comes before "9". Use sort((a, b) => a - b).'},
{ch:7,c:'const a = { hp: 10 }\nconst b = a\nb.hp = 1\nconsole.log(a.hp)',o:['1','10','undefined','Error'],a:0,w:'a and b point to the same object. Change it through one, see it through the other.'},
{ch:7,c:'const a = { hp: 10 }\nconst b = { ...a }\nb.hp = 1\nconsole.log(a.hp)',o:['10','1','undefined','Error'],a:0,w:'Spread makes a new object, so a is untouched.'},
{ch:7,c:'const p = { name: "Ada" }\nconsole.log(p.age)',o:['undefined','null','Error','0'],a:0,w:'Missing properties are undefined. No error.'},
{ch:1,c:'const name = "Bo"\nconsole.log(`Hi ${name}!`)',o:['Hi Bo!','Hi ${name}!','Hi name!','"Hi Bo!"'],a:0,w:'Template strings fill in ${ } with the value.'},
{ch:1,c:'console.log("Hi ${name}")',o:['Hi ${name}','Hi Bo','Error','Hi undefined'],a:0,w:'Normal quotes do not fill in ${ }. Only backticks do.'},
{ch:6,c:'function f() {\n  console.log("hi")\n}\nconsole.log(f())',o:['hi, then undefined','hi','undefined','f'],a:0,w:'f prints hi, but has no return, so its result is undefined.'},
{ch:6,c:'const sq = n => n * n\nconsole.log(sq(4))',o:['16','8','n * n','undefined'],a:0,w:'One-line arrow functions return their expression automatically.'},
{ch:6,c:'function hi(name = "you") {\n  return "hi " + name\n}\nconsole.log(hi())',o:['hi you','hi undefined','hi ','Error'],a:0,w:'Default parameter kicks in when nothing is passed.'},
{ch:9,c:'console.log("A")\nsetTimeout(() => console.log("B"), 0)\nconsole.log("C")',o:['A C B','A B C','B A C','C A B'],a:0,w:'Timers always wait until the current code finishes, even at 0 ms.'},
{ch:4,c:'for (let i = 0; i < 3; i++) {\n  console.log(i)\n}',o:['0 1 2','1 2 3','0 1 2 3','3'],a:0,w:'Starts at 0 and stops before reaching 3.'},
{ch:5,c:'let s = ""\nfor (const c of ["a", "b", "c"]) {\n  s = c + s\n}\nconsole.log(s)',o:['cba','abc','a','cbacba'],a:0,w:'Each item goes in front of the ones before it, so the order flips.'},
{ch:2,c:'console.log(null ?? "x")',o:['x','null','undefined','false'],a:0,w:'?? falls back when the left side is null or undefined.'},
{ch:2,c:'console.log(0 ?? "x")',o:['0','x','false','null'],a:0,w:'0 is not null or undefined, so ?? keeps it. (|| would give "x".)'},
{ch:2,c:'console.log(0 || "x")',o:['x','0','false','true'],a:0,w:'|| falls back on any falsy value, including 0.'},
{ch:3,c:'const hp = 30\nconsole.log(hp > 50 ? "strong" : "weak")',o:['weak','strong','true','30'],a:0,w:'30 > 50 is false, so the value after : is used.'},
{ch:2,c:'console.log(Number("12px"))',o:['NaN','12','"12"','Error'],a:0,w:'Number() needs the whole string to be a number. Otherwise you get NaN, short for "Not a Number".'},
{ch:7,c:'console.log([..."hey"])',o:['["h", "e", "y"]','["hey"]','hey','3'],a:0,w:'Spread works on text too: it splits a string into its letters.'},
{ch:7,c:'const { a, b } = { a: 1, b: 2, c: 3 }\nconsole.log(a + b)',o:['3','6','12','undefined'],a:0,w:'Destructuring pulls a and b into variables.'},
{ch:5,c:'console.log([1, 2] + [3])',o:['1,23','[1, 2, 3]','6','Error'],a:0,w:'+ turns both arrays into strings ("1,2" and "3") and glues them. Weird, but now you know.'},
{ch:2,c:'console.log(0.1 + 0.2 === 0.3)',o:['false','true','NaN','0.3'],a:0,w:'Computers store decimals in binary, so 0.1 + 0.2 is 0.30000000000000004. Same in almost every language.'},
{ch:5,c:'const a = [3, 1, 2]\na.push(5)\nconsole.log(a.length)',o:['4','3','5','[3, 1, 2, 5]'],a:0,w:'push adds one item. Four now.'},
{ch:10,c:'let x: number = 5\nx = "five"  // TypeScript',o:['Type error before running','"five"','5','NaN'],a:0,w:'TypeScript refuses to compile: string is not assignable to number.'},
{ch:11,c:'// node greet.js Ada\nconsole.log(process.argv[2])',o:['Ada','greet.js','node','undefined'],a:0,w:'argv[0] is node, [1] is the file, [2] is the first word you typed after it.'},
];

/* The quick-fire questions a learner may see: only those whose chapter has every mission done in `done` (the saved S.done, keyed '<chapter>-<mission>'). */
const qfOpen=done=>FIRE.filter(q=>CH[q.ch].missions.every((_,j)=>done&&done[q.ch+'-'+j]));
SCQ.FIRE=FIRE;
SCQ.qfOpen=qfOpen;
})();
