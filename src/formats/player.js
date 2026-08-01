'use strict';

// The transport a recording is played with. The browser's own bar brings a second set of
// chrome into an embed that already has a header, so this is one row: play, seek, time, sound.

const { setIcon } = require('obsidian');
const { t } = require('../shared/i18n');

const STEPS = 1000; // the seek slider's resolution, in place of a duration it may not know yet
const NUDGE = 5; // seconds an arrow key moves

// Seconds as a timecode: 125 reads as 2:05, an hour in as 1:02:05.
function timecode(n) {
  const s = Math.max(0, Math.floor(Number(n) || 0));
  const mm = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, '0');
  return mm >= 60 ? Math.floor(mm / 60) + ':' + String(mm % 60).padStart(2, '0') + ':' + ss : mm + ':' + ss;
}

const playable = (media) => Number.isFinite(media.duration) && media.duration > 0;

function button(row, icon, label, onClick) {
  const b = row.createEl('button', {
    cls: 'clickable-icon reference-linker-player-button',
    attr: { type: 'button', 'aria-label': label, title: label },
  });
  if (typeof setIcon === 'function') setIcon(b, icon);
  b.addEventListener('click', (evt) => { evt.preventDefault(); evt.stopPropagation(); onClick(); });
  return b;
}

const slider = (row, cls, label, max, value) => row.createEl('input', {
  cls: 'reference-linker-player-' + cls,
  type: 'range',
  attr: { min: '0', max: String(max), value: String(value), 'aria-label': label },
});

// Draws the row under `media` and wires the two to each other. Returns false where the app's
// DOM helpers aren't there, so the caller can fall back to the browser's own controls.
function mountPlayer(el, media, { video }) {
  if (!el.createDiv || !el.createEl) return false;
  const row = el.createDiv({ cls: 'reference-linker-player' });
  row.tabIndex = 0;

  const play = button(row, 'play', t('player.play'), () => toggle());
  const seek = slider(row, 'seek', t('player.seek'), STEPS, 0);
  const time = row.createSpan({ cls: 'reference-linker-player-time', text: timecode(0) });
  const sound = button(row, 'volume-2', t('player.mute'), () => {
    media.muted = !media.muted;
    setIcon(sound, media.muted ? 'volume-x' : 'volume-2');
  });
  const volume = slider(row, 'volume', t('player.volume'), 100, 100);
  if (video) button(row, 'maximize', t('player.fullscreen'), () => { if (media.requestFullscreen) media.requestFullscreen(); });

  const toggle = () => { if (media.paused) media.play().catch(() => {}); else media.pause(); };
  const nudge = (by) => { if (playable(media)) media.currentTime = Math.min(media.duration, Math.max(0, media.currentTime + by)); };

  let dragging = false;
  const show = () => {
    const total = playable(media) ? timecode(media.duration) : '--:--';
    time.setText(timecode(media.currentTime) + ' / ' + total);
    if (!dragging && playable(media)) seek.value = String(Math.round((media.currentTime / media.duration) * STEPS));
  };

  media.addEventListener('loadedmetadata', show);
  media.addEventListener('timeupdate', show);
  media.addEventListener('play', () => setIcon(play, 'pause'));
  media.addEventListener('pause', () => setIcon(play, 'play'));
  media.addEventListener('ended', () => setIcon(play, 'rotate-ccw'));
  seek.addEventListener('input', () => {
    dragging = true;
    if (playable(media)) media.currentTime = (Number(seek.value) / STEPS) * media.duration;
  });
  seek.addEventListener('change', () => { dragging = false; });
  volume.addEventListener('input', () => {
    media.volume = Number(volume.value) / 100;
    media.muted = media.volume === 0;
    setIcon(sound, media.muted ? 'volume-x' : 'volume-2');
  });
  if (video) media.addEventListener('click', toggle);
  row.addEventListener('keydown', (evt) => {
    const key = evt.key;
    if (key === ' ' || key === 'k') toggle();
    else if (key === 'ArrowLeft') nudge(-NUDGE);
    else if (key === 'ArrowRight') nudge(NUDGE);
    else if (key === 'm') sound.click();
    else return;
    evt.preventDefault();
    evt.stopPropagation();
  });

  show();
  return true;
}

module.exports = { mountPlayer, timecode };
