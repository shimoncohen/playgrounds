/* The file editor panel behind nano/edit/vi/vim. app.js supplies SQ.editorSave(abs,text) and SQ.editorRun(abs,args,stdin).
   Paths and names only ever reach the page through textContent, never innerHTML. */
(function (SQ) {
const $=s=>document.querySelector(s);
const ed=$('#editor'),title=$('#edTitle'),text=$('#edText'),args=$('#edArgs'),stdin=$('#edStdin'),closeBtn=$('#edClose'),cmdIn=$('#cmd');
let abs=null,base='',armT=null;
const isOpen=()=>abs!==null&&!ed.hidden;
const dirty=()=>isOpen()&&text.value!==base;
function disarm(){clearTimeout(armT);closeBtn.textContent='Close'}
function refresh(){if(!dirty())disarm()}
function openEditor(path,content,opts){
  if(isOpen()){
    if(path===abs){if(opts&&opts.fill){text.value=String(content==null?'':content);refresh();try{text.setSelectionRange(text.value.length,text.value.length)}catch(e){}}text.focus();return true} /* fill: Type it for me puts the answer in, unsaved */
    if(dirty()){SQ.ui.addLine(SQ.ui.renderText(`Tip: ${abs.split('/').pop()} has unsaved changes. Save or close ${abs.split('/').pop()} first, then open ${path.split('/').pop()}.`),'tip');SQ.ui.scrollDown();return false}}
  abs=path;title.textContent=path;
  const t=String(content==null?'':content);text.value=t;base=text.value; /* the textarea normalises line breaks itself */
  args.value='';stdin.value='';ed.querySelector('details').open=false;disarm();
  ed.hidden=false;ed.dataset.isNew=String(!!(opts&&opts.isNew));text.focus();try{text.setSelectionRange(text.value.length,text.value.length)}catch(e){}
  text.scrollTop=0;return true}
function closeEditor(force){
  if(!isOpen())return;
  if(!force&&dirty()&&closeBtn.textContent!=='Discard changes?'){closeBtn.textContent='Discard changes?';clearTimeout(armT);armT=setTimeout(disarm,6000);return}
  disarm();ed.hidden=true;abs=null;base='';text.value='';
  if(cmdIn)cmdIn.focus({preventScroll:true})}
function save(){if(!isOpen())return false;const v=text.value;const ok=SQ.editorSave(abs,v);if(ok){base=v;disarm()}return !!ok}
function run(){if(!save())return;SQ.editorRun(abs,args.value.trim(),stdin.value)}
$('#edSave').addEventListener('click',save);
$('#edRun').addEventListener('click',run);
closeBtn.addEventListener('click',()=>closeEditor(false));
$('#edTab').addEventListener('click',()=>{const a=text.selectionStart,b=text.selectionEnd;text.focus();text.setRangeText('  ',a,b,'end');refresh();text.dispatchEvent(new Event('input',{bubbles:true}))});
text.addEventListener('input',()=>{disarm();refresh()}); /* typing cancels a pending discard */
ed.addEventListener('keydown',e=>{
  const mod=e.ctrlKey||e.metaKey,k=e.key;
  if(mod&&(k==='s'||k==='S')){e.preventDefault();save()}
  else if(mod&&k==='Enter'){e.preventDefault();run()}
  else if(k==='Escape'){e.preventDefault();closeEditor(false)}});
SQ.ui.openEditor=openEditor;SQ.ui.closeEditor=closeEditor;
})(window.SQ);
