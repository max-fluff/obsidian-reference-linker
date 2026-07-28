'use strict';

// Excel number formats. A cell stores a double and the sheet shows this code applied to it —
// read without it, a currency column is bare integers and a percentage is 0.4.

// The codes Excel does not write out because every reader is expected to know them. A file may
// still override one, and its own numFmt wins: the ids are shared, the codes are not.
const BUILTIN = {
  0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00',
  9: '0%', 10: '0.00%', 11: '0.00E+00', 12: '# ?/?', 13: '# ??/??',
  14: 'm/d/yyyy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy',
  18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss', 22: 'm/d/yyyy h:mm',
  37: '#,##0 ;(#,##0)', 38: '#,##0 ;[Red](#,##0)',
  39: '#,##0.00;(#,##0.00)', 40: '#,##0.00;[Red](#,##0.00)',
  45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mmss.0', 48: '##0.0E+0', 49: '@',
};

// One pass over a code, yielding each token with whether it is a literal. Everything that
// quotes, escapes or brackets has to be recognised here or a ';' inside one splits the code and
// an 'm' inside one is read as a month.
function* tokens(code) {
  for (let i = 0; i < code.length;) {
    const ch = code[i];
    if (ch === '"') {
      const end = code.indexOf('"', i + 1);
      const to = end < 0 ? code.length : end;
      yield { literal: true, text: code.slice(i + 1, to) };
      i = to + 1;
    } else if (ch === '\\') {
      yield { literal: true, text: code[i + 1] || '' };
      i += 2;
    } else if (ch === '_') {
      // A width reservation: the next character is not drawn, only its width is.
      yield { literal: true, text: ' ' };
      i += 2;
    } else if (ch === '*') {
      // A fill repeated to the column width, which a preview has no width to fill.
      i += 2;
    } else if (ch === '[') {
      const end = code.indexOf(']', i);
      const to = end < 0 ? code.length : end;
      yield { bracket: code.slice(i + 1, to) };
      i = to + 1;
    } else {
      yield { text: ch };
      i += 1;
    }
  }
}

// The sections a code states, in order. Excel reads them as positive, negative, zero, text.
function sections(code) {
  const out = [[]];
  for (const t of tokens(code)) {
    if (!t.literal && !t.bracket && t.text === ';') out.push([]);
    else out[out.length - 1].push(t);
  }
  return out;
}

// A bracket is a colour, a condition, an elapsed-time unit or a currency. Only the last carries
// anything to draw: "[$€-x-euro]" is a euro sign, "[Red]" is not a word.
const CURRENCY = /^\$([^-]*)/;
const bracketText = (body) => {
  const m = CURRENCY.exec(body);
  return m ? m[1] : '';
};

const DATE_CHARS = /[ymdhs]/i;
const isDate = (parts) => parts.some((t) => !t.literal && !t.bracket && DATE_CHARS.test(t.text));

const pad = (n, w) => String(Math.floor(Math.abs(n))).padStart(w, '0');

// Excel counts days from 1899-12-30: its calendar wrongly contains 1900-02-29, and starting on
// the 30th is what absorbs that off-by-one for every date after it.
const dateOf = (serial) => new Date(Math.round((serial - 25569) * 86400000));

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const LONG_AMPM = /^am\/pm$/i;
const SHORT_AMPM = /^a\/p$/i;

// A run of the same date letter is one token: "mmm" is a month name, "mm" a padded number. The
// AM/PM marker is taken whole first — its M would otherwise be read as a month.
function dateParts(parts) {
  const spelled = (at, n) => parts.slice(at, at + n)
    .map((p) => (p.literal || p.bracket !== undefined ? ' ' : p.text)).join('');
  const out = [];
  for (let i = 0; i < parts.length;) {
    const t = parts[i];
    const marker = LONG_AMPM.test(spelled(i, 5)) ? 5 : SHORT_AMPM.test(spelled(i, 3)) ? 3 : 0;
    if (marker && !t.literal && t.bracket === undefined) {
      out.push({ ampm: marker === 3 });
      i += marker;
    } else if (t.literal || t.bracket !== undefined || !DATE_CHARS.test(t.text)) {
      out.push(t);
      i += 1;
    } else {
      const last = out[out.length - 1];
      if (last && last.date && last.text[0].toLowerCase() === t.text.toLowerCase()) last.text += t.text;
      else out.push({ date: true, text: t.text });
      i += 1;
    }
  }
  return out;
}

