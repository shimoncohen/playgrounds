/* awk-parse.js: the awk lexer and parser (DOM-free). SQ.awkParse(src) parses a whole program text before anything runs and returns:

   Program = { begin: Stmt[][], end: Stmt[][], rules: Rule[], funcs }   (begin/end: one statement list per BEGIN/END block, in order)
   Rule    = { pat: Expr|null, pat2: Expr|null, action: Stmt[]|null, line }   pat null = every record; pat2 set = range `pat, pat2`;
             action null = print $0 (a pattern-only rule)
   funcs   = { [name]: { name, params: string[], body: Stmt[], line } }   (an Object.create(null) map: look names up directly)

   Every Stmt has `line` (its first token's source line, for runtime messages) and `type`:
     print   { args: Expr[] }                 no args = print $0; `print (a, b)` is two args
     printf  { args: Expr[] }                 args[0] is the format, always present
     expr    { expr }
     if      { test, then: Stmt[], else: Stmt[]|null }
     while   { test, body: Stmt[] }
     do      { body: Stmt[], test }
     for     { init: Expr|null, test: Expr|null, step: Expr|null, body: Stmt[] }
     forin   { var: string, name: string, body: Stmt[] }    for (var in name)
     delete  { name, subs: Expr[]|null }      subs null = delete the whole array
     next, break, continue                    (no fields; break/continue only inside loops, next never in BEGIN/END: checked here)
     exit    { value: Expr|null }
     return  { value: Expr|null }             only inside a function body (checked here)
     block   { body: Stmt[] }                 a nested { } inside an action
   Loop/if bodies are always Stmt[] (a lone `;` body is [], a { } body is its statement list).

   Expr nodes (`type` and fields):
     num     { value: number }                str { value: string } (escapes done)     regex { source } (awk ERE text; `\/` became `/`,
                                                                                         other escapes kept raw for the regex translator)
     var     { name }                         field { expr }                           index { name, subs: Expr[] }   (a[i, j]: join subs with SUBSEP)
     assign  { op: '='|'+='|'-='|'*='|'/='|'%='|'^=', target: var|field|index, value }   (`**=` arrives as '^=')
     cond    { test, yes, no }                logical { op: '&&'|'||', left, right }
     in      { subs: Expr[], name }           (`k in a`, `(i, j) in a`)
     match   { op: '~'|'!~', left, right }    (right may be a regex node: use its source as the pattern, do not match it against $0)
     compare { op: '<'|'<='|'=='|'!='|'>'|'>=', left, right }
     concat  { left, right }                  binary { op: '+'|'-'|'*'|'/'|'%'|'^', left, right }   (`**` arrives as '^')
     unary   { op: '-'|'+'|'!', expr }        incdec { op: '++'|'--', prefix: boolean, target: var|field|index }
     call    { name, args: Expr[], builtin: boolean }   builtin: length (args [] means $0) substr index split sub gsub match sprintf
             sin cos atan2 exp log sqrt int rand srand tolower toupper, arity checked here; split's 2nd arg is a var node naming the
             array, sub/gsub's 3rd arg is an lvalue. A regex node used anywhere else as a value means ($0 ~ /re/).
             builtin false: a user function (defined somewhere in the program: checked here); array arguments arrive as var nodes.

   Precedence, lowest first (checked against mawk 1.3.4): assignment (right) < ?: (right) < || < && < ~ !~ < comparisons and `in`
   (left, one level, as in mawk) < concatenation < + - < * / % < unary ! - + < ^ ** (right; `2^-1` allowed) < ++ -- < $ < grouping.
   Concatenation never starts with + or - (`a " " -1` is a (" " - 1)); `$NF-1` is ($NF)-1, `$i++` is ($i)++, `!x++` is !(x++).
   Only a whole lvalue is assignable (`1 + x = 3` is a syntax error, as in mawk). Inside print/printf a bare `>` is a redirection.
   `/` is division after an operand (number, string, regex, name, builtin, `)`, `]`, `++`, `--`) and starts a regex anywhere else.
   Newlines end statements and pattern-only rules; they may follow && || , { else do and the ) of if/while/for/function; `;` is optional
   before } and between rules; a backslash-newline joins lines; # starts a comment. BEGIN/END need { on the same line.
   A user function call needs `name(` without a space unless the name is defined somewhere in the program (mawk).

   Errors throw an Error with awkErr:true and code 2. Syntax errors use the BWK awk shape:
     awk: syntax error at source line N\n context is <text before> >>> <token> <<< <text after>   (that source line, clipped)
   plus `awk: calling undefined function f\n source line number N`. Unsupported features throw (also unsup:true) the practice-shell
   message `this practice shell does not support awk X yet`, X one of: getline, system(), close(), fflush(), nextfile,
   output redirection (print/printf > or >>), pipes (print/printf | or |&), and gawk-only functions such as gensub() or systime().
   Caps: program text over 20,000 characters is refused; nesting (groups, subscripts, call arguments, blocks, statement bodies, unary
   operators, $, right-hand sides of assignment, ?: and ^) deeper than 100 throws `awk: nesting too deep`. Lexing and parsing are
   linear in the program length. SQ.awkLex(src) returns the token list (for tests). */
