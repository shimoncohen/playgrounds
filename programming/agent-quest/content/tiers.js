/* Agent Quest paths. The tier table is the single source of mission XP: Tiers.create and state.xpFor both read it.
   Core alone reaches the top rank (33 missions at 10 XP plus 7 chapter badges at 25 XP is 505); the other paths overflow it. */
(()=>{
'use strict';
const AQ=globalThis.AQ=globalThis.AQ||{};
const TIERS=[
  {id:'core',name:'Core',blurb:'How agents work and how to steer them.',missionXp:10},
  {id:'dev',name:'Dev',blurb:'Working in a code repository.',missionXp:10},
  {id:'personal',name:'Personal',blurb:'Calendar, mail, notes and schedules.',missionXp:10},
  {id:'tune',name:'Tune',blurb:'Measure and trim a setup that has grown heavy.',missionXp:10}
];
AQ.TIERS=TIERS;
AQ.CH=AQ.CH||[];
AQ.tierXp=id=>(TIERS.find(t=>t.id===id)||TIERS[0]).missionXp;
AQ.tiers=globalThis.Tiers.create({
  tiers:TIERS,
  chapters:AQ.CH,
  baseRanks:[[0,'Prompt Rookie'],[60,'Loop Watcher'],[150,'Context Keeper'],[260,'Prompt Smith'],[380,'Guardrail Builder'],[505,'Agent Whisperer']],
  tierEndRanks:{}
});
})();
