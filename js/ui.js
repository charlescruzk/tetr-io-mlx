// js/ui.js — browser-only. See PLAN.md Phase 9 + SPEC.md "Screens".
//
// Screen management: the six screens (home, mode-select, game, gameover,
// plus the pause + settings overlays), button wiring, mode-appropriate HUD,
// and settings persisted to localStorage + applied live. It talks to the
// rest of the app only through window.Tetris.* — it creates the game via
// Game.create, shows/hides screens itself, and lets main.js's frame loop
// react to the game's state transitions (pause / game over).
//
// No dual-export: it touches the DOM, so it's browser-only and just attaches
// window.Tetris.UI.
(function (root) {
   'use strict';

  const T = (root.Tetris = root.Tetris || {});

     // The three full pages, cross-faded one at a time.
  const PAGES = ['home', 'mode-select', 'game'];
     // Overlays shown on top of the current page.
  const OVERLAYS = ['pause', 'settings', 'gameover', 'leaderboard', 'profile'];

  const LS_KEY = 'tetrio-settings';
  const LB_KEY = 'tetrio-leaderboard';   // Phase 25: per-mode top-10 board
  const NAME_KEY = 'tetrio-player-name'; // Phase 25: last name typed (legacy seed)
  const PROFILES_KEY = 'tetrio-profiles'; // Phase 27: per-player preferences
  const DEFAULTS = { music: true, sfx: true };

  const UI = {
    els: {},          // cached screen/control elements
    game: null,       // the live game object (game.js), or null on the menu
    config: null,     // the { mode, difficulty } of the current/last game
    settings: Object.assign({}, DEFAULTS),
    _diff: 'normal',          // difficulty chosen at mode select
    _page: 'home',           // current page
    _settingsReturn: 'home', // where Settings' "Back" returns: 'home' | 'pause'
    _audioReady: false,
    _lastHud: {},            // previous HUD values for change flashes
    // Phase 25: leaderboard state. `board` is the parsed top-10 data
    // (js/leaderboard.js shapes it), `_lastEntry` locates the row the
    // game-over name box edits, `_lbReturn` is where the overlay's Back goes.
    board: null,
    playerName: '',
    _lastEntry: null,        // { mode, id, rank } of the run just saved
    _lbMode: 'classic',      // tab shown on the leaderboard screen
    _lbReturn: 'home',       // 'home' | 'gameover'
    // Phase 27: local profiles. `profiles` is the parsed store; `layout` is
    // the active profile's touch layout (touch.js renders it); `_laySel` is
    // the action currently picked up in the layout editor.
    profiles: null,
    layout: null,
    _laySel: null,
    _removeArm: null,        // profile name whose × has been tapped once

     // ---- boot ----
     // Cache elements, load settings, wire every button, show the home
     // screen. Idempotent enough to call once from main.js on DOMContentLoaded.
    init() {
      this._cache();
      this._loadSettings();
      this._loadLeaderboard();
      this._loadProfiles();
      this._bind();
      this._syncToggles();
         // Push the persisted toggles into the audio layer now, so the first
         // user gesture (which unlocks the AudioContext) honors what the user
         // last chose — a persisted "music off" stays off.
      this._applyAudio();
      this._selectDifficulty(this._diff);
      this._unlockAudio();
      this.goHome();
      return this;
     },

     // Cache every element the UI drives by id.
    _cache() {
      for (const s of PAGES.concat(OVERLAYS)) {
        this.els['screen-' + s] = document.getElementById('screen-' + s);
        }
      this.els['difficulty-seg'] = document.getElementById('difficulty-seg');
      this.els['gameover-title'] = document.getElementById('gameover-title');
      this.els['gameover-stats'] = document.getElementById('gameover-stats');
      this.els['toggle-music'] = document.getElementById('toggle-music');
      this.els['toggle-sfx'] = document.getElementById('toggle-sfx');
      this.els['val-score'] = document.getElementById('val-score');
      this.els['val-lines'] = document.getElementById('val-lines');
      this.els['val-level'] = document.getElementById('val-level');
      this.els['val-time'] = document.getElementById('val-time');
      this.els['stat-score'] = document.getElementById('stat-score');
      this.els['stat-lines'] = document.getElementById('stat-lines');
      this.els['stat-level'] = document.getElementById('stat-level');
      this.els['stat-time'] = document.getElementById('stat-time');
      // Phase 25
      for (const id of ['gameover-rank', 'gameover-record', 'gameover-name-wrap',
                        'gameover-name', 'leaderboard-seg', 'leaderboard-record',
                        'leaderboard-table', 'leaderboard-empty',
                        // Phase 27
                        'profile-chip-name', 'profile-list', 'profile-new-name',
                        'profile-error', 'profile-add-form', 'layout-editor',
                        'layout-presets', 'layout-hint', 'layout-profile-name']) {
        this.els[id] = document.getElementById(id);
        }
     },

     // ---- button wiring ----
    _bind() {
      const on = this._on.bind(this);
      on('btn-play', () => this.goModeSelect());
      on('btn-settings-home', () => this.openSettings('home'));
      on('btn-back-home', () => this.goHome());
      on('btn-resume', () => this._resume());
      on('btn-restart-pause', () => this.restart());
      on('btn-settings-pause', () => this.openSettings('pause'));
      on('btn-quit-pause', () => this.goHome());
      on('btn-settings-back', () => this.closeSettings());
      on('btn-retry', () => this.restart());
      on('btn-menu', () => this.goHome());
      // Phase 25: leaderboard navigation + live name entry.
      on('btn-leaderboard-home', () => this.openLeaderboard('home'));
      on('btn-leaderboard-gameover', () => this.openLeaderboard('gameover'));
      on('btn-leaderboard-back', () => this.closeLeaderboard());
      const seg = this.els['leaderboard-seg'];
      if (seg) {
        for (const btn of seg.children) {
          on(btn, () => this._showLeaderboardMode(btn.dataset.mode));
          }
        }
      const nameEl = this.els['gameover-name'];
      if (nameEl) {
        nameEl.addEventListener('input', () => this._renameEntry(nameEl.value));
        nameEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === 'Escape') nameEl.blur();
          });
        }
      // Another tab of the game saving a run updates this one immediately.
      window.addEventListener('storage', (e) => {
        if (e && e.key === LB_KEY) {
          this._loadLeaderboard();
          this._renderLeaderboard();
          }
        });
      on('toggle-music', () => this._flip('music'));
      on('toggle-sfx', () => this._flip('sfx'));
      // Phase 27: profiles + layout editor.
      on('btn-profile', () => this.openProfiles());
      on('btn-profile-back', () => this.closeProfiles());
      on('btn-layout-mirror', () => this._layoutMirror());
      on('btn-layout-reset', () => this._setLayout(T.Layout.create(), 'Reset to the default layout.'));
      const presets = this.els['layout-presets'];
      if (presets) {
        for (const btn of presets.children) {
          on(btn, () => this._setLayout(T.Layout.create(btn.dataset.preset),
                                        T.Layout.PRESETS[btn.dataset.preset].name + ' preset applied.'));
          }
        }
      const form = this.els['profile-add-form'];
      if (form) {
        form.addEventListener('submit', (e) => {
          if (e && e.preventDefault) e.preventDefault();
          this._addProfile();
          });
        }
      // Phase 14: the touch HUD's pause button — pause when playing, resume
      // when paused (it sits behind the pause overlay otherwise).
      on('btn-pause-touch', () => {
        const g = this.game;
        if (g && g.state === 'playing') g.pause();
        else if (g && g.state === 'paused') this._resume();
        });

      for (const btn of this.els['difficulty-seg'].children) {
        on(btn, () => this._selectDifficulty(btn.dataset.difficulty));
       }
      const cards = document.querySelectorAll('.mode-card');
      for (const card of cards) {
        on(card, () => this.startGame(card.dataset.mode, this._diff));
       }
     },

     // click handler that also blurs the control so a following Space/Enter
     // keypress doesn't re-trigger the button (Space is hard-drop in-game).
    _on(el, fn) {
      // Accepts either a string element id or an already-resolved element —
      // _bind() uses both call shapes. A string is resolved via
      // getElementById here (Phase 13: the old version called .addEventListener
      // on the raw string, which threw on the first binding and killed all
      // button wiring).
      if (typeof el === 'string') el = document.getElementById(el);
      if (!el) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('Tetris UI: no element to bind click handler to');
          }
        return;
        }
      el.addEventListener('click', (e) => {
        fn();
        if (e.currentTarget && e.currentTarget.blur) e.currentTarget.blur();
        });
     },

     // ---- navigation ----
    goHome() {
      this.game = null;
      this._showPage('home');
      this._hideOverlays();
      this._syncInput();
      this._sfx('menu');
      this._blur();
     },

    goModeSelect() {
      this._showPage('mode-select');
      this._hideOverlays();
      this._syncInput();
      this._sfx('menu');
      this._blur();
     },

     // Start (or restart) a game with the given mode + difficulty. Creates a
     // fresh game object, shows the board, binds + enables input, paints an
     // initial HUD frame.
    startGame(mode, difficulty) {
      this.config = { mode: mode, difficulty: difficulty || 'normal' };
      this.game = T.Game.create({ mode: this.config.mode, difficulty: this.config.difficulty });
         // Reset HUD change tracking so the initial values don't all flash.
      this._lastHud = {};
         // Route this game's event stream to the SFX bus (move/rotate/lock/…).
      if (T.Audio && T.Audio.install) T.Audio.install(this.game);
      this._showPage('game');
      this._hideOverlays();
      T.Input.bind(this.game);
      if (T.Touch && T.Touch.bind) T.Touch.bind(this.game);
      this._updateHUD(this.game);
      this._syncInput(); // enables input for the game
      this._sfx('start');
      this._startMusic();
      this._blur();
     },

     // Restart with the current config (used by the pause + game-over Retry).
    restart() {
      const cfg = this.config || { mode: 'classic', difficulty: 'normal' };
      this.startGame(cfg.mode, cfg.difficulty);
     },

     // Called by main.js when the game reports state 'over' or 'won'.
    endGame() {
      if (!this.game) return;
      T.Input.setEnabled(false);
      if (T.Touch && T.Touch.setEnabled) T.Touch.setEnabled(false);
      this._fillGameOver();
      this._recordResult(this.game);
      this._showOverlay('gameover');
      this._sfx(this.game.result === 'won' ? 'win' : 'gameover');
      this._stopMusic();
      this._blur();
     },

     // Pause overlay: opened by main.js on the playing->paused transition
     // (the input layer toggles the game state; main.js reacts to it).
    openPause() {
      this._showOverlay('pause');
      this._sfx('pause');
      this._syncInput(); // stays enabled so Esc/P can resume
     },

     _resume() {
      if (this.game && this.game.state === 'paused') this.game.resume();
      this._hideOverlay('pause');
      this._syncInput();
      this._blur();
     },

     // Settings overlays the current context (home or pause); "Back" returns
     // there, leaving the pause state underneath when it came from pause.
    openSettings(from) {
      this._settingsReturn = (from === 'pause') ? 'pause' : 'home';
      this._syncToggles();
      this._laySel = null;
      this._renderLayoutEditor();
      this._showOverlay('settings');
      this._syncInput(); // disables input while settings is up
      this._blur();
     },

    closeSettings() {
      this._hideOverlay('settings');
      if (this._settingsReturn === 'pause') this._showOverlay('pause');
      this._syncInput();
      this._blur();
     },

     // ---- profiles (Phase 27) ----
     // Load the profile store (seeding a first profile from the pre-profile
     // build's settings + leaderboard name so an upgrade loses nothing), then
     // apply the active profile's preferences.
    _loadProfiles() {
      const P = T.Profiles;
      if (!P) return;
      let raw = null;
      try { raw = localStorage.getItem(PROFILES_KEY); } catch (e) { /* no storage */ }
      const seed = { settings: this.settings, lbName: this.playerName };
      this.profiles = raw ? P.parse(raw, seed) : P.create(this.playerName || P.DEFAULT_NAME, seed);
      this._applyProfile();
     },

    _saveProfiles() {
      try {
        localStorage.setItem(PROFILES_KEY, T.Profiles.serialize(this.profiles));
        } catch (e) { /* ignore — preferences still apply for this session */ }
     },

     // Push the active profile's preferences everywhere they're used: audio
     // settings, the touch layout (re-rendered live), the leaderboard name.
    _applyProfile() {
      const P = T.Profiles;
      if (!this.profiles) return;
      const prof = P.active(this.profiles);
      this.settings = Object.assign({}, prof.settings);
      this.layout = prof.layout;
      this.playerName = prof.lbName || this.profiles.active;
      this._syncToggles();
      this._applyAudio();
      if (T.Touch && T.Touch.render && T.Touch._controls) T.Touch.render(this.layout);
      const chip = this.els['profile-chip-name'];
      if (chip) chip.textContent = this.profiles.active;
      const lp = this.els['layout-profile-name'];
      if (lp) lp.textContent = this.profiles.active;
     },

    openProfiles() {
      this._removeArm = null;
      this._renderProfiles();
      const err = this.els['profile-error'];
      if (err) err.textContent = '';
      this._showOverlay('profile');
      this._syncInput();
      this._sfx('menu');
      this._blur();
     },

    closeProfiles() {
      this._hideOverlay('profile');
      this._syncInput();
      this._sfx('menu');
      this._blur();
     },

    _renderProfiles() {
      const P = T.Profiles;
      const list = this.els['profile-list'];
      if (!list || !this.profiles) return;
      if (list.replaceChildren) list.replaceChildren(); else list.innerHTML = '';
      const names = P.names(this.profiles);
      for (const name of names) {
        const row = document.createElement('div');
        row.className = 'profile-row';
        const pick = document.createElement('button');
        pick.className = 'profile-pick' + (name === this.profiles.active ? ' is-active' : '');
        pick.setAttribute('type', 'button');
        pick.dataset.profile = name;
        const label = document.createElement('span');
        label.textContent = name;
        pick.appendChild(label);
        if (name === this.profiles.active) {
          const badge = document.createElement('span');
          badge.className = 'profile-badge';
          badge.textContent = 'ACTIVE';
          pick.appendChild(badge);
          }
        this._on(pick, () => this._switchProfile(name));
        row.appendChild(pick);
        if (names.length > 1) {
          const armed = this._removeArm === name;
          const rm = document.createElement('button');
          rm.className = 'profile-remove' + (armed ? ' is-armed' : '');
          rm.setAttribute('type', 'button');
          rm.setAttribute('aria-label', armed ? 'Confirm removing ' + name : 'Remove ' + name);
          rm.textContent = armed ? 'Sure?' : '×';
          this._on(rm, () => this._removeProfile(name));
          row.appendChild(rm);
          }
        list.appendChild(row);
        }
     },

    _switchProfile(name) {
      this._removeArm = null;
      this.profiles = T.Profiles.setActive(this.profiles, name);
      this._saveProfiles();
      this._applyProfile();
      this._renderProfiles();
     },

    _addProfile() {
      const P = T.Profiles;
      const input = this.els['profile-new-name'];
      const err = this.els['profile-error'];
      const res = P.add(this.profiles, input ? input.value : '');
      if (res.error) {
        if (err) {
          err.textContent = res.error === 'exists' ? 'That name is already taken.'
            : res.error === 'full' ? 'Up to ' + P.MAX_PROFILES + ' players on one device.'
            : 'Type a name first.';
          }
        return;
        }
      this.profiles = res.store;
      if (input) input.value = '';
      if (err) err.textContent = '';
      this._saveProfiles();
      this._applyProfile();
      this._renderProfiles();
      this._sfx('menu');
     },

     // Two taps to remove: the first arms the button ("Sure?"), the second
     // removes. Any other tap in the list disarms it.
    _removeProfile(name) {
      if (this._removeArm !== name) {
        this._removeArm = name;
        this._renderProfiles();
        return;
        }
      this._removeArm = null;
      this.profiles = T.Profiles.remove(this.profiles, name);
      this._saveProfiles();
      this._applyProfile();
      this._renderProfiles();
     },

     // ---- touch layout editor (Phase 27) ----
     // Commit a new layout: save to the active profile, re-render the live
     // touch controls and the editor, show a hint.
    _setLayout(layout, hint) {
      if (!layout) return false;
      this.layout = layout;
      this.profiles = T.Profiles.update(this.profiles, { layout: layout });
      this._saveProfiles();
      if (T.Touch && T.Touch.render && T.Touch._controls) T.Touch.render(layout);
      this._laySel = null;
      this._renderLayoutEditor();
      this._layoutHint(hint || '', false);
      return true;
     },

    _layoutMirror() {
      const m = T.Layout.mirror(this.layout);
      if (!m) { this._layoutHint('That layout can\'t be mirrored.', true); return; }
      this._setLayout(m, 'Mirrored.');
     },

    _layoutHint(text, isError) {
      const el = this.els['layout-hint'];
      if (!el) return;
      el.textContent = text || 'Tap a button, then tap where it should go. Tap it again to make it wide.';
      el.classList.toggle('is-error', !!isError);
     },

     // Tap flow: pick up an action, then drop it on a cell (or on another
     // button to swap); tapping the picked-up button again toggles wide.
    _layoutTapAction(action) {
      const L = T.Layout;
      if (this._laySel === null) {
        this._laySel = action;
        this._renderLayoutEditor();
        this._layoutHint('Now tap a cell to move ' + L.LABELS[action].aria.toLowerCase() +
                         ', or tap it again to toggle wide.', false);
        return;
        }
      if (this._laySel === action) {
        const next = L.setWide(this.layout, action, this.layout[action].w === 1);
        if (!next) { this._layoutHint('No room to widen that here.', true); return; }
        this._setLayout(next, (next[action].w === 2 ? 'Widened.' : 'Narrowed.'));
        return;
        }
      const cell = this.layout[action];
      const moved = L.move(this.layout, this._laySel, cell.c, cell.r);
      if (!moved) { this._layoutHint('Those two can\'t swap.', true); return; }
      this._setLayout(moved, 'Swapped.');
     },

    _layoutTapCell(c, r) {
      if (this._laySel === null) {
        this._layoutHint('Tap a button first, then a cell.', false);
        return;
        }
      const moved = T.Layout.move(this.layout, this._laySel, c, r);
      if (!moved) { this._layoutHint('It doesn\'t fit there (buttons can\'t cross the middle).', true); return; }
      this._setLayout(moved, 'Moved.');
     },

     // Paint the 6x3 grid: dashed target cells underneath, the seven buttons
     // on top at their layout positions. Presets highlight when matched.
    _renderLayoutEditor() {
      const L = T.Layout;
      const grid = this.els['layout-editor'];
      if (!grid || !L || !this.layout) return;
      if (grid.replaceChildren) grid.replaceChildren(); else grid.innerHTML = '';
      const style = (el, prop, val) => { if (el.style) el.style[prop] = val; };
      for (let r = 0; r < L.ROWS; r++) {
        for (let c = 0; c < L.COLS; c++) {
          const cell = document.createElement('button');
          cell.className = 'lay-cell' + (c === L.SPLIT ? ' lay-split' : '');
          cell.setAttribute('type', 'button');
          cell.setAttribute('aria-label', 'Cell ' + (c + 1) + ', row ' + (r + 1));
          cell.dataset.c = String(c);
          cell.dataset.r = String(r);
          style(cell, 'gridColumn', String(c + 1));
          style(cell, 'gridRow', String(r + 1));
          this._on(cell, () => this._layoutTapCell(c, r));
          grid.appendChild(cell);
          }
        }
      for (const action of L.ACTIONS) {
        const cell = this.layout[action];
        const label = L.LABELS[action];
        const btn = document.createElement('button');
        btn.className = 'lay-btn' + (label.primary ? ' lay-primary' : '') +
                        (label.small ? ' lay-small' : '') +
                        (cell.c === L.SPLIT ? ' lay-split' : '') +
                        (this._laySel === action ? ' is-selected' : '');
        btn.setAttribute('type', 'button');
        btn.setAttribute('aria-label', label.aria + (this._laySel === action ? ' (selected)' : ''));
        btn.dataset.action = action;
        btn.textContent = label.text;
        style(btn, 'gridColumn', (cell.c + 1) + ' / span ' + cell.w);
        style(btn, 'gridRow', String(cell.r + 1));
        this._on(btn, () => this._layoutTapAction(action));
        grid.appendChild(btn);
        }
      const presets = this.els['layout-presets'];
      if (presets) {
        const match = L.presetOf(this.layout);
        for (const b of presets.children) b.classList.toggle('active', b.dataset.preset === match);
        }
     },

     // ---- leaderboard screen (Phase 25) ----
     // Overlays Home or Game Over; Back returns there (the game-over overlay
     // is re-shown underneath, with the run's name box still live).
    openLeaderboard(from) {
      this._lbReturn = (from === 'gameover') ? 'gameover' : 'home';
      if (from === 'gameover' && this.game && this.game.config) {
        this._lbMode = this.game.config.mode;
        }
      this._hideOverlay('gameover');
      this._showOverlay('leaderboard');
      this._renderLeaderboard();
      this._syncInput();
      this._sfx('menu');
      this._blur();
     },

    closeLeaderboard() {
      this._hideOverlay('leaderboard');
      if (this._lbReturn === 'gameover') this._showOverlay('gameover');
      this._syncInput();
      this._sfx('menu');
      this._blur();
     },

    _showLeaderboardMode(mode) {
      if (T.Leaderboard.MODES.indexOf(mode) < 0) return;
      this._lbMode = mode;
      this._renderLeaderboard();
     },

     // Paint the table for the current tab. Columns come from
     // Leaderboard.COLUMNS so each mode shows its own data (Sprint leads with
     // time, Marathon adds level, etc.). The run just finished is highlighted.
    _renderLeaderboard() {
      const L = T.Leaderboard;
      const mode = this._lbMode;
      const seg = this.els['leaderboard-seg'];
      if (seg) {
        for (const b of seg.children) b.classList.toggle('active', b.dataset.mode === mode);
        }
      const list = (this.board && this.board[mode]) || [];
      const table = this.els['leaderboard-table'];
      const empty = this.els['leaderboard-empty'];
      const recordEl = this.els['leaderboard-record'];
      if (recordEl) recordEl.innerHTML = this._recordHtml(mode);
      if (!table) return;
      table.innerHTML = '';
      if (empty) empty.classList.toggle('is-hidden', list.length > 0);
      if (table.parentNode && table.parentNode.classList) {
        table.parentNode.classList.toggle('is-hidden', list.length === 0);
        }
      if (!list.length) return;

      const cols = L.COLUMNS[mode];
      const thead = document.createElement('thead');
      const hr = document.createElement('tr');
      this._cell(hr, 'th', '#', 'lb-col-rank');
      this._cell(hr, 'th', 'Name', 'lb-col-name');
      for (const c of cols) this._cell(hr, 'th', c.label, 'lb-col-' + c.key);
      thead.appendChild(hr);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      const you = this._lastEntry;
      list.forEach((e, i) => {
        const tr = document.createElement('tr');
        let cls = '';
        if (i === 0) cls += ' is-first';
        if (you && you.mode === mode && you.id === e.id) cls += ' is-you';
        tr.className = cls.trim();
        this._cell(tr, 'td', String(i + 1), 'lb-col-rank');
        this._cell(tr, 'td', e.name, 'lb-col-name');
        for (const c of cols) this._cell(tr, 'td', c.fmt(e), 'lb-col-' + c.key);
        tbody.appendChild(tr);
        });
      table.appendChild(tbody);
     },

    _cell(row, tag, text, cls) {
      const el = document.createElement(tag);
      el.className = cls || '';
      el.textContent = text;
      row.appendChild(el);
      return el;
     },

     // "Record: NAME — 12,345 (Hard)" for a mode, or a prompt if empty.
    _recordHtml(mode) {
      const L = T.Leaderboard;
      const rec = L.record(this.board, mode);
      if (!rec) return 'No ' + L.MODE_NAMES[mode] + ' record yet.';
      return L.MODE_NAMES[mode] + ' record: <b>' + this._esc(rec.name) + '</b> — <b>' +
        L.headline(mode, rec) + '</b> (' + (L.DIFF_NAMES[rec.difficulty] || '') + ')';
     },

    _esc(str) {
      return String(str).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
     },

     // ---- leaderboard data (Phase 25) ----
    _loadLeaderboard() {
      const L = T.Leaderboard;
      let raw = null, name = '';
      try {
        raw = localStorage.getItem(LB_KEY);
        name = localStorage.getItem(NAME_KEY) || '';
        } catch (e) { /* no storage — the board still works for this session */ }
      this.board = L ? L.parse(raw) : null;
      this.playerName = name ? L.sanitizeName(name) : '';
     },

    _saveLeaderboard() {
      try {
        localStorage.setItem(LB_KEY, T.Leaderboard.serialize(this.board));
        if (this.playerName) localStorage.setItem(NAME_KEY, this.playerName);
        } catch (e) { /* ignore — the in-memory board is still current */ }
     },

     // Save the finished run immediately (so a Retry without typing never
     // loses it), then show where it placed and what the record is. The name
     // box is prefilled with the last name used and edits the saved row live.
    _recordResult(g) {
      const L = T.Leaderboard;
      if (!L || !g || !g.config) return;
      if (!this.board) this.board = L.create();
      const mode = g.config.mode;
      const prevRecord = L.record(this.board, mode);
      const entry = L.entryFromGame(g, this.playerName || L.DEFAULT_NAME);
      const res = L.insert(this.board, entry);
      this.board = res.board;
      this._lastEntry = res.rank ? { mode: mode, id: entry.id, rank: res.rank } : null;
      if (res.rank) this._saveLeaderboard();

      const rankEl = this.els['gameover-rank'];
      const recEl = this.els['gameover-record'];
      const wrap = this.els['gameover-name-wrap'];
      const nameEl = this.els['gameover-name'];
      if (rankEl) {
        rankEl.classList.remove('is-record', 'is-miss');
        if (res.rank === 1) {
          rankEl.textContent = 'NEW RECORD!';
          rankEl.classList.add('is-record');
          } else if (res.rank) {
          rankEl.textContent = '#' + res.rank + ' on the ' + L.MODE_NAMES[mode] + ' board';
          } else if (mode === 'sprint' && !entry.won) {
          rankEl.textContent = 'Finish all 40 lines to rank';
          rankEl.classList.add('is-miss');
          } else if (!L.qualifies(entry)) {
          rankEl.textContent = 'Score a point to rank';
          rankEl.classList.add('is-miss');
          } else {
          rankEl.textContent = 'Not in the top ' + L.MAX;
          rankEl.classList.add('is-miss');
          }
        }
      if (recEl) {
        // Show the record that stood *before* this run when it was beaten, so
        // the player sees what they toppled; otherwise the current record.
        if (res.rank === 1 && prevRecord) {
          recEl.innerHTML = 'Previous record: <b>' + this._esc(prevRecord.name) + '</b> — <b>' +
            L.headline(mode, prevRecord) + '</b>';
          } else if (res.rank === 1) {
          recEl.innerHTML = 'First ' + L.MODE_NAMES[mode] + ' record on this device — <b>' +
            L.headline(mode, entry) + '</b>';
          } else {
          recEl.innerHTML = this._recordHtml(mode);
          }
        }
      if (wrap) wrap.classList.toggle('is-hidden', !res.rank);
      if (nameEl) {
        nameEl.value = this.playerName || '';
        if (res.rank && typeof root.setTimeout === 'function') {
          // Focus after the overlay fades in; typing goes to the box, not the game.
          root.setTimeout(() => { try { nameEl.focus(); nameEl.select(); } catch (e) {} }, 250);
          }
        }
     },

     // Live rename of the row saved by _recordResult; persists on every key.
    _renameEntry(raw) {
      const L = T.Leaderboard;
      if (!L || !this._lastEntry || !this.board) return;
      const name = L.sanitizeName(raw);
      this.playerName = name;
      this.board = L.rename(this.board, this._lastEntry.mode, this._lastEntry.id, name);
      this._saveLeaderboard();
      if (this.profiles && T.Profiles) {
        this.profiles = T.Profiles.update(this.profiles, { lbName: name });
        this._saveProfiles();
        }
     },

     // ---- screen show/hide ----
    _showPage(name) {
      this._page = name;
      for (const s of PAGES) this.els['screen-' + s].classList.add('hidden');
      this.els['screen-' + name].classList.remove('hidden');
     },

    _showOverlay(name) {
      this.els['screen-' + name].classList.remove('hidden');
     },

    _hideOverlay(name) {
      this.els['screen-' + name].classList.add('hidden');
     },

    _hideOverlays() {
      for (const o of OVERLAYS) this._hideOverlay(o);
     },

     // Public: is the in-game board the visible page? main.js uses this to
     // decide whether to render a frame.
    isGameVisible() {
      return this._page === 'game'
          && !this.els['screen-game'].classList.contains('hidden');
     },

     // Enable keyboard input only while the board is up and no modal
     // (settings) overlay is blocking it. The pause overlay keeps input on so
     // Esc/P can resume.
    _syncInput() {
      const inGame = this._page === 'game';
      const settingsUp = !this.els['screen-settings'].classList.contains('hidden');
      const lbEl = this.els['screen-leaderboard'];
      const lbUp = !!lbEl && !lbEl.classList.contains('hidden');
      const prEl = this.els['screen-profile'];
      const prUp = !!prEl && !prEl.classList.contains('hidden');
      const on = inGame && !settingsUp && !lbUp && !prUp;
      T.Input.setEnabled(on);
      // Phase 14: the touch layer gates identically to the keyboard.
      if (T.Touch && T.Touch.setEnabled) T.Touch.setEnabled(on);
     },

     // ---- mode select ----
    _selectDifficulty(diff) {
      this._diff = diff;
      for (const b of this.els['difficulty-seg'].children) {
        b.classList.toggle('active', b.dataset.difficulty === diff);
        }
     },

     // ---- HUD ----
     // Paint the stat readouts for the current game. Which stats show depends
     // on the mode: Classic hides level, Sprint shows "n / 40" + time and
     // hides score/level, Marathon shows everything.
    _updateHUD(g) {
      if (!g) return;
      const mode = g.config.mode;
      this._setHudValue('time', this._fmtTime(g.timeMs), 'flash');

      if (mode === 'sprint') {
        this._showStat('stat-score', false);
        this._showStat('stat-level', false);
        this._showStat('stat-lines', true);
        this._showStat('stat-time', true);
        this._setHudValue('lines', g.linesCleared + ' / 40', 'flash');
       } else if (mode === 'marathon') {
        this._showStat('stat-score', true);
        this._showStat('stat-level', true);
        this._showStat('stat-lines', true);
        this._showStat('stat-time', true);
        this._setHudValue('score', String(g.score), 'flash');
        this._setHudValue('level', String(g.level), (this._lastHud.level !== undefined && g.level > Number(this._lastHud.level)) ? 'level-flash' : 'flash');
        this._setHudValue('lines', String(g.linesCleared), 'flash');
       } else { // classic
        this._showStat('stat-score', true);
        this._showStat('stat-level', false);
        this._showStat('stat-lines', true);
        this._showStat('stat-time', true);
        this._setHudValue('score', String(g.score), 'flash');
        this._setHudValue('lines', String(g.linesCleared), 'flash');
        }
     },

     // Phase 22: set a HUD readout and briefly flash its stat tile when the
     // value changes. `flashClass` is 'flash' for normal bumps or 'level-flash'
     // for a level-up. Reduced-motion users get the new value instantly with
     // no animation (CSS disables the keyframes).
    _setHudValue(key, value, flashClass) {
      const last = this._lastHud[key];
      this._lastHud[key] = value;
      const el = this.els['val-' + key];
      if (el) el.textContent = value;
      if (last !== undefined && last !== value) {
        const stat = el && el.closest('.stat');
        if (stat) this._flashStat(stat, flashClass || 'flash');
        }
     },

    _flashStat(stat, flashClass) {
      stat.classList.remove('flash', 'level-flash');
      void stat.offsetWidth; // force reflow so a re-triggered flash plays
      stat.classList.add(flashClass);
      const ms = flashClass === 'level-flash' ? 420 : 280;
      window.setTimeout(() => stat.classList.remove(flashClass), ms);
     },

    _showStat(id, show) {
      this.els[id].classList.toggle('is-hidden', !show);
     },

     // mm:ss from milliseconds.
    _fmtTime(ms) {
      const total = Math.max(0, Math.floor((ms || 0) / 1000));
      const m = Math.floor(total / 60);
      const s = total % 60;
      return m + ':' + (s < 10 ? '0' + s : s);
     },

     // ---- game over stats ----
    _fillGameOver() {
      const g = this.game;
      const mode = g.config.mode;
      const won = g.result === 'won';
      const title = this.els['gameover-title'];
      const stats = this.els['gameover-stats'];
      stats.innerHTML = '';

      if (mode === 'sprint') {
        title.textContent = won ? '40 Lines!' : 'Incomplete';
        this._statRow(stats, 'Time', this._fmtTime(g.timeMs), true);
        this._statRow(stats, 'Lines', String(g.linesCleared), false, true, ' / 40');
       } else {
        title.textContent = won ? 'You Won!' : 'Game Over';
        if (mode === 'marathon') {
          this._statRow(stats, 'Level', String(g.level), true, true);
          this._statRow(stats, 'Score', String(g.score), false, true);
          this._statRow(stats, 'Lines', String(g.linesCleared), false, true);
          this._statRow(stats, 'Time', this._fmtTime(g.timeMs), false);
         } else { // classic
          this._statRow(stats, 'Score', String(g.score), true, true);
          this._statRow(stats, 'Lines', String(g.linesCleared), false, true);
          this._statRow(stats, 'Time', this._fmtTime(g.timeMs), false);
         }
       }
     },

    _statRow(container, label, value, headline, countUp, suffix) {
      const row = document.createElement('div');
      row.className = 'stat-row' + (headline ? ' headline' : '');
      const k = document.createElement('span');
      k.className = 'k';
      k.textContent = label;
      const v = document.createElement('span');
      v.className = 'v';
      v.textContent = countUp ? ('0' + (suffix || '')) : value;
      row.appendChild(k);
      row.appendChild(v);
      container.appendChild(row);
      if (countUp) this._countUp(v, value, suffix || '', 700);
      return v;
     },

     // Phase 22: animate a numeric readout from 0 to its final value. Only
     // plain integers animate; formatted strings like mm:ss are set instantly.
     // Honors prefers-reduced-motion (no animation). If a new screen replaces
     // this element mid-animation, the rAF simply writes to the detached node.
    _countUp(el, targetValue, suffix, durationMs) {
      const clean = String(targetValue).replace(/,/g, '');
      const target = parseInt(clean, 10);
      if (!isFinite(target) || target <= 0) {
        el.textContent = targetValue + suffix;
        return;
        }
      const reduced = (typeof window !== 'undefined' && window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      if (reduced) {
        el.textContent = targetValue + suffix;
        return;
        }
      const startTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
      const step = (now) => {
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / durationMs);
        const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic
        const current = Math.round(target * ease);
        el.textContent = current + suffix;
        if (t < 1) requestAnimationFrame(step);
        else el.textContent = targetValue + suffix;
        };
      requestAnimationFrame(step);
     },

     // ---- settings (persisted + live) ----
    _loadSettings() {
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
          const p = JSON.parse(raw);
          if (typeof p.music === 'boolean') this.settings.music = p.music;
          if (typeof p.sfx === 'boolean') this.settings.sfx = p.sfx;
          }
       } catch (e) {
        // localStorage unavailable (some file:// contexts) — keep defaults.
       }
     },

    _saveSettings() {
      // Phase 27: the profile is the source of truth; the legacy key is kept
      // in step so a downgrade (or the seed on a fresh profile) still works.
      if (this.profiles && T.Profiles) {
        this.profiles = T.Profiles.update(this.profiles, { settings: this.settings });
        this._saveProfiles();
        }
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(this.settings));
        } catch (e) {
        // ignore — settings still apply live even if we can't persist them.
        }
     },

     // Flip a toggle, persist, and apply it to the audio layer live.
    _flip(key) {
      this.settings[key] = !this.settings[key];
      this._saveSettings();
      this._syncToggles();
      this._applyAudio();
     },

     // Reflect the current settings onto the two toggle buttons.
    _syncToggles() {
      this._setToggle('toggle-music', this.settings.music);
      this._setToggle('toggle-sfx', this.settings.sfx);
     },

    _setToggle(id, on) {
      const el = this.els[id];
      el.classList.toggle('on', !!on);
      el.textContent = on ? 'On' : 'Off';
      el.setAttribute('aria-checked', on ? 'true' : 'false');
     },

     // ---- audio hooks (Phase 10 fills these in; safe no-ops until then) ----
     // Every call guards on T.Audio being present + the relevant capability,
     // so Phase 9 works before audio.js exists and Phase 10 can wire it in
     // without touching this file.
    _sfx(name) {
      if (this.settings.sfx && T.Audio && T.Audio.play) T.Audio.play(name);
     },

    _startMusic() {
      if (this.settings.music && T.Audio && T.Audio.startMusic) T.Audio.startMusic();
     },

    _stopMusic() {
      if (T.Audio && T.Audio.stopMusic) T.Audio.stopMusic();
     },

    _applyAudio() {
      if (T.Audio && T.Audio.apply) T.Audio.apply(this.settings);
     },

     // The AudioContext must be unlocked by a real user gesture, not on load.
    _unlockAudio() {
      if (!T.Audio || !T.Audio.unlock) return;
      const unlock = () => T.Audio.unlock();
      window.addEventListener('pointerdown', unlock, { once: true });
      window.addEventListener('keydown', unlock, { once: true });
     },

     // Drop focus so a Space/Enter right after a click doesn't re-fire it.
    _blur() {
      try {
        if (document.activeElement && document.activeElement.blur) {
          document.activeElement.blur();
          }
        } catch (e) { /* no-op */ }
     },
   };

  root.Tetris.UI = UI;
})(typeof window !== 'undefined' ? window : globalThis);
