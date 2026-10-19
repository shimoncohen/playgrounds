(function (SQ) {
const S=SQ.S;
const {HOME,D,F,norm,getNode,parentOf,bname,disp,join,clone,markTree,mkdirp,cmpName,sortedKeys,lstat,isLoop,modeOf,defMode,modeString,M,ok,E,lines,globRe,flags,readInputs,paint,parseN}=SQ;
const CMDS={
  pwd:()=>ok(S.cwd),
  ls(a,io){const {fl,rest}=flags(a);const all=fl.has('a')||fl.has('A'),long=fl.has('l');const targets=rest.length?rest:['.'];const err=[];let code=0;
    const fmt=(name,n)=>long?`${modeString(n)}  explorer  ${String(n.type==='dir'?4096:n.type==='link'?n.target.length:n.content.length).padStart(5)}  ${paint(name,n,io.tty)}${n.type==='link'?' -> '+n.target:''}`:paint(name,n,io.tty);
    const jn=arr=>arr.join(long||!io.tty?'\n':'  ');const files=[],dirs=[],blocks=[];
    for(const t of targets){let n=long?lstat(norm(t)):getNode(norm(t));if(!n){err.push(isLoop(norm(t))?`ls: cannot access '${t}': Too many levels of symbolic links`:`ls: cannot access '${t}': No such file or directory`);code=2;continue}(n.type==='dir'?dirs:files).push([t,n])}
    if(files.length)blocks.push(jn(files.map(([t,n])=>fmt(t,n))));
    for(const [t,n] of dirs){let ents=Object.keys(n.children).filter(k=>all||!k.startsWith('.')).sort(cmpName).map(k=>fmt(k,n.children[k]));
      if(fl.has('a'))ents=[fmt('.',n),fmt('..',D())].concat(ents);
      let body=jn(ents);if(targets.length>1)body=t+':'+(body?'\n'+body:'');blocks.push(body)}
    return {out:blocks.filter(b=>b!=='').join(targets.length>1?'\n\n':'\n'),err,code}},
  cd(a){if(a.length>1)return E('bash: cd: too many arguments');let t=a[0];if(t===undefined)t=HOME;let show='';if(t==='-'){t=S.oldpwd;show=t}
    const abs=norm(t),n=getNode(abs);if(!n)return E(isLoop(abs)?`bash: cd: ${a[0]}: Too many levels of symbolic links`:`bash: cd: ${a[0]}: No such file or directory`);if(n.type!=='dir')return E(`bash: cd: ${a[0]}: Not a directory`);
    S.oldpwd=S.cwd;S.cwd=abs;return ok(show)},
  mkdir(a){const {fl,rest}=flags(a);if(!rest.length)return E('mkdir: missing operand');const err=[];
    for(const t of rest){const abs=norm(t);if(getNode(abs)){if(!fl.has('p'))err.push(`mkdir: cannot create directory '${t}': File exists`);continue}
      if(fl.has('p')){const bad=mkdirp(abs);if(bad)err.push(`mkdir: cannot create directory '${t}': Not a directory`);continue}
      const [par,name]=parentOf(abs);if(!par||par.type!=='dir'){err.push(`mkdir: cannot create directory '${t}': No such file or directory`);continue}
      par.children[name]=D();SQ.rt.changed.add(abs)}
    const r={out:'',err,code:err.length?1:0};if(err.some(e=>e.endsWith('No such file or directory')))r.tips=['Tip: add -p to create the missing folders along the way.'];return r},
  touch(a){if(!a.length)return E('touch: missing file operand');const err=[];for(const t of a){const abs=norm(t);if(getNode(abs)){SQ.rt.changed.add(abs);continue}
      const [par,name]=parentOf(abs);if(!par||par.type!=='dir'){err.push(`touch: cannot touch '${t}': No such file or directory`);continue}par.children[name]=F('');SQ.rt.changed.add(abs)}
    return {out:'',err,code:err.length?1:0}},
  echo(a){let x=a.slice();while(x[0]==='-n'||x[0]==='-e')x.shift();return ok(x.join(' '))},
  cat(a,io){const {rest}=flags(a);const {src,err}=readInputs(rest,io,'cat');return {out:src.map(s=>s.text).join('\n'),err,code:err.length?1:0}},
  rm(a){const {fl,rest}=flags(a);const r=fl.has('r')||fl.has('R'),f=fl.has('f');if(!rest.length)return f?ok():E('rm: missing operand');const err=[];const tips=[];
    for(const t of rest){const abs=norm(t);
      if(abs==='/'||abs===HOME||HOME.startsWith(abs+'/')){err.push(`rm: refusing to remove '${t}': that would wipe out your whole world`);continue}
      if(S.cwd===abs||S.cwd.startsWith(abs+'/')){err.push(`rm: you are standing inside '${t}'. cd out of it first.`);continue}
      const n=lstat(abs);if(!n){if(!f)err.push(`rm: cannot remove '${t}': No such file or directory`);continue}
      if(n.type==='dir'&&!r){err.push(`rm: cannot remove '${t}': Is a directory`);tips.push(`Tip: folders need -r (recursive): rm -r ${t}`);continue}
      const [par,name,pp]=parentOf(abs);delete par.children[name];SQ.rt.changed.add(pp)}
    return {out:'',err,code:err.length?1:0,tips}},
  rmdir(a){if(!a.length)return E('rmdir: missing operand');const err=[];for(const t of a){const abs=norm(t),n=getNode(abs);
      if(!n){err.push(`rmdir: failed to remove '${t}': No such file or directory`);continue}if(n.type!=='dir'){err.push(`rmdir: failed to remove '${t}': Not a directory`);continue}
      if(Object.keys(n.children).length){err.push(`rmdir: failed to remove '${t}': Directory not empty`);continue}
      if(S.cwd===abs||S.cwd.startsWith(abs+'/')){err.push(`rmdir: you are standing inside '${t}'. cd out of it first.`);continue}
      const [par,name,pp]=parentOf(abs);delete par.children[name];SQ.rt.changed.add(pp)}return {out:'',err,code:err.length?1:0}},
  cp(a){return copyMove(a,false)},
  mv(a){return copyMove(a,true)},
  head(a,io){return headTail(a,io,'head')},
  tail(a,io){return headTail(a,io,'tail')},
  wc(a,io){const {fl,rest}=flags(a);const {src,err}=readInputs(rest,io,'wc');const out=[];
    const pick=['l','w','c'].filter(x=>fl.has(x)||(x==='c'&&fl.has('m')));
    for(const s of src){const L=lines(s.text).length,W=s.text.split(/\s+/).filter(Boolean).length,C=s.text.length+(s.text?1:0);
      const vals={l:L,w:W,c:C};const cols=(pick.length?pick:['l','w','c']).map(k=>pick.length===1?String(vals[k]):String(vals[k]).padStart(4));
      out.push(cols.join(pick.length===1?'':' ')+(s.name?' '+s.name:''))}
    return {out:out.join('\n'),err,code:err.length?1:0}},
  grep(a,io){const {fl,rest}=flags(a);if(!rest.length)return E('usage: grep [-i] [-n] [-c] [-v] PATTERN [FILE...]',2);const pat=rest.shift();
    const fg=fl.has('i')?'gi':'g';let re;try{re=new RegExp(pat,fg)}catch(e){re=new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),fg)}
    const {src,err}=readInputs(rest,io,'grep');const multi=src.length>1;const out=[];let total=0;
    for(const s of src){let cnt=0;lines(s.text).forEach((ln,i)=>{re.lastIndex=0;const hit=re.test(ln);if(hit!==fl.has('v')){cnt++;
        if(!fl.has('c')){let txt=ln;if(io.tty&&!fl.has('v')&&pat){re.lastIndex=0;txt=ln.replace(re,m=>M('m',m))}
          const pre=(multi?(io.tty?M('f',s.name):s.name)+':':'')+(fl.has('n')?(io.tty?M('n',String(i+1)):String(i+1))+':':'');out.push(pre+txt)}}});
      if(fl.has('c'))out.push((multi?s.name+':':'')+cnt);total+=cnt}
    return {out:out.join('\n'),err,code:err.length?2:total?0:1}},
  sort(a,io){const {fl,rest}=flags(a);const {src,err}=readInputs(rest,io,'sort');let L=[].concat(...src.map(s=>lines(s.text)));
    if(fl.has('n'))L.sort((x,y)=>(parseFloat(x)||0)-(parseFloat(y)||0)||x.localeCompare(y));else L.sort((x,y)=>x.localeCompare(y));
    if(fl.has('r'))L.reverse();if(fl.has('u'))L=L.filter((x,i)=>L.indexOf(x)===i);return {out:L.join('\n'),err,code:err.length?2:0}},
  uniq(a,io){const {fl,rest}=flags(a);const {src,err}=readInputs(rest.slice(0,1),io,'uniq');const L=src.length?lines(src[0].text):[];const g=[];
    for(const x of L){if(g.length&&g[g.length-1][0]===x)g[g.length-1][1]++;else g.push([x,1])}
    return {out:g.map(([x,n])=>fl.has('c')?String(n).padStart(7)+' '+x:x).join('\n'),err,code:err.length?1:0}},
  find(a){let start='.',i=0;if(a[0]&&!a[0].startsWith('-')){start=a[0];i=1}let rx=null,type=null;
    for(;i<a.length;i++){const p=a[i];if(p==='-name'||p==='-iname'){const v=a[++i];if(v==null)return E(`find: missing argument to '${p}'`);rx=globRe(v,p==='-iname')}
      else if(p==='-type'){type=a[++i];if(type!=='f'&&type!=='d'&&type!=='l')return E(`find: unknown argument to -type: ${type}`)}
      else{const r=E(`find: paths must come before the search options: '${p}'`);if(/[*?]/.test(a.join('')))r.tips=['Tip: put quotes around the pattern, like -name "*.txt", so the shell leaves the * for find.'];return r}}
    const root=getNode(norm(start));if(!root)return E(`find: '${start}': No such file or directory`);const out=[];
    (function walk(n,path,nm){if((!rx||rx.test(nm))&&(!type||n.type===({d:'dir',f:'file',l:'link'})[type]))out.push(path);
      if(n.type==='dir')for(const k of Object.keys(n.children).sort(cmpName))walk(n.children[k],path.replace(/\/$/,'')+'/'+k,k)})(root,start,bname(norm(start)));
    return ok(out.join('\n'))},
  tree(a,io){const {fl,rest}=flags(a);const t=rest[0]||'.';const n=getNode(norm(t));if(!n)return E(`tree: '${t}': No such file or directory`);if(n.type!=='dir')return ok(t);
    const out=[io.tty?M('d',t):t];let dc=0,fc=0;
    (function rec(node,pre){const ks=sortedKeys(node).filter(k=>fl.has('a')||!k.startsWith('.'));ks.forEach((k,i)=>{const last=i===ks.length-1,c=node.children[k];
      out.push(pre+(last?'└── ':'├── ')+paint(k,c,io.tty));if(c.type==='dir'){dc++;rec(c,pre+(last?'    ':'│   '))}else fc++})})(n,'');
    out.push('',`${dc} director${dc===1?'y':'ies'}, ${fc} file${fc===1?'':'s'}`);return ok(out.join('\n'))},
  chmod(a){if(a.length<2)return E("chmod: missing operand. Example: chmod +x pack.sh");const mode=a[0];const ch=parseMode(mode);
    if(ch===false)return E(`chmod: invalid mode: '${mode}'`);if(ch&&ch.msg)return E(ch.msg);
    const err=[];for(const t of a.slice(1)){const abs=norm(t),n=getNode(abs);
      if(!n){const l=lstat(abs);err.push(isLoop(abs)?`chmod: cannot access '${t}': Too many levels of symbolic links`:l&&l.type==='link'?`chmod: cannot operate on dangling symlink '${t}'`:`chmod: cannot access '${t}': No such file or directory`);continue}
      const m=ch(modeOf(n));if(n.type==='file')n.exec=!!(m&0o100);
      if(m===defMode(n))delete n.mode;else n.mode=m;
      SQ.rt.changed.add(abs)}
    return {out:'',err,code:err.length?1:0}},
  export(a){if(!a.length)return ok(Object.keys(S.exp||{}).sort().map(k=>`declare -x ${k}="${SQ.getVar(k)}"`).join('\n'));const err=[];
    for(const x of a){const m=x.match(/^([^=]*)(=([\s\S]*))?$/);const k=m[1];if(!/^[A-Za-z_]\w*$/.test(k)){err.push(`bash: export: \`${x}': not a valid identifier`);continue}
      if(m[2]!==undefined)S.vars[k]=m[3];(S.exp=S.exp||{})[k]=1}
    return {out:'',err,code:err.length?1:0}},
  env(){const L={};for(const k of ['HOME','USER','SHELL','HOSTNAME','PATH','PWD'])L[k]=SQ.getVar(k);
    for(const k of Object.keys(S.exp||{}))if(k in S.vars)L[k]=S.vars[k];
    return ok(Object.keys(L).sort().map(k=>k+'='+L[k]).join('\n'))},
  history:()=>ok(S.hist.map((h,i)=>String(i+1).padStart(4)+'  '+h).join('\n')),
  clear:()=>Object.assign(ok(),{clear:true}),
  whoami:()=>ok('explorer'),
  hostname:()=>ok('basecamp'),
  date(){const d=new Date(),p=d.toDateString().split(' ');return ok(`${p[0]} ${p[1]} ${p[2]} ${d.toTimeString().slice(0,8)} ${p[3]}`)},
  bash(a,io){if(!a[0])return E('You are already in bash. To run a script, give its name: bash pack.sh');return SQ.runPath(a[0],io,true)},
  sh(a,io){return CMDS.bash(a,io)},
  help:()=>ok(['Commands in this practice shell:',
    '  Look around   pwd  ls  cd  tree  cat',
    '  Create        mkdir  touch  echo',
    '  Organize      cp  mv  rm  rmdir',
    '  Read          head  tail  wc  grep  sort  uniq',
    '  Search        find',
    '  Scripts       NAME=value  chmod  bash  ./file  for … do … done',
    '  Other         history  clear  whoami  date  man <command>',
    'Symbols:  |  >  >>  <  &&  ;  *  ?  ~  .  ..',
    'Try: man grep'].join('\n')),
  man(a){if(!a[0])return E('What manual page do you want? For example: man ls');const g=SQ.GUIDE.find(x=>x.c===a[0]||x.c.split(' ')[0]===a[0]);
    if(!g)return E(`No manual entry for ${a[0]}`);
    return ok([`${g.c.toUpperCase()}`,'',`  ${g.what}`,'','EXAMPLES',...g.ex.map(([c,n])=>`  ${c}${n?'    # '+n:''}`),'',"(Short version. Real man pages are long; on a real computer press q to quit them.)"].join('\n'))}
};
/* chmod mode parser: returns a function old->new, false when invalid, or {msg} when unsupported */
function parseMode(str){let m=str.match(/^0?([0-7]{3})$/);
  if(m){const v=parseInt(m[1],8);return()=>v}
  if(/^[0-7]{4}$/.test(str))return {msg:'this practice shell does not support setuid/setgid/sticky modes yet'};
  const UMASK=0o022,ops=[];
  for(const cl of str.split(',')){const c=cl.match(/^([ugoa]*)((?:[-+=][rwx]*)+)$/);if(!c)return false;
    let who=0;for(const w of c[1]||'a')who|=w==='u'?0o700:w==='g'?0o070:w==='o'?0o007:0o777;
    const mask=c[1]?who:0o777&~UMASK;
    for(const o of c[2].match(/[-+=][rwx]*/g)){let bits=0;for(const p of o.slice(1)){const b=p==='r'?4:p==='w'?2:1;bits|=b*0o111}
      ops.push([o[0],who?(c[1]?who:mask):mask,bits])}}
  return old=>{let v=old;for(const [op,w,bits] of ops){const b=bits&w;v=op==='+'?v|b:op==='-'?v&~b:(v&~w)|b}return v}}
