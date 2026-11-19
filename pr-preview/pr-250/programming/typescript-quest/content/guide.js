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
];
const ERRS=[
["error TS2322: Type 'number' is not assignable to type 'string'",'A value of the wrong type went into a variable. Fix the value, or change the type if the type was wrong.'],
["error TS18046: 'mumbles' is of type 'unknown'",'You used an <code>unknown</code> value without proving what it is. Check it first, or annotate it with the type you really mean.'],
["error TS7006: Parameter 'word' implicitly has an 'any' type",'A parameter has no annotation, so it would be an implicit any. Write its type after a colon, like <code>word: string</code>.'],
["error TS2352: Conversion of type 'number' to type 'string' may be a mistake",'An <code>as</code> promise that cannot be true. A number is never a string; convert the value for real instead.'],
];
TSQ.guideHTML=({esc,hl})=>{
const card=b=>`<div class="card panel"><h4>${esc(b[0])}</h4><p>${b[1]}</p><pre>${hl(b[2])}</pre></div>`;
return `
  <div><h2>Field guide</h2><p class="lede">Chapter 1 of the quest on one page. The code cards are examples to read; try them in the console.</p></div>

  <section class="gsec"><h3>Who's who</h3><p>TypeScript is JavaScript plus types, labels that say what kind of value goes where. A checker reads them and stops a mistake before anything runs. Then the labels are stripped away and plain JavaScript is left.</p></section>

  <section class="gsec"><h3>Building blocks</h3><p>Each card is one idea from the quest.</p>
    <div class="cards">${BLOCKS.map(card).join('')}</div></section>

  <section class="gsec"><h3>What the checker guesses</h3><p>With no annotation, the checker infers a type from the value.</p>
    <div class="panel tblwrap" style="padding:6px 8px"><table class="cmp"><tr><th>You write</th><th>The checker guesses</th></tr>
      <tr><td><code>const stop = "Ashford"</code></td><td><code>"Ashford"</code> (the exact text)</td></tr>
      <tr><td><code>let town = "Ashford"</code></td><td><code>string</code> (widened)</td></tr>
      <tr><td><code>let seats = 12</code></td><td><code>number</code> (widened)</td></tr>
    </table></div></section>

  <section class="gsec" data-extras><h3>Error decoder</h3><p>An error code names the kind of mistake. Learn these four and you can read most of Chapter 1.</p>
    <div class="errs">${ERRS.map(e=>`<div class="card panel"><code class="e">${esc(e[0])}</code><p>${e[1]}</p></div>`).join('')}</div></section>`;
};
TSQ.BLOCKS=BLOCKS;
TSQ.ERRS=ERRS;
})();
