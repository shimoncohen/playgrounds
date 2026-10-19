(function (SQ) {
// SQ.fmtPrintf(fmt, args) -> { text, code, err? }: the printf(1) formatting engine, shared by the printf command and (later) awk.
// text is the raw result (a trailing newline is NOT trimmed: the command decides). code is 0, or 1 when something was wrong; err is then
// the message(s) joined with '\n' (bash style: "bash: printf: abc: invalid number" for a bad number, "printf: ..." for a refused format).
// The format repeats while arguments remain; missing arguments read as 0 / empty. Doubles are rounded exactly (round half to even on
// the true binary value, like C), so %.0f of 2.5 is 2 and %.2f of 0.125 is 0.12.
const MAX_OUT = 200000, MAX_W = 1000, I64MAX = (1n << 63n) - 1n, I64MIN = -(1n << 63n);
const ESC = { n: '\n', t: '\t', r: '\r', a: '\x07', b: '\b', f: '\f', v: '\v', e: '\x1b', E: '\x1b', '\\': '\\', '"': '"', "'": "'", '?': '?' };
const OCT = /[0-7]/, HEX = /[0-9a-fA-F]/;

// Expand backslash escapes. mode 'b' (the %b argument) also honours \c, which stops all further output. Unknown escapes stay as typed.
function unescape(s, mode) {
  if (s.indexOf('\\') < 0) return { text: s, stop: false };
  let out = '', i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch !== '\\' || i + 1 >= s.length) { out += ch; i++; continue; }
    const c = s[i + 1];
    if (c === 'c' && mode === 'b') return { text: out, stop: true };
    if (Object.prototype.hasOwnProperty.call(ESC, c)) { out += ESC[c]; i += 2; continue; }
    if (OCT.test(c)) { // \0nnn (up to three digits after the 0) or \nnn
      let j = i + 2, d = c, max = c === '0' ? 3 : 2; // '0' may be followed by three digits, 1-7 by two more
      while (j < s.length && max > 0 && OCT.test(s[j])) { d += s[j]; j++; max--; }
      out += String.fromCharCode(parseInt(d, 8) & 255); i = j; continue;
    }
    if (c === 'x' || c === 'u' || c === 'U') {
      const maxn = c === 'x' ? 2 : c === 'u' ? 4 : 8; let j = i + 2, d = '';
      while (j < s.length && d.length < maxn && HEX.test(s[j])) { d += s[j]; j++; }
      if (d) { const cp = parseInt(d, 16); out += c === 'x' ? String.fromCharCode(cp) : cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : s.slice(i, j); i = j; continue; }
    }
    out += '\\'; i++; // unknown: keep the backslash, the next character is read normally
  }
  return { text: out, stop: false };
}

