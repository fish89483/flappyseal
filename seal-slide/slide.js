(() => {
  'use strict';
  const assetBase = new URL('../assets/seal-slide/', document.currentScript.src);
  const formatDistance = SealSlideCore.formatDistance;
  const assetURL = new URL('seal-b-six-poses.png', assetBase).href;
  const read = (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
  const write = (key, value) => { try { localStorage.setItem(key, String(value)); } catch { /* Private mode can disable storage. */ } };
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const noise = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };

  function create({ host, onExit }) {
    const root = document.createElement('section');
    root.className = 'seal-slide'; root.hidden = true;
    root.setAttribute('aria-label', '海豹滑行');
    root.innerHTML = `
      <canvas width="480" height="800" tabindex="0" aria-label="海豹滑行：方向鍵或 WASD 換道、跳躍、攤平；Esc 暫停"></canvas>
      <div class="slide-hud" hidden>
        <div class="slide-vitals"><div class="slide-panel" aria-label="愛心"><span class="slide-icon" aria-hidden="true">♥</span><span data-hearts>×3</span></div><div class="slide-panel" aria-label="魚收集進度"><canvas class="slide-fish-icon" width="32" height="22" data-fish-icon aria-hidden="true"></canvas><span data-fish>0/3</span></div></div>
        <div class="slide-panel slide-distance"><strong data-distance>0 m</strong><small data-best>BEST 0 m</small></div>
        <div class="slide-tools"><button class="slide-sound" type="button" aria-label="音效：開" aria-pressed="true">♪</button><button class="slide-pause" type="button" aria-label="暫停遊戲">Ⅱ</button></div>
      </div>
      <div class="slide-modal"><div class="slide-card"></div></div>
      <div class="slide-toast" role="status" hidden></div><div class="slide-live" aria-live="polite"></div>`;
    host.append(root);
    const canvas = root.querySelector('canvas'), ctx = canvas.getContext('2d');
    const hud = root.querySelector('.slide-hud'), modal = root.querySelector('.slide-modal');
    const card = root.querySelector('.slide-card'), toast = root.querySelector('.slide-toast');
    const sim = SealSlideCore.create(), s = sim.state;
    const sheet = new Image(), atlas = new Image(), centerPillar = new Image(), rightPillar = new Image(), snowBanks = new Image();
    const art = {}, pixels = new Map();
    const frames = [];
    let ready = false, loadFailed = false, width = 480, height = 800, horizon = 220, playerY = 650;
    let best = Number(read('seal-slide-best', '0'));
    if (!Number.isFinite(best) || best < 0) best = 0;
    if (read('seal-slide-settings-version', '0') !== '2') {
      write('seal-slide-initial-speed', 300); write('seal-slide-jump-duration', .4);
      write('seal-slide-obstacle-interval', .8); write('seal-slide-settings-version', 2);
    }
    const initialSpeed = 300;
    let jumpDuration = Number(read('seal-slide-jump-duration', '0.4'));
    jumpDuration = Number.isFinite(jumpDuration) ? clamp(jumpDuration, .2, 1) : .4;
    let obstacleInterval = Number(read('seal-slide-obstacle-interval', '0.8'));
    obstacleInterval = Number.isFinite(obstacleInterval) ? clamp(obstacleInterval, .2, 2) : .8;
    const duckKeys = new Set();
    let newRecord = false, sound = read('seal-slide-sound', '1') !== '0', audio;
    let last = null, animation = 0, visualTime = 0, transition = null, toastTime = 0, lastLesson = '';
    let touch = null;
    const mobile = () => matchMedia('(pointer: coarse)').matches;
    const scenery = document.createElement('canvas');

    function rect(x, y, w, h, color, c = ctx) {
      c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), Math.ceil(w), Math.ceil(h));
    }
    function poly(points, color, c = ctx) {
      c.fillStyle = color; c.beginPath();
      points.forEach(([x, y], i) => i ? c.lineTo(Math.round(x), Math.round(y)) : c.moveTo(Math.round(x), Math.round(y)));
      c.closePath(); c.fill();
    }
    function sprite(name, x, bottom, w, c = ctx) {
      const a = art[name]; if (!a) return;
      const r = a.frame, h = w * r.h / r.w;
      if (c === ctx && (bottom - h > height || bottom < 0 || x + w / 2 < 0 || x - w / 2 > width)) return;
      c.drawImage(a.image, r.x, r.y, r.w, r.h, Math.round(x - w / 2), Math.round(bottom - h), Math.round(w), Math.round(h));
    }
    function buildScenery() {
      scenery.width = width; scenery.height = height;
      const c = scenery.getContext('2d'); c.imageSmoothingEnabled = false;
      rect(0, 0, width, height, '#2e83d5', c);
      for (let i = 0; i < 5; i++) sprite('cloud', width * noise(i + 30), 58 + noise(i + 60) * 58, 42 + noise(i) * 28, c);
      for (let x = -210; x < width + 230; x += 300) sprite('mountains', x + 200, horizon + 10, 430, c);
      rect(0, horizon + 10, width, height - horizon, '#0b65b3', c);
      for (let i = 0; i < 270; i++) rect(noise(i + 18) * width, horizon + 15 + noise(i + 300) * (height - horizon), 5 + noise(i) * 20, 2, ['#268bd2', '#4ca9e5', '#0d77c6'][i % 3], c);
    }
    function driftingIcebergs() {
      for (let band = 0; band < 12; band++) for (const side of [-1, 1]) {
        const t = .02 + noise(band * 71 + side * 101) * .94;
        const y = horizon + 28 + t * (height - horizon - 42);
        const half = (y - horizon) / (playerY - horizon) * Math.min(width * .49, 310);
        const w = 22 + t * 42 + noise(band + side * 30) * 29;
        const pad = w / 2 + 9, limit = width / 2 - half - w / 2 - 22;
        if (limit <= pad) continue;
        const fraction = .12 + noise(band * 7 + side * 39) * .76;
        const drift = Math.sin(visualTime * (.23 + noise(band + side * 55) * .24) + band * 1.7 + side) * (2 + noise(band + 90) * 4);
        const offset = clamp(pad + (limit - pad) * fraction + drift, pad, limit);
        sprite('iceberg', side < 0 ? offset : width - offset, y, w);
      }
    }
    function resize() {
      const r = host.getBoundingClientRect();
      height = 800; width = Math.max(320, Math.round(height * r.width / Math.max(1, r.height)));
      canvas.width = width; canvas.height = height; ctx.imageSmoothingEnabled = false;
      horizon = 220; playerY = 650; buildScenery();
      if (!root.hidden) draw();
    }
    new ResizeObserver(resize).observe(host);
    function project(lane, z) {
      const depth = SealSlideCore.CAMERA_DISTANCE;
      const k = 1 / (1 + Math.max(-depth + .001, z) / depth);
      const half = Math.min(width * .49, 310) * k;
      return { x: width / 2 + (lane - 1) * half * 2 / 3, y: horizon + (playerY - horizon) * k, k, half };
    }
    function roadNear() {
      const y = height + 100, k = (y - horizon) / (playerY - horizon);
      return { x: width / 2, y, k, half: Math.min(width * .49, 310) * k };
    }
    function road() {
      // The lanes are logical only: the approved visual has no internal divider lines.
      const near = roadNear(), far = { x: width / 2, y: horizon, half: 0 };
      const ice = ctx.createLinearGradient(0, horizon, 0, height);
      ice.addColorStop(0, '#d3ebfa'); ice.addColorStop(1, '#f4fbff');
      poly([[far.x, far.y], [near.x + near.half, near.y], [near.x - near.half, near.y]], ice);
      drawSnowBank('bankLeft', -1); drawSnowBank('bankRight', 1);
      const scroll = s.travelled % 12;
      for (let i = 0; i < 75; i++) {
        const z = i * 4 - scroll, p = project(1, z);
        if (p.y > height) continue;
        const x = p.x + (noise(i + Math.floor(s.travelled / 12) * 3) * 1.8 - .9) * p.half;
        rect(x, p.y, (5 + noise(i + 5) * 16) * p.k, Math.max(1, p.k * 2), i % 3 ? '#cae6f5' : '#ffffff');
      }
    }
    function drawSnowBank(name, side) {
      const a = art[name]; if (!a) return;
      const r = a.frame;
      // Align the connected strip's inner edge with the runway, from foreground to horizon.
      const sx = side < 0 ? 225 : r.w - 225, sy = 675;
      const fx = side < 0 ? r.w - 46 : 46, fy = 45;
      const length = Math.hypot(fx - sx, fy - sy), ux = (fx - sx) / length, uy = (fy - sy) / length;
      const bottom = height + 65;
      const tx = width / 2 + side * (bottom - horizon) / (playerY - horizon) * Math.min(width * .49, 310);
      const ty = bottom, dx = width / 2 - tx, dy = horizon - ty;
      const targetLength = Math.hypot(dx, dy), nx = -dy / targetLength, ny = dx / targetLength;
      const thickness = Math.min(62, width * .105) / 250;
      const aa = dx / length * ux + nx * thickness * -uy;
      const b = dy / length * ux + ny * thickness * -uy;
      const c = dx / length * uy + nx * thickness * ux;
      const d = dy / length * uy + ny * thickness * ux;
      ctx.save();
      ctx.transform(aa, b, c, d, tx - aa * sx - c * sy, ty - b * sx - d * sy);
      ctx.drawImage(a.image, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      ctx.restore();
    }
    function shadow(x, y, rx, ry, color) {
      ctx.save(); ctx.globalAlpha = .55; ctx.fillStyle = color;
      ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    function flashAlpha(active) { return active && Math.floor(s.elapsed * 12) % 2 ? .35 : 1; }
    function clipToRoad() {
      const near = roadNear(), half = near.half - 18 * near.k;
      ctx.beginPath(); ctx.moveTo(width / 2, horizon);
      ctx.lineTo(width / 2 + half, near.y); ctx.lineTo(width / 2 - half, near.y); ctx.closePath(); ctx.clip();
    }
    function fish(x, y, size) {
      const a = art.fish; if (!a) return;
      sprite('fish', x, y + size * a.frame.h / a.frame.w / 2, size);
    }
    function obstacle(type, p, lane) {
      const playerWidth = Math.min(width * .21, 106);
      const laneWidth = Math.min(width * .49, 310) * 2 / 3;
      if (type === 'gap') {
        const a = art.gap; if (!a) return;
        const w = laneWidth * .85 * p.k;
        ctx.save(); clipToRoad();
        sprite('gap', p.x, p.y + w * a.frame.h / a.frame.w * .5, w);
        ctx.restore();
      } else if (type === 'block') {
        sprite(['pillarLeft', 'pillarCenter', 'pillarRight'][lane], p.x, p.y, laneWidth * .79 * p.k);
      } else {
        const a = art.arch; if (!a) return;
        const r = a.frame, w = playerWidth * 1.85 * p.k, scale = w / r.w;
        const cap = Math.round(r.h * .62), extra = 28 * playerWidth / 106 * p.k;
        const h = r.h * scale + extra, x = Math.round(p.x - w / 2), top = Math.round(p.y - h);
        if (top > height || p.y < 0 || x > width || x + w < 0) return;
        // Extend only the lower legs so the approved snow arch clears the flattened seal.
        ctx.drawImage(a.image, r.x, r.y, r.w, cap, x, top, Math.round(w), Math.round(cap * scale));
        ctx.drawImage(a.image, r.x, r.y + cap, r.w, r.h - cap, x, top + Math.round(cap * scale), Math.round(w), Math.round((r.h - cap) * scale + extra));
      }
    }
    function seal(frame, x, bottom, scale = 1, alpha = 1) {
      const r = frames[frame]; if (!r) return;
      const ratio = Math.min(width * .21, 106) / frames[0].w * scale;
      const w = Math.round(r.w * ratio), h = Math.round(r.h * ratio);
      ctx.save(); ctx.globalAlpha = alpha;
      ctx.drawImage(sheet, r.x, r.y, r.w, r.h, Math.round(x - w / 2), Math.round(bottom - h), w, h);
      ctx.restore();
    }
    function player() {
      const p = project(s.x, 0), jump = sim.jumpHeight();
      const w = Math.min(width * .21, 106);
      shadow(p.x, p.y - 1, w * .4, 7 - jump * 2, '#82acc7');
      const frame = s.mode === 'over' || s.hurt > 0 ? 5 : s.jump > 0 ? 3 : s.duck > 0 ? 4 : s.x - s.lane > .03 ? 1 : s.lane - s.x > .03 ? 2 : 0;
      const alpha = flashAlpha(s.invincible > 0);
      seal(frame, p.x, p.y - jump * 72 + (s.mode === 'play' ? Math.sin(s.elapsed * 12) * 1.5 : 0), 1, alpha);
      if (s.mode === 'play' && s.jump === 0) for (let i = 0; i < 3; i++) {
        const offset = (s.elapsed * 55 + i * 13) % 35;
        rect(p.x - w * .32 - i * 3, p.y + offset, 3, 2, '#e6f8ff');
        rect(p.x + w * .32 + i * 3, p.y + offset - 5, 3, 2, '#e6f8ff');
      }
    }
    function draw() {
      ctx.drawImage(scenery, 0, 0); driftingIcebergs(); road();
      const items = [];
      for (const row of s.rows) {
        if (row.z > SealSlideCore.lookAhead(s.speed) || (row.fish !== undefined && row.checked)) continue;
        const z = row.z;
        if (row.fish !== undefined) items.push({ z, lane: row.fish, type: 'fish' });
        else for (const o of row.obstacles) items.push({ z, ...o });
      }
      items.sort((a, b) => b.z - a.z);
      let drawnPlayer = false;
      for (const item of items) {
        if (item.z < 0 && !drawnPlayer) { player(); drawnPlayer = true; }
        const p = project(item.lane, item.z);
        if (item.type === 'fish') {
          shadow(p.x, p.y + p.k, 22 * p.k, 5 * p.k, '#65a8dc');
          fish(p.x, p.y - (17 + Math.sin(visualTime * 3 + item.z) * 2) * p.k, 64 * p.k);
        } else {
          ctx.save(); ctx.globalAlpha = flashAlpha(item.flashUntil > s.elapsed);
          obstacle(item.type, p, item.lane); ctx.restore();
        }
      }
      if (!drawnPlayer && !transition) player();
      if (transition) drawTransition();
    }
    function drawTransition() {
      const t = clamp(transition.time, 0, 1), ease = t * t * (3 - 2 * t);
      ctx.save(); ctx.globalAlpha = 1 - ease; ctx.drawImage(transition.snapshot, 0, 0, width, height); ctx.restore();
      // Carry the landed side sprite forward while the camera reveals its approved rear pose.
      const rear = clamp((ease - .3) / .6, 0, 1);
      const x = transition.x * width * (1 - ease) + width / 2 * ease;
      const y = transition.y * height * (1 - ease) + playerY * ease;
      ctx.save(); ctx.globalAlpha = 1 - rear;
      const w = transition.w * width * (1 - ease) + Math.min(width * .21, 106) * ease;
      ctx.translate(x, y - ease * w * .2); ctx.rotate((transition.angle || 0) * (1 - ease) - ease * .35);
      ctx.drawImage(transition.side, -w / 2, -w * .25, w, w * .5); ctx.restore();
      // Cover the normal player until it reaches the transitioning sprite's position.
      if (rear > 0) seal(0, x, y, 1, rear);
    }
    function beep(kind) {
      if (!sound) return;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        audio ||= new AC(); audio.resume().catch(() => {});
        const o = audio.createOscillator(), g = audio.createGain(), now = audio.currentTime;
        const failure = kind === 'hurt' || kind === 'lesson-retry';
        const success = kind === 'dodge' || kind === 'lesson-pass';
        const f = { fish: 700, heart: 1040, jump: 430, duck: 210, hurt: 180, lane: 300, dodge: 660, 'lesson-pass': 660, 'lesson-retry': 180 }[kind];
        if (!f) return;
        o.type = failure ? 'sawtooth' : 'triangle'; o.frequency.setValueAtTime(f, now);
        if (success) { o.frequency.setValueAtTime(880, now + .08); o.frequency.setValueAtTime(1100, now + .16); }
        else o.frequency.exponentialRampToValueAtTime(failure ? 45 : f * 1.4, now + (failure ? .24 : .1));
        const duration = failure || success ? .28 : .15;
        g.gain.setValueAtTime(.0001, now); g.gain.exponentialRampToValueAtTime(.055, now + .006); g.gain.exponentialRampToValueAtTime(.0001, now + duration);
        o.connect(g); g.connect(audio.destination); o.start(now); o.stop(now + duration + .01);
      } catch { /* Sound must not interrupt gameplay. */ }
    }
    function setSound() {
      const b = root.querySelector('.slide-sound'); b.textContent = '♪';
      b.setAttribute('aria-label', `音效：${sound ? '開' : '關'}`); b.setAttribute('aria-pressed', String(sound));
    }
    function message(text, seconds = 2) { toast.innerHTML = text; toast.hidden = false; toastTime = seconds; }
    function updateHUD() {
      root.querySelector('[data-hearts]').textContent = `×${s.hearts}`;
      root.querySelector('[data-fish]').textContent = `${s.fish}/3`;
      root.querySelector('[data-distance]').textContent = formatDistance(s.distance);
      root.querySelector('[data-best]').textContent = `BEST ${formatDistance(Math.max(best, s.distance))}`;
    }
    function showCard(title, text, buttons, extra = '') {
      const moveFocus = root.contains(document.activeElement);
      modal.hidden = false;
      card.innerHTML = `<div class="slide-eyebrow">SEAL SLIDE</div><h1>${title}</h1><p>${text}</p>${extra}<div class="slide-actions"></div>`;
      const actions = card.querySelector('.slide-actions');
      buttons.forEach(([label, callback, secondary]) => {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
        if (secondary) b.className = 'secondary';
        b.addEventListener('click', callback); actions.append(b);
      });
      if (moveFocus) actions.querySelector('button')?.focus({ preventScroll: true });
    }
    function releaseDuck() { duckKeys.clear(); sim.release('duck'); }
    function showMenu() {
      releaseDuck(); root.hidden = false; resize(); transition = null; s.mode = 'menu'; s.rows = [];
      s.lane = s.x = 1; s.jump = s.duck = s.hurt = s.invincible = s.hitStop = 0;
      hud.hidden = true; toast.hidden = true;
      root.querySelector('.slide-live').textContent = '';
      showCard('海豹滑行', '趴著出發，滑向冰原的盡頭。<br>閃過障礙，收集魚，挑戰最遠距離。', [
        [loadFailed ? '重新載入素材' : ready ? '開始滑行 →' : '素材載入中…', () => { if (loadFailed) location.reload(); else if (ready) start(); }],
        ['操作說明', instructions, true], ['回到 Flappyseal', exit, true]
      ], `<div class="slide-best">最遠滑行<strong>${formatDistance(best)}</strong></div>`);
      card.insertAdjacentHTML('beforeend', `<p class="slide-footnote">${mobile() ? '四向滑動操作' : '方向鍵 / WASD 操作 · Esc 暫停'}</p>`);
      card.querySelector('button').disabled = !ready && !loadFailed;
      run();
    }
    function instructions() {
      s.mode = 'help';
      showCard('在冰上輕巧滑行', '自動向前，只要專心閃躲。', [
        ['返回選單', showMenu], ['重新練習教學', () => { if (ready) start(true); }, true]
      ], `<div class="slide-instructions"><div><b>← → / A D</b>左右換道 · 避開冰塊</div><div><b>↑ / W</b>跳過冰面裂縫</div><div><b>↓ / S</b>按住蹲低，放開恢復 · 穿過低冰拱</div><div><b>三隻魚 → 一顆愛心</b>愛心可超過三顆</div></div><p>手機：左右、向上滑動；向下滑後保持觸控可持續蹲低，放開恢復。<br>跳躍與攤平時仍可換道；兩種動作不能同時使用。</p>`);
    }
    function start(forceTutorial = false) {
      if (!ready) return;
      transition = null; lastLesson = ''; newRecord = false;
      releaseDuck(); sim.reset(forceTutorial || read('seal-slide-tutorial', '0') !== '1', initialSpeed, jumpDuration, obstacleInterval);
      modal.hidden = true; hud.hidden = false; toast.hidden = true;
      root.querySelector('.slide-live').textContent = '';
      canvas.focus({ preventScroll: true }); updateHUD(); beep('lane');
      if (s.tutorial) message('<strong>先感受一下冰面</strong>接著一起練習換道、跳躍與攤平<small>教學期間不扣愛心、不計距離</small>', 3);
      run();
    }
    function pause() {
      if (root.hidden || !['play', 'transition'].includes(s.mode)) return;
      releaseDuck(); s.mode = 'paused';
      showCard('休息一下', '冰原會等你，準備好再繼續。', [['繼續滑行 →', resume], ['回到滑行選單', showMenu, true]]);
    }
    function resume() {
      s.mode = transition ? 'transition' : 'play'; modal.hidden = true; canvas.focus({ preventScroll: true }); last = null;
    }
    function exit() {
      s.mode = 'menu'; root.hidden = true; transition = null;
      cancelAnimationFrame(animation); animation = 0; last = null; onExit?.();
    }
    function finish() {
      const score = Math.floor(s.distance); newRecord = score > best;
      if (newRecord) { best = score; write('seal-slide-best', best); }
      updateHUD(); toast.hidden = true;
      root.querySelector('.slide-live').textContent = `滑行結束，本局 ${formatDistance(score)}，最高 ${formatDistance(best)}`;
      showCard(newRecord ? '新紀錄！' : '這趟滑得真遠', '下一片冰原，等你再出發。', [['重來 → 滑行選單', showMenu]], `<div class="slide-result">${formatDistance(score)}</div><div class="slide-best">最遠滑行<strong>${formatDistance(best)}</strong></div>`);
    }
    function lesson() {
      const t = s.tutorial;
      if (!t || t.step > 2 || !t.active) return;
      const key = `${t.step}-${mobile()}`;
      if (key === lastLesson) return;
      lastLesson = key;
      const title = ['左右換道', '跳過裂縫', '攤平身體'][t.step];
      const controls = mobile() ? ['← 左右滑動 →', '↑ 向上滑動', '↓ 向下滑動'] : ['← → 或 A / D', '↑ 或 W', '↓ 或 S'];
      message(`<strong>${title}</strong>${controls[t.step]}<small>教學練習 · 失誤可再試一次</small>`, 30);
    }
    function events() {
      for (const type of s.events.splice(0)) {
        beep(type);
        if (type === 'over') finish();
        else if (type === 'heart') message('<strong>＋1 愛心</strong>三隻魚，換一點繼續冒險的勇氣', 1.6);
        else if (type === 'hurt') { message('碰到冰了！短暫無敵中', 1); root.querySelector('.slide-live').textContent = `受傷，剩餘 ${s.hearts} 顆愛心`; }
        else if (type === 'lesson') { lastLesson = ''; lesson(); }
        else if (type === 'lesson-pass') { lastLesson = ''; message('做得好！下一個動作準備中', 1.4); }
        else if (type === 'lesson-retry') { lastLesson = ''; message('沒關係，再試一次！不會扣愛心', 1.2); }
        else if (type === 'fish-tip') message('<strong>三隻魚 → 一顆愛心</strong>愛心可以超過三顆<small>教學完成，準備正式出發！</small>', 3);
        else if (type === 'tutorial-done') { write('seal-slide-tutorial', 1); message('出發！挑戰你的最遠距離', 2); }
      }
    }
    function tick(now) {
      animation = 0;
      if (root.hidden) return;
      const dt = last === null ? 0 : clamp((now - last) / 1000, 0, .05); last = now;
      if (s.mode === 'play') { sim.update(dt); events(); updateHUD(); }
      if (s.mode !== 'paused' && s.hitStop <= 0) {
        visualTime += dt;
        if (toastTime > 0) { toastTime -= dt; if (toastTime <= 0) toast.hidden = true; }
      }
      if (s.mode === 'transition' && transition) {
        transition.time += dt;
        if (transition.time >= 1) start();
      }
      draw(); animation = requestAnimationFrame(tick);
    }
    function run() { if (!animation) { last = null; animation = requestAnimationFrame(tick); } }
    function beginEntry({ snapshot, side, x, y, w, angle }) {
      root.hidden = false; resize(); sim.reset(false, initialSpeed, jumpDuration, obstacleInterval); s.mode = 'transition';
      modal.hidden = true; hud.hidden = true; toast.hidden = true;
      transition = { snapshot, side, x, y, w, angle, time: 0 }; run();
    }
    function action(value) { if (sim.input(value)) beep('lane'); }
    root.querySelector('.slide-pause').addEventListener('click', pause);
    root.querySelector('.slide-sound').addEventListener('click', () => { sound = !sound; write('seal-slide-sound', sound ? 1 : 0); setSound(); });
    window.addEventListener('keydown', e => {
      if (root.hidden) return;
      if (e.code === 'Escape') { e.preventDefault(); if (s.mode === 'paused') resume(); else pause(); return; }
      const value = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'jump', KeyW: 'jump', ArrowDown: 'duck', KeyS: 'duck' }[e.code];
      if (value === 'duck' && s.mode === 'play') duckKeys.add(e.code);
      if (value) { if (['play', 'paused', 'transition'].includes(s.mode)) e.preventDefault(); if (!e.repeat) action(value); }
    });
    window.addEventListener('keyup', e => {
      if (e.code !== 'ArrowDown' && e.code !== 'KeyS') return;
      duckKeys.delete(e.code); if (!duckKeys.size) sim.release('duck');
    });
    canvas.addEventListener('pointerdown', e => {
      if (s.mode !== 'play' || !e.isPrimary) return;
      touch = { x: e.clientX, y: e.clientY, id: e.pointerId }; canvas.setPointerCapture(e.pointerId); e.preventDefault();
    });
    canvas.addEventListener('pointermove', e => {
      if (!touch || touch.used || e.pointerId !== touch.id) return;
      const dx = e.clientX - touch.x, dy = e.clientY - touch.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 25) return;
      action(Math.abs(dx) > Math.abs(dy) ? dx < 0 ? 'left' : 'right' : dy < 0 ? 'jump' : 'duck'); touch.used = true;
    });
    const endTouch = () => { touch = null; if (!duckKeys.size) sim.release('duck'); };
    canvas.addEventListener('pointerup', endTouch); canvas.addEventListener('pointercancel', endTouch);
    window.addEventListener('blur', () => { endTouch(); pause(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
    function opaqueFrame(image, region = { x: 0, y: 0, w: image.naturalWidth, h: image.naturalHeight }) {
      if (!pixels.has(image)) {
        const c = document.createElement('canvas'); c.width = image.naturalWidth; c.height = image.naturalHeight;
        const g = c.getContext('2d'); g.drawImage(image, 0, 0);
        pixels.set(image, { data: g.getImageData(0, 0, c.width, c.height).data, width: c.width });
      }
      const { data, width: stride } = pixels.get(image);
      let left = region.x + region.w, right = -1, top = region.y + region.h, bottom = -1;
      for (let y = region.y; y < region.y + region.h; y++) for (let x = region.x; x < region.x + region.w; x++) if (data[(y * stride + x) * 4 + 3] > 128) {
        left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
      if (right < left || bottom < top) throw new Error('Empty sprite region');
      return { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
    }
    const loaded = Promise.all([
      [sheet, assetURL], [atlas, new URL('environment-atlas-preview-v1.png', assetBase).href],
      [centerPillar, new URL('ice-pillar-center-v1.png', assetBase).href],
      [rightPillar, new URL('ice-pillar-right-v1.png', assetBase).href],
      [snowBanks, new URL('pointed-banks-v1.png', assetBase).href]
    ].map(([image, src]) => new Promise((resolve, reject) => {
      image.onload = resolve; image.onerror = () => reject(new Error(`Cannot load ${src}`)); image.src = src;
    }))).then(() => {
      const regions = {
        pillarLeft: [60, 0, 370, 390], arch: [500, 50, 510, 310], gap: [1020, 90, 505, 250],
        fish: [100, 430, 320, 220], iceberg: [530, 400, 460, 270], cloud: [1090, 440, 390, 210],
        mountains: [0, 720, 610, 245]
      };
      for (const [name, [x, y, w, h]] of Object.entries(regions)) art[name] = { image: atlas, frame: opaqueFrame(atlas, { x, y, w, h }) };
      art.pillarCenter = { image: centerPillar, frame: opaqueFrame(centerPillar) };
      art.pillarRight = { image: rightPillar, frame: opaqueFrame(rightPillar) };
      const bankWidth = snowBanks.naturalWidth / 2;
      art.bankLeft = { image: snowBanks, frame: { x: 0, y: 0, w: bankWidth, h: snowBanks.naturalHeight } };
      art.bankRight = { image: snowBanks, frame: { x: bankWidth, y: 0, w: bankWidth, h: snowBanks.naturalHeight } };
      const mountain = art.mountains, mr = mountain.frame;
      const strip = document.createElement('canvas'); strip.width = mr.w; strip.height = mr.h;
      const mg = strip.getContext('2d'); mg.imageSmoothingEnabled = false;
      mg.drawImage(atlas, mr.x, mr.y, mr.w, mr.h, 0, 0, mr.w, mr.h);
      const mask = mg.createLinearGradient(0, 0, mr.w, 0);
      mask.addColorStop(0, 'transparent'); mask.addColorStop(.16, '#fff');
      mask.addColorStop(.84, '#fff'); mask.addColorStop(1, 'transparent');
      mg.globalCompositeOperation = 'destination-in'; mg.fillStyle = mask; mg.fillRect(0, 0, mr.w, mr.h);
      art.mountains = { image: strip, frame: { x: 0, y: 0, w: mr.w, h: mr.h } };
      for (let i = 0; i < 6; i++) {
        const x = Math.floor(i % 3 * sheet.naturalWidth / 3), x1 = Math.floor((i % 3 + 1) * sheet.naturalWidth / 3);
        const y = i < 3 ? 80 : Math.floor(sheet.naturalHeight / 2), bottom = i < 3 ? Math.floor(sheet.naturalHeight / 2) : sheet.naturalHeight;
        frames.push(opaqueFrame(sheet, { x, y, w: x1 - x, h: bottom - y }));
      }
      const icon = root.querySelector('[data-fish-icon]'), iconCtx = icon.getContext('2d'); iconCtx.imageSmoothingEnabled = false;
      sprite('fish', 16, 21, 30, iconCtx);
      pixels.clear(); ready = true; buildScenery();
      if (s.mode === 'menu' && !root.hidden) showMenu();
      return true;
    }).catch(error => {
      console.error('海豹滑行素材載入失敗', error); loadFailed = true;
      if (!root.hidden) showMenu(); return false;
    });
    setSound(); resize();
    return { showMenu, beginEntry, ready: loaded };
  }
  window.SealSlide = { create };
})();
