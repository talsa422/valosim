'use strict';

/* ════════════════════════════════════════════════════════════════
   VALOSIM — Peek & Flick Aim Trainer
   Canvas tabanlı, orijinal (kopya olmayan) grafiklerle çizilen
   Valorant/CS tarzı "peek" tepki-antrenmanı simülasyonu.
   ════════════════════════════════════════════════════════════════ */

// ── Difficulty configuration ─────────────────────────────────────
const MODES = {
  left: {
    id: 'left', name: 'SOL PEEK', diff: 1,
    desc: 'Hedef her zaman soldan gelir.',
    windows: [{ x0: 0.36, x1: 0.64 }],
    direction: 'ltr',
    crossMs: [820, 950], spawnGapMs: [500, 950],
    radius: 30, lives: 3
  },
  right: {
    id: 'right', name: 'SAĞ PEEK', diff: 1,
    desc: 'Hedef her zaman sağdan gelir.',
    windows: [{ x0: 0.36, x1: 0.64 }],
    direction: 'rtl',
    crossMs: [820, 950], spawnGapMs: [500, 950],
    radius: 30, lives: 3
  },
  oni: {
    id: 'oni', name: 'DIAMOND', diff: 2,
    desc: 'Merkezden hızlı ve dar aralıklı geçişler.',
    windows: [{ x0: 0.36, x1: 0.64 }],
    crossMs: [500, 620], spawnGapMs: [350, 650],
    radius: 25, lives: 3
  },
  expert: {
    id: 'expert', name: 'IMMORTAL', diff: 3,
    desc: 'İki açıdan hızlı hedefler.',
    windows: [{ x0: 0.17, x1: 0.41 }, { x0: 0.59, x1: 0.83 }],
    crossMs: [520, 650], spawnGapMs: [420, 720],
    staggerMs: 500,
    radius: 24, lives: 3
  },
  hell: {
    id: 'hell', name: 'RADIANT', diff: 4,
    desc: 'Üç açı, kısa tepki süresi. Gerçek son seviye.',
    windows: [{ x0: 0.05, x1: 0.27 }, { x0: 0.385, x1: 0.615 }, { x0: 0.73, x1: 0.95 }],
    crossMs: [400, 500], spawnGapMs: [350, 650],
    radius: 20, lives: 3
  }
};
const MODE_ORDER = ['left', 'right', 'oni', 'expert', 'hell'];

// ── DOM refs ──────────────────────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const wrapper = document.getElementById('wrapper');

const menuScreen = document.getElementById('menuScreen');
const modeGrid = document.getElementById('modeGrid');
const hud = document.getElementById('hud');
const backBtn = document.getElementById('backBtn');
const pauseBtn = document.getElementById('pauseBtn');
const pausePanel = document.getElementById('pausePanel');
const gameOverPanel = document.getElementById('gameOverPanel');
const howToPlayPanel = document.getElementById('howToPlayPanel');

const hudModeEl = document.getElementById('hudMode');
const hudScoreEl = document.getElementById('hudScore');
const hudComboEl = document.getElementById('hudCombo');
const hudTimeEl = document.getElementById('hudTime');
const hudLivesEl = document.getElementById('hudLives');

const soundToggleMenu = document.getElementById('soundToggleMenu');
const soundTogglePause = document.getElementById('soundTogglePause');

// ── Settings (sens + crosshair) ─────────────────────────────────
const DEFAULT_SETTINGS = { sens: 1, chColor: '#ece8e1', chSize: 11, chGap: 4, chThick: 2, chDot: true };
let settings = { ...DEFAULT_SETTINGS };
try { Object.assign(settings, JSON.parse(localStorage.getItem('valosim_settings') || '{}')); } catch (e) {}
function saveSettings() { localStorage.setItem('valosim_settings', JSON.stringify(settings)); }

// ── Persistent state ────────────────────────────────────────────
let soundOn = localStorage.getItem('valosim_sound') !== 'off';
soundToggleMenu.checked = soundOn;
soundTogglePause.checked = soundOn;

