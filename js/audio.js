// Звук целиком синтезируется через WebAudio — без файлов.
var NR = globalThis.NR = globalThis.NR || {};

(function () {
  const A1 = 55; // ля контроктавы
  const hz = semi => A1 * Math.pow(2, semi / 12);

  class Audio {
    constructor() {
      this.ctx = null;
      this.muted = false;
      this.intensity = 0; // 0 — меню, 1 — бой, 2 — босс
      this.last = {};
      try { this.muted = localStorage.getItem('neonrift.muted') === '1'; } catch (e) { /* нет доступа */ }
    }

    init() {
      if (this.ctx) {
        if (this.ctx.state !== 'running') this.ctx.resume(); // suspended или interrupted (iOS)
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = this.ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 6;
      comp.connect(ctx.destination);
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(comp);
      this.sfx = ctx.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
      this.mus = ctx.createGain(); this.mus.gain.value = 0.3; this.mus.connect(this.master);

      const len = ctx.sampleRate;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

      this.step = 0;
      this.nextT = ctx.currentTime + 0.1;
      this.timer = setInterval(() => this.schedule(), 25);
    }

    toggleMute() {
      this.muted = !this.muted;
      try { localStorage.setItem('neonrift.muted', this.muted ? '1' : '0'); } catch (e) { /* нет доступа */ }
      if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.55, this.ctx.currentTime, 0.02);
    }

    setPaused(p) {
      if (!this.ctx) return;
      if (p) this.ctx.suspend(); else this.ctx.resume();
    }

    setIntensity(n) { this.intensity = n; }

    throttle(key, ms) {
      const now = performance.now();
      if (this.last[key] && now - this.last[key] < ms) return true;
      this.last[key] = now;
      return false;
    }

    tone(f, dur, o) {
      o = o || {};
      const ctx = this.ctx, t = o.t || ctx.currentTime;
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = o.type || 'square';
      osc.frequency.setValueAtTime(f, t);
      if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t + dur);
      const vol = o.vol || 0.2, att = o.attack || 0.005;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + att);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let node = osc;
      if (o.lp) {
        const f2 = ctx.createBiquadFilter();
        f2.type = 'lowpass'; f2.frequency.value = o.lp;
        osc.connect(f2); node = f2;
      }
      node.connect(g); g.connect(o.dest || this.sfx);
      osc.start(t); osc.stop(t + dur + 0.05);
    }

    noise(dur, o) {
      o = o || {};
      const ctx = this.ctx, t = o.t || ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = o.ftype || 'lowpass';
      f.frequency.setValueAtTime(o.freq || 2000, t);
      if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, t + dur);
      f.Q.value = o.q || 0.8;
      const g = ctx.createGain();
      g.gain.setValueAtTime(o.vol || 0.2, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(o.dest || this.sfx);
      src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
    }

    // Рык: пила с быстрым вибрато через узкий фильтр
    growl(dur, vol, base) {
      const ctx = this.ctx, t = ctx.currentTime;
      const osc = ctx.createOscillator(), lfo = ctx.createOscillator();
      const lg = ctx.createGain(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(base, t);
      osc.frequency.linearRampToValueAtTime(base * 0.7, t + dur);
      lfo.frequency.value = 26 + Math.random() * 8;
      lg.gain.value = base * 0.35;
      lfo.connect(lg); lg.connect(osc.frequency);
      f.type = 'lowpass'; f.frequency.value = 650; f.Q.value = 5;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(f); f.connect(g); g.connect(this.sfx);
      osc.start(t); lfo.start(t);
      osc.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
    }

    arp(freqs, gap, o) {
      const t0 = this.ctx.currentTime;
      freqs.forEach((f, i) => this.tone(f, o.dur || 0.15, Object.assign({}, o, { t: t0 + i * gap })));
    }

    play(ev) {
      if (!this.ctx || this.muted) return;
      switch (ev.t) {
        case 'shoot':
          if (this.throttle('shoot', 65)) return;
          this.tone(900 + Math.random() * 80, 0.05, { type: 'square', vol: 0.025, slide: 450 });
          break;
        case 'hit':
          if (this.throttle('hit', 35)) return;
          this.tone(ev.crit ? 520 : 240, 0.05, { type: 'triangle', vol: ev.crit ? 0.1 : 0.05, slide: 120 });
          break;
        case 'deflect':
          if (this.throttle('deflect', 50)) return;
          this.tone(1800, 0.04, { type: 'square', vol: 0.03, slide: 1200 });
          break;
        case 'kill': {
          if (ev.type !== 'boss' && this.throttle('kill', 40)) return;
          const big = ev.r > 15;
          this.noise(big ? 0.35 : 0.18, { vol: big ? 0.3 : 0.18, freq: 2600, freqEnd: 200 });
          this.tone(big ? 120 : 180, big ? 0.3 : 0.14, { type: 'sawtooth', vol: 0.07, slide: 40, lp: 1200 });
          break;
        }
        case 'eshoot':
          if (this.throttle('eshoot', 80)) return;
          // «Тьфу!»: влажный шлепок шума и короткий низкий тон
          this.noise(0.1, { vol: 0.1, ftype: 'bandpass', freq: 1600, freqEnd: 450, q: 1.5 });
          this.tone(170, 0.07, { type: 'square', vol: 0.03, slide: 80, lp: 900 });
          break;
        case 'spawn':
          if (this.throttle('spawn', 450)) return;
          this.growl(0.35, 0.06, 95 + Math.random() * 40);
          break;
        case 'dash':
          this.noise(0.18, { vol: 0.12, ftype: 'bandpass', freq: 500, freqEnd: 3500, q: 2 });
          break;
        case 'nova':
          this.tone(300, 0.3, { type: 'sawtooth', vol: 0.07, slide: 1500, lp: 3000 });
          break;
        case 'hurt':
          this.tone(320, 0.4, { type: 'sawtooth', vol: 0.22, slide: 50, lp: 1800 });
          this.noise(0.3, { vol: 0.25, freq: 1500, freqEnd: 100 });
          break;
        case 'shieldbreak':
          this.tone(1300, 0.3, { type: 'triangle', vol: 0.15, slide: 250 });
          break;
        case 'shieldup':
          this.tone(600, 0.15, { type: 'sine', vol: 0.08, slide: 1200 });
          break;
        case 'heal':
          this.arp([784, 988, 1319], 0.06, { type: 'triangle', vol: 0.09, dur: 0.12 });
          break;
        case 'ricochet':
          if (this.throttle('rico', 60)) return;
          this.tone(1400, 0.04, { type: 'triangle', vol: 0.03 });
          break;
        case 'wave':
          this.arp([440, 554, 659], 0.09, { type: 'square', vol: 0.06, dur: 0.14, lp: 2500 });
          break;
        case 'waveclear':
          this.arp([523, 659, 784, 1047], 0.08, { type: 'square', vol: 0.07, dur: 0.18, lp: 3000 });
          break;
        case 'offer':
          this.tone(880, 0.25, { type: 'sine', vol: 0.06 });
          break;
        case 'upgrade':
          this.tone(660, 0.25, { type: 'triangle', vol: 0.12, slide: 1320 });
          break;
        case 'boss':
          this.tone(55, 2.2, { type: 'sawtooth', vol: 0.2, lp: 400, attack: 0.3 });
          this.growl(2.0, 0.35, 75);
          this.noise(2.0, { vol: 0.2, freq: 300, freqEnd: 60 });
          this.setIntensity(2);
          break;
        case 'bossphase':
          this.growl(1.0, 0.32, 85);
          this.noise(0.6, { vol: 0.25, freq: 900, freqEnd: 80 });
          break;
        case 'chargewarn':
          this.growl(0.85, 0.22, 120);
          break;
        case 'slam':
          this.noise(0.6, { vol: 0.4, freq: 900, freqEnd: 50 });
          this.tone(75, 0.45, { type: 'sine', vol: 0.4, slide: 30 });
          break;
        case 'burst':
          this.tone(260, 0.2, { type: 'square', vol: 0.06, slide: 130, lp: 1500 });
          break;
        case 'bossdead':
          this.noise(2.5, { vol: 0.5, freq: 3000, freqEnd: 40 });
          this.tone(220, 2.0, { type: 'sawtooth', vol: 0.2, slide: 30, lp: 1500 });
          this.setIntensity(1);
          break;
        case 'death':
          this.noise(1.5, { vol: 0.4, freq: 2000, freqEnd: 40 });
          this.tone(440, 1.4, { type: 'sawtooth', vol: 0.18, slide: 40, lp: 1500 });
          this.setIntensity(0);
          break;
        case 'win':
          this.arp([523, 659, 784, 1047, 1319, 1568], 0.11, { type: 'square', vol: 0.08, dur: 0.3, lp: 3500 });
          this.setIntensity(0);
          break;
      }
    }

    // ---------- Музыка: простой секвенсор с упреждением ----------
    schedule() {
      const ctx = this.ctx;
      if (!ctx || ctx.state !== 'running') return;
      const bpm = this.intensity === 2 ? 140 : 124;
      const stepDur = 60 / bpm / 4;
      if (this.nextT < ctx.currentTime - 0.2) this.nextT = ctx.currentTime + 0.05; // после паузы
      while (this.nextT < ctx.currentTime + 0.12) {
        this.playStep(this.step, this.nextT, stepDur);
        this.nextT += stepDur;
        this.step = (this.step + 1) % 64;
      }
    }

    playStep(step, t, sd) {
      const out = this.mus, lvl = this.intensity;
      const bar = Math.floor(step / 16), s = step % 16;
      const roots = [0, -4, 3, -2]; // Am – F – C – G
      const root = roots[bar];
      const third = bar === 0 ? 3 : 4; // Am — минор, остальные — мажор
      // Бас
      if (s % 2 === 0) {
        const oct = (s === 6 || s === 14) ? 12 : 0;
        this.tone(hz(root + 12 + oct), sd * 1.6, { t, type: 'sawtooth', vol: lvl ? 0.16 : 0.1, lp: lvl ? 900 : 500, dest: out });
      }
      // Пэд в меню
      if (lvl === 0 && s === 0) {
        [0, third, 7].forEach(iv => this.tone(hz(root + 36 + iv), sd * 15, { t, type: 'triangle', vol: 0.04, attack: 0.4, dest: out }));
      }
      if (lvl >= 1) {
        if (s % 4 === 0) this.tone(130, 0.18, { t, type: 'sine', vol: 0.45, slide: 38, dest: out });              // бочка
        if (s % 4 === 2) this.noise(0.04, { t, vol: 0.06, ftype: 'highpass', freq: 7000, dest: out });           // хэт
        if (s === 4 || s === 12) this.noise(0.15, { t, vol: 0.14, ftype: 'bandpass', freq: 1800, q: 1, dest: out }); // снейр
      }
      if (lvl === 2) {
        const chord = [0, third, 7, 12];
        const iv = chord[s % 4] + (s >= 8 ? 12 : 0);
        this.tone(hz(root + 36 + iv), sd * 0.9, { t, type: 'square', vol: 0.035, lp: 3000, dest: out });
      }
    }
  }

  NR.Audio = Audio;
})();
