/* ===================================================================
   GIANT HAUL – script.js
   COMPANY Schwerlast-Roboter | LKW-Beladespiel | Matter.js Rigid-Body-Physik
   =================================================================== */
'use strict';

// Matter.js Aliases
const { Engine, Render, World, Bodies, Body, Events, Runner } = Matter;

// ===================================================================
// SPIELER-PROFIL & BRANDING
// ===================================================================
let globalPlayerName = localStorage.getItem('giant_player') || '';
let globalCompanyName = localStorage.getItem('giant_company') || 'COMPANY';

// UI-Elemente mit dem Firmennamen aktualisieren
function updateCompanyBranding() {
  const elements = document.querySelectorAll('.company-name-display');
  elements.forEach(el => el.textContent = globalCompanyName.toUpperCase());
}

// Wird beim Klick auf "Speichern & Starten" im Overlay aufgerufen
window.savePlayerProfile = function () {
  const nameInputEl = document.getElementById('input-playername');
  const compInputEl = document.getElementById('input-companyname');
  const nameInput = nameInputEl.value.trim();
  const compInput = compInputEl.value.trim();

  if (!nameInput) {
    alert("Bitte gib einen Spielernamen ein.");
    nameInputEl.focus();
    return;
  }

  globalPlayerName = nameInput;
  globalCompanyName = compInput ? compInput.toUpperCase().substring(0, 8) : 'COMPANY';

  localStorage.setItem('giant_player', globalPlayerName);
  localStorage.setItem('giant_company', globalCompanyName);

  updateCompanyBranding();

  document.getElementById('overlay-register').classList.add('hidden');
  document.getElementById('overlay-start').classList.remove('hidden');
};

// Event-Listener für Enter-Taste in den Eingabefeldern
document.addEventListener('DOMContentLoaded', () => {
  const inputs = ['input-playername', 'input-companyname'];
  inputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          window.savePlayerProfile();
        }
      });
    }
  });
});

// Überprüfen, welches Overlay beim Start gezeigt werden soll
function checkPlayerProfile() {
  // Lade Bestenliste beim Spielstart
  if (window.dbLoadTopScores) {
    window.dbLoadTopScores();
  }

  // Zeige IMMER die Registrierung beim ersten Laden der Seite
  document.getElementById('overlay-start').classList.add('hidden');
  document.getElementById('overlay-register').classList.remove('hidden');

  const pInput = document.getElementById('input-playername');
  const cInput = document.getElementById('input-companyname');

  if (globalPlayerName) {
    // Profil existiert -> Felder vorbefüllen
    pInput.value = globalPlayerName;
    cInput.value = globalCompanyName;

    updateCompanyBranding();
  }

  // Auto-Fokus auf das Namensfeld (mit leichter Verzögerung für Mobile-Browser)
  setTimeout(() => {
    if (pInput) pInput.focus();
  }, 300);
}

// ===================================================================
// KONFIGURATION
// ===================================================================
const CFG = {
  GRAVITY_SCALE: 0.0025,  // Matter.js gravity scale
  FLOOR_H: 60,
  RAIL_H: 28,
  ROBOT_W: 90,
  ROBOT_H: 60,
  GRIPPER_H: 18,
  BASE_SPEED: 180,
  SPEED_INC: 12,
  MAX_SPEED: 1000,
  BLOCK_TYPES: [
    { name: 'Container', w: 110, h: 48, color: '#3a5f7a', stripe: '#2e4a60', label: 'COMP1' },
    { name: 'Motorblock', w: 80, h: 62, color: '#505560', stripe: '#3a3d42', label: 'COMP2' },
    { name: 'Kiste', w: 95, h: 56, color: '#7a5a30', stripe: '#6a4a22', label: 'COMP1' },
    { name: 'Bigbox', w: 130, h: 44, color: '#3d5c3d', stripe: '#2e4a2e', label: 'COMP2' },
  ],
  PARTS_PER_TRUCK: 9,
  SETTLE_SPEED: 0.6,   // px/frame – gilt als "ruhend"
  SETTLE_FRAMES: 50,    // Frames in Folge ruhend → abgesetzt
  PERFECT_TOL: 18,
  PTS_LAND: 10,
  PTS_PERFECT: 25,
  PTS_TRUCK: 80,
};

