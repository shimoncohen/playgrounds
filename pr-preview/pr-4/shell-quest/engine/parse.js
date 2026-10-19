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
const CTX={depth:0,pend:[],sub:0};
const unsup=x=>Object.assign(new Error('this practice shell does not support '+x+' yet'),{raw:true});
function scanSub(line,i){
  if(line[i+2]==='(')throw unsup('$(( )) arithmetic');
  let d=0,j=i+1;
  while(j<line.length){const c=line[j];
    if(c==="'"){const k=line.indexOf("'",j+1);if(k<0)break;j=k+1;continue}
    if(c==='"'){j++;while(j<line.length&&line[j]!=='"'){if(line[j]==='\\')j++;else if(line[j]==='$'&&line[j+1]==='(')j=scanSub(line,j);j++}
      if(j>=line.length)break;j++;continue}
    if(c==='\\'){j+=2;continue}
    if(c==='(')d++;else if(c===')'){d--;if(d===0)return j}
    j++}
  throw new Error("unexpected EOF while looking for matching ')'")}
function runSub(cmd){
  if(CTX.sub>=20)throw new Error('command substitution nested too deeply');
  const sv={cwd:S.cwd,oldpwd:S.oldpwd,vars:Object.assign({},S.vars),exp:S.exp&&Object.assign({},S.exp),last:S.last};
  CTX.sub++;let r;try{r=SQ.execLine(cmd,{depth:CTX.depth,tty:false,record:false})}finally{CTX.sub--;
    S.cwd=sv.cwd;S.oldpwd=sv.oldpwd;S.vars=sv.vars;S.last=sv.last;if(sv.exp)S.exp=sv.exp;else delete S.exp}
  const v=[];for(const o of r.out){if(o.clear)continue;if(o.cls==='out')v.push(o.text);else CTX.pend.push(o)}
  return v.join('\n').replace(/\n+$/,'')}
/* opt.dry: only find structure (no substitution, words keep their raw source); default: expand for real. opt.nosplit: substitution results stay one word. */
function tokenize(line,opt){opt=opt||{};const dry=!!opt.dry;
  const toks=[];let i=0,cur=null;
  const push=()=>{if(cur){toks.push({t:'w',v:cur.v,glob:cur.glob,raw:line.slice(cur.s,i)});cur=null}};
  const fresh=()=>({v:'',glob:false,s:i});
  while(i<line.length){const c=line[i];
    if(c===' '||c==='\t'){push();i++;continue}
    if(c==='|'){push();if(line[i+1]==='&')throw unsup('|&');if(line[i+1]==='|'){toks.push({t:'op',v:'||'});i+=2}else{toks.push({t:'op',v:'|'});i++}continue}
    if(c==='&'&&line[i+1]==='&'){push();toks.push({t:'op',v:'&&'});i+=2;continue}
    if(c==='&'&&line[i+1]==='>')throw unsup('&>');
    if(c===';'){push();toks.push({t:'op',v:';'});i++;continue}
    if(!cur&&c==='2'&&line[i+1]==='>'){if(line.startsWith('2>&1',i)){toks.push({t:'op',v:'2>&1'});i+=4}else if(line[i+2]==='>'){toks.push({t:'op',v:'2>>'});i+=3}else{toks.push({t:'op',v:'2>'});i+=2}continue}
    if(!cur&&c==='1'&&line[i+1]==='>'){i++;continue}
    if(c==='>'){push();if(line[i+1]==='&')throw unsup('>&');if(line[i+1]==='>'){toks.push({t:'op',v:'>>'});i+=2}else{toks.push({t:'op',v:'>'});i++}continue}
    if(c==='<'){push();if(line[i+1]==='<')throw unsup(line[i+2]==='<'?'<<<':'<<');toks.push({t:'op',v:'<'});i++;continue}
    if(c==='#'&&!cur)break;
    if(c==='~'&&!cur&&(i+1>=line.length||/[\s\/|;&<>]/.test(line[i+1]))){cur={v:HOME,glob:false,s:i};i++;continue}
    cur=cur||fresh();
    if(c==="'"){const j=line.indexOf("'",i+1);if(j<0)throw new Error("unclosed ' quote. Every opening quote needs a closing one.");cur.v+=line.slice(i+1,j);cur.keep=true;i=j+1;continue}
    if(c==='"'){let j=i+1,s='';cur.keep=true;while(j<line.length&&line[j]!=='"'){if(line[j]==='\\'&&j+1<line.length){if(!'$`"\\'.includes(line[j+1]))s+='\\';s+=line[j+1];j+=2;continue}
        if(line[j]==='$'&&line[j+1]==='('){const e=scanSub(line,j);if(!dry)s+=runSub(line.slice(j+2,e));j=e+1;continue}
        if(line[j]==='$'){const m=line.slice(j).match(VRX);if(m){s+=getVar(m[2]||m[3]);j+=m[0].length;continue}}s+=line[j];j++}
      if(j>=line.length)throw new Error('unclosed " quote. Every opening quote needs a closing one.');cur.v+=s;i=j+1;continue}
    if(c==='$'&&line[i+1]==='('){const e=scanSub(line,i);
      if(!dry){const val=runSub(line.slice(i+2,e));
        if(opt.nosplit)cur.v+=val;
        else{const ws=val.split(/\s+/).filter(Boolean),lead=/^\s/.test(val),trail=/\s$/.test(val);
          if(!ws.length){if(cur.v===''&&!cur.keep)cur=null;else if(val!==''){i=e+1;push();i=e}}
          else{if(lead){push();cur=fresh()}ws.forEach((w,k)=>{if(k>0){push();cur=fresh()}cur.v+=w});if(trail){i=e+1;push();i=e}}}}
      i=e+1;continue}
    if(c==='$'){const m=line.slice(i).match(VRX);if(m){cur.v+=getVar(m[2]||m[3]);i+=m[0].length;continue}}
    if(c==='\\'&&i+1<line.length){cur.v+=line[i+1];i+=2;continue}
    if(c==='*'||c==='?')cur.glob=true;
    cur.v+=c;i++}
  push();return toks}
