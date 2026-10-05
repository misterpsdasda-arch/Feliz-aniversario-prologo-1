/* =====================================================
   KIZUNAE — EXPERIENCIA INTERACTIVA DE ANIVERSARIO
   script.js — Flip Book 3D + fondo anime
   ===================================================== */

'use strict';

/* =====================================================
   CONFIGURACIÓN CENTRAL — edita aquí
   ===================================================== */
const CONFIG = {
  speed: 1,

  memories: [
    "si pudiera convertir mis sentimientos en estrellas,\nel cielo nunca volvería a estar oscuro",
    "te encontré entre millones de personas,\ny aun así sentí que eras tú desde el principio",
    "si la luna pudiera hablar, le contaría\ntodas las noches que he pensado en ti",
    "hay estrellas que brillan en el cielo\ny otras que llegaron a mi vida;\ntú eres ambas cosas",
    "si pudiera guardar un instante para siempre,\nelegiría uno en el que estés sonriendo",
    "mi lugar favorito no está en ningún mapa,\nestá donde tú estés",
    "quizá el universo es enorme porque necesitaba\nsuficiente espacio para que algún día nos encontráramos",
    "eres la casualidad más bonita\nque alguna vez tuvo mi vida",
  ],

  audio: {
    intro:    'zelda-lullaby.mp3',
    universe: 'nier-weight-of-the-world.mp3',
    reveal:   'nier-weight-of-the-world.mp3',
    letters:  'violet-evergarden.mp3',
    moon:     'violet-evergarden.mp3',
    final:    'zelda-miphas-theme.mp3',
  },

  colors: {
    glow:       'rgba(100,160,255,0.75)',
    glowPurple: 'rgba(160,120,255,0.75)',
    starWhite:  '#e8f0ff',
    starBlue:   '#a8c8ff',
    starWarm:   '#ffd8a0',
  },

  // Cuántas páginas tiene el libro
  totalPages: 4,
};

/* =====================================================
   ESTADO GLOBAL
   ===================================================== */
const State = {
  currentScene: 'scene-cover',
  transitioning: false,
  soundEnabled: false,
  soundInitialized: false,
  mouseX: 0.5,
  mouseY: 0.5,

  // Flip book
  currentPage: 0,       // página activa (0-based)
  flippedPages: [],     // índices de páginas ya volteadas
  bookActive: false,

  // Audio
  audioCtx: null,
  gainNode: null,
  currentAudio: null,

  // RAFs
  rafIds: {},

  // Partículas & estrellas
  particles: [],
  deepStars: [],
  shootingStars: [],
  memoryStars: [],
};

/* =====================================================
   UTILIDADES
   ===================================================== */
const $  = id => document.getElementById(id);
const raf = fn => requestAnimationFrame(fn);

function rand(min, max) { return Math.random() * (max - min) + min; }
function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }
function wait(ms) { return new Promise(r => setTimeout(r, ms / CONFIG.speed)); }

/* =====================================================
   AUDIO
   ===================================================== */
function initAudio() {
  if (State.soundInitialized) return;
  try {
    State.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    State.gainNode = State.audioCtx.createGain();
    State.gainNode.gain.value = 0;
    State.gainNode.connect(State.audioCtx.destination);
    State.soundInitialized = true;
  } catch (e) { /* sin audio */ }
}

async function playAudio(src, volume = 0.4, fadeIn = 3000) {
  if (!State.soundEnabled || !State.soundInitialized || !src) return;
  try {
    const resp = await fetch(src);
    if (!resp.ok) return;
    const buf  = await resp.arrayBuffer();
    const dec  = await State.audioCtx.decodeAudioData(buf);

    // Fade out suave de la música actual antes de iniciar la nueva
    if (State.currentAudio) {
      const g = State.gainNode.gain;
      g.cancelScheduledValues(State.audioCtx.currentTime);
      g.setValueAtTime(g.value, State.audioCtx.currentTime);
      g.linearRampToValueAtTime(0, State.audioCtx.currentTime + 1.8);
      // Esperar el fade out antes de iniciar la nueva
      await new Promise(r => setTimeout(r, 1900));
      try { State.currentAudio.stop(); } catch (_) {}
    }

    const src_ = State.audioCtx.createBufferSource();
    src_.buffer = dec;
    src_.loop   = true;
    src_.connect(State.gainNode);
    src_.start();
    State.currentAudio = src_;

    // Fade in desde 0 hasta el volumen objetivo
    const g = State.gainNode.gain;
    g.cancelScheduledValues(State.audioCtx.currentTime);
    g.setValueAtTime(0, State.audioCtx.currentTime);
    g.linearRampToValueAtTime(volume, State.audioCtx.currentTime + fadeIn / 1000);
  } catch (_) {}
}

function fadeOutAudio(ms = 2500) {
  if (!State.gainNode || !State.audioCtx) return;
  const g = State.gainNode.gain;
  g.cancelScheduledValues(State.audioCtx.currentTime);
  g.setValueAtTime(g.value, State.audioCtx.currentTime);
  g.linearRampToValueAtTime(0, State.audioCtx.currentTime + ms / 1000);
}

function setupSoundToggle() {
  const btn = $('sound-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    State.soundEnabled = !State.soundEnabled;
    btn.classList.toggle('muted', !State.soundEnabled);
    if (State.soundEnabled) {
      initAudio();
      if (State.audioCtx?.state === 'suspended') State.audioCtx.resume();
      playAudio(CONFIG.audio.intro, 0.35, 2000);
    } else {
      fadeOutAudio(1000);
    }
  });
}

/* =====================================================
   INPUT TRACKING
   ===================================================== */
function setupInputTracking() {
  document.addEventListener('mousemove', e => {
    State.mouseX = e.clientX / window.innerWidth;
    State.mouseY = e.clientY / window.innerHeight;
  });
  document.addEventListener('touchmove', e => {
    if (e.touches.length) {
      State.mouseX = e.touches[0].clientX / window.innerWidth;
      State.mouseY = e.touches[0].clientY / window.innerHeight;
    }
  }, { passive: true });
}

/* =====================================================
   CANVAS HELPERS
   ===================================================== */
function fitCanvas(canvas) {
  if (!canvas) return;
  canvas.width  = canvas.offsetWidth  || window.innerWidth;
  canvas.height = canvas.offsetHeight || window.innerHeight;
}

window.addEventListener('resize', () => {
  document.querySelectorAll('canvas').forEach(fitCanvas);
});

/* =====================================================
   PARTÍCULAS
   ===================================================== */
class Particle {
  constructor(x, y, opts = {}) {
    this.x     = x;
    this.y     = y;
    this.vx    = opts.vx    ?? rand(-1, 1);
    this.vy    = opts.vy    ?? rand(-2.5, -0.5);
    this.life  = 1;
    this.decay = opts.decay ?? rand(0.01, 0.022);
    this.size  = opts.size  ?? rand(1.5, 3.5);
    this.color = opts.color ?? CONFIG.colors.glow;
  }
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy *= 0.98;
    this.life -= this.decay;
  }
  draw(ctx) {
    if (this.life <= 0) return;
    ctx.save();
    ctx.globalAlpha = this.life * 0.9;
    ctx.shadowColor = this.color;
    ctx.shadowBlur  = this.size * 4;
    ctx.fillStyle   = this.color;
    if (this.isHeart) {
      // Dibujar corazón pequeño
      ctx.translate(this.x, this.y);
      const s = this.size * this.life;
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.3);
      ctx.bezierCurveTo( s*.55, -s*.85,  s*1.1,  s*.1,  0,  s*.75);
      ctx.bezierCurveTo(-s*1.1,  s*.1,  -s*.55, -s*.85,  0, -s*.3);
      ctx.closePath();
    } else {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * this.life, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.restore();
  }
  get dead() { return this.life <= 0; }
}

function burst(x, y, n = 18, opts = {}) {
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 / n) * i + rand(-0.3, 0.3);
    const s = rand(0.6, 3.5);
    State.particles.push(new Particle(x, y, {
      vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      color: Math.random() > 0.5 ? CONFIG.colors.glow : CONFIG.colors.glowPurple,
      ...opts,
    }));
  }
  // Añadir algunos corazones al burst
  if (!opts.noHearts) {
    for (let i = 0; i < 5; i++) {
      const a = rand(0, Math.PI * 2);
      const spd = rand(0.8, 2.5);
      State.particles.push(new Particle(x, y, {
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd - 1,
        size: rand(3, 7),
        decay: rand(0.008, 0.015),
        color: Math.random() > 0.5 ? 'rgba(220,140,255,0.9)' : 'rgba(255,160,200,0.9)',
        isHeart: true,
      }));
    }
  }
}

/* =====================================================
   CANVAS DEL CIELO — luna, aurora, nubes, estrellas
   Se renderiza detrás del PNG del suelo
   ===================================================== */
