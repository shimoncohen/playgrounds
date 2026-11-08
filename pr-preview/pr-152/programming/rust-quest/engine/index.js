/* c.status: ok, panic (a runtime panic: exit 101, c.panic is {msg,line,col}), error, unsupported, internal or limit. `unsupported` (a construct the quest does not model) and `internal`
   (an engine exception on code it should handle) are kept apart from a verdict, which is given only when every construct
   is modeled. An exception never leaves RQ.run. DOM-free. */
(()=>{
'use strict';
const RQ=globalThis.RQ=globalThis.RQ||{};

RQ.compile=src=>{
  const r=RQ.parse(RQ.lex(src));
  if(r.errors.length)return {ast:null,diags:r.errors,unsupported:[]};
  const ck=RQ.check(r.ast);
  let diags=ck.errors,loans=[],moves=[],maxLive={shared:0,mut:0};
  const unsupported=[...r.unsupported,...ck.unsupported];
  // E0384 is a borrowck error in rustc, so the pass still runs when it is the only thing the checker found
  if(!unsupported.length&&diags.every(e=>e.code==='E0384')){
    const b=RQ.borrow(r.ast,ck.info);
    diags=[...diags,...b.errors].sort((a,b)=>a.line-b.line||a.col-b.col);
    unsupported.push(...b.unsupported);loans=b.loans;moves=b.moves;maxLive=b.maxLive;
  }
  // rustc lints only a program that type-checks, and the quest judges only a program it fully models
  if(!diags.length&&!unsupported.length){const l=RQ.lint(r.ast,ck.info);diags=l.errors;unsupported.push(...l.unsupported);}
  return {ast:r.ast,diags,unsupported:unsupported.sort((a,b)=>a.line-b.line),info:ck.info,loans,moves,maxLive,
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
  RQ.walk(r.ast,n=>{
    switch(n.t){
      case 'Fn':tags.add(n.name==='main'?'fn-main':'fn-decl');if(n.params.length)tags.add('fn-params');if(n.ret)tags.add('fn-ret');if(n.generics.length)tags.add('generic-decl');break;
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
      case 'Struct':tags.add('struct');if(n.attrs.some(a=>/^derive\b/.test(a)))tags.add('derive');break;
      case 'Enum':tags.add('enum');if(n.attrs.some(a=>/^derive\b/.test(a)))tags.add('derive');break;
      case 'Impl':tags.add(n.trait?'trait-impl':'impl');break;
      case 'Trait':tags.add('trait-decl');break;
      case 'Match':tags.add('match');break;
      case 'If':case 'LetCond':tags.add('if');break;
      case 'Loop':case 'While':case 'For':tags.add('loop');break;
      case 'Cast':tags.add('cast');break;
      case 'Tuple':tags.add('tuple');break;
      case 'Array':case 'ArrayRepeat':tags.add('array');break;
      case 'Range':tags.add('range');break;
      case 'Index':tags.add('index');break;
      case 'Try':tags.add('try');break;
      case 'Field':tags.add('field');break;
      case 'Path':if(n.segs.some(s=>s.args))tags.add('type-args');break;
    }
  });
  if(hasLet&&RQ.check(r.ast).shadows)tags.add('shadow');
  return tags;
};

function context(d,ast,counts){
  const errors=d.errors||[];
  const c={
    status:d.status,errors,view:d.view||null,stdout:d.stdout||'',stderr:d.stderr||'',exit:d.exit??null,panic:d.panic||null,
    unsupported:d.unsupported||null,unsupportedAll:d.unsupportedAll||(d.unsupported?[d.unsupported]:[]),limit:d.limit||null,message:d.message||null,events:d.events||[],snaps:d.snaps||[],loans:d.loans||[],maxLive:kind=>(d.maxLive||{})[kind]||0,
    compiles:()=>c.status!=='error'&&c.status!=='unsupported'&&c.status!=='internal',
    hasError:(id,line)=>errors.some(e=>(e.code===id||e.lint===id)&&(line==null||e.line===line)),
    onlyError:id=>errors.length===1&&(errors[0].code===id||errors[0].lint===id),
    out:()=>c.stdout,
    moved:name=>c.events.some(e=>e.t==='move'&&e.name===name),
    allocs:kind=>c.events.filter(e=>e.t==='alloc'&&(kind===undefined||e.kind===kind)).length,
    dropOrder:()=>c.events.filter(e=>e.t==='drop'&&e.name&&!e.part).map(e=>e.name),
    usesMacro:name=>{let n=0;if(ast)RQ.walk(ast,m=>{if(m.t==='Macro'&&m.name===name)n++;});return n;},
    paramIsRef:(fn,i,kind)=>{
      const f=ast&&ast.items.find(x=>x.t==='Fn'&&x.name===fn),p=f&&f.params[i];
      return !!p&&p.ty.t==='Ref'&&(kind==='mut'?p.ty.mut:kind==='shared'?!p.ty.mut:true);
    },
    methodIn:(fn,name)=>{let n=0;const f=ast&&ast.items.find(x=>x.t==='Fn'&&x.name===fn);if(f)RQ.walk(f,m=>{if(m.t==='MethodCall'&&m.name===name)n++;});return n;},
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
      const T={let:'Let',assign:'Assign',macro:'Macro',fn:'Fn',const:'Const',op:'Binary',cast:'Cast',tuple:'Tuple',array:'Array',index:'Index',field:'Field',
        if:'If',loop:'Loop',while:'While',for:'For',break:'Break',return:'Return'}[kind];
      let n=0;
      RQ.walk(ast,m=>{if(kind==='mut'?(m.t==='IdentPat'&&m.mut):kind==='annot'?(m.t==='Let'&&m.ty):m.t===T)n++;});
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
    return context({...RQ.interp(c.ast,{...opts,info:c.info,loans:c.loans}),loans:c.loans,maxLive:c.maxLive},ast,c.counts);
  }catch(e){
    return context({status:'internal',message:String(e&&e.message||e)},ast);
  }
};
})();
