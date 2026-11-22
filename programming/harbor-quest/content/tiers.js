(function (HQ) { 'use strict';
const tiers=window.Tiers.create({
  tiers:[{id:'beginner',name:'Beginner',blurb:'Run containers with Docker, then run and heal apps on Kubernetes.',missionXp:10}],
  chapters:HQ.CH,
  baseRanks:[[0,'Deckhand'],[120,'Dockworker'],[300,'Rigger'],[520,'Shipwright'],[800,'Harbor Pilot'],[1080,'Fleet Captain']],
  tierEndRanks:{}
});
Object.assign(HQ,{tiers});
})(window.HQ = window.HQ || {});
