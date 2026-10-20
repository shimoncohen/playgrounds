(function (SQ) {
/* Stage 2 AST parser: SQ.parseProgram(text) -> List. Recursive descent over SQ.tokenize(text,{dry:true,pos:true}); words keep their raw source for run-time expansion.
   Wired in by Task 6a: exec.js and interp.js run every typed line, script, function body and sourced file through it. Nodes carry src = exact source slice. Errors: code 2, raw:false (syntax) / raw:true (unsupported). */
const MAX_DEPTH=100;
const CLOSERS=new Set(['then','elif','else','fi','do','done','esac','}']);
const REDIR_OPS=new Set(['>','>>','<','2>','2>>','2>&1','>&2','<<','<<-','<<<']);
const NAME=/^[A-Za-z_][A-Za-z0-9_]*$/;
const ASSIGN=/^[A-Za-z_][A-Za-z0-9_]*=/;
const fail=(m,raw)=>Object.assign(new Error(m),{code:2,raw:!!raw});
const bad=t=>fail("syntax error near unexpected token '"+(t===undefined||t==='\n'?'newline':t)+"'");
const eofErr=()=>fail('syntax error: unexpected end of file');
const unsup=x=>fail('this practice shell does not support '+x+' yet',true);
const noRedirs=()=>({out:null,inp:null,err:null,doc:null,herestr:null});

function parseProgram(text){
  const toks=SQ.tokenize(String(text),{dry:true,pos:true});
  if(toks.length>SQ.LIM.STEPS)throw fail('syntax error: program too large');
  let p=0,depth=0,lastEnd=0;
  const tk=()=>toks[p];
  const isOp=(t,v)=>!!t&&t.t==='op'&&t.v===v;
  /* a reserved word is a plain unquoted word at command position (raw equals value) */
  const isWord=(t,v)=>!!t&&t.t==='w'&&t.raw===v&&t.v===v;
  const show=t=>t.t==='op'?t.v:t.raw;
  const next=()=>{const t=toks[p++];lastEnd=t.e;return t};
  const skipNl=()=>{while(isOp(tk(),'\n'))next()};
  const startOf=()=>tk()?tk().s:text.length;
  const mk=(n,s)=>{n.src=text.slice(s,lastEnd);return n};
  const need=v=>{const t=tk();if(!t)throw eofErr();if(!isWord(t,v))throw bad(show(t));return next()};
  const nest=f=>{if(++depth>MAX_DEPTH)throw fail('syntax error: nesting too deep');try{return f()}finally{depth--}};

  /* stops: reserved words / ')' / ';;' that end this list (only checked at the start of an item) */
  function parseList(stops,allowEmpty){
    const s=startOf(),items=[];
    skipNl();
    while(tk()&&!isStop(stops)){
      const andor=parseAndOr();let sep=';';const t=tk();
      if(isOp(t,'&'))throw unsup('&');
      if(isOp(t,';')||isOp(t,'\n')){sep=next().v;skipNl()}
      else if(t&&!isStop(stops))throw bad(show(t));
      items.push({andor,sep})}
    if(!items.length&&!allowEmpty){const t=tk();throw t?bad(show(t)):eofErr()}
    return mk({type:'list',items},s)}
  function isStop(stops){const t=tk();
    if(t.t==='op')return (t.v===')'&&stops.has(')'))||(t.v===';;'&&stops.has(';;'));
    return t.raw===t.v&&stops.has(t.v)}
  function parseAndOr(){
    const s=startOf(),first=parsePipeline(),rest=[];
    while(isOp(tk(),'&&')||isOp(tk(),'||')){const op=next().v;skipNl();if(!tk())throw eofErr();rest.push({op,pipe:parsePipeline()})}
    return mk({type:'andor',first,rest},s)}
  function parsePipeline(){
    const s=startOf();let negate=false;
    while(isWord(tk(),'!')){next();negate=!negate;if(!tk())throw eofErr()}
    const cmds=[parseCommand()];
    while(isOp(tk(),'|')){next();skipNl();if(!tk())throw eofErr();cmds.push(parseCommand())}
    return mk({type:'pipeline',negate,cmds},s)}

  /* one redirect operator at tk(), merged into r (parse() shapes: out/err {path,append,w}, inp token, err {dup}) */
  function redirect(r){const o=next();
    if(o.v==='2>&1'){r.err={dup:true};return}
    if(o.v==='>&2'){r.out={toErr:true,after:!!r.err,pre:r.out&&r.out.path!==undefined?r.out:null};return} /* pre: `> f >&2` still creates f */
    const w=tk();if(!w)throw bad('newline');
    if(w.t!=='w')throw bad(show(w));
    next();
    if(o.v==='<<'||o.v==='<<-')r.doc=o.doc;
    else if(o.v==='<<<')r.herestr=w;
    else if(o.v==='<')r.inp=w;
    else if(o.v[0]==='2')r.err={path:w.v,append:o.v==='2>>',w};
    else r.out={path:w.v,append:o.v==='>>',w}}
  function parseRedirs(){const r=noRedirs();
    while(tk()&&tk().t==='op'&&REDIR_OPS.has(tk().v))redirect(r);return r}

  function parseCommand(){
    const t=tk();if(!t)throw eofErr();
    if(t.t==='arith'){next();return {type:'arith',expr:t.raw,src:text.slice(t.s,t.e)}}
    if(t.t==='cond'){next();return {type:'cond',raw:t.raw,src:text.slice(t.s,t.e)}}
    if(t.t==='op'){
      if(t.v==='(')return nest(parseParen);
      if(REDIR_OPS.has(t.v))return parseSimple();
      throw bad(t.v)}
    const r=t.raw===t.v?t.v:null;
    if(r==='if')return nest(parseIf);
    if(r==='while'||r==='until')return nest(()=>parseWhile(r));
    if(r==='for')return nest(parseFor);
    if(r==='case')return nest(parseCase);
    if(r==='{')return nest(parseGroup);
    if(r==='function')return nest(parseFunction);
    if(r==='select')throw unsup('select');
    if(r==='[[')return parseCond();
    if(r&&CLOSERS.has(r))throw bad(r);
    if(NAME.test(t.raw)&&t.raw===t.v&&isOp(toks[p+1],'(')&&isOp(toks[p+2],')'))return nest(parseFuncDef);
    return parseSimple()}

  function parseSimple(){
    const s=startOf(),n={type:'simple',words:[],assigns:[],out:null,inp:null,err:null,doc:null,herestr:null};
    for(;;){const t=tk();if(!t)break;
      if(t.t==='w'){n.words.push(next());continue}
      if(REDIR_OPS.has(t.v)){redirect(n);continue}
      if(t.v==='('&&n.words.length&&/=$/.test(n.words[n.words.length-1].raw)&&toks[p-1].e===t.s)throw unsup('arrays');
      break}
    if(!n.words.length&&!n.out&&!n.inp&&!n.err&&!n.doc&&!n.herestr){const t=tk();throw t?bad(show(t)):eofErr()}
    /* leading NAME=word items before a command name are prefix assignments (X=1 cmd); a command of assignments only keeps them as words */
    let a=0;while(a<n.words.length&&ASSIGN.test(n.words[a].raw))a++;
    if(a&&a<n.words.length){n.assigns=n.words.slice(0,a).map(w=>({name:w.raw.slice(0,w.raw.indexOf('=')),word:w}));n.words=n.words.slice(a)}
    if(n.doc&&isOp(tk(),'\n'))lastEnd=tk().e; /* the here-document body follows the line break */
    return mk(n,s)}

  function parseIf(){
    const s=startOf();next();const branches=[];let els=null;
    const cond=parseList(new Set(['then']));need('then');
    branches.push({cond,body:parseList(new Set(['elif','else','fi']))});
    for(;;){
      if(isWord(tk(),'elif')){next();const c=parseList(new Set(['then']));need('then');branches.push({cond:c,body:parseList(new Set(['elif','else','fi']))});continue}
      if(isWord(tk(),'else')){next();els=parseList(new Set(['fi']));}
      break}
    need('fi');
    return mk({type:'if',branches,else:els,redirs:parseRedirs()},s)}
  function parseWhile(kind){
    const s=startOf();next();
    const cond=parseList(new Set(['do']));need('do');
    const body=parseList(new Set(['done']));need('done');
    return mk({type:kind,cond,body,redirs:parseRedirs()},s)}
  function parseFor(){
    const s=startOf();next();const t=tk();
    if(!t)throw eofErr();
    if(isOp(t,'('))throw unsup('C-style for loops');
    if(t.t!=='w'||!NAME.test(t.raw)||t.raw!==t.v)throw bad(show(t));
    const v=next().v;let words=null;
    skipNl();
    if(isWord(tk(),'in')){next();words=[];
      while(tk()&&tk().t==='w')words.push(next());
      const e=tk();if(!e)throw eofErr();
      if(!isOp(e,';')&&!isOp(e,'\n'))throw bad(show(e));
      next()}
    else if(isOp(tk(),';'))next();
    skipNl();need('do');
    const body=parseList(new Set(['done']));need('done');
    return mk({type:'for',var:v,words,body,redirs:parseRedirs()},s)}
  function parseCase(){
    const s=startOf();next();const w=tk();
    if(!w)throw eofErr();if(w.t!=='w')throw bad(show(w));
    next();skipNl();need('in');skipNl();
    const arms=[];
    while(tk()&&!isWord(tk(),'esac')){
      if(isOp(tk(),'('))next();
      const patterns=[];
      for(;;){const t=tk();if(!t)throw eofErr();if(t.t!=='w')throw bad(show(t));patterns.push(next());
        if(isOp(tk(),'|')){next();continue}break}
      const c=tk();if(!c)throw eofErr();if(!isOp(c,')'))throw bad(show(c));next();
      const body=parseList(new Set([';;','esac']),true);
      if(isOp(tk(),';;')){next();skipNl()}
      else if(tk()&&!isWord(tk(),'esac'))throw bad(show(tk()));
      arms.push({patterns,body})}
    need('esac');
    return mk({type:'case',word:w,arms,redirs:parseRedirs()},s)}
  function parseGroup(){
    const s=startOf();next();
    const body=parseList(new Set(['}']));need('}');
    return mk({type:'group',body,redirs:parseRedirs()},s)}
  function parseParen(){
    const s=startOf();
    if(isOp(toks[p+1],'(')&&toks[p].e===toks[p+1].s){const a=tryArith(s);if(a)return a}
    next();
    const body=parseList(new Set([')']));
    const c=tk();if(!c)throw eofErr();next();
    return mk({type:'subshell',body,redirs:parseRedirs()},s)}
  /* (( expr )): the ( ( are adjacent and the matching ) ) are adjacent; otherwise it is a subshell that starts with a subshell */
  function tryArith(s){let d=0,q=p;
    for(;q<toks.length;q++){const t=toks[q];
      if(t.t!=='op')continue;
      if(t.v==='(')d++;
      else if(t.v===')'){d--;
        if(d===1&&!(isOp(toks[q+1],')')&&toks[q+1].s===t.e))return null;
        if(d===0){const pr=toks[q-1];
          if(q-1>p+1&&isOp(pr,')')&&pr.e===t.s){
            const expr=text.slice(toks[p+1].e,pr.s).trim();p=q+1;lastEnd=t.e;
            return mk({type:'arith',expr},s)}
          return null}}}
    throw eofErr()}
  function parseCond(){
    const s=startOf(),open=next();
    for(;;){const t=tk();if(!t)throw eofErr();
      if(isWord(t,']]')){const raw=text.slice(open.e,t.s).trim();next();return mk({type:'cond',raw},s)}
      next()}}
  function parseFunction(){
    const s=startOf();next();const t=tk();
    if(!t)throw eofErr();if(t.t!=='w'||!NAME.test(t.raw)||t.raw!==t.v)throw bad(show(t));
    const name=next().v;
    if(isOp(tk(),'(')){next();const c=tk();if(!c)throw eofErr();if(!isOp(c,')'))throw bad(show(c));next()}
    return funcBody(s,name)}
  function parseFuncDef(){const s=startOf(),name=next().v;next();next();return funcBody(s,name)}
  function funcBody(s,name){
    skipNl();const t=tk();if(!t)throw eofErr();
    if(!isWord(t,'{'))throw bad(show(t));
    const body=parseGroup();
    return mk({type:'func',name,body},s)}

  /* a syntax error carries `at`, the source offset of the token it was found at (the end of the text for an unexpected end), so a script can name the line */
  try{
    const list=parseList(new Set(),true);
    if(p<toks.length)throw bad(show(tk()));
    return list}
  catch(e){if(e&&e.code===2&&!e.raw&&e.at===undefined&&/^syntax error/.test(e.message))e.at=tk()?tk().s:text.length;throw e}}
/* the 1-based line of offset `at` in text; an offset at or past the end (unexpected end of file) reports the last line of text */
SQ.lineOf=(text,at)=>{text=String(text);const end=SQ.trimRun(text,'\n').length;at=Math.min(at,Math.max(end-1,0));let n=1;for(let i=text.indexOf('\n');i>=0&&i<at;i=text.indexOf('\n',i+1))n++;return n};
SQ.parseProgram=parseProgram;
})(window.SQ=window.SQ||{});
