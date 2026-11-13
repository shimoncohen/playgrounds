/* c.status: ok (exit is 1 when main returned an Err), panic (a runtime panic: exit 101, c.panic is {msg,line,col}), error, unsupported, internal or limit. `unsupported` (a construct the quest does not model) and `internal`
   (an engine exception on code it should handle) are kept apart from a verdict, which is given only when every construct
   is modeled. An exception never leaves RQ.run. DOM-free. */
(()=>{
'use strict';
const RQ=globalThis.RQ=globalThis.RQ||{};

const BORROWCK=['E0384','E0594','E0596','E0507'];
RQ.compile=src=>{
  const r=RQ.parse(RQ.lex(src));
  if(r.errors.length)return {ast:null,diags:r.errors,unsupported:[]};
  const ck=RQ.check(r.ast);
  // rustc skips borrowck for a body whose typeck failed, and still runs it on the others
  const typeck=ck.errors.filter(e=>!BORROWCK.includes(e.code));
  const bad=[];
  RQ.walk(r.ast,n=>{if(n.t==='Fn'&&n.body&&typeck.some(e=>n.line<=e.line&&e.line<=lastLine(n)))bad.push([n.line,lastLine(n)]);});
  const inBad=e=>bad.some(([a,z])=>a<=e.line&&e.line<=z);
  const global=typeck.some(e=>!inBad(e));
  let diags=global?typeck:ck.errors.filter(e=>!(BORROWCK.includes(e.code)&&inBad(e))),loans=[],moves=[],maxLive={shared:0,mut:0};
  const unsupported=[...r.unsupported,...ck.unsupported];
  // E0384, E0594 and a shared-reference E0596 are borrowck errors in rustc, so the pass still runs when the checker found only those, or typeck errors confined to other fns
  if(!unsupported.length&&!global){
    const live=n=>!(n.t==='Fn'&&n.body&&inBad(n));
    const b=RQ.borrow(bad.length?{...r.ast,items:r.ast.items.filter(live).map(it=>it.t==='Impl'||it.t==='Trait'?{...it,items:it.items.filter(live)}:it)}:r.ast,ck.info);
    let be=b.errors.filter(e=>!inBad(e));
    // the one type error only mir.js can see (a closure's Copy bound) ends the compile before borrowck, as any type error does
    if(be.some(e=>e.code==='E0277')){be=be.filter(e=>e.code==='E0277');diags=diags.filter(e=>!BORROWCK.includes(e.code));}
    diags=[...diags,...be];
    // writing through a binding that was never set is E0381 alone: rustc does not also report that the binding is not mut
    const unset=new Set(diags.filter(e=>e.code==='E0381').map(e=>e.line+':'+e.col));
    diags=diags.filter(e=>(e.code!=='E0594'&&e.code!=='E0596')||!unset.has(e.line+':'+e.col)).sort((a,b)=>a.line-b.line||a.col-b.col);
    unsupported.push(...b.unsupported.filter(u=>!inBad(u)));loans=b.loans;moves=b.moves;maxLive=b.maxLive;
  }
  // rustc lints only a program that type-checks, and the quest judges only a program it fully models
  if(!diags.length&&!unsupported.length){const l=RQ.lint(r.ast,ck.info);diags=l.errors;unsupported.push(...l.unsupported);}
  return {ast:r.ast,diags,unsupported:unsupported.sort((a,b)=>a.line-b.line),info:ck.info,adts:ck.adts,loans,moves,maxLive,
    counts:{shadow:ck.shadows,'shadow-use':ck.shadowUses,'var-use':ck.varUses}};
};

const lastLine=n=>{let hi=n.line;RQ.walk(n,m=>{if(m.line>hi)hi=m.line;});return hi;};
function errorView(c){
  const e=c.diags.find(d=>d.code||d.lint);
  if(!e||!c.ast)return null;
  const fn=c.ast.items.filter(i=>i.t==='Fn'&&i.body&&i.line<=e.line&&e.line<=lastLine(i)).pop();
  if(!fn)return null;
  const named=(/`([^`]+)`/.exec(e.msg)||[])[1]||null;
  const vars=[],tyOf=n=>{const o=c.info&&c.info.get(n);return o&&o.ty?RQ.types.show(o.ty):'';};
  for(const p of fn.params)if(p.pat.t==='IdentPat')vars.push({name:p.pat.name,ty:tyOf(p.pat),state:'owned'});
  const inBlock=b=>{
    for(const s of b.stmts){
      if(s.line>e.line)break;
      if(s.t==='Let'&&s.pat.t==='IdentPat'&&s.line<e.line)vars.push({name:s.pat.name,ty:tyOf(s.pat),state:s.init?'owned':'uninit'});
      if(e.line<=lastLine(s)){
        RQ.walk(s,m=>{if(m!==s&&m.t==='Block'&&m.line<=e.line&&e.line<=lastLine(m)){inBlock(m);return false;}});
        return;
      }
    }
    const t=b.tail;
    if(t&&t.t==='Match'&&(t.kind==='let'||t.kind==='letelse')&&t.line<e.line&&e.line<=lastLine(t)){
      RQ.walk(t.arms[0].pat,n=>{if(n.t==='IdentPat'&&n.line<e.line&&c.info.get(n)&&c.info.get(n).bpath)vars.push({name:n.name,ty:tyOf(n),state:'owned'});});
      inBlock(t.arms[0].body);
    }
  };
  inBlock(fn.body);
  const loans=(c.loans||[]).filter(l=>l.span&&!l.implicit&&l.span[0]<=e.line&&e.line<=l.span[1]);
  // the same name can be declared twice (shadowing); the newest one is the one the error names
  const byName=n=>{for(let i=vars.length-1;i>=0;i--)if(vars[i].name===n)return vars[i];return null;};
  for(const mv of c.moves||[]){const v=mv.line<e.line&&byName(mv.name);if(v&&v.state==='owned')v.state='moved';}
  const target=named&&byName(named);
  if(target&&e.code==='E0382')target.state='moved';
  if(target&&e.code==='E0381')target.state='uninit';
  for(const l of loans){const v=l.local&&byName(l.local);if(v&&v.state==='owned'){v.n=(v.n||0)+1;v.state=l.mut?'mutBorrowed':'shared';}}
  return {error:{code:e.code||e.lint,line:e.line,msg:e.msg,name:named},fn:fn.name,vars,loans:loans.map(l=>({kind:l.mut?'mut':'shared',place:l.local,from:l.span[0],to:l.span[1]}))};
}

const PRINTS=['println','print','eprintln','eprint'];
const peel=RQ.peel;
function holes(ast){
  let n=0;
  RQ.walk(ast,m=>{
    if(m.t==='Macro'&&PRINTS.includes(m.name)&&m.args&&m.args[0]&&m.args[0].kind==='str')n+=RQ.std.parseFormat(m.args[0].v).parts.filter(p=>p.lit===undefined).length;
  });
  return n;
}
RQ.features=src=>{
  const r=RQ.parse(RQ.lex(src)),tags=new Set();
  if(!r.ast)return tags;
  let hasLet=false;
  const generics=n=>{
    if(n.generics.some(g=>g.kind==='lt'))tags.add('lifetime-param');
    if(n.generics.some(g=>g.kind!=='lt'))tags.add('generic-decl');
  };
  RQ.walk(r.ast,n=>{
    switch(n.t){
      case 'Fn':tags.add(n.name==='main'?'fn-main':'fn-decl');if(n.params.length)tags.add('fn-params');if(n.ret)tags.add('fn-ret');generics(n);break;
      case 'Macro':tags.add('macro');if(PRINTS.includes(n.name))tags.add('println');
        if(n.args&&n.args[0]&&n.args[0].kind==='str')for(const p of RQ.std.parseFormat(n.args[0].v).parts){if(p.lit!==undefined)continue;tags.add(p.name!==undefined?'inline-hole':'hole');}
        break;
      case 'Let':hasLet=true;tags.add('let');if(n.ty)tags.add('type-annotation');break;
      case 'IdentPat':if(n.mut)tags.add('mut');break;
      case 'Assign':tags.add('assign');break;
      case 'Const':tags.add('const');if(n.ty)tags.add('type-annotation');break;
      case 'Ref':tags.add('ref-type');break;
      case 'Call':if(n.callee.t==='Path'&&n.callee.segs.length>1)tags.add('path-call');break;
      case 'MethodCall':tags.add('method-call');break;
      case 'Closure':tags.add('closure');break;
      case 'Struct':tags.add('struct');generics(n);if(n.attrs.some(a=>/^derive\b/.test(a)))tags.add('derive');break;
      case 'Enum':tags.add('enum');generics(n);if(n.attrs.some(a=>/^derive\b/.test(a)))tags.add('derive');break;
      case 'Impl':tags.add(n.trait?'trait-impl':'impl');generics(n);break;
      case 'Trait':tags.add('trait-decl');break;
      case 'Match':tags.add({iflet:'if-let',whilelet:'while-let',letelse:'let-else',let:'destructure'}[n.kind]||'match');break;
      case 'If':case 'LetCond':tags.add('if');break;
      case 'Loop':case 'While':case 'For':tags.add('loop');break;
      case 'Cast':tags.add('cast');break;
      case 'Tuple':tags.add('tuple');break;
      case 'Array':case 'ArrayRepeat':tags.add('array');break;
      case 'Range':tags.add('range');break;
      case 'Index':tags.add('index');break;
      case 'Try':tags.add('try');break;
      case 'Field':tags.add('field');break;
      case 'Path':if(n.segs.some(s=>s.args&&s.args.some(a=>a.t!=='Lifetime')))tags.add('type-args');break;
    }
  });
  if(hasLet&&RQ.check(r.ast).shadows)tags.add('shadow');
  return tags;
};

const readNames=n=>{
  const s=new Set();
  RQ.walk(n,m=>{
    if(m.t==='Path'&&m.segs.length===1)s.add(m.segs[0].name);
    else if(m.t==='Macro'&&m.args&&m.args[0]&&m.args[0].kind==='str')RQ.std.parseFormat(m.args[0].v).parts.forEach(q=>{if(q.name)s.add(q.name);});
  });
  return s;
};
const callsTo=(n,callee,param)=>{
  let k=false;
  RQ.walk(n,m=>{if(m.t==='Call'&&m.callee.t==='Path'&&m.callee.segs.length===1&&m.callee.segs[0].name===callee&&(!param||readNames(m.args).has(param)))k=true;});
  return k;
};
// nodes of fn that pick accepts, not counting a value thrown away: a bare statement or a `let` whose name is never read
function liveIn(ast,fn,pick){
  const f=ast&&ast.items.find(x=>x.t==='Fn'&&x.name===fn);
  if(!f)return 0;
  const read=readNames(f.body),dead=new Set(),inits=new Map();
  const mark=n=>{n=peel(n);dead.add(n);if(n.t==='Try')mark(n.expr);else if(n.t==='MethodCall')mark(n.recv);};
  RQ.walk(f.body,m=>{
    if(m.t==='ExprStmt'&&m.semi)mark(m.expr);
    else if(m.t==='Let'&&m.init){
      if(m.pat.t==='IdentPat')inits.set(m.pat.name,m.init);
      if(!(m.pat.t==='IdentPat'&&read.has(m.pat.name)))mark(m.init);
    }
  });
  let n=0;
  RQ.walk(f.body,m=>{if(!dead.has(m)&&pick(m,inits))n++;});
  return n;
}

const lastName=p=>p&&p.segs?p.segs[p.segs.length-1].name:null;
function context(d,ast,counts,src){
  const errors=d.errors||[];
  const c={
    status:d.status,errors,view:d.view||null,stdout:d.stdout||'',stderr:d.stderr||'',exit:d.exit??null,panic:d.panic||null,
    unsupported:d.unsupported||null,unsupportedAll:d.unsupportedAll||(d.unsupported?[d.unsupported]:[]),limit:d.limit||null,message:d.message||null,hashIterated:!!d.hashIterated,orderDependent:!!d.orderDependent,events:d.events||[],snaps:d.snaps||[],loans:d.loans||[],maxLive:kind=>(d.maxLive||{})[kind]||0,
    compiles:()=>c.status!=='error'&&c.status!=='unsupported'&&c.status!=='internal',
    hasError:(id,line)=>errors.some(e=>(e.code===id||e.lint===id)&&(line==null||e.line===line)),
    onlyError:id=>errors.length===1&&(errors[0].code===id||errors[0].lint===id),
    out:()=>c.stdout,
    // runs the same program again with some text swapped, e.g. the input literals, so code that hard-codes the answer is caught; null if a swapped text is not in the source
    rerun:(...pairs)=>src==null||pairs.some(([a])=>!src.includes(a))?null:RQ.run(pairs.reduce((t,[a,b])=>t.split(a).join(b),src)),
    moved:name=>c.events.some(e=>e.t==='move'&&e.name===name),
    allocs:kind=>c.events.filter(e=>e.t==='alloc'&&(kind===undefined||e.kind===kind)).length,
    dropOrder:()=>c.events.filter(e=>e.t==='drop'&&e.name&&!e.part).map(e=>e.name),
    usesMacro:name=>{let n=0;if(ast)RQ.walk(ast,m=>{if(m.t==='Macro'&&m.name===name)n++;});return n;},
    paramIsRef:(fn,i,kind)=>{
      const f=ast&&ast.items.find(x=>x.t==='Fn'&&x.name===fn),p=f&&f.params[i];
      return !!p&&p.ty.t==='Ref'&&(kind==='mut'?p.ty.mut:kind==='shared'?!p.ty.mut:true);
    },
    // the lifetime written on each `&` parameter and on the result: a name, null for none, undefined where the type is not a `&`
    sigOf:fn=>{
      const f=ast&&ast.items.find(x=>x.t==='Fn'&&x.name===fn),lt=t=>t&&t.t==='Ref'?t.lt:undefined;
      return f?{lts:f.generics.filter(g=>g.kind==='lt').map(g=>g.name),params:f.params.map(p=>lt(p.ty)),ret:lt(f.ret)}:null;
    },
    implOf:(trait,type)=>{
      const m=ast&&ast.items.find(x=>x.t==='Impl'&&x.trait&&lastName(x.trait)===trait&&lastName(x.selfTy)===type);
      return m?{methods:m.items.filter(f=>f.t==='Fn').map(f=>f.name),params:m.generics.filter(g=>g.kind==='ty').map(g=>g.name)}:null;
    },
    traitOf:name=>{
      const t=ast&&ast.items.find(x=>x.t==='Trait'&&x.name===name);
      return t?{methods:t.items.filter(f=>f.t==='Fn').map(f=>({name:f.name,body:!!f.body}))}:null;
    },
    // `where` bounds are merged only for a single-segment type parameter
    genericOf:fn=>{
      const f=ast&&ast.items.find(x=>x.t==='Fn'&&x.name===fn);
      if(!f)return null;
      const tparams=f.generics.filter(g=>g.kind==='ty').map(g=>({name:g.name,bounds:g.bounds.map(lastName)}));
      for(const w of f.where||[])if(w.ty&&w.ty.segs&&w.ty.segs.length===1){const t=tparams.find(x=>x.name===w.ty.segs[0].name);if(t)t.bounds.push(...w.bounds.map(lastName));}
      const impl=t=>t.t==='ImplTrait'?t.bounds.map(lastName):t.t==='Ref'?impl(t.ty):t.t==='Path'?(t.segs[t.segs.length-1].args||[]).map(impl).find(Boolean)||null:null;
      return {tparams,impl:f.params.map(p=>impl(p.ty))};
    },
    adtParams:name=>{
      const s=ast&&ast.items.find(x=>(x.t==='Struct'||x.t==='Enum')&&x.name===name);
      return s?s.generics.filter(g=>g.kind==='ty').map(g=>g.name):null;
    },
    structLt:name=>{
      const s=ast&&ast.items.find(x=>x.t==='Struct'&&x.name===name);
      return s?{lts:s.generics.filter(g=>g.kind==='lt').map(g=>g.name),fields:s.fields.map(f=>f.ty&&f.ty.t==='Ref'?f.ty.lt:undefined)}:null;
    },
    implLt:name=>{
      const m=ast&&ast.items.find(x=>x.t==='Impl'&&!x.trait&&x.selfTy.t==='Path'&&x.selfTy.segs[0].name===name),a=m&&(m.selfTy.segs[0].args||[]).find(g=>g.t==='Lifetime');
      return m?{lts:m.generics.filter(g=>g.kind==='lt').map(g=>g.name),arg:a?a.name:null}:null;
    },
    // struct literals of `name` that give a field a borrow of something
    borrowInit:name=>{
      let n=0;
      if(ast)RQ.walk(ast,m=>{if(m.t==='StructLit'&&m.path.segs[m.path.segs.length-1].name===name)n+=m.fields.filter(f=>f.expr&&peel(f.expr).t==='Ref').length;});
      return n;
    },
    usesParam:(fn,i)=>{
      const f=ast&&ast.items.find(x=>x.t==='Fn'&&x.name===fn),p=f&&f.params[i];
      let n=0;
      if(p&&p.pat.name)RQ.walk(f.body,m=>{if(m.t==='Path'&&m.segs.length===1&&m.segs[0].name===p.pat.name||m.t==='Macro'&&m.args&&m.args[0]&&m.args[0].kind==='str'&&RQ.std.parseFormat(m.args[0].v).parts.some(q=>q.name===p.pat.name))n++;});
      return n>0;
    },
    methodIn:(fn,name)=>{let n=0;const f=ast&&ast.items.find(x=>x.t==='Fn'&&x.name===fn);if(f)RQ.walk(f,m=>{if(m.t==='MethodCall'&&m.name===name)n++;});return n;},
    selfOf:name=>{let r=null;if(ast)RQ.walk(ast,m=>{if(m.t==='Impl'&&!m.trait)for(const f of m.items)if(r===null&&f.name===name&&f.selfParam)r=f.selfParam.ref?(f.selfParam.mut?'&mut':'&'):'val';});return r;},
    fieldsPrinted:()=>{let n=0;if(ast)RQ.walk(ast,m=>{if(m.t==='Macro'&&PRINTS.includes(m.name)&&m.args)for(const a of m.args.slice(1))RQ.walk(a,x=>{if(x.t==='Field')n++;});});return n;},
    fieldRead:name=>{let n=0;if(ast)RQ.walk(ast,m=>{if(m.t==='Field'&&m.name===name)n++;});return n;},
    matchOn:(kind,fn,from,prints)=>{
      let n=0;
      const f=ast&&ast.items.find(x=>x.t==='Fn'&&x.name===fn);
      if(f)RQ.walk(f.body,m=>{
        if(m.t!=='Match'||m.kind!==kind)return;
        let reads=false,shown=!prints;
        RQ.walk(m.scrut,x=>{if(x.t==='Path'&&x.segs.length===1&&x.segs[0].name===from)reads=true;});
        if(prints)RQ.walk(m.arms[0].body,x=>{if(x.t==='Macro'&&PRINTS.includes(x.name))shown=true;});
        if(reads&&shown)n++;
      });
      return n;
    },
    tryOn:(fn,callee,param)=>liveIn(ast,fn,(m,inits)=>m.t==='Try'&&(callsTo(m.expr,callee,param)||[...readNames(m.expr)].some(v=>inits.has(v)&&callsTo(inits.get(v),callee,param)))),
    chainOn:(fn,name,base)=>liveIn(ast,fn,m=>{
      if(m.t!=='MethodCall'||m.name!==name)return false;
      let k=false;
      RQ.walk(m.recv,x=>{if(x.t==='MethodCall'&&x.name===base)k=true;});
      return k;
    }),
    callsIn:(fn,callee)=>{const f=ast&&ast.items.find(x=>x.t==='Fn'&&x.name===fn);return f&&callsTo(f.body,callee)?1:0;},
    forOver:(fn,name)=>{
      let n=0;
      const f=ast&&ast.items.find(x=>x.t==='Fn'&&x.name===fn);
      if(f)RQ.walk(f.body,m=>{if(m.t==='For'){let r=false;RQ.walk(m.iter,x=>{if(x.t==='Path'&&x.segs.length===1&&x.segs[0].name===name)r=true;});if(r)n++;}});
      return n;
    },
    litArgs:what=>{
      let n=0;
      const lit=a=>{a=peel(a);return a.t==='Lit'||a.t==='Unary'&&a.op==='-'&&peel(a.expr).t==='Lit';};
      if(ast)RQ.walk(ast,m=>{
        if(what==='print'&&m.t==='Macro'&&PRINTS.includes(m.name)&&m.args)n+=m.args.slice(1).filter(lit).length;
        else if(m.t==='MethodCall'&&m.name===what)n+=m.args.filter(lit).length;
      });
      return n;
    },
    countIn:(kind,fn)=>{
      let n=0;
      const f=ast&&ast.items.find(x=>x.t==='Fn'&&x.name===fn),T={while:'While',loop:'Loop',for:'For'}[kind];
      if(f)RQ.walk(f.body,m=>{if(m.t===T)n++;});
      return n;
    },
    // caps are empty unless borrow checking ran
    closures:()=>{const r=[];if(ast)RQ.walk(ast,m=>{if(m.t==='Closure'){const o=d.info&&d.info.get(m);r.push({move:!!m.move,caps:o&&o.cl?o.cl.caps:[]});}});return r;},
    printsIn:inside=>{
      let n=0;
      const go=(x,inCl)=>RQ.walk(x,m=>{
        if(m.t==='Closure'&&!inCl&&m!==x){go(m,true);return false;}
        if(m.t==='Macro'&&PRINTS.includes(m.name)&&inCl===inside)n++;
      });
      if(ast)go(ast,false);
      return n;
    },
    printedCalls:name=>{
      let n=0;
      if(ast)RQ.walk(ast,m=>{if(m.t==='Macro'&&PRINTS.includes(m.name)&&m.args&&callsTo(m.args,name))n++;});
      return n;
    },
    onRecv:(fn,method,name)=>{
      let n=0;
      const f=ast&&ast.items.find(x=>x.t==='Fn'&&x.name===fn);
      if(f)RQ.walk(f.body,m=>{if(m.t==='MethodCall'&&m.name===method){const r=peel(m.recv);if(r.t==='Path'&&r.segs.length===1&&r.segs[0].name===name)n++;}});
      return n;
    },
    callArg:(callee,name)=>{
      let n=0;
      if(ast)RQ.walk(ast,m=>{if(m.t==='Call'&&m.callee.t==='Path'&&m.callee.segs.length===1&&m.callee.segs[0].name===callee&&m.args.some(a=>{a=peel(a);return a.t==='Path'&&a.segs.length===1&&a.segs[0].name===name;}))n++;});
      return n;
    },
    usesMethod:name=>{let n=0;if(ast)RQ.walk(ast,m=>{if(m.t==='MethodCall'&&m.name===name)n++;});return n;},
    calls:name=>{let n=0;if(ast)RQ.walk(ast,m=>{if(m.t==='Call'&&m.callee.t==='Path'&&m.callee.segs.length===1&&m.callee.segs[0].name===name)n++;});return n;},
    count:kind=>{
      if(!ast)return 0;
      if(counts&&kind in counts)return counts[kind];
      if(kind==='hole')return holes(ast);
      if(kind==='const-use'){
        const names=new Set(ast.items.filter(i=>i.t==='Const').map(i=>i.name));
        let k=0;
        RQ.walk(ast,m=>{if(m.t==='Path'&&m.segs.length===1&&names.has(m.segs[0].name))k++;});
        return k;
      }
      const arms=pick=>{let k=0;RQ.walk(ast,m=>{if(m.t==='Match'&&!m.kind)for(const a of m.arms)if(pick(a))k++;});return k;};
      if(kind==='arm')return arms(()=>true);
      if(kind==='guard')return arms(a=>a.guard);
      if(kind==='catch-all')return arms(a=>a.pat.t==='Wild'||a.pat.t==='IdentPat'&&!a.pat.sub&&a.pat.name!=='None');
      const KIND={iflet:'iflet',whilelet:'whilelet',letelse:'letelse',destructure:'let'}[kind];
      const T={let:'Let',assign:'Assign',macro:'Macro',fn:'Fn',const:'Const',op:'Binary',cast:'Cast',tuple:'Tuple',array:'Array',index:'Index',field:'Field',
        if:'If',loop:'Loop',while:'While',for:'For',break:'Break',return:'Return',try:'Try',struct:'Struct',enum:'Enum',impl:'Impl'}[kind];
      let n=0;
      if(kind==='match')RQ.walk(ast,m=>{if(m.t==='Match'&&!m.kind)n++;});
      else if(kind==='derive')RQ.walk(ast,m=>{if((m.t==='Struct'||m.t==='Enum')&&m.attrs.some(a=>/^derive\b/.test(a)))n++;});
      else if(KIND)RQ.walk(ast,m=>{if(m.t==='Match'&&m.kind===KIND)n++;});
      else if(kind==='method'||kind==='assoc')RQ.walk(ast,m=>{if(m.t==='Impl'&&!m.trait)for(const f of m.items)if(f.t==='Fn'&&!!f.selfParam===(kind==='method'))n++;});
      else RQ.walk(ast,m=>{if(kind==='mut'?(m.t==='IdentPat'&&m.mut):kind==='annot'?(m.t==='Let'&&m.ty):m.t===T)n++;});
      return n;
    }
  };
  return c;
}

RQ.run=(src,opts)=>{
  opts=opts||{};
  let ast=null;
  try{
    const c=RQ.compile(src);ast=c.ast;
    if(!c.ast)return context({status:'error',errors:c.diags},null);
    if(c.unsupported.length)return context({status:'unsupported',unsupported:c.unsupported[0],unsupportedAll:c.unsupported},ast,c.counts);
    if(c.diags.length)return context({status:'error',errors:c.diags,view:opts.snap?errorView(c):null},ast,c.counts);
    if(opts.testFault)opts.testFault();
    const o={...opts,info:c.info,adts:c.adts,loans:c.loans},d=RQ.interp(c.ast,{...o,seed:0});
    let orderDependent=false;
    if(d.hashIterated&&(d.status==='ok'||d.status==='panic')){
      orderDependent=[1,2].some(seed=>{const r=RQ.interp(c.ast,{...o,seed,snap:false});return r.status!==d.status||r.stdout!==d.stdout||r.stderr!==d.stderr;});
    }
    return context({...d,orderDependent,loans:c.loans,maxLive:c.maxLive,info:c.info},ast,c.counts,src);
  }catch(e){
    // source nested thousands deep overflows a recursive pass; that is the learner's code, not a bug
    if(e instanceof RangeError&&!ast)return context({status:'unsupported',unsupported:{feature:'nesting',line:1},unsupportedAll:[{feature:'nesting',line:1}]},null);
    return context({status:'internal',message:String(e&&e.message||e)},ast);
  }
};
})();