// %q: bash's backslash quoting; control characters switch to the $'...' form
function shellQuote(s) {
  if (s === '') return "''";
  if (/[\x00-\x1f\x7f]/.test(s)) {
    const m = { '\n': '\\n', '\t': '\\t', '\r': '\\r', '\x07': '\\a', '\b': '\\b', '\f': '\\f', '\v': '\\v', '\x1b': '\\E', '\\': '\\\\', "'": "\\'" };
    return "$'" + s.replace(/[\x00-\x1f\x7f\\']/g, (c) => m[c] || '\\' + ('00' + c.charCodeAt(0).toString(8)).slice(-3)) + "'";
  }
  return s.replace(/[^A-Za-z0-9_@%+=:,./-]/g, '\\$&').replace(/^~/, '\\~');
}

// ---- numbers ----
// Integer argument: decimal, 0xHEX, or 'c / "c (the character code). Anything else is invalid (value 0). Clamped to 64 bits.
function toInt(raw) {
  let m = /^([+-]?)(\d+)$/.exec(raw);
  if (m) {
    if (m[2].replace(/^0+/, '').length > 19) return { v: m[1] === '-' ? I64MIN : I64MAX };
    const v = BigInt(m[2]); const n = m[1] === '-' ? -v : v;
    return { v: n > I64MAX ? I64MAX : n < I64MIN ? I64MIN : n };
  }
  m = /^([+-]?)0[xX]([0-9a-fA-F]+)$/.exec(raw);
  if (m) {
    if (m[2].replace(/^0+/, '').length > 16) return { v: m[1] === '-' ? I64MIN : I64MAX };
    const v = BigInt('0x' + m[2]); const n = m[1] === '-' ? -v : v;
    return { v: n > I64MAX ? I64MAX : n < I64MIN ? I64MIN : n };
  }
  m = /^['"]([\s\S])/u.exec(raw);
  if (m) return { v: BigInt(m[1].codePointAt(0)) };
  return { v: 0n, bad: true };
}
// Floating-point argument: decimal with optional exponent, inf / nan, or 'c.
function toFloat(raw) {
  if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(raw)) return { v: Number(raw) };
  const m = /^([+-]?)(inf|infinity|nan)$/i.exec(raw);
  if (m) return { v: /^nan/i.test(m[2]) ? NaN : m[1] === '-' ? -Infinity : Infinity };
  const i = toInt(raw);
  return i.bad ? { v: 0, bad: true } : { v: Number(i.v) };
}

// Exact decimal rounding of a finite double: m * 2^e * 10^k, rounded half to even, as a BigInt.
function decomp(x) {
  const dv = new DataView(new ArrayBuffer(8)); dv.setFloat64(0, x);
  const hi = dv.getUint32(0), lo = dv.getUint32(4), ex = (hi >>> 20) & 0x7ff;
  const m = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  return ex === 0 ? [m, -1074] : [m | (1n << 52n), ex - 1075];
}
function roundScaled(m, e, k) {
  let num = m, den = 1n;
  if (e >= 0) num <<= BigInt(e); else den <<= BigInt(-e);
  if (k >= 0) num *= 10n ** BigInt(k); else den *= 10n ** BigInt(-k);
  let q = num / den; const twice = 2n * (num % den);
  if (twice > den || (twice === den && (q & 1n))) q++;
  return q;
}
function fixedStr(abs, p) { // %f body of a non-negative finite number
  const [m, e] = decomp(abs);
  let d = roundScaled(m, e, p).toString();
  if (p === 0) return d;
  if (d.length <= p) d = '0'.repeat(p + 1 - d.length) + d;
  return d.slice(0, d.length - p) + '.' + d.slice(d.length - p);
}
function expParts(abs, p) { // p+1 significant digits and the decimal exponent
  if (abs === 0) return { digs: '0'.repeat(p + 1), X: 0 };
  const [m, e] = decomp(abs);
  let X = Math.floor(Math.log10(abs)); if (!Number.isFinite(X)) X = abs < 1 ? -324 : 308;
  for (let tries = 0; tries < 4; tries++) {
    const d = roundScaled(m, e, p - X).toString();
    if (d.length === p + 1) return { digs: d, X };
    X += d.length > p + 1 ? 1 : -1;
  }
  return { digs: roundScaled(m, e, p - X).toString().slice(0, p + 1).padEnd(p + 1, '0'), X };
}
const expSuffix = (X) => (X < 0 ? '-' : '+') + (Math.abs(X) < 10 ? '0' : '') + Math.abs(X);
function expStr(abs, p, alt) {
  const { digs, X } = expParts(abs, p);
  return digs[0] + (p > 0 || alt ? '.' : '') + digs.slice(1) + 'e' + expSuffix(X);
}
function floatBody(conv, abs, prec, alt) {
  const lc = conv.toLowerCase();
  if (lc === 'f') { const s = fixedStr(abs, prec); return alt && prec === 0 ? s + '.' : s; }
  if (lc === 'e') return expStr(abs, prec, alt);
  const P = prec === 0 ? 1 : prec; // %g
  const { X } = expParts(abs, P - 1);
  let s;
  if (X >= -4 && X < P) s = fixedStr(abs, P - 1 - X); else s = expStr(abs, P - 1, alt);
  if (!alt) { // %g drops trailing zeros (and a bare point) unless '#'
    const k = s.indexOf('e'); let mant = k < 0 ? s : s.slice(0, k); const rest = k < 0 ? '' : s.slice(k);
    if (mant.includes('.')) mant = mant.replace(/0+$/, '').replace(/\.$/, '');
    s = mant + rest;
  }
  return s;
}

function pad(body, sign, W, left, zero) {
  const len = body.length + sign.length;
  if (len >= W) return sign + body;
  if (left) return sign + body + ' '.repeat(W - len);
  if (zero) return sign + '0'.repeat(W - len) + body;
  return ' '.repeat(W - len) + sign + body;
}

const DIR = /%([-+#0]*)(\*|\d+)?(?:\.(\*|\d*))?([hlLj]*)([a-zA-Z%])/g;
const CONVS = 'sdiuxXocbqeEfFgG%';
const tooBig = (what) => ({ text: '', code: 1, err: `printf: ${what} too large for this practice shell` });
const tooLong = () => ({ text: '', code: 1, err: 'printf: output too large for this practice shell' });

SQ.fmtPrintf = function (fmt, args) {
  fmt = String(fmt); args = args || [];
  // parse the format once into literals and directives
  const toks = []; let last = 0, m, consumes = false;
  DIR.lastIndex = 0;
  while ((m = DIR.exec(fmt))) {
    if (m.index > last) toks.push({ lit: fmt.slice(last, m.index) });
    last = DIR.lastIndex;
    const [, fl, w, pr, , cv] = m;
    if (cv !== '%' && !CONVS.includes(cv)) return { text: '', code: 1, err: `printf: %${cv}: invalid directive` };
    if (w && w !== '*' && +w > MAX_W) return tooBig('width');
    if (pr && pr !== '*' && +pr > MAX_W) return tooBig('precision');
    if (cv !== '%') consumes = true; // a plain %% takes no argument
    if (w === '*' || pr === '*') consumes = true;
    toks.push({ dir: { fl, w, pr, cv } });
  }
  if (last < fmt.length) toks.push({ lit: fmt.slice(last) });
  const errs = []; let ai = 0, out = [], total = 0, stop = false, guard = 0;
  const take = () => (ai < args.length ? args[ai++] : undefined);
  const num = (raw, f) => { // numeric argument with the bash error for a bad one
    if (raw === undefined) return { v: f ? 0 : 0n };
    const r = f ? toFloat(raw) : toInt(raw);
    if (r.bad) errs.push(`bash: printf: ${raw}: invalid number`);
    return r;
  };
  const emit = (s) => { out.push(s); total += s.length; return total > MAX_OUT; };

  do {
    for (const t of toks) {
      if (t.lit !== undefined) { const u = unescape(t.lit, 'f'); if (emit(u.text)) return tooLong(); continue; }
      const { fl, cv } = t.dir;
      if (cv === '%') { if (emit('%')) return tooLong(); continue; }
      let W = 0, left = fl.includes('-'), prec = null;
      if (t.dir.w === '*') { const r = num(take(), false); const n = Number(r.v); if (Math.abs(n) > MAX_W) return tooBig('width'); if (n < 0) { left = true; W = -n; } else W = n; }
      else if (t.dir.w) W = +t.dir.w;
      if (t.dir.pr === '*') { const r = num(take(), false); const n = Number(r.v); if (n > MAX_W) return tooBig('precision'); prec = n < 0 ? null : n; }
      else if (t.dir.pr !== undefined) prec = t.dir.pr === '' ? 0 : +t.dir.pr;
      const zero = fl.includes('0') && !left, plus = fl.includes('+'), alt = fl.includes('#');
      let s;
      if (cv === 's' || cv === 'b' || cv === 'q' || cv === 'c') {
        let v = take(); if (v === undefined) v = '';
        if (cv === 'b') { const u = unescape(v, 'b'); v = u.text; if (u.stop) stop = true; }
        else if (cv === 'q') v = shellQuote(v);
        else if (cv === 'c') v = v === '' ? '' : String.fromCodePoint(v.codePointAt(0));
        if (cv !== 'c' && prec !== null && v.length > prec) v = v.slice(0, prec);
        s = pad(v, '', W, left, false);
      } else if (cv === 'd' || cv === 'i') {
        const r = num(take(), false); let v = r.v; const neg = v < 0n; if (neg) v = -v;
        let d = prec === 0 && v === 0n ? '' : v.toString();
        if (prec !== null && d.length < prec) d = '0'.repeat(prec - d.length) + d;
        s = pad(d, neg ? '-' : plus ? '+'  : '', W, left, zero && prec === null);
      } else if ('uxXo'.includes(cv)) {
        const r = num(take(), false); const v = BigInt.asUintN(64, r.v);
        let d = prec === 0 && v === 0n ? '' : v.toString(cv === 'u' ? 10 : cv === 'o' ? 8 : 16);
        if (cv === 'X') d = d.toUpperCase();
        if (prec !== null && d.length < prec) d = '0'.repeat(prec - d.length) + d;
        let sign = '';
        if (alt && v !== 0n && (cv === 'x' || cv === 'X')) sign = '0' + cv;
        if (alt && cv === 'o' && d[0] !== '0') d = '0' + d;
        s = pad(d, sign, W, left, zero && prec === null);
      } else { // e E f F g G
        const r = num(take(), true); const x = r.v;
        const neg = x < 0 || Object.is(x, -0);
        const sign = neg ? '-' : plus ? '+'  : '';
        if (!Number.isFinite(x)) {
          let b = Number.isNaN(x) ? 'nan' : 'inf'; if (cv === 'E' || cv === 'F' || cv === 'G') b = b.toUpperCase();
          s = pad(b, Number.isNaN(x) ? (plus ? '+' : '') : sign, W, left, false);
        } else {
          let b = floatBody(cv, Math.abs(x), prec === null ? 6 : prec, alt);
          if (cv === 'E' || cv === 'G') b = b.toUpperCase();
          s = pad(b, sign, W, left, zero);
        }
      }
      if (emit(s)) return tooLong();
      if (stop) break;
    }
  } while (!stop && consumes && ai < args.length && ++guard <= 10000);
  const res = { text: out.join(''), code: errs.length ? 1 : 0 };
  if (errs.length) res.err = errs.join('\n');
  return res;
};
})(window.SQ = window.SQ || {});