function initSkyCanvas() {
  const canvas = $('sky-canvas');
  if (!canvas) return;
  // CRÍTICO: forzar pointer-events none desde JS también
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '0';
  const ctx = canvas.getContext('2d');

  /* ── Estrellas del cielo (fijas, parpadeantes) ── */
  const skyStars = [];
  for (let i = 0; i < 260; i++) {
    skyStars.push({
      x:    rand(0, 1),
      y:    rand(0, 0.92),
      size: rand(0.3, 1.9),
      op:   rand(0.25, 1),
      tw:   rand(0, Math.PI * 2),
      twSpd:rand(0.5, 2.0),
      color: Math.random() > 0.88 ? CONFIG.colors.starWarm
           : Math.random() > 0.7  ? CONFIG.colors.starBlue
           : CONFIG.colors.starWhite,
    });
  }

  /* ── Estrellas ascendentes (tipo Uiverse animStar) ── */
  /* 3 capas: pequeñas rápidas, medianas, grandes lentas */
  const risingLayers = [
    { count: 120, size: 1, speed: 0.0004, op: 0.7 },
    { count: 80,  size: 2, speed: 0.00025, op: 0.85 },
    { count: 40,  size: 3, speed: 0.00015, op: 1.0 },
  ];
  const risingStars = [];
  risingLayers.forEach(layer => {
    for (let i = 0; i < layer.count; i++) {
      risingStars.push({
        x:    rand(0, 1),
        y:    rand(0, 1),      // posición normalizada 0-1
        size: layer.size,
        speed: layer.speed * rand(0.7, 1.3),
        op:   layer.op * rand(0.5, 1),
        color: CONFIG.colors.starWhite,
      });
    }
  });

  /* ── Estrella fugaz ── */
  let shoot = null, shootTimer = 0;
  function spawnShoot() {
    shoot = {
      x: rand(0.1, 0.75), y: rand(0.04, 0.28),
      vx: rand(0.003, 0.007), vy: rand(0.0015, 0.004),
      len: rand(0.06, 0.14), life: 1, decay: 0.02,
    };
  }

  /* ── Nubes ── */
  const clouds = [];
  for (let i = 0; i < 6; i++) {
    clouds.push({
      x:    rand(0, 1),
      y:    rand(0.28, 0.52),
      w:    rand(0.18, 0.38),
      h:    rand(0.04, 0.09),
      op:   rand(0.06, 0.16),
      spd:  rand(0.00008, 0.00018),
      color: Math.random() > 0.5
        ? 'rgba(180,150,220,'   // tono lila (aurora)
        : 'rgba(140,180,230,',  // tono azul claro
    });
  }

  let t = 0;

  function draw() {
    const w = canvas.width  = canvas.offsetWidth  || window.innerWidth;
    const h = canvas.height = canvas.offsetHeight || window.innerHeight;
    ctx.clearRect(0, 0, w, h);

    /* ── Degradado del cielo nocturno ── */
    const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
    skyGrad.addColorStop(0,    '#020510');   // negro profundo arriba
    skyGrad.addColorStop(0.18, '#05091e');
    skyGrad.addColorStop(0.42, '#081535');
    skyGrad.addColorStop(0.65, '#0d2050');   // azul medio
    skyGrad.addColorStop(0.82, '#163060');   // azul profundo horizonte
    skyGrad.addColorStop(1,    '#1a3870');   // horizonte luminoso
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h);

    /* ── Reflejo de luz en el horizonte ── */
    const horizGlow = ctx.createLinearGradient(0, h * 0.62, 0, h);
    horizGlow.addColorStop(0,   'transparent');
    horizGlow.addColorStop(0.5, 'rgba(60,100,200,0.12)');
    horizGlow.addColorStop(1,   'rgba(80,140,255,0.18)');
    ctx.fillStyle = horizGlow;
    ctx.fillRect(0, h * 0.62, w, h * 0.38);

    t += 0.007;

    /* ── Via Láctea / nebulosa central ── */
    const mwGrad = ctx.createRadialGradient(w*.5, h*.3, 0, w*.5, h*.3, w*.55);
    mwGrad.addColorStop(0,   'rgba(80,100,200,0.09)');
    mwGrad.addColorStop(0.5, 'rgba(60,80,180,0.05)');
    mwGrad.addColorStop(1,   'transparent');
    ctx.fillStyle = mwGrad;
    ctx.fillRect(0, 0, w, h * 0.65);

    /* ── AURORA BOREAL ── */
    drawAurora(ctx, w, h, t);

    /* ── LUNA ── */
    drawMoon(ctx, w, h, t);

    /* ── Nubes ── */
    clouds.forEach(c => {
      c.x += c.spd;
      if (c.x > 1.4) c.x = -0.4;
      const cx = c.x * w, cy = c.y * h;
      const cw = c.w * w, ch = c.h * h;
      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, cw * 0.5);
      cg.addColorStop(0,   c.color + c.op + ')');
      cg.addColorStop(0.5, c.color + (c.op * 0.5) + ')');
      cg.addColorStop(1,   'transparent');
      ctx.save();
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.ellipse(cx, cy, cw * 0.5, ch * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    /* ── Estrellas parpadeantes ── */
    skyStars.forEach(s => {
      const a = s.op * (0.6 + 0.4 * Math.sin(t * s.twSpd + s.tw));
      ctx.save();
      ctx.globalAlpha = a;
      ctx.shadowColor = s.color;
      ctx.shadowBlur  = s.size * 2.5;
      ctx.fillStyle   = s.color;
      ctx.beginPath();
      ctx.arc(s.x * w, s.y * h, s.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    /* ── Estrellas ascendentes (Uiverse animStar en canvas) ── */
    risingStars.forEach(s => {
      s.y -= s.speed;
      if (s.y < 0) { s.y = 1; s.x = rand(0, 1); }  // reciclar desde abajo
      ctx.save();
      ctx.globalAlpha = s.op;
      ctx.fillStyle   = s.color;
      ctx.beginPath();
      ctx.arc(s.x * w, s.y * h, s.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    /* ── Estrella fugaz ── */
    shootTimer++;
    if (shootTimer > 320 && !shoot) { spawnShoot(); shootTimer = 0; }
    if (shoot) {
      ctx.save();
      ctx.globalAlpha = shoot.life * 0.9;
      const sx = shoot.x * w, sy = shoot.y * h;
      const ex = (shoot.x - shoot.len) * w, ey = (shoot.y - shoot.len * 0.5) * h;
      const sg = ctx.createLinearGradient(sx, sy, ex, ey);
      sg.addColorStop(0, 'rgba(220,240,255,0.96)');
      sg.addColorStop(1, 'rgba(220,240,255,0)');
      ctx.strokeStyle = sg; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.restore();
      shoot.x += shoot.vx; shoot.y += shoot.vy;
      shoot.life -= shoot.decay;
      if (shoot.life <= 0) shoot = null;
    }

    State.rafIds.sky = raf(draw);
  }

  draw();
}

/* ── Luna llena con halo ── */
function drawMoon(ctx, w, h, t) {
  const mx = w * 0.38;
  const my = h * 0.18 + Math.sin(t * 0.08) * 3;   // leve flotación
  const mr = Math.min(w, h) * 0.062;

  // Halo exterior grande
  const halo2 = ctx.createRadialGradient(mx, my, mr * 0.8, mx, my, mr * 5.5);
  halo2.addColorStop(0,   'rgba(220,230,255,0.10)');
  halo2.addColorStop(0.4, 'rgba(180,200,255,0.05)');
  halo2.addColorStop(1,   'transparent');
  ctx.fillStyle = halo2;
  ctx.beginPath(); ctx.arc(mx, my, mr * 5.5, 0, Math.PI * 2); ctx.fill();

  // Halo interior suave
  const halo1 = ctx.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 2.2);
  halo1.addColorStop(0,   'rgba(240,245,255,0.22)');
  halo1.addColorStop(0.5, 'rgba(200,220,255,0.10)');
  halo1.addColorStop(1,   'transparent');
  ctx.fillStyle = halo1;
  ctx.beginPath(); ctx.arc(mx, my, mr * 2.2, 0, Math.PI * 2); ctx.fill();

  // Cuerpo de la luna
  const moonGrad = ctx.createRadialGradient(
    mx - mr * 0.25, my - mr * 0.25, 0,
    mx, my, mr
  );
  moonGrad.addColorStop(0,   'rgba(255,255,250,1)');
  moonGrad.addColorStop(0.5, 'rgba(220,230,255,0.97)');
  moonGrad.addColorStop(0.88,'rgba(180,200,240,0.92)');
  moonGrad.addColorStop(1,   'rgba(140,170,220,0.85)');
  ctx.save();
  ctx.shadowColor = 'rgba(200,220,255,0.8)';
  ctx.shadowBlur  = mr * 2.5;
  ctx.fillStyle   = moonGrad;
  ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // Detalles sutiles de la superficie
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle   = 'rgba(150,170,220,1)';
  ctx.beginPath(); ctx.ellipse(mx + mr*.2, my - mr*.1, mr*.35, mr*.22, -0.3, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(mx - mr*.25, my + mr*.2, mr*.2,  mr*.14,  0.5, 0, Math.PI*2); ctx.fill();
  ctx.restore();
}

/* ── Aurora boreal ── */
function drawAurora(ctx, w, h, t) {
  const auroraY = h * 0.08;
  const auroraH = h * 0.38;

  // Tres columnas de aurora con movimiento ondulante
  const columns = [
    { x: 0.55, color1: 'rgba(30,200,180,', color2: 'rgba(80,150,255,', width: 0.22, phase: 0 },
    { x: 0.68, color1: 'rgba(60,180,255,', color2: 'rgba(120,80,220,', width: 0.16, phase: 1.2 },
    { x: 0.78, color1: 'rgba(40,220,200,', color2: 'rgba(100,120,255,', width: 0.12, phase: 2.4 },
  ];

  columns.forEach(col => {
    const wave   = Math.sin(t * 0.4 + col.phase) * 0.03;
    const cx     = (col.x + wave) * w;
    const cw     = col.width * w;
    const opBase = 0.12 + 0.06 * Math.sin(t * 0.55 + col.phase);

    const ag = ctx.createLinearGradient(cx - cw/2, auroraY, cx - cw/2, auroraY + auroraH);
    ag.addColorStop(0,   'transparent');
    ag.addColorStop(0.15, col.color1 + opBase + ')');
    ag.addColorStop(0.45, col.color2 + (opBase * 1.3) + ')');
    ag.addColorStop(0.75, col.color1 + (opBase * 0.6) + ')');
    ag.addColorStop(1,   'transparent');

    ctx.save();
    ctx.fillStyle = ag;
    // Forma de columna ligeramente inclinada con ondas
    ctx.beginPath();
    const steps = 20;
    for (let i = 0; i <= steps; i++) {
      const py = auroraY + (auroraH / steps) * i;
      const waveX = Math.sin(i * 0.4 + t * 0.6 + col.phase) * cw * 0.18;
      const px = cx - cw/2 + waveX;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    for (let i = steps; i >= 0; i--) {
      const py = auroraY + (auroraH / steps) * i;
      const waveX = Math.sin(i * 0.4 + t * 0.6 + col.phase) * cw * 0.18;
      const px = cx + cw/2 + waveX;
      ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  });
}

/* initStarsCanvas eliminado — estrellas ahora son CSS Uiverse (animStar) */

/* =====================================================
   NEBULOSA HELPER
   ===================================================== */
function drawNebula(ctx, cx, cy, r, color, t) {
  const p = 0.85 + 0.15 * Math.sin(t * 0.3);
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * p);
  g.addColorStop(0, color);
  g.addColorStop(1, 'transparent');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r * p, 0, Math.PI * 2);
  ctx.fill();
}

/* =====================================================
   ESTRELLAS DEL UNIVERSO PROFUNDO
   ===================================================== */
function initDeepStars() {
  State.deepStars = [];
  // capa lejana
  for (let i = 0; i < 280; i++) State.deepStars.push({
    x: rand(0,1), y: rand(0,1), size: rand(0.2,0.9),
    layer:0, op:rand(0.2,0.7), tw:rand(0,Math.PI*2),
    color: CONFIG.colors.starWhite,
  });
  // capa media
  for (let i = 0; i < 110; i++) State.deepStars.push({
    x: rand(0,1), y: rand(0,1), size: rand(0.8,2.2),
    layer:1, op:rand(0.4,0.9), tw:rand(0,Math.PI*2),
    color: Math.random()>0.7 ? CONFIG.colors.starWarm
          : Math.random()>0.5 ? CONFIG.colors.starBlue
          : CONFIG.colors.starWhite,
  });
  // capa cercana — interactiva
  for (let i = 0; i < 38; i++) State.deepStars.push({
    x: rand(0,1), y: rand(0,1), size: rand(1.8,3.5),
    layer:2, op:rand(0.6,1), tw:rand(0,Math.PI*2),
    color: Math.random()>0.6 ? CONFIG.colors.starBlue : CONFIG.colors.starWhite,
    hovered: false,
  });
}

function drawDeepUniverse(ctx, w, h, t, mx, my, localParticles) {
  // fondo cosmos
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0,   '#01050d');
  bg.addColorStop(0.4, '#030c1e');
  bg.addColorStop(0.7, '#050f26');
  bg.addColorStop(1,   '#020812');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // nebulosas
  drawNebula(ctx, w*.5,  h*.45, w*.55, 'rgba(20,45,160,0.10)', t);
  drawNebula(ctx, w*.25, h*.3,  w*.4,  'rgba(60,20,130,0.07)', t*.6);
  drawNebula(ctx, w*.75, h*.6,  w*.4,  'rgba(15,55,120,0.07)', t*.8);
  drawNebula(ctx, w*.4,  h*.7,  w*.3,  'rgba(80,30,110,0.05)', t*.5);

  // parallax
  const px = (mx - 0.5) * 0.015;
  const py = (my - 0.5) * 0.015;

  State.deepStars.forEach(s => {
    const par = [0.003, 0.008, 0.016][s.layer];
    const sx  = ((s.x + px * par * 10 + 1) % 1) * w;
    const sy  = ((s.y + py * par * 10 + 1) % 1) * h;
    const a   = s.op * (0.55 + 0.45 * Math.sin(t * (1.2 + s.layer) + s.tw));
    ctx.save();
    ctx.globalAlpha = a;
    if (s.layer === 2) { ctx.shadowColor = s.color; ctx.shadowBlur = s.size * (s.hovered ? 12 : 3); }
    ctx.fillStyle = s.hovered ? '#fff' : s.color;
    ctx.beginPath();
    ctx.arc(sx, sy, s.size * (s.hovered ? 1.7 : 1), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    s._sx = sx; s._sy = sy;
  });

  // estrellas fugaces
  if (Math.random() < 0.002) State.shootingStars.push({
    x: rand(0.1,0.8), y: rand(0.05,0.4),
    vx: rand(0.004,0.008), vy: rand(0.002,0.005),
    len: rand(0.08,0.15), life:1, decay:0.018,
  });
  State.shootingStars = State.shootingStars.filter(s => s.life > 0);
  State.shootingStars.forEach(ss => {
    ctx.save();
    ctx.globalAlpha = ss.life * 0.85;
    const sx=ss.x*w, sy=ss.y*h, ex=(ss.x-ss.len)*w, ey=(ss.y-ss.len*.55)*h;
    const g=ctx.createLinearGradient(sx,sy,ex,ey);
    g.addColorStop(0,'rgba(220,240,255,0.95)'); g.addColorStop(1,'rgba(220,240,255,0)');
    ctx.strokeStyle=g; ctx.lineWidth=1.2;
    ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(ex,ey); ctx.stroke();
    ctx.restore();
    ss.x+=ss.vx; ss.y+=ss.vy; ss.life-=ss.decay;
  });

  // centro romántico — nebulosa luminosa, no planeta
  const cx = w*.5 + (mx-.5)*w*.015;
  const cy = h*.5 + (my-.5)*h*.015;
  const t_pulse = Date.now() * 0.0006;

  // capa exterior muy difusa — cálida
  const g1 = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w,h) * 0.32);
  g1.addColorStop(0,   'rgba(180, 140, 255, 0.04)');
  g1.addColorStop(0.4, 'rgba(120, 100, 220, 0.025)');
  g1.addColorStop(1,   'transparent');
  ctx.fillStyle = g1;
  ctx.beginPath(); ctx.arc(cx, cy, Math.min(w,h)*0.32, 0, Math.PI*2); ctx.fill();

  // capa media — azul suave pulsante
  const pulse1 = 0.9 + 0.1 * Math.sin(t_pulse * 0.8);
  const r2 = Math.min(w,h) * 0.14 * pulse1;
  const g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, r2);
  g2.addColorStop(0,   'rgba(140, 180, 255, 0.09)');
  g2.addColorStop(0.5, 'rgba(100, 140, 230, 0.05)');
  g2.addColorStop(1,   'transparent');
  ctx.fillStyle = g2;
  ctx.beginPath(); ctx.arc(cx, cy, r2, 0, Math.PI*2); ctx.fill();

  // núcleo — punto de luz muy pequeño y suave
  const pulse2 = 0.85 + 0.15 * Math.sin(t_pulse * 1.3 + 1);
  const r3 = Math.min(w,h) * 0.022 * pulse2;
  const g3 = ctx.createRadialGradient(cx, cy, 0, cx, cy, r3);
  g3.addColorStop(0,   `rgba(220, 230, 255, ${0.55 * pulse2})`);
  g3.addColorStop(0.5, `rgba(160, 190, 255, ${0.25 * pulse2})`);
  g3.addColorStop(1,   'transparent');
  ctx.save();
  ctx.shadowColor = 'rgba(180, 210, 255, 0.3)';
  ctx.shadowBlur  = r3 * 4;
  ctx.fillStyle   = g3;
  ctx.beginPath(); ctx.arc(cx, cy, r3, 0, Math.PI*2); ctx.fill();
  ctx.restore();

  // partículas
  State.particles = State.particles.filter(p=>!p.dead);
  State.particles.forEach(p=>{ p.update(); p.draw(ctx); });
  if (localParticles) {
    for (let i=localParticles.length-1;i>=0;i--) {
      localParticles[i].update(); localParticles[i].draw(ctx);
      if (localParticles[i].dead) localParticles.splice(i,1);
    }
  }
}

function startDeepCanvas(canvasId, sceneId, onClickCb) {
  const canvas = $(canvasId);
  if (!canvas) return;
  fitCanvas(canvas);
  const ctx = canvas.getContext('2d');
  const local = [];
  let t = 0;

  function draw() {
    if (!$(sceneId)?.classList.contains('active')) {
      cancelAnimationFrame(State.rafIds[canvasId]);
      delete State.rafIds[canvasId];
      return;
    }
    t += 0.006;
    drawDeepUniverse(ctx, canvas.width, canvas.height, t, State.mouseX, State.mouseY, local);
    State.rafIds[canvasId] = raf(draw);
  }
  draw();

  if (onClickCb) {
    const hit = (cx, cy) => {
      const r = canvas.getBoundingClientRect();
      const mx = cx-r.left, my = cy-r.top;
      burst(mx, my, 16);
      onClickCb(mx, my);
    };
    canvas.addEventListener('click', e => hit(e.clientX, e.clientY));
    canvas.addEventListener('touchend', e => {
      if (e.changedTouches.length) hit(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    });
    canvas.addEventListener('mousemove', e => {
      const r=canvas.getBoundingClientRect(), mx=e.clientX-r.left, my=e.clientY-r.top;
      let hov=false;
      State.deepStars.forEach(s => {
        if (!s._sx||s.layer!==2) return;
        s.hovered = Math.hypot(s._sx-mx, s._sy-my) < 30;
        if (s.hovered) hov=true;
      });
      canvas.style.cursor = hov ? 'pointer' : 'crosshair';
    });
  }
}

/* =====================================================
   FRASES FLOTANTES (universo interactivo)
   ===================================================== */
const universeQuotes = [
  "cuando pienso en algo bonito,\nde alguna manera terminas apareciendo tú",
  "hay noches en las que miro las estrellas\ny siento que ninguna puede competir contigo",
  "si mi corazón pudiera hablar,\nprobablemente pronunciaría tu nombre antes que cualquier otra palabra",
  "no sé qué tienen tus ojos, pero desde que los vi\ndejaron de parecerme suficientes los demás",
  "si pudiera detener el tiempo,\nlo haría cada vez que estoy contigo",
  "quiero conocer todos los amaneceres\nque todavía nos faltan",
  "eres ese pensamiento que llega sin avisar\ny hace que todo se sienta más bonito",
  "si el amor tuviera un lugar donde vivir,\nquisiera que fuera entre tus manos",
  "te elegiría incluso en un universo\ndonde jamás hubiera conocido tu nombre",
  "quizá mi corazón ya te estaba esperando\nantes de que yo supiera que existías",
  "si pudiera darte una sola cosa para siempre,\nte daría un lugar seguro dentro de mi corazón",
  "tú haces que la palabra 'hogar'\ndeje de parecer un lugar y empiece a parecer una persona",
  "si algún día me pierdo,\nespero que mi corazón todavía sepa encontrar el camino hacia ti",
  "no quiero solamente estar en tus recuerdos;\nquiero seguir formando parte de tu futuro",
  "si pudiera volver a vivir nuestra historia desde el principio,\nvolvería a buscarte",
  "hay distancias que separan cuerpos,\npero ninguna ha conseguido alejarte de mi corazón",
  "tu existencia convirtió días normales\nen recuerdos que quiero conservar",
  "si cada pensamiento sobre ti fuera una estrella,\nesta noche el cielo sería infinito",
  "quiero ser parte de las pequeñas cosas\nque algún día hagan feliz a tu vida",
  "quizá nunca encuentre palabras suficientes,\npero siempre encontraré una razón para quererte",
  "si pudiera mirarte durante toda una noche,\nprobablemente olvidaría que existe el cielo",
  "me gustaría conocer la versión de nosotros\nque todavía no existe",
  "algún día quiero mirar esta misma luna contigo\ny no tener que imaginarte a mi lado",
  "si el universo tiene infinitos caminos,\nqué bonito que uno de ellos me haya llevado hasta ti",
  "no sé dónde termina el universo,\npero sé que mi amor por ti no necesita encontrar un límite",
  "hay personas que pasan por nuestra vida\ny otras que dejan una parte de ellas para siempre;\ntú dejaste la tuya en mí",
  "si pudiera convertir mi amor en luz,\niluminaría todo el cielo solamente para encontrarte",
  "tus ojos fueron una de las primeras cosas\nque quise recordar y todavía son de mis favoritas",
  "quiero que algún día nuestras manos se encuentren\nsin que exista una pantalla entre nosotros",
  "si alguna vez dudas de si eres especial para mí,\nmira todas las estrellas que hice aparecer pensando en ti",
  "no sé si fue destino, casualidad o suerte;\nsolo sé que volvería a encontrarte",
  "quiero que mi futuro tenga tantos recuerdos contigo\nque algún día perdamos la cuenta",
  "si pudiera pedirle un deseo a la noche,\npediría una vida entera a tu lado",
  "me enamora pensar que todavía existen\nmomentos contigo que aún no hemos vivido",
  "si tú eres mi luna,\nentonces no necesito que la noche sea más brillante",
  "hay una parte de mi corazón que desde que te conoció\ndejó de buscar otro lugar",
  "quiero que algún día podamos mirar atrás\ny descubrir que nuestros sueños se quedaron pequeños\nfrente a todo lo que vivimos",
  "si amar es encontrar a alguien con quien quieres compartir la vida,\nentonces ya sé a quién quiero encontrar en la mía",
  "de todas las historias que podría haber vivido,\nagradezco que la mía haya terminado encontrándote",
  "si pudiera escribir una última frase en todas las estrellas,\nescribiría tu nombre",
  "si pudiera escribir tu nombre en el cielo,\nlo dejaría ahí para siempre",
  "y si algún día me preguntas qué fue lo más bonito\nque encontré en este universo,\nvoy a mirarte y responderte: tú",
];
let quoteIdx = 0;

function showFloatingQuote(x, y) {
  const text = universeQuotes[quoteIdx++ % universeQuotes.length];
  const el = document.createElement('div');
  el.innerHTML = text.replace(/\n/g, '<br/>');  // saltos de línea reales
  Object.assign(el.style, {
    position:'fixed',
    left: `${clamp(x-120, 10, window.innerWidth-260)}px`,
    top:  `${clamp(y-60,  10, window.innerHeight-80)}px`,
    fontFamily:'var(--font-serif)', fontStyle:'italic',
    fontSize:'clamp(0.85rem,2.5vw,1rem)',
    color:'rgba(200,230,255,0.95)',
    textShadow:'0 0 12px rgba(100,160,255,0.6)',
    pointerEvents:'none', zIndex:50, opacity:0,
    transition:'opacity 0.6s ease, transform 1.5s ease',
    transform:'translateY(0)', maxWidth:'250px',
    textAlign:'center', lineHeight:'1.5',
  });
  document.body.appendChild(el);
  requestAnimationFrame(()=>{ el.style.opacity='1'; });
  setTimeout(()=>{
    el.style.opacity='0'; el.style.transform='translateY(-28px)';
    setTimeout(()=>el.remove(), 1600);
  }, 2300);
}

/* =====================================================
   ════════════════════════════════════════════════════
   FLIP BOOK — lógica central
   ════════════════════════════════════════════════════
   ===================================================== */

/**
 * Voltea la página actual hacia la izquierda (siguiente)
 * Anima rotateY(-180deg) con CSS transition
 */
function flipForward() {
  const idx  = State.currentPage;
  if (idx >= CONFIG.totalPages) return;

  const pageEl = $(`page-${idx}`);
  if (!pageEl || pageEl.classList.contains('flipped')) return;

  // La página que se va voltear debe estar encima durante la animación
  // Subimos su z-index temporalmente
  pageEl.style.zIndex = 10 + CONFIG.totalPages - idx;
  pageEl.classList.add('flipped');

  // Cuando termina la animación, reajustar z-indices
  pageEl.addEventListener('transitionend', () => {
    reorderZIndices();
    revealPageBackContent(idx);
  }, { once: true });

  State.flippedPages.push(idx);
  State.currentPage = idx + 1;
  updateBookProgress();
  revealPageFrontContent(idx + 1); // preparar la siguiente página front
}

/**
 * Voltea hacia atrás (página anterior)
 */
function flipBackward() {
  if (State.currentPage <= 0) return;
  const idx    = State.currentPage - 1;
  const pageEl = $(`page-${idx}`);
  if (!pageEl) return;

  pageEl.style.zIndex = 10 + CONFIG.totalPages - idx;
  pageEl.classList.remove('flipped');

  pageEl.addEventListener('transitionend', () => {
    reorderZIndices();
    revealPageFrontContent(idx);
  }, { once: true });

  State.flippedPages = State.flippedPages.filter(p => p !== idx);
  State.currentPage  = idx;
  updateBookProgress();
}

/**
 * Asigna z-indices correctos: la página visible debe estar encima
 * Las páginas no volteadas apilan de atrás (alta) a frente (baja)
 * Las páginas volteadas apilan de frente (alta) a atrás (baja)
 */
function reorderZIndices() {
  for (let i = 0; i < CONFIG.totalPages; i++) {
    const el = $(`page-${i}`);
    if (!el) continue;
    if (State.flippedPages.includes(i)) {
      el.style.zIndex = i + 1;             // volteadas debajo
    } else {
      el.style.zIndex = CONFIG.totalPages - i + 5; // sin voltear encima
    }
  }
}

function updateBookProgress() {
  document.querySelectorAll('.bp-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === State.currentPage || i < State.currentPage);
  });
}

/* ── Revelar contenido de páginas con delay ── */
async function revealPageFrontContent(pageIdx) {
  const pageEl = $(`page-${pageIdx}`);
  if (!pageEl) return;
  const texts = pageEl.querySelectorAll('.page-front .page-text');
  // Pequeño delay inicial
  await wait(200);
  for (const t of texts) {
    t.classList.add('visible');
    await wait(500);
  }
}

async function revealPageBackContent(pageIdx) {
  const pageEl = $(`page-${pageIdx}`);
  if (!pageEl) return;
  const texts = pageEl.querySelectorAll('.page-back .page-text');
  await wait(300);
  for (const t of texts) {
    t.classList.add('visible');
    await wait(500);
  }
}

/* ── Inicializar el libro ── */
async function initBook() {
  State.bookActive  = true;
  State.currentPage = 0;
  State.flippedPages = [];
  reorderZIndices();

  // Revelar textos de la primera página front
  await wait(300);
  revealPageFrontContent(0);

  // Canvas de recuerdos dentro de página 1
  initMemoriesCanvas();

  // Canvas de luciérnagas dentro de página 2
  initFireflyCanvas();
}

/* ── Gestos sobre el libro ── */
function setupBookGestures() {
  const book = $('book-wrapper');
  if (!book) return;

  // Click en la mitad derecha = avanzar, izquierda = retroceder
  book.addEventListener('click', e => {
    if (!State.bookActive) return;
    if (State.currentScene !== 'scene-book') return;
    const rect = book.getBoundingClientRect();
    const relX = e.clientX - rect.left;

    // Si el popup de memoria está abierto, no hacer nada
    const popup = $('memory-popup');
    if (popup && popup.classList.contains('visible')) return;

    if (relX > rect.width * 0.5) {
      handlePageForward();
    } else {
      flipBackward();
    }
  });

  // Touch swipe
  let touchStartX = 0;
  book.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
  book.addEventListener('touchend', e => {
    if (!State.bookActive) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) < 30) {
      // Tap → igual que click
      const rect = book.getBoundingClientRect();
      const relX = e.changedTouches[0].clientX - rect.left;
      if (relX > rect.width * 0.5) handlePageForward();
      else flipBackward();
    } else if (dx < -40) {
      handlePageForward();
    } else if (dx > 40) {
      flipBackward();
    }
  }, { passive: true });

  // Puntos de progreso
  document.querySelectorAll('.bp-dot').forEach((dot, i) => {
    dot.addEventListener('click', e => {
      e.stopPropagation();
      jumpToPage(i);
    });
  });
}

async function handlePageForward() {
  if (State.currentPage >= CONFIG.totalPages) {
    // Ya se voltearon todas → ir al universo
    await transitionToUniverse();
    return;
  }

  // Si estamos en la última página (back de pág 3), disparar universo
  if (State.currentPage === CONFIG.totalPages - 1) {
    flipForward();
    // Esperar animación + pausa dramática
    await wait(1200);
    await transitionToUniverse();
  } else {
    flipForward();
  }
}

function jumpToPage(target) {
  if (!State.bookActive) return;
  while (State.currentPage < target) {
    const el = $(`page-${State.currentPage}`);
    if (el) el.classList.add('flipped');
    State.flippedPages.push(State.currentPage);
    State.currentPage++;
  }
  while (State.currentPage > target) {
    State.currentPage--;
    const el = $(`page-${State.currentPage}`);
    if (el) el.classList.remove('flipped');
    State.flippedPages = State.flippedPages.filter(p => p !== State.currentPage);
  }
  reorderZIndices();
  updateBookProgress();
  revealPageFrontContent(State.currentPage);
}

/* =====================================================
   CANVAS: RECUERDOS dentro de página 1
   ===================================================== */
function initMemoriesCanvas() {
  const canvas = $('memories-canvas');
  if (!canvas) return;
  fitCanvas(canvas);
  const ctx = canvas.getContext('2d');

  State.memoryStars = [];
  const n = CONFIG.memories.length;
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 / n) * i;
    const r = Math.min(canvas.width, canvas.height) * rand(0.18, 0.36);
    State.memoryStars.push({
      x: 0.5 + Math.cos(a) * (r / canvas.width),
      y: 0.5 + Math.sin(a) * (r / canvas.height),
      size:  rand(3, 6),
      op:    rand(0.7, 1),
      tw:    rand(0, Math.PI * 2),
      color: Math.random() > 0.4 ? CONFIG.colors.starBlue : CONFIG.colors.glowPurple,
      orbit: rand(0, Math.PI * 2),
      orbitSpd: rand(0.0003, 0.0008),
      orbitR: rand(0.008, 0.018),
      hovered: false,
      clicked: false,
      memory: CONFIG.memories[i],
      _sx: 0, _sy: 0,
    });
  }

  const bgStars = Array.from({length: 80}, () => ({
    x: rand(0,1), y: rand(0,1),
    size: rand(0.3,1.5), op: rand(0.15,0.6), tw: rand(0,Math.PI*2),
  }));

  const localP = [];
  let t = 0;

  function draw() {
    const scene = $('scene-book');
    if (!scene?.classList.contains('active')) {
      cancelAnimationFrame(State.rafIds.memories);
      return;
    }
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    t += 0.009;

    // Nebulosa sutil dentro de la página
    drawNebula(ctx, w*.5, h*.5, w*.48, 'rgba(20,45,140,0.12)', t);

    // Estrellas BG
    bgStars.forEach(s => {
      ctx.save();
      ctx.globalAlpha = s.op * (0.5 + 0.5 * Math.sin(t * 1.8 + s.tw));
      ctx.fillStyle = CONFIG.colors.starWhite;
      ctx.beginPath();
      ctx.arc(s.x*w, s.y*h, s.size, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    });

    // Líneas constelación
    ctx.save();
    ctx.strokeStyle = 'rgba(100,160,255,0.08)';
    ctx.lineWidth = 0.7;
    State.memoryStars.forEach((s, i) => {
      const nx = State.memoryStars[(i+1)%n];
      ctx.beginPath();
      ctx.moveTo(s._sx||s.x*w, s._sy||s.y*h);
      ctx.lineTo(nx._sx||nx.x*w, nx._sy||nx.y*h);
      ctx.stroke();
    });
    ctx.restore();

    // Estrellas de recuerdos
    State.memoryStars.forEach(s => {
      s.orbit += s.orbitSpd;
      const ox = Math.cos(s.orbit) * s.orbitR;
      const oy = Math.sin(s.orbit) * s.orbitR;
      const sx = (s.x + ox) * w;
      const sy = (s.y + oy) * h;
      const pulse = 1 + 0.3 * Math.sin(t * 1.5 + s.tw);
      const displaySize = s.hovered ? s.size * 2.2 : s.size * pulse;
      ctx.save();
      ctx.globalAlpha = s.clicked ? 0.4 : 0.9;
      ctx.shadowColor = s.color;
      ctx.shadowBlur  = displaySize * (s.hovered ? 10 : 5);
      ctx.fillStyle   = s.hovered ? '#fff' : s.color;
      ctx.beginPath();
      ctx.arc(sx, sy, displaySize, 0, Math.PI*2);
      ctx.fill();
      if (s.hovered) {
        ctx.globalAlpha = 0.2;
        ctx.beginPath();
        ctx.arc(sx, sy, displaySize * 2.6, 0, Math.PI*2);
        ctx.fill();
      }
      ctx.restore();
      s._sx = sx; s._sy = sy;
    });

    // Partículas locales
    for (let i=localP.length-1;i>=0;i--) {
      localP[i].update(); localP[i].draw(ctx);
      if (localP[i].dead) localP.splice(i,1);
    }

    State.rafIds.memories = raf(draw);
  }
  draw();

  // Hover
  canvas.addEventListener('mousemove', e => {
    const r=canvas.getBoundingClientRect(), mx=e.clientX-r.left, my=e.clientY-r.top;
    State.memoryStars.forEach(s => {
      s.hovered = Math.hypot((s._sx||0)-mx, (s._sy||0)-my) < 30;
    });
    canvas.style.cursor = State.memoryStars.some(s=>s.hovered) ? 'pointer' : 'crosshair';
  });

  // Click / tap
  function handleMemClick(cx, cy) {
    const r=canvas.getBoundingClientRect(), mx=cx-r.left, my=cy-r.top;
    State.memoryStars.forEach(s => {
      if (Math.hypot((s._sx||0)-mx, (s._sy||0)-my) < 35) {
        s.clicked = true;
        for(let i=0;i<12;i++) localP.push(new Particle(s._sx, s._sy, {
          vx:rand(-2,2), vy:rand(-2.5,-0.3), color:s.color, size:rand(1.5,3),
        }));
        showMemoryPopup(s.memory);
      }
    });
  }
  canvas.addEventListener('click', e => handleMemClick(e.clientX, e.clientY));
  canvas.addEventListener('touchend', e => {
    if (e.changedTouches.length) handleMemClick(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    e.preventDefault();
  }, { passive: false });
}

function showMemoryPopup(text) {
  const popup = $('memory-popup');
  if (!popup) return;
  popup.querySelector('.memory-text').innerHTML = text.replace(/\n/g, '<br/>');
  popup.classList.remove('hidden');
  requestAnimationFrame(() => popup.classList.add('visible'));
  popup.querySelector('.memory-close').onclick = () => {
    popup.classList.remove('visible');
    setTimeout(() => popup.classList.add('hidden'), 500);
    State.memoryStars.forEach(s => s.clicked = false);
  };
}

/* =====================================================
   CANVAS: LUCIÉRNAGAS dentro de página 2
   ===================================================== */
function initFireflyCanvas() {
  const canvas = $('firefly-canvas');
  if (!canvas) return;
  fitCanvas(canvas);
  const ctx = canvas.getContext('2d');

  const flies = Array.from({length:28}, () => ({
    x: rand(0.05, 0.95), y: rand(0.3, 0.9),
    vx: rand(-0.0003, 0.0003), vy: rand(-0.0002, 0.0002),
    size: rand(1.5, 3),
    life: rand(0,1), lifeDir: Math.random()>.5?1:-1,
    lifeSpd: rand(0.004, 0.009),
  }));

  function draw() {
    const scene = $('scene-book');
    if (!scene?.classList.contains('active')) {
      cancelAnimationFrame(State.rafIds.firefly);
      return;
    }
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    flies.forEach(f => {
      f.x += f.vx; f.y += f.vy;
      f.life += f.lifeDir * f.lifeSpd;
      if (f.life>1||f.life<0) f.lifeDir *= -1;
      if (f.x<0.02||f.x>0.98) f.vx*=-1;
      if (f.y<0.25||f.y>0.95) f.vy*=-1;
      ctx.save();
      ctx.globalAlpha = f.life * 0.82;
      ctx.shadowColor = 'rgba(180,255,140,0.9)';
      ctx.shadowBlur  = f.size * 8;
      ctx.fillStyle   = 'rgba(200,255,160,0.95)';
      ctx.beginPath();
      ctx.arc(f.x*w, f.y*h, f.size, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    });

    State.rafIds.firefly = raf(draw);
  }
  draw();
}

/* =====================================================
   TRANSICIÓN LIBRO → CARTAS → UNIVERSO
   ===================================================== */
async function transitionToUniverse() {
  if (State.transitioning) return;
  State.transitioning = true;
  State.bookActive    = false;

  // Fade out del libro
  const sceneBook = $('scene-book');
  sceneBook.classList.add('leaving');
  sceneBook.classList.remove('active');

  await wait(1400);
  sceneBook.classList.remove('leaving');
  sceneBook.style.display = 'none';

  // Ir a las cartas primero
  State.currentScene = 'scene-letters';
  State.transitioning = false;
  const sceneLetters = $('scene-letters');
  if (sceneLetters) {
    sceneLetters.style.display = '';
    sceneLetters.classList.add('active');
    // Violet Evergarden entra INMEDIATAMENTE con la escena — sin retraso
    playAudio(CONFIG.audio.letters, 0.32, 2500);
    await onSceneEnter('scene-letters');
  }
}

/* Función separada para ir al universo desde las cartas */
async function transitionLettersToUniverse() {
  if (State.transitioning) return;
  State.transitioning = true;

  // Suelo desaparece
  // Ocultar sky-canvas — el cosmos del deep-canvas reemplaza el cielo
  const skyCanvas = $('sky-canvas');
  if (skyCanvas) {
    skyCanvas.style.opacity = '0';
    skyCanvas.style.transition = 'opacity 2s ease';
  }
  const groundImg = $('ground-img');
  if (groundImg) groundImg.classList.add('universe-mode');

  // Fade out cartas
  const sceneLetters = $('scene-letters');
  if (sceneLetters) {
    sceneLetters.classList.add('leaving');
    sceneLetters.classList.remove('active');
  }
  await wait(1200);
  if (sceneLetters) {
    sceneLetters.classList.remove('leaving');
    sceneLetters.style.display = 'none';
  }

  // Activar universo
  State.currentScene = 'scene-universe';
  State.transitioning = false;
  initDeepStars();
  const sceneUni = $('scene-universe');
  sceneUni.style.display = '';
  sceneUni.classList.add('active');

  playAudio(CONFIG.audio.universe, 0.4, 3000);

  // Iniciar canvas del universo inmediatamente
  startDeepCanvas('deep-canvas', 'scene-universe', showFloatingQuote);

  await wait(1500);

  /* ── Bloque 1 — ~30 segundos ── */
  const block1 = $('universe-text');
  if (block1) block1.style.display = 'flex';
  const lines1 = block1?.querySelectorAll('.universe-line') ?? [];
  for (const l of lines1) {
    l.classList.add('visible');
    await wait(9000); // ~9s por línea × 3 líneas = ~27s + pausas
  }

  await wait(5000); // pausa contemplativa — solo cielo

  // Fade out bloque 1
  if (block1) { block1.style.opacity = '0'; block1.style.transition = 'opacity 2s ease'; }
  await wait(2500);
  if (block1) block1.style.display = 'none';

  await wait(2000); // silencio entre bloques

  /* ── Bloque 2 — ~30 segundos ── */
  const block2 = $('universe-text-2');
  if (block2) {
    block2.style.display = 'flex';
    block2.style.opacity = '0';
    block2.style.transition = 'opacity 2s ease';
    await wait(80);
    block2.style.opacity = '1';
  }
  const lines2 = block2?.querySelectorAll('.universe-line') ?? [];
  for (const l of lines2) {
    l.classList.add('visible');
    await wait(9000);
  }

  await wait(5000);

  // Fade out bloque 2
  if (block2) { block2.style.opacity = '0'; }
  await wait(2500);
  if (block2) block2.style.display = 'none';

  await wait(2000);

  /* ── Bloque 3 — ~30 segundos ── */
  const block3 = $('universe-text-3');
  if (block3) {
    block3.style.display = 'flex';
    block3.style.opacity = '0';
    block3.style.transition = 'opacity 2s ease';
    await wait(80);
    block3.style.opacity = '1';
  }
  const lines3 = block3?.querySelectorAll('.universe-line') ?? [];
  for (const l of lines3) {
    l.classList.add('visible');
    await wait(9000);
  }

  // El último bloque se queda visible — el botón continuar aparece después
}

/* =====================================================
   NAVEGACIÓN ESCENAS POST-LIBRO
   ===================================================== */
async function goToScene(nextId) {
  if (State.transitioning) return;
  State.transitioning = true;

  const curEl  = $(State.currentScene);
  const nextEl = $(nextId);
  if (!nextEl) { State.transitioning = false; return; }

  if (curEl) {
    curEl.classList.add('leaving');
    curEl.classList.remove('active');
  }
  await wait(900);
  if (curEl) {
    curEl.classList.remove('leaving');
    curEl.style.display = 'none'; // eliminar del flujo de eventos
  }

  State.currentScene = nextId;
  nextEl.style.display = ''; // restaurar si estaba oculto
  nextEl.classList.add('active');

  State.transitioning = false;
  await wait(100);
  await onSceneEnter(nextId);
}

async function onSceneEnter(id) {
  switch (id) {

    case 'scene-love': {
      startDeepCanvas('love-canvas', 'scene-love');
      await wait(600);
      const lm = $('love-main'), ls = $('love-sub');
      if (lm) { await wait(200); lm.classList.add('visible'); }
      await wait(1600);
      if (ls) ls.classList.add('visible');
      break;
    }

    case 'scene-false-end': {
      await wait(500);
      const lines = document.querySelectorAll('#scene-false-end .false-line');
      for (const l of lines) { l.classList.add('visible'); await wait(1100); }
      await wait(400);
      const btn = $('btn-close');
      if (btn) btn.classList.add('visible');
      break;
    }

    case 'scene-wait':
      await sceneWait();
      break;

    case 'scene-reveal':
      initDeepStars();
      startDeepCanvas('reveal-canvas', 'scene-reveal');
      // Mipha's Theme entra justo aquí — el momento de la revelación
      await wait(800);
      playAudio(CONFIG.audio.final, 0.38, 4000);
      await wait(600);
      for (const l of document.querySelectorAll('#scene-reveal .reveal-line')) {
        l.classList.add('visible'); await wait(1100);
      }
      break;

    case 'scene-gift':
      startDeepCanvas('gift-canvas', 'scene-gift');
      await wait(500);
      for (const l of document.querySelectorAll('#scene-gift .gift-line')) {
        l.classList.add('visible'); await wait(1100);
      }
      break;

    case 'scene-dev':
      startDeepCanvas('dev-canvas', 'scene-dev');
      break;

    case 'scene-letters':
      await initLettersScene();
      break;

    case 'scene-moon':
      await initMoonScene();
      break;

    case 'scene-final':
      startDeepCanvas('final-canvas', 'scene-final');
      playAudio(CONFIG.audio.final, 0.38, 3000);
      await wait(600);
      for (const l of document.querySelectorAll('#scene-final .final-line, #scene-final .final-divider')) {
        l.classList.add('visible'); await wait(1300);
      }
      await wait(600);
      const restart = $('final-restart');
      if (restart) restart.classList.add('visible');
      break;
  }
}

async function sceneWait() {
  // Esta función ya no se usa directamente —
  // la lógica de espera está en triggerFalseClose
  // Se mantiene por compatibilidad con onSceneEnter
}

/* =====================================================
   FALSO CIERRE
   ===================================================== */
async function triggerFalseClose() {
  // Ignorar si ya está en transición
  if (State.transitioning) {
    console.log('[triggerFalseClose] bloqueado — transitioning:', State.transitioning);
    return;
  }
  console.log('[triggerFalseClose] iniciando...');
  State.transitioning = true;

  const fe = $('scene-false-end');
  if (fe) {
    fe.classList.add('leaving');
    fe.classList.remove('active');
  }

  fadeOutAudio(1500);
  await wait(1000);
  if (fe) {
    fe.classList.remove('leaving');
    fe.style.display = 'none'; // fuera del flujo de eventos
  }

  // Pantalla negra — scene-wait
  State.currentScene = 'scene-wait';
  const sw = $('scene-wait');
  if (sw) {
    sw.style.display = '';
    sw.classList.add('active');
  }
  State.transitioning = false;

  // Mostrar "...espera." y luego ir a revelación
  await wait(600);
  const wt = $('wait-text');
  if (wt) wt.classList.add('visible');
  await wait(2200);
  if (wt) wt.classList.remove('visible');
  await wait(500);

  // Ir directamente a revelación
  if (sw) { sw.classList.add('leaving'); sw.classList.remove('active'); }
  await wait(800);
  if (sw) { sw.classList.remove('leaving'); sw.style.display = 'none'; }

  State.currentScene = 'scene-reveal';
  const sr = $('scene-reveal');
  if (sr) { sr.style.display = ''; sr.classList.add('active'); }

  // Iniciar canvas y revelar texto
  initDeepStars();
  startDeepCanvas('reveal-canvas', 'scene-reveal');
  await wait(600);
  for (const l of document.querySelectorAll('#scene-reveal .reveal-line')) {
    l.classList.add('visible');
    await wait(1100);
  }
}

/* =====================================================
   BOTONES GLOBALES
   ===================================================== */
function setupNavButtons() {
  // Portada → abrir libro
  const btnOpen = $('btn-open');
  if (btnOpen) {
    btnOpen.addEventListener('click', async () => {
      initAudio();
      State.soundEnabled = true;
      playAudio(CONFIG.audio.intro, 0.35, 3000);

      // Fade out portada
      const cover = $('scene-cover');
      cover.classList.add('leaving');
      cover.classList.remove('active');
      await wait(900);
      cover.classList.remove('leaving');
      cover.style.display = 'none'; // sacar del flow completamente

      // Abrir libro
      State.currentScene = 'scene-book';
      const book = $('scene-book');
      book.classList.add('active');
      await wait(100);
      initBook();
    });
  }

  // btn-close falso — click y touch
  const btnClose = $('btn-close');
  if (btnClose) {
    btnClose.addEventListener('click', triggerFalseClose);
    btnClose.addEventListener('touchend', e => {
      e.preventDefault();
      triggerFalseClose();
    });
  }

  // Botones .btn-continue post-libro
  document.querySelectorAll('.btn-continue[data-next]').forEach(btn => {
    btn.addEventListener('click', () => goToScene(btn.dataset.next));
    btn.addEventListener('touchend', e => {
      e.preventDefault();
      goToScene(btn.dataset.next);
    });
  });

  // Restart
  const restart = $('final-restart');
  if (restart) restart.addEventListener('click', () => location.reload());
}

/* =====================================================
   TECLADO
   ===================================================== */
function setupKeyboard() {
  document.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === ' ') {
      if (State.currentScene === 'scene-book') {
        handlePageForward();
      } else {
        document.querySelector('.scene.active .btn-continue[data-next]')?.click();
      }
    }
    if (e.key === 'ArrowLeft' && State.currentScene === 'scene-book') {
      flipBackward();
    }
  });
}