function getHighScore(modeId) {
  return Number(localStorage.getItem('valosim_hs_' + modeId) || 0);
}
function setHighScore(modeId, val) {
  localStorage.setItem('valosim_hs_' + modeId, String(val));
}

// ── Canvas sizing ────────────────────────────────────────────────
let W = 0, H = 0;
function resize() {
  const vw = window.innerWidth, vh = window.innerHeight;
  wrapper.style.width = vw + 'px';
  wrapper.style.height = vh + 'px';
  const dpr = window.devicePixelRatio || 1;
  canvas.width = vw * dpr;
  canvas.height = vh * dpr;
  canvas.style.width = vw + 'px';
  canvas.style.height = vh + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  W = vw; H = vh;
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 100));
resize();

// ── Audio (procedural, no external files) ───────────────────────
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}
// Chiptune-style SFX: short square/saw note sequences, no audio files
function playChip(steps, type = 'square', vol = 0.12) {
  if (!soundOn || !audioCtx) return;
  const t0 = audioCtx.currentTime;
  for (const s of steps) {
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = s.type || type;
    osc.frequency.setValueAtTime(s.f, t0 + s.t);
    g.gain.setValueAtTime(0.0001, t0 + s.t);
    g.gain.linearRampToValueAtTime(vol, t0 + s.t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + s.t + s.d);
    osc.connect(g).connect(audioCtx.destination);
    osc.start(t0 + s.t);
    osc.stop(t0 + s.t + s.d + 0.03);
  }
}
const SFX = {
  hit: () => playChip([{ f: 659, t: 0, d: 0.07 }, { f: 988, t: 0.055, d: 0.09 }]),
  perfect: () => playChip([{ f: 988, t: 0, d: 0.09 }, { f: 1319, t: 0.08, d: 0.24 }]), // coin!
  miss: () => playChip([{ f: 233, t: 0, d: 0.10 }, { f: 174, t: 0.09, d: 0.12 }, { f: 116, t: 0.18, d: 0.2 }], 'sawtooth'),
  stray: () => playChip([{ f: 196, t: 0, d: 0.05 }]),
  gameOver: () => playChip([{ f: 784, t: 0, d: 0.12 }, { f: 659, t: 0.12, d: 0.12 }, { f: 523, t: 0.24, d: 0.12 }, { f: 392, t: 0.36, d: 0.3 }])
};

// ── Game state ────────────────────────────────────────────────────
let screenState = 'menu'; // menu | game | paused | gameover
let currentMode = null;
let targets = [];         // active targets
let nextSpawnAt = [];     // per-window timestamp
let score = 0, combo = 0, bestCombo = 0, lives = 0;
let hits = 0, misses = 0, strays = 0;
let runStartTime = 0, elapsedMs = 0;
let floaters = []; // floating score text
let shakeUntil = 0, shakeMag = 0;
let mouseX = -100, mouseY = -100;
let rafId = null, lastTs = 0;

function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

// ── Menu rendering ────────────────────────────────────────────────
function renderModeGrid() {
  modeGrid.innerHTML = '';
  MODE_ORDER.forEach(id => {
    const m = MODES[id];
    const card = document.createElement('div');
    card.className = 'mode-card';
    card.dataset.diff = m.diff;
    card.innerHTML =
      '<div class="mode-name">' + m.name + '</div>' +
      '<div class="mode-desc">' + m.desc + '</div>' +
      '<div class="mode-best">REKOR: ' + getHighScore(id) + '</div>';
    card.addEventListener('click', () => startGame(id));
    modeGrid.appendChild(card);
  });
}
renderModeGrid();

// ── Screen transitions ──────────────────────────────────────────
function showMenu() {
  screenState = 'menu';
  menuScreen.classList.remove('hidden');
  hud.classList.add('hidden');
  backBtn.classList.add('hidden');
  pausePanel.classList.add('hidden');
  gameOverPanel.classList.add('hidden');
  renderModeGrid();
  // Ambient demo scene behind the blurred menu
  currentMode = MODES.oni;
  targets = [];
  floaters = [];
  nextSpawnAt = currentMode.windows.map(() => performance.now() + 400);
}

