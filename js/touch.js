// Сенсорное управление: два плавающих стика, кнопки рывка и паузы, тапы по меню.
// Все координаты здесь — CSS-пиксели экрана (clientX/clientY).
var NR = globalThis.NR = globalThis.NR || {};

(function () {
  const STICK_R = 56;     // радиус хода стика
  const DEAD = 0.12;      // мёртвая зона
  const TAP_SLOP = 24;    // насколько палец может сдвинуться, чтобы это остался тап

  class Touch {
    // h: { playing(): bool, tap(x, y), dash(), pause() }
    constructor(canvas, h) {
      this.h = h;
      // телефон/планшет — сразу сенсорный режим; иначе включится первым касанием
      this.enabled = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
      this.lastTouch = -1e9;  // время последнего касания — чтобы гасить эмулированные мышиные события
      this.move = null;       // { id, bx, by, x, y }
      this.aim = null;
      this.aimDir = null;     // последнее направление прицела { x, y }
      this.taps = new Map();  // id → { x, y, ok }
      this.dashFlash = 0;
      this.layout();

      const opt = { passive: false };
      canvas.addEventListener('pointerdown', e => this.down(e), opt);
      canvas.addEventListener('pointermove', e => this.moveEv(e), opt);
      canvas.addEventListener('pointerup', e => this.up(e, true), opt);
      canvas.addEventListener('pointercancel', e => this.up(e, false), opt);
      addEventListener('resize', () => this.layout());
    }

    // Недавно было касание — мышиные события игнорируем (браузер шлёт их вдогонку за тапом)
    recent() { return performance.now() - this.lastTouch < 1000; }

    layout() {
      // Отступы безопасной зоны (вырез iPhone); без NR.safe — нули
      const sa = NR.safe || { l: 0, r: 0, t: 0, b: 0 };
      const w = innerWidth - sa.l - sa.r, h = innerHeight - sa.t - sa.b;
      const x0 = sa.l, y0 = sa.t;
      const m = Math.max(16, Math.min(w, h) * 0.05);
      this.pauseBtn = { x: x0 + w - m - 22, y: y0 + m + 22, r: 22 };
      this.dashBtn = { x: x0 + w - m - 44, y: y0 + Math.max(h * 0.42, m + 120), r: 40 };
      this.homeMove = { x: x0 + m + STICK_R + 20, y: y0 + h - m - STICK_R - 10 };
      this.homeAim = { x: x0 + w - m - STICK_R - 90, y: y0 + h - m - STICK_R - 10 };
    }

    static hit(b, x, y, extra) { return Math.hypot(x - b.x, y - b.y) <= b.r + (extra || 0); }

    down(e) {
      if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
      e.preventDefault();
      this.enabled = true;
      this.lastTouch = performance.now();
      const x = e.clientX, y = e.clientY, id = e.pointerId;
      try { e.target.setPointerCapture(id); } catch (err) { /* не критично */ }

      if (!this.h.playing()) {
        this.taps.set(id, { x, y, ok: true });
        return;
      }
      if (Touch.hit(this.pauseBtn, x, y, 14)) { this.h.pause(); return; }
      if (Touch.hit(this.dashBtn, x, y, 14)) { this.h.dash(); this.dashFlash = 0.2; return; }
      if (x < innerWidth / 2) {
        if (!this.move) this.move = { id, bx: x, by: y, x, y };
      } else if (!this.aim) {
        this.aim = { id, bx: x, by: y, x, y };
      }
    }

    moveEv(e) {
      if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
      e.preventDefault();
      this.lastTouch = performance.now();
      const id = e.pointerId, x = e.clientX, y = e.clientY;
      for (const s of [this.move, this.aim]) {
        if (!s || s.id !== id) continue;
        s.x = x; s.y = y;
        // База «подтягивается» за пальцем, если он ушёл дальше радиуса
        const dx = x - s.bx, dy = y - s.by, d = Math.hypot(dx, dy);
        if (d > STICK_R) { s.bx = x - dx / d * STICK_R; s.by = y - dy / d * STICK_R; }
        if (s === this.aim && d > 8) this.aimDir = { x: dx / d, y: dy / d };
      }
      const t = this.taps.get(id);
      if (t && Math.hypot(x - t.x, y - t.y) > TAP_SLOP) t.ok = false;
    }

    up(e, fire) {
      if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
      e.preventDefault();
      this.lastTouch = performance.now();
      const id = e.pointerId;
      if (this.move && this.move.id === id) this.move = null;
      if (this.aim && this.aim.id === id) this.aim = null;
      const t = this.taps.get(id);
      this.taps.delete(id);
      if (fire && t && t.ok) this.h.tap(t.x, t.y);
    }

    // Сброс при паузе/смене сцены
    release() {
      this.move = this.aim = null;
      this.taps.clear();
    }

    // Вектор движения в круге радиуса 1
    moveVec() {
      const s = this.move;
      if (!s) return { x: 0, y: 0 };
      let x = (s.x - s.bx) / STICK_R, y = (s.y - s.by) / STICK_R;
      const l = Math.hypot(x, y);
      if (l < DEAD) return { x: 0, y: 0 };
      const k = Math.min(1, (l - DEAD) / (1 - DEAD) * 1.15) / l; // немного «догоняем» до полного хода
      return { x: x * k, y: y * k };
    }

    update(dt) { this.dashFlash = Math.max(0, this.dashFlash - dt); }
  }

  Touch.STICK_R = STICK_R;
  NR.Touch = Touch;
})();
