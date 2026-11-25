(function (HQ) { 'use strict';
const S=HQ.S;
const {K,CH,tick,canon,parseYaml,setupChapter,addLine,esc,fireIdle,renderAll,save,TABS,showTab,run,goChapter,setups}=HQ;
/* boot */
function boot(){
  for(const p of K().pods)if(!p.sys&&p.phase!=='Running'&&p.phase!=='Terminating')p.t=0;
  const msgs=setupChapter(S.ch);
  if(!S.hist.length){addLine(esc('Welcome to Harbor Quest. This terminal pretends to be a laptop with Docker installed and a small Kubernetes cluster called harbor.'),'big');
    addLine(esc('Nothing here touches your real computer. Break things freely; "Reset world" puts it all back.'),'sys');addLine(esc('Follow the mission on the left. Type help any time.'),'sys')}
  else addLine(esc('Welcome back. Your containers and cluster are where you left them.'),'sys');
  msgs.forEach(m=>addLine(esc(m),'sys'));
  fireIdle();renderAll();save();setInterval(tick,250);
  if(location.hash&&TABS.includes(location.hash.slice(1)))showTab(location.hash.slice(1));
  window.__hq={run,goChapter,land:renderAll,setups,get S(){return S},skip:HQ.skip,tick,canon,CH,parseYaml};
}
boot();
})(window.HQ = window.HQ || {});