function headTail(a,io,cmd){const {n,rest,bad}=parseN(a);if(bad)return E(`${cmd}: invalid number of lines`);const {src,err}=readInputs(rest,io,cmd);const out=[];
  src.forEach((s,i)=>{const L=lines(s.text);const part=cmd==='head'?L.slice(0,n):(n?L.slice(-n):[]);if(src.length>1)out.push((i?'\n':'')+`==> ${s.name} <==`);out.push(...part)});
  return {out:out.join('\n'),err,code:err.length?1:0}}
function copyMove(a,move){const nm=move?'mv':'cp';const {fl,rest}=flags(a);const r=move||fl.has('r')||fl.has('R');
  if(rest.length<2)return E(rest.length?`${nm}: missing destination file operand after '${rest[0]}'`:`${nm}: missing file operand`);
  const dest=rest.pop(),dabs=norm(dest),dn=getNode(dabs),into=!!dn&&dn.type==='dir';
  if(rest.length>1&&!into)return E(`${nm}: target '${dest}' is not a directory`);const err=[],tips=[];
  for(const s of rest){const sabs=norm(s),sn=move?lstat(sabs):getNode(sabs);
    if(!sn){err.push(isLoop(sabs)?`${nm}: cannot stat '${s}': Too many levels of symbolic links`:`${nm}: cannot stat '${s}': No such file or directory`);continue}
    if(sn.type==='dir'&&!r){err.push(`cp: -r not specified; omitting directory '${s}'`);tips.push(`Tip: copying a folder needs -r: cp -r ${s} ${dest}`);continue}
    const tabs=into?join(dabs,bname(sabs)):dabs;
    if(tabs===sabs){err.push(`${nm}: '${s}' and '${dest}' are the same file`);continue}
    if(sn.type==='dir'&&(tabs+'/').startsWith(sabs+'/')){err.push(`${nm}: cannot ${move?'move':'copy'} '${s}' into itself`);continue}
    if(move&&(S.cwd===sabs||S.cwd.startsWith(sabs+'/'))){err.push(`mv: you are standing inside '${s}'. cd out of it first.`);continue}
    const ex=getNode(tabs);if(ex&&ex.type==='dir'){err.push(`${nm}: cannot overwrite directory '${disp(tabs)}'`);continue}
    const [par,name]=parentOf(tabs);if(!par||par.type!=='dir'){err.push(`${nm}: cannot create '${dest}': No such file or directory`);continue}
    const copy=move?sn:clone(sn);if(move){const [sp,sname,spp]=parentOf(sabs);delete sp.children[sname];SQ.rt.changed.add(spp)}
    par.children[name]=copy;markTree(tabs,copy)}
  return {out:'',err,code:err.length?1:0,tips}}

