(function (SQ) {
const S=SQ.S;
const {HOME,norm,getNode,cmpName}=SQ;
const M=(c,s)=>'\x01'+c+s+'\x02';
const ok=(out='')=>({out,err:[],code:0});
const E=(m,c=1)=>({out:'',err:[m],code:c});
const lines=t=>t===''?[]:t.split('\n');
const BUILTIN_VARS=()=>({HOME,USER:'explorer',SHELL:'/bin/bash',HOSTNAME:'basecamp',PATH:'/usr/local/bin:/usr/bin:/bin'});
/* Variables live in S.vars; a function's `local` saves the outer value in its frame's locals and puts it back on return (dynamic scope). */
function getVar(k){const f=SQ.frame();
  if(k==='?')return String(S.last);if(k==='$')return '1234';
  if(/^\d+$/.test(k))return k==='0'?f.name:(f.args[+k-1]||'');
  if(k==='#')return String(f.args.length);if(k==='@'||k==='*')return f.args.join(' ');
  if(k==='PWD')return S.cwd;if(k in S.vars)return S.vars[k];
  return BUILTIN_VARS()[k]||''}
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
function isSet(k){const f=SQ.frame();
  if(k==='@'||k==='*')return f.args.length>0;if(k==='?'||k==='$'||k==='#'||k==='0'||k==='PWD')return true;
  if(/^\d+$/.test(k))return +k<=f.args.length;
  return own(S.vars,k)||own(BUILTIN_VARS(),k)}
function setVar(k,v){
  if(!/^[A-Za-z_]\w*$/.test(k))throw perr(k+': cannot assign in this way',1);
  S.vars[k]=v}
const perr=(m,code)=>Object.assign(new Error(m),{code});
const VRX=/^\$([A-Za-z_]\w*|\d|[?@*#$])/;
const CTX={depth:0,pend:[],sub:0};
const unsup=x=>Object.assign(new Error('this practice shell does not support '+x+' yet'),{raw:true});
/* $(( ... )): index of the final ) of the closing )) (nested parentheses balanced). */
function scanArith(line,i){let d=0;
  for(let j=i+3;j<line.length;j++){const c=line[j];
    if(c==='(')d++;else if(c===')'){if(d>0)d--;else if(line[j+1]===')')return j+1;else break}}
  throw new Error("unexpected EOF while looking for matching '))'")}
/* ${ ... }: index of the matching }. Honours quotes, nested ${ } and $( ). */
function scanBrace(line,i,dq){let d=1,j=i+2;
  while(j<line.length){const c=line[j];
    if(c==="'"&&!dq){const k=line.indexOf("'",j+1);if(k<0)break;j=k+1;continue}
    if(c==='"'){j++;while(j<line.length&&line[j]!=='"'){if(line[j]==='\\')j++;else if(line[j]==='$'&&line[j+1]==='(')j=scanSub(line,j);j++}
      if(j>=line.length)break;j++;continue}
    if(c==='\\'){j+=2;continue}
    if(c==='$'&&line[j+1]==='{'){d++;j+=2;continue}
    if(c==='$'&&line[j+1]==='('){j=scanSub(line,j)+1;continue}
    if(c==='}'){d--;if(d===0)return j}
    j++}
  throw new Error("unexpected EOF while looking for matching '}'")}
/* $( ... ): index of the matching ). Honours quotes, nested $( ) and here-documents (a body line is skipped up to its delimiter line, so ) and quotes in it do not count). */
function scanSub(line,i){
  if(line[i+2]==='(')return scanArith(line,i);
  let d=0,j=i+1;const docs=[];
  while(j<line.length){const c=line[j];
    if(c==='('&&line[j+1]==='('){let e=-1;try{e=scanArith(line,j-1)}catch(x){} /* (( ... )) or $(( ... )): its << is a shift, not a here-document */
      if(e>0){j=e+1;continue}}
    if(c==='<'&&line[j+1]==='<'&&line[j+2]!=='<'){let k=j+2,strip=false,w='';if(line[k]==='-'){strip=true;k++}
      while(line[k]===' '||line[k]==='\t')k++;
      while(k<line.length&&!/[\s|&;()<>]/.test(line[k])){const q=line[k];
        if(q==="'"||q==='"'){const e=line.indexOf(q,k+1);if(e<0)break;w+=line.slice(k+1,e);k=e+1;continue}
        if(q==='\\'){w+=line[k+1]||'';k+=2;continue}
        w+=q;k++}
      if(w)docs.push({w,strip});j=k;continue}
    if(c==='\n'&&docs.length){j++;
      for(const doc of docs)while(j<line.length){const e=line.indexOf('\n',j),t=line.slice(j,e<0?line.length:e);j=e<0?line.length:e+1;if((doc.strip?t.replace(/^\t+/,''):t)===doc.w)break}
      docs.length=0;continue}
    if(c==="'"){const k=line.indexOf("'",j+1);if(k<0)break;j=k+1;continue}
    if(c==='"'){j++;while(j<line.length&&line[j]!=='"'){if(line[j]==='\\')j++;else if(line[j]==='$'&&line[j+1]==='(')j=scanSub(line,j);j++}
      if(j>=line.length)break;j++;continue}
    if(c==='\\'){j+=2;continue}
    if(c==='(')d++;else if(c===')'){d--;if(d===0)return j}
    j++}
  throw new Error("unexpected EOF while looking for matching ')'")}
function runSub(cmd){
  if(CTX.sub>=20)throw new Error('command substitution nested too deeply');
  const sv=SQ.snapshotShell();
  CTX.sub++;let r;try{r=SQ.execLine(cmd,{depth:CTX.depth,tty:false,record:false})}finally{CTX.sub--;SQ.restoreShell(sv)}
  const v=[];for(const o of r.out){if(o.clear)continue;if(o.cls==='out')v.push(o.text);else CTX.pend.push(o)}
  return v.join('\n').replace(/\n+$/,'')}
/* Run-time expansion of $name, ${...} and $(( )) at line[i]==='$'. Returns null when the $ is literal, else {end,val,list?}: end = index after the expansion,
   list = the positional arguments for $@ / $* (the caller decides how to split them). dry: only find the end (no variable reads with side effects, no arithmetic). */
const arithEnv={get:k=>getVar(k),set:(k,v)=>setVar(k,v)};
function arithVal(expr){
  try{return SQ.arith(expandStr(expr),arithEnv)}catch(e){if(e&&e.stop)throw e;if(e&&e.code===undefined)e.code=1;throw e}}
function evalDollar(line,i,dry,dq){
  if(line[i+1]==='('&&line[i+2]==='('){const e=scanArith(line,i);return {end:e+1,val:dry?'':arithVal(line.slice(i+3,e-1))}}
  if(line[i+1]==='{'){const e=scanBrace(line,i,dq);if(dry)return {end:e+1,val:''};
    const r=braceVal(line.slice(i+2,e));r.end=e+1;return r}
  const m=line.slice(i).match(VRX);if(!m)return null;
  const k=m[1];return {end:i+m[0].length,val:getVar(k),list:!dry&&(k==='@'||k==='*')?SQ.frame().args.slice():null}}
/* Text expansion for ${X:-operand} and arithmetic: $ forms, $( ), quotes and backslashes, but never word splitting. */
/* case pattern: str matches the whole of the pattern word (quoted parts literal) */
function patMatch(str,raw){pguard(str);const L=matchLens(globItems(expandStr(raw,false,true)),str,0);return L.length>0&&L[L.length-1]===str.length}
function expandStr(s,dq,pat){let o='',j=0;const Q=(x,q)=>pat&&q?x.replace(/[*?[\]\\]/g,'\\$&'):x;
  while(j<s.length){const c=s[j];
    if(c==="'"&&!dq){const k=s.indexOf("'",j+1);if(k<0){o+=c;j++;continue}o+=Q(s.slice(j+1,k),true);j=k+1;continue}
    if(c==='"'&&!dq){let k=j+1;while(k<s.length&&s[k]!=='"'){if(s[k]==='\\')k++;k++}
      if(k>=s.length){o+=c;j++;continue}o+=expandStr(s.slice(j+1,k),true,pat);j=k+1;continue}
    if(c==='\\'&&j+1<s.length){if(dq&&!'$`"\\'.includes(s[j+1]))o+=Q('\\',dq);o+=Q(s[j+1],true);j+=2;continue}
    if(c==='$'){
      if(s[j+1]==='('&&s[j+2]!=='('){const e=scanSub(s,j);o+=Q(runSub(s.slice(j+2,e)),dq);j=e+1;continue}
      const d=evalDollar(s,j,false,dq);if(d){o+=Q(d.list?d.list.join(' '):d.val,dq);j=d.end;continue}}
    o+=Q(c,dq);j++}
  return o}
/* Shell glob matching for ${X#p} ${X%p} ${X/p/r}: the pattern compiles to items (* ? [set] literal) and an NFA over pattern positions is run along the string,
   so every matching length is found in O(len*pattern) with no backtracking. Work is charged to the step budget. */
function globItems(p){if(p.length>SQ.LIM.PATTERN)throw perr('pattern too long for this practice shell',1);
  const it=[];
  for(let j=0;j<p.length;j++){const c=p[j];
    if(c==='\\'&&j+1<p.length){it.push({t:'c',c:p[++j]});continue}
    if(c==='*'){if(!it.length||it[it.length-1].t!=='*')it.push({t:'*'});continue}
    if(c==='?'){it.push({t:'?'});continue}
    if(c==='['){let k=j+1,neg=false;if(p[k]==='!'||p[k]==='^'){neg=true;k++}
      const rs=[];let first=true,closed=false;
      while(k<p.length){let ch=p[k];if(ch===']'&&!first){closed=true;break}first=false;
        if(ch==='\\'&&k+1<p.length)ch=p[++k];
        if(p[k+1]==='-'&&k+2<p.length&&p[k+2]!==']'){rs.push([ch,p[k+2]]);k+=3}else{rs.push([ch,ch]);k++}}
      if(closed){it.push({t:'set',neg,rs});j=k;continue}}
    it.push({t:'c',c})}
  return it}
function itemHit(x,ch){if(x.t==='?')return true;if(x.t==='c')return x.c===ch;
  let h=false;for(const r of x.rs)if(ch>=r[0]&&ch<=r[1]){h=true;break}return h!==x.neg}
/* lengths L (ascending) such that str.slice(from,from+L) matches the whole pattern */
function matchLens(it,str,from){const m=it.length,out=[];let cur=new Uint8Array(m+1),nx=new Uint8Array(m+1),work=0;
  const close=a=>{for(let i=0;i<m;i++)if(a[i]&&it[i].t==='*')a[i+1]=1};
  cur[0]=1;close(cur);if(cur[m])out.push(0);
  for(let j=from;j<str.length;j++){nx.fill(0);let any=false;const ch=str[j];
    for(let i=0;i<m;i++)if(cur[i]){if(it[i].t==='*'){nx[i]=1;any=true}else if(itemHit(it[i],ch)){nx[i+1]=1;any=true}}
    work+=m+1;if(work>=2000){work=0;SQ.step()}
    if(!any)break;close(nx);if(nx[m])out.push(j+1-from);const t=cur;cur=nx;nx=t}
  return out}
const rev=a=>a.slice().reverse();
const pguard=v=>{if(v.length>5000)throw perr('value too long for this practice shell',1)};
function braceVal(body){let m;
  if(body.length>1&&body[0]==='#'&&(m=/^#(\w+|[@*])$/.exec(body)))return {val:String(m[1]==='@'||m[1]==='*'?SQ.frame().args.length:getVar(m[1]).length)};
  m=/^(\w+|[?@*#$!])/.exec(body);if(!m)throw perr('${'+body+'}: bad substitution',1);
  const k=m[1],rest=body.slice(k.length);
  if(rest==='')return (k==='@'||k==='*')?{val:getVar(k),list:SQ.frame().args.slice()}:{val:getVar(k)};
  const val=getVar(k),set=isSet(k),n=val.length;
  if((m=/^(:?)([-=+?])([\s\S]*)$/.exec(rest))){const nul=m[1]===':',op=m[2],w=m[3],empty=!set||(nul&&val==='');
    if(op==='-')return {val:empty?expandStr(w):val};
    if(op==='=')return {val:empty?(()=>{const d=expandStr(w);setVar(k,d);return d})():val};
    if(op==='+')return {val:empty?'':expandStr(w)};
    if(empty)throw perr(k+': '+(w?expandStr(w):nul?'parameter null or not set':'parameter not set'),1);
    return {val}}
  if((m=/^(##?|%%?)([\s\S]*)$/.exec(rest))){pguard(val);const it=globItems(expandStr(m[2],false,true)),op=m[1];
    if(op[0]==='#'){const L=matchLens(it,val,0);if(L.length)return {val:val.slice(op==='#'?L[0]:L[L.length-1])}}
    else{const L=matchLens(rev(it),val.split('').reverse().join(''),0);if(L.length)return {val:val.slice(0,n-(op==='%'?L[0]:L[L.length-1]))}}
    return {val}}
  if((m=/^(\/\/?)([\s\S]*)$/.exec(rest))){pguard(val);const all=m[1]==='//',t=m[2];
    let cut=-1;for(let j=0;j<t.length;j++){if(t[j]==='\\')j++;else if(t[j]==='/'){cut=j;break}}
    const pe=expandStr(cut<0?t:t.slice(0,cut),false,true),rep=cut<0?'':expandStr(t.slice(cut+1));
    if(!pe)return {val};const it=globItems(pe);let out='',p=0;
    while(p<n){SQ.step();const L=matchLens(it,val,p).filter(x=>x>0);
      if(L.length){out+=rep;p+=L[L.length-1];if(!all)return {val:out+val.slice(p)}}else out+=val[p++]}
    return {val:out}}
  if(rest[0]===':'){const a=rest.slice(1),c=a.indexOf(':');
    const num=x=>{const r=Number(arithVal(x));return r};
    let off=num(c<0?a:a.slice(0,c));const len=c<0?undefined:num(a.slice(c+1));
    if(off<0)off=Math.max(0,n+off);
    return {val:len===undefined?val.slice(off):len<0?val.slice(off,n+len):val.slice(off,off+len)}}
  throw perr('${'+body+'}: bad substitution',1)}
/* opt.dry: only find structure (no substitution, words keep their raw source); default: expand for real. opt.nosplit: substitution results stay one word. */
function tokenize(line,opt){opt=opt||{};const dry=!!opt.dry;
  const toks=[],pending=[],P=!!opt.pos;let i=0,cur=null;
  if(P){const tp=toks.push.bind(toks);toks.push=t=>{if(t.t==='op'){t.s=(t.v==='<<'||t.v==='<<-')?i-t.v.length:i;t.e=t.s+t.v.length}return tp(t)}} /* opt.pos (AST parser): tokens carry source offsets s/e */
  const push=()=>{if(cur){if(!(cur.empt&&cur.v===''))toks.push(P?{t:'w',v:cur.v,glob:cur.glob,raw:line.slice(cur.s,i),s:cur.s,e:i}:{t:'w',v:cur.v,glob:cur.glob,raw:line.slice(cur.s,i)});cur=null}};
  /* splice a substitution result into the current word, splitting it on whitespace; e = index of the expansion's last character */
  const inject=(val,e)=>{const ws=val.split(/\s+/).filter(Boolean),lead=/^\s/.test(val),trail=/\s$/.test(val);
    if(!ws.length){if(cur.v===''&&!cur.keep)cur=null;else if(val!==''){i=e+1;push();i=e}}
    else{if(lead){push();cur=fresh()}ws.forEach((w,k)=>{if(k>0){push();cur=fresh()}cur.v+=w});if(trail){i=e+1;push();i=e}}};
  const fresh=()=>({v:'',glob:false,s:i});
  /* opt.pos only: (( ... )) and [[ ... ]] at command position are one raw span token, so << < > inside are never redirects or here-docs; null = not a span (unterminated or ((a); (b)) -> normal tokens) */
  const spanOk=()=>{const l=toks[toks.length-1];
    return !l||(l.t==='op'?!/^(<|>|>>|2>|2>>|<<|<<-|<<<)$/.test(l.v):l.raw===l.v&&['then','do','else','elif','if','while','until','!','{'].includes(l.v))};
  /* A scan that runs to EOF without closing is remembered per kind so repeated unterminated openers stay linear. Sound enough: an unterminated (( or [[ already makes the program an EOF syntax error, so later openers only affect token shape inside an erroneous program. */
  let noAr=false,noCo=false;
  const span=ar=>{let j=i+2,d=0;if(ar?noAr:noCo)return null;const eof=()=>{if(ar)noAr=true;else noCo=true;return null};
    for(;j<line.length;j++){const c=line[j];
      if(c==="'"){const k=line.indexOf("'",j+1);if(k<0)return eof();j=k;continue}
      if(c==='"'){j++;while(j<line.length&&line[j]!=='"'){if(line[j]==='\\')j++;j++}if(j>=line.length)return eof();continue}
      if(c==='\\'){j++;continue}
      if(ar){if(c==='(')d++;else if(c===')'){if(d>0)d--;else if(line[j+1]===')')return {t:'arith',raw:line.slice(i+2,j).trim(),s:i,e:j+2};else return null}}
      else if(c===']'&&line[j+1]===']'&&/\s/.test(line[j-1])&&(j+2>=line.length||/[\s;&|)<>]/.test(line[j+2])))return {t:'cond',raw:line.slice(i+2,j).trim(),s:i,e:j+2}}
    return eof()};
  /* here-doc delimiter word after << / <<-: quotes and backslashes are removed and make the body literal; the word follows the op as a plain word token */
  const heredocWord=(op,strip)=>{while(line[i]===' '||line[i]==='\t')i++;
    const s=i;let d='',q=false;
    while(i<line.length&&!/[\s|&;()<>]/.test(line[i])){const c=line[i];
      if(c==="'"||c==='"'){const k=line.indexOf(c,i+1);if(k<0)throw new Error('unclosed '+c+' quote. Every opening quote needs a closing one.');d+=line.slice(i+1,k);q=true;i=k+1;continue}
      if(c==='\\'&&i+1<line.length){d+=line[i+1];q=true;i+=2;continue}
      d+=c;i++}
    if(!d)throw new Error("syntax error near unexpected token '"+(i<line.length?line[i]:'newline')+"'");
    toks.push(P?{t:'w',v:d,glob:false,raw:line.slice(s,i),s,e:i}:{t:'w',v:d,glob:false,raw:line.slice(s,i)});
    op.doc={raw:'',quoted:q,strip,delim:d,eof:true};pending.push(op.doc)};
  /* at the line break after the op(s): read each pending body in order, up to its delimiter line (linear: one indexOf per line) */
  const readDocs=()=>{for(const doc of pending){let body='';
      while(i<line.length){const k=line.indexOf('\n',i),text=line.slice(i,k<0?line.length:k),cmp=doc.strip?text.replace(/^\t+/,''):text;
        i=k<0?line.length:k+1;
        if(cmp===doc.delim){delete doc.eof;break}
        body+=cmp+'\n'}
      doc.raw=body}
    pending.length=0};
  while(i<line.length){const c=line[i];
    if(c===' '||c==='\t'){push();i++;continue}
    if(P&&!cur&&((c==='('&&line[i+1]==='(')||(c==='['&&line[i+1]==='['&&/\s/.test(line[i+2]||'')))&&spanOk()){const sp=span(c==='(');if(sp){toks.push(sp);i=sp.e;continue}}
    if(c==='\n'){push();toks.push({t:'op',v:'\n'});i++;readDocs();if(P)toks[toks.length-1].e=i;continue}
    if(c==='('||c===')'){push();toks.push({t:'op',v:c});i++;continue}
    if(c==='\\'&&line[i+1]==='\n'){i+=2;continue}
    if(c==='|'){push();if(line[i+1]==='&')throw unsup('|&');if(line[i+1]==='|'){toks.push({t:'op',v:'||'});i+=2}else{toks.push({t:'op',v:'|'});i++}continue}
    if(c==='&'&&line[i+1]==='&'){push();toks.push({t:'op',v:'&&'});i+=2;continue}
    if(c==='&'&&line[i+1]==='>')throw unsup('&>');
    if(c==='&'){push();toks.push({t:'op',v:'&'});i++;continue}
    if(c===';'){push();if(line[i+1]===';'){toks.push({t:'op',v:';;'});i+=2}else{toks.push({t:'op',v:';'});i++}continue}
    if(!cur&&c==='2'&&line[i+1]==='>'){if(line.startsWith('2>&1',i)){toks.push({t:'op',v:'2>&1'});i+=4}else if(line[i+2]==='>'){toks.push({t:'op',v:'2>>'});i+=3}else{toks.push({t:'op',v:'2>'});i+=2}continue}
    if(!cur&&c==='1'&&line[i+1]==='>'){i++;continue}
    if(c==='>'){push();if(line[i+1]==='&')throw unsup('>&');if(line[i+1]==='>'){toks.push({t:'op',v:'>>'});i+=2}else{toks.push({t:'op',v:'>'});i++}continue}
    if(c==='<'){push();
      if(line[i+1]==='<'){
        if(line[i+2]==='<'){toks.push({t:'op',v:'<<<'});i+=3;continue}
        const strip=line[i+2]==='-',op={t:'op',v:strip?'<<-':'<<'};i+=strip?3:2;toks.push(op);heredocWord(op,strip);continue}
      toks.push({t:'op',v:'<'});i++;continue}
    if(c==='#'&&!cur){const k=line.indexOf('\n',i);i=k<0?line.length:k;continue}
    if(c==='~'&&!cur&&(i+1>=line.length||/[\s\/|;&<>]/.test(line[i+1]))){cur={v:HOME,glob:false,s:i};i++;continue}
    cur=cur||fresh();
    if(c==="'"){const j=line.indexOf("'",i+1);if(j<0)throw new Error("unclosed ' quote. Every opening quote needs a closing one.");cur.v+=line.slice(i+1,j);cur.keep=true;i=j+1;continue}
    if(c==='"'){let j=i+1,s='',atEmpty=false;cur.keep=true;while(j<line.length&&line[j]!=='"'){if(line[j]==='\\'&&j+1<line.length){if(line[j+1]==='\n'){j+=2;continue}if(!'$`"\\'.includes(line[j+1]))s+='\\';s+=line[j+1];j+=2;continue}
        if(line[j]==='$'&&line[j+1]==='('&&line[j+2]!=='('){const e=scanSub(line,j);if(!dry)s+=runSub(line.slice(j+2,e));j=e+1;continue}
        if(line[j]==='$'){const d=evalDollar(line,j,dry,true);if(d){
          if(d.list&&!opt.nosplit&&line[j+1]!=='*'&&line[j+2]!=='*'){ /* "$@": one word per argument */
            if(!d.list.length)atEmpty=true;else{s+=d.list[0];for(let k=1;k<d.list.length;k++){cur.v+=s;push();cur=fresh();s=d.list[k]}}}
          else s+=d.list?d.list.join(' '):d.val;
          j=d.end;continue}}s+=line[j];j++}
      if(j>=line.length)throw new Error('unclosed " quote. Every opening quote needs a closing one.');cur.v+=s;if(atEmpty&&s===''&&cur.v==='')cur.empt=true;i=j+1;continue}
    if(c==='$'&&line[i+1]==='('&&line[i+2]!=='('){const e=scanSub(line,i);
      if(!dry){const val=runSub(line.slice(i+2,e));
        if(opt.nosplit)cur.v+=val;else inject(val,e)}
      i=e+1;continue}
    if(c==='$'){const d=evalDollar(line,i,dry,false);if(d){
      if(d.list&&!opt.nosplit)inject(d.list.join(' '),d.end-1);else cur.v+=d.list?d.list.join(' '):d.val;
      i=d.end;continue}}
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
/* Body of a here-document whose delimiter was unquoted: $VAR ${ } $( ) $(( )) expand; \$ \` \\ and backslash-newline are escapes, every other backslash and all quotes stay literal. */
function expandHeredoc(raw){let o='',j=0;
  while(j<raw.length){const c=raw[j];
    if(c==='\\'&&j+1<raw.length){const n=raw[j+1];if(n==='\n'){j+=2;continue}if(n==='$'||n==='`'||n==='\\'){o+=n;j+=2;continue}o+=c;j++;continue}
    if(c==='$'){
      if(raw[j+1]==='('&&raw[j+2]!=='('){const e=scanSub(raw,j);o+=runSub(raw.slice(j+2,e));j=e+1;continue}
      const d=evalDollar(raw,j,false,true);if(d){o+=d.list?d.list.join(' '):d.val;j=d.end;continue}}
    o+=c;j++}
  return o}
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
Object.assign(SQ,{M,ok,E,lines,getVar,setVar,arithVal,patMatch,VRX,tokenize,expandHeredoc,CTX,expandWords,expandOne,parse,globRe,globExpand,flags,readInputs,paint,parseN});
})(window.SQ = window.SQ || {});
