(()=>{
'use strict';
const UI=window.RQUI=window.RQUI||{};
const INDENT='    ';
// [label, text, characters to step back so the caret lands between a pair]
const KEYS=[['&','&'],['&mut','&mut '],["'","'"],['::','::'],['<>','<>',1],['|x|','||',1],['{','{'],['}','}'],[';',';'],['!','!'],['?','?'],['Tab',INDENT]];

UI.editor=({ta,keys,onRun})=>{
  const fire=()=>ta.dispatchEvent(new Event('input'));
  const insert=(text,back)=>{
    const s=ta.selectionStart,e=ta.selectionEnd;
    ta.setRangeText(text,s,e,'end');
    if(back){const p=ta.selectionEnd-back;ta.setSelectionRange(p,p);}
    fire();
  };
  for(const [label,text,back] of KEYS){
    const b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('aria-label','Insert '+label);
    b.addEventListener('click',()=>{ta.focus();insert(text,back);});
    keys.append(b);
  }
  ta.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();onRun();return;}
    if(e.key==='Tab'&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
      e.preventDefault();
      const v=ta.value,s=ta.selectionStart,ls=v.lastIndexOf('\n',s-1)+1;
      if(e.shiftKey){
        const m=v.slice(ls).match(/^ {1,4}/);
        if(m){ta.setRangeText('',ls,ls+m[0].length,'preserve');ta.selectionStart=ta.selectionEnd=Math.max(ls,s-m[0].length);fire();}
      }else insert(INDENT);
      return;
    }
    if(e.key==='Enter'&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&ta.selectionStart===ta.selectionEnd){
      e.preventDefault();
      const v=ta.value,s=ta.selectionStart,ls=v.lastIndexOf('\n',s-1)+1,before=v.slice(ls,s);
      let ind=before.match(/^\s*/)[0];
      if(before.trimEnd().endsWith('{'))ind+=INDENT;
      insert('\n'+ind);
    }
  });
};
})();
