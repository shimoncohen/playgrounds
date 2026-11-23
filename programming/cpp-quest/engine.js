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
