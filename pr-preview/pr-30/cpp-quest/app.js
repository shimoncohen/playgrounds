
/* ===== Mini C++ engine: lexer, parser, checker, stepping runtime ===== */
const CPP=(()=>{
class CErr extends Error{constructor(msg,line,col,tip,kind){super(msg);this.line=line||0;this.col=col||0;this.tip=tip||'';this.kind=kind||'error'}}
const RT=(msg,line,tip,head)=>{const e=new CErr(msg,line,0,tip,'runtime');e.head=head||'';return e};

/* ---------- types ---------- */
const T=b=>({base:b});
const TINT=T('int'),TLONG=T('long'),TDBL=T('double'),TBOOL=T('bool'),TCHAR=T('char'),TSTR=T('string'),TVOID=T('void'),
  TOUT=T('ostream'),TIN=T('istream'),TENDL=T('endl'),TMANIP=T('manip'),TITER=T('iter'),TNULL={base:'ptr',to:null,isNull:true};
const NUM=new Set(['int','long','double','bool','char']);
const PRIMS=new Set(['int','double','float','bool','char','void','long','short','auto','unsigned','size_t']);
function tstr(t){if(!t)return '?';switch(t.base){case 'vector':return 'vector<'+tstr(t.elem)+'>';case 'array':return tstr(t.elem)+'['+t.n+']';
  case 'struct':return t.name;case 'ptr':return t.to?tstr(t.to)+'*':'nullptr';case 'init':return 'initializer list';default:return t.base}}
const isNumT=t=>!!t&&NUM.has(t.base);
const isIntT=t=>!!t&&(t.base==='int'||t.base==='long'||t.base==='bool'||t.base==='char');

/* ---------- lexer ---------- */
const KW=new Set(['if','else','while','for','do','return','break','continue','struct','class','const','true','false','using','namespace','switch','case','default','nullptr','static_cast','new','delete','sizeof','unsigned','typedef']);
const OPS=['<<=','>>=','::','->','++','--','+=','-=','*=','/=','%=','==','!=','<=','>=','&&','||','<<','>>','+','-','*','/','%','=','<','>','!','&','|','^','~','?',':',';',',','.','(',')','{','}','[',']'];
function lex(src){
  const toks=[];let i=0,line=1,col=1;const n=src.length;
  const adv=k=>{for(let j=0;j<k;j++){if(src[i]==='\n'){line++;col=1}else col++;i++}};
  while(i<n){const c=src[i];
    if(c===' '||c==='\t'||c==='\r'||c==='\n'){adv(1);continue}
    if(c==='/'&&src[i+1]==='/'){while(i<n&&src[i]!=='\n')adv(1);continue}
    if(c==='/'&&src[i+1]==='*'){const sl=line,sc=col;adv(2);while(i<n&&!(src[i]==='*'&&src[i+1]==='/'))adv(1);
      if(i>=n)throw new CErr('unterminated comment',sl,sc,'A comment that starts with /* needs a closing */ somewhere after it.');adv(2);continue}
    const L=line,C=col;
    if(c==='#'){let j=i;while(j<n&&src[j]!=='\n')j++;const text=src.slice(i,j);adv(j-i);toks.push({t:'pp',v:text.trim(),line:L,col:C});continue}
    if(/[A-Za-z_]/.test(c)){let j=i;while(j<n&&/\w/.test(src[j]))j++;const w=src.slice(i,j);adv(j-i);toks.push({t:KW.has(w)?'kw':'id',v:w,line:L,col:C});continue}
    if(/\d/.test(c)||(c==='.'&&/\d/.test(src[i+1]||''))){const m=src.slice(i).match(/^(\d+\.\d*|\.\d+|\d+)([eE][+-]?\d+)?([fFlLuU]*)/);
      const isD=/[.eE]/.test(m[1]+(m[2]||''))||/f/i.test(m[3]);adv(m[0].length);toks.push({t:'num',v:parseFloat(m[1]+(m[2]||'')),isD,line:L,col:C,raw:m[0]});continue}
    if(c==='"'||c==="'"){const q=c;let j=i+1,s='';
      while(j<n&&src[j]!==q){if(src[j]==='\n')break;if(src[j]==='\\'&&j+1<n){const e=src[j+1];s+=({n:'\n',t:'\t','0':'\0','\\':'\\','"':'"',"'":"'",a:'\x07',r:'\r'})[e]??e;j+=2;continue}s+=src[j];j++}
      if(j>=n||src[j]!==q){if(q==='"')throw new CErr('missing terminating " character',L,C,'Text in double quotes has to start and end on the same line. Add the closing " before the end of the line.');
        throw new CErr("missing terminating ' character",L,C,"A single character goes in single quotes, like 'A'. For text, use double quotes: \"Hello\".")}
      adv(j+1-i);
      if(q==="'"){if(s.length!==1)throw new CErr(s.length?'multi-character character constant':'empty character constant',L,C,"Single quotes hold exactly one character, like 'A'. For words, use double quotes: \""+s+"\".");
        toks.push({t:'chr',v:s.charCodeAt(0),line:L,col:C})}
      else toks.push({t:'str',v:s,line:L,col:C});continue}
    if('“”‘’'.includes(c))throw new CErr(`stray '${c}' in program`,L,C,'Those are curly quotes, the kind word processors and some websites use. C++ only understands straight quotes: " and \'.');
    const op=OPS.find(o=>src.startsWith(o,i));
    if(!op)throw new CErr(`stray '${c}' in program`,L,C,`The character ${c} has no meaning in C++ here. Delete it.`);
    adv(op.length);toks.push({t:'op',v:op,line:L,col:C})}
  return toks}

/* ---------- parser ---------- */
const ASSIGN=new Set(['=','+=','-=','*=','/=','%=']);
const PREC=[['||'],['&&'],['==','!='],['<','>','<=','>='],['<<','>>'],['+','-'],['*','/','%']];
function parse(src){
  const toks=lex(src);const lastLine=toks.length?toks[toks.length-1].line:1;
  const EOF={t:'eof',v:'end of input',line:lastLine,col:999};
  let p=0;const structs=new Map();
  const prog={includes:new Set(),includeLines:{},usingStd:false,funcs:new Map(),structs,globals:[],items:[],src};
  const peek=(k=0)=>toks[p+k]||EOF;
  const is=(v,k=0)=>{const t=peek(k);return (t.t==='op'||t.t==='kw')&&t.v===v};
  const next=()=>toks[p++]||EOF;
  const prev=()=>toks[p-1]||toks[0]||EOF;
  function expect(v){if(is(v))return next();const t=peek();
    if(v===';'){const pt=prev();throw new CErr(`expected ';' before '${t.v}'`,pt.line,pt.col+String(pt.v).length,`Every statement ends with a semicolon. Add ; at the end of line ${pt.line}.`)}
    if(t.t==='eof'&&v==='}')throw new CErr("expected '}' at end of input",t.line,1,'A { was opened but never closed. Count your braces: every { needs a matching }.');
    if(v===')')throw new CErr(`expected ')' before '${t.v}'`,t.line,t.col,'A ( was opened but not closed. Every ( needs a matching ).');
    throw new CErr(`expected '${v}' before '${t.v}'`,t.line,t.col)}
  function closeAngle(){if(is('>')){next();return}if(is('>>')){const t=peek();toks.splice(p,1,{t:'op',v:'>',line:t.line,col:t.col},{t:'op',v:'>',line:t.line,col:t.col+1});next();return}expect('>')}
  function looksLikeType(){const t=peek();if(t.t==='kw'&&(t.v==='const'||t.v==='unsigned'))return true;if(t.t!=='id')return false;
    if(t.v==='std'&&is('::',1)){const n=peek(2);return n.v==='string'||n.v==='vector'}
    return PRIMS.has(t.v)||t.v==='string'||t.v==='vector'||structs.has(t.v)}
  function parseType(){let isConst=false;if(is('const')){next();isConst=true}
    let std=false;if(peek().v==='std'&&is('::',1)){next();next();std=true}
    const t=next();let ty;
    if(t.v==='unsigned'){if(['int','long','char','short'].includes(peek().v))next();ty={base:'int'}}
    else if(t.v==='int'||t.v==='short'||t.v==='size_t')ty={base:'int'};
    else if(t.v==='long'){if(peek().v==='long')next();if(peek().v==='int')next();ty={base:'long'}}
    else if(t.v==='double'||t.v==='float')ty={base:'double',float:t.v==='float'};
    else if(t.v==='bool'||t.v==='char'||t.v==='void'||t.v==='auto')ty={base:t.v};
    else if(t.v==='string')ty={base:'string'};
    else if(t.v==='vector'){expect('<');const el=parseType();closeAngle();ty={base:'vector',elem:el}}
    else if(structs.has(t.v))ty={base:'struct',name:t.v};
    else throw new CErr(`'${t.v}' does not name a type`,t.line,t.col);
    ty.line=t.line;ty.col=t.col;ty.std=std;ty.word=t.v;
    if(isConst)ty.isConst=true;if(is('const')){next();ty.isConst=true}
    while(is('*')){next();ty={base:'ptr',to:ty,line:t.line,col:t.col,std}}
    if(is('&')){next();ty.ref=true}
    return ty}
  function isDecl(){if(!looksLikeType())return false;const save=p;try{parseType();return peek().t==='id'}catch(e){return false}finally{p=save}}

  function parseStruct(){const kw=next();const nm=next();if(nm.t!=='id')throw new CErr('expected a name after struct',nm.line,nm.col,'Give your struct a name, like: struct Player { ... };');
    const def={name:nm.v,fields:[],line:nm.line};structs.set(nm.v,def);expect('{');
    while(!is('}')){if(peek().t==='eof')expect('}');
      if(!looksLikeType()){const t=peek();throw new CErr(`expected a field type before '${t.v}'`,t.line,t.col,'Inside a struct, each line declares a field with a type, like: int hp;')}
      const ty=parseType();
      for(;;){const id=next();if(id.t!=='id')throw new CErr(`expected a field name before '${id.v}'`,id.line,id.col);
        if(is('(')){throw new CErr('member functions are not part of this course',id.line,id.col,'This playground keeps structs simple: data only. Write the function outside the struct and pass the struct in, like: void heal(Player& p).')}
        const f={name:id.v,type:ty,line:id.line};if(is('[')){next();const sz=next();expect(']');f.type={base:'array',elem:ty,n:sz.v,line:id.line}}
        if(is('=')){next();f.init=parseTern()}else if(is('{')){f.init=parsePrimary()}
        def.fields.push(f);if(is(',')){next();continue}break}
      expect(';')}
    next();if(!is(';')){const t=prev();throw new CErr("expected ';' after struct definition",t.line,t.col+1,'A struct definition ends with }; — the closing brace and then a semicolon.')}next();
    prog.items.push({kind:'struct',def})}

  function parseParams(){const ps=[];expect('(');if(is(')')){next();return ps}if(peek().v==='void'&&is(')',1)){next();next();return ps}
    for(;;){if(!looksLikeType()){const t=peek();throw new CErr(`expected a parameter type before '${t.v}'`,t.line,t.col,'Each parameter needs a type and a name, like: int damage')}
      let ty=parseType();let name='';if(peek().t==='id')name=next().v;
      if(is('[')){next();if(!is(']'))next();expect(']');ty={base:'ptr',to:ty,arrParam:true,line:ty.line}}
      ps.push({type:ty,name});if(is(',')){next();continue}expect(')');return ps}}

  function parseTop(){
    while(peek().t!=='eof'){const t=peek();
      if(t.t==='pp'){next();const m=t.v.match(/^#\s*include\s*[<"]\s*([\w.\/]+)\s*[>"]/);
        if(m){prog.includes.add(m[1]);prog.includeLines[m[1]]=t.line;continue}
        if(/^#\s*include/.test(t.v))throw new CErr('#include expects "FILENAME" or <FILENAME>',t.line,t.col,'Write it like: #include <iostream>');
        if(/^#\s*define/.test(t.v))throw new CErr('#define is not supported in this playground',t.line,t.col,'Use a constant instead: const int MAX = 10;');
        throw new CErr(`invalid preprocessing directive ${t.v.split(/\s/)[0]}`,t.line,t.col,'Lines starting with # are instructions for the preprocessor. The one you need most is #include <iostream>.')}
      if(is('using')){next();if(!is('namespace')){const u=peek();throw new CErr(`expected 'namespace' before '${u.v}'`,u.line,u.col,'The line is: using namespace std;')}next();const ns=next();if(ns.v!=='std')throw new CErr(`'${ns.v}' is not a namespace-name`,ns.line,ns.col,'The standard library lives in the namespace std. Write: using namespace std;');expect(';');prog.usingStd=true;prog.usingLine=t.line;continue}
      if(is('struct')){parseStruct();continue}
      if(is('class')){throw new CErr('classes are not part of this course',t.line,t.col,'Use struct instead. A struct groups data the same way, and everything in it is public.')}
      if(is(';')){next();continue}
      if(!looksLikeType()){
        if(t.t==='id'&&peek(1).t==='id')throw new CErr(`'${t.v}' does not name a type`,t.line,t.col,t.v==='string'||t.v==='vector'?'':`C++ doesn't know a type called ${t.v}. Did you misspell int, double, string or a struct name?`);
        if(t.t==='id'&&is('(',1))throw new CErr(`expected a return type before '${t.v}'`,t.line,t.col,`Every function starts with the type it returns. For a function that returns nothing, write: void ${t.v}()`);
        throw new CErr(`expected declaration before '${t.v}'`,t.line,t.col,'Outside of functions, C++ only allows #include lines, using, structs, global variables and whole functions. Statements like cout << ... go inside main() { }.')}
      const ty=parseType();const id=next();
      if(id.t!=='id')throw new CErr(`expected a name before '${id.v}'`,id.line,id.col);
      if(is('(')){const params=parseParams();const fn={name:id.v,ret:ty,params,line:id.line,col:id.col};
        if(is(';')){next();fn.proto=true;prog.items.push({kind:'proto',fn});continue}
        if(!is('{')){const pt=prev();throw new CErr(`expected '{' before '${peek().v}'`,pt.line,pt.col,'A function body goes in curly braces: int main() { ... }')}
        fn.body=parseBlock();if(!prog.funcs.has(fn.name))prog.funcs.set(fn.name,[]);prog.funcs.get(fn.name).push(fn);prog.items.push({kind:'func',fn});continue}
      p--;const d=parseDeclRest(ty);expect(';');d.global=true;prog.globals.push(d);prog.items.push({kind:'global',decl:d})}
  }
  function parseBlock(){const o=expect('{');const body=[];
    while(!is('}')){if(peek().t==='eof')expect('}');body.push(parseStmt())}
    const c=next();return {k:'block',body,line:o.line,end:c.line}}
  function parseDeclRest(ty){const items=[];const line=peek().line;
    for(;;){const id=next();if(id.t!=='id')throw new CErr(`expected a variable name before '${id.v}'`,id.line,id.col);
      const it={name:id.v,line:id.line,col:id.col,dims:[]};
      while(is('[')){next();it.dims.push(is(']')?null:parseExpr());expect(']')}
      if(is('=')){next();it.init=is('{')?parsePrimary():parseAssign();it.form='='}
      else if(is('{')){it.init=parsePrimary();it.form='{}'}
      else if(is('(')){next();const args=[];if(!is(')'))for(;;){args.push(parseAssign());if(is(',')){next();continue}break}expect(')');it.args=args;it.form='()'}
      items.push(it);if(is(',')){next();continue}break}
    return {k:'decl',type:ty,items,line}}
  function parseStmt(){const t=peek();
    if(t.t==='pp')throw new CErr(`${t.v.split(/\s/)[0]} belongs at the top of the file`,t.line,t.col,'#include lines go at the very top, before main.');
    if(is('{'))return parseBlock();
    if(is(';')){next();return {k:'empty',line:t.line}}
    if(is('if')){next();expect('(');const cond=parseExpr();expect(')');const then=parseStmt();let els=null;if(is('else')){next();els=parseStmt()}return {k:'if',cond,then,els,line:t.line}}
    if(is('else'))throw new CErr("'else' without a previous 'if'",t.line,t.col,"This else has no if right before it. Check for a stray ; after the if (...) line, or a missing { }.");
    if(is('while')){next();expect('(');const cond=parseExpr();expect(')');const body=parseStmt();return {k:'while',cond,body,line:t.line}}
    if(is('do')){next();const body=parseStmt();if(!is('while')){const u=peek();throw new CErr(`expected 'while' before '${u.v}'`,u.line,u.col,'A do loop ends with: } while (condition);')}next();expect('(');const cond=parseExpr();expect(')');expect(';');return {k:'do',cond,body,line:t.line}}
    if(is('for')){next();expect('(');let init=null;
      if(isDecl()){const ty=parseType();
        if(peek().t==='id'&&is(':',1)){const nm=next();next();const iter=parseExpr();expect(')');const body=parseStmt();return {k:'forin',type:ty,name:nm.v,iter,body,line:t.line}}
        init=parseDeclRest(ty);expect(';')}
      else if(is(';'))next();else{init={k:'expr',e:parseExpr(),line:t.line};expect(';')}
      const cond=is(';')?null:parseExpr();expect(';');const step=is(')')?null:parseExpr();expect(')');const body=parseStmt();
      return {k:'for',init,cond,step,body,line:t.line}}
    if(is('return')){next();const e=is(';')?null:parseExpr();expect(';');return {k:'return',e,line:t.line}}
    if(is('break')||is('continue')){next();expect(';');return {k:t.v,line:t.line}}
    if(is('switch')){next();expect('(');const e=parseExpr();expect(')');expect('{');const cases=[];
      while(!is('}')){if(peek().t==='eof')expect('}');
        if(is('case')){const ct=next();const v=parseTern();expect(':');cases.push({v,body:[],line:ct.line});continue}
        if(is('default')){const ct=next();expect(':');cases.push({v:null,body:[],line:ct.line});continue}
        if(!cases.length){const u=peek();throw new CErr("statement outside of 'case'",u.line,u.col,'Inside a switch, code goes after a case label: case 1: ...')}
        cases[cases.length-1].body.push(parseStmt())}
      next();return {k:'switch',e,cases,line:t.line}}
    if(is('case')||is('default'))throw new CErr(`'${t.v}' label not within a switch statement`,t.line,t.col);
    if(isDecl()){const ty=parseType();const d=parseDeclRest(ty);expect(';');return d}
    if(t.t==='id'&&peek(1).t==='id'&&!is('(',1)){
      if(t.v==='string'||t.v==='vector')throw new CErr(`'${t.v}' was not declared in this scope`,t.line,t.col);
      throw new CErr(`'${t.v}' was not declared in this scope`,t.line,t.col,`C++ doesn't know a type called ${t.v}. Check the spelling: int, double, bool, char, string.`)}
    const e=parseExpr();expect(';');return {k:'expr',e,line:t.line}}
  function parseExpr(){return parseAssign()}
  function parseAssign(){const l=parseTern();const t=peek();if(t.t==='op'&&ASSIGN.has(t.v)){next();const r=is('{')?parsePrimary():parseAssign();return {k:'assign',op:t.v,l,r,line:t.line,col:t.col}}return l}
  function parseTern(){const c=parseBin(0);if(is('?')){const t=next();const a=parseAssign();expect(':');const b=parseAssign();return {k:'tern',c,a,b,line:t.line}}return c}
  function parseBin(lv){if(lv>=PREC.length)return parseUnary();let l=parseBin(lv+1);
    while(peek().t==='op'&&PREC[lv].includes(peek().v)){const t=next();const r=parseBin(lv+1);l={k:'bin',op:t.v,l,r,line:t.line,col:t.col}}return l}
  function parseUnary(){const t=peek();
    if(t.t==='op'){
      if(['!','-','+','*','&'].includes(t.v)){next();return {k:'un',op:t.v,e:parseUnary(),line:t.line,col:t.col}}
      if(t.v==='++'||t.v==='--'){next();return {k:'pre',op:t.v,e:parseUnary(),line:t.line,col:t.col}}
      if(t.v==='('&&peek(1).t==='id'&&PRIMS.has(peek(1).v)&&(is(')',2)||is('*',2))){next();const ty=parseType();expect(')');return {k:'cast',type:ty,e:parseUnary(),line:t.line}}}
    if(is('sizeof')){next();expect('(');let ty=null,e=null;if(isDecl()||(looksLikeType()&&(is(')',1))))ty=parseType();else e=parseExpr();expect(')');return {k:'sizeof',type:ty,e,line:t.line}}
    return parsePostfix(parsePrimary())}
  function parsePostfix(e){
    for(;;){const t=peek();
      if(is('(')){next();const args=[];if(!is(')'))for(;;){args.push(is('{')?parsePrimary():parseAssign());if(is(',')){next();continue}break}expect(')');e={k:'call',f:e,args,line:t.line,col:t.col};continue}
      if(is('[')){next();const i=parseExpr();expect(']');e={k:'idx',e,i,line:t.line,col:t.col};continue}
      if(is('.')||is('->')){next();const id=next();if(id.t!=='id')throw new CErr(`expected a member name before '${id.v}'`,id.line,id.col);e={k:'mem',e,name:id.v,arrow:t.v==='->',line:t.line,col:id.col};continue}
      if(is('++')||is('--')){next();e={k:'post',op:t.v,e,line:t.line,col:t.col};continue}
      return e}}
  function parsePrimary(){const t=next();
    switch(t.t){
      case 'num':return {k:'num',v:t.v,isD:t.isD,line:t.line,col:t.col};
      case 'str':{let v=t.v;while(peek().t==='str')v+=next().v;return {k:'str',v,line:t.line,col:t.col}}
      case 'chr':return {k:'chr',v:t.v,line:t.line,col:t.col};
      case 'kw':
        if(t.v==='true'||t.v==='false')return {k:'bool',v:t.v==='true',line:t.line,col:t.col};
        if(t.v==='nullptr')return {k:'null',line:t.line,col:t.col};
        if(t.v==='static_cast'){expect('<');const ty=parseType();closeAngle();expect('(');const e=parseExpr();expect(')');return {k:'cast',type:ty,e,line:t.line}}
        break;
      case 'op':
        if(t.v==='('){const e=parseExpr();expect(')');return e}
        if(t.v==='{'){const items=[];if(!is('}'))for(;;){items.push(is('{')?parsePrimary():parseAssign());if(is(',')){next();if(is('}'))break;continue}break}expect('}');return {k:'init',items,line:t.line,col:t.col}}
        break;
      case 'id':{
        if(t.v==='std'&&is('::')){next();const id=next();if(id.t!=='id')throw new CErr(`expected a name after std::`,id.line,id.col);
          if(id.v==='string'&&is('::')&&peek(1).v==='npos'){next();next();return {k:'npos',line:t.line}}
          if(id.v==='vector'&&is('<')){p-=3;const ty=parseType();const args=[];expect('(');if(!is(')'))for(;;){args.push(parseAssign());if(is(',')){next();continue}break}expect(')');return {k:'construct',type:ty,args,line:t.line}}
          return {k:'id',name:id.v,std:true,line:id.line,col:id.col}}
        if(t.v==='string'&&is('::')&&peek(1).v==='npos'){next();next();return {k:'npos',line:t.line}}
        if(t.v==='vector'&&is('<')){p--;const ty=parseType();const args=[];if(is('{')){const il=parsePrimary();return {k:'construct',type:ty,init:il,args,line:t.line}}
          expect('(');if(!is(')'))for(;;){args.push(parseAssign());if(is(',')){next();continue}break}expect(')');return {k:'construct',type:ty,args,line:t.line}}
        if(PRIMS.has(t.v)&&is('(')){next();const e=parseExpr();expect(')');return {k:'cast',type:{base:t.v==='float'?'double':t.v==='short'?'int':t.v},e,line:t.line}}
        return {k:'id',name:t.v,line:t.line,col:t.col}}
      case 'eof':throw new CErr("expected '}' at end of input",t.line,1,'The file ended in the middle of something. Check that every { has a matching }.');
    }
    if(t.v===')'||t.v===';'||t.v===']'||t.v===','||t.v==='}')throw new CErr(`expected primary-expression before '${t.v}'`,t.line,t.col,'Something is missing here: C++ expected a value (a number, a variable, text in quotes) but found '+t.v+' instead.');
    throw new CErr(`expected primary-expression before '${t.v}'`,t.line,t.col)}
  parseTop();
  return prog}

/* ---------- library table ---------- */
const LIB={cout:{h:'iostream',std:1},cin:{h:'iostream',std:1},endl:{h:'iostream',std:1},cerr:{h:'iostream',std:1},
  getline:{std:1},to_string:{std:1},stoi:{std:1},stod:{std:1},string:{std:1},vector:{h:'vector',std:1},
  sort:{h:'algorithm',std:1},reverse:{h:'algorithm',std:1},swap:{std:1},max:{std:1},min:{std:1},
  sqrt:{h:'cmath'},pow:{h:'cmath'},floor:{h:'cmath'},ceil:{h:'cmath'},round:{h:'cmath'},fabs:{h:'cmath'},abs:{},
  rand:{},srand:{},time:{},RAND_MAX:{},toupper:{},tolower:{},isdigit:{},isalpha:{},isupper:{},islower:{},isspace:{},
  setprecision:{h:'iomanip',std:1},setw:{h:'iomanip',std:1},fixed:{std:1},boolalpha:{std:1},NULL:{},exit:{}};
const STR_M={length:TINT,size:TINT,empty:TBOOL,substr:TSTR,find:TLONG,at:TCHAR,back:TCHAR,front:TCHAR,push_back:TVOID,pop_back:TVOID,clear:TVOID,append:TSTR,insert:TSTR,erase:TSTR};
const VEC_M=['size','empty','push_back','pop_back','at','back','front','clear','begin','end','erase','insert'];
function lev(a,b){const d=[...Array(b.length+1).keys()];for(let i=1;i<=a.length;i++){let pv=d[0];d[0]=i;for(let j=1;j<=b.length;j++){const t=d[j];d[j]=Math.min(d[j]+1,d[j-1]+1,pv+(a[i-1]===b[j-1]?0:1));pv=t}}return d[b.length]}
function closest(n,list){let best=null,bd=99;for(const c of list){const dd=lev(n.toLowerCase(),c.toLowerCase());if(dd<bd){bd=dd;best=c}}return best&&bd<=(n.length<4?1:2)&&best!==n?best:null}

/* ---------- static checker ---------- */
function check(prog){
  const warns=[];const W=(msg,line,tip,col)=>warns.push({msg,line,col:col||0,tip});
  const E=(msg,line,tip,col)=>{throw new CErr(msg,line,col||0,tip)};
  const funcs=new Map();let scopes=[new Map()];const structs=prog.structs;const later=new Map();
  for(const it of prog.items)if(it.kind==='func')later.set(it.fn.name,it.fn);
  let loopDepth=0,switchDepth=0,curFn=null;
  const lookup=n=>{for(let i=scopes.length-1;i>=0;i--){const v=scopes[i].get(n);if(v)return v}return null};
  const visibleNames=()=>{const s=new Set();for(const sc of scopes)for(const k of sc.keys())s.add(k);for(const k of funcs.keys())s.add(k);
    for(const k in LIB)if((!LIB[k].h||prog.includes.has(LIB[k].h)||LIB[k].h==='iostream'))s.add(k);return [...s]};
  function needLib(name,line,col,std){const L=LIB[name];
    if(L.h&&!prog.includes.has(L.h)&&!(L.h==='iostream'&&false)){
      const hdr=L.h;E(`'${name}' was not declared in this scope`,line,`${name} lives in a library you haven't included. Add #include <${hdr}> at the top of the file.`,col)}
    if(L.std&&!std&&!prog.usingStd)E(`'${name}' was not declared in this scope; did you mean 'std::${name}'?`,line,`${name} belongs to the standard library, which lives in a namespace called std. Either write std::${name}, or add the line using namespace std; under your #include lines.`,col)}
  function checkType(t){if(!t)return;
    if(t.base==='ptr')return checkType(t.to);
    if(t.base==='vector'){if(!prog.includes.has('vector'))E(`'vector' does not name a type`,t.line,'vector lives in its own library. Add #include <vector> at the top of the file.',t.col);
      if(!t.std&&!prog.usingStd)E(`'vector' does not name a type; did you mean 'std::vector'?`,t.line,'Write std::vector, or add using namespace std; under your #include lines.',t.col);checkType(t.elem)}
    if(t.base==='string'&&!t.std&&!prog.usingStd)E(`'string' does not name a type; did you mean 'std::string'?`,t.line,'Write std::string, or add using namespace std; under your #include lines.',t.col)}
  const isLv=e=>e&&(e.k==='id'||e.k==='idx'||e.k==='mem'||(e.k==='un'&&e.op==='*')||e.k==='pre');
  function rootVar(e){while(e&&(e.k==='idx'||e.k==='mem'))e=e.e;return e&&e.k==='id'?lookup(e.name):null}
  function constCheck(e,line){const v=rootVar(e);if(v&&v.isConst&&!(e.k==='mem'&&false)){const nm=e.k==='id'?e.name:(function f(x){return x.k==='id'?x.name:f(x.e)})(e);
      E(`assignment of read-only variable '${nm}'`,line,`${nm} was declared const, which means it can never change after it is created. Remove const if it needs to change.`,e.col)}}
  function compat(to,from,line,col,ctx){if(!to||!from||to.base==='auto')return;
    const fb=from.base,tb=to.base;
    if(fb==='init'){
      if(tb==='vector'){for(const it of from.items)compat(to.elem,it,line,col,ctx);return}
      if(tb==='array'){for(const it of from.items)compat(to.elem,it,line,col,ctx);return}
      if(tb==='struct'){const def=structs.get(to.name);if(from.items.length>def.fields.length)E(`too many initializers for '${to.name}'`,line,`${to.name} has ${def.fields.length} fields (${def.fields.map(f=>f.name).join(', ')}), but the braces hold ${from.items.length} values.`,col);
        from.items.forEach((it,i)=>compat(def.fields[i].type,it,line,col,ctx));return}
      if(from.items.length===1)return compat(to,from.items[0],line,col,ctx);
      if(from.items.length===0)return;
      E(`scalar object requires one element in initializer`,line,`A ${tstr(to)} holds one value, but the braces hold ${from.items.length}.`,col)}
    if(isNumT(to)){
      if(fb==='string')E(`cannot convert 'string' to '${tstr(to)}'${ctx?' in '+ctx:''}`,line,`Text in quotes is a string. If you meant a number, remove the quotes. If you want to store text, make the variable a string. To turn text like "42" into a number, use stoi().`,col);
      if(fb==='ptr'&&tb!=='bool')E(`invalid conversion from '${tstr(from)}' to '${tstr(to)}'`,line,'That is an address, not a number. Put * in front of the pointer to read the value it points at.',col);
      if(fb==='vector'||fb==='struct'||fb==='array')E(`cannot convert '${tstr(from)}' to '${tstr(to)}'${ctx?' in '+ctx:''}`,line,`A ${tstr(from)} holds several values, but ${tstr(to)} holds just one.`,col);
      if(fb==='void')E('void value not ignored as it ought to be',line,'That function returns void, which means it gives back nothing. There is no value here to store or print.',col);
      return}
    if(tb==='string'){
      if(fb==='int'||fb==='double'||fb==='long'||fb==='bool')E(`conversion from '${tstr(from)}' to non-scalar type 'string' requested`,line,'A string holds text. Put the text in double quotes, or turn a number into text with to_string(n).',col);
      if(fb==='void')E('void value not ignored as it ought to be',line,'That function returns void, so there is no value to store.',col);
      if(fb==='vector'||fb==='struct')E(`conversion from '${tstr(from)}' to non-scalar type 'string' requested`,line,'',col);return}
    if(tb==='ptr'){if(fb==='ptr'||fb==='array')return;if(fb==='int'&&from.zero)return;
      E(`invalid conversion from '${tstr(from)}' to '${tstr(to)}'`,line,'A pointer stores an address. Use & to get the address of a variable: int* p = &score;',col)}
    if(tb==='vector'||tb==='struct'){if(fb!==tb||tstr(from)!==tstr(to))E(`conversion from '${tstr(from)}' to non-scalar type '${tstr(to)}' requested`,line,'',col)}
    if(tb==='array'&&fb==='array')E(`invalid array assignment`,line,'Arrays cannot be copied with =. Copy them one element at a time in a loop, or use a vector, which can be copied with =.',col)}

  function typeOf(e){if(!e)return null;const t=typeOf2(e);e.ty=t;return t}
  function typeOf2(e){
    switch(e.k){
      case 'num':return e.isD?TDBL:(e.v===0?{base:'int',zero:true}:TINT);
      case 'str':return {base:'string',lit:true};
      case 'chr':return TCHAR;case 'bool':return TBOOL;case 'null':return TNULL;case 'npos':return TLONG;
      case 'id':{const v=lookup(e.name);if(v&&!e.std)return v.type;
        if(funcs.has(e.name))E(`invalid use of function '${e.name}'`,e.line,`To call a function, add parentheses: ${e.name}()`,e.col);
        if(LIB[e.name]){needLib(e.name,e.line,e.col,e.std);
          return ({cout:TOUT,cerr:TOUT,cin:TIN,endl:TENDL,fixed:TMANIP,boolalpha:TMANIP,RAND_MAX:TINT,NULL:{base:'int',zero:true}})[e.name]||null}
        if(later.has(e.name))E(`'${e.name}' was not declared in this scope`,e.line,`${e.name} is a function defined further down the file. C++ reads from top to bottom.`,e.col);
        const sug=closest(e.name,visibleNames());
        E(`'${e.name}' was not declared in this scope`+(sug?`; did you mean '${sug}'?`:''),e.line,sug?`C++ has never heard of ${e.name}. Did you mean ${sug}? Names are case-sensitive: Score and score are different.`:`C++ has never heard of ${e.name}. Every variable must be declared with a type (like int ${e.name} = 0;) before you use it, and it only exists inside the { } where you declared it.`,e.col)}
      case 'bin':{
        const lt=typeOf(e.l);
        if(e.op==='<<'&&lt&&lt.base==='ostream'){const rt=typeOf(e.r);
          if(rt&&(rt.base==='vector'||rt.base==='struct'||rt.base==='void'||rt.base==='istream'||rt.base==='ostream'))E(`no match for 'operator<<' (operand types are 'ostream' and '${tstr(rt)}')`,e.line,
            rt.base==='vector'?'cout cannot print a whole vector at once. Use a loop and print one element at a time.':rt.base==='struct'?`cout doesn't know how to print a ${rt.name}. Print its fields one by one, like p.name and p.hp.`:rt.base==='void'?'That function returns void, so there is nothing to print. Call it on its own line instead.':'',e.col);
          return TOUT}
        if(e.op==='>>'&&lt&&lt.base==='ostream')E(`no match for 'operator>>' (operand types are 'ostream' and '${tstr(typeOf(e.r))}')`,e.line,'cout sends data out, so it uses <<. Only cin uses >>, because data flows from the keyboard into the variable.',e.col);
        if(e.op==='<<'&&lt&&lt.base==='istream')E(`no match for 'operator<<' (operand types are 'istream' and '${tstr(typeOf(e.r))}')`,e.line,'cin reads input, so it uses >> (data flows into the variable). cout is the one that uses <<.',e.col);
        if(e.op==='>>'&&lt&&lt.base==='istream'){const rt=typeOf(e.r);
          if(!isLv(e.r))E(`no match for 'operator>>'`,e.line,'cin >> needs a variable to store the input in, like cin >> age; It cannot read into text or a number.',e.col);
          if(rt&&(rt.base==='vector'||rt.base==='struct'))E(`no match for 'operator>>' (operand types are 'istream' and '${tstr(rt)}')`,e.line,'cin reads one simple value at a time. Read into each element or field separately.',e.col);
          if(rt&&rt.base==='endl'||e.r.k==='id'&&e.r.name==='endl')E(`no match for 'operator>>' (operand types are 'istream' and '<unresolved overloaded function type>')`,e.line,'endl is only for output. Remove >> endl from the cin line.',e.col);
          return TIN}
        const rt=typeOf(e.r);
        if(!lt||!rt)return ['==','!=','<','>','<=','>=','&&','||'].includes(e.op)?TBOOL:(lt||rt);
        const ls=lt.base==='string',rs=rt.base==='string';
        if(['&&','||'].includes(e.op))return TBOOL;
        if(ls||rs){
          if(e.op==='+'){if(lt.lit&&rt.lit)E(`invalid operands of types 'const char[${lt.lit?(e.l.v||'').length+1:0}]' and 'const char[${(e.r.v||'').length+1}]' to binary 'operator+'`,e.line,'Two pieces of text in quotes cannot be joined with +. Just write them as one string, or make the first one a string variable.',e.col);
            const other=ls?rt:lt;if(other.base==='string'||other.base==='char')return TSTR;
            E(`no match for 'operator+' (operand types are '${tstr(lt)}' and '${tstr(rt)}')`,e.line,`You can't add a number to text directly. Turn the number into text first: to_string(${ls?'number':'number'})`,e.col)}
          if(['==','!=','<','>','<=','>='].includes(e.op)){const other=ls?rt:lt;if(other.base!=='string'&&other.base!=='char'||(other.base==='char'&&false))E(`no match for 'operator${e.op}' (operand types are '${tstr(lt)}' and '${tstr(rt)}')`,e.line,`You can only compare text with text. ${other.base==='char'?"Use double quotes for text: \"y\" instead of 'y'.":''}`,e.col);
            if(other.base==='char')E(`no match for 'operator${e.op}' (operand types are '${tstr(lt)}' and 'char')`,e.line,"A string can't be compared with a single char in single quotes. Use double quotes: \"y\".",e.col);return TBOOL}
          E(`no match for 'operator${e.op}' (operand types are '${tstr(lt)}' and '${tstr(rt)}')`,e.line,`Strings support + (join) and comparisons, but not ${e.op}.`,e.col)}
        if(lt.base==='void'||rt.base==='void')E('void value not ignored as it ought to be',e.line,'That function returns void, so there is no value to use here.',e.col);
        if(lt.base==='ptr'||rt.base==='ptr'||lt.base==='array'||rt.base==='array'||lt.base==='iter'||rt.base==='iter'){if(['==','!=','<','>','<=','>='].includes(e.op))return TBOOL;if(lt.base==='ptr'&&rt.base==='ptr'&&e.op==='-')return TLONG;return (lt.base==='ptr'||lt.base==='iter'||lt.base==='array')?(lt.base==='array'?{base:'ptr',to:lt.elem}:lt):rt}
        if(lt.base==='vector'||rt.base==='vector'||lt.base==='struct'||rt.base==='struct')E(`no match for 'operator${e.op}' (operand types are '${tstr(lt)}' and '${tstr(rt)}')`,e.line,'',e.col);
        if(e.op==='%'&&(lt.base==='double'||rt.base==='double'))E(`invalid operands of types '${tstr(lt)}' and '${tstr(rt)}' to binary 'operator%'`,e.line,'% (remainder) only works on whole numbers like int.',e.col);
        if(['==','!=','<','>','<=','>='].includes(e.op))return TBOOL;
        if(lt.base==='double'||rt.base==='double')return TDBL;
        if(lt.base==='long'||rt.base==='long')return TLONG;return TINT}
      case 'assign':{const lt=typeOf(e.l);
        if(!isLv(e.l))E('lvalue required as left operand of assignment',e.line,'The left side of = must be a variable, the place where the value gets stored. Did you mean == (compare)?',e.col);
        constCheck(e.l,e.line);
        if(e.r.k==='init'){const rt=typeOf(e.r);compat(lt,rt,e.line,e.col);return lt}
        const rt=typeOf(e.r);
        if(e.op==='='){if(lt&&lt.base==='string'&&rt&&rt.base==='char')return lt;compat(lt,rt,e.line,e.col);return lt}
        if(lt&&lt.base==='string'){if(e.op!=='+=')E(`no match for 'operator${e.op}'`,e.line,'Strings only support += (add text to the end).',e.col);
          if(rt&&rt.base!=='string'&&rt.base!=='char')E(`no match for 'operator+=' (operand types are 'string' and '${tstr(rt)}')`,e.line,'To add a number to text, convert it first: s += to_string(n);',e.col);return lt}
        if(e.op==='%='&&(lt&&lt.base==='double'||rt&&rt.base==='double'))E(`invalid operands to binary 'operator%'`,e.line,'% only works on whole numbers.',e.col);
        compat(lt,rt,e.line,e.col);return lt}
      case 'un':{const t=typeOf(e.e);
        if(e.op==='&'){if(!isLv(e.e))E('lvalue required as unary \'&\' operand',e.line,'& gives the address of a variable. It needs a variable, not a value.',e.col);return t?{base:'ptr',to:t}:null}
        if(e.op==='*'){if(t&&t.base!=='ptr'&&t.base!=='array'&&t.base!=='iter')E(`invalid type argument of unary '*' (have '${tstr(t)}')`,e.line,`* reads the value a pointer points at, but this is a plain ${tstr(t)}, not a pointer.`,e.col);return t&&t.base==='ptr'?t.to:t&&t.base==='array'?t.elem:null}
        if(e.op==='!')return TBOOL;
        if(t&&t.base==='string')E(`no match for 'operator${e.op}' (operand type is 'string')`,e.line,'',e.col);
        return t&&(t.base==='bool'||t.base==='char')?TINT:t}
      case 'pre':case 'post':{const t=typeOf(e.e);if(!isLv(e.e))E(`lvalue required as ${e.op==='++'?'increment':'decrement'} operand`,e.line,`${e.op} changes a variable, so it needs a variable, like score++.`,e.col);
        constCheck(e.e,e.line);if(t&&t.base==='string')E(`no match for 'operator${e.op}' (operand type is 'string')`,e.line,'You can\'t add 1 to text.',e.col);return t}
      case 'tern':{typeOf(e.c);const a=typeOf(e.a),b=typeOf(e.b);if(a&&b&&a.base==='string'!==(b.base==='string')&&a.base!=='char'&&b.base!=='char')E(`operands to ?: have different types '${tstr(a)}' and '${tstr(b)}'`,e.line,'Both answers of ? : must be the same kind of thing: both text or both numbers.',0);
        return a&&b&&a.base==='double'||b&&b.base==='double'?TDBL:a}
      case 'cast':{typeOf(e.e);return e.type}
      case 'construct':{checkType(e.type);const at=e.args.map(typeOf);if(e.init)typeOf(e.init);if(at[1])compat(e.type.elem,at[1],e.line,0);return e.type}
      case 'sizeof':if(e.e)typeOf(e.e);return TLONG;
      case 'init':{const items=e.items.map(typeOf);return {base:'init',items}}
      case 'idx':{const t=typeOf(e.e);const it=typeOf(e.i);
        if(it&&!isIntT(it)&&it.base!=='iter')E(`invalid types '${tstr(t)}[${tstr(it)}]' for array subscript`,e.line,'The position inside [ ] must be a whole number, like v[2] or v[i] with int i.',e.col);
        if(!t)return null;if(t.base==='array'||t.base==='vector')return t.elem;if(t.base==='string')return TCHAR;if(t.base==='ptr')return t.to;
        E(`invalid types '${tstr(t)}[${tstr(it)}]' for array subscript`,e.line,`[ ] picks one item out of an array, vector or string. A ${tstr(t)} holds a single value.`,e.col)}
      case 'mem':{let t=typeOf(e.e);if(!t)return null;
        if(e.arrow){if(t.base!=='ptr')E(`base operand of '->' has non-pointer type '${tstr(t)}'`,e.line,'-> is for pointers. For a normal variable, use a dot: hero.hp',e.col);t=t.to}
        else if(t.base==='ptr')E(`request for member '${e.name}' in '${exprName(e.e)}', which is of pointer type '${tstr(t)}' (maybe you meant to use '->' ?)`,e.line,`With a pointer, use -> instead of a dot: ${exprName(e.e)}->${e.name}`,e.col);
        if(t.base==='struct'){const def=structs.get(t.name);const f=def.fields.find(x=>x.name===e.name);
          if(!f){const s=closest(e.name,def.fields.map(x=>x.name));E(`'struct ${t.name}' has no member named '${e.name}'`+(s?`; did you mean '${s}'?`:''),e.line,`${t.name} has these fields: ${def.fields.map(x=>x.name).join(', ')}.`,e.col)}
          return f.type}
        if(t.base==='string'||t.base==='vector'){const ms=t.base==='string'?Object.keys(STR_M):VEC_M;
          if(ms.includes(e.name))E(`invalid use of member function '${e.name}' (did you forget the '()' ?)`,e.line,`${e.name} is a function. Call it with parentheses: .${e.name}()`,e.col);
          const s=closest(e.name,ms);E(`'class std::${t.base==='string'?'string':tstr(t)}' has no member named '${e.name}'`+(s?`; did you mean '${s}'?`:''),e.line,s?`Did you mean .${s}()?`:'',e.col)}
        if(t.base==='istream')return TVOID;
        E(`request for member '${e.name}' in '${exprName(e.e)}', which is of non-class type '${tstr(t)}'`,e.line,`The dot . reaches inside a struct, string or vector. A ${tstr(t)} has nothing inside it.`,e.col)}
      case 'call':return typeCall(e);
    }
    return null}
  function exprName(e){return e.k==='id'?e.name:e.k==='mem'?exprName(e.e)+(e.arrow?'->':'.')+e.name:e.k==='idx'?exprName(e.e)+'[...]':'expression'}
  function sig(fn){return `${tstr(fn.ret)} ${fn.name}(${fn.params.map(p=>tstr(p.type)+(p.type.ref?'&':'')).join(', ')})`}
  function typeCall(e){const f=e.f;
    if(f.k==='mem'){let ot=typeOf(f.e);
      if(f.arrow&&ot&&ot.base==='ptr')ot=ot.to;
      const at=e.args.map(typeOf);
      if(!ot)return null;
      if(ot.base==='string'){if(!(f.name in STR_M)){const s=closest(f.name,Object.keys(STR_M));E(`'class std::string' has no member named '${f.name}'`+(s?`; did you mean '${s}'?`:''),e.line,s?`Did you mean .${s}()?`:'Strings have: length(), size(), substr(), find(), empty(), at().',f.col)}
        if(f.name==='push_back'&&at[0]&&at[0].base==='string')E(`no matching function for call to 'std::string::push_back(string)'`,e.line,"push_back on a string adds one char, like 'a'. To add text, use += \"text\".",f.col);
        return STR_M[f.name]}
      if(ot.base==='vector'){if(!VEC_M.includes(f.name)){const s=closest(f.name,VEC_M);E(`'class std::vector<${tstr(ot.elem)}>' has no member named '${f.name}'`+(s?`; did you mean '${s}'?`:''),e.line,s?`Did you mean .${s}()?`:(f.name==='length'?'For vectors, use .size().':'Vectors have: push_back(), pop_back(), size(), at(), back(), front(), empty(), clear().'),f.col)}
        if(f.name==='push_back'){if(e.args.length!==1)E(`no matching function for call to 'push_back'`,e.line,'push_back takes exactly one value: v.push_back(42);',f.col);compat(ot.elem,at[0],e.line,f.col)}
        return ({size:TINT,empty:TBOOL,at:ot.elem,back:ot.elem,front:ot.elem,begin:TITER,end:TITER})[f.name]||TVOID}
      if(ot.base==='istream')return TVOID;
      if(ot.base==='struct')E(`'struct ${ot.name}' has no member named '${f.name}'`,e.line,'Structs in this course hold data only. Write a normal function that takes the struct as a parameter.',f.col);
      E(`request for member '${f.name}' in '${exprName(f.e)}', which is of non-class type '${tstr(ot)}'`,e.line,`Only strings, vectors and structs have things you can reach with a dot. ${exprName(f.e)} is a plain ${tstr(ot)}.`,f.col)}
    if(f.k!=='id'){typeOf(f);e.args.forEach(typeOf);return null}
    const name=f.name;const local=lookup(name);
    if(local&&!f.std)E(`'${name}' cannot be used as a function`,e.line,`${name} is a variable here, not a function. Maybe a variable and a function share a name?`,f.col);
    const fl=funcs.get(name);
    if(fl&&!f.std){const at=e.args.map(typeOf);
      const fn=fl.find(x=>x.params.length===e.args.length);
      if(!fn){const g=fl[0];E(`too ${e.args.length>g.params.length?'many':'few'} arguments to function '${sig(g)}'`,e.line,`${name} expects ${g.params.length} value${g.params.length===1?'':'s'} in the parentheses (${g.params.map(p=>tstr(p.type)+' '+p.name).join(', ')||'nothing'}), but you gave ${e.args.length}.`,f.col)}
      fn.params.forEach((p,i)=>{if(p.type.ref&&!p.type.isConst&&!isLv(e.args[i]))E(`cannot bind non-const lvalue reference of type '${tstr(p.type)}&' to an rvalue of type '${tstr(at[i])}'`,e.line,`${p.name} is a reference (&), so it must be connected to a real variable that can change. Pass a variable, not a plain value.`,e.args[i].col);
        if(p.type.ref&&at[i]&&p.type.base!=='auto'&&tstr(at[i])!==tstr(p.type)&&!(isNumT(at[i])&&isNumT(p.type)&&p.type.isConst)){
          if(isNumT(p.type)&&isNumT(at[i])&&!p.type.isConst)E(`cannot bind non-const lvalue reference of type '${tstr(p.type)}&' to a value of type '${tstr(at[i])}'`,e.line,`A ${tstr(p.type)}& must connect to a ${tstr(p.type)} variable.`,e.args[i].col)}
        if(p.type.base==='ptr'&&p.type.arrParam&&at[i]&&at[i].base!=='array'&&at[i].base!=='ptr')E(`cannot convert '${tstr(at[i])}' to '${tstr(p.type)}'`,e.line,'This parameter expects an array.',e.args[i].col);
        compat(p.type.ref?{...p.type,ref:false}:p.type,at[i],e.line,e.args[i].col,'argument')});
      return fn.ret}
    e.args.forEach(typeOf);
    if(LIB[name]){needLib(name,e.line,f.col,f.std);
      const at=e.args.map(a=>a.ty);
      const n=e.args.length;const need=(k,usage)=>{if(n!==k)E(`${n>k?'too many':'too few'} arguments to function '${name}'`,e.line,`Use it like: ${usage}`,f.col)};
      switch(name){
        case 'sqrt':case 'floor':case 'ceil':case 'round':case 'fabs':need(1,name+'(x)');if(at[0]&&!isNumT(at[0]))E(`no matching function for call to '${name}(${tstr(at[0])})'`,e.line,name+' works on numbers.',f.col);return TDBL;
        case 'pow':need(2,'pow(base, exponent)');return TDBL;
        case 'abs':need(1,'abs(x)');return at[0]&&at[0].base==='double'?TDBL:TINT;
        case 'max':case 'min':need(2,name+'(a, b)');if(at[0]&&at[1]&&isNumT(at[0])&&isNumT(at[1])&&(at[0].base==='double')!==(at[1].base==='double'))E(`no matching function for call to '${name}(${tstr(at[0])}, ${tstr(at[1])})'`,e.line,`${name} needs both values to be the same type. Make both int or both double.`,f.col);
          return at[0]&&at[0].base==='double'?TDBL:at[0]&&at[0].base==='string'?TSTR:TINT;
        case 'rand':need(0,'rand()');return TINT;case 'srand':need(1,'srand(time(0))');return TVOID;case 'time':return TLONG;
        case 'to_string':need(1,'to_string(42)');if(at[0]&&at[0].base==='string')E(`no matching function for call to 'to_string(string)'`,e.line,'It is already text. to_string turns a number into text.',f.col);return TSTR;
        case 'stoi':need(1,'stoi("42")');if(at[0]&&at[0].base!=='string')E(`no matching function for call to 'stoi(${tstr(at[0])})'`,e.line,'stoi turns text into a number, so give it a string.',f.col);return TINT;
        case 'stod':need(1,'stod("3.5")');return TDBL;
        case 'toupper':case 'tolower':need(1,name+"('a')");return TINT;
        case 'isdigit':case 'isalpha':case 'isupper':case 'islower':case 'isspace':return TBOOL;
        case 'getline':if(n<2)E('too few arguments to function getline',e.line,'Use it like: getline(cin, name);',f.col);
          if(at[1]&&at[1].base!=='string')E(`no matching function for call to 'getline(istream&, ${tstr(at[1])})'`,e.line,'getline reads a whole line of text, so the second argument must be a string variable.',f.col);return TIN;
        case 'swap':need(2,'swap(a, b)');if(!isLv(e.args[0])||!isLv(e.args[1]))E('no matching function for call to swap',e.line,'swap needs two variables to swap.',f.col);return TVOID;
        case 'sort':case 'reverse':need(2,name+'(v.begin(), v.end())');return TVOID;
        case 'setprecision':case 'setw':need(1,name+'(2)');return TMANIP;
        case 'exit':return TVOID;
        case 'string':return TSTR;
      }
      return null}
    if(name==='string'&&(f.std||prog.usingStd))return TSTR;
    if(later.has(name)){const fn=later.get(name);E(`'${name}' was not declared in this scope`,e.line,`${name} is defined further down, on line ${fn.line}. C++ reads the file from top to bottom, so it hasn't seen it yet. Move the function above the code that calls it, or add a prototype above: ${sig(fn)};`,f.col)}
    const sug=closest(name,visibleNames());
    E(`'${name}' was not declared in this scope`+(sug?`; did you mean '${sug}'?`:''),e.line,sug?`There is no function called ${name}. Did you mean ${sug}?`:`There is no function called ${name}. Check the spelling, or write the function above the place where you call it.`,f.col)}

  function declare(name,info,line,col){const sc=scopes[scopes.length-1];const old=sc.get(name);
    if(old)E(`redeclaration of '${tstr(info.type)} ${name}'`,line,`You already created ${name} on line ${old.line}. To change its value, leave off the type: ${name} = ...;`,col);
    if(scopes.length>1&&funcs.has(name)&&false)return;
    sc.set(name,Object.assign({line},info))}
  function checkDecl(d){checkType(d.type);
    if(d.type.base==='void')E(`variable '${d.items[0].name}' declared void`,d.line,'void means "nothing". Variables need a real type like int, double or string.');
    for(const it of d.items){let ty=d.type;
      if(ty.ref&&!it.init)E(`'${it.name}' declared as reference but not initialized`,it.line,'A reference must be connected to a variable when you create it: int& r = score;',it.col);
      if(it.dims.length){for(const dm of it.dims)if(dm)typeOf(dm);
        let n=it.dims.map(dm=>dm&&dm.k==='num'?dm.v:dm?-1:null);
        if(n[0]===null){if(!it.init||it.init.k!=='init')E(`storage size of '${it.name}' isn't known`,it.line,`Put the size in the brackets, like int ${it.name}[5]; or give starting values: int ${it.name}[] = {1, 2, 3};`,it.col);n[0]=it.init.items.length}
        for(let k=n.length-1;k>=0;k--)ty={base:'array',elem:ty,n:n[k]};
        if(it.init&&it.init.k==='init'&&n[0]>0&&it.init.items.length>n[0])E(`too many initializers for '${tstr(ty)}'`,it.line,`${it.name} has room for ${n[0]} items, but you listed ${it.init.items.length}.`,it.col);
        if(it.init&&it.init.k!=='init'&&!(it.init.k==='str'&&d.type.base==='char'))E(`array must be initialized with a brace-enclosed initializer`,it.line,'Give an array its starting values in curly braces: {1, 2, 3}',it.col)}
      if(it.init){const it2=typeOf(it.init);
        if(ty.base==='auto'){if(!it2)ty=null;else if(it2.base==='init')E(`unable to deduce 'auto' from a brace list`,it.line,'Write the type yourself, like vector<int>.',it.col);else ty={...it2,lit:false,zero:false}}
        else if(it.init.k==='init'&&isNumT(ty)&&it.init.items.length===1&&it2.items[0]&&it2.items[0].base==='double'&&isIntT(ty)&&it.form==='{}')E(`narrowing conversion from 'double' to '${tstr(ty)}'`,it.line,`Curly-brace initialization refuses to quietly chop off the decimal part. Use a whole number, or make ${it.name} a double.`,it.col);
        else{if(ty.ref){if(!isLv(it.init)&&!ty.isConst)E(`cannot bind non-const lvalue reference of type '${tstr(ty)}&' to an rvalue`,it.line,'A reference must connect to a variable, not a plain value.',it.col)}
          if(ty.base==='string'&&it2&&it2.base==='char'&&it.form!=='='){}
          else compat(ty.ref?{...ty,ref:false}:ty,it2,it.line,it.col,'initialization')}}
      else if(it.args){const at=it.args.map(typeOf);
        if(ty.base==='vector'){if(at.length>2)E('no matching constructor for vector',it.line,'Use vector<int> v(5); for five zeros, or vector<int> v(5, 7); for five 7s.',it.col);if(at[1])compat(ty.elem,at[1],it.line,it.col)}
        else if(ty.base==='string'){if(at.length===2&&at[1]&&at[1].base==='string')E('no matching constructor for string(n, text)',it.line,"The second value is one char in single quotes: string line(10, '*');",it.col)}
        else if(at.length===1)compat(ty,at[0],it.line,it.col,'initialization')}
      else if(ty.base==='auto')E(`declaration of 'auto ${it.name}' has no initializer`,it.line,'auto figures out the type from the starting value, so it needs one: auto x = 5;',it.col);
      if(ty&&ty.isConst&&!it.init&&ty.base!=='string'&&ty.base!=='vector'&&ty.base!=='struct')E(`uninitialized 'const ${it.name}'`,it.line,'A const can never change, so it must get its value right away: const int MAX = 10;',it.col);
      it.rt=ty;
      declare(it.name,{type:ty,isConst:!!(ty&&ty.isConst)},it.line,it.col)}}
  function condWarn(c,line){if(c&&c.k==='assign'&&c.op==='=')W('suggest parentheses around assignment used as truth value [-Wparentheses]',line,'You wrote = which STORES a value. To COMPARE, use == (two equals signs). Right now this condition changes the variable instead of checking it.',c.col)}
  function stmt(s){
    switch(s.k){
      case 'block':scopes.push(new Map());s.body.forEach(stmt);scopes.pop();break;
      case 'decl':checkDecl(s);break;
      case 'expr':{const t=typeOf(s.e);
        if(s.e.k==='bin'&&s.e.op==='=='&&isLv(s.e.l))W('statement has no effect [-Wunused-value]',s.line,'== compares two values but doesn\'t change anything. To store a value, use a single =.',s.e.col);
        if(s.e.k==='id'&&t&&t.base==='ostream')W('statement has no effect',s.line,'cout on its own does nothing. Send it something with <<.');
        break}
      case 'if':{const ct=typeOf(s.cond);condWarn(s.cond,s.line);if(ct&&ct.base==='string')E(`could not convert '${exprName(s.cond)}' from 'string' to 'bool'`,s.line,'An if needs a true/false question. Compare the text: if (answer == "yes")');
        if(s.then.k==='empty')W('suggest braces around empty body in an \'if\' statement [-Wempty-body]',s.line,'There is a ; right after if (...). That semicolon is the entire if body, so the next line runs no matter what. Delete the ;');
        scopes.push(new Map());stmt(s.then);scopes.pop();if(s.els){scopes.push(new Map());stmt(s.els);scopes.pop()}break}
      case 'while':case 'do':typeOf(s.cond);condWarn(s.cond,s.line);
        if(s.k==='while'&&s.body.k==='empty')W('suggest braces around empty body in a \'while\' statement [-Wempty-body]',s.line,'There is a ; right after while (...). The loop body is that empty statement, so the loop may never end. Delete the ;');
        loopDepth++;scopes.push(new Map());stmt(s.body);scopes.pop();loopDepth--;break;
      case 'for':scopes.push(new Map());if(s.init)stmt(s.init);if(s.cond){typeOf(s.cond);condWarn(s.cond,s.line)}if(s.step)typeOf(s.step);
        if(s.body.k==='empty')W('for loop has empty body [-Wempty-body]',s.line,'There is a ; right after for (...). The loop runs with an empty body and the next line runs only once. Delete the ;');
        loopDepth++;stmt(s.body);loopDepth--;scopes.pop();break;
      case 'forin':{const it=typeOf(s.iter);checkType(s.type);scopes.push(new Map());let ty=s.type;
        if(it&&!['vector','array','string','init'].includes(it.base))E(`'begin' was not declared in this scope`,s.line,`A range-for loop walks through a vector, array or string. ${exprName(s.iter)} is a single ${tstr(it)}.`);
        if(ty.base==='auto')ty=it?(it.base==='string'?TCHAR:it.base==='init'?it.items[0]:it.elem):null;
        else if(it){const el=it.base==='string'?TCHAR:it.base==='init'?it.items[0]:it.elem;compat({...ty,ref:false},el,s.line,0)}
        s.rt=ty;declare(s.name,{type:ty},s.line);loopDepth++;stmt(s.body);loopDepth--;scopes.pop();break}
      case 'return':{const rt=curFn.ret;
        if(s.e){const t=typeOf(s.e);if(rt.base==='void')E(`return-statement with a value, in function returning 'void'`,s.line,`${curFn.name} is declared void, so it can't give back a value. Change void to the type you want to return, like int.`);
          compat({...rt,ref:false},t,s.line,0,'return')}
        else if(rt.base!=='void')E(`return-statement with no value, in function returning '${tstr(rt)}'`,s.line,`${curFn.name} promises to return a ${tstr(rt)}. Put the value after return, like: return 0;`);break}
      case 'break':if(!loopDepth&&!switchDepth)E('break statement not within loop or switch',s.line,'break jumps out of a loop or switch, so it must be inside one.');break;
      case 'continue':if(!loopDepth)E('continue statement not within a loop',s.line,'continue skips to the next round of a loop, so it must be inside one.');break;
      case 'switch':{const t=typeOf(s.e);if(t&&t.base==='string')E('switch quantity not an integer',s.line,'switch only works with whole numbers and chars. For text, use if / else if.');
        switchDepth++;scopes.push(new Map());for(const c of s.cases){if(c.v){const ct=typeOf(c.v);if(ct&&ct.base==='string')E('case label does not reduce to an integer constant',c.line,"Case labels must be numbers or single chars like 'a'.")}c.body.forEach(stmt)}scopes.pop();switchDepth--;break}
    }}
  function checkFunc(fn){
    checkType(fn.ret);if(fn.name==='main'&&fn.ret.base!=='int')E("'::main' must return 'int'",fn.line,'main always returns int. Write: int main()');
    const prevAll=funcs.get(fn.name)||[];if(prevAll.some(x=>x.params.length===fn.params.length&&x.body&&fn.body&&x!==fn))E(`redefinition of '${sig(fn)}'`,fn.line,`There are two functions called ${fn.name} with the same parameters. Rename one of them.`);
    if(!funcs.has(fn.name))funcs.set(fn.name,[]);if(!funcs.get(fn.name).some(x=>x.params.length===fn.params.length))funcs.get(fn.name).push(fn);
    if(!fn.body)return;
    curFn=fn;scopes.push(new Map());
    for(const p of fn.params){checkType(p.type);if(p.name)declare(p.name,{type:p.type.ref?{...p.type,ref:false}:p.type,isConst:!!p.type.isConst,param:true},fn.line)}
    fn.body.body.forEach(stmt);scopes.pop();curFn=null;
    if(fn.ret.base!=='void'&&fn.name!=='main'){const last=fn.body.body[fn.body.body.length-1];if(!hasRet(fn.body))W(`no return statement in function returning non-void [-Wreturn-type]`,fn.body.end||fn.line,`${fn.name} promises to return a ${tstr(fn.ret)}, but it can reach the end without a return.`)}}
  function hasRet(s){if(!s)return false;if(s.k==='return')return true;if(s.k==='block')return s.body.some(hasRet);if(s.k==='if')return hasRet(s.then)&&hasRet(s.els);return s.k==='while'&&s.cond.k==='bool'}
  for(const it of prog.items){
    if(it.kind==='struct'){for(const f of it.def.fields)checkType(f.type)}
    else if(it.kind==='proto'){checkType(it.fn.ret);if(!funcs.has(it.fn.name))funcs.set(it.fn.name,[]);funcs.get(it.fn.name).push(it.fn)}
    else if(it.kind==='func'){
      const fl=funcs.get(it.fn.name);if(fl){const i=fl.findIndex(x=>x.proto&&x.params.length===it.fn.params.length);if(i>=0)fl.splice(i,1)}
      checkFunc(it.fn)}
    else if(it.kind==='global')checkDecl(it.decl)}
  for(const [n,fl] of prog.funcs)for(const fn of fl)if(!fn.body)continue;
  for(const it of prog.items)if(it.kind==='proto'&&!(prog.funcs.get(it.fn.name)||[]).some(f=>f.params.length===it.fn.params.length))
    {const e=new CErr(`undefined reference to '${sig(it.fn)}'`,it.fn.line,0,`You declared ${it.fn.name} with a prototype but never wrote the function body.`,'link');throw e}
  if(!prog.funcs.has('main')){const e=new CErr("undefined reference to 'main'",0,0,'Every C++ program needs a function called main. That is where the program starts: int main() { ... }','link');throw e}
  return warns}

/* ---------- runtime ---------- */
class Ret{constructor(v){this.v=v}}
const BRK={brk:1},CONT={cont:1};class ExitSig{constructor(c){this.code=c}}
function fmtG(v,p){if(!isFinite(v))return isNaN(v)?'nan':(v<0?'-inf':'inf');if(v===0)return Object.is(v,-0)?'-0':'0';
  const s=v.toExponential(Math.max(0,p-1));let [m,ex]=s.split('e');const E=+ex;
  if(E<-4||E>=p){if(m.includes('.'))m=m.replace(/0+$/,'').replace(/\.$/,'');return m+'e'+(E<0?'-':'+')+String(Math.abs(E)).padStart(2,'0')}
  let f=v.toFixed(Math.max(0,p-1-E));if(f.includes('.'))f=f.replace(/0+$/,'').replace(/\.$/,'');return f}
const hex=a=>'0x'+a.toString(16);

function Machine(prog,opt){
  opt=opt||{};const out=opt.out||(()=>{}),warn=opt.warn||(()=>{});
  const LIMIT=opt.limit||2000000;
  let cellId=0,sAddr=0x7ffd3a10,hAddr=0x55c8e2b0,gAddr=0x55c8a040;
  const globals={name:'globals',cells:[],scopes:[new Map()],global:true};
  const stack=[];const changed=new Set();const warned=new Set();
  let inBuf='',cinFail=false,lastExtract=false;
  const ost={fixed:false,prec:6,boolalpha:false,width:0};
  let seed=1;let steps=0;const calls={};let maxDepth=1;const recursed=new Set();let mainSnap=null;let exitCode=0;
  const inputs=[];let curLine=0;
  const warnOnce=(key,msg,line,tip)=>{if(warned.has(key))return;warned.add(key);warn({msg,line:line||curLine,tip})};
  const frame=()=>stack[stack.length-1]||globals;
  function sizeOf(t){switch(t.base){case 'char':case 'bool':return 1;case 'int':return 4;case 'string':return 32;case 'vector':return 24;
    case 'array':return t.n*sizeOf(t.elem);case 'struct':{const d=prog.structs.get(t.name);return d.fields.reduce((s,f)=>s+Math.max(4,sizeOf(f.type)),0)}default:return 8}}
  function bump(where,t){const sz=Math.max(4,sizeOf(t));if(where==='heap'){const a=hAddr;hAddr+=sz;return a}if(where==='global'){const a=gAddr;gAddr+=sz;return a}const a=sAddr;sAddr+=sz;return a}
  const GARB={int:[32765,21845,-1,4196032,32767,1],char:[0],double:[6.95321e-310],bool:[false,true],long:[140737488349472]};
  function garbage(t){if(t.base==='ptr')return null;const g=GARB[t.base]||[0];return g[Math.floor(Math.random()*g.length)]}
  function makeCell(name,t,where,uninit){
    const c={id:++cellId,name,type:t,init:true,v:undefined,addr:0};
    switch(t.base){
      case 'array':{c.v=[];for(let i=0;i<t.n;i++){const e=makeCell('',t.elem,where,uninit);e.arr=c.v;e.idx=i;e.owner=c;c.v.push(e)}c.addr=c.v.length?c.v[0].addr:bump(where,TINT);return c}
      case 'vector':c.v=[];break;
      case 'string':c.v='';break;
      case 'struct':{const def=prog.structs.get(t.name);c.v={};
        for(const f of def.fields){const fc=makeCell(f.name,f.type,where,uninit&&!f.init);fc.owner=c;c.v[f.name]=fc;if(f.init)store(fc,syncR(f.init),f.line)}
        const first=def.fields[0];c.addr=first?c.v[first.name].addr:bump(where,TINT);return c}
      default:if(uninit){c.init=false;c.v=garbage(t)}else c.v=t.base==='bool'?false:t.base==='ptr'?null:0}
    c.addr=bump(where,t);return c}
  function syncR(e){const g=R(e);let r=g.next();while(!r.done)r=g.next();return r.value}

  /* conversions */
  function num(tv){const b=tv.t.base;if(b==='bool')return tv.v?1:0;if(NUM.has(b))return tv.v;if(b==='ptr')return tv.v?tv.v.addr:0;
    throw RT(`cannot use a ${tstr(tv.t)} as a number`,curLine)}
  function conv(tv,t,line){const b=t.base,sb=tv.t.base;
    if(b==='string'){if(sb==='string')return tv.v;if(sb==='char')return String.fromCharCode(tv.v);throw RT(`cannot convert '${tstr(tv.t)}' to 'string'`,line)}
    if(b==='ptr'){if(sb==='ptr')return tv.v;if(sb==='array')return tv.v[0]||null;if(NUM.has(sb)&&tv.v===0)return null;throw RT(`invalid conversion to pointer`,line)}
    if(NUM.has(b)){let x;if(sb==='ptr'&&b==='bool')return tv.v!==null;x=num(tv);
      switch(b){case 'bool':return x!==0;case 'double':return t.float?Math.fround(x):x;
        case 'char':{let c=Math.trunc(x)&255;if(c>127)c-=256;return c}
        case 'int':{let i=Math.trunc(x);if(!isFinite(x)){i=-2147483648}else if(i>2147483647||i<-2147483648){const w=Number(BigInt.asIntN(32,BigInt(i)));warnOnce('ovf'+line,`integer overflow: ${i} doesn't fit in an int, so it wrapped around to ${w}`,line,'An int can only hold numbers from -2,147,483,648 to 2,147,483,647. Go past the end and it wraps around like a car odometer. Use long long for bigger numbers.');i=w}return i}
        case 'long':return Math.trunc(x)}}
    throw RT(`cannot convert '${tstr(tv.t)}' to '${tstr(t)}'`,line)}
  function read(c){if(c.strOf)return c.strOf.v.charCodeAt(c.idx);return c.v}
  function readTV(c,e){if(!c.init&&!c.strOf){const nm=pathName(c)||'a variable';warnOnce('u'+c.id,`warning: '${nm}' is used uninitialized [-Wuninitialized]`,e?e.line:curLine,`${nm} was created without a starting value, so it holds whatever leftover bits were in that memory. That's the "garbage" number you see. Give it a value when you create it, like int ${nm.replace(/\W.*/,'')} = 0;`)}
    return {t:c.type,v:read(c),cell:c}}
  function store(c,tv,line){
    if(c.strOf){const s=c.strOf.v;const ch=String.fromCharCode(conv(tv,TCHAR,line)&255);c.strOf.v=s.slice(0,c.idx)+ch+s.slice(c.idx+1);changed.add(c.strOf.id);return}
    const t=c.type;
    switch(t.base){
      case 'vector':{let items;if(tv.t.base==='init')items=tv.v;else if(tv.t.base==='vector')items=tv.v.map(x=>readTV(x));else throw RT(`cannot convert '${tstr(tv.t)}' to '${tstr(t)}'`,line);
        c.v=items.map(it=>{const e=makeCell('',t.elem,'heap',false);store(e,it,line);return e});c.v.forEach((e,i)=>{e.arr=c.v;e.idx=i;e.owner=c});break}
      case 'array':{let items;if(tv.t.base==='init')items=tv.v;else if(tv.t.base==='array')items=tv.v.map(x=>readTV(x));else if(tv.t.base==='string'&&t.elem.base==='char')items=[...tv.v].map(ch=>({t:TCHAR,v:ch.charCodeAt(0)}));else throw RT('invalid array assignment',line);
        c.v.forEach((e,i)=>{if(i<items.length)store(e,items[i],line);else store(e,zeroOf(e.type),line)});break}
      case 'struct':{const def=prog.structs.get(t.name);
        if(tv.t.base==='init'){def.fields.forEach((f,i)=>{if(i<tv.v.length)store(c.v[f.name],tv.v[i],line);else if(!f.init)store(c.v[f.name],zeroOf(f.type),line)})}
        else if(tv.t.base==='struct'){def.fields.forEach(f=>store(c.v[f.name],readTV(tv.v[f.name]),line))}
        else throw RT(`cannot convert '${tstr(tv.t)}' to '${t.name}'`,line);break}
      default:
        if(tv.t.base==='init'){c.v=tv.v.length?conv(tv.v[0],t,line):(t.base==='string'?'':t.base==='ptr'?null:t.base==='bool'?false:0)}
        else c.v=conv(tv,t,line)}
    c.init=true;changed.add(c.id)}
  function zeroOf(t){if(t.base==='string')return {t:TSTR,v:''};if(t.base==='ptr')return {t:TNULL,v:null};if(NUM.has(t.base))return {t:TINT,v:0};return {t:{base:'init'},v:[]}}

  /* scopes */
  function pushScope(){frame().scopes.push(new Map())}
  function popScope(){const f=frame();const sc=f.scopes.pop();const ids=new Set();for(const v of sc.values())ids.add(v.disp||v.id);f.cells=f.cells.filter(c=>!ids.has(c.id))}
  function declareCell(name,c,disp){const f=frame();f.scopes[f.scopes.length-1].set(name,c);f.cells.push(disp||c);if(disp)c.disp=disp.id}
  function lookup(name){const f=frame();for(let i=f.scopes.length-1;i>=0;i--){const c=f.scopes[i].get(name);if(c)return c}return globals.scopes[0].get(name)||null}

  /* output */
  function emit(s){out(s)}
  function fmt(tv,line){const b=tv.t.base;let s;
    switch(b){case 'int':case 'long':s=String(tv.v);break;
      case 'double':s=ost.fixed?tv.v.toFixed(ost.prec):fmtG(tv.v,ost.prec);break;
      case 'bool':s=ost.boolalpha?(tv.v?'true':'false'):(tv.v?'1':'0');break;
      case 'char':s=tv.v===0?'':String.fromCharCode(tv.v<0?tv.v+256:tv.v);break;
      case 'string':s=tv.v;break;
      case 'ptr':s=tv.v?hex(tv.v.addr):(tv.t.isNull?'nullptr':'0');break;
      case 'array':if(tv.t.elem.base==='char'){s=tv.v.map(c=>String.fromCharCode(c.v)).join('').replace(/\0.*$/,'')}else{s=hex(tv.v[0]?tv.v[0].addr:0);warnOnce('arr'+line,'cout printed the address of the array, not its contents',line,'An array name on its own means "where the array starts in memory". To print the values, loop over it and print each element.')}break;
      case 'iter':s='(iterator)';break;
      default:throw RT(`no match for 'operator<<' with '${tstr(tv.t)}'`,line)}
    if(ost.width>0){s=s.padStart(ost.width);ost.width=0}return s}

  /* input */
  function* waitInput(){if(opt.noInput)throw RT('This program is waiting for keyboard input',curLine,'cin needs input, but none is available here.');
    const r=yield {input:true,line:curLine};const ln=r==null?'':String(r);inputs.push(ln);inBuf+=ln+'\n'}
  function* extract(c,line){
    if(cinFail){return}
    for(;;){const m=inBuf.match(/^\s*/);inBuf=inBuf.slice(m[0].length);if(inBuf.length)break;yield* waitInput()}
    const t=c.strOf?TCHAR:c.type;lastExtract=true;const nm=pathName(c)||'the variable';
    let m;
    switch(t.base){
      case 'int':case 'long':m=inBuf.match(/^[+-]?\d+/);if(!m){fail(c,line,nm,'a whole number');return}inBuf=inBuf.slice(m[0].length);store(c,{t:TLONG,v:+m[0]},line);
        if(/^\.\d/.test(inBuf))warnOnce('dot'+line,`cin read only the ${m[0]} part and left "${inBuf.match(/^\S+/)[0]}" waiting`,line,`${nm} is an int, which holds whole numbers only, so cin stopped at the decimal point. The rest stays in the input for the next cin. Use a double for numbers with decimals.`);break;
      case 'double':m=inBuf.match(/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/);if(!m){fail(c,line,nm,'a number');return}inBuf=inBuf.slice(m[0].length);store(c,{t:TDBL,v:parseFloat(m[0])},line);break;
      case 'char':store(c,{t:TCHAR,v:inBuf.charCodeAt(0)},line);inBuf=inBuf.slice(1);break;
      case 'string':m=inBuf.match(/^\S+/);inBuf=inBuf.slice(m[0].length);store(c,{t:TSTR,v:m[0]},line);
        if(/^[ \t]+\S/.test(inBuf))warnOnce('sp'+line,`cin >> stopped at the first space`,line,`cin >> reads one word. The rest of the line stays waiting for the next cin. To read a whole line with spaces, use getline(cin, ${nm});`);break;
      case 'bool':m=inBuf.match(/^[01]/);if(!m){fail(c,line,nm,'0 or 1');return}inBuf=inBuf.slice(1);store(c,{t:TBOOL,v:m[0]==='1'},line);break;
      default:throw RT(`cin can't read into a ${tstr(t)}`,line)}}
  function fail(c,line,nm,what){const bad=(inBuf.match(/^\S+/)||[''])[0];cinFail=true;store(c,{t:TINT,v:0},line);
    warnOnce('fail'+line,`cin failed: "${bad}" is not ${what}`,line,`${nm} is a ${tstr(c.type)}, so cin expected ${what}. When cin fails it sets the variable to 0 and ignores every cin after this one. Run again and type ${what}.`)}

  function pathName(cell){const names=nameMap();return names.get(cell.id)||null}
  function nameMap(){const m=new Map();const walk=(c,p)=>{if(!c||m.has(c.id))return;m.set(c.id,p);
      if(c.type.base==='array'||c.type.base==='vector')c.v.forEach((e,i)=>walk(e,p+'['+i+']'));
      else if(c.type.base==='struct')for(const k in c.v)walk(c.v[k],p+'.'+k)};
    for(const f of [globals,...stack])for(const c of f.cells)if(!c.ref)walk(c,c.name);return m}

  /* rand */
  function rnd(){seed=(Math.imul(seed,1103515245)+12345)>>>0;let x=seed;x^=x>>>15;x=Math.imul(x,0x2c1b3c6d)>>>0;x^=x>>>12;x=Math.imul(x,0x297a2d39)>>>0;x^=x>>>15;return x&0x7fffffff}

  /* expressions */
  const B=v=>({t:TBOOL,v:!!v});
  function mkNum(x,isD,isL,line){if(isD)return {t:TDBL,v:x};if(isL)return {t:TLONG,v:Math.trunc(x)};return {t:TINT,v:conv({t:TLONG,v:x},TINT,line)}}
  function ptrAdd(p,k,line){if(!p.v)throw RT('pointer arithmetic on a null pointer',line);const c=p.v;if(!c.arr)throw RT('pointer arithmetic on something that is not an array element',line,'Moving a pointer with + or ++ only makes sense inside an array.');
    const j=c.idx+k;if(j<0||j>c.arr.length)throw RT(`pointer moved outside the array (to position ${j} of ${c.arr.length})`,line,'Pointer arithmetic can move between elements of one array, but not past its ends.');
    return {t:p.t,v:j===c.arr.length?{id:-1,addr:c.addr+(j-c.idx)*sizeOf(c.type),end:true,arr:c.arr,idx:j,type:c.type}:c.arr[j]}}
  function arith(op,a,b,line){const ab=a.t.base,bb=b.t.base;
    if(ab==='string'||bb==='string'){const s=x=>x.t.base==='string'?x.v:x.t.base==='char'?String.fromCharCode(x.v):null;const L=s(a),R2=s(b);
      if(L==null||R2==null)throw RT(`no match for 'operator${op}' (operand types are '${tstr(a.t)}' and '${tstr(b.t)}')`,line);
      switch(op){case '+':return {t:TSTR,v:L+R2};case '==':return B(L===R2);case '!=':return B(L!==R2);case '<':return B(L<R2);case '>':return B(L>R2);case '<=':return B(L<=R2);case '>=':return B(L>=R2)}
      throw RT(`no match for 'operator${op}'`,line)}
    if(ab==='iter'){if(op==='+')return {t:TITER,v:{...a.v,pos:a.v.pos+num(b)}};if(op==='-'&&bb==='iter')return {t:TINT,v:a.v.pos-b.v.pos};if(op==='-')return {t:TITER,v:{...a.v,pos:a.v.pos-num(b)}};
      if(op==='=='||op==='!=')return B((a.v.pos===b.v.pos)===(op==='=='))}
    if(ab==='array')a={t:{base:'ptr',to:a.t.elem},v:a.v[0]};if(bb==='array')b={t:{base:'ptr',to:b.t.elem},v:b.v[0]};
    if(a.t.base==='ptr'||b.t.base==='ptr'){
      if(op==='=='||op==='!='){const x=a.t.base==='ptr'?(a.v?a.v.addr:0):num(a),y=b.t.base==='ptr'?(b.v?b.v.addr:0):num(b);return B((x===y)===(op==='=='))}
      if(op==='+'&&a.t.base==='ptr')return ptrAdd(a,num(b),line);if(op==='+')return ptrAdd(b,num(a),line);if(op==='-'&&b.t.base!=='ptr')return ptrAdd(a,-num(b),line);
      if(op==='-')return {t:TLONG,v:(a.v.idx||0)-(b.v.idx||0)};
      const x=a.v?a.v.addr:0,y=b.v?b.v.addr:0;return B(op==='<'?x<y:op==='>'?x>y:op==='<='?x<=y:x>=y)}
    const isD=ab==='double'||bb==='double',isL=ab==='long'||bb==='long';const x=num(a),y=num(b);
    switch(op){case '+':return mkNum(x+y,isD,isL,line);case '-':return mkNum(x-y,isD,isL,line);
      case '*':return mkNum(isD?x*y:Number(BigInt(Math.trunc(x))*BigInt(Math.trunc(y))),isD,isL,line);
      case '/':if(isD)return {t:TDBL,v:x/y};if(y===0)throw RT('Floating point exception (core dumped)',line,'The program divided a whole number by zero, which is impossible, so it crashed. Check the value you divide by before dividing.','crash');return mkNum(Math.trunc(x/y),false,isL,line);
      case '%':if(y===0)throw RT('Floating point exception (core dumped)',line,'% by zero is impossible (it divides), so the program crashed.','crash');return mkNum(x%y,false,isL,line);
      case '==':return B(x===y);case '!=':return B(x!==y);case '<':return B(x<y);case '>':return B(x>y);case '<=':return B(x<=y);case '>=':return B(x>=y)}
    throw RT('unknown operator '+op,line)}
  function truthy(tv){const b=tv.t.base;if(b==='bool')return tv.v;if(NUM.has(b))return tv.v!==0;if(b==='ptr')return !!tv.v;if(b==='istream')return !cinFail;if(b==='string')return true;return !!tv.v}

  function* R(e){
    switch(e.k){
      case 'num':return {t:e.isD?TDBL:(Math.abs(e.v)>2147483647?TLONG:TINT),v:e.v};
      case 'str':return {t:TSTR,v:e.v};case 'chr':return {t:TCHAR,v:e.v};case 'bool':return B(e.v);
      case 'null':return {t:TNULL,v:null};case 'npos':return {t:TLONG,v:-1};
      case 'id':{const c=e.std?null:lookup(e.name);if(c)return readTV(c,e);
        switch(e.name){case 'cout':case 'cerr':return {t:TOUT,v:e.name};case 'cin':return {t:TIN,v:'cin'};case 'endl':return {t:TENDL};
          case 'fixed':return {t:TMANIP,v:{fixed:true}};case 'boolalpha':return {t:TMANIP,v:{boolalpha:true}};case 'RAND_MAX':return {t:TINT,v:2147483647};case 'NULL':return {t:TNULL,v:null}}
        throw RT(`'${e.name}' was not declared`,e.line)}
      case 'idx':case 'mem':{const c=yield* L(e);return readTV(c,e)}
      case 'cast':{const v=yield* R(e.e);const t=e.type.base==='float'?TDBL:e.type;if(t.base==='ptr')return {t,v:v.v};return {t:{base:t.base},v:conv(v,{base:t.base},e.line)}}
      case 'sizeof':{if(e.type)return {t:TLONG,v:sizeOf(e.type)};const v=yield* R(e.e);return {t:TLONG,v:sizeOf(v.t)}}
      case 'init':{const items=[];for(const it of e.items)items.push(yield* R(it));return {t:{base:'init'},v:items}}
      case 'tern':{const c=yield* R(e.c);return yield* R(truthy(c)?e.a:e.b)}
      case 'un':{
        if(e.op==='&'){const c=yield* L(e.e);return {t:{base:'ptr',to:c.type},v:c}}
        if(e.op==='*'){const c=yield* L(e);return readTV(c,e)}
        const v=yield* R(e.e);
        if(e.op==='!')return B(!truthy(v));
        if(e.op==='-'){const isD=v.t.base==='double';return mkNum(-num(v),isD,v.t.base==='long',e.line)}
        return mkNum(num(v),v.t.base==='double',v.t.base==='long',e.line)}
      case 'pre':case 'post':{const c=yield* L(e.e);const old=readTV(c,e);const d=e.op==='++'?1:-1;
        let nv;if(old.t.base==='ptr')nv=ptrAdd(old,d,e.line);else nv=arith('+',old,{t:TINT,v:d},e.line);
        if(old.t.base==='ptr'){c.v=nv.v;c.init=true;changed.add(c.id)}else store(c,nv,e.line);
        return e.k==='pre'?readTV(c):old}
      case 'assign':{const c=yield* L(e.l);const r=yield* R(e.r);
        if(e.op==='='){store(c,r,e.line);return readTV(c)}
        const cur=readTV(c,e);
        if(cur.t.base==='string'){store(c,arith('+',cur,r,e.line),e.line);return readTV(c)}
        if(cur.t.base==='ptr'){c.v=ptrAdd(cur,e.op==='+='?num(r):-num(r),e.line).v;changed.add(c.id);return readTV(c)}
        store(c,arith(e.op[0],cur,r,e.line),e.line);return readTV(c)}
      case 'bin':{
        if(e.op==='&&'){const a=yield* R(e.l);if(!truthy(a))return B(false);return B(truthy(yield* R(e.r)))}
        if(e.op==='||'){const a=yield* R(e.l);if(truthy(a))return B(true);return B(truthy(yield* R(e.r)))}
        const a=yield* R(e.l);
        if(e.op==='<<'&&a.t.base==='ostream'){const r=yield* R(e.r);
          if(r.t.base==='endl'){emit('\n')}
          else if(r.t.base==='manip'){Object.assign(ost,r.v)}
          else emit(fmt(r,e.line));return a}
        if(e.op==='>>'&&a.t.base==='istream'){const c=yield* L(e.r);yield* extract(c,e.line);return a}
        const b=yield* R(e.r);
        if(e.op==='<<'||e.op==='>>'){const x=num(a),y=num(b);return {t:TINT,v:e.op==='<<'?x<<y:x>>y}}
        return arith(e.op,a,b,e.line)}
      case 'call':return yield* call(e);
      case 'construct':{const c=makeCell('',e.type,'heap',false);if(e.init)store(c,yield* R(e.init),e.line);else yield* ctor(c,e.args,e.line);return {t:c.type,v:c.v,cell:c}}
    }
    throw RT('cannot evaluate this expression',e.line)}
  function* L(e){
    switch(e.k){
      case 'id':{const c=lookup(e.name);if(!c)throw RT(`'${e.name}' is not a variable`,e.line);return c}
      case 'idx':{const base=yield* Lor(e.e);const iv=yield* R(e.i);let i=num(iv);const bt=base.type.base;
        if(bt==='string'){const len=base.v.length;if(i<0||i>=len)throw RT(`string index ${i} is out of range`,e.line,`${pathName(base)||'The string'} has ${len} characters, numbered 0 to ${len-1}. Position ${i} doesn't exist. Reading past the end of a string in real C++ gives garbage or a crash.`,'oob');
          return {id:base.id*1000+i+0.5,strOf:base,idx:i,type:TCHAR,init:true,name:''}}
        if(bt==='ptr'){if(!base.init)throw RT('Segmentation fault (core dumped)',e.line,'This pointer was never given an address, so it points at random memory.','crash');
          const p=read(base);if(!p)throw RT('Segmentation fault (core dumped)',e.line,'The pointer is nullptr. It points at nothing, so there is nothing to read.','crash');
          if(!p.arr){if(i===0)return p;throw RT(`index ${i} on a pointer to a single variable`,e.line,'This pointer points at one variable, not an array.')}
          const j=p.idx+i;if(j<0||j>=p.arr.length)throw RT(`array index ${j} is out of bounds`,e.line,`The array has ${p.arr.length} elements, numbered 0 to ${p.arr.length-1}.`,'oob');return p.arr[j]}
        if(bt!=='array'&&bt!=='vector')throw RT('subscript on a non-array',e.line);
        const n=base.v.length;const nm=pathName(base)||'the array';
        if(i<0||i>=n)throw RT(`index ${i} is out of bounds for ${nm} (size ${n})`,e.line,n?`${nm} has ${n} element${n===1?'':'s'}, numbered 0 to ${n-1}. Position ${i} doesn't exist. Counting starts at 0, so the last element is ${nm}[${n-1}]. Real C++ doesn't check this for you: it silently reads or overwrites whatever memory comes next, which causes some of the nastiest bugs there are.`:`${nm} is empty, so there is nothing at position ${i}. Add items with push_back first.`,'oob');
        return base.v[i]}
      case 'mem':{let base=yield* Lor(e.e);
        if(e.arrow){if(!base.init)throw RT('Segmentation fault (core dumped)',e.line,'This pointer was never given an address.','crash');base=read(base);if(!base)throw RT('Segmentation fault (core dumped)',e.line,'The pointer is nullptr, so -> has nothing to reach into.','crash')}
        const c=base.v&&base.v[e.name];if(!c)throw RT(`no member named '${e.name}'`,e.line);return c}
      case 'un':if(e.op==='*'){const p=yield* R(e.e);
          if(p.t.base==='array')return p.v[0];
          if(p.cell&&!p.cell.init)throw RT('Segmentation fault (core dumped)',e.line,`The pointer ${pathName(p.cell)||''} was never given an address, so it points at a random spot in memory. Always set a pointer before using it: int* p = &x; or int* p = nullptr;`,'crash');
          if(!p.v)throw RT('Segmentation fault (core dumped)',e.line,'You used * on a null pointer. nullptr means "points at nothing", so there is nothing to read. Check with if (p != nullptr) first.','crash');
          if(p.v.end)throw RT('Segmentation fault (core dumped)',e.line,'The pointer has moved past the end of the array.','crash');
          return p.v}break;
      case 'pre':{yield* R(e);return yield* L(e.e)}
      case 'assign':{yield* R(e);return yield* L(e.l)}
    }
    throw RT('lvalue required',e.line)}
  function* Lor(e){if(e.k==='id'||e.k==='idx'||e.k==='mem'||(e.k==='un'&&e.op==='*'))return yield* L(e);
    const v=yield* R(e);const c={id:++cellId,name:'',type:v.t,v:v.v,init:true,addr:0,temp:true};
    if(v.t.base==='vector'||v.t.base==='struct'){const nc=makeCell('',v.t,'heap',false);store(nc,v,e.line);return nc}return c}

  function* call(e){const f=e.f;
    if(f.k==='mem')return yield* method(e);
    const name=f.name;const fl=!f.std&&prog.funcs.get(name);
    if(fl){const fn=fl.find(x=>x.params.length===e.args.length&&x.body)||fl[0];return yield* callUser(fn,e)}
    return yield* builtin(name,e)}
  function* callUser(fn,e){
    const binds=[];
    for(let i=0;i<fn.params.length;i++){const p=fn.params[i],a=e.args[i];
      if(p.type.ref){let c;if(a.k==='id'||a.k==='idx'||a.k==='mem'||(a.k==='un'&&a.op==='*'))c=yield* L(a);else{const v=yield* R(a);c=makeCell('',{...p.type,ref:false},'stack',false);store(c,v,e.line)}binds.push({p,cell:c,ref:true})}
      else binds.push({p,val:yield* R(a)})}
    if(stack.length>=600)throw RT('Segmentation fault (core dumped)  [stack overflow]',e.line,`${fn.name} kept calling itself and never stopped, until the call stack ran out of room. A recursive function needs a base case: an if that returns without calling itself again.`,'crash');
    const fr={name:fn.name,cells:[],scopes:[new Map()],callLine:e.line,fn};
    if(stack.some(s=>s.name===fn.name))recursed.add(fn.name);
    stack.push(fr);maxDepth=Math.max(maxDepth,stack.length);calls[fn.name]=(calls[fn.name]||0)+1;
    for(const b of binds){if(!b.p.name)continue;
      if(b.ref){const disp={id:++cellId,ref:true,name:b.p.name,type:b.cell.type,target:b.cell,isConst:b.p.type.isConst};declareCell(b.p.name,b.cell,disp)}
      else{const t={...b.p.type};delete t.ref;const c=makeCell(b.p.name,t,'stack',false);if(t.base==='ptr'&&b.val.t.base==='array'){c.v=b.val.v[0]||null}else store(c,b.val,e.line);declareCell(b.p.name,c)}}
    let rv=null;
    try{yield {line:fn.line,enter:true};for(const s of fn.body.body)yield* exec(s);
      if(fn.ret.base!=='void'){warnOnce('noret'+fn.name,`'${fn.name}' reached the end without returning a value`,fn.body.end,`${fn.name} promises to return a ${tstr(fn.ret)} but no return ran, so the caller gets garbage.`);rv={t:fn.ret,v:garbage(fn.ret)??0}}}
    catch(x){if(!(x instanceof Ret))throw x;rv=x.v}
    finally{stack.pop()}
    curLine=e.line;
    if(fn.ret.base==='void')return {t:TVOID,v:null};
    if(fn.ret.ref&&rv&&rv.cell)return rv;
    const t={...fn.ret};delete t.ref;
    if(t.base==='vector'||t.base==='struct'){const c=makeCell('',t,'heap',false);store(c,rv,e.line);return {t,v:c.v,cell:c}}
    return {t:{base:t.base,to:t.to,elem:t.elem,name:t.name},v:t.base==='ptr'?rv.v:conv(rv,t,e.line)}}
  function* method(e){const f=e.f;let oc=yield* Lor(f.e);
    if(f.arrow){oc=read(oc);if(!oc)throw RT('Segmentation fault (core dumped)',e.line,'The pointer is nullptr.','crash')}
    const args=[];for(const a of e.args)args.push(yield* R(a));const ln=e.line;const nm=pathName(oc)||'it';
    const tb=oc.type.base;
    if(tb==='istream'||oc.v==='cin'){if(f.name==='ignore'){const i=inBuf.indexOf('\n');inBuf=i<0?'':inBuf.slice(i+1);return {t:TVOID}}if(f.name==='fail')return B(cinFail);if(f.name==='clear'){cinFail=false;return {t:TVOID}}if(f.name==='get'){if(!inBuf.length)yield* waitInput();const c=inBuf.charCodeAt(0);inBuf=inBuf.slice(1);return {t:TCHAR,v:c}}return {t:TVOID}}
    if(tb==='string'){const s=oc.v;
      switch(f.name){case 'length':case 'size':return {t:TINT,v:s.length};case 'empty':return B(!s.length);
        case 'substr':{const p=args[0]?num(args[0]):0;if(p>s.length)throw RT(`terminate called after throwing an instance of 'std::out_of_range'\n  what():  basic_string::substr: __pos (which is ${p}) > this->size() (which is ${s.length})`,ln,`substr starts at position ${p}, but ${nm} only has ${s.length} characters.`,'crash');const n=args[1]?num(args[1]):s.length;return {t:TSTR,v:s.substr(p,n)}}
        case 'find':{const q=args[0].t.base==='char'?String.fromCharCode(args[0].v):args[0].v;return {t:TLONG,v:s.indexOf(q,args[1]?num(args[1]):0)}}
        case 'at':{const i=num(args[0]);if(i<0||i>=s.length)throw RT(`terminate called after throwing an instance of 'std::out_of_range'\n  what():  basic_string::at: __n (which is ${i}) >= this->size() (which is ${s.length})`,ln,`${nm} has ${s.length} characters (0 to ${s.length-1}). .at() checks the position and stops the program when it's wrong, instead of reading garbage.`,'crash');return {t:TCHAR,v:s.charCodeAt(i),cell:{strOf:oc,idx:i,type:TCHAR,init:true,id:oc.id*1000+i+0.5}}}
        case 'back':return {t:TCHAR,v:s.charCodeAt(s.length-1)};case 'front':return {t:TCHAR,v:s.charCodeAt(0)};
        case 'push_back':store(oc,{t:TSTR,v:s+String.fromCharCode(num(args[0]))},ln);return {t:TVOID};
        case 'pop_back':store(oc,{t:TSTR,v:s.slice(0,-1)},ln);return {t:TVOID};
        case 'clear':store(oc,{t:TSTR,v:''},ln);return {t:TVOID};
        case 'append':store(oc,{t:TSTR,v:s+(args[0].t.base==='char'?String.fromCharCode(args[0].v):args[0].v)},ln);return {t:TSTR,v:oc.v};
        case 'insert':{const p=num(args[0]);store(oc,{t:TSTR,v:s.slice(0,p)+args[1].v+s.slice(p)},ln);return {t:TSTR,v:oc.v}}
        case 'erase':{const p=args[0]?num(args[0]):0;const n=args[1]?num(args[1]):s.length;store(oc,{t:TSTR,v:s.slice(0,p)+s.slice(p+n)},ln);return {t:TSTR,v:oc.v}}}}
    if(tb==='vector'){const v=oc.v,et=oc.type.elem;
      const reidx=()=>v.forEach((c,i)=>{c.idx=i;c.arr=v});
      switch(f.name){case 'size':return {t:TINT,v:v.length};case 'empty':return B(!v.length);
        case 'push_back':{const c=makeCell('',et,'heap',false);store(c,args[0],ln);c.arr=v;c.idx=v.length;c.owner=oc;v.push(c);changed.add(oc.id);changed.add(c.id);return {t:TVOID}}
        case 'pop_back':if(!v.length)throw RT('pop_back() on an empty vector',ln,`${nm} is already empty. Real C++ doesn't check this and the program misbehaves. Check .empty() first.`,'crash');v.pop();changed.add(oc.id);return {t:TVOID};
        case 'at':{const i=num(args[0]);if(i<0||i>=v.length)throw RT(`terminate called after throwing an instance of 'std::out_of_range'\n  what():  vector::_M_range_check: __n (which is ${i}) >= this->size() (which is ${v.length})`,ln,`${nm} has ${v.length} element${v.length===1?'':'s'}${v.length?` (0 to ${v.length-1})`:''}. .at() checks the position and stops the program with this message instead of reading random memory.`,'crash');return readTV(v[i])}
        case 'back':case 'front':if(!v.length)throw RT(`${f.name}() on an empty vector`,ln,`${nm} is empty, so there is no ${f.name==='back'?'last':'first'} element.`,'crash');return readTV(f.name==='back'?v[v.length-1]:v[0]);
        case 'clear':v.length=0;changed.add(oc.id);return {t:TVOID};
        case 'begin':return {t:TITER,v:{owner:oc,pos:0}};case 'end':return {t:TITER,v:{owner:oc,pos:v.length}};
        case 'erase':{const it=args[0];const p=it.v.pos;if(p<0||p>=v.length)throw RT('erase position out of range',ln,`erase(${nm}.begin() + i) needs i between 0 and ${v.length-1}.`,'crash');v.splice(p,1);reidx();changed.add(oc.id);return {t:TVOID}}
        case 'insert':{const p=args[0].v.pos;const c=makeCell('',et,'heap',false);store(c,args[1],ln);c.owner=oc;v.splice(p,0,c);reidx();changed.add(oc.id);changed.add(c.id);return {t:TVOID}}}}
    throw RT(`no member function '${f.name}'`,ln)}
  function* builtin(name,e){const ln=e.line;
    const A=function*(i){return yield* R(e.args[i])};
    switch(name){
      case 'sqrt':{const x=num(yield* A(0));return {t:TDBL,v:Math.sqrt(x)}}
      case 'pow':{const x=num(yield* A(0)),y=num(yield* A(1));return {t:TDBL,v:Math.pow(x,y)}}
      case 'floor':return {t:TDBL,v:Math.floor(num(yield* A(0)))};case 'ceil':return {t:TDBL,v:Math.ceil(num(yield* A(0)))};
      case 'round':{const x=num(yield* A(0));return {t:TDBL,v:Math.sign(x)*Math.round(Math.abs(x))}}
      case 'fabs':return {t:TDBL,v:Math.abs(num(yield* A(0)))};
      case 'abs':{const v=yield* A(0);return v.t.base==='double'?{t:TDBL,v:Math.abs(v.v)}:{t:TINT,v:Math.abs(num(v))}}
      case 'max':case 'min':{const a=yield* A(0),b=yield* A(1);const gt=truthy(arith('<',a,b,ln));const pickB=name==='max'?gt:!gt;const r=pickB?b:a;return {t:r.t,v:r.v}}
      case 'rand':return {t:TINT,v:rnd()};
      case 'srand':{seed=(num(yield* A(0))>>>0)||1;return {t:TVOID}}
      case 'time':{if(e.args[0])yield* A(0);return {t:TLONG,v:Math.floor(Date.now()/1000)}}
      case 'to_string':{const v=yield* A(0);const b=v.t.base;return {t:TSTR,v:b==='double'?v.v.toFixed(6):b==='char'?String(v.v):b==='bool'?(v.v?'1':'0'):String(v.v)}}
      case 'stoi':{const v=yield* A(0);const m=String(v.v).match(/^\s*[+-]?\d+/);if(!m)throw RT(`terminate called after throwing an instance of 'std::invalid_argument'\n  what():  stoi`,ln,`stoi could not find a number at the start of "${v.v}".`,'crash');return {t:TINT,v:parseInt(m[0],10)}}
      case 'stod':{const v=yield* A(0);const x=parseFloat(v.v);if(isNaN(x))throw RT(`terminate called after throwing an instance of 'std::invalid_argument'\n  what():  stod`,ln,`stod could not find a number in "${v.v}".`,'crash');return {t:TDBL,v:x}}
      case 'toupper':{const c=num(yield* A(0));return {t:TINT,v:c>=97&&c<=122?c-32:c}}
      case 'tolower':{const c=num(yield* A(0));return {t:TINT,v:c>=65&&c<=90?c+32:c}}
      case 'isdigit':{const c=num(yield* A(0));return {t:TBOOL,v:c>=48&&c<=57}}
      case 'isalpha':{const c=num(yield* A(0));return {t:TBOOL,v:c>=65&&c<=90||c>=97&&c<=122}}
      case 'isupper':{const c=num(yield* A(0));return {t:TBOOL,v:c>=65&&c<=90}}
      case 'islower':{const c=num(yield* A(0));return {t:TBOOL,v:c>=97&&c<=122}}
      case 'isspace':{const c=num(yield* A(0));return {t:TBOOL,v:c===32||c===9||c===10}}
      case 'getline':{yield* A(0);const c=yield* L(e.args[1]);if(cinFail){return {t:TIN}}
        while(!inBuf.includes('\n'))yield* waitInput();const i=inBuf.indexOf('\n');const s=inBuf.slice(0,i);inBuf=inBuf.slice(i+1);store(c,{t:TSTR,v:s},ln);
        if(s===''&&lastExtract)warnOnce('gl'+ln,'getline read an empty line',ln,'The Enter you pressed after the earlier cin >> was still waiting in the input, so getline grabbed that empty line. Put cin.ignore(); on the line before getline to throw it away.');
        lastExtract=false;return {t:TIN}}
      case 'swap':{const a=yield* L(e.args[0]),b=yield* L(e.args[1]);const ta=readTV(a),tb=readTV(b);const ca={...ta},cb={...tb};
        if(a.type.base==='vector'||a.type.base==='struct'){const tmp=makeCell('',a.type,'heap',false);store(tmp,ta,ln);store(a,tb,ln);store(b,readTV(tmp),ln)}else{store(a,cb,ln);store(b,ca,ln)}return {t:TVOID}}
      case 'sort':case 'reverse':{const b=yield* A(0),en=yield* A(1);
        let arr,lo,hi;if(b.t.base==='iter'){arr=b.v.owner.v;lo=b.v.pos;hi=en.v.pos}else if(b.t.base==='array'||b.t.base==='ptr'){const p=b.t.base==='array'?b.v[0]:b.v;arr=p.arr;lo=p.idx;hi=en.t.base==='ptr'?en.v.idx:en.v[0].idx}else throw RT(name+' needs a range',ln);
        const vals=arr.slice(lo,hi).map(c=>readTV(c));
        if(name==='sort')vals.sort((x,y)=>truthy(arith('<',x,y,ln))?-1:truthy(arith('<',y,x,ln))?1:0);else vals.reverse();
        vals.forEach((v,i)=>store(arr[lo+i],{...v},ln));return {t:TVOID}}
      case 'setprecision':return {t:TMANIP,v:{prec:num(yield* A(0))}};
      case 'setw':return {t:TMANIP,v:{width:num(yield* A(0))}};
      case 'exit':{const c=e.args[0]?num(yield* A(0)):0;throw new ExitSig(c)}
      case 'string':{if(e.args.length===2){const n=num(yield* A(0)),c=yield* A(1);return {t:TSTR,v:String.fromCharCode(num(c)).repeat(Math.max(0,n))}}const v=e.args[0]?yield* A(0):{t:TSTR,v:''};return {t:TSTR,v:v.t.base==='char'?String.fromCharCode(v.v):v.v}}
    }
    throw RT(`'${name}' was not declared in this scope`,ln)}

  /* statements */
  function* exec(s){
    if(s.k!=='block'&&s.k!=='empty'){curLine=s.line;if(++steps>LIMIT)throw RT(`stopped after ${LIMIT.toLocaleString('en-US')} steps`,s.line,'The program kept running without finishing. That is almost always an infinite loop: a loop whose condition never becomes false. Check that the loop changes the variable in its condition, like i++.','loop');yield {line:s.line}}
    switch(s.k){
      case 'block':pushScope();try{for(const st of s.body)yield* exec(st)}finally{popScope()}return;
      case 'empty':return;
      case 'decl':for(const it of s.items)yield* declare(s,it);return;
      case 'expr':yield* R(s.e);return;
      case 'if':{const c=yield* R(s.cond);if(truthy(c)){pushScope();try{yield* exec(s.then)}finally{popScope()}}else if(s.els){pushScope();try{yield* exec(s.els)}finally{popScope()}}return}
      case 'while':{let first=true;for(;;){if(!first){curLine=s.line;if(++steps>LIMIT)throw RT(`stopped after ${LIMIT.toLocaleString('en-US')} steps`,s.line,'The loop kept going without ever stopping. Make sure something inside the loop changes the variable the condition checks, so it eventually becomes false.','loop');yield {line:s.line}}first=false;
          const c=yield* R(s.cond);if(!truthy(c))break;try{pushScope();try{yield* exec(s.body)}finally{popScope()}}catch(x){if(x===BRK)break;if(x===CONT)continue;throw x}}return}
      case 'do':{for(;;){try{pushScope();try{yield* exec(s.body)}finally{popScope()}}catch(x){if(x===BRK)break;if(x!==CONT)throw x}
          curLine=s.line;yield {line:s.line};const c=yield* R(s.cond);if(!truthy(c))break}return}
      case 'for':{pushScope();try{if(s.init){if(s.init.k==='decl'){for(const it of s.init.items)yield* declare(s.init,it)}else yield* R(s.init.e)}
          let first=true;for(;;){if(!first){curLine=s.line;if(++steps>LIMIT)throw RT(`stopped after ${LIMIT.toLocaleString('en-US')} steps`,s.line,'This for loop never stops. Check the condition (middle part) and the step (last part): does the step move the counter toward making the condition false?','loop');yield {line:s.line}}first=false;
            if(s.cond){const c=yield* R(s.cond);if(!truthy(c))break}
            try{pushScope();try{yield* exec(s.body)}finally{popScope()}}catch(x){if(x===BRK)break;if(x!==CONT)throw x}
            if(s.step)yield* R(s.step)}}finally{popScope()}return}
      case 'forin':{const it=yield* R(s.iter);let items;
        if(it.t.base==='string')items=[...it.v].map((ch,i)=>({t:TCHAR,v:ch.charCodeAt(0),cell:it.cell?{strOf:it.cell,idx:i,type:TCHAR,init:true,id:it.cell.id*1000+i+0.5}:null}));
        else if(it.t.base==='init')items=it.v;else items=it.v.map(c=>({...readTV(c),cell:c}));
        let ty=s.type;if(ty.base==='auto')ty=it.t.base==='string'?TCHAR:it.t.base==='init'?it.v[0].t:it.t.elem;
        let first=true;
        for(const item of items){if(!first){curLine=s.line;steps++;yield {line:s.line}}first=false;
          pushScope();try{
            if(s.type.ref&&item.cell){const disp={id:++cellId,ref:true,name:s.name,type:item.cell.type,target:item.cell};declareCell(s.name,item.cell,disp)}
            else{const t={...ty};delete t.ref;const c=makeCell(s.name,t,'stack',false);store(c,item,s.line);declareCell(s.name,c)}
            try{yield* exec(s.body)}catch(x){if(x===BRK){break}if(x!==CONT)throw x}}finally{popScope()}}
        return}
      case 'return':{const v=s.e?yield* R(s.e):null;throw new Ret(v)}
      case 'break':throw BRK;case 'continue':throw CONT;
      case 'switch':{const v=num(yield* R(s.e));let idx=-1;
        for(let i=0;i<s.cases.length;i++){const c=s.cases[i];if(c.v&&num(syncR(c.v))===v){idx=i;break}}
        if(idx<0)idx=s.cases.findIndex(c=>!c.v);if(idx<0)return;
        pushScope();try{for(let i=idx;i<s.cases.length;i++)for(const st of s.cases[i].body)yield* exec(st)}catch(x){if(x!==BRK)throw x}finally{popScope()}return}
    }}
  function* declare(d,it){
    let ty=it.rt||d.type;const where=frame().global?'global':'stack';
    if(ty.ref){const c=yield* L(it.init);const disp={id:++cellId,ref:true,name:it.name,type:c.type,target:c,isConst:ty.isConst};declareCell(it.name,c,disp);return}
    let init=null;if(it.init)init=yield* R(it.init);
    if(ty.base==='auto'){ty={...init.t};delete ty.lit;delete ty.zero;if(ty.base==='init')ty=TINT}
    const t={...ty};delete t.ref;
    const c=makeCell(it.name,t,where,!it.init&&!it.args&&where!=='global');
    if(t.isConst)c.isConst=true;
    if(init){if(t.base==='ptr'&&init.t.base==='array'){c.v=init.v[0]||null;c.init=true}else store(c,init,d.line)}
    else if(it.args)yield* ctor(c,it.args,d.line);
    declareCell(it.name,c)}
  function* ctor(c,argEs,line){const t=c.type;const args=[];for(const a of argEs)args.push(yield* R(a));
      if(t.base==='vector'){const n=args[0]?num(args[0]):0;if(n>100000)throw RT('vector too large for this playground',line);const fill=args[1]||zeroOf(t.elem);store(c,{t:{base:'init'},v:Array.from({length:n},()=>fill)},line)}
      else if(t.base==='string'){if(args.length===2)store(c,{t:TSTR,v:String.fromCharCode(num(args[1])).repeat(Math.max(0,num(args[0])))},line);else if(args[0])store(c,args[0],line)}
      else if(args[0])store(c,args[0],line)}

  /* driver */
  function* main(){
    for(const d of prog.globals){for(const it of d.items)yield* declare(d,it)}
    const fn=prog.funcs.get('main')[0];const fr={name:'main',cells:[],scopes:[new Map()],callLine:0,fn};stack.push(fr);calls.main=1;
    try{yield {line:fn.line,enter:true};for(const s of fn.body.body)yield* exec(s)}
    catch(x){if(x instanceof Ret)exitCode=x.v?num(x.v):0;else if(x instanceof ExitSig)exitCode=x.code;else throw x}
    finally{mainSnap=snapshot(fr)}
    curLine=fn.body.end;
    return exitCode}
  function plain(c){if(!c)return null;if(c.ref)return plain(c.target);const b=c.type.base;
    if(b==='array'||b==='vector')return c.v.map(plain);if(b==='struct'){const o={};for(const k in c.v)o[k]=plain(c.v[k]);return o}
    if(b==='ptr')return c.v?{to:pathName(c.v)}:null;if(b==='char')return String.fromCharCode(c.v);return c.v}
  function snapshot(fr){const o={};for(const c of fr.cells){o[c.name]={type:tstr(c.ref?c.target.type:c.type)+(c.ref?'&':''),v:plain(c),init:c.ref?true:c.init}}
    for(const c of globals.cells)if(!(c.name in o))o[c.name]={type:tstr(c.type),v:plain(c),init:c.init,global:true};return o}

  /* memory view */
  function viewItem(c,names,label){
    if(c.ref)return {kind:'ref',id:c.id,name:label??c.name,type:tstr(c.type)+'&',target:names.get(c.target.id)||'?',tid:c.target.id,val:valStr(c.target),changed:changed.has(c.target.id)};
    const b=c.type.base;const base={id:c.id,name:label??c.name,type:tstr(c.type),addr:hex(c.addr),changed:changed.has(c.id),init:c.init,isConst:!!c.isConst};
    if(b==='array'||b==='vector')return {...base,kind:b,items:c.v.map((e,i)=>viewItem(e,names,String(i)))};
    if(b==='struct')return {...base,kind:'struct',items:Object.keys(c.v).map(k=>viewItem(c.v[k],names,k))};
    if(b==='ptr')return {...base,kind:'ptr',val:!c.init?'??':c.v?hex(c.v.addr):'nullptr',target:c.init&&c.v?(c.v.end?'(one past the end)':names.get(c.v.id)||'?'):null,tid:c.v&&c.v.id};
    return {...base,kind:'prim',val:c.init?valStr(c):'??',garbage:!c.init?valStr(c):null}}
  function valStr(c){const b=c.type.base;const v=c.v;
    switch(b){case 'string':return JSON.stringify(v);case 'char':return v===0?"'\\0'":v===10?"'\\n'":"'"+String.fromCharCode(v<0?v+256:v)+"'";case 'bool':return v?'true':'false';
      case 'double':return fmtG(v,8);case 'ptr':return v?hex(v.addr):'nullptr';case 'vector':case 'array':return `[${v.length}]`;case 'struct':return '{…}';default:return String(v)}}
  function view(){const names=nameMap();const fr=[];
    if(globals.cells.length)fr.push({name:'globals',global:true,items:globals.cells.map(c=>viewItem(c,names))});
    stack.forEach((f,i)=>fr.push({name:f.name,callLine:f.callLine,top:i===stack.length-1,items:f.cells.map(c=>viewItem(c,names))}));
    return fr}

  const gen=main();let state='ready',pendingInput=null;
  return {
    next(inputLine){let r;
      try{r=pendingInput?gen.next(inputLine):gen.next()}
      catch(x){state='error';if(x instanceof CErr){if(!x.line)x.line=curLine;throw x}if(x instanceof RangeError)throw RT('Segmentation fault (core dumped)  [stack overflow]',curLine,'Too many function calls inside each other. A recursive function needs a base case that stops it.','crash');throw x}
      pendingInput=null;
      if(r.done){state='done';return {done:true,code:r.value}}
      if(r.value.input){pendingInput=true;state='input';return {input:true,line:r.value.line}}
      return {line:r.value.line,enter:r.value.enter}},
    get line(){return curLine},
    view,clearChanged(){changed.clear()},
    info(){return {calls,maxDepth,recursed:[...recursed],mainSnap,inputs,steps,exitCode,depth:stack.length,cinFail}},
    get depth(){return stack.length}
  }}

function compile(src){
  try{const prog=parse(src);const warnings=check(prog);return {ok:true,prog,warnings}}
  catch(e){if(e instanceof CErr)return {ok:false,error:e,warnings:[]};throw e}}
/* run to completion with canned input (used for checks and the arcade) */
function runAll(src,inputLines,limit){const c=compile(src);if(!c.ok)return {ok:false,error:c.error,out:'',warnings:[]};
  let out='';const warns=[...c.warnings];const m=Machine(c.prog,{out:s=>{out+=s},warn:w=>warns.push(w),limit:limit||200000,noInput:!inputLines});
  const ins=(inputLines||[]).slice();let r,arg;
  try{for(;;){r=m.next(arg);arg=undefined;if(r.done)break;if(r.input){if(!ins.length)return {ok:false,out,error:RT('ran out of input',m.line),warnings:warns,m};arg=ins.shift()}}}
  catch(e){return {ok:false,out,error:e,warnings:warns,m}}
  return {ok:true,out,warnings:warns,m,info:m.info()}}
return {compile,Machine,runAll,lex,tstr,CErr,fmtG}})();
if(typeof module!=='undefined')module.exports=CPP;

/* ===== Curriculum ===== */
const R=String.raw;
const P=(body,o={})=>{const inc=['iostream',...(o.inc||[])].map(h=>`#include <${h}>`).join('\n');
  const ind=s=>s.replace(/^\n+|\s+$/g,'').split('\n').map(l=>l.trim()?'    '+l:'').join('\n');
  return `${inc}\nusing namespace std;\n${o.pre?'\n'+o.pre.replace(/^\n+|\s+$/g,'')+'\n':''}\nint main() {\n${ind(body)}\n    return 0;\n}\n`};
const P0=(body,o)=>P(body,o).replace('using namespace std;\n','');

function makeCtx(r){
  const src=r.src||'';const code=src.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,'');
  const info=r.info||{};const snap=info.mainSnap||{};const out=r.out||'';
  const funcs=[];if(r.prog)for(const [n,fl] of r.prog.funcs)for(const f of fl)if(n!=='main')funcs.push(f);
  const nums=s=>(s.match(/-?\d+/g)||[]).map(Number);
  const c={ok:!!r.ok,out,src,code,lines:out.split('\n').map(l=>l.replace(/\s+$/,'')).filter(l=>l.length),
    inputs:info.inputs||[],tokens:(info.inputs||[]).join(' ').split(/\s+/).filter(Boolean),
    has:re=>re.test(code),count:re=>(code.match(new RegExp(re.source,'g'))||[]).length,
    v:n=>snap[n]||null,vars:snap,types:new Set(Object.values(snap).map(x=>x.type)),
    calls:n=>(info.calls||{})[n]||0,funcs,recursed:info.recursed||[],stepDepth:r.stepDepth||0,
    warned:re=>(r.warnings||[]).some(w=>re.test(w.msg)),warnings:r.warnings||[],
    structs:r.prog?[...r.prog.structs.keys()]:[],nums,
    outHas:s=>out.toLowerCase().includes(String(s).toLowerCase())};
  c.fn=pred=>funcs.find(pred);
  c.userCalls=pred=>funcs.filter(pred).reduce((s,f)=>s+c.calls(f.name),0);
  return c}

const CH=[
{name:'Hello, World',badge:'First Words',intro:'Every C++ program has the same skeleton. Learn its parts, make it talk, and learn to read what the compiler complains about.',
 learned:['#include','main()','cout <<','endl','"\\n"','std::'],
 missions:[
 {title:'Run your first program',goal:'Press <b>Run</b> (or <kbd>Ctrl</kbd>+<kbd>Enter</kbd>) and read what appears in the console.',
  anat:[['#include <iostream>','pp'],['int main()','fn'],['cout','name'],['<<','op'],['"Hello, World!"','val'],[';','op']],
  explain:`This is a complete C++ program. When you press Run, two things happen. First the <b>compiler</b> (g++) translates your C++ into machine code. Then the machine code <b>runs</b>. Every program starts at <code>main</code> and runs the lines inside its <code>{ }</code> from top to bottom.`,
  note:'<code>#include &lt;iostream&gt;</code> brings in the input/output library. <code>cout</code> (say "see-out") is the console. <code>&lt;&lt;</code> sends something to it. Every statement ends with <code>;</code>.',
  start:P(R`cout << "Hello, World!" << endl;`),hint:'Press the Run button above the editor.',
  check:c=>c.ok&&/Hello/.test(c.out)},
 {title:'Make it yours',goal:'Change the text so the program prints <code>Hello, </code> followed by your name.',keep:true,
  explain:`Text inside double quotes is a <b>string</b>. The program prints it exactly as written, letter for letter, but without the quotes. Change only what is between the quotes, and keep both <code>"</code> marks.`,
  start:P(R`cout << "Hello, World!" << endl;`),ans:P(R`cout << "Hello, Ada!" << endl;`),hint:'Replace World with your name, inside the quotes.',
  check:c=>c.ok&&/hello/i.test(c.out)&&!/Hello, World!/.test(c.out)},
 {title:'Two lines',goal:'Add a second <code>cout</code> line that prints <code>I am learning C++</code>.',keep:true,
  anat:[['cout','name'],['<<','op'],['"I am learning C++"','val'],['<<','op'],['endl','name'],[';','op']],
  explain:`<code>endl</code> means <b>end line</b>: the next output starts on a fresh line. Try deleting the first <code>&lt;&lt; endl</code> and running again: both texts squash onto one line.`,
  start:P(R`cout << "Hello, Ada!" << endl;`),ans:P(R`cout << "Hello, Ada!" << endl;
cout << "I am learning C++" << endl;`),hint:'Copy the first cout line, paste it underneath, and change the text.',
  check:c=>c.ok&&c.lines.length>=2&&c.count(/\bcout\b/)>=2},
 {title:'The \\n shortcut',goal:'Print two lines with a <b>single</b> <code>cout</code>, using <code>\\n</code> inside the text.',
  anat:[['"Line one\\nLine two"','val']],
  explain:`<code>\\n</code> is an <b>escape sequence</b>: a backslash plus a letter that stands for a character you can't type into a string directly. <code>\\n</code> is a new line, <code>\\t</code> is a tab, <code>\\"</code> is a double quote and <code>\\\\</code> is a backslash.`,
  start:P(R`// One cout, two lines of output
cout << "Ready" << endl;`),ans:P(R`cout << "Ready\nPlayer One\n";`),hint:'Put \\n between the two pieces of text: "Ready\\nPlayer One\\n"',
  check:c=>c.ok&&c.lines.length>=2&&c.count(/\bcout\b/)===1&&/"[^"\n]*\\n[^"\n]*"/.test(c.code)},
 {title:'Bug hunt: the missing semicolon',goal:'Press Run, read the error, then fix the program.',
  explain:`<code>main.cpp:5:30: error</code> means file <b><code>main.cpp</code></b>, line <b>5</b>, column <b>30</b>. The compiler reports the spot where it got confused, and with a missing <code>;</code> that is usually the end of the line <i>before</i> the next statement. Fix the first error first: one mistake often causes several messages.`,
  start:P(R`cout << "Loading level 1..." << endl
cout << "Ready!" << endl;`),ans:P(R`cout << "Loading level 1..." << endl;
cout << "Ready!" << endl;`),hint:'Line 5 is missing its ; at the end.',
  check:c=>c.ok&&/Ready/.test(c.out)},
 {title:'Bug hunt: who is cout?',goal:'This program has no <code>using namespace std;</code> line. Fix it by writing <code>std::</code> in front of <code>cout</code> and <code>endl</code>.',
  anat:[['std','name'],['::','op'],['cout','name']],
  explain:`The standard library keeps its names in a <b>namespace</b> called <code>std</code>, like a family name. <code>std::cout</code> is the full name. The line <code>using namespace std;</code> lets you skip the family name. Most beginner code uses it; many professionals write <code>std::</code> every time so it's clear where a name comes from. Both are correct.`,
  start:P0(R`cout << "Who am I?" << endl;`),ans:P0(R`std::cout << "Who am I?" << std::endl;`),hint:'Change cout to std::cout and endl to std::endl. (Adding using namespace std; under the #include also works.)',
  check:c=>c.ok&&/Who am I/.test(c.out)},
 {title:'ASCII art',goal:'Finish the drawing so the console shows at least <b>4 lines</b>. Add ears, a body, a name tag, anything.',
  explain:`A backslash starts an escape sequence, so to print one <code>\\</code> you must write two: <code>\\\\</code>. That's why the cat's ears look doubled in the code but print correctly. Programmers drew whole games this way before graphics.`,
  start:P(R`cout << " /\\_/\\ " << endl;
cout << "( o.o )" << endl;
cout << " > ^ < " << endl;`),ans:P(R`cout << " /\\_/\\ " << endl;
cout << "( o.o )" << endl;
cout << " > ^ < " << endl;
cout << "  Pixel" << endl;`),hint:'Add one more cout line, for example cout << "  Pixel" << endl;',
  check:c=>c.ok&&c.lines.length>=4}
 ]},
{name:'Variables',badge:'Memory Keeper',intro:'Variables are named boxes in memory. Watch them appear in the Memory panel as your program runs.',
 learned:['int','double','bool','char','string','=','+ - * /','%','++ +=','const'],
 missions:[
 {title:'Your first variable',goal:'Create <code>int score = 0;</code> and print it with <code>cout</code>. Then look at the <b>Memory</b> panel.',
  anat:[['int','type'],['score','name'],['=','op'],['0','val'],[';','op']],
  explain:`A <b>variable</b> is a named box in memory. <code>int</code> is the <b>type</b>: what kind of thing the box holds (whole numbers). <code>score</code> is the <b>name</b>. <code>= 0</code> puts a starting value in. The Memory panel shows the box, its value, and its <b>address</b>: the box's position in your computer's memory.`,
  start:P(R`// Create score here, then print it
`),ans:P(R`int score = 0;
cout << "Score: " << score << endl;`),hint:'int score = 0;  then  cout << score << endl;',
  check:c=>c.ok&&c.v('score')&&/^(int|long)/.test(c.v('score').type)&&/\d/.test(c.out)},
 {title:'Change the value',goal:'Below the print, add <code>score = score + 10;</code> and print the score again. Press <b>Step</b> to watch the box change.',keep:true,
  explain:`In C++, <code>=</code> means <b>store</b>, not "is equal to". The right side is worked out first, using the old value (0 + 10), then the result goes into the box. Notice you don't write <code>int</code> again: <code>int</code> creates a box, and you only create it once.`,
  note:'<b>Step</b> runs one line at a time. The highlighted line is the one about to run.',
  start:P(R`int score = 0;
cout << "Score: " << score << endl;`),ans:P(R`int score = 0;
cout << "Score: " << score << endl;
score = score + 10;
cout << "Score: " << score << endl;`),hint:'score = score + 10;  then the same cout line again.',
  check:c=>c.ok&&c.v('score')&&c.v('score').v>0&&c.lines.length>=2},
 {title:'Meet the types',goal:'Create one variable of each type: a <code>double</code> speed, a <code>bool</code> alive, a <code>char</code> grade and a <code>string</code> name. Print them all.',
  anat:[['double','type'],['bool','type'],['char','type'],['string','type']],
  explain:`<code>double</code> holds numbers with a decimal point. <code>bool</code> holds <code>true</code> or <code>false</code>, and cout prints those as <b>1</b> and <b>0</b>. <code>char</code> holds one character in <b>single</b> quotes, like <code>'A'</code>. <code>string</code> holds text in <b>double</b> quotes. Look at the Memory panel: each box is a different size, and each type gets its own color.`,
  start:P(R`string name = "Pixel";
// add a double, a bool and a char
cout << name << endl;`),ans:P(R`string name = "Pixel";
double speed = 2.5;
bool alive = true;
char grade = 'A';
cout << name << " " << speed << " " << alive << " " << grade << endl;`),hint:"double speed = 2.5;  bool alive = true;  char grade = 'A';",
  check:c=>c.ok&&['double','bool','char','string'].every(t=>c.types.has(t))},
 {title:'Do the math',goal:'The hero has <code>hp = 100</code>. Subtract 35 damage, add 10 healing, and print the result.',
  anat:[['hp','name'],['=','op'],['hp','name'],['-','op'],['damage','name']],
  explain:`C++ math uses <code>+</code> <code>-</code> <code>*</code> (times) and <code>/</code> (divide). Normal math order applies: <code>*</code> and <code>/</code> happen before <code>+</code> and <code>-</code>, and parentheses go first. Use variables with good names: <code>hp - damage</code> says more than <code>100 - 35</code>.`,
  start:P(R`int hp = 100;
int damage = 35;
int healing = 10;
// update hp, then print it
`),ans:P(R`int hp = 100;
int damage = 35;
int healing = 10;
hp = hp - damage;
hp = hp + healing;
cout << "HP: " << hp << endl;`),hint:'hp = hp - damage;  hp = hp + healing;',
  check:c=>c.ok&&c.v('hp')&&c.v('hp').v===75&&/75/.test(c.out)},
 {title:'The integer division trap',goal:'Print <code>7 / 2</code> and then <code>7.0 / 2</code>. Compare the answers.',
  explain:`When both sides are <code>int</code>, C++ does <b>integer division</b>: the answer is a whole number and the decimal part is chopped off (not rounded). 7 / 2 gives 3, and even 99 / 100 gives 0. If either side is a <code>double</code>, you get the decimal answer, 3.5. This trips up every new C++ programmer at least once.`,
  start:P(R`cout << 7 / 2 << endl;
// now print 7.0 / 2
`),ans:P(R`cout << 7 / 2 << endl;
cout << 7.0 / 2 << endl;`),hint:'cout << 7.0 / 2 << endl;',
  check:c=>c.ok&&c.lines.includes('3')&&c.lines.includes('3.5')},
 {title:'Remainders with %',goal:'Print <code>17 % 5</code>, then print <code>10 % 2</code> to test whether 10 is even.',
  explain:`<code>%</code> (modulo) gives the <b>remainder</b> after dividing. 17 / 5 is 3 with 2 left over, so 17 % 5 is 2. A number is even when <code>n % 2</code> is 0. Games use % constantly, for example to take turns between players: <code>turn % 2</code> flips between 0 and 1.`,
  start:P(R`// remainders
`),ans:P(R`cout << 17 % 5 << endl;
cout << 10 % 2 << endl;`),hint:'cout << 17 % 5 << endl;',
  check:c=>c.ok&&c.has(/%/)&&c.lines.includes('2')&&c.lines.includes('0')},
 {title:'Shortcuts: ++ and +=',goal:'Level up: use <code>level++</code> once and <code>xp += 50</code> twice. Print both.',
  anat:[['level','name'],['++','op'],['xp','name'],['+=','op'],['50','val']],
  explain:`<code>level++</code> adds 1 (that's where the name C++ comes from: one step beyond C). <code>xp += 50</code> is short for <code>xp = xp + 50</code>. There are matching <code>--</code>, <code>-=</code>, <code>*=</code> and <code>/=</code>.`,
  start:P(R`int level = 1;
int xp = 0;
// level up here
cout << "Level " << level << ", XP " << xp << endl;`),ans:P(R`int level = 1;
int xp = 0;
level++;
xp += 50;
xp += 50;
cout << "Level " << level << ", XP " << xp << endl;`),hint:'level++;  xp += 50;  xp += 50;',
  check:c=>c.ok&&c.has(/\+\+/)&&c.has(/\+=/)&&c.v('level')&&c.v('level').v===2&&c.v('xp').v===100},
 {title:'The garbage value',goal:'Run this first and look at the strange number. Then fix it: give <code>lives</code> a starting value of <code>3</code>.',
  explain:`A variable created without a value is <b>uninitialized</b>. C++ doesn't clean the box first (that would cost time), so it holds whatever leftover bits were there: a <b>garbage value</b>. The Memory panel marks it <code>??</code>. The compiler warns about it, but still runs the program. Always give variables a starting value.`,
  start:P(R`int lives;
cout << "Lives: " << lives << endl;`),ans:P(R`int lives = 3;
cout << "Lives: " << lives << endl;`),hint:'int lives = 3;',
  check:c=>c.ok&&c.v('lives')&&c.v('lives').v===3&&!c.warned(/uninitialized/)},
 {title:'Constants',goal:'Create <code>const int MAX_HP = 100;</code>. Try adding <code>MAX_HP = 200;</code> to see the error, then delete that line and print MAX_HP.',
  anat:[['const','kw'],['int','type'],['MAX_HP','name'],['=','op'],['100','val']],
  explain:`<code>const</code> makes a variable whose value can never change. The compiler stops you if you try, which protects you from your own mistakes. Programmers usually name constants in <code>ALL_CAPS</code> so they stand out.`,
  start:P(R`// a constant that never changes
`),ans:P(R`const int MAX_HP = 100;
cout << "Max HP: " << MAX_HP << endl;`),hint:'const int MAX_HP = 100;  cout << MAX_HP << endl;',
  check:c=>c.ok&&c.has(/const\s+int\s+MAX_HP/)&&/100/.test(c.out)}
 ]},
{name:'Input & text',badge:'Listener',intro:'Programs get interesting when they react to the player. Read from the keyboard with cin and work with text.',
 learned:['cin >>','getline','+ (join)','.length()','.substr()'],
 missions:[
 {title:'Ask a question',goal:'Read the player\'s name with <code>cin &gt;&gt; name;</code> and greet them. Type your answer in the console and press Enter.',
  anat:[['cin','name'],['>>','op'],['name','name'],[';','op']],
  explain:`<code>cin</code> (say "see-in") is the keyboard. The program <b>pauses</b> at <code>cin &gt;&gt;</code> until you type something and press Enter. Read the arrows as the direction data flows: <code>cout &lt;&lt; x</code> sends x out to the screen, <code>cin &gt;&gt; x</code> moves keyboard input into x.`,
  start:P(R`string name;
cout << "What is your name? ";
// read the name, then say hello
`),ans:P(R`string name;
cout << "What is your name? ";
cin >> name;
cout << "Welcome, " << name << "!" << endl;`),hint:'cin >> name;  then  cout << "Welcome, " << name << endl;',test:['Ada'],
  check:c=>c.ok&&c.inputs.length>=1&&c.has(/cin\s*>>/)&&c.tokens[0]&&c.out.includes(c.tokens[0])},
 {title:'Numbers from the keyboard',goal:'Ask for the player\'s age as an <code>int</code> and print how old they will be next year.',
  explain:`cin converts what you type into the variable's type. For an <code>int</code> it reads digits. Try typing a word instead: cin <b>fails</b>, sets the variable to 0, and ignores later cin lines. Real programs check for that; for now, notice what happens.`,
  start:P(R`int age;
cout << "How old are you? ";
`),ans:P(R`int age;
cout << "How old are you? ";
cin >> age;
cout << "Next year you will be " << age + 1 << endl;`),hint:'cin >> age;  then print age + 1',test:['12'],
  check:c=>{const n=parseInt(c.tokens[0],10);return c.ok&&c.has(/cin\s*>>/)&&!isNaN(n)&&c.out.includes(String(n+1))}},
 {title:'Calculator',goal:'Read two whole numbers with one line, <code>cin &gt;&gt; a &gt;&gt; b;</code>, and print their sum, difference and product.',
  explain:`You can chain <code>&gt;&gt;</code> just like <code>&lt;&lt;</code>. cin skips spaces and Enters between values, so you can type <code>8 5</code> on one line or press Enter after each number.`,
  start:P(R`int a, b;
cout << "Two numbers: ";
`),ans:P(R`int a, b;
cout << "Two numbers: ";
cin >> a >> b;
cout << a << " + " << b << " = " << a + b << endl;
cout << a << " - " << b << " = " << a - b << endl;
cout << a << " * " << b << " = " << a * b << endl;`),hint:'cin >> a >> b;  then three cout lines',test:['8 5'],
  check:c=>{const n=c.tokens.map(Number);return c.ok&&n.length>=2&&!isNaN(n[0]+n[1])&&c.out.includes(String(n[0]+n[1]))&&c.out.includes(String(n[0]*n[1]))}},
 {title:'Whole lines with getline',goal:'Read a full name with a space in it, like <code>Ada Lovelace</code>, using <code>getline(cin, fullName);</code> and print it back.',
  anat:[['getline','fn'],['(','op'],['cin','name'],['fullName','name'],[')','op']],
  explain:`<code>cin &gt;&gt;</code> stops at the first space, so it reads one word. <code>getline</code> reads everything up to Enter. Try it with <code>cin &gt;&gt;</code> first and see what happens to the last name.`,
  start:P(R`string fullName;
cout << "Full name: ";
cin >> fullName;
cout << "Hello, " << fullName << endl;`),ans:P(R`string fullName;
cout << "Full name: ";
getline(cin, fullName);
cout << "Hello, " << fullName << endl;`),hint:'Replace cin >> fullName; with getline(cin, fullName);',test:['Ada Lovelace'],
  check:c=>c.ok&&c.has(/getline\s*\(/)&&c.inputs.some(x=>/\S\s+\S/.test(x)&&c.out.includes(x.trim()))},
 {title:'Gluing text together',goal:'Build <code>greeting</code> from <code>"Hello, " + name + "!"</code>, print it, then print how many letters are in <code>name</code> with <code>name.length()</code>.',
  anat:[['greeting','name'],['=','op'],['"Hello, "','val'],['+','op'],['name','name'],['+','op'],['"!"','val']],
  explain:`For strings, <code>+</code> joins text end to end. <code>.length()</code> asks the string how many characters it holds. The dot means "a function that belongs to this string". Other useful ones: <code>name.substr(0, 3)</code> gives the first 3 letters, and <code>name[0]</code> gives the first character.`,
  start:P(R`string name = "Pixel";
`),ans:P(R`string name = "Pixel";
string greeting = "Hello, " + name + "!";
cout << greeting << endl;
cout << name << " has " << name.length() << " letters" << endl;`),hint:'string greeting = "Hello, " + name + "!";',
  check:c=>c.ok&&c.v('greeting')&&c.v('greeting').type==='string'&&String(c.v('greeting').v).includes(String((c.v('name')||{}).v||'~'))&&c.has(/\.(length|size)\s*\(\)/)},
 {title:'Mini game: Mad Libs',goal:'Ask for an <b>adjective</b>, an <b>animal</b> and a <b>verb</b>, then print a silly sentence that uses all three.',
  explain:`This is your first interactive program: questions, answers, and output built from the answers. Use one <code>cout</code> for each question, then <code>cin</code> right after it, so the player knows what to type.`,
  start:P(R`string adjective, animal, verb;
cout << "An adjective: ";
cin >> adjective;
// ask for an animal and a verb, then tell the story
`),ans:P(R`string adjective, animal, verb;
cout << "An adjective: ";
cin >> adjective;
cout << "An animal: ";
cin >> animal;
cout << "A verb: ";
cin >> verb;
cout << "The " << adjective << " " << animal << " started to " << verb << " in the castle!" << endl;`),hint:'Repeat the cout + cin pair twice, then one cout that mixes text and the three variables.',test:['sparkly','penguin','dance'],
  check:c=>c.ok&&c.tokens.length>=3&&c.tokens.slice(0,3).every(w=>c.lines.some(l=>l.includes(w)&&l.split(/\s+/).length>3))}
 ]},
{name:'Decisions',badge:'Decider',intro:'Let your program choose. if, else and switch make it react, and <code>rand()</code> adds luck.',
 learned:['if','else','else if','== != < >','&& || !','rand()','switch'],
 missions:[
 {title:'if',goal:'Print <code>Game over</code> only when <code>hp</code> is 0 or less. Then change hp to 50 and run again.',
  anat:[['if','kw'],['(','op'],['hp <= 0','name'],[')','op'],['{ ... }','op']],
  explain:`<code>if (condition) { ... }</code> runs the code in the braces only when the condition is true. Conditions compare things: <code>&lt;</code> less than, <code>&gt;</code> greater than, <code>&lt;=</code> at most, <code>&gt;=</code> at least, <code>==</code> equal, <code>!=</code> not equal.`,
  start:P(R`int hp = 0;
// if hp is 0 or less, print Game over
`),ans:P(R`int hp = 0;
if (hp <= 0) {
    cout << "Game over" << endl;
}`),hint:'if (hp <= 0) { cout << "Game over" << endl; }',
  check:c=>c.ok&&c.has(/\bif\s*\(/)&&(/game over/i.test(c.out)||(c.v('hp')&&c.v('hp').v>0))},
 {title:'if / else',goal:'Ask for the secret door code. If it is <code>42</code>, print <code>The door opens</code>; otherwise print <code>Wrong code</code>.',
  explain:`<code>else</code> is the "otherwise" path: exactly one of the two blocks runs, never both. Remember <code>==</code> (two equals signs) compares, while <code>=</code> stores.`,
  start:P(R`int code;
cout << "Enter the door code: ";
cin >> code;
`),ans:P(R`int code;
cout << "Enter the door code: ";
cin >> code;
if (code == 42) {
    cout << "The door opens" << endl;
} else {
    cout << "Wrong code" << endl;
}`),hint:'if (code == 42) { ... } else { ... }',test:['42'],
  check:c=>c.ok&&c.has(/\belse\b/)&&c.has(/==/)&&c.inputs.length>=1&&c.lines.length>=1},
 {title:'Grade machine',goal:'Read a score. Print <code>A</code> for 90+, <code>B</code> for 80+, <code>C</code> for 70+, otherwise <code>F</code>. Use <code>else if</code>.',
  explain:`An <code>else if</code> chain checks each condition from top to bottom and runs the <b>first</b> one that's true, then skips the rest. That's why the order matters: checking <code>score &gt;= 70</code> first would give everyone at 70 or above a C.`,
  start:P(R`int score;
cout << "Score: ";
cin >> score;
if (score >= 90) {
    cout << "A" << endl;
}`),ans:P(R`int score;
cout << "Score: ";
cin >> score;
if (score >= 90) {
    cout << "A" << endl;
} else if (score >= 80) {
    cout << "B" << endl;
} else if (score >= 70) {
    cout << "C" << endl;
} else {
    cout << "F" << endl;
}`),hint:'} else if (score >= 80) { ... } else if (score >= 70) { ... } else { ... }',test:['85'],
  check:c=>c.ok&&c.count(/else\s+if/)>=2&&c.has(/\belse\s*\{/)&&c.inputs.length>=1},
 {title:'Bug hunt: = vs ==',goal:'This prints the wrong thing. Run it, read the warning, and fix the condition.',
  explain:`<code>lives = 0</code> <b>stores</b> 0 in lives, and then the if checks that 0, which counts as false. So the program both breaks your variable and takes the wrong path. The compiler warns but still runs it. This is one of the most famous bugs in C and C++.`,
  start:P(R`int lives = 3;
if (lives = 0) {
    cout << "Game over" << endl;
} else {
    cout << "Still alive with " << lives << " lives" << endl;
}`),ans:P(R`int lives = 3;
if (lives == 0) {
    cout << "Game over" << endl;
} else {
    cout << "Still alive with " << lives << " lives" << endl;
}`),hint:'Change lives = 0 to lives == 0',
  check:c=>c.ok&&!c.warned(/assignment used as truth/)&&/with 3 lives/.test(c.out)},
 {title:'And, or, not',goal:'The vault opens if the player <b>has the key AND is level 3 or higher</b>, OR if they are an admin. Write that condition.',
  anat:[['hasKey','name'],['&&','op'],['level >= 3','name'],['||','op'],['isAdmin','name']],
  explain:`<code>&amp;&amp;</code> (and) is true only if both sides are true. <code>||</code> (or) is true if at least one side is. <code>!</code> (not) flips true and false. Add parentheses to make your meaning clear: <code>(hasKey &amp;&amp; level &gt;= 3) || isAdmin</code>.`,
  start:P(R`bool hasKey = true;
int level = 2;
bool isAdmin = false;
// open the vault?
`),ans:P(R`bool hasKey = true;
int level = 2;
bool isAdmin = false;
if ((hasKey && level >= 3) || isAdmin) {
    cout << "The vault opens!" << endl;
} else {
    cout << "Access denied" << endl;
}`),hint:'if ((hasKey && level >= 3) || isAdmin) { ... } else { ... }',
  check:c=>c.ok&&c.has(/&&/)&&c.has(/\|\|/)&&c.lines.length>=1},
 {title:'Roll the dice',goal:'Print a dice roll from 1 to 6 using <code>rand() % 6 + 1</code>. Run it several times. Then delete the <code>srand</code> line and run it a few more times.',
  anat:[['rand()','fn'],['%','op'],['6','val'],['+','op'],['1','val']],
  explain:`<code>rand()</code> gives a big random-looking number. <code>% 6</code> turns it into 0 to 5, and <code>+ 1</code> shifts that to 1 to 6. The numbers come from a formula that starts from a <b>seed</b>. Without <code>srand</code>, the seed is always the same, so every run rolls the same numbers. <code>srand(time(0))</code> uses the current time as the seed.`,
  start:P(R`srand(time(0));
// roll a six-sided die
`,{inc:['cstdlib','ctime']}),ans:P(R`srand(time(0));
int roll = rand() % 6 + 1;
cout << "You rolled a " << roll << endl;`,{inc:['cstdlib','ctime']}),hint:'int roll = rand() % 6 + 1;',
  check:c=>c.ok&&c.has(/rand\s*\(\s*\)\s*%\s*6/)&&/[1-6]/.test(c.out)},
 {title:'switch: the game menu',goal:'Read a menu choice. Use <code>switch</code> to print <code>Play</code> for 1, <code>Options</code> for 2, <code>Quit</code> for 3 and <code>Unknown choice</code> otherwise.',
  explain:`<code>switch</code> jumps to the <code>case</code> that matches the value. Each case needs a <code>break;</code>, or the program "falls through" into the next case and runs that too. Try deleting one break to see it. <code>default</code> catches everything else. switch works with whole numbers and chars, not strings.`,
  start:P(R`int choice;
cout << "1) Play  2) Options  3) Quit: ";
cin >> choice;
switch (choice) {
    case 1:
        cout << "Play" << endl;
        break;
}`),ans:P(R`int choice;
cout << "1) Play  2) Options  3) Quit: ";
cin >> choice;
switch (choice) {
    case 1:
        cout << "Play" << endl;
        break;
    case 2:
        cout << "Options" << endl;
        break;
    case 3:
        cout << "Quit" << endl;
        break;
    default:
        cout << "Unknown choice" << endl;
}`),hint:'Add case 2:, case 3: and default: blocks, each ending in break;',test:['2'],
  check:c=>c.ok&&c.count(/\bcase\b/)>=3&&c.has(/\bdefault\s*:/)&&c.count(/\bbreak\b/)>=3},
 {title:'Mini game: Rock, Paper, Scissors',goal:'The player types 0 (rock), 1 (paper) or 2 (scissors). The computer picks randomly. Print both choices and who <b>wins</b>, <b>loses</b> or <b>ties</b>.',
  explain:`Plan before you code. A tie is when both are equal. The player wins when they beat the computer: paper (1) beats rock (0), scissors (2) beat paper (1), rock (0) beats scissors (2). Notice the pattern: the player wins when <code>(player + 3 - computer) % 3 == 1</code>. Any other case is a loss.`,
  start:P(R`srand(time(0));
int player;
cout << "0 = rock, 1 = paper, 2 = scissors: ";
cin >> player;
int computer = rand() % 3;
cout << "Computer chose " << computer << endl;
// decide who wins
`,{inc:['cstdlib','ctime']}),ans:P(R`srand(time(0));
int player;
cout << "0 = rock, 1 = paper, 2 = scissors: ";
cin >> player;
int computer = rand() % 3;
cout << "Computer chose " << computer << endl;
if (player == computer) {
    cout << "It's a tie!" << endl;
} else if ((player + 3 - computer) % 3 == 1) {
    cout << "You win!" << endl;
} else {
    cout << "You lose!" << endl;
}`,{inc:['cstdlib','ctime']}),hint:'if (player == computer) tie; else if ((player + 3 - computer) % 3 == 1) win; else lose.',test:['1'],
  check:c=>c.ok&&c.has(/rand\s*\(/)&&c.has(/\bif\b/)&&c.inputs.length>=1&&/\b(win|lose|tie|won|lost)\b/i.test(c.out)}
 ]},
{name:'Loops',badge:'Loop Master',intro:'Make the computer repeat work. Draw shapes, add up numbers, and build a full guessing game.',
 learned:['while','for','nested loops','break','continue','do … while'],
 missions:[
 {title:'while: countdown',goal:'Count down from 10 to 1 with a <code>while</code> loop, then print <code>Liftoff!</code>.',
  anat:[['while','kw'],['(','op'],['count > 0','name'],[')','op'],['{ ... count--; }','op']],
  explain:`A <code>while</code> loop repeats its block <b>as long as</b> the condition is true. It checks the condition before every round. Something inside must change the condition, or the loop never stops. Press <b>Watch</b> to see the program run in slow motion.`,
  start:P(R`int count = 10;
// loop while count is above 0
cout << "Liftoff!" << endl;`),ans:P(R`int count = 10;
while (count > 0) {
    cout << count << endl;
    count--;
}
cout << "Liftoff!" << endl;`),hint:'while (count > 0) { cout << count << endl; count--; }',
  check:c=>c.ok&&c.has(/\bwhile\s*\(/)&&c.nums(c.out).slice(0,10).join()==='10,9,8,7,6,5,4,3,2,1'&&/liftoff/i.test(c.out)},
 {title:'for: counting made compact',goal:'Print the numbers 1 to 10 with a <code>for</code> loop.',
  anat:[['for','kw'],['int i = 1','name'],[';','op'],['i <= 10','name'],[';','op'],['i++','name']],
  explain:`A <code>for</code> loop puts the three parts of counting on one line: <b>start</b> (<code>int i = 1</code>), <b>keep going while</b> (<code>i &lt;= 10</code>), and <b>step</b> (<code>i++</code>). It does exactly what a while loop does, but you can't forget the step. Watch <code>i</code> appear in Memory when the loop starts and vanish when it ends.`,
  start:P(R`// print 1 to 10
`),ans:P(R`for (int i = 1; i <= 10; i++) {
    cout << i << " ";
}
cout << endl;`),hint:'for (int i = 1; i <= 10; i++) { cout << i << " "; }',
  check:c=>c.ok&&c.has(/\bfor\s*\(/)&&c.nums(c.out).join().includes('1,2,3,4,5,6,7,8,9,10')},
 {title:'Draw a row',goal:'Print a row of exactly <b>20</b> stars (<code>*</code>) using a loop, all on one line.',
  explain:`Print one <code>*</code> per round without <code>endl</code> so the stars stay on the same line, then one <code>endl</code> after the loop ends. Notice what's inside the braces repeats; what's after them runs once.`,
  start:P(R`// 20 stars in a row
`),ans:P(R`for (int i = 0; i < 20; i++) {
    cout << "*";
}
cout << endl;`),hint:'for (int i = 0; i < 20; i++) cout << "*";',
  check:c=>c.ok&&c.has(/\b(for|while)\b/)&&c.lines.some(l=>l.trim()==='*'.repeat(20))},
 {title:'Nested loops: a square',goal:'Draw a 5 by 5 square of <code>#</code>. Use a loop inside a loop.',
  explain:`The <b>outer</b> loop runs once per row. The <b>inner</b> loop draws the 5 characters of that row. After the inner loop finishes, print <code>endl</code> to start the next row. The inner loop runs completely for every single round of the outer loop: 5 × 5 = 25 characters in total.`,
  start:P(R`for (int row = 0; row < 5; row++) {
    // draw one row here
}`),ans:P(R`for (int row = 0; row < 5; row++) {
    for (int col = 0; col < 5; col++) {
        cout << "#";
    }
    cout << endl;
}`),hint:'Inside: for (int col = 0; col < 5; col++) cout << "#";  then cout << endl;',
  check:c=>c.ok&&c.count(/\bfor\b/)>=2&&c.lines.filter(l=>l.trim()==='#####').length>=5},
 {title:'Nested loops: a staircase',goal:'Draw a triangle: 1 star on row 1, 2 stars on row 2, up to 5 stars.',
  explain:`The trick is to make the inner loop depend on the outer one. Row 1 needs 1 star, row 2 needs 2, so the inner loop should run <code>row</code> times: <code>col &lt;= row</code>. Once it works, try making it upside down or 10 rows tall.`,
  start:P(R`for (int row = 1; row <= 5; row++) {
    for (int col = 1; col <= 5; col++) {
        cout << "*";
    }
    cout << endl;
}`),ans:P(R`for (int row = 1; row <= 5; row++) {
    for (int col = 1; col <= row; col++) {
        cout << "*";
    }
    cout << endl;
}`),hint:'Change the inner condition from col <= 5 to col <= row.',
  check:c=>c.ok&&[1,2,3,4,5].every(n=>c.lines.some(l=>l.trim()==='*'.repeat(n)))},
 {title:'Add it all up',goal:'Use a loop to add up every number from 1 to 100 and print the total.',
  explain:`This pattern is called an <b>accumulator</b>: start a variable at 0 before the loop, and add to it inside. Step through the first few rounds and watch <code>total</code> grow. (The answer is 5050. A young Carl Friedrich Gauss supposedly worked it out in his head.)`,
  start:P(R`int total = 0;
// add 1 + 2 + ... + 100 to total
cout << "Total: " << total << endl;`),ans:P(R`int total = 0;
for (int i = 1; i <= 100; i++) {
    total += i;
}
cout << "Total: " << total << endl;`),hint:'for (int i = 1; i <= 100; i++) total += i;',
  check:c=>c.ok&&c.has(/\b(for|while)\b/)&&/5050/.test(c.out)},
 {title:'break and continue',goal:'Loop from 1 to 20. <b>Skip</b> numbers divisible by 3 with <code>continue</code>, and <b>stop</b> when you reach a number above 15 with <code>break</code>.',
  explain:`<code>continue</code> skips the rest of this round and jumps to the next one. <code>break</code> leaves the loop completely. Both are handy, but a loop full of them gets hard to follow, so use them for clear special cases.`,
  start:P(R`for (int i = 1; i <= 20; i++) {
    cout << i << " ";
}
cout << endl;`),ans:P(R`for (int i = 1; i <= 20; i++) {
    if (i > 15) {
        break;
    }
    if (i % 3 == 0) {
        continue;
    }
    cout << i << " ";
}
cout << endl;`),hint:'Inside the loop, before the cout: if (i > 15) break;  if (i % 3 == 0) continue;',
  check:c=>c.ok&&c.has(/\bbreak\b/)&&c.has(/\bcontinue\b/)&&c.nums(c.out).join()==='1,2,4,5,7,8,10,11,13,14'},
 {title:'Bug hunt: the endless loop',goal:'Run this. It never finishes, so the playground stops it. Find out why and fix it.',
  explain:`The loop checks <code>i &lt; 5</code>, but nothing ever changes <code>i</code>, so the condition stays true forever. That's an <b>infinite loop</b>. On a real computer the program would hang; you'd stop it with <kbd>Ctrl</kbd>+<kbd>C</kbd>. Step through it and watch <code>i</code> stay at 0.`,
  start:P(R`int i = 0;
while (i < 5) {
    cout << i << " ";
}
cout << endl;`),ans:P(R`int i = 0;
while (i < 5) {
    cout << i << " ";
    i++;
}
cout << endl;`),hint:'Add i++; inside the loop.',
  check:c=>c.ok&&c.has(/\bwhile\b/)&&c.nums(c.out).join()==='0,1,2,3,4'},
 {title:'Game: Guess the Number',goal:'Build the full game: pick a secret number from 1 to 100. Keep asking for guesses, say <b>Too high</b> or <b>Too low</b>, and when the player gets it, say how many tries it took. Then win it.',
  explain:`This combines everything so far: variables, input, random numbers, decisions and a loop. The loop must keep going while <code>guess != secret</code>. Count the tries with <code>tries++</code> inside the loop. Best strategy as a player: always guess the middle of what's left. You'll never need more than 7 tries.`,
  start:P(R`srand(time(0));
int secret = rand() % 100 + 1;
int guess = 0;
int tries = 0;
cout << "I'm thinking of a number from 1 to 100." << endl;
// loop until guess == secret
`,{inc:['cstdlib','ctime']}),ans:P(R`srand(time(0));
int secret = rand() % 100 + 1;
int guess = 0;
int tries = 0;
cout << "I'm thinking of a number from 1 to 100." << endl;
while (guess != secret) {
    cout << "Your guess: ";
    cin >> guess;
    tries++;
    if (guess > secret) {
        cout << "Too high!" << endl;
    } else if (guess < secret) {
        cout << "Too low!" << endl;
    }
}
cout << "You got it in " << tries << " tries!" << endl;`,{inc:['cstdlib','ctime']}),hint:'while (guess != secret) { cin >> guess; tries++; if (guess > secret) ... else if (guess < secret) ... }',test:Array.from({length:100},(_,i)=>String(i+1)),
  check:c=>c.ok&&c.has(/rand\s*\(/)&&c.has(/\b(while|for|do)\b/)&&c.inputs.length>=1&&c.has(/cin\s*>>/)}
 ]},
{name:'Functions',badge:'Toolsmith',intro:'Package code into named tools you can reuse. Watch each call get its own frame on the stack.',
 learned:['void f()','parameters','return','call stack','& references','scope','recursion'],
 missions:[
 {title:'Your first function',goal:'Write a function <code>void sayHello()</code> that prints a greeting, and call it <b>twice</b> from main.',
  anat:[['void','type'],['sayHello','name'],['()','op'],['{ ... }','op']],
  explain:`A <b>function</b> is a named block of code. Writing it doesn't run it; <b>calling</b> it does: <code>sayHello();</code>. <code>void</code> means it doesn't give back a value. Functions must be written <b>above</b> the code that calls them, because the compiler reads top to bottom.`,
  start:P(R`// call sayHello() twice
`,{pre:R`// write sayHello here
`}),ans:P(R`sayHello();
sayHello();`,{pre:R`void sayHello() {
    cout << "Hello from a function!" << endl;
}`}),hint:'void sayHello() { cout << "Hi!" << endl; }  above main, then sayHello(); twice inside main.',
  check:c=>c.ok&&c.userCalls(f=>f.params.length===0&&f.ret.base==='void')>=2},
 {title:'Parameters',goal:'Write <code>void greet(string name)</code> that prints <code>Hello, </code> plus the name. Call it with two different names.',
  anat:[['void','type'],['greet','name'],['(','op'],['string','type'],['name','name'],[')','op']],
  explain:`A <b>parameter</b> is a variable that gets its value from the call. <code>greet("Ada")</code> runs the function with <code>name</code> set to "Ada". Step into the call and look at Memory: <code>greet</code> gets its own box called <code>name</code>, separate from main.`,
  start:P(R`greet("Ada");
`,{pre:R`// write greet here
`}),ans:P(R`greet("Ada");
greet("Linus");`,{pre:R`void greet(string name) {
    cout << "Hello, " << name << "!" << endl;
}`}),hint:'void greet(string name) { cout << "Hello, " << name << endl; }',
  check:c=>c.ok&&c.userCalls(f=>f.params.length>=1)>=2},
 {title:'Return values',goal:'Write <code>int square(int n)</code> that <b>returns</b> n times n. Print <code>square(7)</code> and <code>square(12)</code>.',
  anat:[['int','type'],['square','name'],['(int n)','op'],['return','kw'],['n * n','name']],
  explain:`<code>return</code> sends a value back to whoever called the function, and the call is replaced by that value. So <code>cout &lt;&lt; square(7)</code> becomes <code>cout &lt;&lt; 49</code>. The type before the name (<code>int</code>) says what kind of value comes back.`,
  start:P(R`cout << square(7) << endl;
`,{pre:R`// write square here
`}),ans:P(R`cout << square(7) << endl;
cout << square(12) << endl;`,{pre:R`int square(int n) {
    return n * n;
}`}),hint:'int square(int n) { return n * n; }',
  check:c=>c.ok&&c.lines.includes('49')&&c.lines.includes('144')&&!!c.fn(f=>f.ret.base!=='void'&&f.params.length===1)},
 {title:'Watch the call stack',goal:'Press <b>Step</b> repeatedly (or <b>Watch</b>) until you see a second frame, <code>area</code>, appear in the Memory panel. Keep stepping until it disappears.',
  explain:`Every call creates a new <b>stack frame</b>: a fresh set of boxes for that function's parameters and variables. When the function returns, its frame is thrown away, and only the returned value survives. This is why a function's variables don't exist outside it.`,
  start:P(R`double w = 4.5;
double h = 2;
double a = area(w, h);
cout << "Area: " << a << endl;`,{pre:R`double area(double width, double height) {
    double result = width * height;
    return result;
}`}),hint:'Use the Step button above the editor, not Run.',
  check:c=>c.ok&&c.stepDepth>=2},
 {title:'Copy or the real thing?',goal:'Run this: <code>heal</code> doesn\'t change main\'s hp. Fix it by adding <code>&amp;</code> to make the parameter a <b>reference</b>: <code>int&amp; hp</code>.',
  anat:[['void','type'],['heal','name'],['(','op'],['int&','type'],['hp','name'],[')','op']],
  explain:`Normally a parameter gets a <b>copy</b> of the value (pass by value), so changing it changes only the copy. With <code>&amp;</code>, the parameter becomes another name for the caller's variable (pass by reference). Step through both versions: with &amp;, Memory shows an arrow from <code>heal</code>'s hp to main's.`,
  start:P(R`int hp = 50;
heal(hp);
cout << "HP: " << hp << endl;`,{pre:R`void heal(int hp) {
    hp += 20;
}`}),ans:P(R`int hp = 50;
heal(hp);
cout << "HP: " << hp << endl;`,{pre:R`void heal(int& hp) {
    hp += 20;
}`}),hint:'void heal(int& hp)',
  check:c=>c.ok&&c.v('hp')&&c.v('hp').v===70&&!!c.fn(f=>f.params.some(p=>p.type.ref))},
 {title:'Bug hunt: out of scope',goal:'This won\'t compile: <code>showGold</code> can\'t see <code>gold</code>. Fix it by giving <code>showGold</code> a parameter.',
  explain:`A variable only exists inside the <code>{ }</code> where it was created. That region is its <b>scope</b>. <code>gold</code> lives in main, so other functions can't see it. To share it, pass it in as a parameter. (Global variables declared outside every function would also work, but they make big programs hard to follow.)`,
  start:P(R`int gold = 25;
showGold();`,{pre:R`void showGold() {
    cout << "Gold: " << gold << endl;
}`}),ans:P(R`int gold = 25;
showGold(gold);`,{pre:R`void showGold(int gold) {
    cout << "Gold: " << gold << endl;
}`}),hint:'void showGold(int gold)  and call it with showGold(gold);',
  check:c=>c.ok&&/Gold: 25/.test(c.out)},
 {title:'Bug hunt: order matters',goal:'main calls <code>attack</code> before the compiler has seen it. Fix it with a <b>prototype</b> line above main, or by moving the function up.',
  explain:`The compiler reads the file once, top to bottom. A <b>prototype</b> is a promise: "a function with this name and these types exists, its body comes later". It's the first line of the function with a <code>;</code> instead of a body: <code>int attack(int power);</code>`,
  start:R`#include <iostream>
using namespace std;

int main() {
    cout << "You deal " << attack(7) << " damage" << endl;
    return 0;
}

int attack(int power) {
    return power * 2 + 1;
}
`,ans:R`#include <iostream>
using namespace std;

int attack(int power);

int main() {
    cout << "You deal " << attack(7) << " damage" << endl;
    return 0;
}

int attack(int power) {
    return power * 2 + 1;
}
`,hint:'Above main, add: int attack(int power);',
  check:c=>c.ok&&/15/.test(c.out)},
 {title:'Recursion',goal:'Write <code>void countdown(int n)</code> that prints n and then calls <b>itself</b> with n - 1. When n reaches 0, print <code>Boom!</code> and stop.',
  explain:`A function that calls itself is <b>recursive</b>. It needs a <b>base case</b>: a condition where it stops calling itself, or it runs until the stack overflows. Step through it and watch the frames pile up in Memory, then unwind one by one.`,
  start:P(R`countdown(5);`,{pre:R`void countdown(int n) {
    // base case: n == 0
    // otherwise print n and call countdown(n - 1)
}`}),ans:P(R`countdown(5);`,{pre:R`void countdown(int n) {
    if (n == 0) {
        cout << "Boom!" << endl;
        return;
    }
    cout << n << endl;
    countdown(n - 1);
}`}),hint:'if (n == 0) { cout << "Boom!"; return; }  cout << n << endl;  countdown(n - 1);',
  check:c=>c.ok&&c.recursed.length>0&&/boom/i.test(c.out)},
 {title:'Game tool: rollDice',goal:'Write <code>int rollDice(int sides)</code> that returns a random number from 1 to sides. Roll two six-sided dice for an attack and print the total.',
  explain:`Good functions do one job and have a clear name. Now rolling dice is one readable line anywhere in your game: <code>rollDice(20)</code> for a d20, <code>rollDice(6) + rollDice(6)</code> for 2d6. You'll reuse this in the final battle.`,
  start:P(R`srand(time(0));
// roll two dice and add them
`,{inc:['cstdlib','ctime'],pre:R`// write rollDice here
`}),ans:P(R`srand(time(0));
int a = rollDice(6);
int b = rollDice(6);
cout << "Rolled " << a << " and " << b << ": " << a + b << " damage!" << endl;`,{inc:['cstdlib','ctime'],pre:R`int rollDice(int sides) {
    return rand() % sides + 1;
}`}),hint:'int rollDice(int sides) { return rand() % sides + 1; }',
  check:c=>c.ok&&c.has(/rand\s*\(/)&&c.userCalls(f=>f.ret.base==='int'&&f.params.length===1)>=2}
 ]},
{name:'Arrays & vectors',badge:'Collector',intro:'Store many values under one name. Arrays have a fixed size; vectors grow as you add things.',
 learned:['int a[5]','a[i]','vector<T>','push_back','.size()','range-for','erase','2D arrays'],
 missions:[
 {title:'Your first array',goal:'Create <code>int scores[5] = {90, 72, 85, 60, 99};</code>, then print the <b>first</b> and the <b>last</b> score.',
  anat:[['int','type'],['scores','name'],['[5]','op'],['=','op'],['{90, 72, 85, 60, 99}','val']],
  explain:`An <b>array</b> is a row of boxes side by side in memory, all the same type. You pick one with its <b>index</b> in square brackets. Indexes start at <b>0</b>, so the first is <code>scores[0]</code> and the last of five is <code>scores[4]</code>. Look at Memory: the addresses go up by 4, the size of one int.`,
  start:P(R`// create the scores array, then print the first and last
`),ans:P(R`int scores[5] = {90, 72, 85, 60, 99};
cout << "First: " << scores[0] << endl;
cout << "Last: " << scores[4] << endl;`),hint:'cout << scores[0];  and  cout << scores[4];',
  check:c=>c.ok&&c.v('scores')&&/\[5\]/.test(c.v('scores').type)&&/90/.test(c.out)&&/99/.test(c.out)},
 {title:'Loop through it',goal:'Print every score with a <code>for</code> loop, using <code>scores[i]</code>.',keep:true,
  explain:`Loops and arrays are made for each other. The loop counter <code>i</code> runs 0, 1, 2, 3, 4, and <code>scores[i]</code> picks each box in turn. Step through it and watch which box is being read.`,
  start:P(R`int scores[5] = {90, 72, 85, 60, 99};
`),ans:P(R`int scores[5] = {90, 72, 85, 60, 99};
for (int i = 0; i < 5; i++) {
    cout << scores[i] << endl;
}`),hint:'for (int i = 0; i < 5; i++) cout << scores[i] << endl;',
  check:c=>c.ok&&c.has(/\[\s*i\s*\]/)&&['90','72','85','60','99'].every(x=>c.lines.includes(x))},
 {title:'Bug hunt: off by one',goal:'This loop reads one box too many. Run it, read the error, fix it.',
  explain:`An array of 5 has indexes 0 to 4. The condition <code>i &lt;= 5</code> also tries index 5, which isn't there. Real C++ <b>doesn't check</b>: it reads whatever memory comes next and carries on with garbage, or crashes. This playground catches it for you. Off-by-one errors are among the most common bugs in programming.`,
  start:P(R`int scores[5] = {90, 72, 85, 60, 99};
for (int i = 0; i <= 5; i++) {
    cout << scores[i] << endl;
}`),ans:P(R`int scores[5] = {90, 72, 85, 60, 99};
for (int i = 0; i < 5; i++) {
    cout << scores[i] << endl;
}`),hint:'Use i < 5, not i <= 5.',
  check:c=>c.ok&&['90','72','85','60','99'].every(x=>c.lines.includes(x))},
 {title:'Vectors grow',goal:'Create <code>vector&lt;string&gt; inventory;</code>, add three items with <code>push_back</code>, and print <code>inventory.size()</code>.',
  anat:[['vector','type'],['<string>','type'],['inventory','name'],[';','op']],
  explain:`A <b>vector</b> is an array that can grow. It starts empty, and <code>push_back</code> adds an item to the end. <code>.size()</code> tells you how many it holds. You need <code>#include &lt;vector&gt;</code>. Use Step and watch new boxes appear in Memory.`,
  start:P(R`vector<string> inventory;
// add three items
`,{inc:['vector']}),ans:P(R`vector<string> inventory;
inventory.push_back("sword");
inventory.push_back("shield");
inventory.push_back("potion");
cout << "Items: " << inventory.size() << endl;`,{inc:['vector']}),hint:'inventory.push_back("sword");',
  check:c=>c.ok&&c.v('inventory')&&c.v('inventory').type==='vector<string>'&&c.v('inventory').v.length>=3&&c.has(/\.size\s*\(\)/)},
 {title:'Range-for',goal:'Print each item on its own line with <code>for (string item : inventory)</code>.',keep:true,
  anat:[['for','kw'],['(string item','name'],[':','op'],['inventory)','name']],
  explain:`The <b>range-for</b> loop reads "for each item in inventory". No index, no size, no off-by-one. Use it when you want every element in order. It also works on arrays and strings (giving one char at a time). Writing <code>auto</code> instead of <code>string</code> lets C++ figure out the type.`,
  start:P(R`vector<string> inventory;
inventory.push_back("sword");
inventory.push_back("shield");
inventory.push_back("potion");
`,{inc:['vector']}),ans:P(R`vector<string> inventory;
inventory.push_back("sword");
inventory.push_back("shield");
inventory.push_back("potion");
for (string item : inventory) {
    cout << "- " << item << endl;
}`,{inc:['vector']}),hint:'for (string item : inventory) { cout << "- " << item << endl; }',
  check:c=>c.ok&&c.has(/for\s*\(\s*(const\s+)?(auto|string|std::string)\s*&?\s*\w+\s*:/)&&c.lines.length>=3},
 {title:'Find the high score',goal:'Find the biggest number in <code>scores</code> with a loop, and print <code>High score: 99</code>. Don\'t just type 99.',
  explain:`Start with <code>best</code> set to the first score. Then check every score: if one is bigger than <code>best</code>, it becomes the new best. Step through and watch <code>best</code> update. This "keep the best so far" pattern finds minimums, longest names, closest enemies and much more.`,
  start:P(R`vector<int> scores = {72, 99, 85, 60, 91};
int best = scores[0];
// check every score
cout << "High score: " << best << endl;`,{inc:['vector']}),ans:P(R`vector<int> scores = {72, 99, 85, 60, 91};
int best = scores[0];
for (int s : scores) {
    if (s > best) {
        best = s;
    }
}
cout << "High score: " << best << endl;`,{inc:['vector']}),hint:'for (int s : scores) { if (s > best) best = s; }',
  check:c=>c.ok&&c.has(/\bfor\b/)&&/High score: 99/.test(c.out)&&!c.has(/best\s*=\s*99/)},
 {title:'Drop items',goal:'Remove <code>"shield"</code> with <code>erase</code> and the last item with <code>pop_back()</code>, leaving just sword and potion.',
  anat:[['inventory','name'],['.erase(','fn'],['inventory.begin() + 1','name'],[')','op']],
  explain:`<code>pop_back()</code> removes the last item. <code>erase</code> removes from any position, but it wants a position written as <code>inventory.begin() + index</code>. Watch Memory: everything after the erased item slides down one place.`,
  start:P(R`vector<string> inventory = {"sword", "shield", "potion", "map"};
// remove shield (index 1), then remove the last item
for (string item : inventory) {
    cout << item << endl;
}`,{inc:['vector']}),ans:P(R`vector<string> inventory = {"sword", "shield", "potion", "map"};
inventory.erase(inventory.begin() + 1);
inventory.pop_back();
for (string item : inventory) {
    cout << item << endl;
}`,{inc:['vector']}),hint:'inventory.erase(inventory.begin() + 1);  inventory.pop_back();',
  check:c=>c.ok&&c.v('inventory')&&JSON.stringify(c.v('inventory').v)==='["sword","potion"]'},
 {title:'2D grid: tic-tac-toe',goal:'Put an <code>X</code> in the center square with <code>board[1][1] = \'X\';</code> and print the board with <code>|</code> between columns.',
  explain:`A 2D array is an array of rows. <code>board[row][col]</code> picks one square, and both indexes start at 0, so the center of a 3×3 board is <code>[1][1]</code>. Nested loops walk it: the outer loop picks the row, the inner loop walks across it. Game maps, puzzles and pixels all work this way.`,
  start:P(R`char board[3][3] = {
    {'O', ' ', ' '},
    {' ', ' ', ' '},
    {' ', ' ', 'O'}
};
// place X in the center, then print the board
`),ans:P(R`char board[3][3] = {
    {'O', ' ', ' '},
    {' ', ' ', ' '},
    {' ', ' ', 'O'}
};
board[1][1] = 'X';
for (int row = 0; row < 3; row++) {
    for (int col = 0; col < 3; col++) {
        cout << board[row][col];
        if (col < 2) cout << "|";
    }
    cout << endl;
}`),hint:"board[1][1] = 'X'; then a row loop with a col loop inside.",
  check:c=>c.ok&&c.v('board')&&c.v('board').v[1][1]==='X'&&c.lines.filter(l=>l.includes('|')).length>=3}
 ]},
{name:'Structs',badge:'Architect',intro:'Bundle related data into your own types. Build heroes and monsters, then make them fight.',
 learned:['struct','.field','{ } init','const &','vector<Struct>','->'],
 missions:[
 {title:'Design a Player',goal:'Finish <code>struct Player</code> with a <code>string name</code>, <code>int hp</code> and <code>int attack</code>. Create <code>hero</code>, fill in its fields, and print them.',
  anat:[['struct','kw'],['Player','type'],['{','op'],['string name; int hp; int attack;','name'],['};','op']],
  explain:`A <b>struct</b> creates a new type made of several named fields. <code>Player hero;</code> creates one, and the dot reaches inside: <code>hero.hp = 100;</code>. In Memory, hero is one big box holding smaller boxes. Note the <code>;</code> after the struct's closing brace.`,
  start:P(R`Player hero;
hero.name = "Aria";
// set hp and attack, then print all three
`,{pre:R`struct Player {
    string name;
    // add hp and attack
};`}),ans:P(R`Player hero;
hero.name = "Aria";
hero.hp = 100;
hero.attack = 12;
cout << hero.name << " HP:" << hero.hp << " ATK:" << hero.attack << endl;`,{pre:R`struct Player {
    string name;
    int hp;
    int attack;
};`}),hint:'In the struct: int hp; int attack;   In main: hero.hp = 100; hero.attack = 12;',
  check:c=>c.ok&&c.structs.length>=1&&Object.values(c.vars).some(x=>x.v&&typeof x.v==='object'&&'hp'in x.v&&'attack'in x.v&&typeof x.v.hp==='number')&&!c.warned(/uninitialized/)},
 {title:'Quick setup with braces',goal:'Create two players in one line each: <code>Player hero = {"Aria", 100, 12};</code> and a goblin. Print both.',keep:true,
  explain:`Values in curly braces fill the fields <b>in the order they're listed</b> in the struct: name, then hp, then attack. Much shorter than setting each field, but you have to remember the order.`,
  start:P(R`Player hero = {"Aria", 100, 12};
`,{pre:R`struct Player {
    string name;
    int hp;
    int attack;
};`}),ans:P(R`Player hero = {"Aria", 100, 12};
Player goblin = {"Goblin", 30, 5};
cout << hero.name << " vs " << goblin.name << endl;`,{pre:R`struct Player {
    string name;
    int hp;
    int attack;
};`}),hint:'Player goblin = {"Goblin", 30, 5};',
  check:c=>c.ok&&Object.values(c.vars).filter(x=>x.type==='Player').length>=2&&c.count(/=\s*\{/)>=2},
 {title:'Structs in functions',goal:'Write <code>void printPlayer(const Player&amp; p)</code> that prints <code>Aria (HP 100)</code>. Call it for both players.',
  explain:`Passing a struct by value copies every field. <code>const Player&amp;</code> passes a reference instead (no copy) and <code>const</code> promises the function won't change it. That's the standard way to pass structs, strings and vectors you only want to read.`,
  start:P(R`Player hero = {"Aria", 100, 12};
Player goblin = {"Goblin", 30, 5};
`,{pre:R`struct Player {
    string name;
    int hp;
    int attack;
};

// write printPlayer here
`}),ans:P(R`Player hero = {"Aria", 100, 12};
Player goblin = {"Goblin", 30, 5};
printPlayer(hero);
printPlayer(goblin);`,{pre:R`struct Player {
    string name;
    int hp;
    int attack;
};

void printPlayer(const Player& p) {
    cout << p.name << " (HP " << p.hp << ")" << endl;
}`}),hint:'void printPlayer(const Player& p) { cout << p.name << " (HP " << p.hp << ")" << endl; }',
  check:c=>c.ok&&c.userCalls(f=>f.params.some(p=>p.type.base==='struct'))>=2&&/\(HP 100\)/.test(c.out)},
 {title:'Take damage',goal:'Write <code>void takeDamage(Player&amp; p, int dmg)</code>. It lowers hp by dmg, but never below 0. Hit the goblin for 50.',
  explain:`This time the function must change the player, so the parameter is <code>Player&amp;</code> without const. The "never below 0" rule is called <b>clamping</b>: after subtracting, if hp went negative, set it to 0.`,
  start:P(R`Player goblin = {"Goblin", 30, 5};
takeDamage(goblin, 50);
cout << goblin.name << " HP: " << goblin.hp << endl;`,{pre:R`struct Player {
    string name;
    int hp;
    int attack;
};

void takeDamage(Player& p, int dmg) {
    // lower hp, but not below 0
}`}),ans:P(R`Player goblin = {"Goblin", 30, 5};
takeDamage(goblin, 50);
cout << goblin.name << " HP: " << goblin.hp << endl;`,{pre:R`struct Player {
    string name;
    int hp;
    int attack;
};

void takeDamage(Player& p, int dmg) {
    p.hp -= dmg;
    if (p.hp < 0) {
        p.hp = 0;
    }
}`}),hint:'p.hp -= dmg;  if (p.hp < 0) p.hp = 0;',
  check:c=>c.ok&&c.v('goblin')&&c.v('goblin').v.hp===0},
 {title:'A party of heroes',goal:'Create a <code>vector&lt;Player&gt; party</code> with three heroes. Loop over it to print each name, then print the party\'s total HP.',
  explain:`Vectors can hold structs too. <code>party[0].name</code> reads the first hero's name, and a range-for gives you each hero in turn. Use <code>const Player&amp; p</code> in the loop to avoid copying each hero.`,
  start:P(R`vector<Player> party = {
    {"Aria", 100, 12},
    {"Bram", 80, 15},
    {"Cyra", 60, 20}
};
int total = 0;
// print each name and add up the hp
cout << "Total HP: " << total << endl;`,{inc:['vector'],pre:R`struct Player {
    string name;
    int hp;
    int attack;
};`}),ans:P(R`vector<Player> party = {
    {"Aria", 100, 12},
    {"Bram", 80, 15},
    {"Cyra", 60, 20}
};
int total = 0;
for (const Player& p : party) {
    cout << p.name << endl;
    total += p.hp;
}
cout << "Total HP: " << total << endl;`,{inc:['vector'],pre:R`struct Player {
    string name;
    int hp;
    int attack;
};`}),hint:'for (const Player& p : party) { cout << p.name << endl; total += p.hp; }',
  check:c=>c.ok&&c.v('party')&&c.v('party').v.length>=3&&c.v('total')&&c.v('total').v===c.v('party').v.reduce((s,p)=>s+p.hp,0)&&c.v('party').v.every(p=>c.out.includes(p.name))},
 {title:'Final boss battle',goal:'Make the hero and the boss take turns attacking with random damage until one of them reaches 0 HP. Print each round, then announce who <b>wins</b>.',
  explain:`Everything comes together: a struct for fighters, functions for actions, random numbers for luck, a loop for rounds, and ifs to stop at the right moment. Check after <b>each</b> attack: if the boss dies from the hero's hit, it shouldn't get to hit back.`,
  start:P(R`srand(time(0));
Player hero = {"Aria", 100, 12};
Player boss = {"Dragon", 120, 10};
int round = 1;
// while both are alive: hero attacks, check, boss attacks, round++
`,{inc:['cstdlib','ctime'],pre:R`struct Player {
    string name;
    int hp;
    int attack;
};

int rollDice(int sides) {
    return rand() % sides + 1;
}

void hit(Player& attacker, Player& target) {
    int dmg = attacker.attack + rollDice(6);
    target.hp -= dmg;
    if (target.hp < 0) target.hp = 0;
    cout << attacker.name << " hits " << target.name << " for " << dmg
         << " (" << target.name << " HP " << target.hp << ")" << endl;
}`}),ans:P(R`srand(time(0));
Player hero = {"Aria", 100, 12};
Player boss = {"Dragon", 120, 10};
int round = 1;
while (hero.hp > 0 && boss.hp > 0) {
    cout << "-- Round " << round << " --" << endl;
    hit(hero, boss);
    if (boss.hp == 0) break;
    hit(boss, hero);
    round++;
}
if (hero.hp > 0) {
    cout << hero.name << " wins!" << endl;
} else {
    cout << boss.name << " wins!" << endl;
}`,{inc:['cstdlib','ctime'],pre:R`struct Player {
    string name;
    int hp;
    int attack;
};

int rollDice(int sides) {
    return rand() % sides + 1;
}

void hit(Player& attacker, Player& target) {
    int dmg = attacker.attack + rollDice(6);
    target.hp -= dmg;
    if (target.hp < 0) target.hp = 0;
    cout << attacker.name << " hits " << target.name << " for " << dmg
         << " (" << target.name << " HP " << target.hp << ")" << endl;
}`}),hint:'while (hero.hp > 0 && boss.hp > 0) { hit(hero, boss); if (boss.hp == 0) break; hit(boss, hero); round++; }',
  check:c=>c.ok&&c.has(/\bwhile\b/)&&/wins/i.test(c.out)&&((c.v('hero')&&c.v('hero').v.hp===0)||(c.v('boss')&&c.v('boss').v.hp===0))}
 ]},
{name:'Pointers',badge:'Pointer Pro',intro:'Every box in memory has an address. Pointers store addresses, and they are C++\'s superpower and its sharpest edge.',
 learned:['&x','int* p','*p','nullptr','p++','int& r'],
 missions:[
 {title:'Every box has an address',goal:'Print <code>&amp;score</code>. Compare the number with the address shown under <code>score</code> in the Memory panel.',
  anat:[['&','op'],['score','name']],
  explain:`Memory is one huge row of numbered bytes. A variable's <b>address</b> is the number of its first byte, usually shown in hexadecimal (base 16, starting with <code>0x</code>). <code>&amp;score</code> means "the address of score". (On a real computer the address changes every run.)`,
  start:P(R`int score = 42;
cout << "score is " << score << endl;
// print where score lives
`),ans:P(R`int score = 42;
cout << "score is " << score << endl;
cout << "score lives at " << &score << endl;`),hint:'cout << &score << endl;',
  check:c=>c.ok&&/0x[0-9a-f]+/.test(c.out)&&c.has(/&\s*score/)},
 {title:'A pointer stores an address',goal:'Create <code>int* p = &amp;score;</code>. Print <code>p</code>, then print <code>*p</code>.',
  anat:[['int*','type'],['p','name'],['=','op'],['&score','name']],
  explain:`A <b>pointer</b> is a variable whose value is an address. <code>int*</code> means "pointer to an int". In Memory, p's box holds score's address and draws an arrow to it. Putting <code>*</code> in front of a pointer <b>follows the arrow</b>: <code>*p</code> reads the value at that address, 42.`,
  start:P(R`int score = 42;
// make p point at score
`),ans:P(R`int score = 42;
int* p = &score;
cout << "p holds " << p << endl;
cout << "*p is " << *p << endl;`),hint:'int* p = &score;  cout << p;  cout << *p;',
  check:c=>c.ok&&c.v('p')&&c.v('p').type==='int*'&&c.lines.some(l=>/\b42\b/.test(l))&&c.has(/\*\s*p/)},
 {title:'Change it through the pointer',goal:'Use <code>*p = 99;</code>, then print <code>score</code>. You never touch score directly.',keep:true,
  explain:`<code>*p = 99</code> means "store 99 at the address in p". Since p points at score, score becomes 99. Step through it and watch the arrow: this is the same idea as references (&amp; parameters), but a pointer can be re-aimed at something else later.`,
  start:P(R`int score = 42;
int* p = &score;
`),ans:P(R`int score = 42;
int* p = &score;
*p = 99;
cout << "score is now " << score << endl;`),hint:'*p = 99;',
  check:c=>c.ok&&c.v('score')&&c.v('score').v===99&&c.has(/\*\s*p\s*=/)},
 {title:'Bug hunt: the null pointer',goal:'This crashes. Run it, read the error, then guard the read with <code>if (p != nullptr)</code> and print <code>Nothing here</code> otherwise.',
  explain:`<code>nullptr</code> means "points at nothing". Following it with <code>*</code> is a crash: a <b>segmentation fault</b>, the operating system stopping a program for touching memory it doesn't own. Uninitialized pointers are even worse: they point at random places. Always give a pointer a value, and check it before following it.`,
  start:P(R`int* p = nullptr;
cout << *p << endl;`),ans:P(R`int* p = nullptr;
if (p != nullptr) {
    cout << *p << endl;
} else {
    cout << "Nothing here" << endl;
}`),hint:'if (p != nullptr) { cout << *p; } else { cout << "Nothing here"; }',
  check:c=>c.ok&&c.has(/nullptr/)&&c.has(/\bif\b/)&&/nothing here/i.test(c.out)},
 {title:'Pointers walk arrays',goal:'Point <code>p</code> at the start of the array and use a loop with <code>p++</code> to print every value.',
  explain:`An array's name turns into a pointer to its first box, so <code>int* p = coins;</code> works. <code>p++</code> moves the pointer to the <b>next box</b>, which is 4 bytes along for an int. Watch the arrow in Memory slide along the row. This is how arrays work underneath: <code>coins[i]</code> is short for <code>*(coins + i)</code>.`,
  start:P(R`int coins[4] = {5, 10, 20, 50};
int* p = coins;
cout << *p << endl;`),ans:P(R`int coins[4] = {5, 10, 20, 50};
int* p = coins;
for (int i = 0; i < 4; i++) {
    cout << *p << endl;
    p++;
}`),hint:'for (int i = 0; i < 4; i++) { cout << *p << endl; p++; }',
  check:c=>c.ok&&c.has(/p\s*\+\+|\+\+\s*p|p\s*\+=|p\s*\+\s*\w/)&&['5','10','20','50'].every(x=>c.lines.includes(x))},
 {title:'References vs pointers',goal:'Create <code>int&amp; ref = score;</code> and add 5 through it. Then create <code>int* ptr = &amp;score;</code> and add 5 through that. score should end at 20.',
  explain:`Both let you reach score from another name. A <b>reference</b> is a permanent second name: no <code>*</code> needed, can't be null, can't be re-aimed. A <b>pointer</b> is a separate variable holding an address: you need <code>*</code>, it can be nullptr, and it can move. Prefer references when you can, pointers when you must.`,
  start:P(R`int score = 10;
// reference version, then pointer version
cout << "score: " << score << endl;`),ans:P(R`int score = 10;
int& ref = score;
ref += 5;
int* ptr = &score;
*ptr += 5;
cout << "score: " << score << endl;`),hint:'int& ref = score;  ref += 5;  int* ptr = &score;  *ptr += 5;',
  check:c=>c.ok&&c.v('score')&&c.v('score').v===20&&Object.values(c.vars).some(x=>/&$/.test(x.type))&&Object.values(c.vars).some(x=>/\*$/.test(x.type))}
 ]}
];
if(typeof module!=='undefined')module.exports={CH,makeCtx,P};

(()=>{
const KEY='cpp-quest-v1';
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
function fresh(){return {ch:0,mi:0,done:{},xp:0,best:0,badges:{},codes:{},sandbox:null,inSandbox:false}}
let S=fresh();
try{const raw=localStorage.getItem(KEY);if(raw){const o=JSON.parse(raw);if(o&&typeof o==='object')S=Object.assign(fresh(),o)}}catch(e){}
if(!CH[S.ch]){S.ch=0;S.mi=0}if(!CH[S.ch].missions[S.mi])S.mi=0;
function save(){try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}}
const mkey=(c,m)=>c+'-'+m;
const SANDBOX=P(R`// Sandbox: write anything you like.
string hero = "Pixel";
int coins = 3;
for (int i = 1; i <= coins; i++) {
    cout << hero << " found coin " << i << endl;
}`,{inc:['string','vector']});

/* ---------- syntax highlight ---------- */
const HKW=new Set('if else while for do return break continue switch case default struct class const using namespace true false nullptr static_cast sizeof new delete auto'.split(' '));
const HTY=new Set('int double float bool char void long short unsigned string vector size_t'.split(' '));
const HSTD=new Set('cout cin endl cerr getline std'.split(' '));
function hl(code){
  const sn=new Set();for(const m of code.matchAll(/struct\s+(\w+)/g))sn.add(m[1]);
  const re=/(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|("(?:[^"\\\n]|\\.)*"?)|('(?:[^'\\\n]|\\.)*'?)|(^[ \t]*#[^\n]*)|(\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?[fFuUlL]*\b)|([A-Za-z_]\w*)/gm;
  let out='',last=0,m;
  while((m=re.exec(code))){out+=esc(code.slice(last,m.index));const t=m[0];let cls='';
    if(m[1])cls='com';else if(m[2]||m[3])cls='str';else if(m[4])cls='pp';else if(m[5])cls='num';
    else if(m[6]){if(HKW.has(t))cls='kw';else if(HTY.has(t)||sn.has(t))cls='ty';else if(HSTD.has(t))cls='std';else if(/^\s*\(/.test(code.slice(re.lastIndex,re.lastIndex+40)))cls='fn'}
    out+=cls?`<span class="s-${cls}">${esc(t)}</span>`:esc(t);last=re.lastIndex;if(!t)re.lastIndex++}
  return out+esc(code.slice(last))}

/* ---------- editor ---------- */
const ta=$('code'),hlEl=$('hl'),gutter=$('gutter'),lhl=$('lhl'),editor=$('editor');
let gutN=0,marks={err:0,warn:[],step:0};
function lh(){return parseFloat(getComputedStyle(ta).lineHeight)||22}
function syncEd(){hlEl.innerHTML=hl(ta.value)+'\n';const n=ta.value.split('\n').length;
  if(n!==gutN){gutter.innerHTML=Array.from({length:n},(_,i)=>`<div>${i+1}</div>`).join('');gutN=n;paintMarks()}
  sizeTa()}
function sizeTa(){ta.style.height=Math.max(hlEl.offsetHeight,editor.clientHeight)+'px'}
function paintMarks(){const kids=gutter.children;for(let i=0;i<kids.length;i++){const l=i+1;kids[i].className=l===marks.step?'stepl':l===marks.err?'errl':marks.warn.includes(l)?'warnl':''}
  const L=marks.step||marks.err;if(!L){lhl.hidden=true;return}
  lhl.hidden=false;lhl.className='lhl '+(marks.step?'step':'err');const h=lh();lhl.style.top=(12+(L-1)*h)+'px';lhl.style.height=h+'px'}
function setMarks(m){Object.assign(marks,m);paintMarks()}
function reveal(line){const h=lh(),top=12+(line-1)*h;if(top<editor.scrollTop+h||top>editor.scrollTop+editor.clientHeight-2*h)editor.scrollTop=Math.max(0,top-editor.clientHeight/3)}
function setCode(src){ta.value=src;syncEd();setMarks({err:0,warn:[],step:0});editor.scrollTop=0}
ta.addEventListener('input',()=>{syncEd();if(M&&running)stop('edited');if(marks.err||marks.warn.length)setMarks({err:0,warn:[]});saveCode()});
let saveT;function saveCode(){clearTimeout(saveT);saveT=setTimeout(()=>{if(S.inSandbox)S.sandbox=ta.value;else S.codes[mkey(S.ch,S.mi)]=ta.value;save()},300)}
function insert(text,sel0,sel1){const s=ta.selectionStart,e=ta.selectionEnd;ta.setRangeText(text,s,e,'end');if(sel0!=null){ta.selectionStart=s+sel0;ta.selectionEnd=s+(sel1??sel0)}ta.dispatchEvent(new Event('input'))}
ta.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();runBtn();return}
  if(e.key==='F10'){e.preventDefault();stepBtn();return}
  if(ta.readOnly)return;
  if(e.key==='Tab'&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();
    const v=ta.value,s=ta.selectionStart,ls=v.lastIndexOf('\n',s-1)+1;
    if(e.shiftKey){const m=v.slice(ls).match(/^ {1,4}/);if(m){ta.setRangeText('',ls,ls+m[0].length,'preserve');ta.selectionStart=ta.selectionEnd=Math.max(ls,s-m[0].length);ta.dispatchEvent(new Event('input'))}}
    else insert('    ');return}
  if(e.key==='Enter'&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();
    const v=ta.value,s=ta.selectionStart,ls=v.lastIndexOf('\n',s-1)+1;const cur=v.slice(ls,s);let ind=cur.match(/^\s*/)[0];
    const before=cur.trimEnd(),after=v.slice(ta.selectionEnd).match(/^[^\n]*/)[0];
    if(before.endsWith('{')){if(after.trim().startsWith('}')){insert('\n'+ind+'    \n'+ind,1+ind.length+4);return}ind+='    '}
    insert('\n'+ind);return}
  if(e.key==='}'&&!e.ctrlKey&&!e.metaKey){const v=ta.value,s=ta.selectionStart,ls=v.lastIndexOf('\n',s-1)+1;const cur=v.slice(ls,s);
    if(/^\s+$/.test(cur)&&cur.length>=4&&ta.selectionStart===ta.selectionEnd){e.preventDefault();ta.setRangeText(cur.slice(4)+'}',ls,s,'end');ta.dispatchEvent(new Event('input'))}}
});
$('keys').addEventListener('click',e=>{const b=e.target.closest('button');if(!b||ta.readOnly)return;const k=b.dataset.k;ta.focus();
  if(k==='TAB')insert('    ');else insert(k)});
new ResizeObserver(()=>{sizeTa();paintMarks()}).observe(hlEl);new ResizeObserver(sizeTa).observe(editor);

/* ---------- console ---------- */
const conOut=$('conOut'),con=$('con'),inrow=$('inrow'),stdin=$('stdin');let curOut=null,conChars=0;
function cw(text,cls){if(cls==='out'){if(!curOut){curOut=document.createElement('span');curOut.className='o';conOut.append(curOut)}
    curOut.append(text);conChars+=text.length;if(conChars>200000){conOut.firstChild&&conOut.firstChild.remove();conChars=150000}}
  else{if(curOut&&!/\n$/.test(curOut.textContent))curOut.append('\n');curOut=null;const d=document.createElement('div');d.className='cl '+cls;d.innerHTML=text;conOut.append(d)}
  con.scrollTop=con.scrollHeight}
function clearCon(){conOut.innerHTML='';curOut=null;conChars=0}
$('clearCon').onclick=()=>{clearCon();if(!running)cw('Console cleared.','sys')};
function showError(err,src,phase){const L=err.line,line=(src.split('\n')[L-1]??'');
  if(err.kind==='runtime'){cw(`<b>${esc(err.message)}</b>`,'err');if(L)cw(`happened on line ${L}:  ${esc(line.trim())}`,'where')}
  else{const head=err.kind==='link'?`/usr/bin/ld: main.o: in function '_start': `:`main.cpp:${L}${err.col?':'+err.col:''}: `;
    cw(`<span style="color:var(--term-dim)">${esc(head)}</span><b>${err.kind==='link'?'error: ':'error: '}</b>${esc(err.message)}`,'err');
    if(L&&line){cw(`${String(L).padStart(5)} | ${esc(line)}`,'src');if(err.col)cw(`      | ${' '.repeat(Math.max(0,err.col-1))}^`,'caret')}}
  if(err.tip)cw('▸ In plain English: '+esc(err.tip),'tip')}
function showWarn(w,src){const line=(src.split('\n')[w.line-1]??'');
  cw(`<span style="color:var(--term-dim)">main.cpp:${w.line}: </span>warning: ${esc(w.msg.replace(/^warning: /,''))}`,'warn');
  if(w.tip)cw('▸ '+esc(w.tip),'tip')}

/* ---------- memory view ---------- */
const memEl=$('mem');
function tcls(t){if(/[*&]$/.test(t)&&/\*$/.test(t))return 't-ptr';if(/^(int|long)/.test(t))return 't-int';if(/^double/.test(t))return 't-dbl';if(/^string/.test(t))return 't-str';if(/^bool/.test(t))return 't-bool';if(/^char/.test(t))return 't-char';return 't-agg'}
function cellVal(it){if(it.kind==='prim')return it.val;if(it.kind==='ptr')return it.target?'→'+it.target.replace(/^.*\./,'.'):it.val;return '…'}
function itemHTML(it){
  const tc=tcls(it.type);const fl=it.changed?' flash':'';
  if(it.kind==='ref')return `<div class="var ref ${tcls(it.type.replace('&',''))}${fl}" data-tid="${it.tid}"><div class="vh"><span class="tchip">${esc(it.type)}</span><span class="vn">${esc(it.name)}</span><span class="vv">${esc(it.val)}</span></div><div class="addr"><span class="arrow">same box as ${esc(it.target)}</span></div></div>`;
  if(it.kind==='prim')return `<div class="var ${tc}${fl}" data-cid="${it.id}"><div class="vh"><span class="tchip">${it.isConst?'const ':''}${esc(it.type)}</span><span class="vn">${esc(it.name)}</span><span class="vv${it.init?'':' garb'}" ${it.init?'':`title="Uninitialized: holds garbage ${esc(it.garbage)}"`}>${esc(it.val)}</span></div><div class="addr"><span>${it.addr}</span>${it.init?'':'<span style="color:var(--err)">uninitialized</span>'}</div></div>`;
  if(it.kind==='ptr')return `<div class="var t-ptr${fl}" data-cid="${it.id}" ${it.tid?`data-tid="${it.tid}"`:''}><div class="vh"><span class="tchip">${esc(it.type)}</span><span class="vn">${esc(it.name)}</span><span class="vv${it.val==='??'?' garb':''}">${esc(it.val)}</span></div><div class="addr"><span>${it.addr}</span>${it.target?`<span class="arrow">→ ${esc(it.target)}</span>`:it.val==='nullptr'?'<span>points at nothing</span>':it.val==='??'?'<span style="color:var(--err)">wild pointer</span>':''}</div></div>`;
  const head=`<div class="vh"><span class="tchip">${esc(it.type)}</span><span class="vn">${esc(it.name)}</span>${it.kind==='vector'?`<span class="vv" style="font-size:12px;color:var(--muted)">size ${it.items.length}</span>`:''}</div><div class="addr"><span>${it.addr}</span></div>`;
  if(it.kind==='struct')return `<div class="var t-agg${fl}" data-cid="${it.id}">${head}<div class="sub">${it.items.map(itemHTML).join('')}</div></div>`;
  const simple=it.items.every(x=>x.kind==='prim'||x.kind==='ptr');const MAX=48;const shown=it.items.slice(0,MAX);
  const more=it.items.length>MAX?`<span class="more">+${it.items.length-MAX} more</span>`:'';
  if(simple)return `<div class="var ${tc.replace('t-agg',tcls(it.type.replace(/^vector<|>$|\[.*$/g,'')))}${fl}" data-cid="${it.id}">${head}<div class="row">${shown.map(c=>`<div class="cell${c.changed?' flash':''}${c.init===false?' garb':''}" data-cid="${c.id}" ${c.tid?`data-tid="${c.tid}"`:''}><span class="cv">${esc(cellVal(c))}</span><span class="ci">${c.name}</span></div>`).join('')}${more}${!it.items.length?'<span class="more">empty</span>':''}</div></div>`;
  return `<div class="var t-agg${fl}" data-cid="${it.id}">${head}<div class="sub">${shown.map(c=>itemHTML({...c,name:'['+c.name+']'})).join('')}${more}</div></div>`}
function renderMem(frames,finished){
  if(!frames||!frames.length){memEl.innerHTML=`<p class="memempty">Press <b>Step</b> or <b>Run</b> to see your variables here.</p>`;return}
  memEl.innerHTML=frames.map(f=>`<section class="frame${f.top&&!finished?' top':''}${finished&&f.name==='main'?' done':''}"><header><b>${f.global?'global variables':esc(f.name)+'()'}</b>${f.callLine?`<span>called from line ${f.callLine}</span>`:''}</header><div class="cells">${f.items.length?f.items.map(itemHTML).join(''):'<p class="none">No variables yet</p>'}</div></section>`).join('')}
memEl.addEventListener('mouseover',e=>{const el=e.target.closest('[data-tid]');memEl.querySelectorAll('.target').forEach(x=>x.classList.remove('target'));if(el)memEl.querySelectorAll(`[data-cid="${el.dataset.tid}"]`).forEach(x=>x.classList.add('target'))});
memEl.addEventListener('mouseleave',()=>memEl.querySelectorAll('.target').forEach(x=>x.classList.remove('target')));

/* ---------- runner ---------- */
let M=null,running=false,mode=null,timer=null,pendingIn=undefined,runSrc='',runOut='',runWarns=[],stepDepth=1,lastLine=0,compiled=null;
const st=$('st'),stx=$('stx');
function status(cls,text,extra){st.className='st '+cls;st.textContent=text;stx.innerHTML=extra||''}
function buttons(){const live=!!M&&running;
  $('bRun').querySelector('span').textContent=live&&mode!=='run'?'Continue':'Run';
  $('bRun').disabled=live&&mode==='run'&&!waiting;
  $('bStop').disabled=!live;
  $('bWatch').querySelector('span').textContent=live&&mode==='watch'?'Pause':'Watch';
  ta.readOnly=live&&(mode==='step'||mode==='watch')}
let waiting=false;
function begin(m){
  clearTimeout(timer);clearCon();runSrc=ta.value;runOut='';runWarns=[];stepDepth=1;
  setMarks({err:0,warn:[],step:0});
  cw('<b>$</b> g++ -Wall main.cpp -o main','sys');
  const c=CPP.compile(runSrc);compiled=c;
  if(!c.ok){showError(c.error,runSrc);setMarks({err:c.error.line||0});if(c.error.line)reveal(c.error.line);
    status('bad',c.error.kind==='link'?'Link error':'Compile error',c.error.line?`on line ${c.error.line}. Nothing ran: fix the code and run again.`:'');
    renderMem(null);M=null;running=false;buttons();afterRun(false);return false}
  c.warnings.forEach(w=>showWarn(w,runSrc));setMarks({warn:c.warnings.map(w=>w.line)});
  cw('<b>$</b> ./main','sys');
  M=CPP.Machine(c.prog,{out:s=>{runOut+=s;cw(s,'out')},warn:w=>{runWarns.push(w);showWarn(w,runSrc)}});
  running=true;mode=m;pendingIn=undefined;waiting=false;return true}
function advance(){let r;
  try{r=M.next(pendingIn)}catch(err){pendingIn=undefined;crash(err);return false}
  pendingIn=undefined;
  if(r.done){finish(r.code);return false}
  if(r.input){askInput();return false}
  lastLine=r.line;if(mode!=='run')stepDepth=Math.max(stepDepth,M.depth);return true}
function pump(){if(!running)return;const t0=performance.now();
  while(performance.now()-t0<16){if(!advance())return}
  status('run','Running…',`line ${lastLine}`);timer=setTimeout(pump,0)}
function stepOnce(){if(!running)return false;M.clearChanged();const ok=advance();if(!running)return false;
  if(ok){setMarks({step:lastLine});reveal(lastLine);renderMem(M.view());status('pause','Paused',`line ${lastLine} runs next${M.depth>1?` · inside ${esc(M.view().slice(-1)[0].name)}()`:''}`)}
  return ok}
function watchTick(){if(!running||mode!=='watch')return;if(stepOnce())timer=setTimeout(watchTick,+$('speed').value)}
function askInput(){waiting=true;inrow.hidden=false;stdin.value='';con.scrollTop=con.scrollHeight;
  renderMem(M.view());if(mode!=='run'){setMarks({step:M.line});reveal(M.line)}
  status('wait','Waiting for input',`type in the console below and press Enter`);buttons();stdin.focus({preventScroll:true});con.scrollTop=con.scrollHeight}
stdin.addEventListener('keydown',e=>{if(e.key!=='Enter'||!waiting)return;e.preventDefault();const v=stdin.value;
  if(!curOut){curOut=document.createElement('span');curOut.className='o';conOut.append(curOut)}
  const s=document.createElement('span');s.className='in';s.textContent=v+'\n';curOut.append(s);
  inrow.hidden=true;waiting=false;pendingIn=v;buttons();
  if(mode==='run'){status('run','Running…');pump()}else{M.clearChanged();if(advance()){setMarks({step:lastLine});reveal(lastLine);renderMem(M.view());status('pause','Paused',`line ${lastLine} runs next`);if(mode==='watch')timer=setTimeout(watchTick,+$('speed').value)}}
  if(mode!=='run'&&running)ta.focus({preventScroll:true})});
function crash(err){running=false;waiting=false;inrow.hidden=true;clearTimeout(timer);
  if(curOut&&!/\n$/.test(curOut.textContent))curOut.append('\n');curOut=null;
  showError(err,runSrc);setMarks({step:0,err:err.line||0});if(err.line)reveal(err.line);
  renderMem(M.view(),true);
  status('bad',err.head==='loop'||/steps/.test(err.message)?'Stopped':'Crashed',err.line?`on line ${err.line}`:'');
  buttons();afterRun(false)}
function finish(code){running=false;waiting=false;inrow.hidden=true;clearTimeout(timer);
  if(curOut&&!/\n$/.test(curOut.textContent))curOut.append('\n');curOut=null;
  cw(`Program finished · exit code ${code}`,'done');setMarks({step:0});renderMem(M.view(),true);
  status('ok','Finished',`${M.info().steps.toLocaleString('en-US')} steps`);buttons();afterRun(true)}
function stop(why){if(!M||!running)return;running=false;waiting=false;inrow.hidden=true;clearTimeout(timer);
  if(curOut&&!/\n$/.test(curOut.textContent))curOut.append('\n');curOut=null;
  cw(why==='edited'?'^C  (stopped because you edited the code)':'^C  (stopped)','sys');setMarks({step:0});status('','Stopped','');buttons()}
function runBtn(){if(running&&M){if(waiting){stdin.focus();return}mode='run';buttons();status('run','Running…');setMarks({step:0});pump();return}
  if(begin('run')){buttons();status('run','Running…');pump()}}
function stepBtn(){if(running&&M){if(waiting){stdin.focus();return}clearTimeout(timer);mode='step';buttons();stepOnce();return}
  if(begin('step')){buttons();stepOnce()}}
function watchBtn(){if(running&&M){if(waiting){stdin.focus();return}if(mode==='watch'){clearTimeout(timer);mode='step';buttons();status('pause','Paused',`line ${lastLine} runs next`);return}mode='watch';buttons();watchTick();return}
  if(begin('watch')){buttons();watchTick()}}
$('bRun').onclick=runBtn;$('bStep').onclick=stepBtn;$('bWatch').onclick=watchBtn;$('bStop').onclick=()=>stop();
let armed=null;$('resetCode').onclick=e=>{const b=e.currentTarget;if(armed!==b){armed=b;b.classList.add('armed');b.textContent='Click again to reset';setTimeout(()=>{if(armed===b){armed=null;b.classList.remove('armed');b.textContent='Reset code'}},2600);return}
  armed=null;b.classList.remove('armed');b.textContent='Reset code';stop();setCode(S.inSandbox?SANDBOX:curM().start);saveCode();clearCon();cw('Code reset to the starting version.','sys');renderMem(null);status('','Ready','')};

/* ---------- missions ---------- */
const curM=()=>CH[S.ch].missions[S.mi];
const RANKS=[[0,'Rookie'],[80,'Tinkerer'],[200,'Coder'],[380,'Builder'],[560,'Engineer'],[760,'Wizard']];
const MAXXP=CH.reduce((s,c)=>s+c.missions.length*10+25,0);
function renderXP(){let r=RANKS[0];for(const x of RANKS)if(S.xp>=x[0])r=x;$('rank').textContent=r[1];$('xpText').textContent=S.xp+' XP';$('xpFill').style.width=Math.min(100,S.xp/MAXXP*100)+'%'}
function chDone(ci){return CH[ci].missions.filter((_,mi)=>S.done[mkey(ci,mi)]).length}
function renderChapters(){$('chapters').innerHTML=CH.map((c,ci)=>`<button class="chap${S.badges[ci]?' earned':''}" ${!S.inSandbox&&ci===S.ch?'aria-current="true"':''} data-ch="${ci}"><span class="num">${ci+1}</span><span class="nm">${esc(c.name)}</span><span class="ct">${chDone(ci)}/${c.missions.length}</span></button>`).join('')+
  `<button class="chap sb" ${S.inSandbox?'aria-current="true"':''} data-ch="sb"><span class="num">{ }</span><span class="nm">Sandbox</span></button>`}
$('chapters').addEventListener('click',e=>{const b=e.target.closest('.chap');if(!b)return;
  if(b.dataset.ch==='sb'){openSandbox();return}const ci=+b.dataset.ch;
  let mi=CH[ci].missions.findIndex((_,i)=>!S.done[mkey(ci,i)]);if(mi<0)mi=0;goMission(ci,mi,false)});
const KLAB={kw:'keyword',type:'type',name:'name',val:'value',op:'symbol',pp:'directive',fn:'function'};
let showHint=false,showAns=false,justWon=false;
function anatHTML(a){return a?`<div class="anat">${a.map(([t,k,l])=>`<span class="tok k-${k}"><b>${esc(t)}</b><span>${l?esc(l):KLAB[k]}</span></span>`).join('')}</div>`:''}
function renderMission(){const card=$('mission');
  if(S.inSandbox){card.innerHTML=`<div class="eyebrow">Free play</div><h2>Sandbox</h2>
    <p class="explain">No goals, no checks. Write any program, run it, step through it. Field guide examples open here when you press Try.</p>
    <div class="goal"><div class="label">Ideas to try</div><ul class="ideas"><li>Print a multiplication table with two loops</li><li>Ask for a word and print it backwards</li><li>Create a vector of names and sort it (needs #include &lt;algorithm&gt;)</li><li>Write a function that tells you if a number is prime</li><li>Draw a diamond of stars</li></ul></div>
    <div class="actions"><button class="btn" id="backQuest">Back to chapter ${S.ch+1}</button><button class="btn ghost" id="blankSb">Blank program</button></div>`;
    $('backQuest').onclick=()=>goMission(S.ch,S.mi,false);$('blankSb').onclick=()=>{stop();setCode(P(R`// your code here
`));saveCode()};return}
  const ch=CH[S.ch],m=curM(),k=mkey(S.ch,S.mi),done=!!S.done[k];
  const allDone=chDone(S.ch)===ch.missions.length;
  let html=`<div class="eyebrow">Chapter ${S.ch+1} · ${esc(ch.name)} · Mission ${S.mi+1} of ${ch.missions.length}</div><h2>${esc(m.title)}</h2>`;
  if(S.mi===0)html+=`<p class="intro">${ch.intro}</p>`;
  html+=`<div class="goal"><div class="label">Your goal</div><p>${m.goal}</p></div>`;
  html+=anatHTML(m.anat);html+=HowSteps.html(m.how);
  html+=`<p class="explain">${m.explain}</p>`;if(m.note)html+=`<p class="note">${m.note}</p>`;
  if(done&&justWon){const last=S.mi===ch.missions.length-1;
    html+=`<div class="won"><span><b>Mission complete!</b>${justWon===2?' +10 XP':''}</span><button class="btn" id="nextM">${last?(allDone?'Chapter reward':'Next mission'):'Next mission →'}</button></div>`}
  html+=`<div class="actions">${done&&!justWon?`<button class="btn" id="nextM">Next mission →</button>`:''}<button class="btn ghost" id="hintB">${showHint?'Hide hint':'Hint'}</button>${m.ans?`<button class="btn ghost" id="ansB">${showAns?'Hide answer':'Show answer'}</button>`:''}</div>`;
  if(showHint)html+=`<p class="hint">${esc(m.hint)}</p>`;
  if(showAns&&m.ans)html+=`<div class="ansbox"><pre>${hl(m.ans)}</pre><div class="actions"><button class="btn ghost" id="useAns">Put it in the editor</button></div></div>`;
  html+=`<div class="dots" aria-label="Missions in this chapter">${ch.missions.map((x,i)=>`<button class="dot${S.done[mkey(S.ch,i)]?' done':''}${i===S.mi?' cur':''}" data-mi="${i}" title="${esc(x.title)}" aria-label="Mission ${i+1}: ${esc(x.title)}">${i+1}</button>`).join('')}</div>`;
  card.innerHTML=html;
  $('hintB').onclick=()=>{showHint=!showHint;renderMission()};
  if($('ansB'))$('ansB').onclick=()=>{showAns=!showAns;renderMission()};
  if($('useAns'))$('useAns').onclick=()=>{stop();setCode(m.ans);saveCode();ta.focus()};
  if($('nextM'))$('nextM').onclick=nextMission;
  card.querySelectorAll('.dot').forEach(d=>d.onclick=()=>goMission(S.ch,+d.dataset.mi,false))}
function renderBadge(){const ch=CH[S.ch];const card=$('mission');
  card.innerHTML=`<div class="eyebrow">Chapter ${S.ch+1} complete</div><div class="badge-art">${S.ch+1}</div><h2>${esc(ch.badge)}</h2>
  <p class="explain">You finished <b>${esc(ch.name)}</b>. You can now use:</p><div class="learned">${ch.learned.map(x=>`<code>${esc(x)}</code>`).join('')}</div>
  <p class="note">Try Quick-fire to practice reading code fast, or open the Field guide to review.</p>
  <div class="actions">${S.ch<CH.length-1?`<button class="btn" id="nextCh">Start chapter ${S.ch+2}: ${esc(CH[S.ch+1].name)}</button>`:`<button class="btn" id="toSb">Open the sandbox</button>`}<button class="btn ghost" id="stay">Back to the chapter</button></div>`;
  if($('nextCh'))$('nextCh').onclick=()=>goMission(S.ch+1,0,false);if($('toSb'))$('toSb').onclick=openSandbox;
  $('stay').onclick=()=>{justWon=false;renderMission()}}
function nextMission(){const ch=CH[S.ch];
  if(S.mi<ch.missions.length-1){goMission(S.ch,S.mi+1,true);return}
  if(chDone(S.ch)===ch.missions.length){renderBadge();return}
  const mi=ch.missions.findIndex((_,i)=>!S.done[mkey(S.ch,i)]);goMission(S.ch,mi,false)}
function goMission(ci,mi,sequential){
  const carry=sequential&&CH[ci].missions[mi].keep?ta.value:null;
  stop();S.inSandbox=false;S.ch=ci;S.mi=mi;showHint=false;showAns=false;justWon=false;
  const k=mkey(ci,mi);const m=curM();
  const code=S.codes[k]??carry??m.start;setCode(code);if(carry&&!S.codes[k])S.codes[k]=carry;
  save();clearCon();cw(`Mission: ${esc(m.title)}`,'sys');renderMem(null);status('','Ready','');
  renderChapters();renderMission();buttons();
  if(window.innerWidth<820)$('mission').scrollIntoView({behavior:'smooth',block:'start'})}
function openSandbox(){stop();S.inSandbox=true;setCode(S.sandbox||SANDBOX);save();clearCon();cw('Sandbox: free play. Nothing is checked here.','sys');renderMem(null);status('','Ready','');renderChapters();renderMission();buttons()}
function afterRun(ok){if(S.inSandbox||!compiled)return;
  const info=M?M.info():{};const ctx=makeCtx({ok,out:runOut,src:runSrc,warnings:[...(compiled.warnings||[]),...runWarns],info,prog:compiled.prog,stepDepth});
  const m=curM(),k=mkey(S.ch,S.mi);let good=false;try{good=!!m.check(ctx)}catch(e){}
  if(!good||S.done[k]){if(good){justWon=1;renderMission()}return}
  S.done[k]=true;S.xp+=10;justWon=2;
  cw('✓ Mission complete! +10 XP','win');
  const ch=CH[S.ch];if(chDone(S.ch)===ch.missions.length&&!S.badges[S.ch]){S.badges[S.ch]=true;S.xp+=25;cw(`★ Chapter ${S.ch+1} complete: ${esc(ch.badge)} badge +25 XP`,'win')}
  save();renderXP();renderChapters();renderMission();const card=$('mission');card.classList.remove('pop');void card.offsetWidth;card.classList.add('pop')}

/* ---------- arcade ---------- */
const rnd=(a,b)=>a+Math.floor(Math.random()*(b-a+1)),pick=a=>a[Math.floor(Math.random()*a.length)];
const QT=[
 ()=>{const a=rnd(7,29),b=rnd(2,5);return {body:`int a = ${a}, b = ${b};\ncout << a / b;`,why:'Both are int, so the decimal part is chopped off.'}},
 ()=>{const a=rnd(10,40),b=rnd(3,7);return {body:`cout << ${a} % ${b};`,why:'% gives the remainder after dividing.'}},
 ()=>{const x=rnd(2,9),y=rnd(2,6);return {body:`int x = ${x};\nx += ${y};\nx *= 2;\ncout << x;`,why:'Each line updates x in turn: add first, then double.'}},
 ()=>{const i=rnd(3,9);return {body:`int i = ${i};\ncout << i++ << " " << i;`,why:'i++ hands over the old value, then adds 1.'}},
 ()=>{const i=rnd(3,9);return {body:`int i = ${i};\ncout << ++i << " " << i;`,why:'++i adds 1 first, then hands over the new value.'}},
 ()=>{const w=pick(['dragon','pixel','quest','sword','castle','wizard']);return {body:`string s = "${w}";\ncout << s.length();`,why:'length() counts the characters.'}},
 ()=>{const n=rnd(3,6);return {body:`for (int i = 0; i < ${n}; i++) {\n    cout << i;\n}`,why:`Starts at 0 and stops before ${n}. No spaces are printed.`}},
 ()=>{const a=rnd(2,4),b=rnd(2,5);return {body:`int count = 0;\nfor (int i = 0; i < ${a}; i++) {\n    for (int j = 0; j < ${b}; j++) {\n        count++;\n    }\n}\ncout << count;`,why:`The inner loop runs ${b} times for each of the ${a} outer rounds.`}},
 ()=>{const x=rnd(1,9),y=rnd(1,9);return {body:`bool b = ${x} > ${y};\ncout << b;`,why:'cout prints true as 1 and false as 0.'}},
 ()=>{const x=rnd(1,20);return {body:`int hp = ${x};\ncout << (hp > 10 ? "safe" : "danger");`,why:'? : gives the first answer when the condition is true, the second when false.'}},
 ()=>{const n=rnd(2,4),z=rnd(1,9);const items=Array.from({length:n},()=>rnd(1,9));return {body:`vector<int> v = {${items.join(', ')}};\nv.push_back(${z});\ncout << v.size();`,inc:['vector'],why:'size() counts items, and push_back adds one.'}},
 ()=>{const arr=Array.from({length:5},()=>rnd(1,50));const k=rnd(1,4);return {body:`int a[5] = {${arr.join(', ')}};\ncout << a[${k}];`,why:'Indexes start at 0, so a[1] is the second number.'}},
 ()=>{const x=pick([5,7,9,11,13]);return {body:`double d = ${x} / 2;\ncout << d;`,why:'Two ints divide first and lose the decimal; only then is the result stored in d.'}},
 ()=>{const k=rnd(1,5);const c=pick(['A','a','M']);return {body:`char ch = '${c}';\nch += ${k};\ncout << ch;`,why:'A char is a number underneath, so + moves along the alphabet.'}},
 ()=>{const x=rnd(10,30),y=rnd(3,7);return {body:`int n = ${x};\nwhile (n > 0) {\n    n -= ${y};\n}\ncout << n;`,why:'The loop stops at the first value that is 0 or below.'}},
 ()=>{const a=rnd(1,9),b=rnd(1,9);return {body:`cout << ${a} << ${b};`,why:'cout never adds spaces for you.'}},
 ()=>{const w=pick(['KNIGHT','ROGUE','WIZARD','GOBLIN']);const k=rnd(0,w.length-1);return {body:`string s = "${w}";\ncout << s[${k}];`,why:'s[0] is the first letter.'}},
 ()=>{const x=rnd(1,20);return {body:`int x = ${x};\nif (x > 10) cout << "big";\nelse cout << "small";`,why:'Compare x with 10.'}},
 ()=>{const n=rnd(2,7);return {pre:`int twice(int n) {\n    return n * 2 + 1;\n}`,body:`cout << twice(${n});`,why:'The call is replaced by the value it returns.'}},
 ()=>{const x=rnd(2,6);return {pre:`void bump(int n) {\n    n += 10;\n}`,body:`int score = ${x};\nbump(score);\ncout << score;`,why:'Without &, bump changes its own copy only.'}},
 ()=>{const x=rnd(2,6);return {pre:`void bump(int& n) {\n    n += 10;\n}`,body:`int score = ${x};\nbump(score);\ncout << score;`,why:'With &, n is another name for score itself.'}},
 ()=>{const a=rnd(1,5),b=rnd(1,5);return {body:`string s = "${a}";\ns += "${b}";\ncout << s;`,why:'+= on strings joins text; it does not add numbers.'}},
 ()=>{const x=rnd(2,9);return {body:`int x = ${x};\nint* p = &x;\n*p = *p * 3;\ncout << x;`,why:'*p is x itself, so this triples x.'}},
 ()=>{const n=rnd(3,5),c=pick(['*','#','o']);return {body:`for (int i = 0; i < ${n}; i++)\n    cout << "${c}";\ncout << "!";`,why:'Without braces, only the next statement belongs to the loop.'}},
 ()=>{const n=rnd(4,9);return {body:`int total = 0;\nfor (int i = 1; i <= ${n}; i++) {\n    if (i % 2 == 0) continue;\n    total += i;\n}\ncout << total;`,why:'continue skips the even numbers, so only odd ones are added.'}},
];
function makeQ(){for(let tries=0;tries<8;tries++){const t=pick(QT)();const src=P(t.body,{inc:t.inc,pre:t.pre});const r=CPP.runAll(src,null,20000);if(!r.ok)continue;
  const show=t.pre?`${t.pre}\n\nint main() {\n${t.body.split('\n').map(l=>'    '+l).join('\n')}\n}`:t.body;return {show,ans:r.out.trim(),why:t.why}}}
const norm=s=>s.replace(/\s+$/,'').replace(/^\s+/,'');
let F={on:false,score:0,streak:0,left:90,q:null,misses:[],int:null};
function fireStage(){const st=$('fStage');
  if(!F.on&&!F.q){const ex=makeQ();st.innerHTML=`<div class="example"><div class="label" style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)">Example round</div><pre class="snip">${hl(ex.show)}</pre><p class="fb" style="margin:0">It prints <code>${esc(ex.ans)}</code>. ${esc(ex.why)}</p></div><div class="actions"><button class="btn" id="fGo">Start a 90-second round</button></div>`;$('fGo').onclick=fireStart;return}
  if(!F.on){st.innerHTML=`<p class="q">Time! You scored ${F.score}.${F.score>=S.best&&F.score>0?' New best!':''}</p>${F.misses.length?`<p class="lede" style="margin:0">Review the ones you missed:</p><ul class="misses">${F.misses.map(m=>`<li><pre class="snip">${hl(m.show)}</pre><span>Prints <code>${esc(m.ans)}</code>${m.got?` · you wrote <code>${esc(m.got)}</code>`:''}. ${esc(m.why)}</span></li>`).join('')}</ul>`:'<p class="fb good">No misses. Clean round.</p>'}<div class="actions"><button class="btn" id="fGo">Play again</button></div>`;$('fGo').onclick=fireStart;return}
  st.innerHTML=`<p class="q">What does this print?</p><pre class="snip">${hl(F.q.show)}</pre><div class="fterm"><span>output ›</span><input id="fIn" aria-label="Type the exact output" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></div><p class="fb" id="fFb"></p><div class="actions"><button class="btn ghost" id="fSkip">Skip</button></div>`;
  const inp=$('fIn');inp.focus();inp.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();fireAnswer(inp.value)}};$('fSkip').onclick=()=>fireAnswer(null)}
function fireStats(){$('fScore').textContent=F.score;$('fStreak').textContent=F.streak;$('fBest').textContent=S.best||0;$('fTime').textContent=F.left;$('fTimer').style.width=(F.left/90*100)+'%'}
function fireStart(){F={on:true,score:0,streak:0,left:90,q:makeQ(),misses:[],int:null};fireStats();fireStage();
  F.int=setInterval(()=>{F.left--;fireStats();if(F.left<=0){clearInterval(F.int);F.on=false;if(F.score>(S.best||0)){S.best=F.score;save()}fireStats();fireStage()}},1000)}
function fireAnswer(v){if(!F.on)return;const q=F.q;const fb=$('fFb');
  if(v!==null&&norm(v)===norm(q.ans)){F.streak++;F.score+=10+Math.min(F.streak-1,5)*2;fb.className='fb good';fb.textContent='Correct!'+(F.streak>1?` Streak ×${F.streak}`:'')}
  else{F.streak=0;F.misses.push({...q,got:v});fb.className='fb bad';fb.innerHTML=`It prints <code>${esc(q.ans)}</code>. ${esc(q.why)}`}
  fireStats();const delay=fb.classList.contains('good')?550:2200;const inp=$('fIn');inp.disabled=true;
  setTimeout(()=>{if(!F.on)return;F.q=makeQ();fireStage()},delay)}

/* ---------- field guide ---------- */
const G=[
 {sec:'Output & input',cards:[
  {c:'cout <<',what:'Prints to the console. Chain several values with more <<. Nothing is added between them, not even spaces.',ex:[['cout << "Score: " << 42 << endl;','prints Score: 42 and ends the line']]},
  {c:'endl  and  "\\n"',what:'Both end the line. \\n goes inside text; endl goes between <<.',ex:[['cout << "one\\ntwo" << endl;','two lines from one cout']]},
  {c:'cin >>',what:'Waits for the keyboard and stores what was typed. Reads one word or number; stops at spaces.',ex:[['int age;\ncin >> age;\ncout << age * 2;','type a number in the console']]},
  {c:'getline',what:'Reads a whole line, spaces included. After a cin >>, add cin.ignore(); first to skip the leftover Enter.',ex:[['string line;\ngetline(cin, line);\ncout << "[" << line << "]";','type a sentence']]},
 ]},
 {sec:'Variables & math',cards:[
  {c:'Declare a variable',what:'Type, name, starting value. Create it once; after that, assign without the type.',ex:[['int coins = 10;\ncoins = coins + 5;\ncout << coins;','prints 15']]},
  {c:'+  -  *  /  %',what:'Math operators. int / int drops the decimal part. % is the remainder.',ex:[['cout << 17 / 5 << " " << 17 % 5 << " " << 17.0 / 5;','3 2 3.4']]},
  {c:'++  --  +=  -=',what:'Shortcuts for changing a variable by itself.',ex:[['int lvl = 1;\nlvl++;\nlvl += 3;\ncout << lvl;','prints 5']]},
  {c:'const',what:'A variable whose value can never change. Name it in ALL_CAPS.',ex:[['const double PI = 3.14159;\ncout << PI * 2 * 2;','area of a circle with radius 2']]},
  {c:'sqrt  pow  abs',what:'Math functions from <cmath>. They work with doubles.',inc:['cmath'],ex:[['cout << sqrt(16) << " " << pow(2, 10) << " " << abs(-7);','4 1024 7']]},
  {c:'to_string  stoi',what:'Turn a number into text, or text into a number.',ex:[['string s = "Level " + to_string(3);\nint n = stoi("42");\ncout << s << " " << n + 1;','Level 3 43']]},
 ]},
 {sec:'Decisions',cards:[
  {c:'if / else if / else',what:'Runs the first block whose condition is true.',ex:[['int hp = 35;\nif (hp > 50) {\n    cout << "healthy";\n} else if (hp > 20) {\n    cout << "hurt";\n} else {\n    cout << "critical";\n}','prints hurt']]},
  {c:'==  !=  <  >  <=  >=',what:'Comparisons give true or false. == compares; = stores.',ex:[['int a = 3;\ncout << (a == 3) << (a != 3) << (a < 10);','prints 101']]},
  {c:'&&  ||  !',what:'and, or, not. Combine conditions; use parentheses to make the order clear.',ex:[['bool key = true;\nint lvl = 4;\nif (key && lvl >= 3) cout << "open";','prints open']]},
  {c:'switch',what:'Jumps to a matching case. Every case needs break; or it falls through to the next one.',ex:[['int day = 2;\nswitch (day) {\n    case 1: cout << "Mon"; break;\n    case 2: cout << "Tue"; break;\n    default: cout << "?";\n}','prints Tue']]},
  {c:'rand()',what:'A pseudo-random number. rand() % 6 + 1 gives 1 to 6. Call srand(time(0)) once at the start for different numbers each run.',inc:['cstdlib','ctime'],ex:[['srand(time(0));\ncout << rand() % 6 + 1;','a dice roll']]},
 ]},
 {sec:'Loops',cards:[
  {c:'while',what:'Repeats while the condition is true. Something inside must change it.',ex:[['int n = 3;\nwhile (n > 0) {\n    cout << n << " ";\n    n--;\n}','3 2 1']]},
  {c:'for',what:'Start; keep going while; step. The usual way to count.',ex:[['for (int i = 0; i < 5; i++) {\n    cout << i << " ";\n}','0 1 2 3 4']]},
  {c:'do … while',what:'Like while, but checks at the end, so the body always runs at least once. Good for menus.',ex:[['int n = 10;\ndo {\n    cout << n;\n} while (n < 5);','prints 10 once']]},
  {c:'break  continue',what:'break leaves the loop. continue skips to the next round.',ex:[['for (int i = 1; i <= 10; i++) {\n    if (i == 6) break;\n    if (i % 2 == 0) continue;\n    cout << i;\n}','prints 135']]},
  {c:'Nested loops',what:'A loop inside a loop. The inner one runs fully for each round of the outer one.',ex:[['for (int r = 1; r <= 3; r++) {\n    for (int c = 1; c <= 3; c++) cout << r * c << " ";\n    cout << endl;\n}','a times table']]},
 ]},
 {sec:'Functions',cards:[
  {c:'void function',what:'A named block of code that does a job and returns nothing. Define it above main.',pre:'void banner() {\n    cout << "=== QUEST ===" << endl;\n}',ex:[['banner();\nbanner();','call it twice']]},
  {c:'return a value',what:'The type before the name is what comes back.',pre:'int add(int a, int b) {\n    return a + b;\n}',ex:[['cout << add(2, 3);','prints 5']]},
  {c:'& reference parameter',what:'Without & the function gets a copy. With & it works on the caller\'s variable.',pre:'void addGold(int& gold, int amount) {\n    gold += amount;\n}',ex:[['int gold = 10;\naddGold(gold, 5);\ncout << gold;','prints 15']]},
  {c:'Prototype',what:'Declares a function above main so you can write its body below. Ends with ;',ex:[['// int area(int w, int h);   <- above main\n// int area(int w, int h) { return w * h; }   <- below main\ncout << "see the Functions chapter";','']]},
 ]},
 {sec:'Collections',cards:[
  {c:'Array',what:'Fixed number of boxes in a row. Indexes run from 0 to size − 1.',ex:[['int s[3] = {7, 8, 9};\ncout << s[0] << s[2];','prints 79']]},
  {c:'vector',what:'An array that grows. Needs #include <vector>.',inc:['vector'],ex:[['vector<int> v;\nv.push_back(4);\nv.push_back(2);\ncout << v.size() << " " << v[1];','prints 2 2']]},
  {c:'Range-for',what:'Visit every element in order, no index needed. Add & to change elements in place.',inc:['vector'],ex:[['vector<int> v = {1, 2, 3};\nfor (int& x : v) x *= 10;\nfor (int x : v) cout << x << " ";','10 20 30']]},
  {c:'string tools',what:'length(), s[i], substr(start, count), find(text), += to add text.',ex:[['string s = "dragon";\ncout << s.length() << " " << s[0] << " " << s.substr(1, 3);','6 d rag']]},
  {c:'sort',what:'Sorts a vector from smallest to biggest. Needs #include <algorithm>.',inc:['vector','algorithm'],ex:[['vector<int> v = {5, 1, 4};\nsort(v.begin(), v.end());\nfor (int x : v) cout << x;','prints 145']]},
 ]},
 {sec:'Structs & pointers',cards:[
  {c:'struct',what:'Your own type made of named fields. Ends with };',pre:'struct Item {\n    string name;\n    int price;\n};',ex:[['Item sword = {"Sword", 50};\nsword.price -= 10;\ncout << sword.name << " " << sword.price;','Sword 40']]},
  {c:'&x  address-of',what:'Where a variable lives in memory.',ex:[['int x = 5;\ncout << &x;','an address like 0x7ffd...']]},
  {c:'int* p  pointer',what:'Stores an address. *p follows it to read or change the value.',ex:[['int x = 5;\nint* p = &x;\n*p = 8;\ncout << x;','prints 8']]},
  {c:'nullptr',what:'A pointer that points at nothing. Check before using * on it.',ex:[['int* p = nullptr;\nif (p == nullptr) cout << "empty";','prints empty']]},
  {c:'->',what:'Reach a field through a pointer to a struct. p->hp is short for (*p).hp.',pre:'struct Mob {\n    int hp;\n};',ex:[['Mob m = {20};\nMob* p = &m;\np->hp -= 5;\ncout << m.hp;','prints 15']]},
 ]},
];
const ERRS=[
 ["expected ';' before '…'",'A statement is missing its semicolon.','Look at the end of the line before the one reported, and add ;'],
 ["'x' was not declared in this scope",'C++ has never seen that name here: a typo, a variable created inside other { }, or a missing #include.','Check spelling (names are case-sensitive), declare it with a type first, or add the right #include.'],
 ["'cout' was not declared … did you mean 'std::cout'?",'The standard library names live in std.','Add using namespace std; below the #include lines, or write std::cout.'],
 ["expected '}' at end of input",'A { never got closed.','Count your braces. Each { needs a matching }.'],
 ["cannot convert 'string' to 'int'",'You put text where a number belongs.','Remove the quotes, change the variable type, or convert with stoi().'],
 ["no match for 'operator+' (operand types are 'string' and 'int')",'You tried to add a number to text.','Convert the number first: "Level " + to_string(n)'],
 ["no match for 'operator<<' … 'vector<int>'",'cout can\'t print a whole vector or struct.','Loop over it and print each element or field.'],
 ["too few arguments to function …",'The call doesn\'t pass the number of values the function expects.','Match the parameter list exactly.'],
 ["assignment of read-only variable",'You tried to change a const.','Remove const, or don\'t change it.'],
 ["warning: suggest parentheses around assignment used as truth value",'You wrote = in a condition where you meant ==.','Use == to compare.'],
 ["warning: … is used uninitialized",'You read a variable before giving it a value. It holds garbage.','Give it a starting value when you create it.'],
 ["Segmentation fault (core dumped)",'The program touched memory it doesn\'t own: usually a null or unset pointer, or going far past the end of an array.','Check pointers before using *, and keep indexes between 0 and size − 1.'],
 ["Floating point exception (core dumped)",'A whole-number division or % by zero.','Check the divisor is not 0 before dividing.'],
 ["undefined reference to 'main'",'The program has no main function, or it is misspelled.','Every program needs int main() { ... }'],
];
const TYPES=[['int','whole numbers, about ±2.1 billion','int lives = 3;',4],['double','numbers with decimals','double speed = 2.5;',8],['bool','true or false','bool alive = true;',1],['char','one character','char grade = \'A\';',1],['string','text of any length','string name = "Pixel";',32],['long long','very big whole numbers','long long stars = 9000000000;',8]];
function renderGuide(){const g=$('guide');
  const anat=[['#include <iostream>',1],['using namespace std;',2],['',0],['int main() {',3],['    int score = 10;',4],['    cout << "Score: " << score << endl;',5],['    return 0;',6],['}',0]];
  g.innerHTML=`<div><h2>Field guide</h2><p class="lede">Everything from the quest on one page. Press <b>Try</b> on any example to open it in the sandbox and run it.</p></div>
  <section class="gsec"><h3>How a C++ program runs</h3><p>C++ is a compiled language: your text is translated into machine code before anything runs. Errors can happen at each stage, and the console tells you which.</p>
   <div class="panel pipe">${[['1','main.cpp','You write C++ source code as plain text.',''],['2','g++ compiler','Checks the code follows the rules, then translates it to machine code.','Compile errors stop here. Warnings let it continue.'],['3','linker','Joins your code with the libraries it uses, like iostream.','Link errors: a missing main or function body.'],['4','./main runs','The CPU runs main from top to bottom.','Crashes, endless loops and wrong answers happen here.']].map(s=>`<div class="stage"><span class="n">${s[0]}</span><h4>${s[1]}</h4><p>${s[2]}</p>${s[3]?`<span class="fail${s[0]==='2'?'':' w'}">${s[3]}</span>`:''}</div>`).join('')}</div></section>
  <section class="gsec"><h3>Anatomy of a program</h3><div class="panel anatomy"><pre>${anat.map(([l,n])=>`<span class="al"${n?` data-n="${n}"`:''}>${hl(l)||' '}</span>`).join('')}</pre><ol>
   <li><b>Directive.</b> Copies in the iostream library so you can use cout and cin.</li><li><b>Namespace.</b> Lets you write cout instead of std::cout.</li><li><b>main.</b> Where every program starts. It returns an int to the operating system.</li><li><b>Variable.</b> A box named score holding the int 10.</li><li><b>Output.</b> Sends text and the value of score to the console, then ends the line.</li><li><b>Return 0.</b> Tells the operating system the program finished without problems.</li></ol></div></section>
  <section class="gsec"><h3>Types at a glance</h3><div class="panel tbl"><table><thead><tr><th>Type</th><th>Holds</th><th>Example</th><th>Bytes</th></tr></thead><tbody>${TYPES.map(t=>`<tr><td><code>${t[0]}</code></td><td>${t[1]}</td><td><code>${esc(t[2])}</code></td><td><div class="bytes" title="${t[3]} bytes">${'<i></i>'.repeat(Math.min(t[3],16))}${t[3]>16?'<span style="font-size:12px;color:var(--muted);margin-left:4px">'+t[3]+'</span>':''}</div></td></tr>`).join('')}</tbody></table></div></section>
  ${G.map((s,si)=>`<section class="gsec"><h3>${esc(s.sec)}</h3><div class="cards">${s.cards.map((c,ci)=>`<div class="card panel"><h4>${esc(c.c)}</h4><p>${esc(c.what)}</p>${c.pre?`<div class="exrow"><pre>${hl(c.pre)}</pre></div>`:''}<div class="ex">${c.ex.map((x,xi)=>`<div class="exrow"><div class="top"><pre>${hl(x[0])}</pre><button class="try" data-g="${si}-${ci}-${xi}">Try</button></div>${x[1]?`<small>${esc(x[1])}</small>`:''}</div>`).join('')}</div></div>`).join('')}</div></section>`).join('')}
  <section class="gsec"><h3>Error decoder</h3><p>What the compiler says, what it means, and how to fix it.</p><div class="errs">${ERRS.map(e=>`<div class="panel errc"><div class="m">${esc(e[0])}</div><div><div class="w">${esc(e[1])}</div><div class="f">${esc(e[2])}</div></div></div>`).join('')}</div></section>`;
  g.querySelectorAll('.try').forEach(b=>b.onclick=()=>{const [si,ci,xi]=b.dataset.g.split('-').map(Number);const c=G[si].cards[ci];const code=P(c.ex[xi][0],{inc:c.inc,pre:c.pre});
    S.inSandbox=true;S.sandbox=code;save();switchTab('quest');stop();setCode(code);clearCon();cw('Loaded from the field guide. Press Run or Step.','sys');renderMem(null);status('','Ready','');renderChapters();renderMission();buttons()})}

/* ---------- tabs ---------- */
function switchTab(t){document.querySelectorAll('.tabs button').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===t));
  ['quest','fire','guide'].forEach(x=>$('tab-'+x).hidden=x!==t);if(t==='quest')syncEd();if(t==='fire'&&!F.on)fireStage()}
document.querySelector('.tabs').addEventListener('click',e=>{const b=e.target.closest('button');if(b)switchTab(b.dataset.tab)});
document.addEventListener('keydown',e=>{if(e.key==='F10'&&!$('tab-quest').hidden&&document.activeElement!==ta){e.preventDefault();stepBtn()}});

/* ---------- boot ---------- */
renderXP();renderChapters();renderGuide();fireStats();
if(S.inSandbox)setCode(S.sandbox||SANDBOX);else setCode(S.codes[mkey(S.ch,S.mi)]??curM().start);
renderMission();renderMem(null);buttons();
cw(S.inSandbox?'Sandbox: free play. Nothing is checked here.':(Object.keys(S.done).length?`Welcome back. Mission: ${esc(curM().title)}`:'Welcome to C++ Quest. Read your mission, then press Run.'),'sys');
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>{syncEd();paintMarks()});
})();

