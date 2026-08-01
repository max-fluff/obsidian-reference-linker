'use strict';

// A recording's own transport: the row is wired to the media element both ways, so what the
// reader does reaches the file and what the file reports reaches the row.

const { describe, it, assert } = require('../src/shared/testing/harness');
const { installStubs } = require('../src/shared/testing/stubs');

installStubs();
const { mountPlayer, timecode, parseVolume, formatVolume } = require('../src/formats/player');

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
  n.setAttribute = (k, v) => { n.attrs[k] = v; };
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
  const [play, seek, time, sound, volume, level] = row.children;
  return { row, media, play, seek, time, sound, volume, level, full: row.children[6] };
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

describe('the sound a block asks for', () => {
  it('reads a percentage, with or without its sign', () => {
    assert.deepStrictEqual(parseVolume('40%'), { volume: 0.4, muted: false });
    assert.deepStrictEqual(parseVolume('40'), { volume: 0.4, muted: false });
  });

  it('reads silence as silence, not as nothing said', () => {
    assert.deepStrictEqual(parseVolume('off'), { volume: 1, muted: true });
    assert.deepStrictEqual(parseVolume('0%'), { volume: 0, muted: true });
  });

  it('is nothing said when the line is missing or not a volume', () => {
    assert.strictEqual(parseVolume(''), null);
    assert.strictEqual(parseVolume(undefined), null);
    assert.strictEqual(parseVolume('loud'), null);
  });

  it('writes back what it reads', () => {
    assert.strictEqual(formatVolume({ volume: 0.4, muted: false }), '40%');
    assert.strictEqual(formatVolume({ volume: 1, muted: true }), 'off');
    assert.deepStrictEqual(parseVolume(formatVolume({ volume: 0.4, muted: false })), { volume: 0.4, muted: false });
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
    const p = player(200);
    p.media.currentTime = 50;
    p.media.fire('timeupdate');
    assert.strictEqual(p.seek.style['--reference-linker-player-fill'], '25%');
  });

  it('empties the volume bar when muted, and fills it again when it speaks', () => {
    const p = player();
    p.sound.click();
    assert.strictEqual(p.volume.style['--reference-linker-player-fill'], '0%');
    p.sound.click();
    assert.strictEqual(p.volume.style['--reference-linker-player-fill'], '100%');
  });

  it('follows a volume it did not set itself', () => {
    // The block's own volume is applied before the row is drawn, so the row has to follow it.
    const p = player();
    p.media.volume = 0.25;
    p.media.fire('volumechange');
    assert.strictEqual(p.level.text, '25%');
    assert.strictEqual(p.volume.value, '25');
  });

  it('says the volume it is at, in the row', () => {
    const p = player();
    assert.strictEqual(p.level.text, '100%');
    p.volume.value = '40';
    p.volume.fire('input');
    assert.strictEqual(p.level.text, '40%');
    p.sound.click();
    assert.strictEqual(p.level.text, '0%');
  });

  it('marks a slider the pointer is on, so the bar answers wherever on it the pointer sits', () => {
    // A :hover reaching a browser's own slider parts answers differently over the track and
    // over the thumb; a class on the input answers the same either way.
    const p = player();
    p.seek.fire('mouseenter');
    assert.strictEqual(p.seek.classes['is-hot'], true);
    p.seek.fire('mouseleave');
    assert.strictEqual(p.seek.classes['is-hot'], false);
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