function formatDate(serial, parts) {
  const d = dateOf(serial);
  if (Number.isNaN(d.getTime())) return null;
  const run = dateParts(parts);
  const twelve = run.some((t) => t.ampm !== undefined);
  const hours = twelve ? d.getUTCHours() % 12 || 12 : d.getUTCHours();
  // "m" is minutes next to an hour or a second and a month everywhere else. The neighbour is
  // the nearest date token, not the nearest token: a separator sits between them.
  const near = (i, step) => {
    for (let j = i + step; j >= 0 && j < run.length; j += step) {
      if (run[j].date) return run[j].text[0].toLowerCase();
    }
    return '';
  };
  let out = '';
  run.forEach((t, i) => {
    if (t.bracket !== undefined) return;
    if (t.ampm !== undefined) { out += (d.getUTCHours() < 12 ? 'AM' : 'PM').slice(0, t.ampm ? 1 : 2); return; }
    if (!t.date) { out += t.text; return; }
    const code = t.text.toLowerCase();
    const n = code.length;
    if (code[0] === 'y') out += n <= 2 ? pad(d.getUTCFullYear() % 100, 2) : String(d.getUTCFullYear());
    else if (code[0] === 'd') {
      if (n >= 4) out += DAYS[d.getUTCDay()];
      else if (n === 3) out += DAYS[d.getUTCDay()].slice(0, 3);
      else out += n === 2 ? pad(d.getUTCDate(), 2) : String(d.getUTCDate());
    } else if (code[0] === 'h') out += n >= 2 ? pad(hours, 2) : String(hours);
    else if (code[0] === 's') out += n >= 2 ? pad(d.getUTCSeconds(), 2) : String(d.getUTCSeconds());
    else if (code[0] === 'm' && (near(i, -1) === 'h' || near(i, 1) === 's')) {
      out += n >= 2 ? pad(d.getUTCMinutes(), 2) : String(d.getUTCMinutes());
    } else if (n >= 4) out += MONTHS[d.getUTCMonth()];
    else if (n === 3) out += MONTHS[d.getUTCMonth()].slice(0, 3);
    else out += n === 2 ? pad(d.getUTCMonth() + 1, 2) : String(d.getUTCMonth() + 1);
  });
  return out;
}

const PLACEHOLDER = /[0#?]/;

// The digits a section asks for, and where its literals sit around them.
function shape(parts) {
  let digits = '';
  let percent = 0;
  const before = [];
  const after = [];
  for (const t of parts) {
    if (t.bracket !== undefined) { (digits ? after : before).push(bracketText(t.bracket)); continue; }
    if (t.literal) { (digits ? after : before).push(t.text); continue; }
    if (t.text === '%') { percent += 1; (digits ? after : before).push('%'); continue; }
    if (PLACEHOLDER.test(t.text) || t.text === '.' || (t.text === ',' && digits)) { digits += t.text; continue; }
    (digits ? after : before).push(t.text);
  }
  return { digits, percent, before: before.join(''), after: after.join('') };
}

function digitsOf(value, digits) {
  const dot = digits.indexOf('.');
  const whole = (dot < 0 ? digits : digits.slice(0, dot)).replace(/,/g, '');
  const fraction = dot < 0 ? '' : digits.slice(dot + 1).replace(/,/g, '');
  const decimals = (fraction.match(/[0#?]/g) || []).length;
  const grouped = /,/.test(dot < 0 ? digits : digits.slice(0, dot));
  // A comma after the last placeholder scales rather than groups: "#,##0," is thousands.
  const scale = (/[0#?](,+)$/.exec(digits.replace(/\..*$/, '')) || [, ''])[1].length;

  let n = Math.abs(value) / Math.pow(1000, scale);
  const text = n.toFixed(decimals);
  let [int, frac] = text.split('.');
  const least = (whole.match(/0/g) || []).length;
  if (int === '0' && !least) int = '';
  else int = int.padStart(least, '0');
  if (grouped) int = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return int + (frac ? '.' + frac : '');
}

// Notations whose digits are not laid out left to right, so the placeholder walk below would
// print nonsense rather than nothing: the caller falls back to the plain number for these.
const UNTRANSLATED = (parts) => parts.some((t) => !t.literal && t.bracket === undefined
  && (/[eE/]/.test(t.text)));

// A section applied to one number. Null when the section states no digits at all, so the caller
// can fall back rather than print an empty cell.
function applySection(value, parts) {
  if (isDate(parts)) return formatDate(value, parts);
  if (UNTRANSLATED(parts)) return null;
  const { digits, percent, before, after } = shape(parts);
  // A section may be nothing but a word — "nil" for the zero of a ledger — and that word is
  // what the sheet shows. Only a section with neither digits nor text has nothing to say.
  if (!PLACEHOLDER.test(digits)) return before + after || null;
  return before + digitsOf(value * Math.pow(100, percent), digits) + after;
}

// A double's exact decimal expansion is not what a sheet shows: Excel's General format keeps 11
// significant digits, and without that a plain 0.57 reads as 0.56999999999999995.
const plain = (n) => String(Number(n.toPrecision(11)));

// `value` shown as `code` says. General, a fraction and scientific notation are not translated
// and come back as the plain number; null only when the value is not a number at all, which is
// the caller's cue to keep whatever text the cell holds.
function format(value, code) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (!code || /general/i.test(code)) return plain(n);
  const parts = sections(code);
  // A negative section states its own sign, usually as parentheses; without one it is prefixed.
  const negative = n < 0 && parts.length > 1;
  const zero = n === 0 && parts.length > 2;
  const out = applySection(n, parts[negative ? 1 : zero ? 2 : 0]);
  if (out === null) return plain(n);
  // Accounting codes pad both ends to line a column up, and a preview has no column to line up.
  return (n < 0 && !negative ? '-' + out : out).trim();
}

const codeFor = (id, custom) => (custom && custom[id] !== undefined ? custom[id] : BUILTIN[id]) || null;

module.exports = { format, codeFor, BUILTIN };
