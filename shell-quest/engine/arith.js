(function (SQ) {
// Arithmetic evaluator for $(( )) / let / (( )): bash-style, 64-bit signed wrap-around via BigInt.
// SQ.arith(expr, env) -> decimal string; env = {get(name)->string, set(name, string)}.
const W=v=>BigInt.asIntN(64,v);
const OPS=['<<','>>','<=','>=','==','!=','&&','||','**','++','--','+=','-=','*=','/=','%='];
const ASSIGN=new Set(['=','+=','-=','*=','/=','%=']);
function pow(b,e){let r=1n;b=BigInt.asUintN(64,b);while(e>0n){if(e&1n)r=BigInt.asUintN(64,r*b);b=BigInt.asUintN(64,b*b);e>>=1n}return W(r)}
/* A variable's text is itself an expression (a="1+2"; $((a*2)) is 6). depth counts those nested evaluations: past 10 (a cycle such as a=b b=a) it stops. */
const MAX_DEPTH=10;
function arith(expr,env,depth){depth=depth||0;
  const fail=why=>{const e=new Error('bash: '+expr+': '+why);e.raw=true;return e};
  if(expr.length>200)throw fail('expression too long');
  if(!expr.trim())return '0';
  const toks=[];
  for(let i=0;i<expr.length;){
    const c=expr[i];
    if(/\s/.test(c)){i++;continue}
    let m;
    if((m=/^(0[xX][0-9a-fA-F]+|\d+)/.exec(expr.slice(i)))){
      const s=m[1];
      if(/^0[xX]/.test(s))toks.push({t:'n',v:BigInt(s)});
      else if(s.length>1&&s[0]==='0'){if(/[89]/.test(s))throw fail('value too great for base (error token is "'+s+'")');toks.push({t:'n',v:BigInt('0o'+s.slice(1))})}
      else toks.push({t:'n',v:BigInt(s)});
      i+=s.length;
    }else if((m=/^[A-Za-z_][A-Za-z0-9_]*/.exec(expr.slice(i)))){toks.push({t:'id',v:m[0]});i+=m[0].length}
    else{
      const two=expr.substr(i,2);
      if(OPS.includes(two)){toks.push({t:'op',v:two});i+=2}
      else if('+-*/%<>=!~&|^?:()'.includes(c)){toks.push({t:'op',v:c});i++}
      else throw fail('syntax error: invalid arithmetic operator (error token is "'+expr.slice(i)+'")');
    }
  }
  let p=0,skip=0;
  const syn=()=>fail('syntax error in expression');
  const peek=()=>toks[p]&&toks[p].t==='op'?toks[p].v:null;
  const eat=o=>{if(peek()===o){p++;return true}return false};
  const rd=n=>{const g=skip&&env.peek||env.get,s=String(g(n)==null?'':g(n)).trim(); /* peek: a read in a branch that is not evaluated (0 && x) skips set -u */if(/^[+-]?\d+$/.test(s))return W(BigInt(s));if(s==='')return 0n;
    if(depth>=MAX_DEPTH){const e=new Error('bash: expression recursion level exceeded');e.raw=true;throw e}
    return W(BigInt(arith(s,skip?{get:env.peek||env.get,set:()=>{}}:env,depth+1)))};
  const wr=(n,v)=>{if(!skip)env.set(n,String(v))};
  const V=v=>({v});
  function assign(){
    const l=ternary();
    const o=peek();
    if(l.n&&o&&ASSIGN.has(o)){
      p++;
      const r=assign().v;
      let v=r;
      if(o!=='='){
        const a=l.v;
        if(o==='+=')v=a+r;else if(o==='-=')v=a-r;else if(o==='*=')v=a*r;
        else{if(r===0n){if(!skip)throw fail('division by 0');v=0n}else v=o==='/='?a/r:a%r}
      }
      v=W(v);wr(l.n,v);return V(v);
    }
    return l;
  }
  function ternary(){
    const c=oror();
    if(!eat('?'))return c;
    const t=c.v!==0n;
    if(!t)skip++;const a=assign();if(!t)skip--;
    if(!eat(':'))throw syn();
    if(t)skip++;const b=ternary();if(t)skip--;
    return V(t?a.v:b.v);
  }
  function oror(){let l=andand();while(peek()==='||'){p++;const live=l.v===0n;if(!live)skip++;const r=andand();if(!live)skip--;l=V(l.v!==0n||r.v!==0n?1n:0n)}return l}
  function andand(){let l=bor();while(peek()==='&&'){p++;const live=l.v!==0n;if(!live)skip++;const r=bor();if(!live)skip--;l=V(l.v!==0n&&r.v!==0n?1n:0n)}return l}
  const bin=(next,ops,f)=>()=>{let l=next();for(;;){const o=peek();if(!o||!ops.includes(o))return l;p++;const r=next();l=V(W(f(o,l.v,r.v)))}};
  function unary(){
    const o=peek();
    if(o==='-'){p++;return V(W(-unary().v))}
    if(o==='+'){p++;return V(unary().v)}
    if(o==='!'){p++;return V(unary().v===0n?1n:0n)}
    if(o==='~'){p++;return V(W(~unary().v))}
    if(o==='++'||o==='--'){
      p++;const t=toks[p];if(!t||t.t!=='id')throw syn();p++;
      const v=W(rd(t.v)+(o==='++'?1n:-1n));wr(t.v,v);return V(v);
    }
    return power();
  }
  function power(){
    const b=postfix();
    if(!eat('**'))return b;
    const e=unary().v;
    if(e<0n)throw fail('exponent less than 0');
    return V(pow(b.v,e));
  }
  function postfix(){
    const t=toks[p];
    if(!t)throw syn();
    if(t.t==='n'){p++;return V(W(t.v))}
    if(t.t==='id'){
      p++;const v=rd(t.v);
      const o=peek();
      if(o==='++'||o==='--'){p++;wr(t.v,W(v+(o==='++'?1n:-1n)));return V(v)}
      return {v,n:t.v};
    }
    if(eat('(')){const r=assign();if(!eat(')'))throw syn();return V(r.v)}
    throw syn();
  }
  const mul=bin(unary,['*','/','%'],(o,a,b)=>{
    if(o==='*')return a*b;
    if(b===0n){if(skip)return 0n;throw fail('division by 0')}
    return o==='/'?a/b:a%b});
  const add=bin(mul,['+','-'],(o,a,b)=>o==='+'?a+b:a-b);
  const shift=bin(add,['<<','>>'],(o,a,b)=>{const n=b&63n;return o==='<<'?a<<n:a>>n});
  const rel=bin(shift,['<','<=','>','>='],(o,a,b)=>(o==='<'?a<b:o==='<='?a<=b:o==='>'?a>b:a>=b)?1n:0n);
  const eq=bin(rel,['==','!='],(o,a,b)=>((a===b)===(o==='=='))?1n:0n);
  const band=bin(eq,['&'],(o,a,b)=>a&b);
  const bxor=bin(band,['^'],(o,a,b)=>a^b);
  const bor=bin(bxor,['|'],(o,a,b)=>a|b);
  const r=assign();
  if(p<toks.length)throw syn();
  return String(r.v);
}
SQ.arith=arith;
})(window.SQ = window.SQ || {});