// ===================================================================
// AUDIO ENGINE
// ===================================================================
const Audio = (() => {
  let ctx = null;
  const getCtx = () => {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  };
  let _noise = null;
  const noise = () => {
    if (_noise) return _noise;
    const c = getCtx(), buf = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return (_noise = buf);
  };
  let servoNode = null, servoGain = null, servoO1 = null, servoO2 = null;
  function startServo() {
    if (servoNode) return;
    const c = getCtx();
    servoGain = c.createGain(); servoGain.gain.value = 0; servoGain.connect(c.destination);
    servoO1 = c.createOscillator(); servoO1.type = 'sawtooth'; servoO1.frequency.value = 148;
    servoO2 = c.createOscillator(); servoO2.type = 'sawtooth'; servoO2.frequency.value = 151;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600;
    servoO1.connect(f); servoO2.connect(f); f.connect(servoGain);
    servoO1.start(); servoO2.start(); servoNode = servoO1;
    servoGain.gain.setTargetAtTime(0.06, c.currentTime, 0.25);
  }
  function stopServo() {
    if (!servoGain) return;
    servoGain.gain.setTargetAtTime(0, getCtx().currentTime, 0.3);
    servoNode = null; servoGain = null; servoO1 = null; servoO2 = null;
  }
  // Tonhöhe an Geschwindigkeit anpassen (60–1000 px/s → 100–280 Hz)
  function setServoFreq(speed) {
    if (!servoO1 || !servoO2) return;
    const t = getCtx().currentTime;
    const freq = 100 + (Math.min(speed, 1000) - 60) / 940 * 180;
    servoO1.frequency.setTargetAtTime(freq, t, 0.15);
    servoO2.frequency.setTargetAtTime(freq + 3, t, 0.15);  // leichtes Schwebungsintervall
  }
  function playGripper() {
    const c = getCtx(), t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = noise();
    const g = c.createGain(); g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2500;
    src.connect(f); f.connect(g); g.connect(c.destination);
    src.start(t); src.stop(t + 0.2);
  }
  function playImpact() {
    const c = getCtx(), t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
    const go = c.createGain(); go.gain.setValueAtTime(0.7, t); go.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(go); go.connect(c.destination); o.start(t); o.stop(t + 0.36);
    const src = c.createBufferSource(); src.buffer = noise();
    const g = c.createGain(); g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1200;
    src.connect(f); f.connect(g); g.connect(c.destination); src.start(t); src.stop(t + 0.15);
  }
  function playPing() {
    const c = getCtx(), t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 880;
    const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = 1320;
    const g = c.createGain(); g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(g); o2.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + 0.52); o2.start(t); o2.stop(t + 0.52);
  }
  function playTruckHorn() {
    const c = getCtx(), t = c.currentTime;
    [220, 280].forEach((freq, i) => {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t + i * 0.18);
      g.gain.linearRampToValueAtTime(0.25, t + i * 0.18 + 0.05);
      g.gain.setValueAtTime(0.25, t + i * 0.18 + 0.15);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.18 + 0.28);
      o.connect(g); g.connect(c.destination);
      o.start(t + i * 0.18); o.stop(t + i * 0.18 + 0.3);
    });
  }
  function playClick() {
    const c = getCtx(), t = c.currentTime;
    const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 200;
    const g = c.createGain(); g.gain.setValueAtTime(0.15, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.06);
  }
  let ambNode = null;
  function startAmb() {
    if (ambNode) return;
    const c = getCtx(), src = c.createBufferSource();
    const buf = c.createBuffer(1, c.sampleRate * 4, c.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    src.buffer = buf; src.loop = true;
    const g = c.createGain(); g.gain.value = 0.03;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 300; f.Q.value = 0.5;
    src.connect(f); f.connect(g); g.connect(c.destination); src.start(); ambNode = src;
  }
  function stopAmb() {
    if (!ambNode) return;
    try { ambNode.stop(); } catch (e) { }
    ambNode = null;
  }
  let truckEngineNode = null, truckEngineGain = null;
  function startTruckEngine() {
    if (truckEngineNode) return;
    const c = getCtx(), t = c.currentTime;
    truckEngineGain = c.createGain(); truckEngineGain.gain.value = 0; truckEngineGain.connect(c.destination);
    const o1 = c.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 54;
    const o2 = c.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 56;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 180;
    o1.connect(f); o2.connect(f); f.connect(truckEngineGain);
    o1.start(); o2.start(); truckEngineNode = o1;
    truckEngineGain.gain.setTargetAtTime(0.12, t, 0.3);
  }
  function stopTruckEngine(withSqueal = false) {
    if (!truckEngineGain) return;
    const c = getCtx(), t = c.currentTime;
    truckEngineGain.gain.setTargetAtTime(0, t, 0.2);
    setTimeout(() => { if (truckEngineNode) { try { truckEngineNode.stop(); } catch (e) { } truckEngineNode = null; truckEngineGain = null; } }, 300);

    if (withSqueal) {
      const sSrc = c.createBufferSource(); sSrc.buffer = noise();
      const sG = c.createGain(); sG.gain.setValueAtTime(0, t);
      sG.gain.linearRampToValueAtTime(0.04, t + 0.05);
      sG.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      const sF = c.createBiquadFilter(); sF.type = 'bandpass'; sF.frequency.value = 4500; sF.Q.value = 5;
      sSrc.connect(sF); sF.connect(sG); sG.connect(c.destination);
      sSrc.start(t); sSrc.stop(t + 0.7);
    }
  }
  return { startServo, stopServo, setServoFreq, playGripper, playImpact, playPing, playTruckHorn, playClick, startAmb, stopAmb, startTruckEngine, stopTruckEngine };
})();

// ===================================================================
// HELPER
// ===================================================================
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ===================================================================
// BLOCK – kann am Greifer hängen (kein Body) oder physikalisch fallen
// ===================================================================
class Block {
  constructor(type) {
    this.type = type;
    this.w = type.w;
    this.h = type.h;
    this.body = null;        // Matter.js Body (nach Abwurf)
    this.glowTimer = 0;
    this.settledFrames = 0;
    this.settled = false;
    this.counted = false;
    // Position wenn am Greifer (kein Body)
    this.gripX = 0;
    this.gripY = 0;
  }

  /** Block mit Physics-Body zeichnen (rotiert, Matter-Position) */
  drawBody(ctx) {
    if (!this.body) return;
    const { x, y } = this.body.position;
    const a = this.body.angle;
    const hw = this.w / 2, hh = this.h / 2;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);

    if (this.glowTimer > 0) {
      ctx.shadowColor = '#f37021';
      ctx.shadowBlur = 28 * (this.glowTimer / 0.6);
    }

    // Hauptfläche
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 4;
    roundRect(ctx, -hw, -hh, this.w, this.h, 5);
    ctx.fillStyle = this.type.color; ctx.fill();
    ctx.restore();

    // Streifen
    ctx.save();
    ctx.beginPath(); roundRect(ctx, -hw, -hh, this.w, this.h, 5); ctx.clip();
    ctx.fillStyle = this.type.stripe;
    for (let i = 8; i < this.w; i += 18) ctx.fillRect(-hw + i, -hh, 6, this.h);
    ctx.restore();

    // Rahmen
    roundRect(ctx, -hw, -hh, this.w, this.h, 5);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1.5; ctx.stroke();

    // Label dynamisch setzen (Company Name vs COMPANY)
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = 'bold 11px "Roboto Condensed",sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let blockText = this.type.label;
    if (this.type.label === 'COMP1') blockText = globalCompanyName;
    if (this.type.label === 'COMP2') blockText = globalCompanyName.substring(0, 2) + " HAUL";
    ctx.fillText(blockText, 0, 0);

    // Bolzen-Ecken
    for (const [bx, by] of [[-hw + 8, -hh + 8], [hw - 8, -hh + 8], [-hw + 8, hh - 8], [hw - 8, hh - 8]]) {
      ctx.beginPath(); ctx.arc(bx, by, 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fill();
    }

    ctx.restore();
  }

  /** Block am Greifer zeichnen (keine Rotation) */
  drawGrip(ctx) {
    const sx = this.gripX - this.w / 2;
    const sy = this.gripY;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 5;
    roundRect(ctx, sx, sy, this.w, this.h, 5);
    ctx.fillStyle = this.type.color; ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath(); roundRect(ctx, sx, sy, this.w, this.h, 5); ctx.clip();
    ctx.fillStyle = this.type.stripe;
    for (let i = 8; i < this.w; i += 18) ctx.fillRect(sx + i, sy, 6, this.h);
    ctx.restore();

    roundRect(ctx, sx, sy, this.w, this.h, 5);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1.5; ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = 'bold 11px "Roboto Condensed",sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let blockText = this.type.label;
    if (this.type.label === 'COMP1') blockText = globalCompanyName;
    if (this.type.label === 'COMP2') blockText = globalCompanyName.substring(0, 2) + " HAUL";
    ctx.fillText(blockText, sx + this.w / 2, sy + this.h / 2);
  }
}

