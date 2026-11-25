(()=>{
'use strict';
const SCQ=window.SCQ=window.SCQ||{};
// ================= CURRICULUM =================
// mission: {title, goal, code (shown in goal), anat, answer, explain, hint, check(c), need:[names], pre:'code', expectError:true}
const isArr=Array.isArray;
const logsHave=(c,re)=>c.logs.some(l=>re.test(l));
const decl=(...a)=>SCQ.engine.decl(...a);
const tagOf=(...a)=>SCQ.engine.tagOf(...a);
SCQ.help={decl,tagOf,isArr,logsHave};
SCQ.CH=[];
})();
