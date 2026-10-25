import { app } from '../core/state.js';
import { clamp, smoothstep } from '../core/util.js';
import { promoAt } from './promo.js';

const $ = (s) => document.querySelector(s);

const els = {
  loader: $('#loader'),
  loaderBar: $('#loaderBar'),
  loaderStatus: $('#loaderStatus'),
  depthHud: $('#depthHud'),
  depthValue: $('#depthValue'),
  depthMarker: $('#depthMarker'),
  waterTemp: $('#waterTemp'),
  waterPressure: $('#waterPressure'),
  captionWrap: $('#captionWrap'),
  captionIndex: $('#captionIndex'),
  captionTitle: $('#captionTitle'),
  captionSub: $('#captionSub'),
  scrollHint: $('#scrollHint'),
  rodPrompt: $('#rodPrompt'),
  toast: $('#toast'),
  flash: $('#flash'),
  wash: $('#surfaceWash'),
  brand: $('#brandHome'),
  sound: $('#soundToggle'),
  navLinks: [...document.querySelectorAll('.nav-link')],
  ui: $('#ui'),
};

const CAPTIONS = [
  { from: 0.012, to: 0.115, index: '01', title: '南海 · 初见', sub: 'SOUTH CHINA SEA · SURFACE' },
  { from: 0.195, to: 0.335, index: '02', title: '光，开始变慢', sub: 'SUNLIT ZONE · 0–26 M' },
  { from: 0.385, to: 0.555, index: '03', title: '鱼群穿过暮色', sub: 'TWILIGHT ZONE · 26–62 M' },
  { from: 0.615, to: 0.795, index: '04', title: '这里没有早晨', sub: 'MIDNIGHT ZONE · 62–88 M' },
  { from: 0.895, to: 1.001, index: '05', title: '海床 · 一支鱼竿', sub: 'THE SEABED · 96 M' },
];

let toastTimer = null;
let flashTimer = null;
let washTimer = null;
let captionKey = '';
let shownCaption = -1;
let lastHudAt = -1;
let lastDepthText = '';
let lastMarker = '';
let lastTempText = '';
let lastPressureText = '';
let lastHintHide = null;
let lastHudOpacity = null;
let promoEl = null;
let promoKey = '';
let promoShown = false;
let curtainEl = null;
let curtainTimer = null;

function applyPromo(item) {
  if (!promoEl) return;
  if (!item) {
    if (promoShown) {
      promoEl.classList.remove('show');
      promoEl.setAttribute('aria-hidden', 'true');
      promoShown = false;
    }
    promoKey = '';
    return;
  }
  const key = item.index;
  if (key !== promoKey) {
    promoKey = key;
    promoEl.querySelector('.promo-index').textContent = item.index;
    promoEl.querySelector('.promo-kicker-text').textContent = item.kicker;
    promoEl.querySelector('.promo-title').textContent = item.title;
    promoEl.querySelector('.promo-cn').textContent = item.cn;
    promoEl.querySelector('.promo-sub').textContent = item.sub;
  }
  if (!promoShown) {
    promoEl.classList.add('show');
    promoEl.setAttribute('aria-hidden', 'false');
    promoShown = true;
  }
}

function updatePromo(progress, mode) {
  if (!promoEl) return;
  if (mode !== 'dive') { applyPromo(null); return; }
  applyPromo(promoAt(progress));
}

function setLoader(p, status) {
  if (els.loaderBar) els.loaderBar.style.width = `${Math.round(clamp(p) * 100)}%`;
  if (status && els.loaderStatus) els.loaderStatus.textContent = status;
}
function hideLoader() {
  els.loader?.classList.add('done');
}
function updateCaption(p, mode) {
  if (mode !== 'dive') {
    if (shownCaption !== -1) els.captionWrap?.classList.remove('show');
    captionKey = '';
    shownCaption = -1;
    return;
  }
  let idx = -1;
  for (let i = 0; i < CAPTIONS.length; i++) {
    const c = CAPTIONS[i];
    if (p >= c.from && p <= c.to) { idx = i; break; }
  }
  if (idx < 0) {
    if (shownCaption !== -1) {
      els.captionWrap.classList.remove('show');
      shownCaption = -1;
    }
    return;
  }
  if (idx === shownCaption) return;
  const c = CAPTIONS[idx];
  els.captionIndex.textContent = c.index;
  els.captionTitle.textContent = c.title;
  els.captionSub.textContent = c.sub;
  captionKey = c.index + c.title;
  els.captionWrap.classList.remove('show');
  // force a frame so the reflow transition is visible, only on a band change
  void els.captionWrap.offsetWidth;
  els.captionWrap.classList.add('show');
  shownCaption = idx;
}

