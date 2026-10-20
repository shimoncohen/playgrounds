(function (SQ) {
const S=SQ.S;
const {HOME,D,F,norm,getNode,parentOf,bname,disp,join,clone,markTree,mkdirp,cmpName,sortedKeys,realPath,lstat,isLoop,modeOf,defMode,modeString,M,ok,E,lines,globRe,flags,readInputs,paint,parseN}=SQ;
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
  cd(a){if(a.length>1)return E('bash: cd: too many arguments');let t=a[0];if(t===undefined){if(!SQ.isSet('HOME'))return E('bash: cd: HOME not set');t=SQ.getVar('HOME')}let show='';if(t==='-'){t=S.oldpwd;show=t}
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
  /* flags -n -e -E (alone or combined) are consumed; -e expands \n \t \\ \0nnn \xHH. -n has no visible effect: output text never carries a trailing newline. Other dashes stay literal. */
  echo(a){let x=a.slice(),e=false;while(x.length&&/^-[neE]+$/.test(x[0])){for(const f of x[0].slice(1))if(f==='e')e=true;else if(f==='E')e=false;x.shift()}
    let s=x.join(' ');if(e)s=s.replace(/\\(0[0-7]{0,3}|x[0-9a-fA-F]{1,2}|[nt\\])/g,(m,c)=>c==='n'?'\n':c==='t'?'\t':c==='\\'?'\\':c[0]==='x'?String.fromCharCode(parseInt(c.slice(1),16)):String.fromCharCode(parseInt(c.slice(1)||'0',8)));
    return ok(s)},
  cat(a,io){const {rest}=flags(a);const {src,err}=readInputs(rest,io,'cat');return {out:src.map(s=>s.text).join('\n'),err,code:err.length?1:0}},
  rm(a){const {fl,rest}=flags(a);const r=fl.has('r')||fl.has('R'),f=fl.has('f');if(!rest.length)return f?ok():E('rm: missing operand');const err=[];const tips=[];
    for(const t of rest){const abs=realPath(norm(t),false)||norm(t),rcwd=realPath(S.cwd,true)||S.cwd;
      if(abs==='/'||abs===HOME||HOME.startsWith(abs+'/')){err.push(`rm: refusing to remove '${t}': that would wipe out your whole world`);continue}
      if(rcwd===abs||rcwd.startsWith(abs+'/')){err.push(`rm: you are standing inside '${t}'. cd out of it first.`);continue}
      const n=lstat(abs);if(!n){if(!f)err.push(`rm: cannot remove '${t}': No such file or directory`);continue}
      if(n.type==='dir'&&!r){err.push(`rm: cannot remove '${t}': Is a directory`);tips.push(`Tip: folders need -r (recursive): rm -r ${t}`);continue}
      if(SQ.rt.fdTab&&SQ.fdNode(abs)){err.push(`rm: cannot remove '${t}': Permission denied`);continue} /* a <( ) file (fs.js fdTable) is read-only */
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
  grep:null, /* defined in cmds-text.js; the key stays here so command suggestions keep their order */
  sort(a,io){const o={n:0,r:0,u:0,t:null,keys:[]},rest=[],bad=m=>Object.assign(E(m),{code:2}),uns=x=>bad(`this practice shell does not support sort ${x} yet`);let end=false;
    for(let i=0;i<a.length;i++){const x=a[i];
      if(end||x.length<2||x[0]!=='-'){rest.push(x);continue}
      if(x==='--'){end=true;continue}
      if(x[0]==='-'&&x[1]==='-')return uns(x.split('=')[0]);
      for(let j=1;j<x.length;j++){const ch=x[j];
        if(ch==='n'||ch==='r'||ch==='u')o[ch]=1;
        else if(ch==='t'||ch==='k'){let v=x.slice(j+1);if(!v){if(i+1>=a.length)return bad(`sort: option requires an argument -- '${ch}'`);v=a[++i]}
          if(ch==='t'){if(v.length!==1)return bad(`sort: multi-character tab '${v}'`);o.t=v}
          else{const m=v.match(/^(\d+)([A-Za-z]*)(?:,(\d+)([A-Za-z]*))?$/);if(!m||+m[1]<1||(m[3]!==undefined&&+m[3]<1))return bad(`sort: invalid number at field start: invalid count at start of '${v}'`);
            const mods={n:0,r:0,any:false};for(const x of m[2]+(m[4]||'')){if(x==='n'||x==='r'){mods[x]=1;mods.any=true}else if(x==='b')mods.any=true;else return uns('key modifier '+x)}
            const f=+m[1],l=m[3]!==undefined?+m[3]:0;o.keys.push([l&&l<f?f:f,l&&l<f?f:l,mods])}
          break}
        else if('fbhMoscgVdiRSTzm'.includes(ch))return uns('-'+ch);
        else return bad(`sort: invalid option -- '${ch}'`)}}
    const {src,err}=readInputs(rest,io,'sort');let L=[].concat(...src.map(s=>lines(s.text)));
    const fld=ln=>o.t!==null?ln.split(o.t):ln.trim().split(/\s+/);
    const key=(ln,[f,l])=>{const F=fld(ln);return F.slice(f-1,l||undefined).join(o.t!==null?o.t:' ')};
    const base=(x,y)=>o.n?(parseFloat(x)||0)-(parseFloat(y)||0)||x.localeCompare(y):x.localeCompare(y);
    const cmp=(x,y)=>{for(const k of o.keys){const kx=key(x,k),ky=key(y,k);const md=k[2],num=md.any?md.n:o.n,rev=md.any?md.r:o.r,d=num?(parseFloat(kx)||0)-(parseFloat(ky)||0):kx.localeCompare(ky);if(d)return rev?-d:d}
      if(o.keys.length)return o.r?y.localeCompare(x):x.localeCompare(y);return o.r?-base(x,y):base(x,y)};
    L.sort(cmp);
    if(o.u)L=L.filter((x,i)=>L.indexOf(x)===i);return {out:L.join('\n'),err,code:err.length?2:0}},
  uniq(a,io){const {fl,rest}=flags(a);const {src,err}=readInputs(rest.slice(0,1),io,'uniq');const L=src.length?lines(src[0].text):[];const g=[];
    for(const x of L){if(g.length&&g[g.length-1][0]===x)g[g.length-1][1]++;else g.push([x,1])}
    const shown=g.filter(([,n])=>fl.has('d')?(fl.has('u')?false:n>1):fl.has('u')?n===1:true); /* -d: only repeated lines, -u: only lines that are not repeated, both: none */
    return {out:shown.map(([x,n])=>fl.has('c')?String(n).padStart(7)+' '+x:x).join('\n'),err,code:err.length?1:0}},
  find:null, /* defined in cmds-sys.js; the key stays here so command suggestions keep their order */
  tree(a,io){const {fl,rest}=flags(a);const t=rest[0]||'.';const n=getNode(norm(t));if(!n)return E(`tree: '${t}': No such file or directory`);if(n.type!=='dir')return ok(t);
    const out=[io.tty?M('d',t):t];let dc=0,fc=0;
    (function rec(node,pre){const ks=sortedKeys(node).filter(k=>fl.has('a')||!k.startsWith('.'));ks.forEach((k,i)=>{const last=i===ks.length-1,c=node.children[k];
      out.push(pre+(last?'└── ':'├── ')+paint(k,c,io.tty));if(c.type==='dir'){dc++;rec(c,pre+(last?'    ':'│   '))}else fc++})})(n,'');
    out.push('',`${dc} director${dc===1?'y':'ies'}, ${fc} file${fc===1?'':'s'}`);return ok(out.join('\n'))},
  chmod(a){if(a.length<2)return E("chmod: missing operand. Example: chmod +x pack.sh");const mode=a[0];if(/^-[RvcfHh]+$|^--/.test(mode))return E(`this practice shell does not support chmod ${mode.startsWith('--')?'--long options':mode.slice(0,2)} yet`);const ch=parseMode(mode);
    if(ch===false)return E(`chmod: invalid mode: '${mode}'`);if(ch&&ch.msg)return E(ch.msg);
    const err=[];for(const t of a.slice(1)){const abs=norm(t),n=getNode(abs);
      if(!n){const l=lstat(abs);err.push(isLoop(abs)?`chmod: cannot access '${t}': Too many levels of symbolic links`:l&&l.type==='link'?`chmod: cannot operate on dangling symlink '${t}'`:`chmod: cannot access '${t}': No such file or directory`);continue}
      const m=ch(modeOf(n));if(n.type==='file')n.exec=!!(m&0o100);
      if(m===defMode(n))delete n.mode;else n.mode=m;
      SQ.rt.changed.add(abs)}
    return {out:'',err,code:err.length?1:0}},
  export(a){if(!a.length)return ok(Object.keys(S.exp||{}).sort().map(k=>`declare -${SQ.isRO(k)?'r':''}x ${k}="${SQ.getVar(k)}"`).join('\n'));const err=[];
    for(const x of a){const m=x.match(/^([^=]*)(=([\s\S]*))?$/);const k=m[1];if(!/^[A-Za-z_]\w*$/.test(k)||SQ.badName(k)){err.push(`bash: export: \`${x}': not a valid identifier`);continue}
      if(m[2]!==undefined){if(!SQ.canSet(k)){err.push(SQ.roMsg(k));continue}S.vars[k]=m[3]}(S.exp=S.exp||{})[k]=1}
    return {out:'',err,code:err.length?1:0}},
  env(){const L={};for(const k of ['HOME','USER','SHELL','HOSTNAME','PATH','PWD'])if(SQ.isSet(k))L[k]=SQ.getVar(k);
    for(const k of Object.keys(S.exp||{}))if(SQ.own(S.vars,k))L[k]=S.vars[k];
    return ok(Object.keys(L).sort().map(k=>k+'='+L[k]).join('\n'))},
  history:()=>ok(S.hist.map((h,i)=>String(i+1).padStart(4)+'  '+h).join('\n')),
  clear:()=>Object.assign(ok(),{clear:true}),
  whoami:()=>ok('explorer'),
  hostname:()=>ok('basecamp'),
  date:null, /* the virtual date: defined in procs.js; the key stays here so command suggestions keep their order */
  bash:null, /* bash and sh (FILE, -c, -n, -x, ...): defined in cmds-opts.js; the keys stay here so command suggestions keep their order */
  sh:null,
  /* the commands by tier, in the order the chapters teach them (any argument prints the same list) */
  help:()=>ok(['Commands in this practice shell, by tier:',
    'Beginner',
    '  Look around   pwd  ls  cd  tree  cat',
    '  Create        mkdir  touch  echo',
    '  Organize      cp  mv  rm  rmdir',
    '  Read          head  tail  wc  grep  sort  uniq',
    '  Search        find',
    '  Scripts       NAME=value  chmod  bash  ./file  for … do … done',
    'Intermediate',
    '  Text          cut  tr  sed  tee  printf  seq  diff  xargs',
    '  Quoting       $( )  \'…\'  "…"  export  env  printenv  $?',
    '  Streams       2>  2>&1  /dev/null',
    '  Files         ln -s  stat  chmod 755  basename  dirname  realpath',
    '  Lookup        which  type  command -v',
    'Advanced',
    '  Decisions     if  case  [ ]  [[ ]]  test  true  false',
    '  Loops         while  until  for  break  continue  $(( ))  (( ))',
    '  Functions     name() { … }  local  return  shift  $1  $@  $#',
    '  Scripts       nano  read  source  exit  unset  readonly  <<EOF',
    'Expert',
    '  awk & sed     awk  sed -n -i -E  grep -E -o -w -r -A -B',
    '  More text     tac  nl  paste  comm  find -exec  xargs -I -P  <( )',
    '  Processes     ps  sleep  &  $!  jobs  wait  kill  trap  timeout',
    '  Safe scripts  set -euo pipefail  set -x  getopts  mktemp',
    'Other           history  clear  whoami  hostname  date  man <command>',
    'Symbols:  |  >  >>  <  &&  ||  ;  &  *  ?  ~  .  ..',
    'Try: man awk'].join('\n')),
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
      ops.push([o[0],who?(c[1]?who:mask):mask,bits,c[1]?who:0o777])}}
  return old=>{let v=old;for(const [op,w,bits,cw] of ops){const b=bits&w;v=op==='+'?v|b:op==='-'?v&~b:(v&~cw)|b}return v}}
/* head/tail: -n N (also -nN, -N; tail -n +N), and -c N bytes (head -c -N: all but the last N; tail -c +N: from byte N). The last of -n and -c wins.
   Bytes are the characters of this practice shell's text, counting the newline that ends each line (also the last); a K/M/G suffix is not supported. */
function headTail(a,io,cmd){let mode='n',cv=null;const na=[];
  for(let i=0;i<a.length;i++){const x=a[i];
    if(x==='-c'||/^-c./.test(x)){
      let v=x==='-c'?a[++i]:x.slice(2);
      if(v===undefined)return E(`${cmd}: option requires an argument -- 'c'`);
      if(/^[+-]?\d+[bkKmMgGtTPEZYR]/.test(v))return E(`this practice shell does not support ${cmd} -c with a size suffix yet`);
      if(!(cmd==='tail'?/^[+-]?\d+$/:/^-?\d+$/).test(v))return E(`${cmd}: invalid number of bytes: '${v}'`);
      mode='c';cv=v;continue}
    if(x==='-n'){na.push(x,a[++i]);mode='n';continue}
    if(/^-n\d+$/.test(x)||/^-\d+$/.test(x))mode='n';
    na.push(x)}
  const {n,rest,bad}=parseN(na);if(bad)return E(`${cmd}: invalid number of lines`);const {src,err}=readInputs(rest,io,cmd);
  if(mode==='c'){const sec=src.map(s=>{const t=s.text===''?'':s.text+'\n',len=t.length;let part; /* a file's last line ends in a newline, a byte like any other */
      if(cmd==='head'){const k=parseInt(cv,10);part=k<0?t.slice(0,Math.max(0,len+k)):t.slice(0,k)}
      else if(cv[0]==='+'){const k=parseInt(cv,10);part=t.slice(Math.max(0,k-1))}
      else{const k=Math.abs(parseInt(cv,10));part=k?t.slice(Math.max(0,len-k)):''}
      return (src.length>1?`==> ${s.name} <==\n`:'')+part});
    return {out:sec.join('\n').replace(/\n$/,''),err,code:err.length?1:0}}
  const out=[];
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
    const rs=realPath(sabs,!move)||sabs,rcwd=realPath(S.cwd,true)||S.cwd;
    if(sn.type==='dir'){const dp=realPath(parentOf(tabs)[2],true);if(dp&&(dp===rs||dp.startsWith(rs==='/'?'/':rs+'/'))){err.push(move?`mv: cannot move '${s}' to a subdirectory of itself, '${dest}${into?'/'+bname(sabs):''}'`:`cp: cannot copy a directory, '${s}', into itself, '${dest}${into?'/'+bname(sabs):''}'`);continue}}
    if(move&&(rcwd===rs||rcwd.startsWith(rs+'/'))){err.push(`mv: you are standing inside '${s}'. cd out of it first.`);continue}
    const ex=getNode(tabs);if(ex&&ex.type==='dir'){err.push(`${nm}: cannot overwrite directory '${disp(tabs)}'`);continue}
    const [par,name]=parentOf(tabs);if(!par||par.type!=='dir'){err.push(`${nm}: cannot create '${dest}': No such file or directory`);continue}
    const fds=!!SQ.rt.fdTab&&!!SQ.fdNode(sabs),fdm=move&&fds; /* a <( ) file (fs.js fdTable): mv copies it and the original cannot go, as in bash */
    const copy=move&&!fdm?sn:clone(sn);if(fds)delete copy.mode; /* the copy is an ordinary file (0644), not read-only like the source */
    if(!move){const sz=SQ.stateText(copy);if(sz>1000&&SQ.stateText(S.fs)+sz>SQ.LIM.STATE){err.push(`cp: ${dest}: file too large for this practice shell`);continue}} /* the saved-state cap, as writeFile applies it to a big write */
    if(fdm)err.push(`mv: cannot remove '${s}': Permission denied`);
    else if(move){const [sp,sname,spp]=parentOf(sabs);delete sp.children[sname];SQ.rt.changed.add(spp)}
    par.children[name]=copy;markTree(tabs,copy,!move||fdm);SQ.grewCheck()}
  return {out:'',err,code:err.length?1:0,tips}}

/* nano/edit/vi/vim FILE: no file is made here; the page opens its editor on the absolute path and Save writes it */
function editorCmd(name){return a=>{const {rest}=flags(a);if(!rest.length)return E(`${name}: missing file operand`,1);const t=rest[0];
  if(t.length>4096||t.split('/').some(x=>x.length>255))return E(`${name}: ${t.length>80?t.slice(0,80)+'...':t}: File name too long`,1);
  const abs=norm(t),n=getNode(abs);
  if(n&&n.type==='dir')return E(`${name}: ${t}: Is a directory`,1);
  if(!n){const [par]=parentOf(abs);if(!par||par.type!=='dir')return E(`${name}: cannot create '${t}': No such file or directory`,1)}
  return {out:'',err:[],code:0,ui:{edit:abs,isNew:!n}}}}
for(const n of ['nano','edit','vi','vim'])CMDS[n]=editorCmd(n);
const FRIENDLY={
  code:'code opens VS Code, which this practice shell does not have. Use its own small editor instead: nano FILE.',
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
function suggest(n){if(n.length>64)return null; /* Levenshtein is length x length: a huge word gets no suggestion */let best=null,bd=3;for(const c of Object.keys(CMDS)){if(SQ.own(FRIENDLY,c)||c==='edit'||c==='set')continue; /* never set: its neighbours (let, sed, get) are other commands */const d=lev(n.toLowerCase(),c);if(d<bd){bd=d;best=c}}return n.length>1&&bd<=(n.length<4?1:2)?best:null}
Object.assign(SQ,{CMDS,headTail,copyMove,FRIENDLY,lev,suggest});
})(window.SQ = window.SQ || {});
