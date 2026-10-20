/* Test-only Expert content (Stage 3 Task 17): fills the Expert tier up to its planned shape of 4 chapters x 7 missions, so the tier
   wiring (four rail headers, Expert in the quick-fire picker and the guide filter, the "Shell Wizard" rank at 1890 + 28*25 + 4*25)
   can be tested before the real chapters (content/tier-expert.js, Tasks 18 and 19) exist. It only adds the chapters that are still
   missing: once the real Expert chapters are in, it adds nothing, and the tests that load it run against the real content.
   Loaded into the node vm (tests/shell/tiers.test.mjs) or appended to content/quickfire.js by the browser smoke test. Never shipped. */
(function (SQ) {
const CH=SQ.content.chapters,have=CH.filter(c=>c.tier==='expert').length;
for(let k=have;k<4;k++){const ci=CH.length,missions=[];
  for(let j=0;j<7;j++){const word=`expert-${ci}-${j}`;
    missions.push({title:`Fake expert ${ci}.${j}`,goal:`Print <code>${word}</code>.`,explain:'A fake mission for tests.',answer:`echo ${word}`,check:c=>c.out()===word})}
  CH.push({tier:'expert',name:`Fake expert ${k+1}`,badge:`Fake badge ${k+1}`,intro:'A fake Expert chapter for tests.',learned:['echo'],setup:()=>{},missions});
  SQ.content.guide.push({c:`fake-expert-${k+1}`,ch:ci,what:'A fake guide entry for tests.',syn:[['echo','cmd']],ex:[['echo hi','']]});
  SQ.content.quickfire.push([`Fake expert question ${k+1}`,['true'],'expert'])}
})(window.SQ);
