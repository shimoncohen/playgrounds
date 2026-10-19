(function (SQ) {
const S=SQ.S;
const {HOME,norm,getNode,cmpName}=SQ;
const M=(c,s)=>'\x01'+c+s+'\x02';
const ok=(out='')=>({out,err:[],code:0});
const E=(m,c=1)=>({out:'',err:[m],code:c});
const lines=t=>t===''?[]:t.split('\n');
function getVar(k){if(k==='?')return String(S.last);if(k==='PWD')return S.cwd;if(k in S.vars)return S.vars[k];
  return ({HOME,USER:'explorer',SHELL:'/bin/bash',HOSTNAME:'basecamp',PATH:'/usr/local/bin:/usr/bin:/bin'})[k]||''}
const VRX=/^\$(\{(\w+)\}|(\w+|\?))/;
function tokenize(line){
  const toks=[];let i=0,cur=null;
  const push=()=>{if(cur){toks.push({t:'w',v:cur.v,glob:cur.glob});cur=null}};
  while(i<line.length){const c=line[i];
    if(c===' '||c==='\t'){push();i++;continue}
    if(c==='|'){push();if(line[i+1]==='|'){toks.push({t:'op',v:'||'});i+=2}else{toks.push({t:'op',v:'|'});i++}continue}
    if(c==='&'&&line[i+1]==='&'){push();toks.push({t:'op',v:'&&'});i+=2;continue}
    if(c===';'){push();toks.push({t:'op',v:';'});i++;continue}
    if(c==='>'){push();if(line[i+1]==='>'){toks.push({t:'op',v:'>>'});i+=2}else{toks.push({t:'op',v:'>'});i++}continue}
    if(c==='<'){push();toks.push({t:'op',v:'<'});i++;continue}
    if(c==='#'&&!cur)break;
    if(c==='~'&&!cur&&(i+1>=line.length||/[\s\/|;&<>]/.test(line[i+1]))){cur={v:HOME,glob:false};i++;continue}
    cur=cur||{v:'',glob:false};
    if(c==="'"){const j=line.indexOf("'",i+1);if(j<0)throw new Error("unclosed ' quote. Every opening quote needs a closing one.");cur.v+=line.slice(i+1,j);i=j+1;continue}
    if(c==='"'){let j=i+1,s='';while(j<line.length&&line[j]!=='"'){if(line[j]==='\\'&&j+1<line.length){s+=line[j+1];j+=2;continue}
        if(line[j]==='$'){const m=line.slice(j).match(VRX);if(m){s+=getVar(m[2]||m[3]);j+=m[0].length;continue}}s+=line[j];j++}
      if(j>=line.length)throw new Error('unclosed " quote. Every opening quote needs a closing one.');cur.v+=s;i=j+1;continue}
    if(c==='$'){const m=line.slice(i).match(VRX);if(m){cur.v+=getVar(m[2]||m[3]);i+=m[0].length;continue}}
    if(c==='\\'&&i+1<line.length){cur.v+=line[i+1];i+=2;continue}
    if(c==='*'||c==='?')cur.glob=true;
    cur.v+=c;i++}
  push();return toks}
function parse(toks){
  const seq=[];let pipe=[],op=null;const nc=()=>({words:[],out:null,inp:null});let cmd=nc();
  const bad=v=>{throw new Error(`syntax error near unexpected token '${v}'`)};
  for(let k=0;k<toks.length;k++){const t=toks[k];
    if(t.t==='w'){cmd.words.push(t);continue}
    if(t.v==='>'||t.v==='>>'||t.v==='<'){const nx=toks[k+1];if(!nx||nx.t!=='w')bad(nx?nx.v:'newline');if(t.v==='<')cmd.inp=nx.v;else cmd.out={path:nx.v,append:t.v==='>>'};k++;continue}
    if(t.v==='|'){if(!cmd.words.length)bad('|');pipe.push(cmd);cmd=nc();continue}
    if(!cmd.words.length&&!cmd.out)bad(t.v);
    pipe.push(cmd);seq.push({op,pipe});op=t.v;pipe=[];cmd=nc()}
  if(cmd.words.length||cmd.out)pipe.push(cmd);else if(pipe.length)bad('newline');
  if(pipe.length)seq.push({op,pipe});else if(op&&op!==';')bad('newline');
  return seq}
function globRe(p,ci){return new RegExp('^'+p.replace(/[.+^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*').replace(/\?/g,'.')+'$',ci?'i':'')}
function globExpand(pat){const idx=pat.lastIndexOf('/');const dp=idx>=0?pat.slice(0,idx+1):'';const b=pat.slice(idx+1);
  if(/[*?]/.test(dp)||!b)return [pat];const dn=getNode(norm(dp||'.'));if(!dn||dn.type!=='dir')return [pat];
  const rx=globRe(b);const m=Object.keys(dn.children).filter(k=>(b.startsWith('.')||!k.startsWith('.'))&&rx.test(k)).sort(cmpName).map(k=>dp+k);
  return m.length?m:[pat]}
function flags(a){const fl=new Set(),rest=[];let end=false;for(const x of a){if(!end&&x==='--'){end=true;continue}
  if(!end&&x.startsWith('-')&&x.length>1){if(x.startsWith('--'))fl.add(x);else for(const ch of x.slice(1))fl.add(ch)}else rest.push(x)}return {fl,rest}}
function readInputs(rest,io,cmd){const src=[],err=[];if(!rest.length){src.push({name:'',text:io.stdin});return {src,err}}
  for(const t of rest){const n=getNode(norm(t));if(!n)err.push(`${cmd}: ${t}: No such file or directory`);else if(n.type==='dir')err.push(`${cmd}: ${t}: Is a directory`);else src.push({name:t,text:n.content})}
  return {src,err}}
function paint(name,n,tty){if(!tty)return name;if(n.type==='dir')return M('d',name+'/');if(n.exec)return M('x',name);return name}
function parseN(a,cmd){let n=10;const rest=[];for(let i=0;i<a.length;i++){const x=a[i];
  if(x==='-n'){n=parseInt(a[++i],10)}else if(/^-n\d+$/.test(x))n=parseInt(x.slice(2),10);else if(/^-\d+$/.test(x))n=parseInt(x.slice(1),10);else rest.push(x)}
  return {n,rest,bad:isNaN(n)}}
Object.assign(SQ,{M,ok,E,lines,getVar,VRX,tokenize,parse,globRe,globExpand,flags,readInputs,paint,parseN});
})(window.SQ = window.SQ || {});