(function (SQ) {
const MAX_LEN=20000,MAX_DEPTH=100;
const KEYWORDS=new Set(['BEGIN','END','function','func','if','else','while','for','do','break','continue','next','nextfile','exit','return',
  'delete','in','getline','print','printf']);
/* builtin name -> [min args, max args] */
const BUILTINS={length:[0,1],substr:[2,3],index:[2,2],split:[2,3],sub:[2,3],gsub:[2,3],match:[2,2],sprintf:[1,Infinity],sin:[1,1],cos:[1,1],
  atan2:[2,2],exp:[1,1],log:[1,1],sqrt:[1,1],int:[1,1],rand:[0,0],srand:[0,1],tolower:[1,1],toupper:[1,1]};
const UNSUP_BUILTINS=new Set(['system','close','fflush']);
const GAWK_ONLY=new Set(['gensub','systime','strftime','mktime','asort','asorti','patsplit','strtonum','and','or','xor','lshift','rshift',
  'compl','isarray','typeof','bindtextdomain','dcgettext','dcngettext']);
const OPS3=['**='];
const OPS2=['+=','-=','*=','/=','%=','^=','==','<=','>=','!=','++','--','&&','||','>>','!~','**','|&'];
const OPS1='{}()[];,+-*/%^!><|?:~$=';
const ASSIGN=new Set(['=','+=','-=','*=','/=','%=','^=','**=']);
const CMP=new Set(['<','<=','==','!=','>','>=']);
const ESC={n:'\n',t:'\t',r:'\r',b:'\b',f:'\f',v:'\v',a:'\x07','"':'"','\\':'\\','/':'/'};

const fail=(msg,extra)=>Object.assign(new Error(msg),{awkErr:true,code:2},extra);
const unsup=x=>fail(`this practice shell does not support awk ${x} yet`,{unsup:true});
const isDigit=c=>c>='0'&&c<='9';
const isWordStart=c=>(c>='a'&&c<='z')||(c>='A'&&c<='Z')||c==='_';
const isWord=c=>isWordStart(c)||isDigit(c);

/* `awk: syntax error at source line N` and the source line around [pos, end) */
function syntaxError(src,pos,end,line){
  const ls=src.lastIndexOf('\n',pos-1)+1;let le=src.indexOf('\n',pos);if(le<0)le=src.length;if(end>le)end=le;
  let before=src.slice(ls,pos).trim(),after=src.slice(end,le).trim(),tok=src.slice(pos,end);
  if(before.length>40)before='...'+before.slice(-40);if(after.length>40)after=after.slice(0,40)+'...';if(tok.length>40)tok=tok.slice(0,40)+'...';
  return fail(`awk: syntax error at source line ${line}\n context is ${before} >>> ${tok} <<< ${after}`.trimEnd());
}

/* ---- lexer: one pass, tokens {t, v, pos, end, line}. t: num str regex name func(name directly followed by '(') builtin kw op nl eof ---- */
function lex(src){
  const toks=[],n=src.length;let i=0,line=1;
  const push=(t,v,pos)=>{toks.push({t,v,pos,end:i,line})};
  const bad=(pos,end)=>syntaxError(src,pos,end,line);
  /* a '/' after an operand divides; anywhere else it opens a regex */
  const divides=()=>{const p=toks[toks.length-1];if(!p)return false;
    return p.t==='num'||p.t==='str'||p.t==='regex'||p.t==='name'||p.t==='builtin'||(p.t==='op'&&(p.v===')'||p.v===']'||p.v==='++'||p.v==='--'))};
  while(i<n){const c=src[i],pos=i;
    if(c===' '||c==='\t'||c==='\r'||c==='\f'||c==='\v'){i++;continue}
    if(c==='\\'){if(src[i+1]==='\n'){i+=2;line++;continue}if(src[i+1]==='\r'&&src[i+2]==='\n'){i+=3;line++;continue}throw bad(i,i+1)}
    if(c==='#'){while(i<n&&src[i]!=='\n')i++;continue}
    if(c==='\n'){i++;push('nl','\n',pos);line++;continue}
    if(isDigit(c)||(c==='.'&&isDigit(src[i+1]||''))){
      while(i<n&&isDigit(src[i]))i++;
      if(src[i]==='.'){i++;while(i<n&&isDigit(src[i]))i++}
      if((src[i]==='e'||src[i]==='E')){let j=i+1;if(src[j]==='+'||src[j]==='-')j++;if(isDigit(src[j]||'')){i=j;while(i<n&&isDigit(src[i]))i++}}
      push('num',Number(src.slice(pos,i)),pos);continue}
    if(c==='"'){i++;let s='';const startLine=line;
      for(;;){if(i>=n||src[i]==='\n'){const e=i;line=startLine;throw bad(pos,e)}
        const d=src[i];
        if(d==='"'){i++;break}
        if(d!=='\\'){s+=d;i++;continue}
        const e=src[i+1];
        if(e==='\n'){i+=2;line++;continue}
        if(e==='\r'&&src[i+2]==='\n'){i+=3;line++;continue}
        if(e>='0'&&e<='7'){let j=i+1,v=0;while(j<i+4&&src[j]>='0'&&src[j]<='7'){v=v*8+(src.charCodeAt(j)-48);j++}s+=String.fromCharCode(v&255);i=j;continue}
        if(e!==undefined&&ESC[e]!==undefined){s+=ESC[e];i+=2;continue}
        if(e===undefined){i++;continue}
        s+='\\'+e;i+=2}
      toks.push({t:'str',v:s,pos,end:i,line:startLine});continue}
    if(c==='/'&&!divides()){i++;let s='',inBr=false;
      for(;;){if(i>=n||src[i]==='\n')throw bad(pos,i);
        const d=src[i];
        if(d==='\\'){const e=src[i+1];if(e===undefined||e==='\n')throw bad(pos,i+1);s+=(e==='/'?'/':'\\'+e);i+=2;continue}
        if(inBr){if(d===']')inBr=false;s+=d;i++;continue}
        if(d==='['){inBr=true;s+=d;i++;if(src[i]==='^'){s+='^';i++}if(src[i]===']'){s+=']';i++}continue}
        if(d==='/'){i++;break}
        s+=d;i++}
      push('regex',s,pos);continue}
    if(isWordStart(c)){while(i<n&&isWord(src[i]))i++;const w=src.slice(pos,i);
      if(w==='getline')throw unsup('getline');
      if(w==='nextfile')throw unsup('nextfile');
      if(UNSUP_BUILTINS.has(w))throw unsup(w+'()');
      if(KEYWORDS.has(w))push('kw',w,pos);
      else if(SQ.own(BUILTINS,w))push('builtin',w,pos);
      else push(src[i]==='('?'func':'name',w,pos);
      continue}
    let op=null;
    for(const o of OPS3)if(src.startsWith(o,i)){op=o;break}
    if(!op)for(const o of OPS2)if(src.startsWith(o,i)){op=o;break}
    if(!op&&OPS1.includes(c))op=c;
    if(!op)throw bad(i,i+1);
    /* after an operand `/=` divides-and-assigns; a regex was handled above */
    i+=op.length;push('op',op,pos)}
  toks.push({t:'eof',v:'',pos:n,end:n,line});
  return toks;
}

/* ---- parser ---- */
function awkParse(src){
  src=String(src);
  if(src.length>MAX_LEN)throw fail('awk: program too large for this practice shell (over 20,000 characters)');
  const toks=lex(src);
  /* function names defined anywhere (so `f (x)` with a space can still call a function defined later) */
  const funcNames=new Set();
  for(let j=0;j+1<toks.length;j++)if(toks[j].t==='kw'&&(toks[j].v==='function'||toks[j].v==='func')&&(toks[j+1].t==='name'||toks[j+1].t==='func'))funcNames.add(toks[j+1].v);
  let k=0,depth=0,loops=0,inPrint=false,printGroup=-1,inFunc=false,inBeginEnd=false;
  const calls=[];
  const peek=()=>toks[k],ahead=d=>toks[Math.min(k+d,toks.length-1)];
  const next=()=>toks[k<toks.length-1?k++:k];
  const isOp=(t,v)=>t.t==='op'&&t.v===v,isKw=(t,v)=>t.t==='kw'&&t.v===v;
  const err=t=>syntaxError(src,t.pos,t.end,t.line);
  const expectOp=v=>{const t=peek();if(!isOp(t,v))throw err(t);return next()};
  const skipNl=()=>{while(peek().t==='nl')k++};
  const nest=f=>{if(++depth>MAX_DEPTH)throw fail('awk: nesting too deep');try{return f()}finally{depth--}};
  /* run f with print's bare-`>` rule switched off (inside ( ), [ ] and call arguments) */
  const plain=f=>{const s=inPrint,g=printGroup;inPrint=false;printGroup=-1;try{return f()}finally{inPrint=s;printGroup=g}};
  const isLvalue=e=>e.type==='var'||e.type==='field'||e.type==='index';
  const varName=t=>{if(t.t!=='name')throw err(t);if(funcNames.has(t.v))throw err(t);return t.v};

  /* comma-separated expressions up to `close` (newlines allowed after commas) */
  function exprList(close){const out=[];
    if(isOp(peek(),close)){next();return out}
    for(;;){out.push(expr());const t=peek();
      if(isOp(t,',')){next();skipNl();continue}
      if(isOp(t,close)){next();return out}
      throw err(t)}}

  function expr(){
    const lhs=ternary(),t=peek();
    if(t.t==='op'&&ASSIGN.has(t.v)){
      if(!isLvalue(lhs))throw err(t);
      next();const value=nest(expr);
      return {type:'assign',op:t.v==='**='?'^=':t.v,target:lhs,value};
    }
    return lhs;
  }
  function ternary(){
    const test=orExpr();
    if(!isOp(peek(),'?'))return test;
    next();const yes=nest(expr);expectOp(':');const no=nest(expr);
    return {type:'cond',test,yes,no};
  }
  function orExpr(){let left=andExpr();
    while(isOp(peek(),'||')){next();skipNl();left={type:'logical',op:'||',left,right:andExpr()}}
    return left}
  function andExpr(){let left=matchExpr();
    while(isOp(peek(),'&&')){next();skipNl();left={type:'logical',op:'&&',left,right:matchExpr()}}
    return left}
  function matchExpr(){let left=compareExpr();
    for(;;){const t=peek();if(!(isOp(t,'~')||isOp(t,'!~')))return left;next();left={type:'match',op:t.v,left,right:compareExpr()}}}
  function compareExpr(){let left=concatExpr();
    for(;;){const t=peek();
      if(t.t==='op'&&CMP.has(t.v)&&!(inPrint&&t.v==='>')){next();left={type:'compare',op:t.v,left,right:concatExpr()};continue}
      if(isKw(t,'in')){next();left={type:'in',subs:[left],name:varName(next())};continue}
      return left}}
  /* can this token start the right operand of a concatenation? (never + or -, and never a regex: `/` after an operand divides) */
  const startsConcat=t=>t.t==='num'||t.t==='str'||t.t==='name'||t.t==='func'||t.t==='builtin'||
    (t.t==='op'&&(t.v==='$'||t.v==='!'||t.v==='('||t.v==='++'||t.v==='--'));
  function concatExpr(){let left=additive();
    while(startsConcat(peek()))left={type:'concat',left,right:additive()};
    return left}
  function additive(){let left=multiplicative();
    for(;;){const t=peek();if(!(isOp(t,'+')||isOp(t,'-')))return left;next();left={type:'binary',op:t.v,left,right:multiplicative()}}}
  function multiplicative(){let left=unary();
    for(;;){const t=peek();if(!(isOp(t,'*')||isOp(t,'/')||isOp(t,'%')))return left;next();left={type:'binary',op:t.v,left,right:unary()}}}
  function unary(){const t=peek();
    if(isOp(t,'!')||isOp(t,'-')||isOp(t,'+')){next();return {type:'unary',op:t.v,expr:nest(unary)}}
    return power()}
  function power(){const base=postfix(),t=peek();
    if(!(isOp(t,'^')||isOp(t,'**')))return base;
    next();return {type:'binary',op:'^',left:base,right:nest(powerRhs)}}
  function powerRhs(){const t=peek();
    if(isOp(t,'!')||isOp(t,'-')||isOp(t,'+')){next();return {type:'unary',op:t.v,expr:nest(powerRhs)}}
    return power()}
  function postfix(){const e=prefix(),t=peek();
    if(isLvalue(e)&&(isOp(t,'++')||isOp(t,'--'))){next();return {type:'incdec',op:t.v,prefix:false,target:e}}
    return e}
  /* ++x, --x and $: `$` takes a primary (or a prefix ++/--, unary sign or another $), so $NF-1 is ($NF)-1 and $i++ is ($i)++ */
  function prefix(){const t=peek();
    if(isOp(t,'++')||isOp(t,'--')){next();const target=nest(prefix);if(!isLvalue(target))throw err(t);return {type:'incdec',op:t.v,prefix:true,target}}
    if(isOp(t,'$')){next();return {type:'field',expr:nest(dollarOperand)}}
    return primary()}
  function dollarOperand(){const t=peek();
    if(isOp(t,'-')||isOp(t,'+')||isOp(t,'!')){next();return {type:'unary',op:t.v,expr:nest(dollarOperand)}}
    return prefix()}
  function call(t,name,builtin){
    expectOp('(');
    const args=nest(()=>plain(()=>exprList(')')));
    if(builtin){const [lo,hi]=BUILTINS[name];if(args.length<lo||args.length>hi)throw err(t);
      if(name==='split'&&args[1].type!=='var')throw err(t);
      if((name==='sub'||name==='gsub')&&args.length===3&&!isLvalue(args[2]))throw err(t);
    }else calls.push({name,line:t.line});
    return {type:'call',name,builtin,args};
  }
  function primary(){const t=peek();
    switch(t.t){
      case 'num':next();return {type:'num',value:t.v};
      case 'str':next();return {type:'str',value:t.v};
      case 'regex':next();return {type:'regex',source:t.v};
      case 'func':next();return call(t,t.v,false);
      case 'builtin':next();
        if(isOp(peek(),'('))return call(t,t.v,true);
        if(t.v==='length')return {type:'call',name:'length',builtin:true,args:[]};
        throw err(peek());
      case 'name':next();
        if(isOp(peek(),'[')){next();const subs=nest(()=>plain(()=>exprList(']')));if(!subs.length)throw err(t);return {type:'index',name:varName(t),subs}}
        if(funcNames.has(t.v)&&isOp(peek(),'('))return call(t,t.v,false);
        return {type:'var',name:varName(t)};
      case 'op':
        if(t.v==='('){const open=k;next();
          const list=nest(()=>plain(()=>exprList(')')));
          if(!list.length)throw err(peek());
          if(list.length===1)return list[0];
          const after=peek();
          if(isKw(after,'in')){next();return {type:'in',subs:list,name:varName(next())}}
          if(open===printGroup&&printEnd(after))return {type:'grouping',exprs:list};
          throw err(after)}
    }
    throw err(t);
  }

  /* ---- statements ---- */
  const printEnd=t=>t.t==='nl'||t.t==='eof'||(t.t==='op'&&(t.v===';'||t.v==='}'||t.v==='>'||t.v==='>>'||t.v==='|'||t.v==='|&'));
  /* a simple statement ends at ; or a newline (consumed), or before } */
  function simpleEnd(){const t=peek();
    if(t.t==='nl'||isOp(t,';')){next();return}
    if(isOp(t,'}'))return;
    throw err(t)}
  function stmtList(){const out=[];
    for(;;){const t=peek();
      if(t.t==='nl'||isOp(t,';')){next();continue}
      if(isOp(t,'}')||t.t==='eof')return out;
      out.push(statement())}}
  /* `{ ... }` with its statements; the caller has checked the { */
  function block(){return nest(()=>{next();const body=stmtList();expectOp('}');return body})}
  /* the body of if/else/while/do/for: one statement, `;` (empty) or a block (its list) */
  function body(){skipNl();return nest(()=>{const t=peek();
    if(isOp(t,';')){next();return []}
    if(isOp(t,'{'))return block();
    return [statement()]})}
  const loopBody=()=>{loops++;try{return body()}finally{loops--}};
  function printStmt(t){
    let args=[];
    const s=inPrint,g=printGroup;inPrint=true;
    try{if(!printEnd(peek())){printGroup=isOp(peek(),'(')?k:-1;args=[expr()];
      while(isOp(peek(),',')){next();skipNl();args.push(expr())}}}
    finally{inPrint=s;printGroup=g}
    if(args.length===1&&args[0].type==='grouping')args=args[0].exprs;
    const p=peek();
    if(isOp(p,'>')||isOp(p,'>>'))throw unsup('output redirection');
    if(isOp(p,'|')||isOp(p,'|&'))throw unsup('pipes');
    if(t.v==='printf'&&!args.length)throw err(p);
    simpleEnd();
    return {type:t.v,args,line:t.line};
  }
  function statement(){const t=peek(),line=t.line;
    if(isOp(t,'{'))return {type:'block',body:block(),line};
    if(t.t==='kw')switch(t.v){
      case 'print':case 'printf':next();return printStmt(t);
      case 'if':{next();expectOp('(');const test=plain(expr);expectOp(')');
        const then=body();
        const save=k;skipNl();
        if(!isKw(peek(),'else')){k=save;return {type:'if',test,then,else:null,line}}
        next();return {type:'if',test,then,else:body(),line}}
      case 'while':{next();expectOp('(');const test=plain(expr);expectOp(')');return {type:'while',test,body:loopBody(),line}}
      case 'do':{next();const b=loopBody();skipNl();if(!isKw(peek(),'while'))throw err(peek());next();
        expectOp('(');const test=plain(expr);expectOp(')');simpleEnd();return {type:'do',body:b,test,line}}
      case 'for':{next();expectOp('(');
        const a=peek(),b=ahead(1),c=ahead(2),d=ahead(3);
        if(a.t==='name'&&isKw(b,'in')&&c.t==='name'&&isOp(d,')')){k+=4;return {type:'forin',var:varName(a),name:varName(c),body:loopBody(),line}}
        const init=isOp(peek(),';')?null:plain(expr);expectOp(';');skipNl();
        const test=isOp(peek(),';')?null:plain(expr);expectOp(';');skipNl();
        const step=isOp(peek(),')')?null:plain(expr);expectOp(')');
        return {type:'for',init,test,step,body:loopBody(),line}}
      case 'break':case 'continue':next();if(!loops)throw err(t);simpleEnd();return {type:t.v,line};
      case 'next':next();if(inBeginEnd)throw err(t);simpleEnd();return {type:'next',line};
      case 'exit':case 'return':{next();if(t.v==='return'&&!inFunc)throw err(t);
        const value=printEnd(peek())?null:expr();simpleEnd();return {type:t.v,value,line}}
      case 'delete':{next();const name=varName(next());let subs=null;
        if(isOp(peek(),'[')){next();subs=nest(()=>plain(()=>exprList(']')));if(!subs.length)throw err(peek())}
        simpleEnd();return {type:'delete',name,subs,line}}
      default:throw err(t);
    }
    const e=expr();simpleEnd();return {type:'expr',expr:e,line};
  }

  /* ---- program ---- */
  const prog={begin:[],end:[],rules:[],funcs:Object.create(null)};
  for(;;){const t=peek();
    if(t.t==='nl'||isOp(t,';')){next();continue}
    if(t.t==='eof')break;
    if(isKw(t,'BEGIN')||isKw(t,'END')){next();if(!isOp(peek(),'{'))throw err(peek());
      inBeginEnd=true;const b=block();inBeginEnd=false;(t.v==='BEGIN'?prog.begin:prog.end).push(b);continue}
    if(isKw(t,'function')||isKw(t,'func')){next();const nt=next();
      if(nt.t!=='name'&&nt.t!=='func')throw err(nt);
      if(prog.funcs[nt.v])throw err(nt);
      expectOp('(');const params=[];
      if(!isOp(peek(),')'))for(;;){const p=next();if(p.t!=='name'||funcNames.has(p.v)||params.includes(p.v))throw err(p);params.push(p.v);
        if(isOp(peek(),',')){next();skipNl();continue}break}
      expectOp(')');skipNl();if(!isOp(peek(),'{'))throw err(peek());
      inFunc=true;const b=block();inFunc=false;
      prog.funcs[nt.v]={name:nt.v,params,body:b,line:t.line};continue}
    if(isOp(t,'{')){prog.rules.push({pat:null,pat2:null,action:block(),line:t.line});continue}
    const pat=expr();let pat2=null;
    if(isOp(peek(),',')){next();skipNl();pat2=expr()}
    let action=null;
    if(isOp(peek(),'{'))action=block();
    else{const e=peek();if(!(e.t==='nl'||e.t==='eof'||isOp(e,';')))throw err(e)}
    prog.rules.push({pat,pat2,action,line:t.line});
  }
  for(const c of calls)if(!prog.funcs[c.name]){
    if(GAWK_ONLY.has(c.name))throw unsup(c.name+'()');
    throw fail(`awk: calling undefined function ${c.name}\n source line number ${c.line}`);
  }
  return prog;
}

Object.assign(SQ,{awkParse,awkLex:lex});
})(window.SQ = window.SQ || {});