export function createUI() {
  els.brand?.addEventListener('click', (e) => {
    e.preventDefault();
    app.actions.scrollTop?.();
  });
  els.navLinks.forEach((btn) => {
    btn.addEventListener('click', () => {
      const goto = btn.dataset.goto;
      if (goto === 'gear') app.actions.openGear?.();
      else if (goto === 'log') app.actions.openLog?.();
      else app.actions.scrollTop?.();
    });
  });
  els.sound?.addEventListener('click', () => {
    const off = !document.body.classList.contains('sound-off');
    document.body.classList.toggle('sound-off', off);
    app.bus.emit('audio:toggle', !off);
  });
  // block accidental text selection during drag gameplay
  window.addEventListener('dragstart', (e) => e.preventDefault());

  // Generic campaign copy that travels with the sinking sign. Data lives in
  // js/ui/promo.js so a fork can replace the copy without touching render code.
  if (els.ui) {
    curtainEl = document.createElement('div');
    curtainEl.id = 'shopCurtain';
    curtainEl.setAttribute('aria-hidden', 'true');
    els.ui.appendChild(curtainEl);

    promoEl = document.createElement('section');
    promoEl.id = 'promoLayer';
    promoEl.className = 'promo';
    promoEl.setAttribute('aria-hidden', 'true');
    promoEl.innerHTML = `
      <div class="promo-kicker"><i class="promo-index"></i><i class="promo-kicker-text"></i><span class="promo-rule"></span></div>
      <div class="promo-title"></div>
      <div class="promo-cn"></div>
      <div class="promo-sub"></div>`;
    els.ui.appendChild(promoEl);
  }

  return {
    setLoading: setLoader,
    hideLoader,
    toast(msg, ms = 2200) {
      if (!els.toast) return;
      els.toast.textContent = msg;
      els.toast.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => els.toast.classList.remove('show'), ms);
    },
    rodPrompt(show) {
      els.rodPrompt?.classList.toggle('hidden', !show);
    },
    flash(strength = 1) {
      if (!els.flash) return;
      els.flash.classList.add('pop');
      els.flash.style.opacity = String(0.45 + strength * 0.45);
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => {
        els.flash.classList.remove('pop');
        els.flash.style.opacity = '0';
      }, 90);
    },
    wash(amount = 0.8, ms = 700) {
      if (!els.wash) return;
      els.wash.style.opacity = String(amount);
      els.wash.style.transition = 'opacity .2s ease-out';
      clearTimeout(washTimer);
      washTimer = setTimeout(() => {
        els.wash.style.transition = `opacity ${ms}ms ease-out`;
        els.wash.style.opacity = '0';
      }, 160);
    },
    /** Full opaque transition curtain for scene cuts (shop hand-off). */
    curtain(amount = 1, holdMs = 260, fadeMs = 720) {
      if (!curtainEl) return;
      clearTimeout(curtainTimer);
      curtainEl.style.transition = 'none';
      curtainEl.style.opacity = String(amount);
      // force the opaque state to paint before the fade is scheduled
      void curtainEl.offsetWidth;
      curtainTimer = setTimeout(() => {
        curtainEl.style.transition = `opacity ${fadeMs}ms var(--ease)`;
        curtainEl.style.opacity = '0';
      }, holdMs);
    },
    caption(p, mode) { updateCaption(p, mode); },
    update() {
      const depth = app.depth;
      // The HUD does not need 240 Hz text writes; 12.5 Hz is imperceptible and
      // keeps the scroll thread free for the 3D scene.
      if (app.time - lastHudAt >= 0.08) {
        lastHudAt = app.time;
        const depthText = depth.toFixed(1).padStart(4, '0');
        if (els.depthValue && depthText !== lastDepthText) {
          els.depthValue.textContent = depthText;
          lastDepthText = depthText;
        }
        const marker = `${clamp(depth / 100) * 100}%`;
        if (els.depthMarker && marker !== lastMarker) {
          els.depthMarker.style.top = marker;
          lastMarker = marker;
        }
        if (els.waterTemp) {
          const t = 27.9 + (21.5 - 27.9) * smoothstep(0, 96, depth) + Math.sin(app.time * 0.2) * 0.05;
          const tempText = `${t.toFixed(1)}°C`;
          if (tempText !== lastTempText) {
            els.waterTemp.textContent = tempText;
            lastTempText = tempText;
          }
        }
        if (els.waterPressure) {
          const pressureText = `${(1 + depth / 10.06).toFixed(1)} ATM`;
          if (pressureText !== lastPressureText) {
            els.waterPressure.textContent = pressureText;
            lastPressureText = pressureText;
          }
        }
        updateCaption(app.progress, app.mode);
        updatePromo(app.progress, app.mode);
        const hintHide = app.progress > 0.018 || app.mode !== 'dive';
        if (hintHide !== lastHintHide) {
          els.scrollHint?.classList.toggle('hide', hintHide);
          lastHintHide = hintHide;
        }
        const hudOpacity = app.mode === 'dive' ? '1' : '0';
        if (hudOpacity !== lastHudOpacity) {
          if (els.depthHud) els.depthHud.style.opacity = hudOpacity;
          lastHudOpacity = hudOpacity;
        }
      }
    },
  };
}