// ===================================================================
// ROBOTER
// ===================================================================
class Robot {
  constructor(railY, cw) {
    this.railY = railY; this.cw = cw;
    this.x = cw * 0.5; this.dir = 1; this.speed = CFG.BASE_SPEED;
    this.gripperOpen = false;
    this.L1 = 130;   // Oberarm-Länge
    this.L2 = 110;   // Unterarm-Länge
    this._elbowOff = 0;    // aktueller Ellbogen-Offset (animiert)
    this._elbowTgt = 0;    // Ziel-Offset
  }

  update(dt) {
    this.x += this.dir * this.speed * dt;
    // Servo-Sound-Frequenz aktualisieren (nur wenn in Bewegung/Aktiv)
    Audio.setServoFreq(this.speed);

    const m = CFG.ROBOT_W / 2 + 10;
    if (this.x > this.cw - m) { this.x = this.cw - m; this.dir = -1; }
    if (this.x < m) { this.x = m; this.dir = 1; }
    // Ellbogen animieren – schwingt leicht in Fahrtrichtung
    this._elbowTgt = this.dir * (this.gripperOpen ? 70 : 35);
    this._elbowOff += (this._elbowTgt - this._elbowOff) * Math.min(dt * 5, 1);
  }

  get shoulderY() { return this.railY + 32; }
  get gripperY() { return this.shoulderY + this.L1 + this.L2 + CFG.GRIPPER_H; }

  // Hilfsfunktion: Trapezsegment zwischen zwei Punkten
  _segment(ctx, x1, y1, x2, y2, w1, w2) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len, ny = dx / len;
    ctx.beginPath();
    ctx.moveTo(x1 + nx * w1, y1 + ny * w1);
    ctx.lineTo(x2 + nx * w2, y2 + ny * w2);
    ctx.lineTo(x2 - nx * w2, y2 - ny * w2);
    ctx.lineTo(x1 - nx * w1, y1 - ny * w1);
    ctx.closePath();
  }

  // Gelenk-Kreis zeichnen
  _joint(ctx, jx, jy, r, dotR) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(jx, jy, r, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(jx - r * 0.3, jy - r * 0.3, 1, jx, jy, r);
    g.addColorStop(0, '#6a6f78'); g.addColorStop(1, '#2a2d32');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = '#888'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
    ctx.beginPath(); ctx.arc(jx, jy, dotR, 0, Math.PI * 2);
    ctx.fillStyle = '#f37021'; ctx.fill();
  }

  draw(ctx) {
    const x = this.x, ry = this.railY;

    // === SCHIENE ===
    const rg = ctx.createLinearGradient(0, ry - 14, 0, ry);
    rg.addColorStop(0, '#555a61'); rg.addColorStop(.5, '#7a7f88'); rg.addColorStop(1, '#3a3d42');
    ctx.fillStyle = rg; ctx.fillRect(0, ry - CFG.RAIL_H, this.cw, CFG.RAIL_H);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
    for (let rx = 20; rx < this.cw; rx += 40) {
      ctx.beginPath(); ctx.moveTo(rx, ry - CFG.RAIL_H + 4); ctx.lineTo(rx, ry - 4); ctx.stroke();
    }
    ctx.fillStyle = '#f37021'; ctx.fillRect(0, ry - 3, this.cw, 3);

    // === FAHRWERK ===
    const fwX = x - CFG.ROBOT_W / 2, fwY = ry, fwH = 32;
    const fg = ctx.createLinearGradient(fwX, fwY, fwX, fwY + fwH);
    fg.addColorStop(0, '#606570'); fg.addColorStop(1, '#35383d');
    roundRect(ctx, fwX, fwY, CFG.ROBOT_W, fwH, 6); ctx.fillStyle = fg; ctx.fill();
    ctx.strokeStyle = '#f37021'; ctx.lineWidth = 2; ctx.stroke();
    for (const wx of [fwX + 14, fwX + CFG.ROBOT_W - 14]) {
      ctx.beginPath(); ctx.arc(wx, ry - 5, 7, 0, Math.PI * 2); ctx.fillStyle = '#2c2f33'; ctx.fill();
      ctx.strokeStyle = '#888'; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(wx, ry - 5, 3, 0, Math.PI * 2); ctx.fillStyle = '#f37021'; ctx.fill();
    }

    // === ARM-KOORDINATEN ===
    const sX = x, sY = this.shoulderY;              // Schulter
    const eX = x + this._elbowOff, eY = sY + this.L1; // Ellbogen
    const wX = x, wY = sY + this.L1 + this.L2;      // Handgelenk
    const gY = wY + CFG.GRIPPER_H;                    // Greifer-Bottom

    // Arm-Schatten zuerst
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 16; ctx.shadowOffsetX = 5; ctx.shadowOffsetY = 5;

    // -- OBERARM --
    // Gradient senkrecht zur Segment-Achse (dreht sich mit dem Arm)
    const dx1 = eX - sX, dy1 = eY - sY, l1 = Math.sqrt(dx1 * dx1 + dy1 * dy1) || 1;
    const n1x = -dy1 / l1, n1y = dx1 / l1;   // Normalenvektor
    const mc1x = (sX + eX) / 2, mc1y = (sY + eY) / 2;
    const uag = ctx.createLinearGradient(mc1x - n1x * 18, mc1y - n1y * 18, mc1x + n1x * 18, mc1y + n1y * 18);
    uag.addColorStop(0, '#2c2f33'); uag.addColorStop(0.5, '#f37021'); uag.addColorStop(1, '#2c2f33');
    ctx.fillStyle = uag;
    this._segment(ctx, sX, sY, eX, eY, 18, 14); ctx.fill();
    ctx.strokeStyle = '#d45f10'; ctx.lineWidth = 2; ctx.stroke();
    // Detail-Linie (parallel zur Seite)
    ctx.strokeStyle = 'rgba(255,180,80,0.6)'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sX - n1x * 5, sY - n1y * 5);
    ctx.lineTo(eX - n1x * 4, eY - n1y * 4); ctx.stroke();

    // -- UNTERARM --
    const dx2 = wX - eX, dy2 = wY - eY, l2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 1;
    const n2x = -dy2 / l2, n2y = dx2 / l2;
    const mc2x = (eX + wX) / 2, mc2y = (eY + wY) / 2;
    const lag = ctx.createLinearGradient(mc2x - n2x * 15, mc2y - n2y * 15, mc2x + n2x * 15, mc2y + n2y * 15);
    lag.addColorStop(0, '#2c2f33'); lag.addColorStop(0.5, '#d45f10'); lag.addColorStop(1, '#2c2f33');
    ctx.fillStyle = lag;
    this._segment(ctx, eX, eY, wX, wY, 14, 10); ctx.fill();
    ctx.strokeStyle = '#d45f10'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();

    // === GELENKE (über Armen gezeichnet) ===
    this._joint(ctx, sX, sY, 22, 9);   // Schulter
    this._joint(ctx, eX, eY, 17, 7);   // Ellbogen
    this._joint(ctx, wX, wY, 13, 5);   // Handgelenk

    // === GREIFER ===
    const gw = 34;
    roundRect(ctx, wX - gw / 2, wY, gw, 10, 3); ctx.fillStyle = '#f37021'; ctx.fill();
    const fo = this.gripperOpen ? 20 : 5;
    ctx.fillStyle = '#d45f10';
    ctx.fillRect(wX - gw / 2 - fo, wY + 6, 12, CFG.GRIPPER_H - 8);
    ctx.fillRect(wX + gw / 2 + fo - 12, wY + 6, 12, CFG.GRIPPER_H - 8);
    // Greifer-Finger Detail
    ctx.strokeStyle = '#f37021'; ctx.lineWidth = 1;
    ctx.strokeRect(wX - gw / 2 - fo, wY + 6, 12, CFG.GRIPPER_H - 8);
    ctx.strokeRect(wX + gw / 2 + fo - 12, wY + 6, 12, CFG.GRIPPER_H - 8);
  }
}

