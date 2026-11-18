/* Loads after the chapters: Tiers.create reads SCQ.CH by reference when called. */
(()=>{'use strict';
const SCQ=window.SCQ;
SCQ.tiers=window.Tiers.create({
  tiers:[{id:'beginner',name:'Beginner',missionXp:10,badgeXp:0,showHeader:false}],
  chapters:SCQ.CH,
  baseRanks:[[0,'Newbie'],[60,'Tinkerer'],[180,'Coder'],[340,'Builder'],[520,'Engineer'],[700,'Wizard']],
  tierEndRanks:{},
  doneSep:'-'
});
SCQ.tierView=S=>{
  const badges=SCQ.CH.map((c,i)=>c.missions.every((_,j)=>S.done[i+'-'+j])?1:0);
  return {done:S.done,badges,ch:S.chap};
};
SCQ.renderRail=(el,S)=>{
  const v=SCQ.tierView(S);
  window.Tiers.renderRail(el,{status:SCQ.tiers.status(v),chapters:SCQ.CH,S:v,doneSep:'-',chAttr:'data-c',earnedStar:false,groups:true});
};
})();
