'use strict';

// Excel's number formats. A sheet stores 32370 and shows $32,370.00; the code that turns one
// into the other is the whole difference between a readable preview and a wall of raw doubles.

const { describe, it, assert } = require('../src/shared/testing/harness');
const { format, codeFor } = require('../src/formats/xlsx-format');

describe('a number under its format code', () => {
  it('groups thousands and keeps the decimals the code asks for', () => {
    assert.strictEqual(format(1234.5, '#,##0.00'), '1,234.50');
    assert.strictEqual(format(1234.5, '#,##0'), '1,235');
    assert.strictEqual(format(5, '0'), '5');
    assert.strictEqual(format(5, '0.000'), '5.000');
  });

  it('multiplies a percentage by a hundred, which is what makes it a percentage', () => {
    assert.strictEqual(format(0.401, '0.00%'), '40.10%');
    assert.strictEqual(format(1, '0%'), '100%');
  });

  it('reads the accounting format Excel writes for a currency column', () => {
    // Quoted literals, an escaped bracket, a fill and two width reservations, all in one code.
    const money = '_("$"* #,##0.00_);_("$"* \\(#,##0.00\\);_("$"* "-"??_);_(@_)';
    assert.strictEqual(format(32370, money), '$32,370.00');
    assert.strictEqual(format(-32370, money), '$(32,370.00)');
  });

  it('takes the section that fits the sign, and signs the number itself when there is none', () => {
    assert.strictEqual(format(-1234, '#,##0 ;(#,##0)'), '(1,234)');
    assert.strictEqual(format(-5, '0.00'), '-5.00');
    assert.strictEqual(format(0, '0.00;(0.00);"nil"'), 'nil');
  });

  it('scales by a comma that follows the last digit rather than grouping by it', () => {
    assert.strictEqual(format(1234567, '#,##0,'), '1,235');
  });

  it('draws a currency stated in brackets and nothing else that is', () => {
    // "[$€-x-euro]" is a symbol; "[Red]" and a condition are not words to print.
    assert.strictEqual(format(1234, '[$€-x-euro]#,##0.00'), '€1,234.00');
    assert.strictEqual(format(1234, '[Red]#,##0'), '1,234');
  });

  it('gives the plain number for a code it does not translate', () => {
    assert.strictEqual(format(12, 'General'), '12');
    assert.strictEqual(format(12, ''), '12');
    assert.strictEqual(format(0.5, '# ?/?'), '0.5');
    assert.strictEqual(format(1234, '0.00E+00'), '1234');
  });

  it('keeps Excel\'s eleven significant digits, so a stored double reads as it was typed', () => {
    // The engine's own shortest round-trip form is not enough: it prints this one in full, and
    // a sum that came out as 0.1 + 0.2 then reads as a bug rather than as the 0.3 Excel shows.
    assert.strictEqual(format('0.30000000000000004', 'General'), '0.3');
  });

  it('is null only when the value is not a number, which is the cell\'s own text', () => {
    assert.strictEqual(format('abc', '0.00'), null);
  });
});

describe('a date under its format code', () => {
  const day = 46231; // 2026-07-28

  it('spells the date the way the sheet does, not the way this machine does', () => {
    assert.strictEqual(format(day, 'm/d/yyyy'), '7/28/2026');
    assert.strictEqual(format(day, 'mm/dd/yy'), '07/28/26');
    assert.strictEqual(format(day, 'd-mmm-yy'), '28-Jul-26');
    assert.strictEqual(format(day, 'dddd, mmmm d, yyyy'), 'Tuesday, July 28, 2026');
  });

  it('reads m as minutes beside an hour and as a month everywhere else', () => {
    // The same letter means both, and only its neighbours say which — with a separator in
    // between, so the neighbour is the nearest date token rather than the nearest token.
    assert.strictEqual(format(day + 0.5, 'm/d/yy h:mm'), '7/28/26 12:00');
    assert.strictEqual(format(0.5, 'mm:ss'), '00:00');
  });

  it('turns the clock over for AM/PM instead of printing its letters as dates', () => {
    // The M of AM/PM is a month character; taken letter by letter it renders as one.
    assert.strictEqual(format(0.75, 'h:mm AM/PM'), '6:00 PM');
    assert.strictEqual(format(0.75, 'h:mm'), '18:00');
    assert.strictEqual(format(0.3, 'h:mm A/P'), '7:12 A');
  });
});

describe('codeFor', () => {
  it('knows the codes a file leaves out', () => {
    assert.strictEqual(codeFor('4', {}), '#,##0.00');
    assert.strictEqual(codeFor('9', {}), '0%');
  });

  it('lets the file override one of them, since the ids are shared and the codes are not', () => {
    assert.strictEqual(codeFor('19', { 19: 'm/d/yyyy' }), 'm/d/yyyy');
  });

  it('is null for an id nobody defined', () => {
    assert.strictEqual(codeFor('200', {}), null);
  });
});
