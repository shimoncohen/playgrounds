/* A construct the quest does not model still parses and is listed in `unsupported` as {feature, line}; only a real syntax
   error stops it, with one {line, col, msg}. Every node is {t, id, line, col, ...}. DOM-free. */
(()=>{
'use strict';
const RQ=globalThis.RQ=globalThis.RQ||{};
const OUT_NAMES=['HashSet','VecDeque','BTreeMap','BTreeSet','BinaryHeap','LinkedList','Rc','Arc','Weak','RefCell','Cell','OnceCell','Mutex','RwLock','Cow','Pin','i128','u128','f32'];
const OUT=new Set(OUT_NAMES);
RQ.PARSE_FEATURES=[...OUT_NAMES,'unsafe','dyn','async','static mut','union','macro_rules','dbg!','other macro','byte literal','raw pointer','extern','const fn','higher-ranked bound','lifetime bound','never type'];
const MACROS=new Set('println print eprintln eprint format panic assert assert_eq assert_ne debug_assert debug_assert_eq vec write writeln todo unimplemented unreachable'.split(' '));
const BIN={'||':4,'&&':5,'==':6,'!=':6,'<':6,'>':6,'<=':6,'>=':6,'|':7,'^':8,'&':9,'<<':10,'>>':10,'+':11,'-':11,'*':12,'/':12,'%':12};
const ASSIGN=new Set(['=','+=','-=','*=','/=','%=','^=','&=','|=','<<=','>>=']);
const CLOSE={'(':')','[':']','{':'}'};
const BLOCKLIKE=new Set(['if','match','while','loop','for','unsafe']);

RQ.walk=(n,f,parent)=>{
  if(Array.isArray(n)){for(const x of n)RQ.walk(x,f,parent);return;}
  if(!n||typeof n!=='object')return;
  if(typeof n.t==='string'){if(f(n,parent)===false)return;parent=n;}
  for(const k of Object.keys(n)){const v=n[k];if(v&&typeof v==='object')RQ.walk(v,f,parent);}
};

RQ.parse=tokens=>{
  const toks=tokens.slice(),un=[],seen=new Set();
  let p=0,nid=0;
  const feat=(f,l)=>{const k=f+'@'+l;if(!seen.has(k)){seen.add(k);un.push({feature:f,line:l});}};
  const at=q=>toks[Math.min(q,toks.length-1)];
  const T=()=>at(p),pk=(d=1)=>at(p+d);
  const desc=x=>x.k==='eof'?'end of file':x.k==='str'?'a string':'`'+x.v+'`';
  const fail=(msg,tk)=>{tk=tk||T();throw {perr:1,line:tk.line,col:tk.col,msg};};
  const isP=(v,tk)=>{tk=tk||T();return tk.k==='punct'&&tk.v===v;};
  const isK=(v,tk)=>{tk=tk||T();return tk.k==='kw'&&tk.v===v;};
  const eatP=v=>isP(v)?toks[p++]:null;
  const eatK=v=>isK(v)?toks[p++]:null;
  const expP=v=>eatP(v)||fail('expected `'+v+'`, found '+desc(T()));
  const expK=v=>eatK(v)||fail('expected `'+v+'`, found '+desc(T()));
  const semi=()=>{if(eatP(';'))return;const q=toks[p-1]||T();fail('expected `;`, found '+desc(T()),{line:q.el,col:q.ec});};
  const mk=(t,tk,o)=>Object.assign({t,id:nid++,line:tk.line,col:tk.col},o);
  const ident=()=>{const x=T();if(x.k!=='ident')fail('expected identifier, found '+desc(x));p++;return x;};
  const closeAngle=()=>{
    const x=T();if(isP('>')){p++;return;}
    const rest=x.k==='punct'?{'>>':'>','>=':'=','>>=':'>='}[x.v]:null;
    if(rest){toks[p]={...x,v:rest,col:x.col+1};return;}
    fail('expected `>`, found '+desc(x));
  };
  const isCloseAngle=()=>T().k==='punct'&&['>','>>','>=','>>='].includes(T().v);
  const skipTree=close=>{ // p is just past the opener
    let depth=1;
    while(depth&&T().k!=='eof'){const x=T();if(x.k==='punct'){if(CLOSE[x.v])depth++;else if(x.v===')'||x.v===']'||x.v==='}')depth--;}p++;}
    if(depth)fail('this file contains an unclosed delimiter, expected `'+close+'`');
  };

  function attrs(){
    const out=[];
    while(isP('#')){p++;eatP('!');expP('[');let depth=1;const txt=[];
      while(T().k!=='eof'){if(isP('['))depth++;else if(isP(']')){depth--;if(!depth)break;}txt.push(T().v);p++;}
      expP(']');out.push(txt.join(' '));}
    return out;
  }
  function vis(){if(!eatK('pub'))return false;if(isP('(')&&(isK('crate',pk())||isK('super',pk())||isK('self',pk())||isK('in',pk()))){while(!isP(')')&&T().k!=='eof')p++;expP(')');}return true;}
  function bounds(){
    const out=[];
    for(;;){
      const x=T();
      if(x.k==='lifetime'){p++;out.push(mk('Lifetime',x,{name:x.v}));}
      else if(isP('?')){p++;out.push(path(false));}
      else if(isK('for')){p++;expP('<');while(!isCloseAngle())p++;closeAngle();feat('higher-ranked bound',x.line);out.push(path(false));}
      else if(x.k==='ident'||isK('Self')||isK('crate')||isK('self')||isK('super')||isP('::'))out.push(path(false));
      else if(isP('(')){p++;out.push(...bounds());expP(')');}
      else break;
      if(!eatP('+'))break;
    }
    return out;
  }
  function generics(){
    const out=[];
    if(!eatP('<'))return out;
    while(!isCloseAngle()){
      attrs();const x=T();
      if(x.k==='lifetime'){p++;let bs=[];if(eatP(':')){feat('lifetime bound',x.line);bs=bounds();}out.push({kind:'lt',name:x.v,bounds:bs});}
      else if(eatK('const')){const n=ident();expP(':');const t=ty();let d=null;if(eatP('='))d=unary(true);out.push({kind:'const',name:n.v,ty:t,default:d});}
      else{const n=ident();let bs=[],d=null;if(eatP(':'))bs=bounds();if(eatP('='))d=ty();out.push({kind:'ty',name:n.v,bounds:bs,default:d});}
      if(!eatP(','))break;
    }
    closeAngle();return out;
  }
  function where(){
    const out=[];
    if(!eatK('where'))return out;
    while(!isP('{')&&!isP(';')&&!isP('=')&&T().k!=='eof'){
      const x=T();
      if(x.k==='lifetime'){p++;expP(':');feat('lifetime bound',x.line);out.push({lt:x.v,bounds:bounds()});}
      else{if(isK('for')){p++;expP('<');while(!isCloseAngle())p++;closeAngle();feat('higher-ranked bound',x.line);}const t=ty();expP(':');out.push({ty:t,bounds:bounds()});}
      if(!eatP(','))break;
    }
    return out;
  }

  function genericArgs(){
    const a=[];
    while(!isCloseAngle()){
      const x=T();
      if(x.k==='lifetime'){p++;a.push(mk('Lifetime',x,{name:x.v}));}
      else if(x.k==='ident'&&isP('=',pk())){p+=2;a.push(mk('Binding',x,{name:x.v,ty:ty()}));}
      else if(x.k==='int'||x.k==='str'||x.k==='char'||isK('true')||isK('false')||isP('-')||isP('{'))a.push(unary(true));
      else a.push(ty());
      if(!eatP(','))break;
    }
    closeAngle();return a;
  }
  function path(expr){
    const start=T(),segs=[];
    const global=!!eatP('::');
    for(;;){
      const x=T();
      if(!(x.k==='ident'||(x.k==='kw'&&['self','Self','super','crate'].includes(x.v))))fail('expected identifier, found '+desc(x));
      p++;
      if(OUT.has(x.v))feat(x.v,x.line);
      const seg={name:x.v,args:null,fn:null,line:x.line};
      if(!expr&&isP('<')){p++;seg.args=genericArgs();}
      else if(isP('::')&&isP('<',pk())){p+=2;seg.args=genericArgs();}
      else if(!expr&&/^Fn(Mut|Once)?$/.test(x.v)&&isP('(')){
        p++;const inputs=[];while(!isP(')')){inputs.push(ty());if(!eatP(','))break;}expP(')');
        seg.fn={inputs,ret:eatP('->')?ty():null};
      }
      segs.push(seg);
      if(isP('::')&&(pk().k==='ident'||(pk().k==='kw'&&['self','Self','super','crate'].includes(pk().v)))){p++;continue;}
      break;
    }
    return mk('Path',start,{segs,global});
  }
  function ty(){
    const x=T();
    if(isP('&')||isP('&&')){
      const dbl=isP('&&');p++;let lt=null;if(T().k==='lifetime')lt=toks[p++].v;
      const mut=!!eatK('mut');let r=mk('Ref',x,{mut,lt,ty:ty()});
      if(dbl)r=mk('Ref',x,{mut:false,lt:null,ty:r});
      return r;
    }
    if(isP('*')){p++;if(!eatK('const'))expK('mut');feat('raw pointer',x.line);return mk('Ptr',x,{ty:ty()});}
    if(isP('(')){
      p++;if(eatP(')'))return mk('Tuple',x,{tys:[]});
      const first=ty();
      if(eatP(')'))return first;
      const tys=[first];while(eatP(',')){if(isP(')'))break;tys.push(ty());}
      expP(')');return mk('Tuple',x,{tys});
    }
    if(isP('[')){
      p++;const el=ty();
      if(eatP(';')){const len=expr(false);expP(']');return mk('Array',x,{ty:el,len});}
      expP(']');return mk('Slice',x,{ty:el});
    }
    if(isP('!')){p++;feat('never type',x.line);return mk('Never',x);}
    if(isK('impl')){p++;return mk('ImplTrait',x,{bounds:bounds()});}
    if(isK('dyn')){p++;feat('dyn',x.line);return mk('DynTrait',x,{bounds:bounds()});}
    if(isK('for')){p++;expP('<');while(!isCloseAngle())p++;closeAngle();feat('higher-ranked bound',x.line);return ty();}
    if(isK('fn')||isK('unsafe')||isK('extern')){
      if(isK('unsafe')){p++;feat('unsafe',x.line);}
      if(eatK('extern')){feat('extern',x.line);if(T().k==='str')p++;}
      expK('fn');expP('(');const inputs=[];
      while(!isP(')')){if(T().k==='ident'&&isP(':',pk()))p+=2;inputs.push(ty());if(!eatP(','))break;}
      expP(')');return mk('FnPtr',x,{inputs,ret:eatP('->')?ty():null});
    }
    if(isP('<')){
      p++;const self=ty();let tr=null;if(eatK('as'))tr=path(false);closeAngle();
      const segs=[];while(eatP('::')){const n=ident();let args=null;if(isP('<')){p++;args=genericArgs();}segs.push({name:n.v,args});}
      return mk('QPath',x,{self,trait:tr,segs});
    }
    if(x.k==='ident'||isK('Self')||isK('crate')||isK('self')||isK('super')||isP('::')){
      const pa=path(false);
      if(pa.segs.length===1&&pa.segs[0].name==='_'&&!pa.segs[0].args)return mk('Infer',x);
      return pa;
    }
    return fail('expected type, found '+desc(x));
  }

  function litExpr(){
    const x=T();
    if(isP('-')){p++;return mk('Unary',x,{op:'-',expr:litExpr()});}
    if(['int','float','str','char'].includes(x.k)){p++;return lit(x);}
    if(isK('true')||isK('false')){p++;return mk('Lit',x,{kind:'bool',v:x.v==='true'});}
    return fail('expected a literal, found '+desc(x));
  }
  function lit(x){
    if(x.byte)feat('byte literal',x.line);
    if(x.suffix&&OUT.has(x.suffix))feat(x.suffix,x.line);
    return mk('Lit',x,{kind:x.k,v:x.v,suffix:x.suffix||null});
  }
  function pat(){
    const s=T();eatP('|');
    const alts=[patNoOr()];
    while(isP('|')){p++;alts.push(patNoOr());}
    return alts.length>1?mk('Or',s,{alts}):alts[0];
  }
  function patNoOr(){
    const x=T();
    if(x.k==='ident'&&x.v==='_'&&!isP('::',pk())){p++;return mk('Wild',x);}
    if(isP('..')&&!(pk().k==='int'||pk().k==='char'||pk().k==='float')){p++;return mk('Rest',x);}
    if(isP('..=')){p++;return mk('RangePat',x,{lo:null,hi:litExpr(),inclusive:true});}
    if(isP('&')||isP('&&')){
      const dbl=isP('&&');p++;const mut=!!eatK('mut');let r=mk('RefPat',x,{mut,pat:patNoOr()});
      if(dbl)r=mk('RefPat',x,{mut:false,pat:r});return r;
    }
    if(isP('(')){
      p++;const ps=[];let comma=false;
      while(!isP(')')){ps.push(pat());if(eatP(','))comma=true;else break;}
      expP(')');return ps.length===1&&!comma?ps[0]:mk('TuplePat',x,{pats:ps});
    }
    if(isP('[')){p++;const ps=[];while(!isP(']')){ps.push(pat());if(!eatP(','))break;}expP(']');return mk('SlicePat',x,{pats:ps});}
    if(['int','float','str','char'].includes(x.k)||isP('-')||isK('true')||isK('false')){
      const lo=litExpr();
      if(isP('..=')||isP('..')||isP('...')){
        const inclusive=!isP('..');p++;
        const hi=['int','float','char'].includes(T().k)||isP('-')?litExpr():null;
        return mk('RangePat',x,{lo,hi,inclusive});
      }
      return mk('LitPat',x,{lit:lo});
    }
    if(isK('ref')||isK('mut')||(x.k==='ident'&&!isP('::',pk())&&!isP('(',pk())&&!isP('{',pk())&&!isP('!',pk()))){
      const byRef=!!eatK('ref'),mut=!!eatK('mut'),n=ident();
      const sub=eatP('@')?patNoOr():null;
      return mk('IdentPat',x,{name:n.v,mut,byRef,sub});
    }
    const pa=path(true);
    if(isP('(')){p++;const ps=[];while(!isP(')')){ps.push(pat());if(!eatP(','))break;}expP(')');return mk('TupleStructPat',x,{path:pa,pats:ps});}
    if(isP('{')){
      p++;const fields=[];let rest=false;
      while(!isP('}')){
        attrs();
        if(eatP('..')){rest=true;break;}
        const f=T();
        if(f.k==='ident'&&isP(':',pk())){p+=2;fields.push({name:f.v,pat:pat()});}
        else{const byRef=!!eatK('ref'),mut=!!eatK('mut'),n=ident();fields.push({name:n.v,pat:mk('IdentPat',f,{name:n.v,mut,byRef,sub:null})});}
        if(!eatP(','))break;
      }
      expP('}');return mk('StructPat',x,{path:pa,fields,rest});
    }
    if(isP('..=')||isP('..')){const inclusive=isP('..=');p++;return mk('RangePat',x,{lo:pa,hi:['int','char','float'].includes(T().k)?litExpr():null,inclusive});}
    return mk('PathPat',x,{path:pa});
  }

  const startsExpr=(ns)=>{
    const x=T();
    if(x.k==='eof')return false;
    if(x.k==='punct')return !([';','}',')',']',',','=>','='].includes(x.v)||(ns&&x.v==='{'));
    if(x.k==='kw')return !['else','in','as'].includes(x.v);
    return true;
  };
  function expr(ns){return assign(ns);}
  function assign(ns){
    const l=range(ns);
    if(T().k==='punct'&&ASSIGN.has(T().v)){const op=toks[p++];return mk('Assign',op,{op:op.v,lhs:l,rhs:assign(ns),line:l.line,col:l.col});}
    return l;
  }
  function range(ns){
    const x=T();
    if(isP('..')||isP('..=')){p++;return mk('Range',x,{from:null,to:startsExpr(ns)?bin(4,ns):null,inclusive:x.v==='..='});}
    const l=bin(4,ns);
    if(isP('..')||isP('..=')){const o=toks[p++];return mk('Range',o,{from:l,to:startsExpr(ns)?bin(4,ns):null,inclusive:o.v==='..=',line:l.line,col:l.col});}
    return l;
  }
  function bin(min,ns){
    let l=unary(ns);
    for(;;){
      if(isK('as')){const o=toks[p++];l=mk('Cast',o,{expr:l,ty:ty(),line:l.line,col:l.col});continue;}
      const x=T();
      const pr=x.k==='punct'?BIN[x.v]:undefined;
      if(pr===undefined||pr<min)return l;
      p++;
      const r=bin(pr+1,ns);
      l=mk('Binary',x,{op:x.v,lhs:l,rhs:r,line:l.line,col:l.col,oline:x.line,ocol:x.col});
    }
  }
  function unary(ns){
    const x=T();
    if(isP('-')||isP('!')||isP('*')){p++;return mk(x.v==='*'?'Deref':'Unary',x,{op:x.v,expr:unary(ns)});}
    if(isP('&')||isP('&&')){
      p++;const mut=!!eatK('mut');let r=mk('Ref',x,{mut,expr:unary(ns)});
      if(x.v==='&&')r=mk('Ref',x,{mut:false,expr:r});return r;
    }
    return postfix(primary(ns),ns);
  }
  function postfix(e,ns){
    for(;;){
      const x=T();
      if(isP('?')){p++;e=mk('Try',x,{expr:e,line:e.line,col:e.col});continue;}
      if(isP('(')){p++;const args=exprList(')');e=mk('Call',x,{callee:e,args,line:e.line,col:e.col});continue;}
      if(isP('[')){p++;const i=expr(false);expP(']');e=mk('Index',x,{expr:e,index:i,line:e.line,col:e.col,bline:x.line,bcol:x.col});continue;}
      if(isP('.')){
        p++;const n=T();
        if(isK('await')){p++;feat('async',n.line);e=mk('Await',n,{expr:e});continue;}
        if(n.k==='int'){p++;e=mk('Field',n,{expr:e,name:n.v,line:e.line,col:e.col,nline:n.line});continue;}
        if(n.k==='float'&&/^\d+\.\d+$/.test(n.v)){p++;for(const part of n.v.split('.'))e=mk('Field',n,{expr:e,name:part,line:e.line,col:e.col});continue;}
        const id=ident();let targs=null;
        if(isP('::')&&isP('<',pk())){p+=2;targs=genericArgs();}
        if(isP('(')){p++;e=mk('MethodCall',id,{recv:e,name:id.v,targs,args:exprList(')'),line:e.line,col:e.col,nline:id.line,ncol:id.col});}
        else e=mk('Field',id,{expr:e,name:id.v,line:e.line,col:e.col,nline:id.line});
        continue;
      }
      return e;
    }
  }
  function exprList(close){
    const out=[];
    while(!isP(close)){out.push(expr(false));if(!eatP(','))break;}
    expP(close);return out;
  }
  function cond(){return expr(true);}
  function block(){
    const x=expP('{');
    const stmts=[];let tail=null;
    while(!isP('}')){
      if(T().k==='eof')fail('this file contains an unclosed delimiter');
      if(eatP(';'))continue;
      const at=attrs();
      const y=T();
      if(isItemStart()){stmts.push(mk('ItemStmt',y,{item:item(at)}));continue;}
      if(isK('let')){
        p++;const pt=pat();let t=null,init=null,els=null;
        if(eatP(':'))t=ty();
        if(eatP('=')){init=expr(false);if(eatK('else'))els=block();}
        semi();stmts.push(mk('Let',y,{pat:pt,ty:t,init,els}));continue;
      }
      if(isBlockLike()){
        const e=blockLike();
        if(isP('}')){tail=e;break;}
        if(eatP(';')){stmts.push(mk('ExprStmt',y,{expr:e,semi:true}));continue;}
        stmts.push(mk('ExprStmt',y,{expr:e,semi:false}));continue;
      }
      const e=expr(false);
      if(eatP(';')){stmts.push(mk('ExprStmt',y,{expr:e,semi:true}));continue;}
      if(isP('}')){tail=e;break;}
      if(e.t==='Macro'&&e.delim==='{'){stmts.push(mk('ExprStmt',y,{expr:e,semi:false}));continue;}
      semi();
    }
    expP('}');
    return mk('Block',x,{stmts,tail,unsafe:false,label:null});
  }
  function isBlockLike(){
    const x=T();
    if(x.k==='kw'&&BLOCKLIKE.has(x.v))return x.v!=='unsafe'||isP('{',pk());
    if(x.k==='lifetime'&&isP(':',pk()))return true;
    return isP('{');
  }
  function blockLike(){
    const x=T();
    if(x.k==='lifetime'){p+=2;const e=blockLike();e.label=x.v;return e;}
    if(isK('if'))return ifExpr();
    if(isK('match'))return matchExpr();
    if(isK('while')){p++;const c=cond();return mk('While',x,{cond:c,body:block(),label:null});}
    if(isK('loop')){p++;return mk('Loop',x,{body:block(),label:null});}
    if(isK('for')){p++;const pt=pat();expK('in');const it=cond();return mk('For',x,{pat:pt,iter:it,body:block(),label:null});}
    if(isK('unsafe')){p++;feat('unsafe',x.line);const b=block();b.unsafe=true;return b;}
    return block();
  }
  function ifExpr(){
    const x=expK('if');const c=cond(),then=block();let els=null;
    if(eatK('else'))els=isK('if')?ifExpr():block();
    return mk('If',x,{cond:c,then,els});
  }
  function matchExpr(){
    const x=expK('match');const scrut=cond();expP('{');const arms=[];
    while(!isP('}')){
      attrs();const a=T();const pt=pat();let guard=null;
      if(eatK('if'))guard=expr(false);
      expP('=>');
      let body;
      if(isP('{')){body=block();eatP(',');}
      else{body=expr(false);if(!eatP(',')&&!isP('}'))fail('expected `,` or `}`, found '+desc(T()));}
      arms.push(mk('Arm',a,{pat:pt,guard,body}));
    }
    expP('}');return mk('Match',x,{scrut,arms});
  }
  function closure(){
    const x=T();const mv=!!eatK('move');const params=[];
    if(!eatP('||')){expP('|');while(!isP('|')){const pt=patNoOr();let t=null;if(eatP(':'))t=ty();params.push({pat:pt,ty:t});if(!eatP(','))break;}expP('|');}
    let ret=null,body;
    if(eatP('->')){ret=ty();body=block();}else body=expr(false);
    return mk('Closure',x,{move:mv,params,ret,body});
  }
  function structLit(pa,x){
    expP('{');const fields=[];let base=null;
    while(!isP('}')){
      attrs();
      if(eatP('..')){base=expr(false);break;}
      const f=T();const n=f.k==='int'?toks[p++]:ident();
      if(eatP(':'))fields.push({name:n.v,expr:expr(false)});
      else fields.push({name:n.v,expr:mk('Path',f,{segs:[{name:n.v,args:null,fn:null,line:f.line}],global:false})});
      if(!eatP(','))break;
    }
    expP('}');return mk('StructLit',x,{path:pa,fields,base});
  }
  function macroCall(pa,x){
    const open=T(),close=open.k==='punct'?CLOSE[open.v]:null;
    if(!close)fail('expected one of `(`, `[`, or `{`, found '+desc(open));
    const name=pa.segs[pa.segs.length-1].name;p++;
    let args=null,repeat=null;const named=[];
    if(MACROS.has(name)&&pa.segs.length===1){
      args=[];
      while(!isP(close)){
        if(T().k==='ident'&&isP('=',pk())){const nm=T();p+=2;named.push({name:nm.v,expr:expr(false)});}
        else args.push(expr(false));
        if(name==='vec'&&args.length===1&&isP(';')){p++;repeat=expr(false);break;}
        if(!eatP(','))break;
      }
      expP(close);
    }else{skipTree(close);feat(name==='dbg'?'dbg!':'other macro',x.line);}
    return mk('Macro',x,{name,args,named,repeat,delim:open.v});
  }
  function primary(ns){
    const x=T();
    if(['int','float','str','char'].includes(x.k)){p++;return lit(x);}
    if(isK('true')||isK('false')){p++;return mk('Lit',x,{kind:'bool',v:x.v==='true'});}
    if(isP('(')){
      p++;if(eatP(')'))return mk('Tuple',x,{elems:[]});
      const first=expr(false);
      if(eatP(')'))return mk('Paren',x,{expr:first});
      const elems=[first];while(eatP(',')){if(isP(')'))break;elems.push(expr(false));}
      expP(')');return mk('Tuple',x,{elems});
    }
    if(isP('[')){
      p++;if(eatP(']'))return mk('Array',x,{elems:[]});
      const first=expr(false);
      if(eatP(';')){const len=expr(false);expP(']');return mk('ArrayRepeat',x,{elem:first,len});}
      const elems=[first];while(eatP(',')){if(isP(']'))break;elems.push(expr(false));}
      expP(']');return mk('Array',x,{elems});
    }
    if(isBlockLike())return blockLike();
    if(isK('let')){p++;const pt=pat();expP('=');return mk('LetCond',x,{pat:pt,expr:bin(6,true)});}
    if(isK('return')){p++;return mk('Return',x,{expr:startsExpr(ns)?expr(ns):null});}
    if(isK('break')){p++;let label=null;if(T().k==='lifetime')label=toks[p++].v;return mk('Break',x,{label,expr:startsExpr(ns)?expr(ns):null});}
    if(isK('continue')){p++;let label=null;if(T().k==='lifetime')label=toks[p++].v;return mk('Continue',x,{label});}
    if(isK('move')||isP('|')||isP('||'))return closure();
    if(isK('async')){feat('async',x.line);p++;if(isK('move'))p++;if(isP('{'))return block();return closure();}
    if(isK('const')&&isP('{',pk())){p++;return block();}
    if(x.k==='ident'||isK('self')||isK('Self')||isK('crate')||isK('super')||isP('::')||isP('<')){
      let pa;
      if(isP('<')){const t=ty();pa=t.t==='QPath'?t:fail('expected expression');}
      else pa=path(true);
      if(isP('!')&&!isP('=',pk())&&pa.t==='Path'){p++;return macroCall(pa,x);}
      if(!ns&&isP('{')&&pa.t==='Path'&&/^[A-Z]/.test(pa.segs[pa.segs.length-1].name))return structLit(pa,x);
      return pa;
    }
    return fail('expected expression, found '+desc(x));
  }

  function isItemStart(){
    const x=T();
    if(x.k==='ident')return (x.v==='macro_rules'&&isP('!',pk()))||(x.v==='union'&&pk().k==='ident'&&(isP('{',pk(2))||isP('<',pk(2))));
    if(x.k!=='kw')return false;
    if(['fn','struct','enum','impl','trait','type','use','mod','static','pub','extern'].includes(x.v))return true;
    if(x.v==='const')return !isP('{',pk());
    if(x.v==='unsafe')return ['fn','impl','trait','extern'].some(k=>isK(k,pk()));
    if(x.v==='async')return isK('fn',pk())||isK('unsafe',pk());
    return false;
  }
  const fnAhead=()=>{let q=p;while(at(q).k==='str'||(at(q).k==='kw'&&['const','async','unsafe','extern'].includes(at(q).v)))q++;return at(q).k==='kw'&&at(q).v==='fn';};
  function fnItem(ats,pub){
    const x=T();
    for(;;){
      if(isK('const')){feat('const fn',T().line);p++;}
      else if(isK('async')){feat('async',T().line);p++;}
      else if(isK('unsafe')){feat('unsafe',T().line);p++;}
      else if(isK('extern')){feat('extern',T().line);p++;if(T().k==='str')p++;}
      else break;
    }
    expK('fn');const name=ident();const gs=generics();
    expP('(');const ps=[];let selfParam=null,first=true;
    while(!isP(')')){
      attrs();
      let q=p;if(isP('&',at(q)))q++;if(at(q).k==='lifetime')q++;if(isK('mut',at(q)))q++;
      if(first&&isK('self',at(q))){
        const s=T();const ref=eatP('&');let lt=null;if(T().k==='lifetime')lt=toks[p++].v;
        const mut=!!eatK('mut');expK('self');
        let t=null;if(!ref&&eatP(':'))t=ty();
        selfParam=mk('SelfParam',s,{ref:!!ref,mut,lt,ty:t});
      }else{const pt=patNoOr();expP(':');ps.push({pat:pt,ty:ty()});}
      first=false;if(!eatP(','))break;
    }
    expP(')');
    const ret=eatP('->')?ty():null;const wh=where();
    let body=null;if(isP('{'))body=block();else semi();
    return mk('Fn',x,{name:name.v,generics:gs,selfParam,params:ps,ret,where:wh,body,attrs:ats,pub});
  }
  function fieldsNamed(){
    expP('{');const out=[];
    while(!isP('}')){attrs();vis();const n=ident();expP(':');out.push({name:n.v,ty:ty()});if(!eatP(','))break;}
    expP('}');return out;
  }
  function fieldsTuple(){
    expP('(');const out=[];
    while(!isP(')')){attrs();vis();out.push(ty());if(!eatP(','))break;}
    expP(')');return out;
  }
  function item(at){
    at=at||attrs();
    const x=T();
    const pub=vis();
    const y=T();
    if(isK('fn')||((isK('const')||isK('async')||isK('unsafe')||isK('extern'))&&fnAhead()))return fnItem(at,pub);
    if(isK('struct')){
      p++;const n=ident(),gs=generics();let kind='unit',fields=[];
      if(isP('(')){kind='tuple';fields=fieldsTuple();where();semi();}
      else{const wh=where();void wh;if(isP('{')){kind='named';fields=fieldsNamed();}else semi();}
      return mk('Struct',x,{name:n.v,generics:gs,kind,fields,attrs:at,pub});
    }
    if(isK('enum')){
      p++;const n=ident(),gs=generics();where();expP('{');const variants=[];
      while(!isP('}')){
        attrs();const v=ident();let kind='unit',fields=[],disc=null;
        if(isP('(')){kind='tuple';fields=fieldsTuple();}else if(isP('{')){kind='named';fields=fieldsNamed();}
        if(eatP('='))disc=expr(false);
        variants.push(mk('Variant',v,{name:v.v,kind,fields,disc}));
        if(!eatP(','))break;
      }
      expP('}');return mk('Enum',x,{name:n.v,generics:gs,variants,attrs:at,pub});
    }
    if(isK('unsafe')&&(isK('impl',pk())||isK('trait',pk()))){feat('unsafe',y.line);p++;}
    if(isK('impl')){
      p++;const gs=generics();eatP('!');const first=ty();let tr=null,self=first;
      if(eatK('for')){tr=first;self=ty();}
      const wh=where();void wh;expP('{');const items=[];
      while(!isP('}')){if(T().k==='eof')fail('this file contains an unclosed delimiter');items.push(item());}
      expP('}');return mk('Impl',x,{generics:gs,trait:tr,selfTy:self,items,attrs:at});
    }
    if(isK('trait')){
      p++;const n=ident(),gs=generics();let sup=[];if(eatP(':'))sup=bounds();where();expP('{');const items=[];
      while(!isP('}')){if(T().k==='eof')fail('this file contains an unclosed delimiter');items.push(item());}
      expP('}');return mk('Trait',x,{name:n.v,generics:gs,supers:sup,items,attrs:at,pub});
    }
    if(isK('const')||isK('static')){
      const isStatic=isK('static');p++;let mut=false;
      if(isStatic&&eatK('mut')){mut=true;feat('static mut',y.line);}
      const n=ident();expP(':');const t=ty();let init=null;
      if(eatP('='))init=expr(false);
      semi();return mk(isStatic?'Static':'Const',x,{name:n.v,ty:t,init,mut,attrs:at,pub});
    }
    if(isK('type')){
      p++;const n=ident(),gs=generics();let bs=[];if(eatP(':'))bs=bounds();where();let t=null;if(eatP('='))t=ty();where();semi();
      return mk('TypeAlias',x,{name:n.v,generics:gs,bounds:bs,ty:t,pub});
    }
    if(isK('use')){
      p++;let depth=0;
      while(T().k!=='eof'&&!(depth===0&&isP(';'))){const z=T();if(z.k==='punct'){if(z.v==='{')depth++;else if(z.v==='}')depth--;}if(z.k==='ident'&&OUT.has(z.v))feat(z.v,z.line);p++;}
      semi();return mk('Use',x,{pub});
    }
    if(isK('mod')){
      p++;const n=ident();
      if(eatP(';'))return mk('Mod',x,{name:n.v,items:null,pub});
      expP('{');const items=[];while(!isP('}')){if(T().k==='eof')fail('this file contains an unclosed delimiter');items.push(item());}
      expP('}');return mk('Mod',x,{name:n.v,items,pub});
    }
    if(isK('extern')){
      p++;feat('extern',y.line);if(T().k==='str')p++;
      if(isP('{')){p++;skipTree('}');}else{while(T().k!=='eof'&&!isP(';'))p++;semi();}
      return mk('Extern',x,{});
    }
    if(y.k==='ident'&&y.v==='macro_rules'&&isP('!',pk())){
      p+=2;ident();const open=T();const close=open.k==='punct'?CLOSE[open.v]:null;if(!close)fail('expected a macro body');
      p++;skipTree(close);if(close!=='}')eatP(';');feat('macro_rules',y.line);return mk('MacroRules',x,{});
    }
    if(y.k==='ident'&&y.v==='union'&&pk().k==='ident'){
      p++;ident();generics();feat('union',y.line);expP('{');skipTree('}');return mk('Union',x,{});
    }
    return fail('expected item, found '+desc(y));
  }

  const bad=toks.find(t=>t.k==='err');
  if(bad)return {ast:null,errors:[{line:bad.line,col:bad.col,msg:bad.v}],unsupported:un};
  const stack=[];
  for(const t of toks){
    if(t.k!=='punct')continue;
    if(CLOSE[t.v])stack.push(t);
    else if(t.v===')'||t.v===']'||t.v==='}'){
      const o=stack.pop();
      if(!o)return {ast:null,errors:[{line:t.line,col:t.col,msg:'unexpected closing delimiter: `'+t.v+'`'}],unsupported:un};
      if(CLOSE[o.v]!==t.v)return {ast:null,errors:[{line:t.line,col:t.col,msg:'mismatched closing delimiter: `'+t.v+'`'}],unsupported:un};
    }
  }
  if(stack.length){const o=stack[stack.length-1];return {ast:null,errors:[{line:o.line,col:o.col,msg:'this file contains an unclosed delimiter'}],unsupported:un};}
  try{
    while(isP('#')&&isP('!',pk()))attrs();
    const items=[];
    while(T().k!=='eof')items.push(item());
    return {ast:mk('Crate',toks[0],{items}),errors:[],unsupported:un};
  }catch(e){
    if(e&&e.perr)return {ast:null,errors:[{line:e.line,col:e.col,msg:e.msg}],unsupported:un};
    throw e;
  }
};
})();
