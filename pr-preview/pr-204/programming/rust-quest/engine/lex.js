/* Token: {k, v, line, col} (1-based, el/ec is where it ends), k one of ident, kw, int, float, str, char, lifetime, punct,
   err, eof. Ints carry decimal text in v plus an optional suffix; str and char carry the decoded text. An unclosed string,
   char or block comment becomes one err token at its start, which the parser reports. DOM-free. */
(()=>{
'use strict';
const RQ=globalThis.RQ=globalThis.RQ||{};
const KW=new Set('as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while'.split(' '));
const P3=['<<=','>>=','...','..='],P2=['::','->','=>','==','!=','<=','>=','&&','||','+=','-=','*=','/=','%=','^=','&=','|=','<<','>>','..'];
const P1='+-*/%^!&|=<>@.,;:#$?~()[]{}';
const idStart=c=>/[\p{L}_]/u.test(c),idPart=c=>/[\p{L}\p{N}_]/u.test(c);
const ESC={n:'\n',t:'\t',r:'\r','0':'\0','\\':'\\','"':'"',"'":"'"};

RQ.lex=src=>{
  const cs=Array.from(src),n=cs.length,out=[];
  let i=0,line=1,col=1;
  const adv=()=>{const c=cs[i++];if(c==='\n'){line++;col=1;}else col++;return c;};
  const tok=(k,v,l,c,x)=>{const t={k,v,line:l,col:c,el:line,ec:col};if(x)Object.assign(t,x);out.push(t);};
  const err=(msg,l,c)=>{tok('err',msg,l,c);i=n;};
  function escape(){
    const c=adv();
    if(c in ESC)return ESC[c];
    if(c==='x'){const h=(cs[i]||'')+(cs[i+1]||'');if(!/^[0-7][0-9a-fA-F]$/.test(h))return null;adv();adv();return String.fromCharCode(parseInt(h,16));}
    if(c==='u'&&cs[i]==='{'){let h='';adv();while(i<n&&cs[i]!=='}'&&h.length<7)h+=adv();if(cs[i]!=='}'||!/^[0-9a-fA-F_]+$/.test(h))return null;adv();const cp=parseInt(h.replace(/_/g,''),16);return cp>0x10FFFF||(cp>=0xD800&&cp<0xE000)?null:String.fromCodePoint(cp);}
    return null;
  }
  function str(l,c,byte){
    adv();let v='';
    while(i<n){
      const ch=adv();
      if(ch==='"'){tok('str',v,l,c,byte?{byte:true}:null);return;}
      if(ch!=='\\'){v+=ch;continue;}
      if(cs[i]==='\n'||(cs[i]==='\r'&&cs[i+1]==='\n')){while(i<n&&/\s/.test(cs[i]))adv();continue;}
      const e=escape();if(e===null){err('unknown character escape',l,c);return;}v+=e;
    }
    err('unclosed double quote string',l,c);
  }
  function raw(l,c,byte){
    let hashes=0;while(cs[i]==='#'){hashes++;adv();}
    if(cs[i]!=='"'){err('malformed raw string',l,c);return;}
    adv();let v='';
    for(;;){
      if(i>=n){err('unterminated raw string',l,c);return;}
      const ch=adv();
      if(ch==='"'){let h=0;while(h<hashes&&cs[i]==='#'){h++;adv();}if(h===hashes){tok('str',v,l,c,byte?{byte:true}:null);return;}v+='"'+'#'.repeat(h);continue;}
      v+=ch;
    }
  }
  function quote(l,c,byte){
    adv();
    const a=cs[i];
    if(a==='\\'){adv();const e=escape();if(e===null||cs[i]!=="'"){err('malformed character literal',l,c);return;}adv();tok('char',e,l,c,byte?{byte:true}:null);return;}
    if(a!==undefined&&cs[i+1]==="'"&&a!=="'"&&a!=='\n'){adv();adv();tok('char',a,l,c,byte?{byte:true}:null);return;}
    if(!byte&&a!==undefined&&idStart(a)){let v='';while(i<n&&idPart(cs[i]))v+=adv();tok('lifetime',v,l,c);return;}
    err('unterminated character literal',l,c);
  }
  const rawAhead=()=>{let j=i+(cs[i]==='b'?1:0);if(cs[j]!=='r')return false;j++;while(cs[j]==='#')j++;return cs[j]==='"';};
  function number(l,c){
    let v='',kind='int',suffix='';
    const p=cs[i]==='0'&&/[xob]/.test(cs[i+1]||'')?cs[i+1]:'';
    if(p){adv();adv();const re=p==='x'?/[0-9a-fA-F_]/:p==='o'?/[0-7_]/:/[01_]/;let d='';while(i<n&&re.test(cs[i]))d+=adv();
      const base={x:16,o:8,b:2}[p];
      if(i<n&&/[0-9]/.test(cs[i])){err('invalid digit for a base '+base+' literal',line,col);return;}
      if(!d.replace(/_/g,'')){err('no valid digits found for number',l,c);return;}
      v=BigInt((p==='x'?'0x':p==='o'?'0o':'0b')+d.replace(/_/g,'')).toString();}
    else{
      const digits=()=>{let d='';while(i<n&&/[0-9_]/.test(cs[i]))d+=adv();return d;};
      v=digits().replace(/_/g,'');
      if(cs[i]==='.'&&cs[i+1]!=='.'&&!(cs[i+1]&&idStart(cs[i+1]))){kind='float';adv();v+='.'+digits().replace(/_/g,'');}
      if((cs[i]==='e'||cs[i]==='E')&&/[0-9+-]/.test(cs[i+1]||'')&&(/[0-9]/.test(cs[i+1])||/[0-9]/.test(cs[i+2]||''))){kind='float';v+=adv();if(cs[i]==='+'||cs[i]==='-')v+=adv();v+=digits().replace(/_/g,'');}
    }
    if(i<n&&idStart(cs[i])){while(i<n&&idPart(cs[i]))suffix+=adv();}
    if(suffix==='f32'||suffix==='f64')kind='float';
    if(kind==='int'&&BigInt(v)>=1n<<128n){err('integer literal is too large',l,c);return;}
    tok(kind,v,l,c,suffix?{suffix}:null);
  }
  if(cs[0]==='#'&&cs[1]==='!'&&cs[2]!=='[')while(i<n&&cs[i]!=='\n')adv();
  while(i<n){
    const c0=cs[i],l=line,c=col;
    if(/\s/.test(c0)){adv();continue;}
    if(c0==='/'&&cs[i+1]==='/'){while(i<n&&cs[i]!=='\n')adv();continue;}
    if(c0==='/'&&cs[i+1]==='*'){
      let depth=0;
      do{
        if(cs[i]==='/'&&cs[i+1]==='*'){depth++;adv();adv();}
        else if(cs[i]==='*'&&cs[i+1]==='/'){depth--;adv();adv();}
        else adv();
      }while(depth>0&&i<n);
      if(depth>0)err('unterminated block comment',l,c);
      continue;
    }
    if(c0==='"'){str(l,c,false);continue;}
    if(c0==="'"){quote(l,c,false);continue;}
    if(c0==='b'&&cs[i+1]==='"'){adv();str(l,c,true);continue;}
    if(c0==='b'&&cs[i+1]==="'"){adv();quote(l,c,true);continue;}
    if(rawAhead()){const byte=c0==='b';adv();if(byte)adv();raw(l,c,byte);continue;}
    if(/[0-9]/.test(c0)){number(l,c);continue;}
    if(idStart(c0)){
      let v='';
      if(c0==='r'&&cs[i+1]==='#'&&cs[i+2]&&idStart(cs[i+2])){v=adv()+adv();}
      while(i<n&&idPart(cs[i]))v+=adv();
      tok(KW.has(v)?'kw':'ident',v,l,c);continue;
    }
    const s3=cs.slice(i,i+3).join(''),s2=s3.slice(0,2);
    if(P3.includes(s3)){adv();adv();adv();tok('punct',s3,l,c);continue;}
    if(P2.includes(s2)){adv();adv();tok('punct',s2,l,c);continue;}
    if(P1.includes(c0)){adv();tok('punct',c0,l,c);continue;}
    adv();tok('err','unknown start of token: '+c0,l,c);
  }
  tok('eof','',line,col);
  return out;
};
})();
