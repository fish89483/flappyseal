/* Shared simulation: no DOM, so rules can be verified independently of rendering. */
(function (root) {
  'use strict';
  const SPEED_MIN = 200, SPEED_MAX = 800, CAMERA_DISTANCE = 160, ACTION_TIME = .2, LANE_TIME = .18;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lookAhead = speed => Math.max(900, speed * 7);
  const formatDistance = meters => meters > 10000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.floor(meters)} m`;
  function hiddenEntry(hasFlapped, cause, entered) {
    return cause === 'ground' && !hasFlapped && !entered;
  }
  function create(random = Math.random) {
    const s = {
      mode: 'menu', distance: 0, travelled: 0, speed: 200, initialSpeed: 200, elapsed: 0,
      lane: 1, x: 1, jump: 0, duck: 0, duckHeld: false, jumpDuration: .5, jumpTotal: .5, hurt: 0, invincible: 0, hitStop: 0,
      hearts: 3, fish: 0, rows: [], events: [], nextRow: 110, safeLane: 1, obstacleInterval: .8,
      tutorial: null, tutorialDone: false
    };
    function emit(type) { s.events.push(type); }
    function reset(tutorial = false, initialSpeed = 200, jumpDuration = .5, obstacleInterval = .8) {
      initialSpeed = Number.isFinite(initialSpeed) ? clamp(initialSpeed, SPEED_MIN, SPEED_MAX) : 200;
      Object.assign(s, { mode: 'play', distance: 0, travelled: 0, speed: initialSpeed, initialSpeed, elapsed: 0,
        lane: 1, x: 1, jump: 0, duck: 0, duckHeld: false, jumpDuration: .5, jumpTotal: .5, hurt: 0, invincible: 0, hitStop: 0,
        hearts: 3, fish: 0, rows: [], events: [], nextRow: initialSpeed * 3.2, safeLane: 1,
        tutorial: tutorial ? { step: 0, wait: 3, active: false, success: false } : null,
        tutorialDone: false });
      setJumpDuration(jumpDuration); setObstacleInterval(obstacleInterval);
    }
    function input(action) {
      if (s.mode !== 'play' || s.hitStop > 0) return false;
      if (action === 'left' || action === 'right') {
        const lane = clamp(s.lane + (action === 'left' ? -1 : 1), 0, 2);
        if (lane === s.lane) return false;
        s.lane = lane; emit('lane'); return true;
      }
      if (action === 'duck') s.duckHeld = true;
      if (s.jump > 0 || s.duck > 0) return false;
      if (action === 'jump') { s.jump = s.jumpTotal = s.jumpDuration; emit('jump'); return true; }
      if (action === 'duck') { s.duck = 1; emit('duck'); return true; }
      return false;
    }
    function setObstacleInterval(seconds) { s.obstacleInterval = Number.isFinite(seconds) ? clamp(seconds, .2, 2) : .8; }
    function obstacleInterval() {
      const levels = s.distance < 15000 ? 0 : 1 + Math.floor((s.distance - 15000) / 15000);
      return Math.max(.2, Math.round((s.obstacleInterval - levels * .1) * 100) / 100);
    }
    function setJumpDuration(seconds) { s.jumpDuration = Number.isFinite(seconds) ? clamp(seconds, .2, 1) : .5; }
    function release(action) { if (action === 'duck') { s.duckHeld = false; s.duck = 0; } }
    function jumpHeight() { return s.jump > 0 ? Math.sin(Math.PI * (1 - s.jump / s.jumpTotal)) : 0; }
    function avoids(type) {
      return type === 'gap' ? jumpHeight() > .42 : type === 'arch' ? s.duck > 0 : false;
    }
    function collect() {
      s.fish++;
      if (s.fish === 3) { s.fish = 0; s.hearts++; emit('heart'); }
      else emit('fish');
    }
    function damage() {
      if (s.invincible > 0 || s.mode !== 'play' || s.tutorial) return;
      s.hearts--; s.hitStop = .2; s.invincible = 1.5; s.hurt = .55; emit('hurt');
      if (s.hearts <= 0) { s.mode = 'over'; emit('over'); }
    }
    // Each row reserves a reachable open lane, with a configurable interval at generation speed.
    function generateRow(z) {
      const choices = [0, 1, 2].filter(lane => Math.abs(lane - s.safeLane) <= 1);
      const safe = choices[Math.floor(random() * choices.length)];
      s.safeLane = safe;
      const lanes = [0, 1, 2].filter(lane => lane !== safe);
      if (random() < .5) lanes.reverse();
      const count = s.distance > 220 && random() < .6 ? 2 : 1;
      const types = ['block', 'gap', 'arch'];
      const row = { z, safe, obstacles: lanes.slice(0, count).map(lane => ({ lane, type: types[Math.floor(random() * 3)] })), checked: false };
      s.rows.push(row);
      // Fish stay on the open lane, with time to align before the obstacle row.
      if (random() < .15) s.rows.push({ z: z - 16, fish: safe, checked: false });
      return row;
    }
    function tutorialTick(dt) {
      const t = s.tutorial;
      if (!t || t.active) return;
      t.wait -= dt;
      if (t.wait > 0) return;
      if (t.step >= 3) {
        if (t.step === 3) { t.step = 4; t.wait = 3; emit('fish-tip'); return; }
        s.tutorial = null; s.tutorialDone = true; s.distance = 0;
        s.rows = []; s.nextRow = s.travelled + s.speed * 3.2; emit('tutorial-done'); return;
      }
      const type = ['block', 'gap', 'arch'][t.step];
      t.active = true;
      s.rows.push({ z: s.speed * 3.8, obstacles: [{ lane: s.lane, type }], tutorial: true, checked: false });
      emit('lesson');
    }
    function step(dt) {
      if (s.mode !== 'play') return;
      if (s.hitStop > 0) {
        const stopped = Math.min(dt, s.hitStop);
        s.hitStop = Math.max(0, s.hitStop - stopped);
        dt -= stopped;
        if (dt < 1e-8) return;
      }
      s.elapsed += dt;
      s.jump = Math.max(0, s.jump - dt); s.duck = s.duckHeld && s.jump === 0 ? 1 : 0;
      s.hurt = Math.max(0, s.hurt - dt); s.invincible = Math.max(0, s.invincible - dt);
      const delta = clamp(s.lane - s.x, -dt / LANE_TIME, dt / LANE_TIME);
      s.x = clamp(s.x + delta, 0, 2);
      if (Math.abs(s.x - s.lane) < 1e-8) s.x = s.lane;
      s.speed = s.tutorial ? s.initialSpeed : Math.min(SPEED_MAX, s.initialSpeed + s.distance / 150);
      const moved = s.speed * dt;
      s.travelled += moved;
      if (!s.tutorial) s.distance += moved;
      tutorialTick(dt);
      if (!s.tutorial) {
        while (s.nextRow - s.travelled < lookAhead(s.speed)) {
          generateRow(s.nextRow - s.travelled);
          s.nextRow += s.speed * obstacleInterval();
        }
      }
      for (const row of s.rows) {
        const before = row.z; row.z -= moved;
        if (row.checked || before < 0 || row.z > 0) continue;
        row.checked = true;
        if (row.fish !== undefined) {
          if (Math.abs(row.fish - s.x) < .48) collect();
          continue;
        }
        const collided = row.obstacles.filter(o => Math.abs(o.lane - s.x) < .6 && !avoids(o.type));
        const failed = collided.length > 0;
        if (row.tutorial && s.tutorial) {
          const t = s.tutorial;
          t.active = false; t.success = !failed; t.wait = failed ? 1.2 : 1.5;
          if (!failed) { t.step++; emit('lesson-pass'); } else emit('lesson-retry');
        } else if (failed) {
          damage();
          for (const o of collided) o.flashUntil = s.elapsed + s.invincible;
        } else if (row.obstacles.some(o => Math.abs(o.lane - s.x) < .6 && avoids(o.type))) {
          emit('dodge');
        }
        if (s.mode === 'over') break;
      }
      // Keep travelling at world speed until past the camera; the renderer culls full sprite bounds.
      s.rows = s.rows.filter(row => !row.checked || (row.fish === undefined && row.z > -CAMERA_DISTANCE));
    }
    function update(seconds) {
      if (!Number.isFinite(seconds) || seconds <= 0) return;
      // Bounded simulation steps preserve collisions and inputs during uneven rendering.
      let remaining = Math.min(seconds, .25);
      while (remaining > 1e-8 && s.mode === 'play') {
        const dt = Math.min(remaining, 1 / 120); step(dt); remaining -= dt;
      }
    }
    return { state: s, reset, input, release, setJumpDuration, setObstacleInterval, obstacleInterval, update, jumpHeight, generateRow };
  }
  const api = { create, hiddenEntry, lookAhead, formatDistance, SPEED_MIN, SPEED_MAX, CAMERA_DISTANCE, ACTION_TIME, LANE_TIME };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SealSlideCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
