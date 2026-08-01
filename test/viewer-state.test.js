'use strict';

// The embed viewer's state machine: what a button, a key or a newly-counted document does to
// the position and the zoom, and how many CSS px that works out to.

const { describe, it, assert } = require('../src/shared/testing/harness');
const vs = require('../src/viewer-state');

const paged = (over) => vs.initialState(Object.assign({ position: 3, count: 10, paged: true, zoomable: true }, over));

describe('viewer state: position', () => {
  it('starts where the block points', () => {
    assert.strictEqual(paged().position, 3);
  });

  it('clamps a position past the end of the document', () => {
    assert.strictEqual(paged({ position: 99 }).position, 10);
  });

  it('leaves a position alone while the count is unknown', () => {
    // A recording's position is a second, and nothing counts seconds — clamping to a count of
    // zero would drag every timecode back to the start of the file.
    assert.strictEqual(vs.initialState({ position: 90, count: 0 }).position, 90);
  });

  it('steps and stops at both ends', () => {
    const st = vs.reduce(paged(), { type: 'next' });
    assert.strictEqual(st.position, 4);
    assert.strictEqual(vs.reduce(paged({ position: 1 }), { type: 'prev' }).position, 1);
    assert.strictEqual(vs.reduce(paged({ position: 10 }), { type: 'next' }).position, 10);
  });

  it('returns the same state when nothing moved, so nothing re-renders', () => {
    const at1 = paged({ position: 1 });
    assert.strictEqual(vs.reduce(at1, { type: 'prev' }), at1);
  });

  it('goes to a typed position, and ignores what is not one', () => {
    assert.strictEqual(vs.reduce(paged(), { type: 'goto', value: 7 }).position, 7);
    const st = paged();
    assert.strictEqual(vs.reduce(st, { type: 'goto', value: NaN }), st);
    assert.strictEqual(vs.reduce(st, { type: 'goto', value: '' }), st);
  });

  it('ends at the last position only once the count is known', () => {
    assert.strictEqual(vs.reduce(paged(), { type: 'last' }).position, 10);
    const unknown = paged({ count: 0 });
    assert.strictEqual(vs.reduce(unknown, { type: 'last' }), unknown);
  });

  it('pulls the position in when a late count says the document is shorter', () => {
    const st = vs.reduce(paged({ position: 8 }), { type: 'count', value: 5 });
    assert.strictEqual(st.count, 5);
    assert.strictEqual(st.position, 5);
  });

  it('leaves a format that does not page alone', () => {
    const st = vs.initialState({ position: 2, count: 10, paged: false });
    assert.strictEqual(vs.reduce(st, { type: 'next' }), st);
    assert.strictEqual(vs.reduce(st, { type: 'goto', value: 9 }), st);
  });
});

describe('viewer state: zoom', () => {
  it('starts at 100% with nothing declared', () => {
    assert.strictEqual(paged().zoom, 100);
  });

  it('reads what the block declared', () => {
    assert.strictEqual(paged({ zoom: '150%' }).zoom, 150);
    assert.strictEqual(paged({ zoom: '150' }).zoom, 150);
    assert.strictEqual(paged({ zoom: 'fit' }).zoom, vs.FIT);
    assert.strictEqual(paged({ zoom: 'wide' }).zoom, 100);
  });

  it('clamps a declared zoom to the ladder’s ends', () => {
    assert.strictEqual(paged({ zoom: '5%' }).zoom, vs.ZOOM_STEPS[0]);
    assert.strictEqual(paged({ zoom: '9000%' }).zoom, vs.ZOOM_STEPS[vs.ZOOM_STEPS.length - 1]);
  });

  it('walks the ladder and stops at its ends', () => {
    assert.strictEqual(vs.reduce(paged(), { type: 'zoomIn' }).zoom, 125);
    assert.strictEqual(vs.reduce(paged(), { type: 'zoomOut' }).zoom, 75);
    const top = paged({ zoom: '300%' });
    assert.strictEqual(vs.reduce(top, { type: 'zoomIn' }), top);
  });

  it('walks the ladder from 100% when the zoom is “fit”', () => {
    assert.strictEqual(vs.reduce(paged({ zoom: 'fit' }), { type: 'zoomIn' }).zoom, 125);
  });

  it('toggles fit against 100%', () => {
    const fitted = vs.reduce(paged(), { type: 'fit' });
    assert.strictEqual(fitted.zoom, vs.FIT);
    assert.strictEqual(vs.reduce(fitted, { type: 'fit' }).zoom, 100);
  });

  it('leaves a format that does not zoom alone', () => {
    const st = vs.initialState({ position: 1, paged: true, zoomable: false });
    assert.strictEqual(vs.reduce(st, { type: 'zoomIn' }), st);
    assert.strictEqual(vs.reduce(st, { type: 'fit' }), st);
  });

  it('writes back the way it reads', () => {
    assert.strictEqual(vs.formatZoom(150), '150%');
    assert.strictEqual(vs.formatZoom(vs.FIT), 'fit');
    assert.strictEqual(vs.parseZoom(vs.formatZoom(150)), 150);
    assert.strictEqual(vs.parseZoom(vs.formatZoom(vs.FIT)), vs.FIT);
  });
});

describe('viewer state: keys', () => {
  const key = (k, mod) => vs.keyAction(Object.assign({ key: k }, mod));

  it('pages with the arrows and the page keys', () => {
    assert.deepStrictEqual(key('ArrowLeft'), { type: 'prev' });
    assert.deepStrictEqual(key('PageDown'), { type: 'next' });
    assert.deepStrictEqual(key('Home'), { type: 'first' });
    assert.deepStrictEqual(key('End'), { type: 'last' });
  });

  it('zooms with +/- and resets with ctrl+0', () => {
    assert.deepStrictEqual(key('+'), { type: 'zoomIn' });
    assert.deepStrictEqual(key('-'), { type: 'zoomOut' });
    assert.deepStrictEqual(key('0', { ctrlKey: true }), { type: 'zoom', value: 100 });
  });

  it('lets everything else through', () => {
    assert.strictEqual(key('a'), null);
    assert.strictEqual(key('ArrowLeft', { altKey: true }), null);
    // Ctrl+arrow is the app's, not ours.
    assert.strictEqual(key('ArrowLeft', { ctrlKey: true }), null);
  });
});

describe('viewer state: render size', () => {
  const st = (zoom) => paged({ zoom });

  it('asks for the declared width at natural size at 100%', () => {
    assert.deepStrictEqual(vs.renderSize(st('100%'), 600, 900), { width: 600, zoom: 1 });
  });

  it('keeps the box and raises the factor when zoomed', () => {
    // The format decides what to do with the two: a page rasterises wider, a sheet only ever
    // gets wider. Folding them into one number took that choice away.
    assert.deepStrictEqual(vs.renderSize(st('150%'), 600, 900), { width: 600, zoom: 1.5 });
    assert.deepStrictEqual(vs.renderSize(st('50%'), 600, 900), { width: 600, zoom: 0.5 });
  });

  it('fills the container at natural size when fitted, and falls back to the declared width', () => {
    assert.deepStrictEqual(vs.renderSize(st('fit'), 600, 820), { width: 820, zoom: 1 });
    assert.deepStrictEqual(vs.renderSize(st('fit'), 600, 0), { width: 600, zoom: 1 });
  });

  it('never asks for a canvas wider than a machine can raster', () => {
    const size = vs.renderSize(st('300%'), 3000, 0);
    assert.strictEqual(size.width * size.zoom, vs.MAX_WIDTH);
  });
});
