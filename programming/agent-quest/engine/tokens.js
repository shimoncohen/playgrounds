/* Agent Quest token estimate: chars/4, rounded up. A teaching estimate, not a real tokenizer. DOM-free. */
(()=>{
'use strict';
const AQ=globalThis.AQ=globalThis.AQ||{};
AQ.tokens={estimate:t=>Math.ceil(String(t??'').length/4)};
})();
