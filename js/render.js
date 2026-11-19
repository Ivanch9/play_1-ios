// Неоновая отрисовка на Canvas 2D: эффекты, HUD и экраны.
var NR = globalThis.NR = globalThis.NR || {};

(function () {
  const W = NR.W, H = NR.H, TAU = NR.TAU, C = NR.COLORS;
  const FONT = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';
  const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

  const rnd = (a, b) => a + Math.random() * (b - a);
  // Радиус головы относительно хитбокса врага
  const HEAD = { chaser: 1.3, mini: 1.45, shooter: 1.3, splitter: 1.15, tank: 1.05, boss: 0.85 };

  class Renderer {
    constructor(canvas) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.parts = new NR.Pool(() => ({}), 2000);
      this.reset();
      this.time = 0;
      this.resize();
    }

    reset() {
      if (this.parts) this.parts.clear();
      this.gait = new Map(); // id врага → { ph: фаза шага, ang: куда повёрнуто тело }
      this.gaitT = null;
      this.gaitFrame = 0;
      this.floats = [];
      this.banner = null;
      this.shake = 0;
      this.hitstop = 0;
      this.redFlash = 0;
      this.whiteFlash = 0;
      this.gridPulse = 0;
      this.chargeWarn = 0;
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = window.innerWidth, ch = window.innerHeight;
      this.cv.width = Math.floor(cw * dpr);
      this.cv.height = Math.floor(ch * dpr);
      this.cv.style.width = cw + 'px';
      this.cv.style.height = ch + 'px';
      this.dpr = dpr;
      // Безопасная зона (вырез и home-индикатор iPhone): мир вписывается в неё, фон — на весь экран
      const sa = NR.safe || { l: 0, r: 0, t: 0, b: 0 };
      const aw = this.cv.width - (sa.l + sa.r) * dpr, ah = this.cv.height - (sa.t + sa.b) * dpr;
      this.scale = Math.min(aw / W, ah / H);
      this.ox = sa.l * dpr + (aw - W * this.scale) / 2;
      this.oy = sa.t * dpr + (ah - H * this.scale) / 2;
      this.makeBg();
    }

    toWorld(clientX, clientY) {
      return { x: (clientX * this.dpr - this.ox) / this.scale, y: (clientY * this.dpr - this.oy) / this.scale };
    }

    // Фон рисуется один раз в отдельный canvas
    makeBg() {
      const s = this.scale;
      const bg = document.createElement('canvas');
      bg.width = Math.max(1, Math.ceil(W * s));
      bg.height = Math.max(1, Math.ceil(H * s));
      const g = bg.getContext('2d');
      g.scale(s, s);
      g.fillStyle = '#07040f';
      g.fillRect(0, 0, W, H);
      for (let x = 0; x <= W; x += 40) {
        g.strokeStyle = x % 160 === 0 ? 'rgba(120,70,255,0.22)' : 'rgba(90,60,200,0.10)';
        g.lineWidth = 1;
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
      }
      for (let y = 0; y <= H; y += 40) {
        g.strokeStyle = y % 160 === 0 ? 'rgba(120,70,255,0.22)' : 'rgba(90,60,200,0.10)';
        g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
      }
      const vg = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.7);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.65)');
      g.fillStyle = vg;
      g.fillRect(0, 0, W, H);
      g.strokeStyle = '#7a4dff';
      g.lineWidth = 3;
      g.shadowColor = '#7a4dff';
      g.shadowBlur = 18 * s;
      g.strokeRect(1.5, 1.5, W - 3, H - 3);
      this.bg = bg;
    }

    // ---------- Частицы ----------
    part(x, y, vx, vy, life, color, size, kind) {
      const p = this.parts.spawn();
      if (!p) return;
      p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.max = life;
      p.color = color; p.size = size; p.kind = kind || 'dot';
    }

    burst(x, y, color, n, speed, life, size) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, sp = speed * rnd(0.25, 1);
        this.part(x, y, Math.cos(a) * sp, Math.sin(a) * sp, life * rnd(0.6, 1.2), color, size * rnd(0.6, 1.3), Math.random() < 0.5 ? 'line' : 'dot');
      }
    }

    ring(x, y, color, radius, life) {
      this.part(x, y, radius, 0, life, color, 3, 'ring');
    }

    float(x, y, text, color, size) {
      if (this.floats.length > 70) this.floats.shift();
      this.floats.push({ x: x + rnd(-8, 8), y, text, color, size, life: 0.8, max: 0.8 });
    }

    setBanner(text, sub, color, dur) {
      this.banner = { text, sub, color: color || '#ffffff', life: dur || 2, max: dur || 2 };
    }

    // ---------- События игры ----------
    consume(ev) {
      const x = ev.x, y = ev.y;
      switch (ev.t) {
        case 'shoot':
          this.part(x, y, Math.cos(ev.a) * 120, Math.sin(ev.a) * 120, 0.08, C.pbullet, 3, 'dot');
          break;
        case 'hit': {
          this.burst(x, y, C[ev.type] || '#fff', 3, 180, 0.25, 2.5);
          const n = ev.n >= 10 ? Math.round(ev.n) : Math.round(ev.n * 10) / 10;
          if (ev.crit) this.float(x, y - 14, n + '!', '#ffff66', 22);
          break;
        }
        case 'kill': {
          const col = C[ev.type] || '#fff';
          const big = ev.type === 'boss';
          this.burst(x, y, col, big ? 160 : 14 + ev.r, big ? 700 : 260 + ev.r * 6, big ? 1.6 : 0.6, big ? 5 : 3);
          this.burst(x, y, '#ffffff', big ? 40 : 4, big ? 500 : 200, 0.3, 2);
          this.ring(x, y, col, ev.r * (big ? 10 : 4), big ? 1 : 0.4);
          this.shake = Math.max(this.shake, ev.r / 5);
          this.gridPulse = Math.min(1, this.gridPulse + ev.r / 60);
          if (ev.type === 'tank') this.hitstop = Math.max(this.hitstop, 0.04);
          break;
        }
        case 'eshoot':
          this.burst(x, y + 6, C.ebullet, 6, 140, 0.3, 2.5);
          break;
        case 'spawn':
          this.ring(x, y, C[ev.type] || '#fff', 40, 0.3);
          break;
        case 'deflect':
          this.burst(x, y, C.shield, 4, 220, 0.2, 2);
          break;
        case 'wallhit':
          this.burst(x, y, C.pbullet, 2, 120, 0.2, 2);
          break;
        case 'ricochet':
          this.burst(x, y, '#ffffff', 5, 200, 0.25, 2);
          break;
        case 'absorb':
          this.burst(x, y, C.orb, 4, 120, 0.2, 2);
          break;
        case 'dash':
          this.ring(x, y, C.player, 50, 0.25);
          break;
        case 'nova':
          this.ring(x, y, '#ffffff', 140, 0.35);
          break;
        case 'hurt':
          this.burst(x, y, C.player, 30, 360, 0.6, 3);
          this.ring(x, y, '#ff3366', 170, 0.4);
          this.shake = 14; this.redFlash = 0.6; this.hitstop = 0.09;
          break;
        case 'shieldbreak':
          this.burst(x, y, C.shield, 24, 300, 0.5, 3);
          this.ring(x, y, C.shield, 150, 0.4);
          this.shake = 8; this.hitstop = 0.05;
          this.float(x, y - 24, 'ЩИТ', C.shield, 16);
          break;
        case 'shieldup':
          this.ring(x, y, C.shield, 40, 0.4);
          break;
        case 'heal':
          this.burst(x, y, C.heart, 16, 160, 0.6, 3);
          this.float(x, y - 24, '+1', C.heart, 20);
          break;
        case 'wave':
          this.setBanner('ВОЛНА ' + ev.n, 'из ' + NR.WAVES.length, '#c9a8ff', 2.2);
          break;
        case 'waveclear':
          this.setBanner('ВОЛНА ЗАЧИЩЕНА', '', '#66ffcc', 1.4);
          this.gridPulse = 1;
          break;
        case 'upgrade':
          this.ring(x, y, '#ffffff', 120, 0.5);
          break;
        case 'boss':
          this.setBanner('КОРОЛЬ-ГРИЗЛИ', 'финальная битва', C.boss, 3);
          this.shake = 12;
          break;
        case 'bossphase':
          this.setBanner('ФАЗА ' + ev.n, ev.n === 2 ? 'зовёт медведей на подмогу' : 'берегись тарана', C.boss, 1.8);
          this.whiteFlash = 0.5; this.shake = 16; this.hitstop = 0.15;
          this.ring(x, y, C.boss, 400, 0.6);
          break;
        case 'chargewarn':
          this.chargeWarn = 0.85;
          break;
        case 'slam':
          this.ring(x, y, C.boss, 260, 0.5);
          this.burst(x, y, C.boss, 30, 400, 0.5, 3);
          this.shake = 16;
          break;
        case 'burst':
          this.ring(x, y, C.boss, 90, 0.3);
          break;
        case 'bossdead':
          this.whiteFlash = 1; this.hitstop = 0.35; this.shake = 30; this.gridPulse = 1;
          for (let i = 0; i < 4; i++) this.ring(x, y, i % 2 ? '#ffffff' : C.boss, 300 + i * 200, 1 + i * 0.3);
          break;
        case 'death':
          this.burst(x, y, C.player, 120, 600, 1.4, 4);
          this.burst(x, y, '#ffffff', 40, 400, 0.8, 3);
          this.ring(x, y, C.player, 500, 1);
          this.shake = 24; this.hitstop = 0.25; this.redFlash = 1;
          break;
      }
    }

    update(dt) {
      this.time += dt;
      this.hitstop = Math.max(0, this.hitstop - dt);
      this.shake = Math.max(0, this.shake - dt * 45);
      this.redFlash = Math.max(0, this.redFlash - dt * 1.8);
      this.whiteFlash = Math.max(0, this.whiteFlash - dt * 2.2);
      this.gridPulse = Math.max(0, this.gridPulse - dt * 1.6);
      this.chargeWarn = Math.max(0, this.chargeWarn - dt);
      const damp = Math.exp(-dt * 4);
      this.parts.update(p => {
        p.life -= dt;
        if (p.life <= 0) return false;
        if (p.kind !== 'ring') { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= damp; p.vy *= damp; }
        return true;
      });
      for (let i = this.floats.length - 1; i >= 0; i--) {
        const f = this.floats[i];
        f.life -= dt; f.y -= 40 * dt;
        if (f.life <= 0) this.floats.splice(i, 1);
      }
      if (this.banner) { this.banner.life -= dt; if (this.banner.life <= 0) this.banner = null; }
    }

    // ---------- Примитивы ----------
    glow(color, blur) {
      const c = this.ctx;
      c.shadowColor = color;
      c.shadowBlur = blur * this.scale;
    }
    noGlow() { this.ctx.shadowBlur = 0; }

    poly(n, r, rot) {
      const c = this.ctx;
      c.beginPath();
      for (let i = 0; i < n; i++) {
        const a = rot + (i / n) * TAU;
        if (i === 0) c.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      c.closePath();
    }

    text(str, x, y, size, color, align, glowPx, weight) {
      const c = this.ctx;
      if (this.touch && size <= 18) size *= 1.15;
      c.font = `${weight || 700} ${size}px ${FONT}`;
      c.textAlign = align || 'center';
      c.textBaseline = 'middle';
      if (glowPx) this.glow(color, glowPx);
      c.fillStyle = color;
      c.fillText(str, x, y);
      if (glowPx) this.noGlow();
    }

    wrap(str, maxW, size) {
      const c = this.ctx;
      if (this.touch && size <= 18) size *= 1.15;
      c.font = `500 ${size}px ${FONT}`;
      const words = str.split(' '), lines = [];
      let line = '';
      for (const w of words) {
        const t = line ? line + ' ' + w : w;
        if (c.measureText(t).width > maxW && line) { lines.push(line); line = w; }
        else line = t;
      }
      if (line) lines.push(line);
      return lines;
    }

    // ---------- Кадр ----------
    draw(game, ui) {
      const c = this.ctx, s = this.scale;
      this.touch = !!ui.touch;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
      c.fillStyle = '#000';
      c.fillRect(0, 0, this.cv.width, this.cv.height);

      const sx = this.shake ? rnd(-1, 1) * this.shake : 0;
      const sy = this.shake ? rnd(-1, 1) * this.shake : 0;
      c.setTransform(s, 0, 0, s, this.ox + sx * s, this.oy + sy * s);
      c.drawImage(this.bg, 0, 0, W, H);
      if (this.gridPulse > 0) {
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = this.gridPulse * 0.6;
        c.drawImage(this.bg, 0, 0, W, H);
        c.globalAlpha = 1;
        c.globalCompositeOperation = 'source-over';
      }

      if (ui.scene === 'menu') {
        this.drawParticles();
        c.setTransform(s, 0, 0, s, this.ox, this.oy);
        this.drawMenu(ui);
      } else {
        this.drawWorld(game, ui);
        this.drawParticles();
        this.drawFloats();
        c.setTransform(s, 0, 0, s, this.ox, this.oy);
        if (this.redFlash > 0) {
          c.fillStyle = `rgba(255,0,70,${this.redFlash * 0.25})`;
          c.fillRect(0, 0, W, H);
        }
        if (this.whiteFlash > 0) {
          c.fillStyle = `rgba(255,255,255,${this.whiteFlash * 0.6})`;
          c.fillRect(0, 0, W, H);
        }
        this.drawHud(game, ui);
        this.drawBanner();
        if (game.state === 'upgrade') this.drawUpgrades(game, ui);
        else if (game.state === 'dead' && ui.endT > 1.2) this.drawEnd(game, ui, false);
        else if (game.state === 'win' && ui.endT > 0.3) this.drawEnd(game, ui, true);
        if (ui.paused) this.drawPause(ui);
      }
      if (ui.touch) this.drawTouch(game, ui);
      else this.drawCursor(ui);
    }

    drawWorld(g, ui) {
      const c = this.ctx, t = this.time, p = g.player;

      // Маркеры появления
      for (const sp of g.spawns) {
        const k = sp.t / sp.max, col = C[sp.type];
        c.globalAlpha = 1 - k * 0.6;
        c.strokeStyle = col; c.lineWidth = 2;
        c.beginPath(); c.arc(sp.x, sp.y, NR.TYPES[sp.type].r * (1 + k * 2.5), 0, TAU); c.stroke();
        c.beginPath(); c.arc(sp.x, sp.y, 3, 0, TAU); c.fillStyle = col; c.fill();
      }
      c.globalAlpha = 1;

      // Аптечки
      for (const k of g.pickups) {
        const pulse = 1 + Math.sin(t * 8) * 0.15;
        if (k.life < 3 && Math.floor(t * 8) % 2) continue;
        c.save(); c.translate(k.x, k.y); c.scale(pulse, pulse);
        this.glow(C.heart, 14);
        c.strokeStyle = C.heart; c.lineWidth = 3;
        c.beginPath(); c.moveTo(-7, 0); c.lineTo(7, 0); c.moveTo(0, -7); c.lineTo(0, 7); c.stroke();
        this.poly(4, 12, Math.PI / 4); c.lineWidth = 1.5; c.stroke();
        c.restore();
      }
      this.noGlow();

      // Предупреждение о таране босса
      const boss = g.boss;
      if (boss && !boss.dead && boss.mode === 'tele') {
        const a = boss.chargeA, k = 1 - boss.modeT / 0.85;
        c.save();
        c.globalAlpha = 0.25 + 0.5 * k;
        c.strokeStyle = C.boss; c.lineWidth = boss.r * 2 * (0.3 + 0.7 * k);
        c.beginPath(); c.moveTo(boss.x, boss.y); c.lineTo(boss.x + Math.cos(a) * 1600, boss.y + Math.sin(a) * 1600); c.stroke();
        c.restore();
      }

      // Враги
      this.live = !ui.paused && g.state === 'play';
      this.gaitDt = this.live && this.gaitT !== null ? Math.min(0.1, this.time - this.gaitT) : 0;
      this.gaitT = this.time;
      this.gaitFrame++;
      for (const e of g.enemies) this.drawEnemy(e, p);
      if (this.gaitFrame % 60 === 0) { // забываем погибших
        for (const [id, st] of this.gait) if (this.gaitFrame - st.seen > 30) this.gait.delete(id);
      }
      this.noGlow();

      // Пули (аддитивно, без shadowBlur — дешевле)
      c.globalCompositeOperation = 'lighter';
      c.lineCap = 'round';
      c.strokeStyle = 'rgba(80,220,255,0.35)'; c.lineWidth = 8;
      c.beginPath();
      for (const b of g.pb.items) { c.moveTo(b.x - b.vx * 0.025, b.y - b.vy * 0.025); c.lineTo(b.x, b.y); }
      c.stroke();
      c.strokeStyle = '#e6ffff'; c.lineWidth = 3;
      c.beginPath();
      for (const b of g.pb.items) { c.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02); c.lineTo(b.x, b.y); }
      c.stroke();

      // Плевки: салатовая капля с хвостом
      c.strokeStyle = 'rgba(190,255,60,0.6)'; c.lineWidth = 7;
      c.beginPath();
      for (const b of g.eb.items) { c.moveTo(b.x - b.vx * 0.06, b.y - b.vy * 0.06); c.lineTo(b.x, b.y); }
      c.stroke();
      c.fillStyle = 'rgba(190,255,60,0.55)';
      c.beginPath();
      for (const b of g.eb.items) { c.moveTo(b.x + b.r * 2, b.y); c.arc(b.x, b.y, b.r * 2, 0, TAU); }
      c.fill();
      c.fillStyle = '#f2ffcc';
      c.beginPath();
      for (const b of g.eb.items) { c.moveTo(b.x + b.r, b.y); c.arc(b.x, b.y, b.r, 0, TAU); }
      c.fill();
      c.globalCompositeOperation = 'source-over';
      c.lineCap = 'butt';

      if (g.state !== 'dead') this.drawPlayer(g, ui);
    }

    // Походка врага: фаза растёт только от реального движения, тело плавно поворачивается.
    gaitOf(e, look) {
      const dt = this.gaitDt, sp = Math.hypot(e.vx, e.vy);
      let st = this.gait.get(e.id);
      const want = e.type === 'tank' ? e.face : sp > 8 ? Math.atan2(e.vy, e.vx) : Math.atan2(look.y, look.x);
      if (!st) { st = { ph: e.id * 1.7, ang: want }; this.gait.set(e.id, st); }
      st.seen = this.gaitFrame;
      st.ph += sp * dt / (0.9 * e.r);
      st.ang += NR.angleDiff(st.ang, want) * Math.min(1, dt * 8);
      return st;
    }

    // Туловище и лапы медведя, вид сверху. Начало координат — центр головы, +X — куда ползёт.
    // R — радиус головы, ph — фаза шага. Лапы шагают диагональными парами.
    bearBody(R, col, ph, o) {
      const c = this.ctx;
      o = o || {};
      const lw = o.lw || 2.5;
      const reach = o.cub ? 0.3 : 0.42;     // амплитуда шага
      const legW = (o.cub ? 0.3 : 0.36) * R;
      const sway = Math.sin(ph * 2) * 0.05 * R;
      c.save();
      c.lineCap = 'round';
      this.noGlow();
      // Лапы: [x сустава, сторона, сдвиг фазы]
      const legs = [[-0.45, -1, 0], [-0.45, 1, Math.PI], [-1.75, 1, 0], [-1.75, -1, Math.PI]];
      for (const [jx, side, off] of legs) {
        const s = Math.sin(ph + off), lift = Math.max(0, Math.cos(ph + off)); // lift>0 — лапа в переносе
        const fx = (jx + 0.15 + s * reach) * R;
        const fy = side * (1.12 + lift * 0.12) * R + sway;
        const ax = jx * R, ay = side * 0.5 * R + sway;
        // Конечность: светящийся контур и тёмная начинка
        c.strokeStyle = col; c.lineWidth = legW + lw * 2;
        c.beginPath(); c.moveTo(ax, ay); c.lineTo(fx, fy); c.stroke();
        c.strokeStyle = '#0b0614'; c.lineWidth = legW;
        c.stroke();
        c.strokeStyle = col + '30'; c.stroke();
        // Ступня с когтями
        const pr = (o.cub ? 0.2 : 0.24) * R * (1 + lift * 0.15);
        c.fillStyle = '#0b0614'; c.strokeStyle = col; c.lineWidth = lw * 0.8;
        c.beginPath(); c.ellipse(fx + 0.04 * R, fy, pr * 1.15, pr, 0, 0, TAU); c.fill(); c.stroke();
        if (!o.cub) {
          c.lineWidth = Math.max(1, R * 0.06);
          c.strokeStyle = '#f4f0ff';
          c.beginPath();
          for (let k = -1; k <= 1; k++) {
            const cy = fy + k * pr * 0.55;
            c.moveTo(fx + pr * 1.05, cy); c.lineTo(fx + pr * 1.05 + 0.16 * R, cy + k * 0.04 * R);
          }
          c.stroke();
        }
      }
      // Хвостик
      c.fillStyle = '#0b0614'; c.strokeStyle = col; c.lineWidth = lw * 0.8;
      c.beginPath(); c.arc(-2.3 * R, sway, 0.16 * R, 0, TAU); c.fill(); c.stroke();
      // Туловище
      this.glow(col, 12);
      c.lineWidth = lw; c.strokeStyle = col;
      c.fillStyle = '#0b0614';
      c.beginPath(); c.ellipse(-1.1 * R, sway, 1.2 * R, 0.82 * R, 0, 0, TAU); c.fill();
      c.fillStyle = col + '22'; c.fill(); c.stroke();
      this.noGlow();
      // Загривок и хребет
      c.lineWidth = 1.5; c.strokeStyle = col + '88';
      c.beginPath(); c.ellipse(-0.55 * R, sway, 0.38 * R, 0.6 * R, 0, Math.PI * 0.6, Math.PI * 1.4); c.stroke();
      c.beginPath(); c.moveTo(-0.7 * R, sway); c.quadraticCurveTo(-1.3 * R, sway + Math.sin(ph) * 0.12 * R, -2.0 * R, sway); c.stroke();
      if (o.armor) { // наплечники танка
        c.strokeStyle = C.shield; c.lineWidth = 3.5;
        for (const sd of [-1, 1]) {
          c.beginPath(); c.arc(-0.55 * R, sd * 0.45 * R + sway, 0.4 * R, sd > 0 ? 0.2 : Math.PI + 0.2, sd > 0 ? Math.PI - 0.2 : TAU - 0.2); c.stroke();
        }
      }
      c.restore();
    }

    // Морда бешеного медведя анфас. R — радиус головы, o.mouth 0..1 — насколько раскрыта пасть.
    bear(R, col, o) {
      const c = this.ctx, t = this.time;
      o = o || {};
      const mouth = o.mouth || 0, look = o.look || { x: 0, y: 1 };
      c.lineWidth = o.lw || 2.5;
      c.strokeStyle = col;
      // Уши (рисуются до головы, голова перекрывает основание)
      for (const sx of [-1, 1]) {
        c.fillStyle = '#0b0614';
        c.beginPath(); c.arc(sx * 0.68 * R, -0.68 * R, 0.32 * R, 0, TAU); c.fill();
        c.fillStyle = col + '30'; c.fill(); c.stroke();
      }
      // Голова
      c.fillStyle = '#0b0614';
      c.beginPath(); c.ellipse(0, 0, R * 1.04, R * 0.94, 0, 0, TAU); c.fill();
      c.fillStyle = col + '26'; c.fill(); c.stroke();
      this.noGlow();

      c.lineWidth = 1.5;
      for (const sx of [-1, 1]) {
        c.beginPath(); c.arc(sx * 0.68 * R, -0.68 * R, 0.15 * R, Math.PI * 0.9, Math.PI * 2.1); c.stroke();
      }
      // Морда и нос
      c.beginPath(); c.ellipse(0, 0.32 * R, 0.5 * R, 0.36 * R, 0, 0, TAU); c.stroke();
      c.fillStyle = col;
      c.beginPath(); c.moveTo(-0.14 * R, 0.07 * R); c.lineTo(0.14 * R, 0.07 * R); c.lineTo(0, 0.21 * R); c.closePath(); c.fill();

      // Пасть
      const mh = 0.04 * R + mouth * 0.24 * R, my = 0.42 * R + mh;
      c.fillStyle = '#26000c';
      c.beginPath(); c.ellipse(0, my, 0.28 * R, mh, 0, 0, TAU); c.fill(); c.stroke();
      if (mouth > 0.15 && !o.cub) {
        c.fillStyle = '#ffffff';
        for (const sx of [-1, 1]) {
          const tx = sx * 0.13 * R, ty = my - mh * 0.92;
          c.beginPath(); c.moveTo(tx - 0.05 * R, ty); c.lineTo(tx + 0.05 * R, ty); c.lineTo(tx, ty + Math.min(0.14 * R, mh * 0.9)); c.closePath(); c.fill();
        }
      }
      // Пена в уголках пасти
      c.fillStyle = 'rgba(240,255,220,0.9)';
      for (const sx of [-1, 1]) {
        const b = Math.sin(t * 9 + sx + R) * 0.03 * R;
        c.beginPath(); c.arc(sx * 0.29 * R, my + b, 0.06 * R, 0, TAU); c.fill();
        c.beginPath(); c.arc(sx * 0.22 * R, my + mh * 0.7 + b, 0.04 * R, 0, TAU); c.fill();
      }

      // Глаза: красные, светятся, смотрят на игрока
      const er = o.cub ? 0.14 * R : 0.11 * R;
      this.glow('#ff2030', 8);
      c.fillStyle = '#ff3040';
      for (const sx of [-1, 1]) { c.beginPath(); c.arc(sx * 0.36 * R, -0.14 * R, er, 0, TAU); c.fill(); }
      this.noGlow();
      c.fillStyle = '#ffffff';
      for (const sx of [-1, 1]) {
        c.beginPath(); c.arc(sx * 0.36 * R + look.x * er * 0.45, -0.14 * R + look.y * er * 0.45, er * 0.38, 0, TAU); c.fill();
      }
      // Злые брови
      if (!o.cub) {
        c.lineWidth = Math.max(2, R * 0.09);
        c.beginPath();
        for (const sx of [-1, 1]) { c.moveTo(sx * 0.6 * R, -0.42 * R); c.lineTo(sx * 0.14 * R, -0.24 * R); }
        c.stroke();
      }

      if (o.tuft) { // чубчик медведицы
        c.lineWidth = 2;
        c.beginPath();
        for (let k = -1; k <= 1; k++) { c.moveTo(k * 0.12 * R, -0.9 * R); c.lineTo(k * 0.22 * R, -1.15 * R); }
        c.stroke();
      }
      if (o.helmet) { // шлем танка
        c.strokeStyle = C.shield; c.lineWidth = 4;
        c.beginPath(); c.arc(0, 0.05 * R, R * 1.0, Math.PI * 1.13, Math.PI * 1.87); c.stroke();
        c.fillStyle = C.shield;
        for (let k = -1; k <= 1; k++) { c.beginPath(); c.arc(k * 0.42 * R, -0.86 * R + Math.abs(k) * 0.12 * R, 0.06 * R, 0, TAU); c.fill(); }
      }
      if (o.crown) { // корона короля-гризли
        this.glow('#ffd84a', 16);
        c.strokeStyle = '#ffd84a'; c.fillStyle = 'rgba(255,216,74,0.25)'; c.lineWidth = 3;
        c.beginPath();
        c.moveTo(-0.45 * R, -0.78 * R);
        c.lineTo(-0.5 * R, -1.3 * R); c.lineTo(-0.22 * R, -1.02 * R);
        c.lineTo(0, -1.42 * R); c.lineTo(0.22 * R, -1.02 * R);
        c.lineTo(0.5 * R, -1.3 * R); c.lineTo(0.45 * R, -0.78 * R);
        c.closePath(); c.fill(); c.stroke();
        this.noGlow();
      }
    }

    drawEnemy(e, p) {
      const c = this.ctx, t = this.time;
      const col = e.flash > 0 ? '#ffffff' : (e.type === 'boss' ? this.bossColor(e) : C[e.type]);
      const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
      const look = { x: dx / d, y: dy / d };
      // Бешеная дрожь: мелкие стремительные — сильнее
      const jit = e.type === 'chaser' || e.type === 'mini' ? 1.4 : 0.6;
      c.save();
      c.translate(e.x + rnd(-jit, jit), e.y + rnd(-jit, jit));

      if (e.type === 'boss') {
        this.drawBoss(e, col, look, this.gaitOf(e, look));
        c.restore();
        return;
      }
      if (e.type === 'tank') { // щит смотрит туда же, куда медведь
        c.save(); c.rotate(e.face);
        this.glow(C.shield, 18);
        c.strokeStyle = C.shield; c.lineWidth = 5;
        c.beginPath(); c.arc(0, 0, e.r + 9, -0.95, 0.95); c.stroke();
        c.restore();
      }
      // Тело ползёт по ходу движения, голова вынесена вперёд и смотрит на игрока
      const HR = e.r * HEAD[e.type] * 0.9;
      const st = this.gaitOf(e, look);
      const hx = Math.cos(st.ang) * 0.5 * HR, hy = Math.sin(st.ang) * 0.5 * HR;
      c.translate(hx, hy);
      c.save(); c.rotate(st.ang);
      this.bearBody(HR, col, st.ph, { cub: e.type === 'mini', armor: e.type === 'tank' });
      c.restore();
      c.rotate(NR.clamp(e.vx / 450, -0.3, 0.3));
      this.glow(col, 14);
      const chomp = 0.5 + 0.5 * Math.sin(t * 16 + e.id * 1.7);
      let mouthY = 0.55;
      switch (e.type) {
        case 'chaser': this.bear(HR, col, { mouth: chomp * 0.8, look }); break;
        case 'mini': this.bear(HR, col, { mouth: chomp * 0.6, look, cub: true }); break;
        case 'shooter': {
          const wind = e.fireT < 0.45 ? 1 - e.fireT / 0.45 : 0; // пасть раскрывается перед плевком
          this.bear(HR, col, { mouth: 0.15 + wind * 0.85, look });
          break;
        }
        case 'splitter': this.bear(HR, col, { mouth: chomp * 0.5, look, tuft: true }); break;
        case 'tank': this.bear(HR, col, { mouth: 0.3, look, helmet: true }); mouthY = 0.5; break;
      }
      c.restore();
      this.noGlow();

      // Пена капает с морды
      if (this.live && Math.random() < 0.03) {
        this.part(e.x + hx + rnd(-4, 4), e.y + hy + e.r * mouthY + 4, rnd(-10, 10), rnd(30, 70), 0.5, '#e8ffd0', 2, 'dot');
      }

      // Полоска здоровья у крепких врагов
      if ((e.type === 'tank' || e.type === 'splitter') && e.hp < e.maxHp) {
        const w = e.r * 2;
        c.fillStyle = 'rgba(255,255,255,0.15)';
        c.fillRect(e.x - w / 2, e.y + e.r + 12, w, 3);
        c.fillStyle = C[e.type];
        c.fillRect(e.x - w / 2, e.y + e.r + 12, w * Math.max(0, e.hp / e.maxHp), 3);
      }
    }

    bossColor(e) {
      return e.phase === 3 ? '#ff2299' : e.phase === 2 ? '#ff6633' : C.boss;
    }

    drawBoss(e, col, look, st) {
      const c = this.ctx, t = this.time;
      if (e.intro > 0) c.globalAlpha = 1 - e.intro / 2.2 * 0.7;
      const HR = e.r * HEAD.boss;
      c.translate(Math.cos(st.ang) * 0.5 * HR, Math.sin(st.ang) * 0.5 * HR);
      c.save(); c.rotate(st.ang);
      this.bearBody(HR, col, st.ph, { lw: 3 });
      c.restore();
      // Грива — вращающаяся звезда из клочьев шерсти вокруг головы
      this.glow(col, 28);
      c.strokeStyle = col; c.fillStyle = col + '22'; c.lineWidth = 3;
      c.beginPath();
      const n = 12, rot = t * (e.phase === 3 ? 1.2 : 0.4);
      for (let i = 0; i < n * 2; i++) {
        const r = i % 2 ? e.r * 0.85 : e.r * 1.12;
        const a = rot + (i / (n * 2)) * TAU;
        if (i === 0) c.moveTo(Math.cos(a) * r, Math.sin(a) * r); else c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      c.closePath(); c.fill(); c.stroke();
      // Голова
      const mouth = e.mode === 'tele' ? 1 : e.mode === 'charge' ? 0.9 : 0.4 + 0.25 * Math.sin(t * 6);
      this.glow(col, 24);
      this.bear(HR, col, { mouth, look, crown: true, lw: 3 });
      c.globalAlpha = 1;
    }

    drawPlayer(g, ui) {
      const c = this.ctx, p = g.player, s = g.stats, t = this.time;

      // Спутники
      if (s.orbs > 0) {
        this.glow(C.orb, 16);
        c.fillStyle = '#e6ffff';
        for (let o = 0; o < s.orbs; o++) {
          const a = p.orbA + (o / s.orbs) * TAU;
          c.beginPath(); c.arc(p.x + Math.cos(a) * 62, p.y + Math.sin(a) * 62, 7, 0, TAU); c.fill();
        }
        this.noGlow();
      }

      // След от рывка и выхлоп (только во время игры, не на паузе)
      if (!ui.paused && g.state === 'play') {
        if (p.dashT > 0) this.part(p.x, p.y, 0, 0, 0.25, C.player, 10, 'ghost');
        else if (Math.hypot(p.vx, p.vy) > 60 && Math.random() < 0.6) {
          const a = Math.atan2(p.vy, p.vx) + Math.PI + rnd(-0.4, 0.4);
          this.part(p.x + Math.cos(a) * 8, p.y + Math.sin(a) * 8, Math.cos(a) * 120, Math.sin(a) * 120, 0.3, '#3388ff', 2.5, 'dot');
        }
      }

      if (p.inv > 0 && Math.floor(t * 20) % 2) return;

      c.save();
      c.translate(p.x, p.y);
      if (p.shield) {
        this.glow(C.shield, 16);
        c.strokeStyle = 'rgba(190,255,255,0.7)'; c.lineWidth = 2;
        this.poly(6, 22, t); c.stroke();
      }
      c.rotate(p.aim);
      this.glow(C.player, 20);
      c.strokeStyle = C.player; c.fillStyle = 'rgba(51,255,255,0.18)'; c.lineWidth = 2.5;
      c.beginPath(); c.moveTo(17, 0); c.lineTo(-11, 10); c.lineTo(-5, 0); c.lineTo(-11, -10); c.closePath();
      c.fill(); c.stroke();
      c.fillStyle = '#ffffff';
      c.beginPath(); c.arc(0, 0, 3, 0, TAU); c.fill();
      c.restore();
      this.noGlow();

      // Перезарядка рывка — дуга под кораблём
      if (p.dashCd > 0) {
        c.strokeStyle = 'rgba(51,255,255,0.5)'; c.lineWidth = 2;
        c.beginPath(); c.arc(p.x, p.y, 28, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - p.dashCd / s.dashCd)); c.stroke();
      }
    }

    drawParticles() {
      const c = this.ctx;
      c.globalCompositeOperation = 'lighter';
      for (const p of this.parts.items) {
        const k = p.life / p.max;
        c.globalAlpha = k;
        if (p.kind === 'dot') {
          c.fillStyle = p.color;
          const sz = p.size * (0.5 + k * 0.5);
          c.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
        } else if (p.kind === 'line') {
          c.strokeStyle = p.color; c.lineWidth = p.size * 0.7;
          c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); c.stroke();
        } else if (p.kind === 'ring') {
          c.strokeStyle = p.color; c.lineWidth = 3 * k + 0.5;
          c.beginPath(); c.arc(p.x, p.y, p.vx * (1 - k) + 4, 0, TAU); c.stroke();
        } else if (p.kind === 'ghost') {
          c.globalAlpha = k * 0.5;
          c.fillStyle = p.color;
          c.beginPath(); c.arc(p.x, p.y, p.size, 0, TAU); c.fill();
        }
      }
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
    }

    drawFloats() {
      const c = this.ctx;
      for (const f of this.floats) {
        c.globalAlpha = Math.min(1, f.life / f.max * 2);
        this.text(f.text, f.x, f.y, f.size, f.color, 'center', 0);
      }
      c.globalAlpha = 1;
    }

    // ---------- HUD ----------
    drawHud(g, ui) {
      const c = this.ctx, p = g.player, s = g.stats;
      // Здоровье
      for (let i = 0; i < s.maxHp; i++) {
        const x = 34 + i * 30, y = 34, full = i < p.hp;
        c.save(); c.translate(x, y);
        this.poly(4, 11, 0);
        if (full) { this.glow(C.player, 14); c.fillStyle = C.player; c.fill(); }
        else { c.strokeStyle = 'rgba(51,255,255,0.35)'; c.lineWidth = 2; c.stroke(); }
        c.restore();
      }
      this.noGlow();
      let y2 = 64;
      if (s.shieldCd > 0) {
        const k = p.shield ? 1 : 1 - Math.max(0, p.shieldT) / s.shieldCd;
        this.text('ЩИТ', 22, y2, 13, p.shield ? C.shield : 'rgba(190,255,255,0.4)', 'left', p.shield ? 8 : 0);
        c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(82, y2 - 3, 58, 6);
        c.fillStyle = C.shield; c.fillRect(82, y2 - 3, 58 * k, 6);
        y2 += 20;
      }
      const dk = 1 - p.dashCd / s.dashCd;
      this.text('РЫВОК', 22, y2, 13, dk >= 1 ? C.player : 'rgba(51,255,255,0.4)', 'left', 0);
      c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(82, y2 - 3, 58, 6);
      c.fillStyle = C.player; c.fillRect(82, y2 - 3, 58 * dk, 6);

      // Центр: волна или босс
      if (g.boss) {
        const e = g.boss, w = 560, x = W / 2 - w / 2;
        this.text('КОРОЛЬ-ГРИЗЛИ', W / 2, 24, 16, C.boss, 'center', 10);
        c.fillStyle = 'rgba(255,255,255,0.1)'; c.fillRect(x, 40, w, 10);
        this.glow(C.boss, 12);
        c.fillStyle = this.bossColor(e); c.fillRect(x, 40, w * Math.max(0, e.hp / e.maxHp), 10);
        this.noGlow();
        c.fillStyle = 'rgba(255,255,255,0.5)';
        c.fillRect(x + w * 0.33, 38, 2, 14); c.fillRect(x + w * 0.66, 38, 2, 14);
      } else {
        const w = 280, x = W / 2 - w / 2;
        const left = g.waveT >= g.waveDef.dur && !g.waveDone;
        this.text(`ВОЛНА ${g.wave} / ${NR.WAVES.length}`, W / 2, 24, 16, '#c9a8ff', 'center', 8);
        c.fillStyle = 'rgba(255,255,255,0.1)'; c.fillRect(x, 40, w, 6);
        c.fillStyle = '#a07aff'; c.fillRect(x, 40, w * g.waveProgress(), 6);
        if (left) this.text(`Добейте врагов: ${g.enemies.length + g.spawns.length}`, W / 2, 62, 13, '#ffffff', 'center', 0, 500);
      }

      // Справа: время и убийства
      this.text(fmtTime(g.time), W - 22, 26, 20, '#ffffff', 'right', 6);
      this.text(`убито: ${g.kills}`, W - 22, 50, 13, 'rgba(255,255,255,0.7)', 'right', 0, 500);
      if (ui.muted) this.text('звук выкл (M)', W - 22, 70, 12, 'rgba(255,255,255,0.4)', 'right', 0, 500);

      // Внизу слева: полученные улучшения
      let ux = 18;
      const counts = {};
      for (const id of g.taken) counts[id] = (counts[id] || 0) + 1;
      c.font = `600 12px ${FONT}`;
      for (const id in counts) {
        const u = NR.UPGRADES.find(x => x.id === id);
        const label = u.name + (counts[id] > 1 ? ' ' + ROMAN[counts[id]] : '');
        const tw = c.measureText(label).width + 16;
        c.strokeStyle = 'rgba(160,122,255,0.5)'; c.lineWidth = 1;
        c.strokeRect(ux, H - 32, tw, 20);
        this.text(label, ux + tw / 2, H - 22, 12, 'rgba(220,200,255,0.85)', 'center', 0, 600);
        ux += tw + 6;
      }
    }

    drawBanner() {
      const b = this.banner;
      if (!b) return;
      const k = b.life / b.max, c = this.ctx;
      const a = Math.min(1, (1 - k) * 6, k * 3);
      c.globalAlpha = a;
      const sc = 1 + (1 - Math.min(1, (1 - k) * 5)) * 0.3;
      c.save(); c.translate(W / 2, H * 0.32); c.scale(sc, sc);
      this.text(b.text, 0, 0, 56, b.color, 'center', 24, 800);
      if (b.sub) this.text(b.sub, 0, 44, 18, 'rgba(255,255,255,0.75)', 'center', 0, 500);
      c.restore();
      c.globalAlpha = 1;
    }

    cardRects() {
      const w = 300, h = 210, gap = 30, x0 = W / 2 - (w * 3 + gap * 2) / 2, y = H / 2 - h / 2 + 20;
      return [0, 1, 2].map(i => ({ x: x0 + i * (w + gap), y, w, h }));
    }

    cardAt(x, y) {
      const rs = this.cardRects();
      for (let i = 0; i < rs.length; i++) {
        const r = rs[i];
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
      }
      return -1;
    }

    drawUpgrades(g, ui) {
      const c = this.ctx;
      c.fillStyle = 'rgba(5,2,15,0.72)';
      c.fillRect(0, 0, W, H);
      this.text('ВЫБЕРИТЕ УЛУЧШЕНИЕ', W / 2, H / 2 - 150, 34, '#ffffff', 'center', 18, 800);
      this.text(`перед волной ${g.wave + 1 > NR.WAVES.length ? 'с боссом' : g.wave + 1}`, W / 2, H / 2 - 115, 15, 'rgba(255,255,255,0.6)', 'center', 0, 500);
      const rs = this.cardRects();
      (g.choices || []).forEach((u, i) => {
        const r = rs[i], hov = ui.hover === i;
        const lift = hov ? -6 : 0;
        c.save(); c.translate(0, lift);
        c.fillStyle = hov ? 'rgba(120,80,255,0.22)' : 'rgba(60,40,140,0.25)';
        c.fillRect(r.x, r.y, r.w, r.h);
        if (hov) this.glow('#a07aff', 22);
        c.strokeStyle = hov ? '#d6c4ff' : '#7a4dff'; c.lineWidth = hov ? 2.5 : 1.5;
        c.strokeRect(r.x, r.y, r.w, r.h);
        this.noGlow();
        this.text(String(i + 1), r.x + 22, r.y + 24, 16, 'rgba(255,255,255,0.45)', 'center', 0);
        this.text(u.name, r.x + r.w / 2, r.y + 52, 22, '#ffffff', 'center', hov ? 10 : 0, 800);
        const lines = this.wrap(u.desc, r.w - 40, 15);
        lines.forEach((ln, j) => this.text(ln, r.x + r.w / 2, r.y + 96 + j * 22, 15, 'rgba(230,220,255,0.85)', 'center', 0, 500));
        // уровни
        const pw = 16, total = u.max * pw + (u.max - 1) * 6, px = r.x + r.w / 2 - total / 2;
        for (let k = 0; k < u.max; k++) {
          c.fillStyle = k < u.lvl ? '#a07aff' : k === u.lvl ? '#ffffff' : 'rgba(255,255,255,0.15)';
          c.fillRect(px + k * (pw + 6), r.y + r.h - 28, pw, 6);
        }
        c.restore();
      });
      this.text(ui.touch ? 'коснитесь карточки' : 'клик по карточке или клавиши 1 / 2 / 3', W / 2, H / 2 + 160, 14, 'rgba(255,255,255,0.5)', 'center', 0, 500);
    }

    drawPause(ui) {
      const c = this.ctx;
      c.fillStyle = 'rgba(5,2,15,0.7)';
      c.fillRect(0, 0, W, H);
      if (ui.touch) {
        this.text('ПАУЗА', W / 2, H / 2 - 90, 56, '#ffffff', 'center', 20, 800);
        this.drawButtons(this.pauseButtons(), { sound: ui.muted ? 'ЗВУК: ВЫКЛ' : 'ЗВУК: ВКЛ' });
        return;
      }
      this.text('ПАУЗА', W / 2, H / 2 - 30, 56, '#ffffff', 'center', 20, 800);
      this.text('Esc — продолжить   ·   M — звук   ·   Q — в меню', W / 2, H / 2 + 30, 16, 'rgba(255,255,255,0.7)', 'center', 0, 500);
    }

    // ---------- Экранные кнопки (сенсорный режим), мировые координаты ----------
    pauseButtons() {
      const w = 300, h = 64, x = W / 2 - w / 2;
      return [
        { id: 'resume', label: 'ПРОДОЛЖИТЬ', x, y: H / 2 - 30, w, h, main: true },
        { id: 'sound', label: 'ЗВУК', x, y: H / 2 + 50, w, h },
        { id: 'menu', label: 'В МЕНЮ', x, y: H / 2 + 130, w, h },
      ];
    }

    endButtons() {
      const w = 240, h = 64, gap = 30, y = H / 2 + 175;
      return [
        { id: 'again', label: 'ЕЩЁ РАЗ', x: W / 2 - w - gap / 2, y, w, h, main: true },
        { id: 'menu', label: 'В МЕНЮ', x: W / 2 + gap / 2, y, w, h },
      ];
    }

    buttonAt(list, x, y) {
      const pad = 10; // палец толще курсора
      for (const b of list) {
        if (x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad) return b.id;
      }
      return null;
    }

    drawButtons(list, labels) {
      const c = this.ctx;
      for (const b of list) {
        const col = b.main ? C.player : '#a07aff';
        c.fillStyle = b.main ? 'rgba(51,255,255,0.12)' : 'rgba(120,80,255,0.16)';
        c.fillRect(b.x, b.y, b.w, b.h);
        this.glow(col, b.main ? 18 : 10);
        c.strokeStyle = col; c.lineWidth = 2;
        c.strokeRect(b.x, b.y, b.w, b.h);
        this.noGlow();
        this.text((labels && labels[b.id]) || b.label, b.x + b.w / 2, b.y + b.h / 2 + 1, 24, '#ffffff', 'center', b.main ? 10 : 0, 800);
      }
    }

    // Стики и кнопки поверх всего, в CSS-пикселях экрана
    drawTouch(g, ui) {
      const T = ui.touch, c = this.ctx, d = this.dpr, TAU2 = Math.PI * 2;
      if (ui.scene !== 'game' || !g || ui.paused || g.state !== 'play') return;
      c.setTransform(d, 0, 0, d, 0, 0);
      c.globalAlpha = 1;
      const ring = (x, y, r, col, a, lw) => {
        c.globalAlpha = a; c.strokeStyle = col; c.lineWidth = lw || 2;
        c.beginPath(); c.arc(x, y, r, 0, TAU2); c.stroke();
      };
      const disc = (x, y, r, col, a) => {
        c.globalAlpha = a; c.fillStyle = col;
        c.beginPath(); c.arc(x, y, r, 0, TAU2); c.fill();
      };
      const R0 = NR.Touch.STICK_R;
      c.shadowColor = C.player; c.shadowBlur = 10 * d;
      // Стики: активный — где палец, иначе бледная подсказка
      for (const [s, home, col] of [[T.move, T.homeMove, C.player], [T.aim, T.homeAim, '#ff66cc']]) {
        c.shadowColor = col;
        if (s) {
          const dx = s.x - s.bx, dy = s.y - s.by, l = Math.hypot(dx, dy), k = l > R0 ? R0 / l : 1;
          ring(s.bx, s.by, R0, col, 0.55, 2);
          disc(s.bx + dx * k, s.by + dy * k, 24, col, 0.45);
        } else {
          ring(home.x, home.y, R0, col, 0.16, 2);
          disc(home.x, home.y, 20, col, 0.1);
        }
      }
      // Рывок с индикатором перезарядки
      const p = g.player, st = g.stats, db = T.dashBtn;
      const ready = p.dashCd <= 0, k = 1 - p.dashCd / st.dashCd;
      c.shadowColor = C.player;
      disc(db.x, db.y, db.r, ready ? 'rgba(51,255,255,1)' : 'rgba(51,255,255,1)', T.dashFlash > 0 ? 0.45 : ready ? 0.2 : 0.06);
      ring(db.x, db.y, db.r, C.player, ready ? 0.8 : 0.25, 2);
      if (!ready) {
        c.globalAlpha = 0.8; c.strokeStyle = C.player; c.lineWidth = 4;
        c.beginPath(); c.arc(db.x, db.y, db.r - 5, -Math.PI / 2, -Math.PI / 2 + TAU2 * k); c.stroke();
      }
      c.shadowBlur = 0;
      c.globalAlpha = ready ? 0.95 : 0.4;
      c.fillStyle = '#ffffff';
      c.font = `800 13px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('РЫВОК', db.x, db.y);
      // Пауза
      const pb = T.pauseBtn;
      ring(pb.x, pb.y, pb.r, '#ffffff', 0.45, 2);
      c.globalAlpha = 0.6; c.fillStyle = '#ffffff';
      c.fillRect(pb.x - 7, pb.y - 9, 5, 18); c.fillRect(pb.x + 2, pb.y - 9, 5, 18);
      c.globalAlpha = 1;
    }

    drawEnd(g, ui, win) {
      const c = this.ctx;
      const a = Math.min(1, (ui.endT - (win ? 0.3 : 1.2)) * 2);
      c.globalAlpha = a;
      c.fillStyle = 'rgba(5,2,15,0.78)';
      c.fillRect(0, 0, W, H);
      const col = win ? '#66ffcc' : '#ff3366';
      this.text(win ? 'РАЗЛОМ ЗАКРЫТ' : 'ВАС ЗАГРЫЗЛИ', W / 2, H / 2 - 120, 60, col, 'center', 26, 800);
      this.text(win ? 'Король-гризли повержен. Победа!' : `Вы продержались до волны ${g.wave > NR.WAVES.length ? 'с боссом' : g.wave}`, W / 2, H / 2 - 66, 18, 'rgba(255,255,255,0.8)', 'center', 0, 500);
      const rows = [
        ['Время', fmtTime(g.time)],
        ['Убито врагов', String(g.kills)],
        ['Получено ударов', String(g.hitsTaken)],
        ['Улучшений', String(g.taken.length)],
      ];
      rows.forEach((r, i) => {
        this.text(r[0], W / 2 - 20, H / 2 - 10 + i * 30, 17, 'rgba(255,255,255,0.6)', 'right', 0, 500);
        this.text(r[1], W / 2 + 20, H / 2 - 10 + i * 30, 17, '#ffffff', 'left', 0, 700);
      });
      const b = ui.best || {};
      let rec = '';
      if (b.bestTime) rec = `Лучшая победа: ${fmtTime(b.bestTime)}   ·   побед: ${b.wins || 0}`;
      else if (b.bestWave) rec = `Рекорд: волна ${b.bestWave > NR.WAVES.length ? 'с боссом' : b.bestWave}`;
      if (ui.newRecord) this.text('НОВЫЙ РЕКОРД!', W / 2, H / 2 + 120, 20, '#ffff66', 'center', 14, 800);
      if (rec) this.text(rec, W / 2, H / 2 + 150, 14, 'rgba(255,255,255,0.55)', 'center', 0, 500);
      if (ui.touch) {
        if (ui.endT > 1.5) this.drawButtons(this.endButtons());
      } else if (Math.floor(this.time * 2) % 2 === 0) this.text('Enter или клик — ещё раз   ·   Q — в меню', W / 2, H / 2 + 200, 17, '#ffffff', 'center', 8, 600);
      c.globalAlpha = 1;
    }

    drawMenu(ui) {
      const c = this.ctx, t = this.time;
      // Декоративные фигуры
      const shapes = ['chaser', 'shooter', 'splitter', 'tank'];
      for (let i = 0; i < 12; i++) {
        const type = shapes[i % 4];
        const x = (i * 211 + t * (20 + i * 3)) % (W + 100) - 50;
        const y = 90 + ((i * 137) % (H - 180));
        c.save(); c.translate(x, y);
        c.rotate(Math.sin(t * 2 + i) * 0.2);
        c.globalAlpha = 0.22;
        const R = 14 + (i % 3) * 5;
        this.bearBody(R, C[type], t * 6 + i, { armor: type === 'tank' });
        this.glow(C[type], 12);
        this.bear(R, C[type], { mouth: 0.5 + 0.5 * Math.sin(t * 10 + i), tuft: type === 'splitter', helmet: type === 'tank' });
        c.restore();
      }
      this.noGlow();
      c.globalAlpha = 1;
      if (Math.random() < 0.3) this.part(rnd(0, W), H + 5, 0, -rnd(30, 90), 4, Math.random() < 0.5 ? C.player : '#a07aff', 2, 'dot');

      const flick = Math.random() < 0.03 ? 0.5 : 1;
      c.globalAlpha = flick;
      this.text('NEON RIFT', W / 2, 170, 96, C.player, 'center', 36, 900);
      c.globalAlpha = 1;
      this.text('бешеные плюющиеся медведи  ·  8 волн и король-гризли  ·  около 5 минут', W / 2, 235, 18, 'rgba(220,200,255,0.8)', 'center', 0, 500);

      const ctrl = ui.touch ? [
        ['Левый палец', 'движение (стик появляется под пальцем)'],
        ['Правый палец', 'прицел (огонь автоматический)'],
        ['РЫВОК', 'неуязвимость на миг'],
        ['II', 'пауза, звук, выход в меню'],
      ] : [
        ['WASD / стрелки', 'движение'],
        ['Мышь', 'прицел (огонь автоматический)'],
        ['Пробел / Shift / ПКМ', 'рывок — неуязвимость на миг'],
        ['Esc', 'пауза'],
        ['M', 'звук вкл/выкл'],
      ];
      ctrl.forEach((r, i) => {
        this.text(r[0], W / 2 - 16, 310 + i * 30, 17, C.player, 'right', 0, 700);
        this.text(r[1], W / 2 + 16, 310 + i * 30, 17, 'rgba(255,255,255,0.8)', 'left', 0, 500);
      });
      this.text('Совет: щит медведя в шлеме гасит урон спереди — заходите сбоку. Медведица распадается на медвежат.', W / 2, 480, 14, 'rgba(255,255,255,0.5)', 'center', 0, 500);

      const b = ui.best || {};
      if (b.bestTime) this.text(`Лучшая победа: ${fmtTime(b.bestTime)}  ·  побед: ${b.wins || 0}`, W / 2, 520, 15, '#ffff99', 'center', 0, 600);
      else if (b.bestWave) this.text(`Рекорд: волна ${b.bestWave > NR.WAVES.length ? 'с боссом' : b.bestWave}`, W / 2, 520, 15, '#ffff99', 'center', 0, 600);

      const pulse = 0.6 + Math.sin(t * 4) * 0.4;
      c.globalAlpha = pulse;
      this.text(ui.touch ? 'КОСНИТЕСЬ, ЧТОБЫ НАЧАТЬ' : 'КЛИК ИЛИ ENTER — НАЧАТЬ', W / 2, 590, 24, '#ffffff', 'center', 16, 800);
      c.globalAlpha = 1;
    }

    drawCursor(ui) {
      if (!ui.mouse) return;
      const c = this.ctx, m = ui.mouse;
      c.setTransform(this.scale, 0, 0, this.scale, this.ox, this.oy);
      this.glow(C.player, 8);
      c.strokeStyle = '#ffffff'; c.lineWidth = 1.5;
      c.beginPath();
      c.arc(m.x, m.y, 9, 0, TAU);
      c.moveTo(m.x - 15, m.y); c.lineTo(m.x - 5, m.y);
      c.moveTo(m.x + 5, m.y); c.lineTo(m.x + 15, m.y);
      c.moveTo(m.x, m.y - 15); c.lineTo(m.x, m.y - 5);
      c.moveTo(m.x, m.y + 5); c.lineTo(m.x, m.y + 15);
      c.stroke();
      this.noGlow();
    }
  }

  function fmtTime(s) {
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  }

  NR.Renderer = Renderer;
  NR.fmtTime = fmtTime;
})();
