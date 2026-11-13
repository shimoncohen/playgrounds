/* Agent Quest shell: carries out one action of a scenario's script on a virtual file system. The scenario owns its command
   and tool table; an unknown command or tool never reaches here because the grammar rejects it. Never throws. DOM-free. */
(()=>{
'use strict';
const AQ=globalThis.AQ=globalThis.AQ||{};

/* action: {verb, target, write?}; write is the new text, or a function of the file system and the Examples styles returning it */
function exec(scenario,action,vfs,styles=[],setup){
  try{
    const t=action.target;
    if(action.verb==='read'){
      const text=vfs.read(t);
      return text===null?{ok:false,out:'no such file'}:{ok:true,out:text};
    }
    if(action.verb==='edit'){
      const text=typeof action.write==='function'?action.write(vfs,styles):action.write;
      return {ok:typeof text==='string'&&vfs.write(t,text),out:''};
    }
    if(action.verb==='delete')return {ok:vfs.remove(t),out:''};
    if(action.verb==='run'){
      const cmd=(scenario.commands||{})[t];
      if(typeof cmd!=='function')return {ok:false,out:'command not found'};
      const r=cmd(vfs);
      return {ok:!!r.ok,out:String(r.out??'')};
    }
    /* a send to the same name keeps the list match below */
    if(action.verb==='call'&&AQ.vfs.own(scenario.toolFns||{},t)){
      const r=scenario.toolFns[t](vfs);
      return {ok:!!r.ok,out:String(r.out??'')};
    }
    return {ok:AQ.config.hasTool(setup,scenario,t),out:''};
  }catch(e){return {ok:false,out:'the action failed'};}
}

AQ.shell={exec};
})();
