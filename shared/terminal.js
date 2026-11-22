(function (root) {
'use strict';
// DOM-free: the page passes its output, run state and file store through deps.
const tokenize=s=>{const out=[];let cur='',q=null,has=false;
  for(let i=0;i<s.length;i++){const c=s[i];
    if(q){if(c==='\\'&&q==='"'&&(s[i+1]==='"'||s[i+1]==='\\')){cur+=s[++i]}else if(c===q)q=null;else cur+=c}
    else if(c==='"'||c==="'"){q=c;has=true}
    else if(/\s/.test(c)){if(cur||has){out.push(cur);cur='';has=false}}
    else cur+=c}
  if(cur||has)out.push(cur);return out};
const NPM_INIT=()=>JSON.stringify({name:'my-app',version:'1.0.0',description:'',main:'index.js',scripts:{test:'echo "Error: no test specified" && exit 1'},keywords:[],author:'',license:'ISC'},null,2)+'\n';

function create(deps){
const {line,esc,tableHTML,fmtArgs,toText,errName,errTip,clearScreen,tryComplete,getRun,setRun,isSync,setSync,store,editor,makeRealm,killRealm}=deps;
const NE=()=>root.NodeEnv||{},makeNodeEnv=(...a)=>(deps.makeNodeEnv||NE().make)(...a),nodeCurl=(...a)=>(deps.nodeCurl||NE().curl)(...a),NODE_VERSION=deps.NODE_VERSION||NE().NODE_VERSION;
let NODE=null,PROC=null;
const TS=!!deps.ts,tsLib=()=>deps.compiler||root.ts,TSC=()=>deps.TSCheck||root.TSCheck,NT=()=>deps.NodeTest||root.NodeTest;
const JSNAME=TS?/\.[jt]s$/:/\.js$/;
// What node --test picks up with no file names, as Node 24 does (.ts too).
const TEST_FILE=/(^|\/)(test\/.+|[^/]*[-_.]test|test-[^/]*|test)\.[jt]s$/;
const dd=p=>TS&&p.split('/').includes('..');
const hasF=k=>Object.prototype.hasOwnProperty.call(store.files,k);
const procOn=()=>!!PROC&&PROC.env.servers.size>0;
const ports=()=>PROC?[...PROC.env.servers.keys()]:[];
const label=()=>PROC?PROC.label:'';
const syncBar=()=>deps.syncBar({on:procOn(),label:label(),ports:ports()});
function stopProc(ctrlC){
  if(!procOn())return false;
  const p=PROC;PROC=null;p.env.stop();syncBar();
  if(ctrlC)line('^C','sys');
  line('Stopped '+esc(p.label),'sys');return true}
function reset(){if(PROC){PROC.env.stop();PROC=null}killRealm(NODE);NODE=null;syncBar()}
function nodeHooks(){const hk={
  out(level,args){const html=level==='table'?tableHTML(args[0]):level==='raw'?esc(args[0]):fmtArgs(args);const text=level==='raw'?args[0]:toText(html);const RUN=getRun();
    line(html,level==='warn'?'warn':level==='error'||(level==='raw'&&args[1]==='stderr')?'err':'');if(RUN&&RUN.out)RUN.out.push(text);if(!isSync()&&RUN&&Date.now()-RUN.t<20000)tryComplete();
    const m=TS&&RUN&&level==='raw'&&!args[1]&&/^ℹ (tests|suites|pass|fail|cancelled|skipped|todo|duration_ms) ([\d.]+)$/.exec(text);if(m)(RUN.tests=RUN.tests||{})[m[1]]=+m[2]},
  asyncErr(e){printNodeErr(e);const RUN=getRun();if(RUN){RUN.ok=false;if(TS)RUN.exitCode=1}if(hk.env)hk.env.stop();syncBar()},clear(){clearScreen()},idle:()=>syncBar(),done:()=>syncBar(),
  exit(c){const RUN=getRun();if(RUN){RUN.ok=c===0;if(TS)RUN.exitCode=c}},sys(t){line(esc(t),'sys')}};
  if(deps.hop)hk.hop=deps.hop;
  if(TS){hk.builtins=api=>NT().make(api);
    hk.transform=(k,s)=>{const c=tsLib();if(!c)throw new Error('The TypeScript compiler is not loaded yet. Run tsc once, then try again.');
      return c.transpileModule(s,{compilerOptions:{module:c.ModuleKind.CommonJS,target:c.ScriptTarget.ES2020,esModuleInterop:true}}).outputText}}
  return hk}
function printNodeErr(e,file){
  if(e&&e.__exit!==undefined)return;
  if(e&&(e.__file||file))line('/home/you/my-app/'+esc(e.__file||file),'sys');
  line(esc(errName(e)),'err');
  if(e&&e.code)line("  code: '"+esc(e.code)+"'",'err');
  line('Node.js '+NODE_VERSION,'sys');
  const tip=errTip(e);if(tip)line('Tip: '+tip.replace(/<\/?b>/g,''),'tip');
}
// t (node --test): the file's spec lines go to t.cap instead of the screen, and t.res() fires when it ends.
function runNode(file,args,code,t){
  const RUN=getRun();
  killRealm(NODE);const hk=nodeHooks();NODE=makeRealm(hk);
  if(t){const o=hk.out,d=hk.done,ae=hk.asyncErr;
    hk.out=(l,a)=>l==='raw'&&!a[1]?t.cap.push(a[0]):o(l,a);
    hk.done=()=>{d();t.res()};hk.asyncErr=e=>{t.err=true;ae(e);t.res()}}
  const env=hk.env=makeNodeEnv(NODE,store,file,args,hk);
  PROC={env,label:RUN.src,ran:{file,code:code!==undefined?code:store.files[file]}};RUN.ran=PROC.ran;
  setSync(true);
  try{env.runMain(file,code)}catch(e){if(e&&e.__exit!==undefined){RUN.ok=e.__exit===0;if(TS)RUN.exitCode=e.__exit}else{printNodeErr(e,file);RUN.ok=false;if(TS)RUN.exitCode=1;if(t)t.err=true}
    if(t){env.stop();t.res()}}
  finally{setSync(false)}
  RUN.server=[...env.servers.keys()];syncBar();
}
// A folder is a marker key "name/" or any key under "name/"; root is always one.
function isDir(k){return k===''||hasF(k+'/')||Object.keys(store.files).some(f=>f.startsWith(k+'/'))}
function parentOf(k){const i=k.replace(/\/$/,'').lastIndexOf('/');return i<0?'':k.slice(0,i)}
function lsNames(dir){
  const pre=dir?dir+'/':'',set=new Set();
  for(const f of store.list()){if(!f.startsWith(pre)||f===pre)continue;const r=f.slice(pre.length),i=r.indexOf('/');set.add(i<0?r:r.slice(0,i+1))}
  return [...set].sort()}
function run(src){
  const a=tokenize(src),c=a[0]||'',args=a.slice(1);
  const RUN={src,mode:'sh',t:Date.now(),cmd:c,args,ok:true,out:[],logs:[]};
  if(TS)Object.assign(RUN,{logs:RUN.out,diags:[],exitCode:0,tests:null,ran:null});
  setRun(RUN);
  const out=(t,cls='')=>{line(esc(t),cls);getRun().out.push(t)};
  const fail=(t)=>{out(t,'err');getRun().ok=false;if(TS)getRun().exitCode=1};
  // Runs fn at once when the compiler is there; otherwise loads it first (a Promise) and drops a result nobody waits for.
  const withTS=fn=>{if(tsLib())return fn();
    line('Loading the TypeScript compiler…','sys');
    return (deps.loadTS||TSC().load)().then(ok=>{if(getRun()!==RUN)return;if(ok&&tsLib())return fn();
      fail('Could not load the TypeScript compiler. Check your internet connection, then run the command again.')})};
  const nodeRun=a=>TS&&(a[0]==='--test'||/\.ts$/.test(a[0]||''))?withTS(()=>nodeCmd(a,out,fail)):nodeCmd(a,out,fail);
  let pend;
  if(procOn()&&(c==='node'||(c==='npm'&&/^(start|test|t|run|run-script)$/.test(args[0]||'')))){
    fail('A program is still running. Press Stop (or Ctrl+C) first. In a real terminal you would open a second tab for curl.');return}
  switch(c){
    case 'help':out('Commands here: ls [dir], cat <file>, pwd, touch <file>, rm <file>, mkdir [-p] <dir>, clear,\nnode <file> [words…], node -e "code", node -v,\nnpm init -y, npm install <package>, npm start, npm run <script>, npm test,\ncurl [-i] [-s] [-X METHOD] [-Z] <url>…'+(TS?'\ntsc [files], node --test [files]':''),'sys');break;
    case 'clear':clearScreen();break;
    case 'pwd':out('/home/you/my-app');break;
    case 'ls':{const d=(args.find(x=>x[0]!=='-')||'').replace(/^\.\/?$/,'').replace(/\/$/,'');
      if(d&&hasF(d)){out(d);break}
      if(d&&!isDir(d)){fail('ls: cannot access \''+d+'\': No such file or directory');break}
      const l=lsNames(d);line(l.map(f=>f==='node_modules'||f.endsWith('/')?'<span class="c-d" style="color:var(--term-dir);font-weight:600">'+esc(f==='node_modules'?'node_modules/':f)+'</span>':JSNAME.test(f)?'<span style="color:var(--term-prompt)">'+esc(f)+'</span>':esc(f)).join('  ')||'<span class="v-u">(empty folder)</span>');getRun().out.push(l.join('  '));break}
    case 'cat':if(!args[0])fail('cat: which file? Try: cat notes.txt');else if(isDir(args[0].replace(/\/$/,'')))fail('cat: '+args[0]+': Is a directory');else if(hasF(args[0]))out(store.files[args[0]].replace(/\n$/,''));else fail('cat: '+args[0]+': No such file or directory');break;
    case 'touch':if(!args[0])fail('touch: missing file name');else if(!isDir(parentOf(args[0])))fail('touch: cannot touch \''+args[0]+'\': No such file or directory');else{if(!hasF(args[0])&&!isDir(args[0]))store.write(args[0],'')}break;
    case 'rm':{const a=args[0]||'';
      if(isDir(a.replace(/\/$/,''))&&a)fail('rm: cannot remove \''+a+'\': Is a directory');
      else if(!hasF(a))fail('rm: cannot remove \''+a+'\': No such file or directory');
      else{store.remove(a);const p=parentOf(a);if(p&&!isDir(p))store.write(p+'/','')}break}
    case 'mkdir':{
      const rec=args.some(x=>x==='-p'||x==='--parents'),a=(args.find(x=>x[0]!=='-')||'').replace(/\/+$/,'');
      const bad=m=>fail('mkdir: cannot create directory \''+a+'\': '+m);
      if(!a){fail('mkdir: missing operand');break}
      if(dd(a)){bad('No such file or directory');break}
      if(!rec){if(isDir(a)||hasF(a))bad('File exists');else if(!isDir(parentOf(a)))bad('No such file or directory');else store.write(a+'/','');break}
      const parts=a.split('/');let p='';
      for(const [i,s] of parts.entries()){p+=(p?'/':'')+s;
        if(hasF(p)){bad('File exists');break}
        if(i===parts.length-1||!isDir(p))store.write(p+'/','')}
      break}
    case 'curl':{
      const r0=RUN;r0.reqs=[];if(PROC){r0.ran=PROC.ran;r0.server=[...PROC.env.servers.keys()]}
      nodeCurl(procOn()?PROC.env:null,args,{
        out(t){if(getRun()===r0)out(t)},
        err(t){if(getRun()===r0)out(t,'err')},
        req(r){r0.reqs.push(r);if(getRun()===r0)line('(took '+r.ms+' ms, virtual)','sys')},
        done(){if(!r0.reqs.length)r0.ok=false;if(getRun()===r0)tryComplete()}});
      break}
    case 'node':pend=nodeRun(args);break;
    case 'npm':pend=runNpm(args,out,fail,nodeRun);break;
    case 'npx':out('npx runs a package\'s command without installing it globally. You will use it for things like npx tsc. Not available in this playground.','tip');break;
    case 'tsc':if(TS)pend=withTS(()=>tscCmd(args,out));else out('tsc is the TypeScript compiler. On your computer: npm install -D typescript, then npx tsc. See the Field guide.','tip');break;
    case 'cd':out('This playground keeps you in ~/my-app. To move between folders, play Shell Quest.','tip');break;
    default:
      if(/[=(){};"'`]|^(let|const|var|console|function)\b/.test(src)){fail('bash: syntax error');line('That looks like JavaScript, but this is the terminal. Put the code in a file and run node file.js, or try: node -e "your code"','tip')}
      else{fail('bash: '+c+': command not found');line('Type help to see the commands this terminal knows.','tip')}
  }
  const done=()=>{deps.renderProject();tryComplete()};
  if(pend&&pend.then)return pend.then(()=>{if(getRun()===RUN)done()});
  done();
}
function nodeCmd(args,out,fail){
  if(!args.length){out('This would open Node\'s interactive console (the REPL). You already know it: it is the > console from chapters 1–10.\nHere, run a file instead: node hello.js','tip');return}
  if(args[0]==='-v'||args[0]==='--version'){out(NODE_VERSION);return}
  if(args[0]==='-e'||args[0]==='--eval'||args[0]==='-p'){if(!args[1]){fail('node: '+args[0]+' requires an argument');return}
    runNode('[eval]',args.slice(2),args[0]==='-p'?'console.log('+args[1]+')':args[1]);return}
  if(TS&&args[0]==='--test')return testCmd(args.slice(1),out,fail);
  if(!hasF(args[0])){
    if(hasF(args[0]+'.js')){runNode(args[0]+'.js',args.slice(1));return}
    out('node:internal/modules/cjs/loader','sys');fail("Error: Cannot find module '/home/you/my-app/"+args[0]+"'");line('Tip: check the file name with ls. Names are case-sensitive.','tip');return}
  if(!(TS?/\.(c?js|json|ts)$/:/\.(c?js|json)$/).test(args[0])){fail(TS?'That is not a JavaScript or TypeScript file. Node runs .js and .ts files.':'That is not a JavaScript file. Node runs .js files.');return}
  if(editor.file()===args[0]&&editor.dirty())line('Heads up: '+esc(args[0])+' has unsaved changes in the editor, so Node runs the last saved version. Press Save (Ctrl+S) first.','tip');
  runNode(args[0],args.slice(1));
}
// Like node --test: each file runs in its own realm, then one summed block and the failing sections follow the spec lines.
async function testCmd(a,out,fail){
  const RUN=getRun();let names=a.filter(x=>x[0]!=='-');
  const miss=names.find(f=>!hasF(f));
  if(miss){fail("Could not find '"+miss+"'");return}
  if(!names.length)names=Object.keys(store.files).filter(k=>TEST_FILE.test(k)&&!/(^|\/)node_modules\//.test(k)).sort();
  const sum={tests:0,suites:0,pass:0,fail:0,cancelled:0,skipped:0,todo:0,duration_ms:0},spec=[],fails=[];let bad=false;
  for(const f of names){
    const t={cap:[],err:false};await new Promise(res=>{t.res=res;runNode(f,[],undefined,t)});
    if(getRun()!==RUN)return;
    const i=t.cap.findIndex(l=>l.startsWith('ℹ tests ')),j=t.cap.indexOf('✖ failing tests:');
    spec.push(...(i<0?t.cap:t.cap.slice(0,i)));
    for(const l of i<0?[]:t.cap.slice(i,i+8)){const m=/^ℹ (\w+) ([\d.]+)/.exec(l);if(m)sum[m[1]]+=+m[2]}
    if(j>=0){if(fails.length)fails.push('');fails.push(...t.cap.slice(j+2))}
    if(i<0){// a file with no test of its own counts as one test, as in Node
      sum.tests++;spec.push((t.err?'✖ ':'✔ ')+f+' (0ms)');
      if(t.err){bad=true;sum.fail++;if(fails.length)fails.push('');fails.push('test at '+f,'✖ '+f+' (0ms)')}else sum.pass++}
  }
  const lines=[...spec];for(const k in sum)lines.push('ℹ '+k+' '+sum[k]);
  if(fails.length)lines.push('','✖ failing tests:','',...fails);
  lines.forEach(l=>out(l));
  RUN.tests=sum;RUN.exitCode=sum.fail||sum.cancelled||bad?1:0;RUN.ok=!RUN.exitCode;
}
// shortcut: compiler flags are ignored, and a missing-file error is the only one printed without a position.
function tscCmd(args,out){
  const RUN=getRun(),named=args.filter(a=>a[0]!=='-').map(a=>a.replace(/^\.\//,'')),files={...store.files};
  const stop=(t,cls,code)=>{out(t,cls);RUN.ok=false;RUN.exitCode=code};
  if(named.length){const m=named.find(f=>!hasF(f));
    if(m)return stop("error TS6053: File '"+m+"' not found.\n  The file is in the program because:\n    Root file specified for compilation",'err',2);
    files['tsconfig.json']=JSON.stringify({files:named})}
  else if(!hasF('tsconfig.json'))return stop('Version '+tsLib().version+'\ntsc: The TypeScript Compiler - Version '+tsLib().version+'\n\nCOMMON COMMANDS\n\n  tsc\n  Compiles the current project (tsconfig.json in the working directory.)\n\n  tsc app.ts util.ts\n  Ignoring tsconfig.json, compiles the specified files with default compiler options.','sys',1);
  const r=TSC().checkProject(files,{node:true});
  RUN.diags=r.diags;
  for(const d of r.diags)out(d.file+'('+d.line+','+d.col+'): error TS'+d.code+': '+d.msg,'err');
  if(r.emit)for(const k of Object.keys(r.js))store.write(k,r.js[k]);
  if(r.diags.length){RUN.ok=false;RUN.exitCode=2}
}
function runNpm(args,out,fail,node){
  const sub=args[0];
  const pj=()=>{try{return JSON.parse(store.files['package.json'])}catch(e){return null}};
  if(!sub){out('npm <command>\n\nUsage:\nnpm init -y        create package.json\nnpm install <pkg>  add a package\nnpm start          run the "start" script\nnpm run <name>     run any script','sys');return}
  if(sub==='-v'||sub==='--version'){out('10.9.2');return}
  if(sub==='init'){if(!args.includes('-y')&&!args.includes('--yes')){out('npm init normally asks you questions (name, version, …). Add -y to accept the defaults: npm init -y','tip');getRun().ok=false;return}
    store.write('package.json',NPM_INIT());out('Wrote to /home/you/my-app/package.json:\n\n'+store.files['package.json']);return}
  if(sub==='install'||sub==='i'||sub==='add'){
    const pkgs=args.slice(1).filter(x=>!x.startsWith('-'));
    if(!pkgs.length){out(store.pkgs.length?'up to date, audited '+store.pkgs.length+' package in 1s':'up to date, audited 0 packages in 1s');return}
    for(const p of pkgs){if(p!=='cowsay'){fail('npm error 404 Not Found - '+p+'\nThis playground only has the cowsay package. On your own computer, npm can install any public package.');return}}
    if(!store.pkgs.includes('cowsay'))store.pkgs.push('cowsay');
    let j=pj();if(!j){j=JSON.parse(NPM_INIT())}
    j.dependencies=Object.assign(j.dependencies||{},{cowsay:'^1.6.0'});store.write('package.json',JSON.stringify(j,null,2)+'\n');
    out('\nadded 1 package, and audited 2 packages in 1s\n\nfound 0 vulnerabilities');return}
  if(sub==='start'||sub==='test'||sub==='t'||sub==='run'||sub==='run-script'){
    const j=pj();if(!j){fail('npm error enoent Could not read package.json\nRun npm init -y first.');return}
    const name=(sub==='run'||sub==='run-script')?args[1]:(sub==='t'?'test':sub);
    const sc=j.scripts||{};
    if(!name){out('Scripts available in my-app via `npm run`:\n'+Object.keys(sc).map(k=>'  '+k+'\n    '+sc[k]).join('\n'));return}
    if(!Object.prototype.hasOwnProperty.call(sc,name)||typeof sc[name]!=='string'){fail('npm error Missing script: "'+name+'"');if(name==='start')line('Tip: add "start": "node cow.js" inside "scripts" in package.json, then save.','tip');return}
    out('\n> '+j.name+'@'+j.version+' '+name+'\n> '+sc[name]+'\n','sys');
    const parts=sc[name].split('&&').map(s=>s.trim());
    const go=i=>{for(;i<parts.length;i++){const t=tokenize(parts[i]);
      if(t[0]==='node'){const keep=getRun(),r=TS?node(t.slice(1)):runNode(t[1],t.slice(2));
        if(r&&r.then)return r.then(()=>getRun()===keep&&keep.ok&&go(i+1));
        if(!keep.ok)return}
      else if(t[0]==='echo'){out(t.slice(1).join(' '))}
      else if(t[0]==='exit'){if(t[1]!=='0'){getRun().ok=false;fail('npm error Lifecycle script `'+name+'` failed with error:\nnpm error code '+(t[1]||1))}return}
      else{fail('sh: '+t[0]+': not available in this playground');return}}};
    return go(0)}
  fail('npm error Unknown command: "'+sub+'"');
}
return {run,stop:stopProc,procOn,reset,label,ports};
}
root.Terminal={create};
})(typeof window !== 'undefined' ? window : globalThis);
