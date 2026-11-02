(()=>{
'use strict';
const RQ=globalThis.RQ=globalThis.RQ||{};
// returns {parts:[{lit}|{idx}|{name}], spec, error}; `spec` is set for a `:` spec such as `{:?}`, which is not modeled yet
function parseFormat(s){
  const parts=[];let lit='',next=0,spec=false;
  const flush=()=>{if(lit){parts.push({lit});lit='';}};
  for(let i=0;i<s.length;i++){
    const c=s[i];
    if(c==='{'){
      if(s[i+1]==='{'){lit+='{';i++;continue;}
      const end=s.indexOf('}',i);
      if(end<0)return {parts,spec,error:'invalid format string: expected `}` but string was terminated'};
      const inner=s.slice(i+1,end).trim();
      flush();
      if(inner.includes(':')){spec=true;}
      else if(inner==='')parts.push({idx:next++});
      else if(/^\d+$/.test(inner))parts.push({idx:+inner});
      else if(/^[\p{L}_][\p{L}\p{N}_]*$/u.test(inner))parts.push({name:inner});
      else return {parts,spec,error:'invalid format string: invalid argument name `'+inner+'`'};
      i=end;
    }else if(c==='}'){
      if(s[i+1]==='}'){lit+='}';i++;continue;}
      return {parts,spec,error:'invalid format string: unmatched `}` found'};
    }else lit+=c;
  }
  flush();
  return {parts,spec,error:null};
}
function display(v){
  switch(v.k){
    case 'int':return v.v.toString();
    case 'bool':return v.v?'true':'false';
    case 'char':case 'str':return v.v;
    default:throw new Error('display of '+v.k);
  }
}
RQ.std={parseFormat,display};
})();
