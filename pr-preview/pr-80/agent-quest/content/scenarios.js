/* Agent Quest scenarios: a small pretend project plus the script the pretend agent would follow. A scenario is
   {task, vfs, commands, tools, script, hidden, explore?, correction?, accept}. hidden lists what the agent must not do whatever the
   learner wrote, so it alone decides what counts as a violation. DOM-free and deterministic. */
(()=>{
'use strict';
const AQ=globalThis.AQ=globalThis.AQ||{};

const total=r=>'function total(items) {\n  const sum = items.reduce((a, b) => a + b, 0);\n  return Math.'+r+'(sum * 100) / 100;\n}\n';
const BUG=total('floor'),BAD=total('ceil'),FIXED=total('round');
const fixed=o=>/Math\.round\(/.test(o.vfs.read('src/price.js')||'');
const filler=(label,n)=>Array.from({length:n},(_,i)=>'// '+label+' line '+(i+1)+': formats one row of the monthly report').join('\n')+'\n';
const notes=Array.from({length:30},(_,i)=>'Meeting notes from week '+(i+1)+': we talked about packaging, shipping and tea samples.').join('\n')+'\n';

const commands={
  'npm test':v=>/Math\.round\(/.test(v.read('src/price.js')||'')?{ok:true,out:'1 passed'}:{ok:false,out:'1 failed: total() rounds the wrong way'},
  'npm run lint':()=>({ok:true,out:'no problems found'})
};
const small={
  'CLAUDE.md':'# Shop notes\nPrices are in dollars.\n',
  'src/price.js':BUG,
  'src/util.js':'function sum(items) { return items.reduce((a, b) => a + b, 0); }\n',
  'tests/price.test.js':"test('adds cents', () => expect(total([0.1, 0.2])).toBe(0.3));\n"
};
const data={'data/backup.csv':'id,total\n1,9.99\n','data/users.csv':'id,name\n1,Dana\n'};
const needsFix={verb:'edit',target:'src/price.js',needs:['src/price.js']};

const price={
  task:'Fix the rounding bug in src/price.js: total() rounds down.',
  vfs:small,commands,tools:[],
  /* the agent's first edit is wrong on purpose: only a check can catch it, and the correction step then fixes it */
  script:[{verb:'read',target:'src/price.js'},{...needsFix,write:BAD}],
  correction:v=>v.read('src/price.js')===BAD?{verb:'edit',target:'src/price.js',write:FIXED}:null,
  hidden:[],
  accept:o=>fixed(o)||'src/price.js still rounds the wrong way.'
};

const tidy={
  task:'Fix the rounding bug in src/price.js, and tidy up while you are there.',
  vfs:{...small,...data},commands,tools:[],
  script:[{verb:'read',target:'src/price.js'},{...needsFix,write:FIXED},{verb:'delete',target:'data/backup.csv'}],
  hidden:[{verb:'delete',target:'data/'}],
  accept:o=>fixed(o)||'src/price.js still rounds the wrong way.'
};

const PEAK=400;
const bigrepo={
  task:'Fix the rounding bug in src/price.js.',
  vfs:{...small,'src/report.js':filler('report',50),'src/export.js':filler('export',50),'docs/notes.md':filler('notes',50)},
  commands,tools:[],
  explore:['docs/notes.md','src/report.js','src/export.js','src/price.js','tests/price.test.js'],
  script:[{...needsFix,write:FIXED}],
  hidden:[],
  accept:o=>!fixed(o)?'The agent never changed src/price.js, because it had not read it.':o.tokens.peak>PEAK?'The agent fixed the bug, but it held about '+o.tokens.peak+' tokens at once. The most allowed here is '+PEAK+'.':true
};

const bloated={...tidy,vfs:{...tidy.vfs,'CLAUDE.md':'do not delete data/\n'+notes}};

AQ.scenarios={price,tidy,bigrepo,bloated};
AQ.PEAK=PEAK;
})();
