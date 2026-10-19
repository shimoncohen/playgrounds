(function (SQ) {
const {norm,getNode,lstat,isLoop,parentOf,bname,modeOf,modeString,ok,E,flags}=SQ;
const CMDS=SQ.CMDS;
const KEYWORDS=['if','then','else','elif','fi','case','esac','for','select','while','until','do','done','in','function','time','{','}','!','[[',']]','coproc'];
const BUILTINS=['cd','export','source','.','[','test','true','false',':','read','shift','unset','local','return','exit','break','continue'];
const known=c=>Object.prototype.hasOwnProperty.call(CMDS,c);

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
