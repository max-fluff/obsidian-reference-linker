'use strict';

// The embed viewer's state machine: which position is shown and at what zoom, and what a key
// or a button does to it. Kept clear of the DOM so it can be tested on its own.

const ZOOM_STEPS = [50, 75, 100, 125, 150, 200, 250, 300];
const FIT = 'fit';
const MIN_ZOOM = ZOOM_STEPS[0];
const MAX_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1];
const MAX_WIDTH = 4000; // a canvas past this renders nothing at all on a modest machine

// A count of 0 means the format has not said how many positions it has. Only a reported count
// clamps, or a recording's seconds would collapse to position one.
function clampPosition(n, count) {
  const p = Math.max(1, Math.floor(Number(n)) || 1);
  return count > 0 ? Math.min(p, count) : p;
}

// "150" or "150%" — anything else is not a zoom. `fit` is still read here because that is what
// the single `zoom:` key meant before the box and the factor became two settings; it says
// nothing about the factor, so it leaves the zoom unset.
function parseZoom(raw) {
  const s = String(raw == null ? '' : raw).trim().toLowerCase();
  if (!s || s === FIT) return null;
  const m = /^(\d+(?:\.\d+)?)\s*%?$/.exec(s);
  if (!m) return null;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(parseFloat(m[1]))));
}

// `fit: yes` is the key of its own; a legacy `zoom: fit` still asks for the same box.
function parseFit(raw, zoomRaw) {
  const s = String(raw == null ? '' : raw).trim().toLowerCase();
  if (s) return s !== 'no' && s !== 'false' && s !== '0';
  return String(zoomRaw == null ? '' : zoomRaw).trim().toLowerCase() === FIT;
}

const formatZoom = (zoom) => zoom + '%';

const same = (a, b) => a.position === b.position && a.zoom === b.zoom && a.fit === b.fit
  && a.count === b.count && a.paged === b.paged && a.zoomable === b.zoomable;

// Returning the old object when nothing moved is what tells the viewer not to redraw.
function set(state, patch) {
  const next = Object.assign({}, state, patch);
  return same(state, next) ? state : next;
}

function initialState(opts) {
  const o = opts || {};
  const count = Math.max(0, Math.floor(Number(o.count)) || 0);
  const zoom = parseZoom(o.zoom);
  return {
    position: clampPosition(o.position, count),
    zoom: zoom === null ? 100 : zoom,
    fit: parseFit(o.fit, o.zoom),
    count,
    paged: !!o.paged,
    zoomable: !!o.zoomable,
  };
}

function stepZoom(zoom, dir) {
  const steps = dir > 0 ? ZOOM_STEPS : ZOOM_STEPS.slice().reverse();
  const next = steps.find((z) => (dir > 0 ? z > zoom : z < zoom));
  return next === undefined ? zoom : next;
}

function reduce(state, action) {
  if (!action) return state;
  const at = (n) => set(state, { position: clampPosition(n, state.count) });
  switch (action.type) {
    case 'prev': return state.paged ? at(state.position - 1) : state;
    case 'next': return state.paged ? at(state.position + 1) : state;
    case 'first': return state.paged ? at(1) : state;
    case 'last': return state.paged && state.count > 0 ? at(state.count) : state;
    case 'goto': {
      // Number('') is 0, so an empty box would read as a jump to the first position.
      const raw = String(action.value == null ? '' : action.value).trim();
      const n = Math.floor(Number(raw));
      return state.paged && raw !== '' && Number.isFinite(n) ? at(n) : state;
    }
    case 'count': {
      const count = Math.max(0, Math.floor(Number(action.value)) || 0);
      return set(state, { count, position: clampPosition(state.position, count) });
    }
    case 'zoomIn': return state.zoomable ? set(state, { zoom: stepZoom(state.zoom, 1) }) : state;
    case 'zoomOut': return state.zoomable ? set(state, { zoom: stepZoom(state.zoom, -1) }) : state;
    case 'zoom': {
      const z = parseZoom(action.value);
      return state.zoomable && z !== null ? set(state, { zoom: z }) : state;
    }
    case 'fit': return state.zoomable ? set(state, { fit: !state.fit }) : state;
    default: return state;
  }
}

// What a keystroke means, or null when the viewer should let it through.
function keyAction(ev) {
  if (ev.altKey) return null;
  if (ev.ctrlKey || ev.metaKey) {
    if (ev.key === '0') return { type: 'zoom', value: 100 };
    if (ev.key === '+' || ev.key === '=') return { type: 'zoomIn' };
    if (ev.key === '-' || ev.key === '_') return { type: 'zoomOut' };
    return null;
  }
  switch (ev.key) {
    case 'ArrowLeft': case 'PageUp': return { type: 'prev' };
    case 'ArrowRight': case 'PageDown': return { type: 'next' };
    case 'Home': return { type: 'first' };
    case 'End': return { type: 'last' };
    case '+': case '=': return { type: 'zoomIn' };
    case '-': return { type: 'zoomOut' };
    default: return null;
  }
}

// What the format is asked to draw: the box it lays out into, and the factor it draws at. The
// two answer different questions — fit widens the box to the container, zoom draws the content
// larger inside whatever box it got — so they compose rather than replace each other.
function renderSize(state, width, containerWidth) {
  const box = state.fit && containerWidth > 0 ? containerWidth : width;
  const zoom = state.zoom / 100;
  return { width: Math.round(box), zoom: Math.min(zoom, MAX_WIDTH / Math.max(1, box)) };
}

module.exports = {
  ZOOM_STEPS, FIT, MAX_WIDTH,
  parseZoom, parseFit, formatZoom, initialState, reduce, keyAction, renderSize,
};