// ===================================================================
// LKW
// ===================================================================
class Truck {
  constructor(cw, floorY) {
    this.cw = cw; this.floorY = floorY;
    this.WHEEL_R = 28; this.PLAT_H = 22; this.PLAT_W = 390; this.CAB_W = 115; this.CAB_H = 95;
    this.totalW = this.CAB_W + this.PLAT_W;
    this.x = cw + 20;
    this.targetX = Math.round((cw - this.totalW) / 2);
    this.state = 'incoming'; this.speed = 800;
  }
  get platformLeft() { return this.x + this.CAB_W; }
  get platformRight() { return this.x + this.CAB_W + this.PLAT_W; }
  get platformCenterX() { return (this.platformLeft + this.platformRight) / 2; }
  get platformTop() { return this.floorY - 2 * this.WHEEL_R - this.PLAT_H; }
  get isOffScreen() { return this.x + this.totalW < -80; }

  update(dt) {
    if (this.state === 'incoming') {
      this.x -= this.speed * dt;
      if (this.x <= this.targetX) { this.x = this.targetX; this.state = 'loading'; }
    } else if (this.state === 'leaving') {
      this.x -= this.speed * 2.2 * dt;
    }
  }
  draw(ctx) {
    const flY = this.floorY, cabX = this.x, platX = this.x + this.CAB_W;
    const platY = this.platformTop, wheelY = flY - this.WHEEL_R;

    const drawWheel = (wx) => {
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(wx, wheelY, this.WHEEL_R, 0, Math.PI * 2);
      ctx.fillStyle = '#1a1a1a'; ctx.fill(); ctx.strokeStyle = '#444'; ctx.lineWidth = 3; ctx.stroke();
      ctx.restore();
      ctx.beginPath(); ctx.arc(wx, wheelY, this.WHEEL_R * .55, 0, Math.PI * 2); ctx.fillStyle = '#555'; ctx.fill();
      ctx.beginPath(); ctx.arc(wx, wheelY, this.WHEEL_R * .18, 0, Math.PI * 2); ctx.fillStyle = '#f37021'; ctx.fill();
    };

    // Trailer-Räder zuerst (hinter Auflieger)
    drawWheel(platX + 55);
    drawWheel(platX + this.PLAT_W - 55);

    // Fahrgestell
    ctx.fillStyle = '#2c2f33'; ctx.fillRect(platX, flY - this.WHEEL_R * 2 + 2, this.PLAT_W, this.WHEEL_R * 2 - 4);
    ctx.fillStyle = '#404348'; ctx.fillRect(platX + 10, flY - this.WHEEL_R * 2 + 6, this.PLAT_W - 20, 8);
    // Ladefläche
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 6;
    ctx.fillStyle = '#7a5530'; ctx.fillRect(platX, platY, this.PLAT_W, this.PLAT_H); ctx.restore();
    ctx.strokeStyle = '#5a3a18'; ctx.lineWidth = 1.5;
    for (let lx = platX + 22; lx < platX + this.PLAT_W; lx += 22) {
      ctx.beginPath(); ctx.moveTo(lx, platY + 2); ctx.lineTo(lx, platY + this.PLAT_H - 2); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(platX, platY, this.PLAT_W, 3);
    ctx.strokeStyle = '#3a2010'; ctx.lineWidth = 2; ctx.strokeRect(platX, platY, this.PLAT_W, this.PLAT_H);
    // Bordwände
    ctx.fillStyle = '#6a6f78';
    ctx.fillRect(platX - 4, platY - 16, 6, 16);
    ctx.fillRect(platX + this.PLAT_W - 2, platY - 32, 8, 32);
    // Fahrerhaus
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 12;
    const cg = ctx.createLinearGradient(cabX, platY - this.CAB_H, cabX + this.CAB_W, platY);
    cg.addColorStop(0, '#5a5f68'); cg.addColorStop(1, '#2c2f33');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.moveTo(cabX + this.CAB_W, flY - this.WHEEL_R * 2 + 2); ctx.lineTo(cabX + this.CAB_W, platY - this.CAB_H);
    ctx.lineTo(cabX + 16, platY - this.CAB_H);
    ctx.quadraticCurveTo(cabX, platY - this.CAB_H, cabX, platY - this.CAB_H + 16);
    ctx.lineTo(cabX, flY - this.WHEEL_R);
    ctx.lineTo(cabX + this.CAB_W, flY - this.WHEEL_R);
    ctx.closePath(); ctx.fill(); ctx.restore();
    ctx.fillStyle = 'rgba(170,215,255,0.35)';
    roundRect(ctx, cabX + 10, platY - this.CAB_H + 12, this.CAB_W - 14, 28, 3); ctx.fill();
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#f37021'; ctx.font = 'bold 14px "Roboto Condensed",sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(globalCompanyName, cabX + this.CAB_W / 2, platY - 28);

    // Vorderrad ZULETZT – überdeckt das Führerhaus
    drawWheel(cabX + this.CAB_W / 2);
  }
}

// ===================================================================
// PARTIKEL
// ===================================================================
class Particle {
  constructor(x, y, color) {
    this.x = x; this.y = y;
    this.vx = (Math.random() - 0.5) * 350; this.vy = -(Math.random() * 400 + 100);
    this.life = 1; this.size = Math.random() * 12 + 4; this.color = color;
  }
  update(dt) { this.vy += 1400 * dt; this.x += this.vx * dt; this.y += this.vy * dt; this.life -= dt * 0.9; }
  draw(ctx) {
    ctx.save(); ctx.globalAlpha = Math.max(0, this.life); ctx.fillStyle = this.color;
    ctx.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size); ctx.restore();
  }
}

