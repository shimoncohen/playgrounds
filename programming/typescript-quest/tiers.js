/* Loads after the chapters: Tiers.create reads TSQ.CH by reference when called. */
(()=>{'use strict';
const TSQ=window.TSQ;
TSQ.tierCfg={
  tiers:[{id:'beginner',name:'Beginner',missionXp:10},{id:'intermediate',name:'Intermediate',missionXp:15},{id:'advanced',name:'Advanced',missionXp:20},{id:'node',name:'TypeScript with Node',missionXp:25}],
  baseRanks:[[0,'Stowaway'],[50,'Ticket Clerk'],[130,'Wagon Hand'],[240,'Signalman'],[360,'Rail Engineer']],
  tierEndRanks:{intermediate:'Chief Engineer',advanced:'Tour Architect',node:'Timetable Master'},
  doneSep:'.'
};
TSQ.tiers=window.Tiers.create({...TSQ.tierCfg,chapters:TSQ.CH});
TSQ.badgePay=(S,c,first)=>{
  if(!first||!TSQ.CH[c].missions.every((_,j)=>S.done[c+'.'+j]))return 0;
  const b=TSQ.tiers.tierOf(c).badgeXp;
  return typeof b==='number'?b:TSQ.tiers.chapterBadgeXp;
};
TSQ.tierView=S=>{
  const badges=TSQ.CH.map((c,i)=>c.missions.every((_,j)=>S.done[i+'.'+j])?1:0);
  return {done:S.done,badges,ch:S.chap};
};
TSQ.renderRail=(el,S)=>{
  const v=TSQ.tierView(S);
  window.Tiers.renderRail(el,{status:TSQ.tiers.status(v),chapters:TSQ.CH,S:v,doneSep:'.',chAttr:'data-c'});
};
})();
