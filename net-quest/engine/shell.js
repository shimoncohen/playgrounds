/* Network Quest shell: parses one command line (quotes, pipes into grep/head), runs it on a device and returns
   {out, err, code, entries}. Commands register with NQ.reg(name, help, fn); fn(net, dev, args, io) returns
   {out:string[], err:string[], code}. Net.exec(line, devId?) is attached by topology.js and calls NQ.exec. DOM-free. */
(()=>{
'use strict';
const NQ=globalThis.NQ=globalThis.NQ||{};
const MAX_LINE=1000,MAX_OUT=200;
NQ.CMDS={};NQ.HELP={};
NQ.reg=(name,help,fn)=>{NQ.CMDS[name]=fn;NQ.HELP[name]=help;};
const has=name=>Object.prototype.hasOwnProperty.call(NQ.CMDS,name);
const res=(out,err,code)=>({out,err,code});
const fail=(code,...err)=>res([],err,code);

/* split a line into stages of words; null stages mean a stray pipe. Returns {stages} or {error} */
const tokenize=line=>{
  const stages=[[]];
  let cur='',has=false,q=null;
  const word=()=>{if(has)stages[stages.length-1].push(cur);cur='';has=false;};
  for(const ch of line){
    if(q){if(ch===q)q=null;else cur+=ch;continue;}
    if(ch==='"'||ch==="'"){q=ch;has=true;}
    else if(/\s/.test(ch))word();
    else if(ch==='|'){word();stages.push([]);}
    else{cur+=ch;has=true;}
  }
  if(q)return {error:fail(2,'bash: unexpected EOF while looking for matching `'+q+"'")};
  word();
  if(stages.some(s=>!s.length))return {error:fail(2,"bash: syntax error near unexpected token `|'")};
  return {stages};
};

const lev=(a,b)=>{
  let prev=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    const cur=[i];
    for(let j=1;j<=b.length;j++)cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
    prev=cur;
  }
  return prev[b.length];
};
/* the one registered command nearest to name within edit distance 2 (none if two tie) */
const suggest=name=>{
  let best=null,tie=false;
  for(const c of Object.keys(NQ.CMDS)){
    const d=lev(name,c);
    if(d>2)continue;
    if(!best||d<best.d){best={c,d};tie=false;}else if(d===best.d)tie=true;
  }
  return best&&!tie?best.c:null;
};

/* the filters allowed after a pipe: each returns a function (lines) -> {out, code}, or an error result */
const FILTERS={
  grep:args=>{
    const inv=args[0]==='-v',rest=inv?args.slice(1):args;
    if(rest.length!==1)return fail(2,'Usage: grep [-v] <text>');
    const t=rest[0];
    return lines=>{const out=lines.filter(l=>l.includes(t)!==inv);return {out,code:out.length?0:1};};
  },
  head:args=>{
    let n=10;
    if(args.length===2&&args[0]==='-n'){
      if(!/^\d{1,9}$/.test(args[1]))return fail(1,"head: invalid number of lines: '"+args[1]+"'");
      n=+args[1];
    }else if(args.length)return fail(1,'Usage: head [-n N]');
    return lines=>({out:lines.slice(0,n),code:0});
  }
};
const cap=lines=>lines.length>MAX_OUT?lines.slice(0,MAX_OUT).concat('… output truncated'):lines;

const run=(net,dev,line)=>{
  if(line.length>MAX_LINE)return fail(1,'bash: line too long');
  line=line.trim();
  if(!line)return res([],[],0);
  const t=tokenize(line);
  if(t.error)return t.error;
  const [first,...rest]=t.stages,filters=[];
  for(const s of rest){
    const f=Object.prototype.hasOwnProperty.call(FILTERS,s[0])?FILTERS[s[0]](s.slice(1)):fail(1,'bash: '+s[0]+': only grep and head can follow a pipe here');
    if(typeof f!=='function')return f;
    filters.push(f);
  }
  const name=first[0];
  if(!has(name)){
    const s=suggest(name);
    return fail(127,'bash: '+name+': command not found',...(s?["Did you mean '"+s+"'?"]:[]));
  }
  const r=NQ.CMDS[name](net,dev,first.slice(1),{});
  let out=r.out,code=r.code;
  for(const f of filters){const o=f(out);out=o.out;code=o.code;}
  return res(cap(out),cap(r.err),code);
};
NQ.exec=(net,line,devId)=>{
  const id=devId||net.me,dev=net.devices[id];
  if(!dev)throw new Error('unknown device: '+id);
  if(dev.kind!=='host'&&dev.kind!=='router')throw new Error(id+' has no shell (it is a '+dev.kind+')');
  const start=net.log.length;
  const r=run(net,dev,typeof line==='string'?line:'');
  r.entries=net.log.slice(start);
  return r;
};

NQ.reg('help','list the commands you can use',()=>{
  const names=Object.keys(NQ.CMDS).sort(),w=Math.max(...names.map(n=>n.length));
  return res(names.map(n=>n.padEnd(w)+'  '+NQ.HELP[n]),[],0);
});
})();