const FRIENDLY={
  nano:'This practice shell has no text editor. Write files with echo and > (replace) or >> (add a line).',
  vim:'This practice shell has no text editor. Write files with echo and > (replace) or >> (add a line).',
  vi:'This practice shell has no text editor. Write files with echo and > (replace) or >> (add a line).',
  code:'This practice shell has no text editor. Write files with echo and > (replace) or >> (add a line).',
  sudo:'sudo runs a command as the all-powerful admin user. You don\'t need it here, and on a real computer use it only when you know why.',
  exit:'There is nowhere to exit to. Your progress saves automatically.',
  logout:'There is nowhere to exit to. Your progress saves automatically.',
  cls:'cls is the Windows command. In bash, use clear.',
  dir:'dir is the Windows command. In bash, use ls.',
  copy:'copy is the Windows command. In bash, use cp.',
  move:'move is the Windows command. In bash, use mv.',
  del:'del is the Windows command. In bash, use rm.',
  'cd..':'Bash needs a space between cd and the dots: cd ..',
  less:'less pages through long files. This practice shell doesn\'t have it; use head and tail instead.',
  more:'more pages through long files. This practice shell doesn\'t have it; use head and tail instead.'
};
function lev(a,b){const d=[...Array(b.length+1).keys()];for(let i=1;i<=a.length;i++){let p=d[0];d[0]=i;for(let j=1;j<=b.length;j++){const t=d[j];d[j]=Math.min(d[j]+1,d[j-1]+1,p+(a[i-1]===b[j-1]?0:1));p=t}}return d[b.length]}
function suggest(n){let best=null,bd=3;for(const c of Object.keys(CMDS)){const d=lev(n.toLowerCase(),c);if(d<bd){bd=d;best=c}}return n.length>1&&bd<=(n.length<4?1:2)?best:null}
Object.assign(SQ,{CMDS,headTail,copyMove,FRIENDLY,lev,suggest});
})(window.SQ = window.SQ || {});
