/* sed.js: the sed script parser and runner (DOM-free).
   SQ.sedCompile(chunks, {E}) parses the whole script once (every -e chunk, joined by newlines as GNU sed does) into a flat command list:
   addresses (N, $, /re/ and \cREc with I/M, first~step, 0,/re/, addr,+N, addr,~N, !), blocks ({ } jump past their end when the address fails),
   s (flags g p i I m M and a number, & \1..\9 \n \t \U \L \u \l \E, any delimiter), y, d p q Q = n z, a i c (classic and GNU one-line forms),
   b t T and : labels, # comments. Errors use GNU wording: `sed: -e expression #K, char N: ...`.
   SQ.sedExec(prog, streams, {n}) runs it cycle by cycle over arrays of lines; SQ.sedRun(script, text, {n,E,s}) is the one-text shortcut.
   Regexes are POSIX BRE (or ERE with -E) translated to JS and compiled through SQ.safeRegex. Caps: 10,000 commands per input line and
   100,000 taken branches per run (then the step message), a pattern space of LIM.VAR characters, output stops past LIM.TEXT.
   Unsupported (the practice-shell message): w W r R e F l L v N D P h H g G x, s///e and s///w, -z -u -l -b -f -N. */
(function (SQ) {
const UNSUP='wWrReFlLvNDPhHgGx';
const CYCLE_CAP=10000,BRANCH_CAP=100000;
const CLASS={alpha:'a-zA-Z',digit:'0-9',alnum:'a-zA-Z0-9',upper:'A-Z',lower:'a-z',space:' \\t\\n\\r\\f\\v',blank:' \\t',
  punct:'!-\\/:-@\\[-`{-~',xdigit:'0-9A-Fa-f',cntrl:'\\x00-\\x1f\\x7f',print:' -~',graph:'!-~'};
const jsLit=c=>/[\\^$.*+?()[\]{}|\/-]/.test(c)?'\\'+c:c;

/* ---- POSIX regex -> JS source ---- */
function bracket(p,i){let j=i+1,o='[';
  if(p[j]==='^'){o+='^';j++}
  if(p[j]===']'){o+='\\]';j++}
  for(;;){if(j>=p.length)return {err:'Unmatched [, [^, [:, [., or [='};const c=p[j];
    if(c===']')return {src:o+']',end:j+1};
    if(c==='['&&(p[j+1]===':'||p[j+1]==='.'||p[j+1]==='=')){const k=p[j+1],e=p.indexOf(k+']',j+2);if(e<0)return {err:'Unmatched [, [^, [:, [., or [='};
      const nm=p.slice(j+2,e);
      if(k===':'){if(!SQ.own(CLASS,nm))return {err:'Invalid character class name'};o+=CLASS[nm]}else o+=nm.split('').map(jsLit).join('');
      j=e+2;continue}
    if(c==='\\'){const d=p[j+1];if(d==='n'){o+='\\n';j+=2;continue}if(d==='t'){o+='\\t';j+=2;continue}if(d==='\\'){o+='\\\\';j+=2;continue}o+='\\\\';j++;continue}
    o+=c==='-'?'-':jsLit(c);j++}}
/* returns {src, groups} or {err} (GNU regcomp wording) */
function toJs(p,ere){let o='',i=0,groups=0,closed=0,atom=-1,quant=false,start=true;const n=p.length,open=[];
  const put=(s)=>{atom=o.length;o+=s;quant=false;start=false};
  /* a quantifier on the last atom; a second one on the same atom merges (a+? is a* in ERE, not JS's lazy a+?), an interval nests in (?:) */
  let lq='';
  const q=(s)=>{if(atom<0)return false;
    if(quant&&'*+?'.includes(lq)&&'*+?'.includes(s)){if(!ere&&s==='*')return false;const m=lq===s?s:'*';o=o.slice(0,-1)+m;lq=m;return true}
    if(quant)o=o.slice(0,atom)+'(?:'+o.slice(atom)+')';o+=s;quant=true;lq=s;return true};
  const interval=(body)=>{const m=/^(\d*)(,(\d*))?$/.exec(body);if(!m||(m[1]===''&&!m[2]))return {err:'Invalid content of \\{\\}'};
    const lo=m[1]===''?0:+m[1],hi=m[2]?(m[3]===''?'':+m[3]):lo;if(lo>32767||(hi!==''&&hi>32767))return {err:'Regular expression too big'};
    if(hi!==''&&hi<lo)return {err:'Invalid content of \\{\\}'};return {s:m[2]?`{${lo},${hi}}`:`{${lo}}`}};
  while(i<n){const c=p[i];
    if(c==='['){const r=bracket(p,i);if(r.err)return r;put(r.src);i=r.end;continue}
    if(c==='\\'){if(i+1>=n)return {err:'Trailing backslash'};const d=p[i+1];i+=2;
      if(!ere&&d==='('){open.push(o.length);o+='(';groups++;atom=-1;quant=false;start=true;continue}
      if(!ere&&d===')'){if(!open.length)return {err:'Unmatched ) or \\)'};const a=open.pop();o+=')';closed++;atom=a;quant=false;start=false;continue}
      if(!ere&&d==='|'){o+='|';atom=-1;quant=false;start=true;continue}
      if(!ere&&(d==='+'||d==='?')){if(start){put('\\'+d);continue}if(!q(d))return {err:'Invalid preceding regular expression'};continue}
      if(!ere&&d==='{'){const e=p.indexOf('\\}',i);if(e<0)return {err:'Unmatched \\{'};if(atom<0)return {err:'Invalid preceding regular expression'};
        const r=interval(p.slice(i,e));if(r.err)return r;q(r.s);i=e+2;continue}
      if(/[1-9]/.test(d)){if(+d>closed)return {err:'Invalid back reference'};put('\\'+d);continue}
      if(d==='n'){put('\\n');continue}if(d==='t'){put('\\t');continue}
      if('wWsS'.includes(d)){put('\\'+d);continue}
      if(d==='b'||d==='B'){o+='\\'+d;atom=-1;quant=false;continue}
      if(d==='<'){o+='\\b(?=\\w)';atom=-1;quant=false;continue}
      if(d==='>'){o+='\\b(?<=\\w)';atom=-1;quant=false;continue}
      if(d==='`'){o+='(?<![\\s\\S])';atom=-1;quant=false;continue}
      if(d==="'"){o+='(?![\\s\\S])';atom=-1;quant=false;continue}
      put(jsLit(d));continue}
    i++;
    if(c==='*'){if(start&&!ere){put('\\*');continue}if(!q('*')){if(ere||quant)return {err:'Invalid preceding regular expression'};put('\\*')}continue}
    if(ere){
      if(c==='('){open.push(o.length);o+='(';groups++;atom=-1;quant=false;start=true;continue}
      if(c===')'){if(!open.length)return {err:'Unmatched ) or \\)'};const a=open.pop();o+=')';closed++;atom=a;quant=false;start=false;continue}
      if(c==='|'){o+='|';atom=-1;quant=false;start=true;continue}
      if(c==='+'||c==='?'){if(!q(c))return {err:'Invalid preceding regular expression'};continue}
      if(c==='{'){const e=p.indexOf('}',i);if(e<0)return {err:'Unmatched \\{'};if(atom<0)return {err:'Invalid preceding regular expression'};
        const r=interval(p.slice(i,e));if(r.err)return r;q(r.s);i=e+1;continue}
      if(c==='^'||c==='$'){o+=c;atom=-1;quant=false;start=c==='^';continue}}
    else{
      if(c==='^'){if(start&&atom<0){o+='^';continue}put('\\^');continue}
      if(c==='$'){if(i===n||p.startsWith('\\)',i)||p.startsWith('\\|',i)){o+='$';atom=-1;quant=false;continue}put('\\$');continue}}
    if(c==='.'){put('.');continue}
    put(jsLit(c))}
  if(open.length)return {err:'Unmatched ( or \\('};
  return {src:o,groups}}
/* {rx} or {err}; err is the text after "char N: " or a whole line when it starts with "sed:" */
function compileRe(p,ere,fl){const t=toJs(p,ere);if(t.err)return {err:t.err};
  try{return {rx:SQ.safeRegex(t.src,'g'+(fl.includes('I')?'i':'')+(fl.includes('M')?'m':'s')),groups:t.groups}}
  catch(e){if(e.complex)return {err:'sed: '+e.message};return {err:/out of order/i.test(e.message)?'Invalid range end':'Invalid preceding regular expression'}}}

/* ---- parser ---- */
function sedCompile(chunks,o){o=o||{};const text=chunks.join('\n'),n=text.length,starts=[];let at=0;for(const c of chunks){starts.push(at);at+=c.length+1}
  const where=p=>{let k=0;while(k+1<starts.length&&starts[k+1]<p)k++;return {k:k+1,ch:Math.max(0,p-starts[k])}};
  const bad=(p,m)=>{const w=where(p);return {err:`sed: -e expression #${w.k}, char ${w.ch}: ${m}`}};
  const bad0=(m,p)=>({err:`sed: -e expression #${p===undefined?1:where(p+1).k}, char 0: ${m}`});
  const unsup=x=>({err:`this practice shell does not support ${x} yet`,unsup:true});
  const cmds=[],blocks=[];let i=0,anyRe=false;
  const ws=()=>{while(i<n&&(text[i]===' '||text[i]==='\t'))i++};
  /* scan a delimited part up to the unescaped delimiter (null when unterminated). Regex parts keep \x pairs, turn an escaped delimiter into the
     plain character and skip [...] (a delimiter inside a bracket does not end the part); y and replacement parts keep \x for their own decoding. */
  const part=(dl,isRe)=>{let s='';
    while(i<n){const c=text[i];
      if(c===dl){i++;return s}
      if(c==='\n'&&isRe!=='y')return null;
      if(c==='\\'){if(i+1>=n)return null;const d=text[i+1];i+=2;
        if(d===dl){s+=isRe===true?dl:'\\'+dl;continue} /* GNU: the plain character, keeping any regex meaning (s.a\.b.X. matches axb) */
        if(d==='\n'){s+=isRe===true?'\\n':'\n';continue}
        s+='\\'+d;continue}
      if(c==='['&&isRe===true){let j=i+1;if(text[j]==='^')j++;if(text[j]===']')j++;
        while(j<n&&text[j]!==']'&&text[j]!=='\n'){if(text[j]==='['&&(text[j+1]===':'||text[j+1]==='.'||text[j+1]==='=')){const e=text.indexOf(text[j+1]+']',j+2);if(e>0&&!text.slice(j,e).includes('\n')){j=e+2;continue}}j++}
        if(j>=n||text[j]==='\n'){i=j;return null}s+=text.slice(i,j+1);i=j+1;continue}
      s+=c;i++}
    return null};
  const regex=(src,fl,endPos)=>{if(src===''){if(!anyRe)return bad0('no previous regular expression');if(fl)return bad(endPos,'no previous regular expression');return {rx:null,groups:-1}}
    anyRe=true;const r=compileRe(src,o.E,fl);if(r.err)return r.err.startsWith('sed:')?{err:r.err}:bad(endPos,r.err);return r};
  const addr=()=>{const c=text[i];
    if(c==='/'||c==='\\'){let dl='/';if(c==='\\'){dl=text[i+1];i+=2;if(dl===undefined||dl==='\n'||dl==='\\')return bad(i,'unterminated address regex')}else i++;
      const s=part(dl,true);if(s===null)return bad(i,'unterminated address regex');let fl='';
      while(text[i]==='I'||text[i]==='M'){fl+=text[i];i++}
      const r=regex(s,fl,i);if(r.err)return r;return {a:{t:'re',rx:r.rx}}}
    if(c==='$'){i++;return {a:{t:'last'}}}
    if(/\d/.test(c||'')){let s='';while(/\d/.test(text[i]||''))s+=text[i++];
      if(text[i]==='~'){i++;let t='';while(/\d/.test(text[i]||''))t+=text[i++];return {a:{t:'step',n:+s,step:+(t||0)}}}
      return {a:{t:'n',n:+s}}}
    return null};
  const endCmd=()=>{ws();const c=text[i];if(i>=n)return null;if(c==='\n'||c===';'){i++;return null}if(c==='}'||c==='#')return null;i++;return bad(i,'extra characters after command')};
  const label=()=>{ws();let s='';while(i<n&&!/[;\n}\s]/.test(text[i]))s+=text[i++];return s};
  const textArg=(cmd)=>{ws();
    if(i>=n)return bad(i,'expected \\ after `a\', `c\' or `i\'');
    if(text[i]==='\\'){i++;if(text[i]==='\n')i++}
    else if(text[i]==='\n')return bad(i,'expected \\ after `a\', `c\' or `i\'');
    let s='',any=false;while(i<n){const c=text[i];
      if(c==='\\'){const d=text[i+1];i+=2;if(d===undefined)break;any=true;s+=d==='n'?'\n':d==='t'?'\t':d;continue}
      if(c==='\n'){i++;break}
      any=true;s+=c;i++}
    cmd.text=any?s:null;return null};
  if(/^#n(\n|$)/.test(text)){o.quiet=true}
  while(i<n){
    while(i<n&&/[\s;]/.test(text[i]))i++;if(i>=n)break;
    if(text[i]==='#'){while(i<n&&text[i]!=='\n')i++;continue}
    const cmd={c:'',a1:null,a2:null,neg:false};
    let r=addr();if(r&&r.err)return r;
    if(r){cmd.a1=r.a;ws();
      if(text[i]===','){i++;ws();const c=text[i];
        if(c==='+'||c==='~'){i++;let s='';while(/\d/.test(text[i]||''))s+=text[i++];if(s==='')return bad(i,'expected newer version of sed');cmd.a2={t:c==='+'?'plus':'mult',n:+s}}
        else{const r2=addr();if(r2&&r2.err)return r2;if(!r2||r2.a.t==='step'){if(r2)cmd.a2={t:'n',n:r2.a.n};else return bad(Math.min(i+1,n),'unexpected `,\'')}else cmd.a2=r2.a}}}
    ws();
    if(text[i]==='!'){cmd.neg=true;i++;ws();if(text[i]==='!'){i++;return bad(i,'multiple `!\'s')}}
    if(i>=n)return bad(i,'missing command');
    const c=text[i++];cmd.c=c;
    if(cmd.a1&&cmd.a1.t==='n'&&cmd.a1.n===0&&!(cmd.a2&&cmd.a2.t==='re'))return bad(i,'invalid usage of line address 0');
    if(cmd.a1&&cmd.a1.t==='n'&&cmd.a1.n===0)cmd.a1={t:'zero'};
    if(c==='\n'||c===';')return bad(i,'missing command');
    if(c==='#')return bad(i,'comments don\'t accept any addresses');
    if(c==='{'){blocks.push(cmds.length);cmd.at=i-1;cmds.push(cmd);continue}
    if(c==='}'){if(!blocks.length)return bad(i,'unexpected `}\'');if(cmd.a1)return bad(i,'} doesn\'t want any addresses');
      cmds[blocks.pop()].end=cmds.length;cmds.push(cmd);r=endCmd();if(r)return r;continue}
    if(c===':'){if(cmd.a1)return bad(i,': doesn\'t want any addresses');cmd.label=label();if(!cmd.label)return bad(i,'":" lacks a label');r=endCmd();if(r)return r;cmds.push(cmd);continue}
    if('=dpnz'.includes(c)){r=endCmd();if(r)return r;cmds.push(cmd);continue}
    if(c==='q'||c==='Q'){if(cmd.a2)return bad(i,'command only uses one address');ws();let s='';while(/\d/.test(text[i]||''))s+=text[i++];cmd.code=s===''?null:+s;r=endCmd();if(r)return r;cmds.push(cmd);continue}
    if(c==='a'||c==='i'||c==='c'){r=textArg(cmd);if(r)return r;cmds.push(cmd);continue}
    if(c==='b'||c==='t'||c==='T'){cmd.label=label();r=endCmd();if(r)return r;cmds.push(cmd);continue}
    if(c==='y'){const dl=text[i++];if(dl===undefined||dl==='\n'||dl==='\\')return bad(i,'unterminated `y\' command');
      const A=part(dl,'y');if(A===null)return bad(i,'unterminated `y\' command');const B=part(dl,'y');if(B===null)return bad(i,'unterminated `y\' command');
      const un=s=>{let r='';for(let k=0;k<s.length;k++){if(s[k]==='\\'&&k+1<s.length){const d=s[++k];r+=d==='n'?'\n':d==='t'?'\t':d}else r+=s[k]}return [...r]};
      const x=un(A),yv=un(B);if(x.length!==yv.length)return bad(i,'strings for `y\' command are different lengths');
      cmd.map=new Map();x.forEach((ch,k)=>{if(!cmd.map.has(ch))cmd.map.set(ch,yv[k])});r=endCmd();if(r)return r;cmds.push(cmd);continue}
    if(c==='s'){const dl=text[i++];if(dl===undefined||dl==='\n'||dl==='\\')return bad(i,'unterminated `s\' command');
      const re=part(dl,true);if(re===null)return bad(i,'unterminated `s\' command');
      const rp=part(dl,'rp');if(rp===null)return bad(i,'unterminated `s\' command');
      let g=false,p=false,num=null,fl='';
      for(;;){const f=text[i];if(i>=n||f==='\n'||f===';'||f==='}'||f==='#')break;i++;
        if(f===' '||f==='\t')continue;
        if(f==='g'){if(g)return bad(i,'multiple `g\' options to `s\' command');g=true;continue}
        if(f==='p'){if(p)return bad(i,'multiple `p\' options to `s\' command');p=true;continue}
        if(f==='i'||f==='I'){fl+='I';continue}if(f==='m'||f==='M'){fl+='M';continue}
        if(/\d/.test(f)){if(num!==null)return bad(i,'multiple number options to `s\' command');let s=f;while(/\d/.test(text[i]||''))s+=text[i++];if(+s===0)return bad(i,'number option to `s\' command may not be zero');num=+s;continue}
        if(f==='w')return unsup('sed s///w');if(f==='e')return unsup('sed s///e');
        return bad(i,'unknown option to `s\'')}
      const rr=regex(re,fl,i);if(rr.err)return rr;
      /* replacement parts: {l:text} {g:N} {cs:'U'|'L'|'E'|'u'|'l'} */
      const parts=[];let lit='',maxRef=0;const flush=()=>{if(lit)parts.push({l:lit});lit=''};
      for(let k=0;k<rp.length;k++){const ch=rp[k];
        if(ch==='\\'&&k+1<rp.length){const d=rp[++k];
          if(/[0-9]/.test(d)){flush();parts.push({g:+d});maxRef=Math.max(maxRef,+d);continue}
          if('ULEul'.includes(d)){flush();parts.push({cs:d});continue}
          lit+=d==='n'?'\n':d==='t'?'\t':d;continue}
        if(ch==='&'){flush();parts.push({g:0});continue}
        lit+=ch}
      flush();
      if(rr.rx&&maxRef>rr.groups)return bad(i,`invalid reference \\${maxRef} on \`s' command's RHS`);
      Object.assign(cmd,{rx:rr.rx,parts,g,p,num:num||1});cmds.push(cmd);continue}
    if(UNSUP.includes(c))return unsup(`sed command '${c}'`);
    return bad(i,`unknown command: \`${c}'`)}
  if(blocks.length)return bad0('unmatched `{\'',cmds[blocks[blocks.length-1]].at);
  const labels=new Map();cmds.forEach((c,k)=>{if(c.c===':'&&!labels.has(c.label))labels.set(c.label,k)});
  for(const c of cmds)if('btT'.includes(c.c)&&c.c){if(c.label===''){c.to=cmds.length;continue}if(!labels.has(c.label))return {err:`sed: can't find label for jump to \`${c.label}'`,code:4};c.to=labels.get(c.label)}
  return {prog:{cmds,quiet:!!o.quiet}}}

/* ---- runner ---- */
/* a subject too long for the regex (SQ.reGuard) is a runtime error: 'sed: pattern too complex for this practice shell' */
const guard=(rx,s,all)=>{try{SQ.reGuard(rx,s,all)}catch(e){if(e&&e.complex)throw Object.assign(new Error(e.message),{sedRt:true});throw e}};
function caseText(parts,m){let o='',mode='',one='';
  const add=t=>{if(!t)return;if(mode==='U')t=t.toUpperCase();else if(mode==='L')t=t.toLowerCase();
    if(one){t=(one==='u'?t[0].toUpperCase():t[0].toLowerCase())+t.slice(1);one=''}o+=t};
  for(const p of parts){if(p.l!==undefined)add(p.l);else if(p.g!==undefined)add(m[p.g]===undefined?'':m[p.g]);
    else if(p.cs==='U'||p.cs==='L'){mode=p.cs;one=''}else if(p.cs==='E'){mode='';one=''}else one=p.cs}
  return o}
function subst(s,rx,c){let pos=0,last=0,prevEnd=-1,k=0,did=false,o='';guard(rx,s,c.g||c.num>1);
  while(pos<=s.length){rx.lastIndex=pos;const m=rx.exec(s);if(!m)break;const st=m.index,en=st+m[0].length;
    if(st===en&&st===prevEnd){pos=st+1;continue}
    k++;if(k===c.num||(c.g&&k>c.num)){o+=s.slice(last,st)+caseText(c.parts,m);last=en;did=true;if(!c.g)break}
    prevEnd=en;pos=en>st?en:st+1}
  return did?o+s.slice(last):null}
/* streams: arrays of lines (one per file with -s/-i, else one). Returns {outs: [output lines per stream], quit: q/Q exit code or null, stop: q/Q/n ended the run,
   full: output passed LIM.TEXT}. Throws SQ.StepLimit at a cap, or an Error with .sedRt for a runtime sed error. */
function sedExec(prog,streams,o){const cmds=prog.cmds,quiet=!!(o.n||prog.quiet);let lastRe=null,quit=null,stop=false,branches=0,outLen=0,full=false;
  for(const c of cmds){c.active=c.a1&&c.a1.t==='zero';c.end2=0}
  const outs=[];
  for(const L of streams){const out=[];outs.push(out);if(stop||full)continue;
    const emit=t=>{out.push(t);outLen+=t.length+1;if(outLen>SQ.LIM.TEXT)full=true};
    let j=0;
    while(j<L.length&&!stop&&!full){
      let ps=L[j],tflag=false,del=false;const app=[];
      const isLast=()=>j===L.length-1;
      const test=(a)=>{const no=j+1;
        if(a.t==='n')return no===a.n;if(a.t==='last')return isLast();
        if(a.t==='step')return a.step<=0?no===a.n:no>=a.n&&(no-a.n)%a.step===0;
        if(a.t==='re'){const rx=a.rx||lastRe;if(!rx)throw Object.assign(new Error('no previous regular expression'),{sedRt:true});lastRe=rx;guard(rx,ps,false);rx.lastIndex=0;return rx.test(ps)}
        return false};
      const match=(c)=>{if(!c.a1)return true;let hit;
        if(!c.a2)hit=test(c.a1);
        else{const no=j+1;
          if(!c.active){
            if(!test(c.a1))hit=false;
            else{hit=true;const a=c.a2;
              if(a.t==='n'){if(a.n>no){c.active=true;c.end2=a.n}}
              else if(a.t==='plus'){if(a.n>0){c.active=true;c.end2=no+a.n}}
              else if(a.t==='mult'){if(a.n>0&&no%a.n!==0){c.active=true;c.end2=Math.ceil(no/a.n)*a.n}}
              else if(a.t==='last'){if(!isLast())c.active=true}
              else c.active=true}}
          else{hit=true;const a=c.a2;
            if(a.t==='re'){if(test(a))c.active=false}
            else if(a.t==='last'){if(isLast())c.active=false}
            else if(no>=c.end2){c.active=false;if(no>c.end2)hit=false}
}}
        return c.neg?!hit:hit};
      let pc=0,steps=0;
      cycle:while(pc<cmds.length){
        if(++steps>CYCLE_CAP)throw new SQ.StepLimit();
        const c=cmds[pc];
        if(c.c==='}'||c.c===':'){pc++;continue}
        if(!match(c)){pc=c.c==='{'?c.end+1:pc+1;continue}
        switch(c.c){
          case '{':break;
          case '=':emit(String(j+1));break;
          case 'a':if(c.text!==null)app.push(c.text);break;
          case 'i':if(c.text!==null)emit(c.text);break;
          case 'c':if(!(c.a2&&!c.neg&&c.active)&&c.text!==null)emit(c.text);del=true;break cycle;
          case 'd':del=true;break cycle;
          case 'p':emit(ps);break;
          case 'z':ps='';break;
          case 'n':if(j+1<L.length){if(!quiet)emit(ps);for(const t of app)emit(t);app.length=0;j++;ps=L[j]}else{stop=true;break cycle}break;
          case 'q':stop=true;quit=c.code;break cycle;
          case 'Q':stop=true;quit=c.code;del=true;app.length=0;break cycle;
          case 'y':{let r='';for(const ch of ps)r+=c.map.has(ch)?c.map.get(ch):ch;ps=r;break}
          case 's':{const rx=c.rx||lastRe;if(!rx)throw Object.assign(new Error('no previous regular expression'),{sedRt:true});lastRe=rx;
            const r=subst(ps,rx,c);if(r!==null){ps=r;tflag=true;if(ps.length>SQ.LIM.VAR)throw new SQ.StepLimit('a value grew too large');if(c.p)emit(ps)}break}
          case 'b':case 't':case 'T':{let go=c.c==='b';if(c.c==='t'){go=tflag;tflag=false}else if(c.c==='T'){go=!tflag;tflag=false}
            if(go){if(++branches>BRANCH_CAP)throw new SQ.StepLimit();pc=c.to;continue cycle}break}}
        pc++}
      if(!del&&!quiet)emit(ps);
      for(const t of app)emit(t);
      j++}
    if(stop)break}
  return {outs,quit,stop,full}}

function sedRun(script,text,o){o=o||{};const comp=sedCompile([script],{E:!!o.E});
  if(comp.err)return {out:'',code:1,err:comp.err};
  const L=text===''?[]:text.split('\n');
  try{const r=sedExec(comp.prog,[L],{n:!!o.n});return {out:r.outs[0].join('\n'),code:r.quit||0}}
  catch(e){if(e&&e.sedRt)return {out:'',code:4,err:'sed: '+e.message};throw e}}

Object.assign(SQ,{sedCompile,sedExec,sedRun,sedToJs:toJs});
})(window.SQ = window.SQ || {});
