/* Test-only chapter: one script mission and one challenge mission (custom check). Loaded into the node vm
   (tests/shell/advanced.test.mjs) or appended to content/quickfire.js by the browser smoke test. Never shipped. */
(function (SQ) {
const {ensureDir}=SQ;
const hi={title:'Greeter',goal:'Write <code>scripts/hi.sh</code>.',explain:'Greets the first argument.',
  kind:'script',file:'scripts/hi.sh',
  starter:'#!/bin/bash\necho "Hi"\n',
  answer:'#!/bin/bash\nname=${1:-nobody}\necho "Hi $name"\n',
  wrong:['#!/bin/bash\necho "Hi $1"\n','#!/bin/bash\necho "Hello $1"\n'],
  tests:[{label:'with a name',args:['Ada'],expectOut:'Hi Ada'},{label:'no name',args:[],expectOut:'Hi nobody'}]};
const cnt={title:'Counter',goal:'Write <code>scripts/count.sh</code>.',explain:'Counts the lines on stdin.',
  kind:'challenge',file:'scripts/count.sh',
  starter:'#!/bin/bash\n# count the lines on stdin\n',
  answer:'#!/bin/bash\nn=0\nwhile read l; do n=$((n+1)); done\necho $n\n',
  wrong:['#!/bin/bash\necho 2\n','#!/bin/bash\necho 3\n'],
  tests:[{label:'two lines',stdin:'a\nb\n',expectOut:'2'}],
  check:c=>c.isFile('scripts/count.sh')&&/read/.test(c.read('scripts/count.sh'))&&c.scriptPasses(cnt).ok};
SQ.content.chapters.push({tier:'advanced',name:'Fake scripts',badge:'Faker',intro:'A fake chapter for tests.',learned:['read'],setup:()=>{ensureDir('~/scripts')},missions:[hi,cnt]});
})(window.SQ);
