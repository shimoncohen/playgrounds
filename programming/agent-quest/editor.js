/* Whatever a learner types stays in memory and in the page (textContent and form values, never markup); it is never saved. Exposes window.AQED. */
(()=>{
'use strict';
const ED=window.AQED=window.AQED||{};
const {el,rove}=AQUI;
const FIELDS=[
  ['goal','Goal','text','What you want done. Context only.'],
  ['files','Files','text','Paths to read, separated by commas.'],
  ['examples','Examples','text','Paths of sample output.'],
  ['use','Use','text','Names of helpers (subagents) or saved commands.'],
  ['plan','Plan','check','Plan first'],
  ['constraints','Constraints','area','One rule per line.'],
  ['donewhen','Done when','text','run COMMAND, read PATH or call TOOL.'],
  ['extra','Extra','text','Context only.']
];
const plural=(n,w)=>n+' '+w+(n===1?'':'s');

ED.create=({tree,fileEl,host,onChange})=>{
  let mission=null,base={},sc=null,edits={},sel=null,inputs={},errs=null,rulesEl=null;

  const serialize=()=>{
    if(!mission||mission.kind!=='prompt')return '';
    const v=k=>inputs[k]?inputs[k].value.trim():'',out=[];
    if(v('goal'))out.push('Goal: '+v('goal'));
    for(const [k,name] of [['files','Files'],['examples','Examples'],['use','Use']])if(v(k))out.push(name+': '+v(k));
    if(inputs.plan&&inputs.plan.checked)out.push('Plan: first');
    for(const l of v('constraints').split('\n'))if(l.trim())out.push('Constraints: '+l.trim());
    if(v('donewhen'))out.push('Done when: '+v('donewhen'));
    if(v('extra'))out.push('Extra: '+v('extra'));
    return out.join('\n');
  };
  const getInput=()=>({prompt:serialize(),files:Object.assign({},edits)});

  function buildForm(){
    host.textContent='';inputs={};
    const form=el('section','promptForm');
    form.append(el('h3','','Your prompt'));
    if(mission.kind==='prompt'){
      for(const [k,name,type,help] of FIELDS.filter(f=>mission.fields.includes(f[0]))){
        const lab=el('label',type==='check'?'chk':'');
        let inp;
        if(type==='area'){inp=el('textarea');inp.rows=3;}
        else{inp=el('input');inp.type=type==='check'?'checkbox':'text';}
        inp.id='pf-'+k;inp.spellcheck=false;inp.autocomplete='off';
        if(type!=='check')inp.maxLength=type==='area'?1500:300;
        inputs[k]=inp;
        if(type==='check')lab.append(inp,document.createTextNode(name+': first'));
        else lab.append(document.createTextNode(name),inp,el('span','hintline',help));
        form.append(lab);
      }
      form.append(el('p','note','Real agents read natural language. The simulator acts only on these lines so checks are exact.'));
    }else{
      const p=el('p','note','This mission sends its own prompt: ');
      p.append(el('code','',mission.prompt||''),document.createTextNode('. Your work is in the files: pick one in the Files panel.'));
      form.append(p);
    }
    errs=el('ul','perrs');errs.id='perrs';errs.setAttribute('aria-live','polite');
    const acts=el('div','actions');
    const run=el('button','btn','Run the agent'),fill=el('button','btn ghost','Type it for me');
    run.type=fill.type='button';run.id='runBtn';run.dataset.act='run';fill.dataset.act='fill';
    acts.append(run,fill);
    const fb=el('div','feedback');fb.id='feedback';fb.setAttribute('aria-live','polite');
    form.append(errs,acts,fb);
    host.append(form);
  }

  function renderTree(){
    const had=tree.contains(document.activeElement);
    tree.textContent='';
    const ul=el('ul');ul.setAttribute('role','listbox');ul.setAttribute('aria-label','Project files');
    for(const p of Object.keys(base).sort()){
      const li=el('li');
      // wbr lets a long path wrap at its slashes; textContent stays the plain path
      const segs=p.split('/');
      segs.forEach((s,i)=>{if(i<segs.length-1)li.append(s+'/',document.createElement('wbr'));else li.append(s);});
      li.append((p in edits?' (edited)':'')+(AQ.editable(p)?'':' (read-only)'));
      li.setAttribute('role','option');li.dataset.path=p;
      li.setAttribute('aria-selected',String(p===sel));li.tabIndex=p===sel?0:-1;
      ul.append(li);
    }
    tree.append(ul);
    if(had){const s=ul.querySelector('[aria-selected="true"]');if(s)s.focus();}
  }

  function renderFile(){
    fileEl.textContent='';
    if(sel===null)return;
    const p=sel,can=AQ.editable(p);
    const head=el('div','fname');
    head.append(el('code','',p),el('span','note',can?'You can edit this file. Edits are for this practice run only.':'Read-only: this is the project the agent works on.'));
    const ta=el('textarea');
    ta.value=p in edits?edits[p]:base[p];ta.readOnly=!can;ta.rows=8;ta.spellcheck=false;ta.maxLength=8000;
    ta.setAttribute('aria-label','Contents of '+p);
    fileEl.append(head,ta);
    if(p==='CLAUDE.md'||AQ.isFolderMemory(p)){
      rulesEl=el('p','rules');fileEl.append(rulesEl);
      const root=p==='CLAUDE.md';
      const upd=()=>{
        const r=AQ.config.memoryRules({memory:ta.value},sc,root),n=r.ignored.length;
        /* only the root file can supply a default check, so a folder file shows neither phrase */
        const sep=root?(r.check?', 1 acts as the default check, ':', no default check, '):'. ';
        rulesEl.textContent=plural(r.rules.length,'line')+' act'+(r.rules.length===1?'s':'')+' as rules'+sep+plural(n,'other line')+' only cost'+(n===1?'s':'')+' tokens.';
      };
      upd();ta.addEventListener('input',upd);
    }
    ta.addEventListener('input',()=>{
      if(!can)return;
      if(ta.value===base[p])delete edits[p];else edits[p]=ta.value;
      renderTree();onChange();
    });
  }

  function select(p){if(p in base){sel=p;renderTree();renderFile();}}
  tree.addEventListener('click',e=>{const li=e.target.closest('[role="option"]');if(li)select(li.dataset.path);});
  tree.addEventListener('keydown',e=>{
    const li=e.target.closest&&e.target.closest('[role="option"]');
    if(li&&(e.key==='Enter'||e.key===' ')){e.preventDefault();select(li.dataset.path);}
  });
  rove(tree,'[role="option"]');
  host.addEventListener('input',()=>onChange());

  return {
    load(m){
      mission=m;sc=AQ.scenarios[m.scenario];base=sc.vfs;edits={};
      sel='CLAUDE.md' in base?'CLAUDE.md':Object.keys(base).sort()[0]||null;
      buildForm();renderTree();renderFile();
    },
    getInput,
    setInput(inp){
      const o=typeof inp==='string'?{prompt:inp,files:{}}:inp||{};
      edits={};
      for(const p of Object.keys(o.files||{}))if(AQ.editable(p)&&p in base&&typeof o.files[p]==='string'&&o.files[p]!==base[p])edits[p]=o.files[p];
      if(mission.kind==='prompt'){
        const f=AQ.config.splitFields(o.prompt||'').fields;
        const set=(k,val)=>{if(inputs[k])inputs[k].value=val;};
        set('goal',f.goal);set('files',f.files.join(', '));set('examples',f.examples.join(', '));set('use',f.use.join(', '));
        set('constraints',f.constraints.join('\n'));set('donewhen',f.donewhen===null?'':f.donewhen);set('extra',f.extra);
        if(inputs.plan)inputs.plan.checked=f.plan;
      }
      renderTree();renderFile();onChange();
    },
    showErrors(list){
      errs.textContent='';
      for(const e of list){const li=el('li','',(e.line??e.file)+': '+e.msg);li.tabIndex=-1;errs.append(li);}
    },
    focusErrors(){if(errs&&errs.firstChild)errs.firstChild.focus();}
  };
};
})();
