(function (SQ) {
SQ.content=SQ.content||{chapters:[],guide:[],quickfire:[]};
SQ.tiers=window.Tiers.create({
  tiers:[
    {id:'beginner',name:'Beginner',blurb:'Find your way around and handle files.',missionXp:10},
    {id:'intermediate',name:'Intermediate',blurb:'Process text and control what commands do.',missionXp:15},
    {id:'advanced',name:'Advanced',blurb:'Write real scripts with logic and functions.',missionXp:20},
    {id:'expert',name:'Expert',blurb:'Craft robust, fast, debuggable tooling.',missionXp:25}
  ],
  chapters:SQ.content.chapters, /* live array: tier-*.js push into it later */
  baseRanks:[[0,'Rookie'],[100,'Apprentice'],[250,'Navigator'],[420,'Operator'],[600,'Pipe Fitter']],
  tierEndRanks:{intermediate:'Script Smith',advanced:'Automator',expert:'Shell Wizard'}
});
})(window.SQ = window.SQ || {});