/* Words from parse() carry their raw source; expand them at run time so earlier commands on the line (X=1; echo $X) and $(...) take effect in order. */
const ASSIGN=/^[A-Za-z_]\w*=/;
function expandWord(w,nosplit){return tokenize(w.raw,{nosplit}).filter(t=>t.t==='w')}
function expandWords(words,exporting){const out=[];
  words.forEach((w,k)=>{const ns=(k===0&&ASSIGN.test(w.raw))||(exporting&&k>0&&ASSIGN.test(w.raw));out.push(...expandWord(w,ns))});return out}
function expandOne(w){return expandWord(w,true).map(t=>t.v).join(' ')}
function parse(toks){
  const seq=[];let pipe=[],op=null;const nc=()=>({words:[],out:null,inp:null,err:null});let cmd=nc();
  const bad=v=>{throw new Error(`syntax error near unexpected token '${v}'`)};
  for(let k=0;k<toks.length;k++){const t=toks[k];
    if(t.t==='w'){cmd.words.push(t);continue}
    if(t.v==='2>&1'){cmd.err={dup:true};continue}
    if(t.v==='>'||t.v==='>>'||t.v==='<'||t.v==='2>'||t.v==='2>>'){const nx=toks[k+1];if(!nx||nx.t!=='w')bad(nx?nx.v:'newline');
      if(t.v==='<')cmd.inp=nx;else if(t.v[0]==='2')cmd.err={path:nx.v,append:t.v==='2>>',w:nx};else cmd.out={path:nx.v,append:t.v==='>>',w:nx};k++;continue}
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
  for(const t of rest){if(SQ.isNull(t)){src.push({name:t,text:''});continue}const n=getNode(norm(t));if(!n)err.push(SQ.isLoop(norm(t))?`${cmd}: ${t}: Too many levels of symbolic links`:`${cmd}: ${t}: No such file or directory`);else if(n.type==='dir')err.push(`${cmd}: ${t}: Is a directory`);else src.push({name:t,text:n.content})}
  return {src,err}}
function paint(name,n,tty){if(!tty)return name;if(n.type==='dir')return M('d',name+'/');if(n.exec)return M('x',name);return name}
function parseN(a,cmd){let n=10;const rest=[];for(let i=0;i<a.length;i++){const x=a[i];
  if(x==='-n'){n=parseInt(a[++i],10)}else if(/^-n\d+$/.test(x))n=parseInt(x.slice(2),10);else if(/^-\d+$/.test(x))n=parseInt(x.slice(1),10);else rest.push(x)}
  return {n,rest,bad:isNaN(n)}}
Object.assign(SQ,{M,ok,E,lines,getVar,VRX,tokenize,CTX,expandWords,expandOne,parse,globRe,globExpand,flags,readInputs,paint,parseN});
})(window.SQ = window.SQ || {});
