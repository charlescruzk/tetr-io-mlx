// js/profiles.js — pure game-logic, no DOM. See PLAN.md Phase 27.
//
// Local player profiles. Each person who plays on this device picks (or
// creates) a name on the Home screen, and everything that is a *preference*
// — audio toggles, the touch-control layout, the leaderboard name — is kept
// per profile, so switching profiles switches preferences instantly. There
// is no password: profiles are a convenience for sharing one phone, not an
// account system (the project has no backend; see SPEC.md hard constraints).
// The leaderboard itself is deliberately NOT per profile — it's the device's
// board, and everyone's runs compete on it.
//
// Store shape: { version, active, list: { <name>: { settings, layout,
// lbName } } }. Every mutator returns a new store; `parse()` validates so a
// corrupt blob (or one from a future version) yields a usable store.
//
// Dual-export: loadable via <script> in the browser (attaches to
// window.Tetris.Profiles) and via require() in Node for tests/run.js.
(function (root) {
  'use strict';

  const Layout = (typeof module !== 'undefined' && module.exports)
    ? require('./layout.js')
    : (root.Tetris && root.Tetris.Layout);

  const VERSION = 1;
  const NAME_MAX = 12;
  const MAX_PROFILES = 12;
  const DEFAULT_NAME = 'PLAYER';
  const DEFAULT_SETTINGS = { music: true, sfx: true };

  function sanitizeName(raw) {
    let s = String(raw == null ? '' : raw).replace(/[\u0000-\u001f\u007f]/g, '').trim();
    if (s.length > NAME_MAX) s = s.slice(0, NAME_MAX);
    return s;
  }

  function cloneSettings(s) {
    return {
      music: s && typeof s.music === 'boolean' ? s.music : DEFAULT_SETTINGS.music,
      sfx: s && typeof s.sfx === 'boolean' ? s.sfx : DEFAULT_SETTINGS.sfx,
    };
  }

  function newProfile(overrides) {
    const o = overrides || {};
    return {
      settings: cloneSettings(o.settings),
      layout: o.layout ? Layout.parse(o.layout) : Layout.create(),
      lbName: sanitizeName(o.lbName),
    };
  }

  function cloneStore(store) {
    const list = {};
    for (const name of Object.keys(store.list)) list[name] = newProfile(store.list[name]);
    return { version: VERSION, active: store.active, list: list };
  }

  // A store with one profile. `seed` can carry legacy settings/name so an
  // upgrade from the pre-profile build keeps what the player had.
  function create(name, seed) {
    const n = sanitizeName(name) || DEFAULT_NAME;
    const list = {};
    list[n] = newProfile(seed);
    return { version: VERSION, active: n, list: list };
  }

  function names(store) {
    return Object.keys(store.list);
  }

  function active(store) {
    return store.list[store.active] || store.list[names(store)[0]];
  }

  // Add a profile and make it active. Returns { store, error } — error is
  // a short reason ('empty', 'exists', 'full') when nothing was added.
  function add(store, name, seed) {
    const n = sanitizeName(name);
    if (!n) return { store: store, error: 'empty' };
    if (store.list[n]) return { store: store, error: 'exists' };
    if (names(store).length >= MAX_PROFILES) return { store: store, error: 'full' };
    const next = cloneStore(store);
    next.list[n] = newProfile(seed);
    next.active = n;
    return { store: next, error: null };
  }

  function setActive(store, name) {
    if (!store.list[name]) return store;
    const next = cloneStore(store);
    next.active = name;
    return next;
  }

  // Remove a profile. The last profile can't be removed; removing the active
  // one activates the first remaining profile.
  function remove(store, name) {
    if (!store.list[name] || names(store).length <= 1) return store;
    const next = cloneStore(store);
    delete next.list[name];
    if (next.active === name) next.active = names(next)[0];
    return next;
  }

  // Merge a patch ({ settings, layout, lbName }) into the active profile.
  function update(store, patch) {
    const next = cloneStore(store);
    const p = next.list[next.active];
    if (!p) return store;
    if (patch.settings) p.settings = cloneSettings(Object.assign({}, p.settings, patch.settings));
    if (patch.layout) p.layout = Layout.parse(patch.layout);
    if (patch.lbName != null) p.lbName = sanitizeName(patch.lbName);
    return next;
  }

  function serialize(store) {
    return JSON.stringify(store);
  }

  // Validate a stored blob; garbage → a fresh single-profile store (seeded
  // with `seed`, e.g. legacy settings).
  function parse(raw, seed) {
    let data;
    try { data = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return create(null, seed); }
    if (!data || typeof data !== 'object' || !data.list || typeof data.list !== 'object') {
      return create(null, seed);
    }
    const list = {};
    for (const key of Object.keys(data.list)) {
      const n = sanitizeName(key);
      if (!n || list[n] || Object.keys(list).length >= MAX_PROFILES) continue;
      const p = data.list[key];
      list[n] = newProfile(p && typeof p === 'object' ? p : null);
    }
    if (!Object.keys(list).length) return create(null, seed);
    const act = typeof data.active === 'string' && list[data.active] ? data.active : Object.keys(list)[0];
    return { version: VERSION, active: act, list: list };
  }

  const Profiles = {
    VERSION, NAME_MAX, MAX_PROFILES, DEFAULT_NAME, DEFAULT_SETTINGS,
    create, names, active, add, setActive, remove, update, sanitizeName,
    serialize, parse,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Profiles;
  } else {
    root.Tetris = root.Tetris || {};
    root.Tetris.Profiles = Profiles;
  }
})(typeof window !== 'undefined' ? window : globalThis);
