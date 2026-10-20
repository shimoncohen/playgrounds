(function (SQ) {
const {norm,getNode,lstat,isLoop,parentOf,bname,modeOf,modeString,ok,E,flags,globRe,cmpName,realPath,HOME}=SQ;
const CMDS=SQ.CMDS;
const KEYWORDS=['if','then','else','elif','fi','case','esac','for','select','while','until','do','done','in','function','time','{','}','!','[[',']]','coproc'];
const BUILTINS=['cd','export','source','.','[','test','true','false',':','read','shift','unset','local','return','exit','break','continue','jobs','wait','kill'];
const known=c=>Object.prototype.hasOwnProperty.call(CMDS,c);

// ---- find ----
/* find [PATH] [-mindepth N] [-maxdepth N] EXPRESSION...   The expression is tests and actions joined by an implied AND, left to right:
     tests    -name GLOB  -iname GLOB  -type f|d|l  -empty
     actions  -print  -print0  -delete  -exec CMD ARG... {} \;   -exec CMD ARG... {} +
   With no action, -print is added. -exec ... \; runs once per match with {} replaced in every argument (the test result is the command's status);
   ... {} + runs once at the end with all the matches in place of the lone {} (find then exits 1 if that run fails). A command that is missing prints
   find: 'CMD': No such file or directory (status 0 for \; and 1 for +, as GNU). -delete removes files, links and empty folders, children first, never
   the start point '.', and refuses what rm refuses (your home or above, a folder you are standing in); a folder that is not empty is reported and kept.
   Every match costs a step to look at (one per 100) and every command run a step. Unsupported (keeps the usual message): -o ! ( -path -prune -newer -size -mtime -perm ... */
CMDS.find=function(a,io){let start='.',i=0;if(a[0]&&!a[0].startsWith('-')&&a[0]!=='!'&&a[0]!=='('){start=a[0];i=1}
  const ex=[];let minD=0,maxD=Infinity,depthFirst=false,action=false;
  const miss=p=>E(`find: missing argument to '${p}'`);
  for(;i<a.length;i++){const p=a[i];
    if(p==='-name'||p==='-iname'){const v=a[++i];if(v==null)return miss(p);ex.push({t:'name',rx:globRe(v,p==='-iname')})}
    else if(p==='-type'){const v=a[++i];if(v==null)return miss(p);if(v!=='f'&&v!=='d'&&v!=='l')return E(`find: unknown argument to -type: ${v}`);ex.push({t:'type',v:({d:'dir',f:'file',l:'link'})[v]})}
    else if(p==='-empty')ex.push({t:'empty'});
    else if(p==='-print'){ex.push({t:'print',z:false});action=true}
    else if(p==='-print0'){ex.push({t:'print',z:true});action=true}
    else if(p==='-delete'){ex.push({t:'delete'});action=true;depthFirst=true}
    else if(p==='-mindepth'||p==='-maxdepth'){const v=a[++i];if(v==null)return miss(p);
      if(!/^\d+$/.test(v))return E(`find: Expected a positive decimal integer argument to ${p}, but got '${v}'`);if(p==='-mindepth')minD=+v;else maxD=+v}
    else if(p==='-exec'){let k=i+1;const tpl=[];let plus=false;
      for(;k<a.length;k++){const w=a[k];if(w===';')break;
        if(w==='+'&&tpl.length&&tpl[tpl.length-1].includes('{}')){
          if(tpl[tpl.length-1]!=='{}')return E(`find: In '-exec ... {} +' the '{}' must appear by itself, but you specified '${tpl[tpl.length-1]}'`);
          plus=true;break}
        tpl.push(w)}
      if(k>=a.length||!tpl.length)return miss('-exec');
      if(plus&&tpl.filter(w=>w.includes('{}')).length>1)return E('find: Only one instance of {} is supported with -exec ... +');
      ex.push({t:'exec',tpl,plus,batch:[]});action=true;i=k}
    else if(p.startsWith('-')||p==='!'||p==='(')return E(`this practice shell does not support find ${p} yet`);
    else{const r=E(`find: paths must come before the search options: '${p}'`);if(/[*?]/.test(a.join('')))r.tips=['Tip: put quotes around the pattern, like -name "*.txt", so the shell leaves the * for find.'];return r}}
  if(!action)ex.push({t:'print',z:false});
  const startAbs=norm(start),root=start.endsWith('/')?getNode(startAbs):lstat(startAbs); /* like find -P: a start point that is a link is listed as itself, unless it ends in / */if(!root)return E(`find: '${start}': No such file or directory`);
  const comps=start.split('/').filter(Boolean),rootName=comps.length?comps[comps.length-1]:'/';
  const err=[],tips=[],hrun=[];let out='',code=0,seen=0,total=0;
  const emit=t=>{out+=t;total+=t.length;if(total>SQ.LIM.TEXT*2)throw new SQ.StepLimit('output too large')};
  const run=(argv,plus)=>{SQ.step();const r=SQ.runArgv(argv,io);
    if(!r){err.push(`find: '${argv[0]}': No such file or directory`);if(plus)code=1;return false}
    if(r.out!=='')emit(r.out+'\n');err.push(...(r.err||[]));tips.push(...(r.tips||[]));
    if(plus&&r.code!==0)code=1;return r.code===0};
  const rcwd=()=>realPath(SQ.S.cwd,true)||SQ.S.cwd;
  const del=(path,n)=>{
    if(path===start&&(rootName==='.'||rootName==='..'))return true; /* the start point . is never removed */
    const abs=realPath(norm(path),false)||norm(path);
    if(abs==='/'||abs===HOME||HOME.startsWith(abs+'/')){err.push(`find: cannot delete '${path}': that would wipe out your whole world`);code=1;return false}
    const rc=rcwd();if(rc===abs||rc.startsWith(abs+'/')){err.push(`find: cannot delete '${path}': you are standing inside it. cd out of it first.`);code=1;return false}
    const cur=lstat(abs);if(!cur)return true;
    if(cur.type==='dir'&&Object.keys(cur.children).length){err.push(`find: cannot delete '${path}': Directory not empty`);code=1;return false}
    const [par,name,pp]=parentOf(abs);delete par.children[name];SQ.rt.changed.add(pp);return true};
  const test=(n,path,name)=>{ /* the expression for one entry: tests until one fails, actions in order */
    for(const e of ex){
      if(e.t==='name'){if(!e.rx.test(name))return}
      else if(e.t==='type'){if(n.type!==e.v)return}
      else if(e.t==='empty'){if(!(n.type==='file'?n.content==='':n.type==='dir'&&!Object.keys(n.children).length))return}
      else if(e.t==='print')emit(path+(e.z?'\0':'\n'));
      else if(e.t==='delete'){if(!del(path,n))return}
      else if(e.t==='exec'){
        if(e.plus){e.batch.push(path);continue}
        if(!run(e.tpl.map(w=>w.split('{}').join(path)),false))return}}};
  const visit=(n,path,name,depth)=>{
    if(++seen%100===0)SQ.step();
    const here=()=>{if(depth>=minD)test(n,path,name)};
    if(!depthFirst)here();
    if(n.type==='dir'&&depth<maxD&&(depth===0||depthFirst||lstat(norm(path))===n||(err.push(`find: '${path}': No such file or directory`),code=1,false)))for(const k of Object.keys(n.children).sort(cmpName)){ /* a folder an -exec just removed is not entered */
      const c=n.children[k];if(c)visit(c,path.replace(/\/$/,'')+'/'+k,k,depth+1)}
    if(depthFirst)here()};
  visit(root,start,rootName,0);
  for(const e of ex)if(e.t==='exec'&&e.plus&&e.batch.length){
    const at=e.tpl.indexOf('{}');run(e.tpl.slice(0,at).concat(e.batch,e.tpl.slice(at+1)),true)}
  if(out.endsWith('\n'))out=out.slice(0,-1);
  const r={out,err,code};if(tips.length)r.tips=tips;return r};

// ---- stat ----
CMDS.stat=function(a){const {rest}=flags(a);if(!rest.length)return E('stat: missing operand');const out=[],err=[];
  for(const t of rest){const abs=norm(t),n=lstat(abs);
    if(!n){err.push(`stat: cannot statx '${t}': No such file or directory`);continue}
    const m=modeOf(n),kind=n.type==='dir'?'directory':n.type==='link'?'symbolic link':'regular file';
    const size=n.type==='dir'?4096:n.type==='link'?n.target.length:n.content.length;
    out.push([`  File: ${t}${n.type==='link'?' -> '+n.target:''}`,`  Size: ${size}\t${kind}`,
      `  Mode: (${'0'+m.toString(8).padStart(3,'0')}/${modeString(n)})  Owner: explorer`].join('\n'))}
  return {out:out.join('\n'),err,code:err.length?1:0}};

// ---- ln (symbolic only) ----
CMDS.ln=function(a){const {fl,rest}=flags(a);
  for(const f of fl)if(f!=='s'&&f!=='f')return E(`ln: invalid option -- '${f}'`);
  if(!rest.length)return E('ln: missing file operand');
  if(!fl.has('s'))return E('this practice shell only supports ln -s');
  if(rest.length<2)return E(`ln: missing destination file operand after '${rest[0]}'`);
  if(rest.length>2)return E('ln: this practice shell takes one target and one link name: ln -s TARGET LINK');
  const [target,link]=rest;let abs=norm(link);const dn=getNode(abs);
  if(dn&&dn.type==='dir')abs=SQ.join(abs,bname(target));
  const ex=lstat(abs);
  if(ex){if(!fl.has('f'))return E(`ln: failed to create symbolic link '${link}': File exists`);if(ex.type==='dir')return E(`ln: failed to create symbolic link '${link}': File exists`)}
  const [par,name]=parentOf(abs);
  if(!par||par.type!=='dir')return E(`ln: failed to create symbolic link '${link}': No such file or directory`);
  par.children[name]={type:'link',target};SQ.rt.changed.add(abs);return ok()};

// ---- which / type ----
CMDS.which=function(a){const {rest}=flags(a);const out=[];let code=0;
  for(const c of rest){if(known(c))out.push('/usr/bin/'+c);else code=1}
  return {out:out.join('\n'),err:[],code:rest.length?code:1}};
CMDS.type=function(a){const {rest}=flags(a);const out=[],err=[];
  for(const c of rest){if(KEYWORDS.includes(c))out.push(`${c} is a shell keyword`);else if(SQ.hasFunction(c))out.push(`${c} is a function`);else if(BUILTINS.includes(c))out.push(`${c} is a shell builtin`);else if(known(c))out.push(`${c} is /usr/bin/${c}`);else err.push(`bash: type: ${c}: not found`)}
  return {out:out.join('\n'),err,code:err.length?1:0}};
})(window.SQ = window.SQ || {});
