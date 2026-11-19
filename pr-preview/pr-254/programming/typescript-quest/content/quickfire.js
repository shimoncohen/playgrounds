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
{ch:1,c:'function size(load: string | number) {\n  return load.length\n}',o:['TS2322','TS2339','No error','TS18046'],a:1,w:'A number has no length, and load could be a number, so the checker refuses what only some of the union has.'},
{ch:1,c:'function size(load: string | number) {\n  if (typeof load === "string") {\n    return load.length\n  }\n  return load\n}',o:['TS2339','TS2322','TS18046','No error'],a:3,w:'typeof narrows load to string inside the if, so length is allowed.'},
{ch:1,c:'function stampLength(note: string | undefined) {\n  return note.length\n}',o:['TS18048','TS2339','No error','TS2322'],a:0,w:'note might be undefined, and the checker says so: TS18048.'},
{ch:1,c:'function stampLength(note: string | undefined) {\n  if (note) {\n    return note.length\n  }\n  return 0\n}',o:['TS18048','No error','TS2339','TS2322'],a:1,w:'The if removes undefined from the union, so note is a string and length is fine.'},
{ch:1,c:'function count(vehicle: { wheels: number } | { sails: number }) {\n  return vehicle.wheels\n}',o:['TS2322','TS18048','No error','TS2339'],a:3,w:'Only one of the two shapes has wheels, so the property is refused until an in check narrows it.'},
{ch:1,c:'function greet(guest: { kind: "adult" } | { kind: "child" } | { kind: "pet" }) {\n  switch (guest.kind) {\n    case "adult":\n      return "Welcome aboard"\n    case "child":\n      return "Mind the gap"\n    default:\n      const missed: never = guest\n      return missed\n  }\n}',o:['No error','TS2339','TS18048','TS2322'],a:3,w:'The pet kind is left over in the default branch, and a pet does not fit never.'},
{ch:2,c:'interface Stamp {\n  readonly town: string\n}\nconst mark: Stamp = { town: "Ashford" }\nmark.town = "Bath"',o:['TS2540','TS2322','No error','TS2353'],a:0,w:'readonly means the property is set once and never assigned again.'},
{ch:2,c:'interface Parcel {\n  weight: number\n}\nconst box: Parcel = { weight: 3, colour: "red" }',o:['TS2322','TS2540','TS2741','TS2353'],a:3,w:'An object written in place may only have properties the type lists, and colour is not on Parcel.'},
{ch:2,c:'interface Ticket {\n  seat: string\n}\ninterface Passenger extends Ticket {\n  name: string\n}\nconst rider: Passenger = { name: "Mumbles" }',o:['TS2353','TS2741','No error','TS2540'],a:1,w:'Passenger also needs the seat it got from Ticket, and the object has no seat.'},
{ch:2,c:'interface Seat {\n  row: number\n}\ninterface Berth {\n  row: number\n}\nconst a: Seat = { row: 3 }\nconst b: Berth = a',o:['TS2322','TS2741','TS2353','No error'],a:3,w:'The names differ but the shapes match, and TypeScript compares shapes.'},
{ch:3,c:'function board(name: string, seat?: string) {\n  console.log(name, seat)\n}\nboard("Mumbles", "12A", 2)',o:['TS2322','TS2345','TS2554','No error'],a:2,w:'The function lists two parameters, and the call passes three. Too many arguments: TS2554.'},
{ch:3,c:'function reserve(...seats: number[]) {\n  console.log(seats.length)\n}\nreserve(12, "13")',o:['TS2345','TS2554','TS2322','No error'],a:0,w:'Every extra argument must be a number, and "13" is text. A wrong argument is TS2345.'},
{ch:3,c:'function seatsLeft(total: number, taken: number): number {\n  return "none"\n}',o:['TS2345','No error','TS2554','TS2322'],a:3,w:'The return type promises a number, and the text does not fit it: TS2322.'},
{ch:3,c:'function board(name: string, seat?: string) {\n  console.log(name, seat)\n}\nboard("Mumbles")',o:['TS2554','TS2322','No error','TS2345'],a:2,w:'A ? parameter may be left out of a call, so one argument is enough. No error.'},
{ch:4,c:'const stops: string[] = ["Ashford", "Bath"]\nstops.push(7)',o:['TS2322','TS2339','TS2345','No error'],a:2,w:'push hands a number to a list of texts, and the argument does not fit: TS2345.'},
{ch:4,c:'const crew: readonly string[] = ["Mumbles", "Pip"]\ncrew.push("Bellamy")',o:['TS2345','TS2339','TS2540','No error'],a:1,w:'A readonly list has no push, so the property does not exist: TS2339.'},
{ch:4,c:'let seat: [number, string] = [4, "Mumbles"]\nconsole.log(seat[2])',o:['TS2493','TS2339','No error','TS2322'],a:0,w:'The tuple has two slots, so there is no element at place 2: TS2493.'},
{ch:4,c:'let seat: [number, string, string?] = [4, "Mumbles"]',o:['TS2322','TS2493','TS2741','No error'],a:3,w:'The third slot is optional, so a line with two values is allowed. No error.'},
];
const qfOpen=(done,tier)=>FIRE.filter(q=>CH[q.ch].missions.every((_,j)=>done&&done[q.ch+'.'+j])&&(!tier||CH[q.ch].tier===tier));
TSQ.FIRE=FIRE;
TSQ.qfOpen=qfOpen;
})();