function startGame(modeId) {
  ensureAudio();
  currentMode = MODES[modeId];
  score = 0; combo = 0; bestCombo = 0; lives = currentMode.lives;
  hits = 0; misses = 0; strays = 0;
  targets = [];
  const now = performance.now();
  nextSpawnAt = currentMode.windows.map((_, i) => now + 300 + i * (currentMode.staggerMs || 150));
  runStartTime = now; elapsedMs = 0;
  floaters = [];

  screenState = 'game';
  menuScreen.classList.add('hidden');
  gameOverPanel.classList.add('hidden');
  pausePanel.classList.add('hidden');
  hud.classList.remove('hidden');
  backBtn.classList.remove('hidden');

  hudModeEl.textContent = currentMode.name;
  updateHudLives();
  updateHudScoreCombo();
  hudTimeEl.textContent = '00:00';

  lastTs = performance.now();
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(loop);
}

function pauseGame() {
  if (screenState !== 'game') return;
  screenState = 'paused';
  pausePanel.classList.remove('hidden');
  if (document.pointerLockElement === canvas) document.exitPointerLock();
}
function resumeGame() {
  if (screenState !== 'paused') return;
  screenState = 'game';
  pausePanel.classList.add('hidden');
  lastTs = performance.now();
}

function endGame() {
  screenState = 'gameover';
  if (document.pointerLockElement === canvas) document.exitPointerLock();
  const total = hits + misses + strays;
  const accuracy = total > 0 ? Math.round((hits / total) * 100) : 0;
  document.getElementById('finalScore').textContent = score;
  document.getElementById('finalCombo').textContent = bestCombo;
  document.getElementById('finalAccuracy').textContent = accuracy + '%';
  document.getElementById('finalTime').textContent = fmtTime(elapsedMs);

  const prevHs = getHighScore(currentMode.id);
  const newRecordRow = document.getElementById('newRecordRow');
  if (score > prevHs) {
    setHighScore(currentMode.id, score);
    newRecordRow.classList.remove('hidden');
    document.getElementById('finalHighScore').textContent = score;
  } else {
    newRecordRow.classList.add('hidden');
  }
  gameOverPanel.classList.remove('hidden');
  SFX.gameOver();
}

// ── Input ─────────────────────────────────────────────────────────
function getCanvasPos(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left) * (W / rect.width),
    y: (clientY - rect.top) * (H / rect.height)
  };
}

// Pointer lock: sens only applies to relative mouse movement, so the
// first in-game click locks the pointer (no shot); ESC releases it.
let pointerLocked = false;
let lockUnavailable = false;

canvas.addEventListener('pointermove', e => {
  if (pointerLocked) {
    mouseX = Math.max(0, Math.min(W, mouseX + e.movementX * settings.sens));
    mouseY = Math.max(0, Math.min(H, mouseY + e.movementY * settings.sens));
  } else {
    const p = getCanvasPos(e.clientX, e.clientY);
    mouseX = p.x; mouseY = p.y;
  }
});

canvas.addEventListener('pointerdown', e => {
  ensureAudio();
  if (screenState !== 'game') return;
  if (e.pointerType === 'mouse' && !pointerLocked && !lockUnavailable) {
    const p = getCanvasPos(e.clientX, e.clientY);
    mouseX = p.x; mouseY = p.y;
    try {
      const res = canvas.requestPointerLock();
      if (res && res.catch) res.catch(() => { lockUnavailable = true; });
    } catch (err) { lockUnavailable = true; }
    return; // engage click only, no shot
  }
  const p = pointerLocked ? { x: mouseX, y: mouseY } : getCanvasPos(e.clientX, e.clientY);
  handleClick(p.x, p.y);
});

