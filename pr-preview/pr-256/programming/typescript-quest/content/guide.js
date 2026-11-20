(()=>{
'use strict';
const TSQ=window.TSQ=window.TSQ||{};
const BLOCKS=[
['Let the checker guess','A <code>const</code> keeps the exact value as its type, called a literal type. A <code>let</code> widens to the general type, so another value of that kind fits later. Guessing a type from the value is inference.','const stop = "Ashford"\nlet town = stop\ntown = "Barlow"',0],
['Write the type yourself','A type annotation is a type you write after a colon. Use one when there is no value yet to guess from.','let wagon: string\nwagon = "Red"',0],
['Allow only some values','Join literal types with <code>|</code> (or) and only those exact values fit.','let slot: "Tuesday" | "Wednesday" = "Tuesday"\nslot = "Wednesday"',0],
['any switches the checker off','A value typed <code>any</code> is never checked, so a mistake only shows up when the line runs.','let mumbles: any = "Squawk"\nmumbles.length',0],
['unknown makes you prove it','<code>unknown</code> holds anything too, but the checker makes you prove what it is before you use it. How to prove it comes in a later chapter.','let mumbles: unknown = "Squawk"\nmumbles = 5',0],
['Say what a parameter takes','A parameter needs an annotation. Without one the checker would quietly fall back to an implicit any.','function repeat(word: string) {\n  return word\n}',0],
['as is a promise','<code>as</code> tells the checker to trust you: a promise from you, not a conversion. It changes what the checker believes and never the value, so the promise has to be possible.','const seats = 12 as number',0],
['Allow one of several types','A union type is a type made of several allowed types joined by <code>|</code>. Until you check which one you have, you can use only what all of them share. Checking is called narrowing, and <code>typeof</code> gives the kind of a value as text.','function size(load: string | number) {\n  if (typeof load === "string") {\n    return load.length\n  }\n  return load\n}',1],
['Check that it is there','<code>undefined</code> is the value of "nothing here", and it is also a type. A union with <code>undefined</code> needs a check before use, and <code>if (note)</code> is one.','function stampLength(note: string | undefined) {\n  if (note) {\n    return note.length\n  }\n  return 0\n}',1],
['Look inside an object','<code>"wheels" in vehicle</code> is true when the object has that property, and it narrows a union of objects to the shape that has it.','function count(vehicle: { wheels: number } | { sails: number }) {\n  if ("wheels" in vehicle) {\n    return vehicle.wheels\n  }\n  return vehicle.sails\n}',1],
['Pick by tag','A shape with a fixed <code>kind</code> label is tagged, and a union of tagged shapes is a discriminated union. <code>switch</code> runs the <code>case</code> that matches the tag, and the default branch runs when none does.','function fare(ticket: { kind: "adult"; seats: number } | { kind: "child"; age: number }) {\n  switch (ticket.kind) {\n    case "adult":\n      return ticket.seats\n    case "child":\n      return ticket.age\n    default:\n      return 0\n  }\n}',1],
['never catches a missed case','<code>never</code> is the type no value can have. Assign the leftover value to it in the default branch: if a kind is not handled, the checker refuses. That is an exhaustive check.','function greet(guest: { kind: "adult" } | { kind: "child" }) {\n  switch (guest.kind) {\n    case "adult":\n      return "Welcome aboard"\n    case "child":\n      return "Mind the gap"\n    default:\n      const missed: never = guest\n      return missed\n  }\n}',1],
['Name a type once','A type alias is a new name for a type you already can write. It makes no new value, and every place that uses the name reads as the full type.','type Seat = "window" | "aisle"\nlet first: Seat = "window"\nlet second: Seat = "aisle"',2],
['An interface is a blank card','An interface names the shape of an object. A property with <code>?</code> before the colon is optional and may be left out. Put <code>readonly</code> in front of a property and it can be set once and never assigned again.','interface Ticket {\n  readonly seat: string\n  note?: string\n}\nconst first: Ticket = { seat: "12A" }',2],
['Grow a card with extends','<code>extends</code> starts a new interface from an existing one and adds more properties. A value must have the properties of both.','interface Ticket {\n  seat: string\n}\ninterface Passenger extends Ticket {\n  name: string\n}\nconst rider: Passenger = { seat: "12A", name: "Mumbles" }',2],
['Join two types with &','<code>&amp;</code> makes an intersection: a value has everything both types ask for. Where <code>|</code> means one or the other, <code>&amp;</code> means both. Unlike <code>extends</code> it works on any types, so a shape can be joined in place.','interface Ticket {\n  seat: string\n}\ntype Stamped = Ticket & { stamp: string }\nconst sealed: Stamped = { seat: "12A", stamp: "Ashford" }',2],
['Same shape, same type','TypeScript compares types by the properties they have, not by their names. This is structural typing: a value of one interface fits any other with the same shape.','interface Seat {\n  row: number\n}\ninterface Berth {\n  row: number\n}\nconst a: Seat = { row: 3 }\nconst b: Berth = a',2],
['Say what comes out','A return type is written after the closing bracket of the parameters. It is the type of the value the function hands back, and a <code>return</code> of any other type is refused.','function seatsLeft(total: number, taken: number): number {\n  return total - taken\n}',3],
['Skip an argument','A <code>?</code> before the colon makes an optional parameter: a call may leave it out. <code>= 1</code> after the type makes a default parameter, filled in when the call leaves it out.','function board(name: string, seat?: string, row: number = 1) {\n  console.log(name, seat, row)\n}\nboard("Mumbles")',3],
['Take any number of arguments','A rest parameter starts with <code>...</code> and collects the extra arguments into one list. A type followed by <code>[]</code> is a list of that type, so <code>number[]</code> is a list of numbers.','function reserve(...seats: number[]) {\n  console.log(seats.length)\n}\nreserve(12, 13, 14)',3],
['Pass a function in','A function handed to another function is a callback. Its type is written like an arrow: the parameters in brackets, then <code>=></code> and what it gives back.','function charge(price: number, discount: (amount: number) => number) {\n  return discount(price)\n}\nconsole.log(charge(20, amount => amount - 5))',3],
['Return nothing','<code>void</code> as a return type means no value comes back. It fits a function that only does a job, such as printing.','function announce(stop: string): void {\n  console.log("Next stop: " + stop)\n}\nannounce("Ashford")',3],
['Return never','A function that always ends by raising an error can be typed <code>never</code>. <code>throw</code> raises the error, and <code>new Error</code> builds one that carries a message.','function derail(reason: string): never {\n  throw new Error(reason)\n}',3],
['Vouch for a type','A return type such as <code>thing is Ticket</code> is a type predicate. When the function returns true, the checker treats the value as that type in the <code>if</code> that called it.','interface Ticket {\n  seat: string\n}\nfunction isTicket(thing: Ticket | string): thing is Ticket {\n  return typeof thing !== "string"\n}',3],
['Add to a list','<code>push</code> adds an item to the end of a list. The item must be of the list\'s kind, so a list of texts refuses a number.','const stops: string[] = ["Ashford"]\nstops.push("Bath")',4],
['Lock a list','<code>readonly</code> in front of a list type makes a readonly list. You can read it, but <code>push</code> and the other editing methods are gone.','const crew: readonly string[] = ["Mumbles", "Pip"]\nconsole.log(crew[0])',4],
['A tuple has fixed slots','A tuple is a list with a fixed length where each place has its own type. Places are counted from 0.','let seat: [number, string] = [4, "Mumbles"]\nconsole.log(seat[1])',4],
['Name the slots','A name before a colon labels a slot of a tuple. It helps the reader and the checker\'s messages; the value is still read by place.','let seat: [wagon: number, name: string] = [4, "Mumbles"]\nconsole.log(seat[0])',4],
['A slot that may be missing','A <code>?</code> after a slot\'s type makes it optional, so the value may stop before it. Optional slots come last.','let seat: [number, string, string?] = [4, "Mumbles"]\nconsole.log(seat)',4],
];
const ERRS=[
["error TS2322: Type 'number' is not assignable to type 'string'",'A value of the wrong type went into a variable. Fix the value, or change the type if the type was wrong.'],
["error TS18046: 'mumbles' is of type 'unknown'",'You used an <code>unknown</code> value without proving what it is. Check it first, or annotate it with the type you really mean.'],
["error TS7006: Parameter 'word' implicitly has an 'any' type",'A parameter has no annotation, so it would be an implicit any. Write its type after a colon, like <code>word: string</code>.'],
["error TS2352: Conversion of type 'number' to type 'string' may be a mistake",'An <code>as</code> promise that cannot be true. A number is never a string; convert the value for real instead.'],
["error TS2540: Cannot assign to 'town' because it is a read-only property",'You assigned to a <code>readonly</code> property after the object was made. Build a new object instead, or drop <code>readonly</code> if the property should change.'],
["error TS2353: Object literal may only specify known properties, and 'colour' does not exist in type 'Parcel'",'An object written in place has a property the type does not list. Remove it, fix the spelling, or add it to the type.'],
["error TS2345: Argument of type 'number' is not assignable to parameter of type 'string'",'A value passed to a function or method is the wrong kind. Pass the right kind, or change the type if the type was wrong.'],
["error TS2339: Property 'push' does not exist on type 'readonly string[]'",'You used a property or method the type does not have. On a readonly list the editing methods are gone on purpose: build a new list instead.'],
["error TS2493: Tuple type '[number, string]' of length '2' has no element at index '2'",'You read a place past the end of a tuple. Use a place the tuple has, or add the slot to the type.'],
];
TSQ.guideHTML=({esc,hl})=>{
const card=b=>`<div class="card panel"><h4>${esc(b[0])}</h4><p>${b[1]}</p><pre>${hl(b[2])}</pre></div>`;
return `
  <div><h2>Field guide</h2><p class="lede">The quest on one page. The code cards are examples to read; try them in the console.</p></div>

  <section class="gsec"><h3>Who's who</h3><p>TypeScript is JavaScript plus types, labels that say what kind of value goes where. A checker reads them and stops a mistake before anything runs. Then the labels are stripped away and plain JavaScript is left.</p></section>

  <section class="gsec"><h3>Building blocks</h3><p>Each card is one idea from the quest.</p>
    <div class="cards">${BLOCKS.map(card).join('')}</div></section>

  <section class="gsec"><h3>What the checker guesses</h3><p>With no annotation, the checker infers a type from the value.</p>
    <div class="panel tblwrap" style="padding:6px 8px"><table class="cmp"><tr><th>You write</th><th>The checker guesses</th></tr>
      <tr><td><code>const stop = "Ashford"</code></td><td><code>"Ashford"</code> (the exact text)</td></tr>
      <tr><td><code>let town = "Ashford"</code></td><td><code>string</code> (widened)</td></tr>
      <tr><td><code>let seats = 12</code></td><td><code>number</code> (widened)</td></tr>
    </table></div></section>

  <section class="gsec" data-extras><h3>Error decoder</h3><p>An error code names the kind of mistake. Learn these and you can read most of what the quest shows.</p>
    <div class="errs">${ERRS.map(e=>`<div class="card panel"><code class="e">${esc(e[0])}</code><p>${e[1]}</p></div>`).join('')}</div></section>`;
};
TSQ.BLOCKS=BLOCKS;
TSQ.ERRS=ERRS;
})();
