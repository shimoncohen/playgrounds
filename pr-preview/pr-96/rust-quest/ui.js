/* Everything a learner can type (code, identifiers echoed in diagnostics, program output) reaches the page as textContent
   or through esc(), never as raw markup; only authored mission text goes through innerHTML. */
(()=>{
'use strict';
const UI=window.RQUI=window.RQUI||{};
const esc=UI.esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
UI.tick=s=>HowSteps.tick(String(s??''),esc);
// the bare Playground and the feature-request form from the page footer (shared/nav.js): neither URL ever carries learner code
UI.PLAY='https://play.rust-lang.org/';
const idea=document.querySelector('a.nv-idea');
UI.ISSUE=idea?idea.getAttribute('href'):null;

const h=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;};
const rich=(tag,cls,text)=>{const e=h(tag,cls);e.innerHTML=UI.tick(text);return e;};
const link=(href,text)=>{const a=h('a','linkbtn',text);a.href=href;a.target='_blank';a.rel='noopener noreferrer';return a;};

// ev is RQ.evalMission's {c, result}; this never reads the learner's code, so no link or card can carry it
UI.result=(root,ev)=>{
  root.textContent='';
  const c=ev.c;
  if(!c){root.append(h('p','note',ev.result));return;}
  if(c.status==='ok'||c.status==='limit'||c.status==='panic'){
    root.append(h('h4',null,c.status==='ok'?'Your program ran':c.status==='panic'?'Your program stopped with a panic':'Your program was stopped'));
    if(c.status==='limit')root.append(h('p','note','It ran for too long, so Rust Quest stopped it. Is something calling itself forever?'));
    if(c.stdout)root.append(h('pre','stdout',c.stdout));else root.append(h('p','note','It printed nothing.'));
    if(c.stderr){root.append(h('h4',null,'Error output'));root.append(h('pre','stderr',c.stderr.replace(/^\n+/,'')));}
    if(c.status!=='limit')root.append(h('p','note','Exit code '+c.exit+'.'));
    return;
  }
  if(c.status==='error'){
    root.append(h('h4',null,'The compiler would stop here'));
    for(const e of c.errors){
      const d=h('div','diag');
      d.append(h('div','id',(e.code||e.lint?(e.code||e.lint)+' · ':'')+'line '+e.line));
      d.append(rich('p',null,e.msg));
      const tip=RQ.diag.tip(e.code||e.lint);
      if(tip)d.append(rich('p','note',tip));
      root.append(d);
    }
    return;
  }
  const card=h('div','card2');
  if(c.status==='unsupported'){
    const f=c.unsupported.feature;
    card.append(rich('h4',null,'Rust Quest does not model `'+f+'` (line '+c.unsupported.line+')'));
    card.append(rich('p',null,RQ.diag.hint(f)));
    const row=h('div','actions');
    const copy=h('button','btn ghost','Copy code');copy.type='button';copy.dataset.act='copy';
    row.append(copy,link(UI.PLAY,'Try it in the Rust Playground'));
    if(UI.ISSUE)row.append(link(UI.ISSUE,'Ask for it in a feature request'));
    card.append(row);
  }else{
    card.append(h('h4',null,'This is a Rust Quest bug, not your code'));
    card.append(h('p',null,'Something broke inside the checker on a program it should handle. Your mission is safe: nothing was counted.'));
    if(UI.ISSUE){const row=h('div','actions');row.append(link(UI.ISSUE,'Report it in a feature request'));card.append(row);}
  }
  root.append(card);
};
})();
