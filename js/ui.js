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
  const OVERLAYS = ['pause', 'settings', 'gameover'];

  const LS_KEY = 'tetrio-settings';
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

     // ---- boot ----
     // Cache elements, load settings, wire every button, show the home
     // screen. Idempotent enough to call once from main.js on DOMContentLoaded.
    init() {
      this._cache();
      this._loadSettings();
      this._bind();
      this._syncToggles();
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
      on('toggle-music', () => this._flip('music'));
      on('toggle-sfx', () => this._flip('sfx'));

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
      this._showPage('game');
      this._hideOverlays();
      T.Input.bind(this.game);
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
      this._fillGameOver();
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
      T.Input.setEnabled(inGame && !settingsUp);
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
      this.els['val-time'].textContent = this._fmtTime(g.timeMs);

      if (mode === 'sprint') {
        this._showStat('stat-score', false);
        this._showStat('stat-level', false);
        this._showStat('stat-lines', true);
        this._showStat('stat-time', true);
        this.els['val-lines'].textContent = g.linesCleared + ' / 40';
       } else if (mode === 'marathon') {
        this._showStat('stat-score', true);
        this._showStat('stat-level', true);
        this._showStat('stat-lines', true);
        this._showStat('stat-time', true);
        this.els['val-score'].textContent = g.score;
        this.els['val-level'].textContent = g.level;
        this.els['val-lines'].textContent = g.linesCleared;
       } else { // classic
        this._showStat('stat-score', true);
        this._showStat('stat-level', false);
        this._showStat('stat-lines', true);
        this._showStat('stat-time', true);
        this.els['val-score'].textContent = g.score;
        this.els['val-lines'].textContent = g.linesCleared;
        }
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
        this._statRow(stats, 'Lines', g.linesCleared + ' / 40', false);
       } else {
        title.textContent = won ? 'You Won!' : 'Game Over';
        if (mode === 'marathon') {
          this._statRow(stats, 'Level', String(g.level), true);
          this._statRow(stats, 'Score', String(g.score), false);
          this._statRow(stats, 'Lines', String(g.linesCleared), false);
          this._statRow(stats, 'Time', this._fmtTime(g.timeMs), false);
         } else { // classic
          this._statRow(stats, 'Score', String(g.score), true);
          this._statRow(stats, 'Lines', String(g.linesCleared), false);
          this._statRow(stats, 'Time', this._fmtTime(g.timeMs), false);
         }
       }
     },

    _statRow(container, label, value, headline) {
      const row = document.createElement('div');
      row.className = 'stat-row' + (headline ? ' headline' : '');
      const k = document.createElement('span');
      k.className = 'k';
      k.textContent = label;
      const v = document.createElement('span');
      v.className = 'v';
      v.textContent = value;
      row.appendChild(k);
      row.appendChild(v);
      container.appendChild(row);
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
