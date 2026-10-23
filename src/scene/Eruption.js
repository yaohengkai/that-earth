/* ------------------------------------------------------------------------- */
/*  Full-screen volcanic easter-egg effect — 2D canvas overlay               */
/* ------------------------------------------------------------------------- */

const TAU = Math.PI * 2;
const random = (min, max) => min + Math.random() * (max - min);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

export class EruptionFX {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.id = "eruptionFx";
    this.canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d");
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.6);
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.active = false;
    this.raf = 0;
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.particles = [];
    this.splats = [];
    this.cracks = [];
    this.onBurst = null;
    this.onFade = null;
    this.onDone = null;
    this._burstFired = false;
    this._fadeFired = false;
    this._doneFired = false;

    this.lavaSprite = this._makeGlowSprite([
      [0, "rgba(255, 252, 230, 1)"],
      [0.12, "rgba(255, 235, 170, 0.95)"],
      [0.32, "rgba(255, 150, 50, 0.62)"],
      [0.68, "rgba(255, 60, 0, 0.13)"],
      [1, "rgba(255, 40, 0, 0)"],
    ]);
    this.emberSprite = this._makeGlowSprite([
      [0, "rgba(255, 248, 205, 1)"],
      [0.3, "rgba(255, 185, 80, 0.6)"],
      [1, "rgba(255, 90, 0, 0)"],
    ], 64);
    this.smokeSprite = this._makeGlowSprite([
      [0, "rgba(46, 31, 25, 0.34)"],
      [0.45, "rgba(30, 21, 18, 0.22)"],
      [1, "rgba(12, 9, 8, 0)"],
    ], 128);
    this.rockSprites = Array.from({ length: 6 }, (_, i) => this._makeRockSprite(i + 1));

    this._onResize = () => {
      if (this.active) this._resize();
    };
    window.addEventListener("resize", this._onResize, { passive: true });
  }

  _makeGlowSprite(stops, size = 128) {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2
    );
    for (const [offset, color] of stops) gradient.addColorStop(offset, color);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    return canvas;
  }

  _makeRockSprite(seed) {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    let state = seed * 9301 + 49297;
    const rnd = () => {
      state = (state * 9301 + 49297) % 233280;
      return state / 233280;
    };
    const cx = size / 2;
    const cy = size / 2;
    const base = size * 0.28;
    const sides = 6 + Math.floor(rnd() * 2);
    const points = [];
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * TAU + (rnd() - 0.5) * 0.42;
      const radius = base * (0.7 + rnd() * 0.5);
      points.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
    }

    const glow = ctx.createRadialGradient(cx, cy, base * 0.4, cx, cy, base * 1.9);
    glow.addColorStop(0, "rgba(255, 132, 40, 0.28)");
    glow.addColorStop(0.55, "rgba(255, 70, 12, 0.12)");
    glow.addColorStop(1, "rgba(255, 40, 0, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, size, size);

    const path = () => {
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
      ctx.closePath();
    };

    path();
    const body = ctx.createLinearGradient(0, cy - base, 0, cy + base);
    body.addColorStop(0, "#1b100b");
    body.addColorStop(0.55, "#2a130b");
    body.addColorStop(1, "#4a1808");
    ctx.fillStyle = body;
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 128, 38, 0.9)";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.save();
    path();
    ctx.clip();
    for (let i = 0; i < 2; i++) {
      const x1 = cx + (rnd() - 0.5) * base * 1.4;
      const y1 = cy + (rnd() - 0.5) * base * 1.2;
      const x2 = cx + (rnd() - 0.5) * base * 1.4;
      const y2 = cy + (rnd() - 0.5) * base * 1.2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo((x1 + x2) / 2 + (rnd() - 0.5) * 14, (y1 + y2) / 2 + (rnd() - 0.5) * 14);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = `rgba(255, 190, 82, ${0.55 + rnd() * 0.35})`;
      ctx.lineWidth = 2.4;
      ctx.stroke();
    }
    const inner = ctx.createRadialGradient(cx, cy + base * 0.25, 0, cx, cy + base * 0.25, base * 0.9);
    inner.addColorStop(0, "rgba(255, 168, 60, 0.4)");
    inner.addColorStop(1, "rgba(255, 80, 10, 0)");
    ctx.fillStyle = inner;
    ctx.fillRect(0, 0, size, size);
    ctx.restore();

    return canvas;
  }

  start({ x, y, radius, onBurst, onFade, onDone }) {
    this._stop(false);
    this.active = true;
    this.onBurst = onBurst;
    this.onFade = onFade;
    this.onDone = onDone;
    this._burstFired = false;
    this._fadeFired = false;
    this._doneFired = false;
    this.cx = x;
    this.cy = y;
    this.radius = Math.max(60, radius || 160);
    this.particles = [];
    this.splats = [];
    this.spawnAcc = 0;
    this.burstAcc = 0;
    this.plumeAcc = 0;
    this._resize();
    this.cracks = this._makeCracks();
    this.t0 = performance.now();
    this.last = this.t0;
    this.duration = 4.2;
    this.hold = 3;
    this.fade = 0.85;
    this.canvas.style.display = "block";
    this.canvas.style.opacity = "1";
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.raf = requestAnimationFrame(this._loop);
  }

  _stop(callDone) {
    this.active = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.canvas) {
      this.canvas.style.display = "none";
      this.canvas.style.opacity = "1";
    }
    if (this.ctx) {
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    this.particles = [];
    this.splats = [];
    this.cracks = [];
    this.onBurst = null;
    this.onFade = null;
    if (callDone && !this._doneFired) {
      this._doneFired = true;
      const done = this.onDone;
      this.onDone = null;
      if (done) done();
    }
  }

  _resize() {
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.6);
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  _loop = (now) => {
    if (!this.active) return;
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    const t = (now - this.t0) / 1000;
    if (!this._burstFired && t >= 0.1) {
      this._burstFired = true;
      if (this.onBurst) this.onBurst();
    }
    this._update(dt, t);
    this._draw(t);
    if (!this._fadeFired && t >= this.duration + this.hold) {
      this._fadeFired = true;
      this.canvas.style.opacity = "0";
      if (this.onFade) this.onFade();
    }
    if (this._fadeFired && t >= this.duration + this.hold + this.fade) {
      this._stop(true);
      return;
    }
    this.raf = requestAnimationFrame(this._loop);
  };

  _update(dt, t) {
    if (t < 0.35) {
      this.burstAcc += dt * (this.reducedMotion ? 30 : 132);
      while (this.burstAcc >= 1) {
        this.burstAcc--;
        this._spawnBurst();
      }
    }

    if (t < 2.4) {
      this.plumeAcc += dt * (this.reducedMotion ? 4 : 11);
      while (this.plumeAcc >= 1) {
        this.plumeAcc--;
        this._spawnPlumeSmoke(t);
      }
    }

    if (t < this.duration) {
      const rate = t < 0.55 ? 150 : t < 1.6 ? 92 : 46;
      this.spawnAcc += dt * (this.reducedMotion ? rate * 0.36 : rate);
      while (this.spawnAcc >= 1 && this.particles.length < 560) {
        this.spawnAcc--;
        this._spawnTop();
      }
    } else if (t < this.duration + this.hold) {
      this.spawnAcc += dt * (this.reducedMotion ? 5 : 18);
      while (this.spawnAcc >= 1 && this.particles.length < 220) {
        this.spawnAcc--;
        this._spawnTop("ember");
      }
    } else {
      this.spawnAcc = 0;
    }

    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - p.drag * dt;
      if (p.type === "ember" || p.type === "smoke" || p.type === "ash") {
        p.vx += Math.sin(p.y * 0.012 + t * 2.4 + p.phase) * 20 * dt;
      }
      p.rot += p.vr * dt;
      p.trailT += dt;
      if (p.trailT > 0.024) {
        p.trailT = 0;
        p.trail.push(p.x, p.y);
        if (p.trail.length > p.trailMax * 2) p.trail.splice(0, 2);
      }
      if (p.y > this.H + p.size * 2) {
        if (!p.bounced && (p.type === "rock" || p.type === "lava")) {
          p.bounced = true;
          p.y = this.H + p.size;
          p.vy *= -0.24;
          p.vx *= 0.7;
          this._addSplat(p.x, p.size);
          if (!this.reducedMotion) {
            for (let k = 0; k < 3; k++) this._spawnEmber(p.x, this.H, p.size);
          }
        } else {
          p.life = 0;
        }
      }
      if (p.x < -120 || p.x > this.W + 120) p.life = 0;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    for (const s of this.splats) s.life -= dt;
    this.splats = this.splats.filter((s) => s.life > 0);
  }

  _spawnPlumeSmoke(t) {
    const angle = random(0, TAU);
    const reach = this.radius * random(0.15, 0.9);
    const rise = Math.min(1, t / 2.2);
    this.particles.push({
      type: "smoke",
      x: this.cx + Math.cos(angle) * reach,
      y: this.cy + Math.sin(angle) * reach * 0.7 - rise * this.H * 0.18,
      vx: Math.cos(angle) * random(10, 55),
      vy: random(-70, -10) - rise * 20,
      size: random(65, 190),
      gravity: -10,
      drag: 0.15,
      life: random(3.8, 6.8),
      maxLife: 6.8,
      rot: random(0, TAU),
      vr: random(-0.5, 0.5),
      trail: [],
      trailMax: 0,
      trailT: 0,
      bounced: false,
      phase: random(0, TAU),
      variant: 0,
    });
  }

  _spawnTop(forceType) {
    const r = Math.random();
    let type = forceType;
    if (!type) {
      if (r < 0.33) type = "lava";
      else if (r < 0.57) type = "rock";
      else if (r < 0.87) type = "ember";
      else if (r < 0.94) type = "ash";
      else type = "smoke";
    }
    const p = {
      type,
      x: random(-this.W * 0.08, this.W * 1.08),
      y: random(-this.H * 0.42, -20),
      vx: random(-55, 55),
      vy: random(90, 300),
      size: 4,
      gravity: 720,
      drag: 0.08,
      life: random(4.5, 8.5),
      maxLife: 8.5,
      rot: random(0, TAU),
      vr: random(-4, 4),
      trail: [],
      trailMax: 5,
      trailT: 0,
      bounced: false,
      variant: Math.floor(random(0, 6)),
      phase: random(0, TAU),
    };
    p.vx += (p.x - this.W * 0.5) * 0.05;
    if (type === "lava") {
      p.size = random(7, 23);
      p.vy = random(180, 450);
      p.vx *= 1.4;
      p.gravity = 880;
      p.trailMax = 6;
      p.crust = Math.random() < 0.34;
    } else if (type === "rock") {
      p.size = Math.random() < 0.18 ? random(24, 44) : random(8, 26);
      p.vy = random(150, 470);
      p.vx *= 1.25;
      p.gravity = 820;
      p.trailMax = 3;
      p.glow = true;
    } else if (type === "ember") {
      p.size = random(1.4, 3.6);
      p.vy = random(220, 520);
      p.vx = random(-110, 110);
      p.gravity = 560;
      p.trailMax = 6;
    } else if (type === "smoke") {
      p.size = random(46, 150);
      p.y = random(-this.H * 0.2, this.H * 0.5);
      p.vy = random(18, 70);
      p.vx = random(-35, 35);
      p.gravity = -12;
      p.drag = 0.12;
      p.life = random(4.5, 8);
      p.trailMax = 0;
    } else {
      p.size = random(2.5, 8);
      p.vy = random(60, 190);
      p.vx = random(-30, 30);
      p.gravity = 280;
      p.trailMax = 0;
    }
    this.particles.push(p);
  }

  _spawnBurst() {
    const angle = random(0, TAU);
    const speed = random(140, 820);
    const type = pick(["lava", "lava", "rock", "rock", "ember"]);
    const p = {
      type,
      x: this.cx + Math.cos(angle) * this.radius * random(0.1, 0.65),
      y: this.cy + Math.sin(angle) * this.radius * random(0.1, 0.55),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - random(120, 380),
      size: type === "lava" ? random(9, 26) : type === "rock" ? random(8, 30) : random(1.5, 4),
      gravity: type === "ember" ? 520 : 860,
      drag: 0.1,
      life: random(3.6, 7),
      maxLife: 7,
      rot: random(0, TAU),
      vr: random(-5, 5),
      trail: [],
      trailMax: type === "rock" ? 3 : 6,
      trailT: 0,
      bounced: false,
      crust: type === "lava" && Math.random() < 0.4,
      glow: type === "rock",
      variant: Math.floor(random(0, 6)),
      phase: random(0, TAU),
    };
    this.particles.push(p);
  }

  _spawnEmber(x, y, size) {
    this.particles.push({
      type: "ember",
      x: x + random(-size, size),
      y: y - random(0, size),
      vx: random(-180, 180),
      vy: random(-260, -40),
      size: random(1.2, 3.2),
      gravity: 700,
      drag: 0.05,
      life: random(0.5, 1.4),
      maxLife: 1.4,
      rot: 0,
      vr: 0,
      trail: [],
      trailMax: 4,
      trailT: 0,
      bounced: false,
      phase: random(0, TAU),
    });
  }

  _addSplat(x, size) {
    this.splats.push({
      x,
      y: this.H + size * 0.15,
      w: size * random(1.6, 3.4),
      h: size * random(0.25, 0.55),
      life: random(0.7, 1.6),
      maxLife: 1.6,
      hot: Math.random() < 0.55,
    });
  }

  _makeCracks() {
    const paths = [];
    const roots = this.reducedMotion ? 5 : 10;
    for (let i = 0; i < roots; i++) {
      let angle = (i / roots) * TAU + random(-0.35, 0.35);
      let x = this.cx + random(-this.radius * 0.3, this.radius * 0.3);
      let y = this.cy + random(-this.radius * 0.3, this.radius * 0.3);
      const points = [x, y];
      const segments = 5 + Math.floor(random(0, 5));
      for (let s = 0; s < segments; s++) {
        angle += random(-0.62, 0.62);
        const length = random(95, 280) * (1 - s * 0.045);
        const nx = x + Math.cos(angle) * length;
        const ny = y + Math.sin(angle) * length;
        const perp = angle + Math.PI / 2;
        for (let k = 1; k <= 3; k++) {
          const f = k / 3;
          const jitter = k === 3 ? 0 : random(-16, 16);
          points.push(
            x + Math.cos(angle) * length * f + Math.cos(perp) * jitter,
            y + Math.sin(angle) * length * f + Math.sin(perp) * jitter
          );
        }
        if (Math.random() < 0.46 && s < segments - 1) {
          const branchAngle = angle + random(-1.2, 1.2);
          const branchLen = length * random(0.45, 0.85);
          paths.push([
            nx,
            ny,
            nx + Math.cos(branchAngle) * branchLen,
            ny + Math.sin(branchAngle) * branchLen,
          ]);
        }
        x = nx;
        y = ny;
      }
      paths.push(points);
    }
    // A few fissures tear in from the edges as well.
    for (let i = 0; i < 4; i++) {
      const side = i % 4;
      let x = side === 0 ? random(0, this.W) : side === 1 ? this.W : side === 2 ? random(0, this.W) : 0;
      let y = side === 0 ? -20 : side === 1 ? random(0, this.H) : side === 2 ? this.H + 20 : random(0, this.H);
      let angle = Math.atan2(this.cy - y, this.cx - x) + random(-0.3, 0.3);
      const points = [x, y];
      for (let s = 0; s < 7; s++) {
        angle += random(-0.4, 0.4);
        const length = random(80, 210);
        const perp = angle + Math.PI / 2;
        const ox = x;
        const oy = y;
        x += Math.cos(angle) * length;
        y += Math.sin(angle) * length;
        for (let k = 1; k <= 3; k++) {
          const f = k / 3;
          const jitter = k === 3 ? 0 : random(-12, 12);
          points.push(
            ox + Math.cos(angle) * length * f + Math.cos(perp) * jitter,
            oy + Math.sin(angle) * length * f + Math.sin(perp) * jitter
          );
        }
      }
      paths.push(points);
    }
    return paths;
  }

  _drawCracks(t, alpha) {
    const ctx = this.ctx;
    if (t < 0.12) return;
    const age = t - 0.12;
    const grow = Math.min(1, age / 1.2);
    const a = alpha * Math.min(1, age / 0.2) * (1 - Math.max(0, (t - 5.2) / 2.2));
    if (a <= 0) return;
    ctx.save();
    ctx.lineCap = "round";
    for (const path of this.cracks) {
      const n = path.length / 2;
      const count = Math.max(2, Math.floor(n * grow));
      if (count < 2) continue;
      ctx.beginPath();
      ctx.moveTo(path[0], path[1]);
      for (let i = 1; i < count; i++) ctx.lineTo(path[i * 2], path[i * 2 + 1]);
      ctx.strokeStyle = `rgba(255, 68, 10, ${a * 0.42})`;
      ctx.lineWidth = 14;
      ctx.stroke();
      ctx.strokeStyle = `rgba(7, 2, 1, ${a * 0.78})`;
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.strokeStyle = `rgba(255, 190, 100, ${a * 0.95})`;
      ctx.lineWidth = 1.8;
      ctx.stroke();
    }
    ctx.restore();
  }

  _draw(t) {
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const shakeAmount = this.reducedMotion ? 0 : Math.max(0, 1 - t / 1.35) * 16;
    const shakeX = random(-shakeAmount, shakeAmount);
    const shakeY = random(-shakeAmount, shakeAmount);
    const shakeR = this.reducedMotion ? 0 : random(-1, 1) * Math.max(0, 1 - t / 1.35) * 0.006;

    ctx.save();
    ctx.translate(W * 0.5 + shakeX, H * 0.5 + shakeY);
    ctx.rotate(shakeR);
    ctx.translate(-W * 0.5, -H * 0.5);

    /* dark ash base */
    const base = ctx.createRadialGradient(
      this.cx,
      this.cy,
      0,
      this.cx,
      this.cy,
      Math.max(W, H) * 0.9
    );
    base.addColorStop(0, "rgba(31, 8, 3, 0.95)");
    base.addColorStop(0.45, "rgba(8, 4, 3, 0.975)");
    base.addColorStop(1, "rgba(1, 1, 2, 0.99)");
    ctx.fillStyle = base;
    ctx.fillRect(-40, -40, W + 80, H + 80);

    const floorGlow = ctx.createRadialGradient(
      W * 0.5,
      H * 1.06,
      0,
      W * 0.5,
      H * 1.06,
      Math.max(W * 0.75, H * 0.55)
    );
    floorGlow.addColorStop(0, "rgba(255, 88, 12, 0.34)");
    floorGlow.addColorStop(0.5, "rgba(180, 40, 4, 0.12)");
    floorGlow.addColorStop(1, "rgba(180, 40, 4, 0)");
    ctx.fillStyle = floorGlow;
    ctx.fillRect(-40, -40, W + 80, H + 80);

    /* smoke plumes rolling under the fire */
    for (const p of this.particles) {
      if (p.type !== "smoke") continue;
      const alpha = Math.min(1, p.life / 1.8) * 0.8;
      const r = p.size * 1.6;
      ctx.globalAlpha = alpha;
      ctx.drawImage(this.smokeSprite, p.x - r, p.y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;

    /* shockwave + a brief, broken fireball */
    ctx.globalCompositeOperation = "lighter";
    const ringT = t / 1.35;
    if (ringT < 1) {
      const a = Math.pow(1 - ringT, 2);
      const ringR = this.radius * 0.4 + ringT * Math.hypot(W, H) * 1.15;
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, ringR, 0, TAU);
      ctx.strokeStyle = `rgba(255, 158, 64, ${a * 0.5})`;
      ctx.lineWidth = 18 * (1 - ringT) + 2;
      ctx.stroke();
      ctx.strokeStyle = `rgba(255, 238, 196, ${a * 0.55})`;
      ctx.lineWidth = 4 * (1 - ringT) + 1;
      ctx.stroke();
    }

    const fireT = t / 0.8;
    if (fireT < 1) {
      const a = Math.pow(1 - fireT, 1.7) * 0.82;
      const spread = t / 0.8;
      const fireR =
        this.radius * (1 + spread * 4.2) + spread * Math.hypot(W, H) * 0.75;
      for (let i = 0; i < 4; i++) {
        const ox = Math.cos(i * 1.73 + t * 0.65) * this.radius * 0.2 * spread;
        const oy =
          Math.sin(i * 2.31 + t * 0.8) * this.radius * 0.17 * spread -
          this.radius * 0.05 * spread;
        const rr = fireR * (0.64 + i * 0.11);
        const fire = ctx.createRadialGradient(
          this.cx + ox,
          this.cy + oy,
          0,
          this.cx + ox,
          this.cy + oy,
          rr
        );
        const inner = a * (0.95 - i * 0.13);
        fire.addColorStop(0, `rgba(255, 255, 236, ${inner})`);
        fire.addColorStop(0.18, `rgba(255, 226, 146, ${inner * 0.92})`);
        fire.addColorStop(0.46, `rgba(255, 120, 32, ${inner * 0.55})`);
        fire.addColorStop(0.75, `rgba(180, 34, 6, ${inner * 0.18})`);
        fire.addColorStop(1, "rgba(120, 16, 2, 0)");
        ctx.fillStyle = fire;
        ctx.fillRect(-40, -40, W + 80, H + 80);
      }
    }
    ctx.globalCompositeOperation = "source-over";

    /* cracks across the surface */
    this._drawCracks(t, 1);

    /* ash particles behind the rocks */
    ctx.globalCompositeOperation = "source-over";
    for (const p of this.particles) {
      if (p.type !== "ash") continue;
      const alpha = Math.min(1, p.life / 1.5) * 0.34;
      ctx.fillStyle = `rgba(18, 13, 11, ${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
    }

    /* rocks */
    for (const p of this.particles) {
      if (p.type !== "rock") continue;
      const alpha = Math.min(1, p.life / 1.1);
      if (alpha <= 0) continue;

      if (p.trail.length >= 4) {
        ctx.beginPath();
        ctx.moveTo(p.trail[0], p.trail[1]);
        for (let i = 2; i < p.trail.length; i += 2) {
          ctx.lineTo(p.trail[i], p.trail[i + 1]);
        }
        ctx.lineTo(p.x, p.y);
        ctx.strokeStyle = `rgba(255, 96, 22, ${alpha * 0.22})`;
        ctx.lineWidth = Math.max(1.5, p.size * 0.35);
        ctx.lineCap = "round";
        ctx.stroke();
      }

      if (p.glow) {
        const gr = p.size * 2.3;
        ctx.globalAlpha = alpha * 0.2;
        ctx.drawImage(this.lavaSprite, p.x - gr, p.y - gr, gr * 2, gr * 2);
        ctx.globalAlpha = 1;
      }

      const sprite = this.rockSprites[p.variant % this.rockSprites.length];
      const s = p.size * 3.4;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = alpha;
      ctx.drawImage(sprite, -s / 2, -s / 2, s, s);
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    /* glowing lava + embers */
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.particles) {
      if (p.type === "ash" || p.type === "rock") continue;
      const alpha = Math.min(1, p.life / 1.2);
      if (alpha <= 0) continue;
      const isLava = p.type === "lava";
      if (p.trail.length >= 4) {
        ctx.beginPath();
        ctx.moveTo(p.trail[0], p.trail[1]);
        for (let i = 2; i < p.trail.length; i += 2) {
          ctx.lineTo(p.trail[i], p.trail[i + 1]);
        }
        ctx.lineTo(p.x, p.y);
        ctx.strokeStyle = isLava
          ? `rgba(255, 92, 18, ${alpha * 0.45})`
          : `rgba(255, 178, 80, ${alpha * 0.4})`;
        ctx.lineWidth = isLava ? p.size * 0.65 : Math.max(1, p.size * 0.8);
        ctx.lineCap = "round";
        ctx.stroke();
      }
      if (isLava) {
        const r = p.size * 2.3;
        const flicker = 0.8 + 0.2 * Math.sin(t * 9 + p.phase);
        if (!p.crust) {
          const angle = Math.atan2(p.vy, p.vx);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(angle);
          ctx.scale(1.28, 0.78);
          ctx.globalAlpha = alpha * 0.72 * flicker;
          ctx.drawImage(this.lavaSprite, -r, -r, r * 2, r * 2);
          ctx.restore();
          ctx.globalAlpha = 1;
          ctx.fillStyle = `rgba(255, 244, 200, ${alpha * 0.9 * flicker})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 0.5, 0, TAU);
          ctx.fill();
          continue;
        }
        ctx.globalAlpha = alpha * 0.72 * flicker;
        ctx.drawImage(this.lavaSprite, p.x - r, p.y - r, r * 2, r * 2);
        ctx.globalAlpha = 1;
        if (p.crust) {
          ctx.globalCompositeOperation = "source-over";
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.beginPath();
          const sides = 5;
          for (let i = 0; i < sides; i++) {
            const a = (i / sides) * TAU;
            const rr = p.size * (0.62 + ((i * 31) % 10) / 28);
            const x = Math.cos(a) * rr;
            const y = Math.sin(a) * rr;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.fillStyle = `rgba(24, 12, 7, ${alpha * 0.94})`;
          ctx.fill();
          ctx.strokeStyle = `rgba(255, 154, 58, ${alpha * 0.9})`;
          ctx.lineWidth = 1.6;
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(-p.size * 0.45, 0);
          ctx.lineTo(p.size * 0.45, 0);
          ctx.strokeStyle = `rgba(255, 120, 30, ${alpha * 0.75})`;
          ctx.lineWidth = 1.2;
          ctx.stroke();
          ctx.restore();
          ctx.globalCompositeOperation = "lighter";
        }
      } else {
        const r = p.size * 2.6;
        ctx.globalAlpha = alpha * 0.6;
        ctx.drawImage(this.emberSprite, p.x - r, p.y - r, r * 2, r * 2);
        ctx.globalAlpha = 1;
      }
    }

    /* glowing splats on the floor */
    for (const s of this.splats) {
      const a = Math.min(1, s.life / 0.9) * 0.55;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.scale(1, Math.max(0.16, s.h / Math.max(1, s.w)));
      const r = s.w * 1.7;
      ctx.globalAlpha = a;
      ctx.drawImage(this.lavaSprite, -r, -r, r * 2, r * 2);
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    ctx.globalCompositeOperation = "source-over";

    /* opening flash */
    if (t < 0.3) {
      const a = Math.pow(1 - t / 0.3, 2) * (this.reducedMotion ? 0.38 : 0.94);
      ctx.fillStyle = `rgba(255, 245, 220, ${a})`;
      ctx.fillRect(-40, -40, W + 80, H + 80);
    }

    /* warm edge vignette / smoke */
    const vignette = ctx.createRadialGradient(
      W * 0.5,
      H * 0.5,
      Math.min(W, H) * 0.2,
      W * 0.5,
      H * 0.5,
      Math.max(W, H) * 0.82
    );
    vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
    vignette.addColorStop(0.65, "rgba(20, 8, 4, 0.12)");
    vignette.addColorStop(1, "rgba(2, 1, 1, 0.72)");
    ctx.fillStyle = vignette;
    ctx.fillRect(-40, -40, W + 80, H + 80);

    ctx.restore();
  }
}