/* =====================================================
   PORTADA — fade items y botón
   ===================================================== */
function initCover() {
  document.querySelectorAll('#scene-cover .fade-item').forEach(el => {
    const delay = parseInt(el.dataset.delay ?? 0);
    setTimeout(() => el.classList.add('visible'), delay / CONFIG.speed);
  });
  // NO tocar pointer-events del botón — el CSS lo maneja
}

/* =====================================================
   INIT
   ===================================================== */
function init() {
  initDeepStars();
  initSkyCanvas();
  setupSoundToggle();
  setupInputTracking();
  setupNavButtons();
  setupKeyboard();
  setupBookGestures();
  initCover();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

/* =====================================================
   ESCENA LUNA — la más íntima del proyecto
   ===================================================== */

/* Bloques narrativos — cada objeto define un fragmento del texto,
   cuánto tiempo está visible y si es énfasis especial          */
const MOON_STORY = [
  { text: 'Ya te he dado universos.', ms: 3800, cls: '' },
  { text: 'Te he dado recuerdos,\npalabras,\nsueños\ny hasta una pequeña parte de mi corazón.', ms: 5500, cls: '' },
  { text: 'Pero si pudiera elegir\nuna sola cosa para darte...', ms: 4200, cls: '' },
  { text: 'creo que no sería nada de eso.', ms: 3800, cls: '' },
  { text: 'Solo quisiera sentarme a tu lado.', ms: 4000, cls: 'emphasis' },
  { text: 'Sin tener que hacer nada.\nSin tener que decir nada.', ms: 4500, cls: '' },
  { text: 'Solo tú y yo,\nsentados bajo el cielo,\nmirando la luna en silencio.', ms: 5000, cls: '' },
  { text: 'Imagino que estamos ahí,\njuntos,\nmirándola durante un rato.', ms: 4500, cls: '' },
  { text: 'Y quizá te preguntaría...', ms: 3200, cls: '' },
  { text: '¿ves qué bonita está?', ms: 3500, cls: 'emphasis' },
  { text: 'Porque entonces entendería algo.', ms: 3200, cls: '' },
  { text: 'La luna siempre fue hermosa.', ms: 3800, cls: 'emphasis' },
  { text: 'Pero creo que lo que realmente\nla haría especial\nsería estar mirándola contigo.', ms: 6000, cls: 'emphasis' },
  { text: 'Porque si estuvieras a mi lado,\nprobablemente ni siquiera\nnecesitaría pedir otro deseo.', ms: 5500, cls: '' },
  { text: 'Solo me bastaría con pensar:', ms: 3000, cls: '' },
  { text: '"qué bonito sería quedarme\naquí contigo un rato más."', ms: 5000, cls: 'emphasis' },
  { text: 'Y si algún día podemos hacerlo de verdad...', ms: 4000, cls: '' },
  { text: 'no necesitaría llevarte\na ningún universo.', ms: 3800, cls: '' },
  { text: 'Ni construirte un mundo entero.', ms: 3200, cls: '' },
  { text: 'Solo quiero sentarme a tu lado,\nmirar la luna contigo\ny disfrutar de que, por fin,\nestamos juntos.', ms: 6500, cls: '' },
  { text: 'Te quiero, mi vida.', ms: 0, cls: 'love' }, // ms:0 = no desaparece
];

async function initMoonScene() {
  /* ── Canvas de la luna ── */
  const canvas = $('moon-canvas');
  if (!canvas) return;
  canvas.style.pointerEvents = 'none';

  const ctx   = canvas.getContext('2d');
  let   t     = 0;
  let   alpha = 0;       // fade-in global del cielo
  let   moonA = 0;       // fade-in de la luna
  let   skyScrollY = 0;  // desplazamiento lento hacia arriba

  /* ── Estrellas de la luna (más densas que el cielo normal) ── */
  const stars = [];
  for (let i = 0; i < 320; i++) {
    stars.push({
      x:     rand(0, 1),
      y:     rand(0, 0.85),
      size:  rand(0.2, rand(0.2, 1.8)), // mayoría muy pequeñas
      op:    rand(0.15, 0.9),
      tw:    rand(0, Math.PI * 2),
      twSpd: rand(0.3, 1.4),
      layer: Math.random() < 0.6 ? 0 : Math.random() < 0.7 ? 1 : 2,
    });
  }

  /* ── Partículas flotantes sutiles ── */
  const floats = [];
  for (let i = 0; i < 35; i++) {
    floats.push({
      x:   rand(0, 1),
      y:   rand(0.1, 0.85),
      vx:  rand(-0.00012, 0.00012),
      vy:  rand(-0.00018, -0.00005),
      op:  rand(0.06, 0.22),
      size: rand(1, 2.5),
      life: rand(0, 1),
    });
  }

  /* ── RAF loop ── */
  function drawMoonScene() {
    if (!$('scene-moon')?.classList.contains('active')) {
      delete State.rafIds['moon-canvas'];
      return;
    }
    const w = canvas.width  = canvas.offsetWidth  || window.innerWidth;
    const h = canvas.height = canvas.offsetHeight || window.innerHeight;
    ctx.clearRect(0, 0, w, h);
    t += 0.006;

    /* Fade-in global */
    if (alpha < 1) alpha = Math.min(1, alpha + 0.003);
    if (moonA < 1) moonA = Math.min(1, moonA + 0.0018);
    skyScrollY += 0.015; // deriva lentísima hacia arriba

    /* Fondo — negro profundo */
    ctx.save();
    ctx.globalAlpha = alpha;
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0,    '#000205');
    bg.addColorStop(0.35, '#010612');
    bg.addColorStop(0.7,  '#030a1c');
    bg.addColorStop(1,    '#040d22');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    /* Nebulosa muy sutil */
    ctx.save();
    ctx.globalAlpha = alpha * 0.06;
    const nb = ctx.createRadialGradient(w*.42, h*.28, 0, w*.42, h*.28, w*.5);
    nb.addColorStop(0, 'rgba(60,90,200,1)');
    nb.addColorStop(1, 'transparent');
    ctx.fillStyle = nb;
    ctx.beginPath(); ctx.arc(w*.42, h*.28, w*.5, 0, Math.PI*2); ctx.fill();
    ctx.restore();

    /* Estrellas con drift suave */
    stars.forEach(s => {
      const drift  = [0.0003, 0.0006, 0.001][s.layer];
      const sy     = ((s.y - skyScrollY * drift + 2) % 1) * h;
      const twinkle = s.op * (0.55 + 0.45 * Math.sin(t * s.twSpd + s.tw));
      ctx.save();
      ctx.globalAlpha = alpha * twinkle;
      if (s.layer === 2) { ctx.shadowColor = '#a8c8ff'; ctx.shadowBlur = s.size * 3; }
      ctx.fillStyle = s.layer === 2 ? '#a8c8ff' : '#e8f0ff';
      ctx.beginPath();
      ctx.arc(s.x * w, sy, s.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    /* Luna */
    drawMoonSceneMoon(ctx, w, h, t, moonA);

    /* Partículas flotantes */
    floats.forEach(f => {
      f.x += f.vx; f.y += f.vy;
      if (f.y < -0.05) { f.y = 0.95; f.x = rand(0, 1); }
      if (f.x < 0 || f.x > 1) f.vx *= -1;
      ctx.save();
      ctx.globalAlpha = alpha * f.op * (0.5 + 0.5 * Math.sin(t + f.life));
      ctx.shadowColor = 'rgba(160,200,255,0.6)';
      ctx.shadowBlur  = f.size * 4;
      ctx.fillStyle   = 'rgba(180,210,255,0.9)';
      ctx.beginPath();
      ctx.arc(f.x * w, f.y * h, f.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    State.rafIds['moon-canvas'] = raf(drawMoonScene);
  }
  drawMoonScene();

  /* ── Silueta — aparece después de que el cielo es visible ── */
  await wait(3500);
  const silhouette = $('moon-silhouette');
  if (silhouette) silhouette.classList.add('visible');

  /* ── Reproducir audio suave si hay ── */
  playAudio(CONFIG.audio.moon, 0.22, 5000);

  /* ── Secuencia de texto ── */
  const container = $('moon-text');
  if (!container) return;

  await wait(2500); // pausa inicial — solo cielo y silueta

  for (let i = 0; i < MOON_STORY.length; i++) {
    const block = MOON_STORY[i];
    const el    = document.createElement('p');
    el.className = `moon-block ${block.cls}`;
    el.innerHTML = block.text.replace(/\n/g, '<br/>');
    container.innerHTML = ''; // un bloque a la vez
    container.appendChild(el);

    /* Fade in */
    await wait(80);
    el.classList.add('visible');

    /* Esperar tiempo de lectura */
    const readMs = block.ms > 0 ? block.ms : 7000;
    await wait(readMs);

    /* Último bloque — no desaparece, espera al botón */
    if (i === MOON_STORY.length - 1) {
      await wait(3000);
      break;
    }

    /* Fade out suave */
    el.classList.add('fade-out');
    await wait(1800);
  }

  /* ── Pausa final con solo luna y texto ── */
  await wait(2500);

  /* Mostrar botón discreto */
  const btn = $('moon-continue');
  if (btn) btn.classList.add('visible');
}

/* Luna específica para scene-moon — diferente posición y tamaño */
function drawMoonSceneMoon(ctx, w, h, t, alpha) {
  /* Luna más grande, desplazada arriba-derecha */
  const mx = w * 0.62;
  const my = h * 0.22 + Math.sin(t * 0.06) * 2.5;
  const mr = Math.min(w, h) * 0.088;

  /* Halo exterior muy difuso */
  const h3 = ctx.createRadialGradient(mx, my, mr * 0.6, mx, my, mr * 7);
  h3.addColorStop(0,   `rgba(200,220,255,${0.06 * alpha})`);
  h3.addColorStop(0.3, `rgba(160,190,255,${0.03 * alpha})`);
  h3.addColorStop(1,   'transparent');
  ctx.fillStyle = h3;
  ctx.beginPath(); ctx.arc(mx, my, mr * 7, 0, Math.PI * 2); ctx.fill();

  /* Halo medio */
  const h2 = ctx.createRadialGradient(mx, my, mr * 0.7, mx, my, mr * 2.8);
  h2.addColorStop(0,   `rgba(230,240,255,${0.14 * alpha})`);
  h2.addColorStop(0.6, `rgba(200,220,255,${0.06 * alpha})`);
  h2.addColorStop(1,   'transparent');
  ctx.fillStyle = h2;
  ctx.beginPath(); ctx.arc(mx, my, mr * 2.8, 0, Math.PI * 2); ctx.fill();

  /* Cuerpo lunar */
  const mg = ctx.createRadialGradient(mx - mr*.28, my - mr*.28, 0, mx, my, mr);
  mg.addColorStop(0,    `rgba(255,255,252,${alpha})`);
  mg.addColorStop(0.45, `rgba(225,235,255,${0.97 * alpha})`);
  mg.addColorStop(0.82, `rgba(185,205,245,${0.93 * alpha})`);
  mg.addColorStop(1,    `rgba(145,175,225,${0.88 * alpha})`);
  ctx.save();
  ctx.shadowColor = `rgba(190,215,255,${0.7 * alpha})`;
  ctx.shadowBlur  = mr * 2.8;
  ctx.fillStyle   = mg;
  ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  /* Cráteres sutilísimos */
  ctx.save();
  ctx.globalAlpha = 0.045 * alpha;
  ctx.fillStyle   = 'rgba(140,165,220,1)';
  ctx.beginPath(); ctx.ellipse(mx + mr*.22, my - mr*.12, mr*.3, mr*.19, -0.4, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(mx - mr*.28, my + mr*.22, mr*.18, mr*.12,  0.6, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(mx + mr*.05, my + mr*.32, mr*.12, mr*.08,  0.2, 0, Math.PI*2); ctx.fill();
  ctx.restore();

  /* Reflejo de luz lunar en el suelo — rayo difuso */
  const rl = ctx.createLinearGradient(mx, my + mr, mx, h);
  rl.addColorStop(0,   `rgba(160,190,255,${0.06 * alpha})`);
  rl.addColorStop(0.4, `rgba(120,160,230,${0.025 * alpha})`);
  rl.addColorStop(1,   'transparent');
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = rl;
  ctx.beginPath();
  ctx.moveTo(mx - mr*1.5, my + mr);
  ctx.lineTo(mx + mr*1.5, my + mr);
  ctx.lineTo(mx + w*0.22, h);
  ctx.lineTo(mx - w*0.22, h);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}


/* =====================================================
   ESCENA CARTAS — lógica completa
   ===================================================== */

/* Estado de las cartas */
const LettersState = {
  read: new Set(),   // índices de cartas leídas
  total: 4,
};

async function initLettersScene() {
  /* ── Canvas de fondo (reutiliza el cielo de la luna) ── */
  const canvas = $('letters-bg-canvas');
  if (canvas) {
    canvas.style.pointerEvents = 'none';
    const ctx = canvas.getContext('2d');
    let t = 0;

    /* ── Estrellas de fondo ── */
    const bgStars = Array.from({ length: 220 }, () => ({
      x: rand(0,1), y: rand(0,1),
      size: rand(0.2, 1.6),
      op: rand(0.1, 0.65),
      tw: rand(0, Math.PI*2), twSpd: rand(0.4, 1.8),
      warm: Math.random() > 0.75, // algunas estrellitas cálidas
    }));

    /* ── Partículas flotantes sueltas ── */
    const floatParts = Array.from({ length: 45 }, () => ({
      x: rand(0,1), y: rand(0,1),
      vx: rand(-0.00015, 0.00015),
      vy: rand(-0.00022, -0.00006),
      size: rand(1.2, 3.2),
      op: rand(0.08, 0.28),
      tw: rand(0, Math.PI*2),
      color: Math.random() > 0.55
        ? 'rgba(180,140,255,' // violeta suave
        : Math.random() > 0.5
          ? 'rgba(255,180,200,' // rosa suave
          : 'rgba(140,180,255,', // azul suave
    }));

    /* ── Corazones flotantes ── */
    const hearts = Array.from({ length: 12 }, () => ({
      x: rand(0.05, 0.95),
      y: rand(1.0, 1.8),       // empiezan abajo fuera de pantalla
      vy: rand(-0.0008, -0.0004),
      vx: rand(-0.00015, 0.00015),
      size: rand(6, 16),
      op: rand(0.06, 0.22),
      rot: rand(-0.4, 0.4),
      rotSpd: rand(-0.004, 0.004),
      tw: rand(0, Math.PI*2),
      twSpd: rand(0.5, 1.2),
    }));

    /* ── Destellos de luz (sparkles) ── */
    const sparkles = Array.from({ length: 18 }, () => ({
      x: rand(0,1), y: rand(0,1),
      life: rand(0,1), lifeDir: 1,
      lifeSpd: rand(0.004, 0.012),
      size: rand(1.5, 4),
      op: rand(0.15, 0.55),
      color: Math.random() > 0.5
        ? 'rgba(255,220,180,' // cálido dorado
        : 'rgba(200,180,255,', // violeta
    }));

    /* ── Función corazón en canvas ── */
    function drawHeart(ctx, cx, cy, size, rotation) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotation);
      ctx.beginPath();
      // Curva de corazón matemática
      const s = size;
      ctx.moveTo(0, -s * 0.3);
      ctx.bezierCurveTo( s*.55, -s*.85,  s*1.1,  s*.1,  0,  s*.75);
      ctx.bezierCurveTo(-s*1.1,  s*.1,  -s*.55, -s*.85,  0, -s*.3);
      ctx.closePath();
      ctx.restore();
    }

    /* ── Función sparkle de 4 puntas ── */
    function drawSparkle(ctx, cx, cy, size) {
      ctx.save();
      ctx.translate(cx, cy);
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(size * 0.2, size * 0.2, 0, size);
        ctx.quadraticCurveTo(-size * 0.2, size * 0.2, 0, 0);
        ctx.fill();
      }
      ctx.restore();
    }

    function drawLettersBg() {
      if (!$('scene-letters')?.classList.contains('active')) {
        delete State.rafIds['letters-bg'];
        return;
      }
      const w = canvas.width  = canvas.offsetWidth  || window.innerWidth;
      const h = canvas.height = canvas.offsetHeight || window.innerHeight;
      ctx.clearRect(0, 0, w, h);
      t += 0.005;

      /* Fondo degradado — ligeramente más cálido que el universo */
      const bg = ctx.createLinearGradient(0,0,0,h);
      bg.addColorStop(0,   '#010209');
      bg.addColorStop(0.4, '#020412');
      bg.addColorStop(0.75,'#030818');
      bg.addColorStop(1,   '#04091e');
      ctx.fillStyle = bg; ctx.fillRect(0,0,w,h);

      /* Nebulosas románticas — violeta + azul */
      const nb1 = ctx.createRadialGradient(w*.3, h*.35, 0, w*.3, h*.35, w*.45);
      nb1.addColorStop(0, 'rgba(100,60,180,0.07)');
      nb1.addColorStop(1, 'transparent');
      ctx.fillStyle = nb1;
      ctx.beginPath(); ctx.arc(w*.3,h*.35,w*.45,0,Math.PI*2); ctx.fill();

      const nb2 = ctx.createRadialGradient(w*.72, h*.5, 0, w*.72, h*.5, w*.4);
      nb2.addColorStop(0, 'rgba(60,80,200,0.06)');
      nb2.addColorStop(1, 'transparent');
      ctx.fillStyle = nb2;
      ctx.beginPath(); ctx.arc(w*.72,h*.5,w*.4,0,Math.PI*2); ctx.fill();

      const nb3 = ctx.createRadialGradient(w*.5, h*.6, 0, w*.5, h*.6, w*.3);
      nb3.addColorStop(0, 'rgba(180,80,160,0.04)');
      nb3.addColorStop(1, 'transparent');
      ctx.fillStyle = nb3;
      ctx.beginPath(); ctx.arc(w*.5,h*.6,w*.3,0,Math.PI*2); ctx.fill();

      /* Estrellas */
      bgStars.forEach(s => {
        const a = s.op * (0.5 + 0.5 * Math.sin(t * s.twSpd + s.tw));
        ctx.save();
        ctx.globalAlpha = a;
        ctx.shadowColor = s.warm ? 'rgba(255,220,160,0.5)' : 'rgba(180,200,255,0.4)';
        ctx.shadowBlur = s.size * 2;
        ctx.fillStyle = s.warm ? '#ffd8a0' : '#e8f0ff';
        ctx.beginPath(); ctx.arc(s.x*w, s.y*h, s.size, 0,Math.PI*2); ctx.fill();
        ctx.restore();
      });

      /* Partículas flotantes */
      floatParts.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.y < -0.05) { p.y = 1.05; p.x = rand(0,1); }
        if (p.x < 0 || p.x > 1) p.vx *= -1;
        const pulse = 0.5 + 0.5 * Math.sin(t * 1.2 + p.tw);
        ctx.save();
        ctx.globalAlpha = p.op * pulse;
        ctx.shadowColor = p.color + '0.6)';
        ctx.shadowBlur = p.size * 3;
        ctx.fillStyle = p.color + '0.9)';
        ctx.beginPath(); ctx.arc(p.x*w, p.y*h, p.size, 0,Math.PI*2); ctx.fill();
        ctx.restore();
      });

      /* Corazones flotantes */
      hearts.forEach(h_ => {
        h_.x += h_.vx; h_.y += h_.vy;
        h_.rot += h_.rotSpd;
        if (h_.y < -0.1) { h_.y = rand(1.05, 1.5); h_.x = rand(0.05, 0.95); }
        const pulse = 0.7 + 0.3 * Math.sin(t * h_.twSpd + h_.tw);
        ctx.save();
        ctx.globalAlpha = h_.op * pulse;
        ctx.shadowColor = 'rgba(220,160,255,0.5)';
        ctx.shadowBlur = h_.size * 3;
        ctx.fillStyle = 'rgba(220,160,255,0.8)';
        drawHeart(ctx, h_.x * w, h_.y * h, h_.size, h_.rot);
        ctx.fill();
        ctx.restore();
      });

      /* Sparkles / destellos */
      sparkles.forEach(sp => {
        sp.life += sp.lifeDir * sp.lifeSpd;
        if (sp.life >= 1 || sp.life <= 0) sp.lifeDir *= -1;
        ctx.save();
        ctx.globalAlpha = sp.op * sp.life;
        ctx.shadowColor = sp.color + '0.7)';
        ctx.shadowBlur = sp.size * 4;
        ctx.fillStyle = sp.color + '0.9)';
        drawSparkle(ctx, sp.x * w, sp.y * h, sp.size);
        ctx.restore();
      });

      State.rafIds['letters-bg'] = raf(drawLettersBg);
    }
    drawLettersBg();
  }

  /* ── Intro animada ── */
  await wait(400);
  const li1 = $('li-1'), li2 = $('li-2');
  if (li1) li1.classList.add('visible');
  await wait(1400);
  if (li2) li2.classList.add('visible');
  await wait(1800);

  /* ── Aparecer sobres escalonados ── */
  const grid = $('letters-grid');
  if (grid) grid.classList.add('visible');

  for (let i = 0; i < LettersState.total; i++) {
    const wrap = $(`env-${i}`);
    if (wrap) {
      await wait(180);
      wrap.classList.add('visible');
    }
  }

  /* ── Registrar clicks en sobres ── */
  document.querySelectorAll('.envelope').forEach(env => {
    env.addEventListener('click', () => {
      const idx = parseInt(env.dataset.letter);
      openLetterModal(idx);
    });
  });

  /* ── Botón continuar de las cartas → universo ── */
  const nextBtn = $('letters-next');
  if (nextBtn) {
    nextBtn.addEventListener('click', transitionLettersToUniverse);
    nextBtn.addEventListener('touchend', e => {
      e.preventDefault();
      transitionLettersToUniverse();
    });
  }
}

/* ── Abrir modal de carta ── */
function openLetterModal(idx) {
  const modal = $(`modal-${idx}`);
  if (!modal) return;

  // Abrir sobre visualmente
  const env = document.querySelector(`#env-${idx} .envelope`);
  if (env) env.classList.add('open');

  // Mostrar modal
  modal.classList.add('open');

  // Scroll al inicio del modal
  const scroll = modal.querySelector('.letter-modal-scroll');
  if (scroll) scroll.scrollTop = 0;

  // Registrar como leída cuando cierra
  const closeBtn = modal.querySelector('.letter-modal-close');
  if (closeBtn) {
    closeBtn.onclick = () => closeLetterModal(idx);
  }

  // Cerrar con ESC o click fuera
  modal._escHandler = e => {
    if (e.key === 'Escape') closeLetterModal(idx);
  };
  document.addEventListener('keydown', modal._escHandler);

  modal._outsideHandler = e => {
    if (e.target === modal) closeLetterModal(idx);
  };
  modal.addEventListener('click', modal._outsideHandler);
}

/* ── Cerrar modal y marcar como leída ── */
function closeLetterModal(idx) {
  const modal = $(`modal-${idx}`);
  if (!modal) return;

  modal.classList.remove('open');

  // Limpiar listeners
  if (modal._escHandler) {
    document.removeEventListener('keydown', modal._escHandler);
    delete modal._escHandler;
  }
  if (modal._outsideHandler) {
    modal.removeEventListener('click', modal._outsideHandler);
    delete modal._outsideHandler;
  }

  // Marcar sobre como leído
  const wrap = $(`env-${idx}`);
  if (wrap) wrap.classList.add('read');

  // Registrar en estado
  LettersState.read.add(idx);

  // Actualizar contador
  updateLettersCounter();

  // Si todas están leídas → mostrar botón continuar
  if (LettersState.read.size >= LettersState.total) {
    showLettersContinue();
  }
}

/* ── Actualizar contador ── */
function updateLettersCounter() {
  const el = $('letters-read-count');
  if (el) el.textContent = LettersState.read.size;
}

/* ── Mostrar botón continuar con efecto ── */
async function showLettersContinue() {
  await wait(600);
  const cont = $('letters-continue');
  if (cont) cont.classList.add('visible');

  // Scroll suave hacia el botón
  cont?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