document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
  // Browser ESC exits the lock without a keydown we can see — treat it as pause
  if (!pointerLocked && screenState === 'game') pauseGame();
});
document.addEventListener('pointerlockerror', () => { lockUnavailable = true; });

window.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (screenState === 'game') pauseGame();
    else if (screenState === 'paused') resumeGame();
  }
});

function handleClick(x, y) {
  let bestTarget = null, bestDist = Infinity;
  for (const t of targets) {
    const d = Math.hypot(x - t.cx, y - t.cy);
    if (d <= t.radius * 1.15 && d < bestDist) { bestDist = d; bestTarget = t; }
  }
  if (bestTarget) {
    registerHit(bestTarget, bestDist);
  } else if (targets.length > 0) {
    registerStrayClick();
  } else {
    registerStrayClick();
  }
}

// ── Scoring ──────────────────────────────────────────────────────
function updateHudScoreCombo() {
  hudScoreEl.textContent = score;
  hudComboEl.textContent = combo;
}
function updateHudLives() {
  hudLivesEl.textContent = '●'.repeat(Math.max(lives, 0)) + '○'.repeat(Math.max(currentMode.lives - lives, 0));
}

function addFloater(x, y, text, color) {
  floaters.push({ x, y, text, color, born: performance.now() });
}

function registerHit(target, dist) {
  const perfect = dist <= target.radius * 0.45;
  combo++;
  bestCombo = Math.max(bestCombo, combo);
  const comboMult = 1 + Math.min(combo - 1, 20) * 0.08;
  const base = perfect ? 150 : 100;
  const gained = Math.round(base * comboMult);
  score += gained;
  hits++;
  addFloater(target.cx, target.cy, (perfect ? 'PERFECT +' : '+') + gained, perfect ? '#ffe600' : '#f2efff');
  if (perfect) SFX.perfect(); else SFX.hit();
  removeTarget(target);
  updateHudScoreCombo();
}

function registerMissTransit(target) {
  combo = 0;
  misses++;
  lives--;
  addFloater(target.cx, target.cy, 'MISS', '#ff2079');
  SFX.miss();
  triggerShake(6, 220);
  removeTarget(target);
  updateHudScoreCombo();
  updateHudLives();
  if (lives <= 0) endGame();
}

function registerStrayClick() {
  if (combo > 0) { combo = 0; updateHudScoreCombo(); }
  strays++;
  SFX.stray();
}

function removeTarget(t) {
  const idx = targets.indexOf(t);
  if (idx >= 0) targets.splice(idx, 1);
  nextSpawnAt[t.windowIndex] = performance.now() + rand(currentMode.spawnGapMs[0], currentMode.spawnGapMs[1]);
}

function triggerShake(mag, ms) {
  shakeMag = mag;
  shakeUntil = performance.now() + ms;
}

// ── Target spawning / update ────────────────────────────────────
function rand(a, b) { return a + Math.random() * (b - a); }

const TARGET_COLORS = ['#ff2079', '#00f0ff', '#39ff14', '#ffe600'];

function spawnTarget(windowIndex) {
  const win = currentMode.windows[windowIndex];
  const ltr = currentMode.direction === 'ltr' ? true
            : currentMode.direction === 'rtl' ? false
            : Math.random() < 0.5;
  const x0 = ltr ? win.x0 : win.x1;
  const x1 = ltr ? win.x1 : win.x0;
  const yBand = { y0: 0.42, y1: 0.70 };
  targets.push({
    windowIndex,
    startXFrac: x0, endXFrac: x1,
    yFrac: rand(yBand.y0, yBand.y1),
    spawnTs: performance.now(),
    duration: rand(currentMode.crossMs[0], currentMode.crossMs[1]),
    radius: currentMode.radius,
    color: TARGET_COLORS[Math.floor(Math.random() * TARGET_COLORS.length)],
    cx: 0, cy: 0
  });
}