// ===================================================================
// HAUPTSPIEL
// ===================================================================
class GiantTower {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.state = 'idle';
    this.score = 0; this.highscore = 0;
    this.truckParts = 0; this.trucksLoaded = 0; this.partsTotal = 0;

    this.robot = null; this.truck = null;
    this.activeBlock = null;   // hängt am Greifer
    this.physicsBlocks = [];   // alle Blöcke in Matter.js-Simulation
    this.particles = [];

    // Matter.js Engine (einmal erstellt, world wird geleert beim Start)
    this.engine = Engine.create({ gravity: { x: 0, y: 1, scale: CFG.GRAVITY_SCALE } });
    this.matterBodies = {}; // static bodies: floor, platform

    this._resize();

    // Prüfen, ob der Spieler schon registriert ist
    checkPlayerProfile();

    // Klick auf das gesamte Fenster zum Abwerfen (erlaubt Klicks im schwarzen Rand)
    const handleInput = (e) => {
      // Ignoriere Klicks auf UI-Elemente
      if (e.target.closest('button') || e.target.closest('.overlay-box') || e.target.closest('.smartpad-panel') || e.target.closest('#speed-panel') || e.target.closest('.input-group')) return;

      // Position des Klicks/Touch bestimmen
      const x = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);

      // NEU: Wenn der Touch/Klick im linken Bereich ist (Speed-Zone), kein Abwurf!
      // Das erlaubt das Wischen links, ohne dass eine Kiste fällt.
      if (x < window.innerWidth * 0.35) return;

