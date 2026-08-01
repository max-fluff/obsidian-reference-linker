'use strict';

// The transport a recording is played with. The browser's own bar brings a second set of
// chrome into an embed that already has a header, so this is one row: play, seek, time, sound.

const { setIcon } = require('obsidian');
const { t } = require('../shared/i18n');

const STEPS = 1000; // the seek slider's resolution, in place of a duration it may not know yet
const NUDGE = 5; // seconds an arrow key moves

function timecode(n) {
  const s = Math.max(0, Math.floor(Number(n) || 0));
  const mm = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, '0');
  return mm >= 60 ? Math.floor(mm / 60) + ':' + String(mm % 60).padStart(2, '0') + ':' + ss : mm + ':' + ss;
}

const playable = (media) => Number.isFinite(media.duration) && media.duration > 0;

function parseVolume(raw) {
  const s = String(raw == null ? '' : raw).trim().toLowerCase();
  if (!s) return null;
  if (s === 'off' || s === 'mute' || s === 'muted') return { volume: 1, muted: true };
  const m = /^(\d+(?:\.\d+)?)\s*%?$/.exec(s);
  if (!m) return null;
  const volume = Math.min(100, Math.max(0, parseFloat(m[1]))) / 100;
  return { volume, muted: volume === 0 };
}

const formatVolume = (media) => (media.muted || !media.volume ? 'off' : Math.round(media.volume * 100) + '%');

function button(row, icon, label, onClick) {
  const b = row.createEl('button', {
    cls: 'clickable-icon reference-linker-player-button',
    attr: { type: 'button', 'aria-label': label, title: label },
  });
  if (typeof setIcon === 'function') setIcon(b, icon);
  b.addEventListener('click', (evt) => { evt.preventDefault(); evt.stopPropagation(); onClick(); });
  return b;
}

// The pointer state lives on the input: a :hover reaching ::-webkit-slider-thumb answers
// differently over the track and over the thumb.
function slider(row, cls, label, max, value) {
  const el = row.createEl('input', {
    cls: 'reference-linker-player-' + cls,
    type: 'range',
    attr: { min: '0', max: String(max), value: String(value), 'aria-label': label },
  });
  el.addEventListener('mouseenter', () => el.toggleClass('is-hot', true));
  el.addEventListener('mouseleave', () => el.toggleClass('is-hot', false));
  return el;
}

// A range input paints one track, so what is behind the thumb is drawn from this.
const fill = (el, part) => el.style.setProperty('--reference-linker-player-fill',
  Math.max(0, Math.min(100, part * 100)) + '%');

// False where the app's DOM helpers aren't there, so the caller keeps the browser's controls.
function mountPlayer(el, media, { video, width }) {
  if (!el.createDiv || !el.createEl) return false;
  const row = el.createDiv({ cls: 'reference-linker-player' });
  if (width) { row.style.width = width + 'px'; row.style.maxWidth = '100%'; }
  row.tabIndex = 0;

  const play = button(row, 'play', t('player.play'), () => toggle());
  const seek = slider(row, 'seek', t('player.seek'), STEPS, 0);
  const time = row.createSpan({ cls: 'reference-linker-player-time', text: timecode(0) });
  const sound = button(row, 'volume-2', t('player.mute'), () => {
    media.muted = !media.muted;
    showSound();
  });
  const volume = slider(row, 'volume', t('player.volume'), 100, 100);
  const level = row.createSpan({ cls: 'reference-linker-player-level' });
  if (video) button(row, 'maximize', t('player.fullscreen'), () => { if (media.requestFullscreen) media.requestFullscreen(); });

  const toggle = () => { if (media.paused) media.play().catch(() => {}); else media.pause(); };
  const nudge = (by) => { if (playable(media)) media.currentTime = Math.min(media.duration, Math.max(0, media.currentTime + by)); };

  let dragging = false;
  const showSound = () => {
    const off = media.muted || media.volume === 0;
    setIcon(sound, off ? 'volume-x' : 'volume-2');
    volume.value = String(Math.round(media.volume * 100));
    fill(volume, off ? 0 : media.volume);
    level.setText(off ? '0%' : Math.round(media.volume * 100) + '%');
  };
  const show = () => {
    const total = playable(media) ? timecode(media.duration) : '--:--';
    time.setText(timecode(media.currentTime) + ' / ' + total);
    const at = playable(media) ? media.currentTime / media.duration : 0;
    if (!dragging && playable(media)) seek.value = String(Math.round(at * STEPS));
    fill(seek, dragging ? Number(seek.value) / STEPS : at);
  };

  media.addEventListener('volumechange', showSound);
  media.addEventListener('loadedmetadata', show);
  media.addEventListener('timeupdate', show);
  media.addEventListener('play', () => setIcon(play, 'pause'));
  media.addEventListener('pause', () => setIcon(play, 'play'));
  media.addEventListener('ended', () => setIcon(play, 'rotate-ccw'));
  seek.addEventListener('input', () => {
    dragging = true;
    fill(seek, Number(seek.value) / STEPS);
    if (playable(media)) media.currentTime = (Number(seek.value) / STEPS) * media.duration;
  });
  seek.addEventListener('change', () => { dragging = false; });
  volume.addEventListener('input', () => {
    media.volume = Number(volume.value) / 100;
    media.muted = media.volume === 0;
    showSound();
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

  showSound();
  show();
  return true;
}

module.exports = { mountPlayer, timecode, parseVolume, formatVolume };