function easeInOutQuad(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

function updateGame(now) {
  elapsedMs = now - runStartTime;
  hudTimeEl.textContent = fmtTime(elapsedMs);

  currentMode.windows.forEach((win, i) => {
    const hasActive = targets.some(t => t.windowIndex === i);
    if (!hasActive && now >= nextSpawnAt[i]) {
      spawnTarget(i);
      // Staggered modes: hold other empty windows back so spawns never coincide
      if (currentMode.staggerMs) {
        currentMode.windows.forEach((_, j) => {
          if (j !== i) nextSpawnAt[j] = Math.max(nextSpawnAt[j], now + currentMode.staggerMs);
        });
      }
    }
  });

  for (let i = targets.length - 1; i >= 0; i--) {
    const t = targets[i];
    const progress = (now - t.spawnTs) / t.duration;
    if (progress >= 1) {
      registerMissTransit(t);
      continue;
    }
    const e = easeInOutQuad(progress);
    const xFrac = t.startXFrac + (t.endXFrac - t.startXFrac) * e;
    t.cx = xFrac * W;
    t.cy = t.yFrac * H;
    t.progress = progress;
  }

  floaters = floaters.filter(f => now - f.born < 650);
}

// Menu backdrop: targets drift by with no scoring or lives
function updateMenuDemo(now) {
  currentMode.windows.forEach((win, i) => {
    const hasActive = targets.some(t => t.windowIndex === i);
    if (!hasActive && now >= nextSpawnAt[i]) spawnTarget(i);
  });
  for (let i = targets.length - 1; i >= 0; i--) {
    const t = targets[i];
    const progress = (now - t.spawnTs) / t.duration;
    if (progress >= 1) {
      targets.splice(i, 1);
      nextSpawnAt[t.windowIndex] = now + rand(600, 1200);
      continue;
    }
    const e = easeInOutQuad(progress);
    t.cx = (t.startXFrac + (t.endXFrac - t.startXFrac) * e) * W;
    t.cy = t.yFrac * H;
  }
}

// ── Drawing ──────────────────────────────────────────────────────
function drawScene(now) {
  ctx.clearRect(0, 0, W, H);

  let shakeX = 0, shakeY = 0;
  if (now < shakeUntil) {
    shakeX = (Math.random() - 0.5) * shakeMag;
    shakeY = (Math.random() - 0.5) * shakeMag;
  }
  ctx.save();
  ctx.translate(shakeX, shakeY);

  // Background: deep arcade purple
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#160636');
  grad.addColorStop(0.6, '#0a0318');
  grad.addColorStop(1, '#05010d');
  ctx.fillStyle = grad;
  ctx.fillRect(-20, -20, W + 40, H + 40);

  const wallTop = H * 0.22, wallBottom = H * 0.82;

  // Neon perspective floor grid below the walls
  ctx.strokeStyle = 'rgba(255,32,121,0.30)';
  ctx.lineWidth = 1;
  for (let i = 1; i <= 5; i++) {
    const f = Math.pow(i / 5, 1.7);
    const y = wallBottom + (H - wallBottom) * f;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  const cxm = W / 2;
  for (let k = -10; k <= 10; k++) {
    ctx.beginPath();
    ctx.moveTo(cxm + k * W * 0.055, wallBottom);
    ctx.lineTo(cxm + k * W * 0.16, H);
    ctx.stroke();
  }

  // Wall band + gaps
  const windows = currentMode ? currentMode.windows : [];
  const segments = [];
  let cursor = 0;
  const sorted = [...windows].sort((a, b) => a.x0 - b.x0);
  sorted.forEach(w => {
    if (w.x0 > cursor) segments.push([cursor, w.x0]);
    cursor = w.x1;
  });
  if (cursor < 1) segments.push([cursor, 1]);

  segments.forEach(([a, b]) => {
    const x = a * W, w = (b - a) * W;
    const wg = ctx.createLinearGradient(x, wallTop, x, wallBottom);
    wg.addColorStop(0, '#241348');
    wg.addColorStop(1, '#150a2e');
    ctx.fillStyle = wg;
    ctx.fillRect(x, wallTop, w, wallBottom - wallTop);
    ctx.strokeStyle = 'rgba(0,240,255,0.30)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, wallTop, w, wallBottom - wallTop);
  });

  // Gap edge markers
  sorted.forEach(w => {
    ctx.strokeStyle = 'rgba(255,32,121,0.45)';
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(w.x0 * W, wallTop); ctx.lineTo(w.x0 * W, wallBottom); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w.x1 * W, wallTop); ctx.lineTo(w.x1 * W, wallBottom); ctx.stroke();
    ctx.setLineDash([]);
  });

  // Targets
  for (const t of targets) drawTarget(t);

  // Floaters
  const nowFl = now;
  for (const f of floaters) {
    const age = nowFl - f.born;
    const a = 1 - age / 650;
    ctx.globalAlpha = Math.max(a, 0);
    ctx.fillStyle = f.color;
    ctx.font = "14px 'Press Start 2P', monospace";
    ctx.textAlign = 'center';
    ctx.fillText(f.text, f.x, f.y - 34 - (age * 0.05));
    ctx.globalAlpha = 1;
  }

  ctx.restore();

  // Crosshair (not affected by shake, drawn in screen space)
  if (screenState !== 'menu') drawCrosshair(mouseX, mouseY);
}

// 8x8 pixel-art invader, two frames for a leg-wiggle animation
const INVADER_A = [
  '00100100',
  '00111100',
  '01111110',
  '11011011',
  '11111111',
  '00100100',
  '01011010',
  '10100101'
];
const INVADER_B = [
  '00100100',
  '00111100',
  '01111110',
  '11011011',
  '11111111',
  '00100100',
  '10100101',
  '01011010'
];

function drawTarget(t) {
  const frame = Math.floor(performance.now() / 200) % 2 === 0 ? INVADER_A : INVADER_B;
  const cell = (t.radius * 2.3) / 8;
  const x0 = t.cx - cell * 4;
  const y0 = t.cy - cell * 4;
  ctx.save();
  ctx.shadowColor = t.color;
  ctx.shadowBlur = 14;
  ctx.fillStyle = t.color;
  for (let ry = 0; ry < 8; ry++) {
    const row = frame[ry];
    for (let cx2 = 0; cx2 < 8; cx2++) {
      if (row[cx2] === '1') {
        ctx.fillRect(x0 + cx2 * cell, y0 + ry * cell, cell + 0.5, cell + 0.5);
      }
    }
  }
  ctx.shadowBlur = 0;
  // aim reference pixel at the exact center
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(t.cx - cell * 0.35, t.cy - cell * 0.35, cell * 0.7, cell * 0.7);
  ctx.restore();
}

function drawCrosshairOn(c, x, y) {
  const size = settings.chSize, gap = settings.chGap;
  c.strokeStyle = settings.chColor;
  c.lineWidth = settings.chThick;
  c.beginPath();
  c.moveTo(x - size - gap, y); c.lineTo(x - gap, y);
  c.moveTo(x + gap, y); c.lineTo(x + size + gap, y);
  c.moveTo(x, y - size - gap); c.lineTo(x, y - gap);
  c.moveTo(x, y + gap); c.lineTo(x, y + size + gap);
  c.stroke();
  if (settings.chDot) {
    c.beginPath();
    c.arc(x, y, Math.max(1.4, settings.chThick * 0.85), 0, Math.PI * 2);
    c.fillStyle = settings.chColor;
    c.fill();
  }
}

function drawCrosshair(x, y) {
  if (x < 0 || y < 0) return;
  drawCrosshairOn(ctx, x, y);
}

// ── Main loop ────────────────────────────────────────────────────
function loop(ts) {
  rafId = requestAnimationFrame(loop);
  if (screenState === 'game') updateGame(ts);
  else if (screenState === 'menu') updateMenuDemo(ts);
  drawScene(ts);
}

// ── UI wiring ────────────────────────────────────────────────────
backBtn.addEventListener('click', showMenu);
pauseBtn.addEventListener('click', pauseGame);
document.getElementById('resumeBtn').addEventListener('click', resumeGame);
document.getElementById('restartFromPauseBtn').addEventListener('click', () => startGame(currentMode.id));
document.getElementById('menuFromPauseBtn').addEventListener('click', showMenu);
document.getElementById('retryBtn').addEventListener('click', () => startGame(currentMode.id));
document.getElementById('backToMenuBtn').addEventListener('click', showMenu);

document.getElementById('howToPlayBtn').addEventListener('click', () => howToPlayPanel.classList.remove('hidden'));
document.getElementById('closeHowToBtn').addEventListener('click', () => howToPlayPanel.classList.add('hidden'));

// ── Settings panel ────────────────────────────────────────────────
const settingsPanel = document.getElementById('settingsPanel');
const sensSlider = document.getElementById('sensSlider');
const sensValue = document.getElementById('sensValue');
const chColor = document.getElementById('chColor');
const chSize = document.getElementById('chSize');
const chGap = document.getElementById('chGap');
const chThick = document.getElementById('chThick');
const chDot = document.getElementById('chDot');
const chPrevCtx = document.getElementById('crosshairPreview').getContext('2d');

function renderCrosshairPreview() {
  chPrevCtx.fillStyle = '#0a0318';
  chPrevCtx.fillRect(0, 0, 130, 130);
  chPrevCtx.strokeStyle = 'rgba(255,255,255,0.05)';
  chPrevCtx.strokeRect(10, 10, 110, 110);
  drawCrosshairOn(chPrevCtx, 65, 65);
}

function syncSettingsUI() {
  sensSlider.value = settings.sens;
  sensValue.textContent = Number(settings.sens).toFixed(2);
  chColor.value = settings.chColor;
  chSize.value = settings.chSize;
  chGap.value = settings.chGap;
  chThick.value = settings.chThick;
  chDot.checked = settings.chDot;
  document.getElementById('chSizeValue').textContent = settings.chSize;
  document.getElementById('chGapValue').textContent = settings.chGap;
  document.getElementById('chThickValue').textContent = settings.chThick;
  renderCrosshairPreview();
}

sensSlider.addEventListener('input', e => {
  settings.sens = parseFloat(e.target.value);
  sensValue.textContent = settings.sens.toFixed(2);
  saveSettings();
});
chColor.addEventListener('input', e => { settings.chColor = e.target.value; saveSettings(); renderCrosshairPreview(); });
chSize.addEventListener('input', e => {
  settings.chSize = Number(e.target.value);
  document.getElementById('chSizeValue').textContent = settings.chSize;
  saveSettings(); renderCrosshairPreview();
});
chGap.addEventListener('input', e => {
  settings.chGap = Number(e.target.value);
  document.getElementById('chGapValue').textContent = settings.chGap;
  saveSettings(); renderCrosshairPreview();
});
chThick.addEventListener('input', e => {
  settings.chThick = Number(e.target.value);
  document.getElementById('chThickValue').textContent = settings.chThick;
  saveSettings(); renderCrosshairPreview();
});
chDot.addEventListener('change', e => { settings.chDot = e.target.checked; saveSettings(); renderCrosshairPreview(); });

function openSettings() {
  syncSettingsUI();
  settingsPanel.classList.remove('hidden');
}
document.getElementById('settingsBtn').addEventListener('click', openSettings);
document.getElementById('settingsFromPauseBtn').addEventListener('click', openSettings);
document.getElementById('closeSettingsBtn').addEventListener('click', () => settingsPanel.classList.add('hidden'));

function syncSound(val) {
  soundOn = val;
  localStorage.setItem('valosim_sound', val ? 'on' : 'off');
  soundToggleMenu.checked = val;
  soundTogglePause.checked = val;
}
soundToggleMenu.addEventListener('change', e => syncSound(e.target.checked));
soundTogglePause.addEventListener('change', e => syncSound(e.target.checked));

showMenu();
rafId = requestAnimationFrame(loop);
