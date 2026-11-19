// Особенности iOS Safari / PWA: безопасная зона, разблокировка звука, запрет зума.
// Подключается до render.js/touch.js/main.js. На других платформах ничего не ломает:
// отступы будут нулевыми, а обработчики — пустой работой.
var NR = globalThis.NR = globalThis.NR || {};

(function () {
  // ---------- Безопасная зона: env(safe-area-inset-*) → NR.safe в CSS-пикселях ----------
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
    'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(probe);

  function readSafe() {
    const cs = getComputedStyle(probe);
    const px = v => parseFloat(v) || 0;
    // Сверху в ландшафте отступа нет, снизу — home-индикатор: берём половину, чтобы не терять площадь
    NR.safe = {
      l: px(cs.paddingLeft), r: px(cs.paddingRight),
      t: px(cs.paddingTop), b: Math.round(px(cs.paddingBottom) * 0.5),
    };
  }
  readSafe();
  // Этот обработчик зарегистрирован раньше, чем в render/touch/main, поэтому отступы уже свежие
  addEventListener('resize', readSafe);
  // После поворота iOS иногда отдаёт новые размеры с задержкой — пересчитаем ещё раз
  addEventListener('orientationchange', () => {
    setTimeout(() => { readSafe(); dispatchEvent(new Event('resize')); }, 350);
  });

  // ---------- Звук: AudioContext на iOS запускается только из жеста ----------
  // Перехватываем создание контекста, чтобы «будить» его на касании, если iOS его прервал
  // (звонок, сворачивание, Siri). Контекст, поставленный на паузу самой игрой, не трогаем.
  const AC = window.AudioContext || window.webkitAudioContext;
  const contexts = [];
  if (AC) {
    const Wrapped = function (opts) {
      const ctx = new AC(opts);
      ctx.__nrRan = false;
      const mark = () => { if (ctx.state === 'running') ctx.__nrRan = true; };
      ctx.addEventListener('statechange', mark);
      mark();
      contexts.push(ctx);
      return ctx;
    };
    Wrapped.prototype = AC.prototype;
    window.AudioContext = Wrapped;
    if (window.webkitAudioContext) window.webkitAudioContext = Wrapped;
  }
  function unlock() {
    for (const ctx of contexts) {
      if (ctx.state === 'interrupted' || (!ctx.__nrRan && ctx.state !== 'running' && ctx.state !== 'closed')) {
        try { ctx.resume(); } catch (e) { /* не критично */ }
      }
    }
  }
  addEventListener('touchend', unlock, { passive: true });
  addEventListener('click', unlock, { passive: true });

  // ---------- Запрет зума и «лупы» ----------
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(ev, e => e.preventDefault(), { passive: false });
  }
  document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
  // Свайп за пределы канваса не должен «тянуть» страницу
  document.addEventListener('touchmove', e => { if (e.touches.length > 1 || e.target === document.body) e.preventDefault(); }, { passive: false });

  // Уход со страницы (переключение приложений в PWA) — как сворачивание
  addEventListener('pagehide', () => dispatchEvent(new Event('blur')));
})();