      this._inputDrop();
    };

    window.addEventListener('pointerdown', handleInput);
    // Zusätzlicher Touch-Listener für ältere iOS Versionen
    window.addEventListener('touchstart', (e) => {
      if (e.touches.length > 1) return; // Multi-Touch ignorieren
      handleInput(e);
    }, { passive: true });

    window.addEventListener('keydown', e => {
      // Ignoriere Tasteneingaben, wenn der User in ein Input-Feld tippt
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      if (e.code === 'Space') { e.preventDefault(); this._inputDrop(); }
      if (e.code === 'Enter') { e.preventDefault(); this.sendTruck(); }
      if (e.code === 'KeyW') { e.preventDefault(); this._adjustSpeed(+30); }
      if (e.code === 'KeyS') { e.preventDefault(); this._adjustSpeed(-30); }
    });

    // Rechtsklick auf das gesamte Fenster = LKW abschicken
    window.addEventListener('contextmenu', e => {
      // Ignoriere UI
      if (e.target.closest('button') || e.target.closest('.overlay-box')) return;
      e.preventDefault();
      this.sendTruck();
    });

    // Mausrad = Geschwindigkeit (bleibt am Fenster)
    window.addEventListener('wheel', e => {
      // Wenn das Handbuch offen ist, erlauben wir das Scrollen
      const manual = document.getElementById('overlay-manual');
      if (manual && !manual.classList.contains('hidden')) return;

      e.preventDefault();
      this._adjustSpeed(e.deltaY < 0 ? +30 : -30);
    }, { passive: false });

    // --- TOUCH WIPING FÜR SPEED CONTROL (Linke Bildschirmseite) ---
    let touchStartY = null;
    let touchStartX = null;
    let lastTouchY = null;

    window.addEventListener('touchstart', e => {
      // Prüfen, ob Touch im linken Drittel des Bildschirms gestartet ist
      const touchX = e.touches[0].clientX;
      if (touchX < window.innerWidth * 0.35) {
        touchStartY = e.touches[0].clientY;
        touchStartX = touchX;
        lastTouchY = touchStartY;
      } else {
        touchStartY = null; // Ignorieren, ist Kisten-Wurf
      }
    }, { passive: true });

    window.addEventListener('touchmove', e => {
      if (touchStartY === null) return;

      const currentY = e.touches[0].clientY;
      const currentX = e.touches[0].clientX;
      const deltaY = lastTouchY - currentY;

      // Nur reagieren, wenn vertikaler Wisch (nicht zu viel zur Seite abgedriftet)
      if (Math.abs(touchStartX - currentX) < 80) {
        // Schwellenwert: Alle 10 Pixel Wischen = Speed-Änderung
        if (Math.abs(deltaY) > 10) {
          // Wischen nach Oben (deltaY positiv) = deutlich schneller (30 anstatt 10)
          this._adjustSpeed(deltaY > 0 ? +30 : -30);
          lastTouchY = currentY; // Referenzpunkt für nächste Änderung setzen
        }
      } else {
        touchStartY = null; // Wischen abgebrochen
      }
    }, { passive: true });

    document.querySelectorAll('.company-btn').forEach(b => b.addEventListener('mousedown', () => Audio.playClick()));

    this._lastTime = null;
    requestAnimationFrame(ts => this._loop(ts));
  }

  _resize() {
    // Feste Spielgröße – keine Fensterabhängigkeit
    this.canvas.width = this.cw = 1920;
    this.canvas.height = this.ch = 1080;
    this.floorY = this.ch - CFG.FLOOR_H;
    this.railY = CFG.RAIL_H;
    if (this.robot) { this.robot.cw = this.cw; this.robot.railY = this.railY; }
    if (this.truck) { this.truck.cw = this.cw; this.truck.floorY = this.floorY; }
  }

  // --- Physik-Statik-Bodies aufbauen ---
  _buildStaticBodies() {
    const world = this.engine.world;
    // Alles entfernen
    World.clear(world, false);
    // Unsichtbarer Boden (fängt alles auf, was vom LKW fällt)
    const floor = Bodies.rectangle(this.cw / 2, this.floorY + 25, this.cw * 4, 50, {
      isStatic: true, label: 'floor',
      friction: 0.6, restitution: 0.05
    });
    World.add(world, floor);
    this.matterBodies.floor = floor;
  }

  _buildTruckBody() {
    const world = this.engine.world;
    if (this.matterBodies.platform) World.remove(world, this.matterBodies.platform);
    const t = this.truck;
    const platCx = t.platformLeft + t.PLAT_W / 2;
    const platCy = t.platformTop + t.PLAT_H / 2;
    const platform = Bodies.rectangle(platCx, platCy, t.PLAT_W, t.PLAT_H, {
      isStatic: true, label: 'platform',
      friction: 0.7, restitution: 0.02
    });

    // Führerhaus-Wand: genau so hoch wie das Führerhaus (CAB_H)
    const cabWallH = t.CAB_H;
    const cabWallCx = t.platformLeft - 8;
    const cabWallCy = t.platformTop - t.CAB_H / 2;
    const cabWall = Bodies.rectangle(
      t.x + t.CAB_W / 2,  // Mittelpunkt X des gesamten Führerhauses
      cabWallCy,
      t.CAB_W,             // volle Breite des Führerhauses
      t.CAB_H,             // volle Höhe des Führerhauses
      { isStatic: true, label: 'cabwall', friction: 0.5, restitution: 0.01 }
    );

    // Rückwand rechts: physikalischer Körper, doppelt so hoch wie vorher (32px)
    const REAR_W = 10, REAR_H = 32;
    const rearWall = Bodies.rectangle(
      t.platformLeft + t.PLAT_W + REAR_W / 2 - 4,  // rechts an der Ladefläche
      t.platformTop - REAR_H / 2,                   // Unterkante = Oberkante Ladefläche
      REAR_W, REAR_H,
      { isStatic: true, label: 'rearwall', friction: 0.4, restitution: 0.02 }
    );

    World.add(world, [platform, cabWall, rearWall]);
    this.matterBodies.platform = platform;
    this.matterBodies.cabWall = cabWall;
    this.matterBodies.rearWall = rearWall;
  }

  // --- Spiel starten ---
  start() {
    this.score = 0; this.truckParts = 0; this.trucksLoaded = 0; this.partsTotal = 0;
    this.loadingTime = 0;     // Timer in Sekunden
    this.loadingStarted = false;
    this.activeBlock = null; this.physicsBlocks = []; this.particles = [];
    this.state = 'playing';

    this.robot = new Robot(this.railY, this.cw);
    this.truck = new Truck(this.cw, this.floorY);
    Audio.startTruckEngine();

    this._buildStaticBodies();

    document.getElementById('overlay-start').classList.add('hidden');
    document.getElementById('overlay-gameover').classList.add('hidden');
    document.getElementById('led-status').className = 'smartpad-led active';

    Audio.startAmb();
    document.getElementById('send-truck-bar').classList.add('hidden');
    // Speed-Anzeige initialisieren
    const sv = document.getElementById('speed-value');
    if (sv) sv.textContent = CFG.BASE_SPEED;
    this._updateHUD();
  }

  restart() { Audio.playClick(); this.start(); }

  // --- Spieler schickt LKW ab ---
  sendTruck() {
    if (this.state !== 'playing') return;
    if (this.truck.state !== 'loading') return;
    if (this.truckParts === 0) return; // Nichts drauf → kein Abschicken
    this._triggerTruckLeave();
  }

  // --- Geschwindigkeit per Button aufrufbar ---
  speedUp() { this._adjustSpeed(+30); }
  speedDown() { this._adjustSpeed(-30); }

  // --- Roboter-Geschwindigkeit anpassen (Mausrad / W-S / Buttons) ---
  _adjustSpeed(delta) {
    if (!this.robot) return;
    this.robot.speed = Math.max(60, Math.min(CFG.MAX_SPEED, this.robot.speed + delta));
    // Speed-Anzeige kurz aufblitzen lassen
    const el = document.getElementById('speed-value');
    if (el) {
      el.textContent = Math.round(this.robot.speed);
      el.classList.add('flash');
      clearTimeout(this._speedFlashTimer);
      this._speedFlashTimer = setTimeout(() => el.classList.remove('flash'), 500);
    }
  }


  _spawnBlock() {
    if (this.truck.state !== 'loading') return;
    const margin = CFG.ROBOT_W / 2 + 10;
    // Immer BEIDE Seiten mit je einem zufälligen Block-Typ belegen
    this._pickupLeft = { x: margin, type: CFG.BLOCK_TYPES[Math.floor(Math.random() * CFG.BLOCK_TYPES.length)] };
    this._pickupRight = { x: this.cw - margin, type: CFG.BLOCK_TYPES[Math.floor(Math.random() * CFG.BLOCK_TYPES.length)] };
    this.activeBlock = null;
    this.robot.gripperOpen = true;
    // Legacy-Felder leeren
    this._pendingBlockType = null;
    this._pickupX = null;
  }

  // --- Klick / Space: Block abwerfen ---
  _inputDrop() {
    if (this.state !== 'playing') return;
    if (!this.activeBlock) return;
    if (this.truck.state !== 'loading') return;

    // Position vom Greifer übernehmen
    const dropX = this.robot.x;
    const dropY = this.robot.gripperY + this.activeBlock.h / 2;

    // Matter.js Body erzeugen
    const body = Bodies.rectangle(dropX, dropY, this.activeBlock.w, this.activeBlock.h, {
      restitution: 0.04,   // kaum Abprall
      friction: 0.65,
      frictionAir: 0.008,
      density: 0.003,
      label: 'block',
      chamfer: { radius: 3 }  // leicht abgerundete Ecken (vermeidet Haken)
    });
    // Wurfparabel: Kiste erbt horizontale Robotergeschwindigkeit
    // Matter.js Velocity ist in px/Tick, bei ~60fps: px/s ÷ 60 ≈ px/Tick
    const horizVel = this.robot.dir * this.robot.speed / 60;
    Body.setVelocity(body, { x: horizVel, y: 0 });

    World.add(this.engine.world, body);
    this.activeBlock.body = body;
    this.physicsBlocks.push(this.activeBlock);
    this.activeBlock = null;

    this.robot.gripperOpen = true;
    Audio.playGripper();
    Audio.stopServo();
    // Sofort nächsten Pickup starten – Roboter fährt schon zum Rand
    // während die aktuelle Kiste noch fällt
    this._spawnBlock();
    setTimeout(() => { if (this.state === 'playing' && this.truck.state === 'loading') Audio.startServo(); }, 350);
  }

  // --- HUD Update ---
  _updateHUD() {
    document.getElementById('hud-score').textContent = this.score;
    document.getElementById('hud-parts').textContent = this.truckParts;
    document.getElementById('hud-level').textContent = Math.round(this.loadingTime) + 's';
  }

  // --- Game Over (Kiste fiel runter) ---
  _triggerGameOver(block) {
    if (this.state === 'gameover') return; // nicht doppelt auslösen
    this.state = 'gameover';
    Audio.stopServo();
    Audio.playImpact();
    document.getElementById('led-status').className = 'smartpad-led error';
    document.getElementById('send-truck-bar').classList.add('hidden');
    this.activeBlock = null;

    if (block && block.body) {
      for (let i = 0; i < 24; i++) {
        this.particles.push(new Particle(
          block.body.position.x, block.body.position.y,
          i % 3 === 0 ? '#f37021' : block.type.color
        ));
      }
    }

    this._showResultOverlay('SYSTEM FAULT', 'Kiste vom LKW gefallen!', 1200);
  }

  // --- Ergebnis-Overlay (Game Over oder LKW abgeschickt) ---
  _showResultOverlay(title, subtitle, delay) {
    Audio.stopServo();
    Audio.stopAmb();

    const score = Math.round(this.truckParts * this.truckParts * 100 / Math.max(this.loadingTime, 1));
    this.score = score;
    const isMission = title === 'MISSION COMPLETE';
    // Highscore nur bei erfolgreichem Abliefern zählen
    if (isMission && this.score > this.highscore) this.highscore = this.score;

    setTimeout(() => {
      Audio.stopTruckEngine();
      const icon = document.getElementById('go-icon');
      const titleEl = document.getElementById('go-title');
      if (icon) { icon.textContent = isMission ? '✅' : '⚠'; icon.style.textShadow = isMission ? '0 0 20px #4cff72' : '0 0 20px #ff4444'; }
      if (titleEl) { titleEl.textContent = title; titleEl.style.color = isMission ? '#4cff72' : '#ff4444'; }
      document.getElementById('go-sub').textContent = subtitle;
      document.getElementById('go-score').textContent = this.score;
      document.getElementById('go-parts').textContent = this.truckParts;
      const goTime = document.getElementById('go-time');
      if (goTime) goTime.textContent = Math.round(this.loadingTime) + 's';
      document.getElementById('go-hi').textContent = this.highscore;

      // Top Scores aus Firebase laden
      if (window.dbLoadTopScores) {
        window.dbLoadTopScores();
      }

      document.getElementById('overlay-gameover').classList.remove('hidden');
    }, delay);
  }

  // --- LKW abfahren lassen (manuell oder automatisch) ---
  _triggerTruckLeave() {
    if (this.truck.state !== 'loading') return;

    // Punkte live berechnen und anzeigen
    const timeSec = Math.max(this.loadingTime, 1);
    const earned = Math.round(this.truckParts * this.truckParts * 100 / timeSec);
    this.score = earned;
    this.trucksLoaded++;
    this.activeBlock = null;
    this.loadingStarted = false;
    document.getElementById('send-truck-bar').classList.add('hidden');

    // Blöcke einfrieren und mitfahren lassen
    this._truckBlocks = this.physicsBlocks
      .filter(b => b.body && b.counted)
      .map(b => ({ body: b.body, relX: b.body.position.x - this.truck.x, relY: b.body.position.y }));
    this._truckBlocks.forEach(rb => Body.setStatic(rb.body, true));

    Audio.stopServo();
    this.truck.state = 'leaving';
    Audio.startTruckEngine();
    Audio.playTruckHorn();

    // FIREBASE HIGHSCORE SPEICHERN
    if (window.dbSaveHighscore) {
      window.dbSaveHighscore(globalPlayerName, globalCompanyName, this.score, this.truckParts, timeSec);
    }

    // Ergebnis-Screen nach LKW-Abfahrt
    this.state = 'gameover'; // Loop hält an, Partikel laufen weiter
    this._showResultOverlay('MISSION COMPLETE', 'LKW erfolgreich beladen!', 2000);
    this._updateHUD();
  }

  // --- GAME LOOP ---
  _loop(ts) {
    if (!this._lastTime) this._lastTime = ts;
    const dt = Math.min((ts - this._lastTime) / 1000, 0.05);
    this._lastTime = ts;
    this._update(dt);
    this._draw();
    requestAnimationFrame(t => this._loop(t));
  }

  // --- UPDATE ---
  _update(dt) {
    if (this.state === 'gameover') {
      this.particles = this.particles.filter(p => p.life > 0);
      this.particles.forEach(p => p.update(dt));
      // LKW fährt weiter ab (falls noch sichtbar)
      if (this.truck && this.truck.state === 'leaving') {
        this.truck.update(dt);
        // Blöcke mit dem LKW mitziehen
        if (this._truckBlocks) {
          const truckX = this.truck.x;
          for (const rb of this._truckBlocks) {
            if (!rb.body) continue;
            Body.setPosition(rb.body, { x: truckX + rb.relX, y: rb.relY });
          }
        }
      }
      return;
    }
    if (this.state !== 'playing') return;

    // Ladezeit-Timer + Live-Score-Berechnung
    if (this.truck && this.truck.state === 'loading' && this.loadingStarted) {
      this.loadingTime += dt;
      document.getElementById('hud-level').textContent = Math.round(this.loadingTime) + 's';
      // Live-Punkte: Teile² × 100 / Zeit → sinkt mit der Zeit, steigt mit Teilen
      const liveScore = this.truckParts > 0
        ? Math.round(this.truckParts * this.truckParts * 100 / Math.max(this.loadingTime, 1))
        : 0;
      document.getElementById('hud-score').textContent = liveScore;
    }

    // Matter.js Engine schritt
    Engine.update(this.engine, dt * 1000);

    // LKW update
    const prevState = this.truck.state;
    this.truck.update(dt);

    // LKW gerade angekommen → Physik-Platform aufbauen, Roboter + neuen Block starten
    if (prevState === 'incoming' && this.truck.state === 'loading') {
      this._buildTruckBody();
      Audio.stopTruckEngine(true);
      Audio.startServo();
      this.physicsBlocks = [];
      this.truckParts = 0;
      this.loadingTime = 0;
      this.loadingStarted = true;
      document.getElementById('send-truck-bar').classList.remove('hidden');
      this._spawnBlock();
    }

    // LKW abgefahren → neuer LKW (in nächster Runde)
    if (this.truck.state === 'leaving' && this.truck.isOffScreen) {
      this.physicsBlocks.forEach(b => { if (b.body) World.remove(this.engine.world, b.body); });
      this.physicsBlocks = [];
      this.truck = new Truck(this.cw, this.floorY);
      this.activeBlock = null;
    }

    // Blöcke mit dem abfahrenden LKW mitbewegen
    if (this.truck.state === 'leaving' && this._truckBlocks) {
      const truckX = this.truck.x;
      for (const rb of this._truckBlocks) {
        if (!rb.body) continue;
        Body.setPosition(rb.body, {
          x: truckX + rb.relX,
          y: rb.relY
        });
        Body.setVelocity(rb.body, { x: 0, y: 0 });
        Body.setAngularVelocity(rb.body, 0);
      }
    }

    // Roboter fährt immer wenn LKW lädt
    if (this.truck.state === 'loading') {
      this.robot.update(dt);

      // Pickup an beiden Rändern: erste erreichbare Seite aufnehmen
      if (!this.activeBlock && (this._pickupLeft || this._pickupRight)) {
        const checks = [
          this._pickupLeft && { side: 'left', px: this._pickupLeft.x, type: this._pickupLeft.type },
          this._pickupRight && { side: 'right', px: this._pickupRight.x, type: this._pickupRight.type },
        ].filter(Boolean);
        for (const c of checks) {
          if (Math.abs(this.robot.x - c.px) < 22) {
            this.activeBlock = new Block(c.type);
            this._pickupLeft = null;
            this._pickupRight = null;
            this.robot.gripperOpen = false;
            Audio.playGripper();
            break;
          }
        }
      }

      // Greifer-Position für aktiven Block mitführen
      if (this.activeBlock) {
        this.activeBlock.gripX = this.robot.x;
        this.activeBlock.gripY = this.robot.gripperY;
      }
    }

    // Settling Detection: Blöcke die ruhig sind zählen
    for (const block of this.physicsBlocks) {
      if (block.counted) continue;
      if (!block.body) continue;

      const speed = block.body.speed;
      const angSpeed = Math.abs(block.body.angularVelocity);

      if (speed < CFG.SETTLE_SPEED && angSpeed < 0.08) {
        block.settledFrames++;
      } else {
        block.settledFrames = 0;
        block.settled = false;
      }

      // Gerade zur Ruhe gekommen?
      if (!block.settled && block.settledFrames >= CFG.SETTLE_FRAMES) {
        block.settled = true;
        Audio.playImpact();

        // Liegt der Block noch auf dem LKW (nicht runtergefallen)?
        const bx = block.body.position.x;
        const by = block.body.position.y;
        const onTruck = bx >= this.truck.platformLeft - 30
          && bx <= this.truck.platformRight + 30
          && by < this.floorY - 10;

        if (onTruck) {
          block.counted = true;
          this.partsTotal++;
          this.truckParts++;
          this._updateHUD();
          // Pickup wird bereits in _inputDrop() gestartet – hier nichts mehr nötig
        } else {
          // Block vom LKW gefallen → Game Over!
          block.counted = true;
          this._triggerGameOver(block);
        }
      }

      // Glow-Timer
      if (block.glowTimer > 0) block.glowTimer -= dt;
    }

    // Bereits gezählte Blöcke: prüfen ob einer vom LKW gerutscht ist
    if (this.state === 'playing') {
      for (const block of this.physicsBlocks) {
        if (!block.counted || !block.body) continue;
        const by = block.body.position.y;
        // Block auf Straßenniveau → runtergerutscht (floorY-80 liegt unter Ladefläche, über Boden)
        if (by > this.floorY - 80) {
          this._triggerGameOver(block);
          return;
        }
      }
    }

    // Partikel
    this.particles = this.particles.filter(p => p.life > 0);
    this.particles.forEach(p => p.update(dt));
  }

  // --- DRAW ---
  _draw() {
    const ctx = this.ctx, w = this.cw, h = this.ch;
    ctx.clearRect(0, 0, w, h);

    // Hintergrund
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#9fa8b2'); bg.addColorStop(1, '#c8ced6');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);

    // Hallenpfeiler
    for (const px of [0.1, 0.9]) {
      const g = ctx.createLinearGradient(w * px - 25, 0, w * px + 25, 0);
      g.addColorStop(0, 'rgba(50,55,60,0.4)'); g.addColorStop(.5, 'rgba(80,85,92,0.12)'); g.addColorStop(1, 'rgba(50,55,60,0.03)');
      ctx.fillStyle = g; ctx.fillRect(w * px - 25, this.railY, 50, h - this.railY);
    }

    // Boden
    const fg = ctx.createLinearGradient(0, this.floorY, 0, this.floorY + CFG.FLOOR_H);
    fg.addColorStop(0, '#6a7080'); fg.addColorStop(.4, '#4a4d55'); fg.addColorStop(1, '#2c2f33');
    ctx.fillStyle = fg; ctx.fillRect(0, this.floorY, w, CFG.FLOOR_H + 20);
    ctx.strokeStyle = '#f37021'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, this.floorY); ctx.lineTo(w, this.floorY); ctx.stroke();

    // LKW
    if (this.truck) this.truck.draw(ctx);

    // Alle Physik-Blöcke
    this.physicsBlocks.forEach(b => b.drawBody(ctx));

    // Aktiver Block am Greifer
    if (this.activeBlock) this.activeBlock.drawGrip(ctx);

    // Partikel
    this.particles.forEach(p => p.draw(ctx));

    // Roboter (immer oben)
    if (this.robot) this.robot.draw(ctx);

    // Drop-Linie
    if (this.state === 'playing' && this.activeBlock && this.truck.state === 'loading') {
      const ax = this.robot.x;
      ctx.save(); ctx.setLineDash([6, 6]);
      ctx.strokeStyle = 'rgba(243,112,33,0.35)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(ax, this.robot.gripperY + this.activeBlock.h);
      ctx.lineTo(ax, this.truck.platformTop); ctx.stroke(); ctx.restore();
      ctx.fillStyle = '#f37021'; ctx.font = 'bold 10px "Roboto Condensed",sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('▼ DROP', ax, this.truck.platformTop - 6);
    }


    // Pickup-Zonen anzeigen (beide Seiten)
    if (this.state === 'playing') {
      const py = this.robot ? this.robot.gripperY - 4 : this.railY + 40;
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 180);
      for (const pu of [this._pickupLeft, this._pickupRight]) {
        if (!pu) continue;
        const px = pu.x;
        ctx.save();
        ctx.globalAlpha = 0.3 + 0.35 * pulse;
        ctx.strokeStyle = '#f37021'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
        ctx.strokeRect(px - pu.type.w / 2, py, pu.type.w, pu.type.h);
        // Gefüllte Vorschau des Block-Typs (halbtransparent)
        ctx.globalAlpha = 0.15 + 0.1 * pulse;
        ctx.fillStyle = pu.type.color;
        ctx.fillRect(px - pu.type.w / 2, py, pu.type.w, pu.type.h);
        ctx.globalAlpha = 0.7 + 0.3 * pulse;
        ctx.fillStyle = '#f37021';
        ctx.font = 'bold 10px "Roboto Condensed",sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.setLineDash([]);
        ctx.fillText('▼ PICKUP', px, py - 3);
        ctx.restore();
      }
    }

    // Einfahrt-Hinweis
    if (this.state === 'playing' && this.truck.state === 'incoming') {
      ctx.save(); ctx.fillStyle = 'rgba(243,112,33,0.9)';
      ctx.font = 'bold 18px "Roboto Condensed",sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('LKW KOMMT ...', w / 2, h / 2); ctx.restore();
    }
  }
}

// ===================================================================
// START
// ===================================================================
const game = new GiantTower();
