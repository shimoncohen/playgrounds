(()=>{
'use strict';
const TSQ=window.TSQ;
const CH=TSQ.CH;
const FIRE=[
{ch:0,c:'let town = "Ashford"\ntown = 42',o:['TS2322','No error','TS2352','TS7006'],a:0,w:'The checker guessed string for town from its value, and a number does not fit a string.'},
{ch:0,c:'const stop = "Ashford"\nlet town = stop\ntown = "Barlow"',o:['TS2322','TS2352','No error','TS18046'],a:2,w:'let widens the exact text to string, so any other text fits. No error.'},
{ch:0,c:'let wagon: string\nwagon = 7',o:['TS2352','TS2322','TS7006','No error'],a:1,w:'You wrote string yourself, so the number is refused. Same code as a wrong guess: TS2322.'},
{ch:0,c:'let mumbles: any = "Squawk"\nmumbles.fly()',o:['TS18046','TS2322','TS7006','No error'],a:3,w:'any switches the checker off for that value. It compiles clean and only crashes when it runs.'},
{ch:0,c:'let mumbles: unknown = "Squawk"\nmumbles.length',o:['No error','TS7006','TS2352','TS18046'],a:3,w:'unknown makes you prove what a value is before you use it. TS18046 is the refusal.'},
{ch:0,c:'function repeat(word) {\n  return word\n}',o:['TS7006','No error','TS2322','TS18046'],a:0,w:'A parameter with no annotation has nothing to guess from, so the checker reports an implicit any: TS7006.'},
{ch:0,c:'const seats = 12 as string',o:['TS2322','TS7006','TS2352','No error'],a:2,w:'as is a promise, and the checker refuses one that cannot be true: a number can never be a string.'},
{ch:0,c:'const seats = 12 as number',o:['TS2352','TS2322','TS18046','No error'],a:3,w:'12 already is a number, so the promise is true and nothing is reported.'},
{ch:0,c:'let slot: "Tuesday" | "Wednesday" = "Tuesday"\nslot = "Sunday"',o:['No error','TS2322','TS7006','TS2352'],a:1,w:'Only the two listed texts fit, so "Sunday" is refused.'},
{ch:0,c:'let slot = "Tuesday"\nslot = "Sunday"',o:['TS2322','TS7006','No error','TS18046'],a:2,w:'Without an annotation slot is guessed as string, so any text fits. That is the smudge.'},
];
const qfOpen=(done,tier)=>FIRE.filter(q=>CH[q.ch].missions.every((_,j)=>done&&done[q.ch+'.'+j])&&(!tier||CH[q.ch].tier===tier));
TSQ.FIRE=FIRE;
TSQ.qfOpen=qfOpen;
})();
