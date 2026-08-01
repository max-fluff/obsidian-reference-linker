'use strict';

// A recording's own transport: the row is wired to the media element both ways, so what the
// reader does reaches the file and what the file reports reaches the row.

const { describe, it, assert } = require('../src/shared/testing/harness');
const { installStubs } = require('../src/shared/testing/stubs');

installStubs();
const { mountPlayer, timecode } = require('../src/formats/player');

const node = () => {
  const style = { setProperty(k, v) { style[k] = v; } };
  const n = { children: [], style, attrs: {}, listeners: {}, text: '' };
  n.createEl = (tag, o) => {
    const child = node();
    child.tag = tag;
    child.cls = (o && o.cls) || '';
    if (o && o.attr) {
      Object.assign(child.attrs, o.attr);
      if ('value' in o.attr) child.value = o.attr.value;
    }
    if (o && o.text) child.text = o.text;
    n.children.push(child);
    return child;
  };
  n.createDiv = (o) => n.createEl('div', o);
  n.createSpan = (o) => n.createEl('span', o);
  n.setText = (s) => { n.text = s; };
  n.toggleClass = (cls, on) => { n.classes = Object.assign({}, n.classes, { [cls]: !!on }); };
  n.addEventListener = (name, fn) => { (n.listeners[name] = n.listeners[name] || []).push(fn); };
  n.fire = (name, ev) => (n.listeners[name] || []).slice()
    .forEach((f) => f(Object.assign({ preventDefault() {}, stopPropagation() {} }, ev)));
  n.click = () => n.fire('click');
  return n;
};

const fakeMedia = (duration) => {
  const m = node();
  Object.assign(m, { paused: true, currentTime: 0, duration, muted: false, volume: 1 });
  m.play = () => { m.paused = false; m.fire('play'); return Promise.resolve(); };
  m.pause = () => { m.paused = true; m.fire('pause'); };
  return m;
};

const player = (duration = 200, video = false) => {
  const el = node();
  const media = fakeMedia(duration);
  assert.strictEqual(mountPlayer(el, media, { video }), true);
  const row = el.children[0];
  const [play, seek, time, sound, volume] = row.children;
  return { row, media, play, seek, time, sound, volume, full: row.children[5] };
};

describe('timecode', () => {
  it('reads as a clock, not as a number of seconds', () => {
    assert.strictEqual(timecode(0), '0:00');
    assert.strictEqual(timecode(9), '0:09');
    assert.strictEqual(timecode(125), '2:05');
    assert.strictEqual(timecode(3600), '1:00:00');
    assert.strictEqual(timecode(3725), '1:02:05');
  });

  it('survives what a media element reports before it knows anything', () => {
    assert.strictEqual(timecode(NaN), '0:00');
    assert.strictEqual(timecode(-5), '0:00');
  });
});

describe('the player row', () => {
  it('starts and stops the recording', async () => {
    const p = player();
    p.play.click();
    assert.strictEqual(p.media.paused, false);
    p.play.click();
    assert.strictEqual(p.media.paused, true);
  });

  it('seeks to where the slider was dragged', () => {
    const p = player(200);
    p.seek.value = '500';
    p.seek.fire('input');
    assert.strictEqual(p.media.currentTime, 100);
  });

  it('follows the recording while it plays, and lets go while the slider is held', () => {
    const p = player(200);
    p.media.currentTime = 65;
    p.media.fire('timeupdate');
    assert.strictEqual(p.time.text, '1:05 / 3:20');
    assert.strictEqual(p.seek.value, String(Math.round((65 / 200) * 1000)));

    // Dragging owns the slider until it is let go, or every timeupdate would snatch it back.
    p.seek.fire('input');
    p.media.currentTime = 120;
    p.media.fire('timeupdate');
    assert.strictEqual(p.seek.value, String(Math.round((65 / 200) * 1000)));
    p.seek.fire('change');
    p.media.fire('timeupdate');
    assert.strictEqual(p.seek.value, String(Math.round((120 / 200) * 1000)));
  });

  it('says the duration is unknown rather than guessing at zero', () => {
    const p = player(NaN);
    assert.strictEqual(p.time.text, '0:00 / --:--');
    p.seek.value = '500';
    p.seek.fire('input');
    assert.strictEqual(Number.isNaN(p.media.currentTime), false, 'seeking a duration-less file set NaN');
  });

  it('paints the slider up to where the recording has got to', () => {
    // A range input draws one track, so what is behind the thumb is the player's own doing.
    const p = player(200);
    p.media.currentTime = 50;
    p.media.fire('timeupdate');
    assert.strictEqual(p.seek.style['--reference-linker-player-fill'], '25%');
  });

  it('empties the volume slider when muted, thumb and all, and fills it again when it speaks', () => {
    const p = player();
    p.sound.click();
    assert.strictEqual(p.volume.style['--reference-linker-player-fill'], '0%');
    assert.strictEqual(p.volume.classes['is-off'], true, 'the track went grey but the thumb stayed lit');
    p.sound.click();
    assert.strictEqual(p.volume.style['--reference-linker-player-fill'], '100%');
    assert.strictEqual(p.volume.classes['is-off'], false);
  });

  it('mutes and unmutes', () => {
    const p = player();
    p.sound.click();
    assert.strictEqual(p.media.muted, true);
    p.sound.click();
    assert.strictEqual(p.media.muted, false);
  });

  it('mutes when the volume is taken to zero, and speaks again when it is raised', () => {
    const p = player();
    p.volume.value = '0';
    p.volume.fire('input');
    assert.strictEqual(p.media.muted, true);
    p.volume.value = '40';
    p.volume.fire('input');
    assert.strictEqual(p.media.volume, 0.4);
    assert.strictEqual(p.media.muted, false);
  });

  it('takes the keys a player is expected to take', () => {
    const p = player(200);
    p.row.fire('keydown', { key: ' ' });
    assert.strictEqual(p.media.paused, false);
    p.media.currentTime = 20;
    p.row.fire('keydown', { key: 'ArrowRight' });
    assert.strictEqual(p.media.currentTime, 25);
    p.row.fire('keydown', { key: 'ArrowLeft' });
    assert.strictEqual(p.media.currentTime, 20);
  });

  it('never seeks past either end', () => {
    const p = player(30);
    p.media.currentTime = 28;
    p.row.fire('keydown', { key: 'ArrowRight' });
    assert.strictEqual(p.media.currentTime, 30);
    p.media.currentTime = 2;
    p.row.fire('keydown', { key: 'ArrowLeft' });
    assert.strictEqual(p.media.currentTime, 0);
  });

  it('gives a video a full-screen control and an audio none', () => {
    assert.ok(player(200, true).full, 'no full-screen control on a video');
    assert.strictEqual(player(200, false).full, undefined);
  });

  it('declines where there is no DOM to draw in, so the browser keeps its own controls', () => {
    assert.strictEqual(mountPlayer({}, fakeMedia(200), { video: false }), false);
  });
});
