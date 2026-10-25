// Round-6 descent campaign — floating interactive plaques + full-screen pages.
// DOM lives here; the progress ranges/copy live in js/world/campaign.js.
// The two plaques are deliberately distinct from the existing #promoLayer copy
// cards: a framed, clickable plate with an explicit VIEW affordance.
import { Vector2 } from 'three';
import { app } from '../core/state.js';
import { CAMPAIGNS, campaignAt } from '../world/campaign.js';

const SVG_ATTRS = 'viewBox="0 0 240 100" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

const SCHEMATICS = {
  rod: `<svg ${SVG_ATTRS}>
    <path d="M16 70 L226 20" stroke-width="1.5"/>
    <path d="M16 70 L226 20" stroke-opacity=".28" stroke-width="4"/>
    <rect x="16" y="63" width="38" height="13" rx="6"/>
    <circle cx="55" cy="60" r="12"/><circle cx="55" cy="60" r="5"/>
    <path d="M55 48 L55 42 M43 54 L38 52"/>
    <path d="M84 62 l0 7 M110 56 l0 7 M136 50 l0 7 M162 43 l0 7 M188 36 l0 7 M212 30 l0 6"/>
    <path d="M226 20 l3 -4" />
  </svg>`,
  line: `<svg ${SVG_ATTRS}>
    <circle cx="78" cy="52" r="31"/><circle cx="78" cy="52" r="22"/><circle cx="78" cy="52" r="9"/>
    <path d="M48 52 A30 30 0 0 1 108 52 M51 60 A27 27 0 0 1 105 44 M56 40 A22 22 0 0 1 100 64" stroke-opacity=".55"/>
    <path d="M109 52 C142 54 168 38 208 44"/>
    <circle cx="213" cy="44" r="3.5"/>
    <path d="M72 22 L78 8 L84 22" stroke-opacity=".55"/>
  </svg>`,
  reel: `<svg ${SVG_ATTRS}>
    <circle cx="108" cy="48" r="29"/><circle cx="108" cy="48" r="17"/>
    <path d="M79 48 A29 29 0 0 1 137 46" stroke-opacity=".7"/>
    <path d="M108 77 L108 90 L128 94"/>
    <path d="M137 48 L158 62 L164 60"/>
    <circle cx="166" cy="61" r="4.5"/>
    <path d="M91 26 L125 70 M94 66 L128 24" stroke-opacity=".35" stroke-dasharray="2 4"/>
    <path d="M40 30 L54 38 M40 66 L54 58" stroke-opacity=".35"/>
  </svg>`,
  lure: `<svg ${SVG_ATTRS}>
    <path d="M8 52 Q28 36 52 48 Q38 64 8 52 Z"/>
    <path d="M52 48 L64 40 L64 58 Z"/>
    <circle cx="22" cy="48" r="1.6" fill="currentColor" stroke="none"/>
    <path d="M66 50 Q82 36 100 46 L104 40 Q110 50 104 59 L100 53 Q82 64 66 50 Z"/>
    <circle cx="80" cy="47" r="1.6" fill="currentColor" stroke="none"/>
    <path d="M124 28 L133 28 L129 60 Q129 72 120 72 Q111 72 111 60 L116 28 Z"/>
    <path d="M120 72 Q132 76 130 86 M120 72 Q108 76 110 86"/>
    <path d="M148 38 C170 28 168 56 182 54 C196 52 196 70 178 72"/>
    <circle cx="148" cy="38" r="4"/>
    <path d="M198 38 L232 44 Q240 50 232 56 L198 62 Q190 50 198 38 Z"/>
    <path d="M204 50 L226 50" stroke-opacity=".5"/>
    <circle cx="212" cy="47" r="1.6" fill="currentColor" stroke="none"/>
  </svg>`,
};

function campaignById(id) {
  return CAMPAIGNS.find((c) => c.id === id) || null;
}

function plaqueMarkup(c) {
  return `<button type="button" class="campaign-plaque campaign-plaque--${c.id} ${c.side > 0 ? 'is-right' : 'is-left'}"
    data-campaign="${c.id}" aria-hidden="true" tabindex="-1"
    aria-label="${c.action} ${c.actionEn}">
    <span class="plq-drift">
      <span class="plq-inner">
        <span class="plq-kicker"><i class="plq-index">${c.index}</i><i class="plq-label">${c.kicker}</i><i class="plq-cnlabel">${c.kickerCn}</i><span class="plq-rule" aria-hidden="true"></span></span>
        <span class="plq-title">${c.title}<em>${c.titleAccent}</em></span>
        <span class="plq-cn">${c.cn}</span>
        <span class="plq-desc">${c.desc}</span>
        <span class="plq-action"><span class="plq-action-cn">${c.action}</span><span class="plq-action-en">${c.actionEn}</span><i class="plq-arrow" aria-hidden="true">→</i></span>
      </span>
    </span>
    <span class="plq-corner plq-corner--a" aria-hidden="true"></span>
    <span class="plq-corner plq-corner--b" aria-hidden="true"></span>
  </button>`;
}

function categoryMarkup(cat) {
  return `<article class="cp-category">
    <div class="cp-cat-top"><span class="cp-no">${cat.no}</span><span class="cp-cat-en">${cat.en}</span><span class="cp-cat-cn">${cat.cn}</span></div>
    <div class="cp-schematic">${SCHEMATICS[cat.kind] || ''}</div>
    <p class="cp-cat-lead">${cat.lead}</p>
    <dl class="cp-specs">${cat.specs.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
    <p class="cp-cat-copy">${cat.copy}</p>
  </article>`;
}

function tacklePageHTML(c) {
  const p = c.page;
  return `<article class="cp-page cp-page--tackle" data-page="tackle" aria-hidden="true">
    <div class="cp-wrap">
      <header class="cp-head">
        <div class="cp-eyebrow"><span class="cp-eyebrow-no">${p.pageNo}</span><span>${p.eyebrow}</span><span class="cp-eyebrow-rule" aria-hidden="true"></span><span class="cp-eyebrow-meta">OPEN WATER PROGRAM · 2026</span></div>
        <div class="cp-head-main">
          <h1 class="cp-title">${p.title}<br><em>${p.titleAccent}</em></h1>
          <div class="cp-head-side">
            <div class="cp-titlecn">${p.cn}</div>
            <p class="cp-intro">${p.intro}</p>
          </div>
        </div>
      </header>

      <section class="cp-index" aria-label="Product index">
        <div class="cp-sectionhead"><span>PRODUCT INDEX</span><span>04 CATEGORIES / CONCEPT SPEC</span></div>
        <div class="cp-categories">${p.categories.map(categoryMarkup).join('')}</div>
      </section>

      <section class="cp-series" aria-label="Series index">
        <div class="cp-sectionhead"><span>SERIES INDEX</span><span>03 SERIES / GENERIC SPEC</span></div>
        <div class="cp-series-scroll">
          <div class="cp-series-row cp-series-row--head"><span>NO.</span><span>SERIES</span><span>LENGTH</span><span>POWER</span><span>LURE</span><span>USE</span></div>
          ${p.series.map((s) => `<div class="cp-series-row"><span class="cp-series-no">${s.no}</span><span class="cp-series-name">${s.en}<i>${s.cn}</i></span><span>${s.length}</span><span>${s.power}</span><span>${s.lure}</span><span class="cp-series-use">${s.use}</span></div>`).join('')}
        </div>
      </section>

      <footer class="cp-foot">
        <div class="cp-foot-note">${p.note}</div>
        <div class="cp-foot-meta">OPEN WATER PROGRAM · TACKLE · 2026</div>
        <button type="button" class="cp-foot-close" data-close><span>返回下潜</span><i>RESUME DIVE</i></button>
      </footer>
    </div>
  </article>`;
}

function brandPageHTML(c) {
  const p = c.page;
  return `<article class="cp-page cp-page--brand" data-page="brand" aria-hidden="true">
    <div class="cp-wrap">
      <header class="cp-head cp-head--brand">
        <div class="cp-eyebrow"><span class="cp-eyebrow-no">${p.pageNo}</span><span>${p.eyebrow}</span><span class="cp-eyebrow-rule" aria-hidden="true"></span><span class="cp-eyebrow-meta">OPEN WATER PROGRAM · 2026</span></div>
        <div class="cp-head-main">
          <h1 class="cp-title">${p.title}<br><em>${p.titleAccent}</em></h1>
          <div class="cp-head-side">
            <div class="cp-titlecn">${p.cn}</div>
            <p class="cp-intro">${p.intro}</p>
          </div>
        </div>
      </header>

      <section class="cp-brandframe">
        <div class="cp-campaign-img" aria-label="Campaign frame: open water at dusk">
          <i class="ci-sky"></i><i class="ci-sun"></i><i class="ci-horizon"></i><i class="ci-water"></i><i class="ci-boat"></i>
          <span class="ci-mark">LUYA CLUB<br><em>OPEN WATER</em></span>
          <span class="ci-cap">CAMPAIGN FRAME 01 · OPEN WATER</span>
        </div>
        <figure class="cp-quote">
          <blockquote>“${p.quote}”</blockquote>
          <figcaption>${p.quoteBy}</figcaption>
        </figure>
      </section>

      <section class="cp-principles" aria-label="Brand principles">
        <div class="cp-sectionhead"><span>THREE PRINCIPLES</span><span>LIGHTNESS / REACH / GIVE BACK</span></div>
        <div class="cp-principle-grid">
          ${p.principles.map((pr) => `<article class="cp-principle">
            <div class="cp-principle-top"><span class="cp-principle-no">${pr.no}</span><span class="cp-principle-en">${pr.en}</span><span class="cp-principle-cn">${pr.cn}</span></div>
            <p>${pr.copy}</p>
          </article>`).join('')}
        </div>
      </section>

      <section class="cp-brandnotes">
        <div class="cp-sectionhead"><span>OPEN WATER NOTES</span><span>CONCEPT / NO REAL BRAND OR REGIONAL MARKS</span></div>
        <div class="cp-brandnotes-body">${p.notes.map((n, i) => `<p><span>${String(i + 1).padStart(2, '0')}</span>${n}</p>`).join('')}</div>
      </section>

      <footer class="cp-foot">
        <div class="cp-foot-note">${p.caption}</div>
        <div class="cp-foot-meta">OPEN WATER PROGRAM · BRAND NOTES · 2026</div>
        <button type="button" class="cp-foot-close" data-close><span>返回下潜</span><i>RESUME DIVE</i></button>
      </footer>
    </div>
  </article>`;
}

function pagesMarkup() {
  return `<div class="cp-scrim" aria-hidden="true"></div>
    <div class="cp-closebar">
      <span class="cp-closebar-label">OPEN WATER PROGRAM</span>
      <button type="button" class="cp-close" data-close aria-label="关闭并返回下潜">
        <span class="cp-close-x" aria-hidden="true">×</span>
        <span class="cp-close-copy"><b>返回下潜</b><i>RESUME DIVE</i></span>
      </button>
    </div>
    <div class="cp-scroll" data-scroll>
      ${tacklePageHTML(CAMPAIGNS[0])}
      ${brandPageHTML(CAMPAIGNS[1])}
    </div>`;
}

export function createCampaign(engine, appState, ctx = {}) {
  const uiRoot = document.getElementById('ui');
  if (!uiRoot) throw new Error('[campaign] #ui missing');

  const layer = document.createElement('div');
  layer.id = 'campaignLayer';
  layer.className = 'campaign-layer';
  layer.setAttribute('aria-hidden', 'false');
  layer.innerHTML = CAMPAIGNS.map(plaqueMarkup).join('');
  uiRoot.appendChild(layer);

  const pages = document.createElement('div');
  pages.id = 'campaignPages';
  pages.className = 'campaign-pages';
  pages.setAttribute('aria-hidden', 'true');
  pages.setAttribute('role', 'dialog');
  pages.setAttribute('aria-modal', 'true');
  pages.setAttribute('aria-label', 'Campaign page');
  pages.innerHTML = pagesMarkup();
  uiRoot.appendChild(pages);

  const plaqueEls = [...layer.querySelectorAll('.campaign-plaque')];
  const scrollEl = pages.querySelector('[data-scroll]');
  const closeBtn = pages.querySelector('.cp-close');
  const pageEls = [...pages.querySelectorAll('.cp-page')];

  let active = null;
  let activeSince = 0;
  let triggered = false;
  let pageOpen = false;
  let enabled = true;
  let suppressUntil = 0;
  let saved = null;
  let lastNear = Infinity;
  let lastFocus = null;
  let measureAt = -1;
  let guardAt = -1;
  let guardOn = false;
  let guardY = 0;
  const _screen = new Vector2();
  const promoEl = document.getElementById('promoLayer');
  const captionEl = document.getElementById('captionWrap');

  function sign() { return ctx.sign; }

  function setAvoidance(amount, dir = 0) {
    sign()?.setAvoidance?.(amount, dir);
  }

  function setPlaqueState(c, on) {
    const el = plaqueEls.find((p) => p.dataset.campaign === c.id);
    if (!el) return;
    el.classList.toggle('is-active', !!on);
    el.setAttribute('aria-hidden', on ? 'false' : 'true');
    el.tabIndex = on ? 0 : -1;
  }

  function setActive(next) {
    if (active?.id === next?.id) return;
    if (active) setPlaqueState(active, false);
    active = next;
    triggered = false;
    lastNear = Infinity;
    measureAt = -1;
    if (active) {
      setPlaqueState(active, true);
      activeSince = app.time;
      document.body.classList.add('campaign-plaque-active');
      document.body.classList.add(`campaign-plaque--${active.id}`);
    } else {
      document.body.classList.remove('campaign-plaque-active', 'campaign-plaque--tackle', 'campaign-plaque--brand');
      setAvoidance(0, 0);
    }
  }

  function measureNearness(el) {
    if (!el || !sign()?.plane) return Infinity;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return Infinity;
    const s = engine.screenFromWorld(sign().plane.position, _screen);
    const pad = 26;
    const dx = Math.max(r.left - pad - s.x, 0, s.x - (r.right + pad));
    const dy = Math.max(r.top - pad - s.y, 0, s.y - (r.bottom + pad));
    return Math.hypot(dx, dy);
  }

  // The left text column (campaign promo copy) and the board are both fixed
  // screen elements. If the board parks on the left, slide it above or below
  // the copy so neither the type nor the board is buried. The 3D side is left
  // untouched; only the projected y is nudged.
  function updateTextGuard() {
    const s = sign();
    if (!s?.setTextGuard) return;
    if (app.time - guardAt < 0.1) return;
    guardAt = app.time;
    if (!promoEl || !s.plane) {
      guardOn = false;
      s.setTextGuard(0, false);
      return;
    }
    const promoShown = promoEl.classList.contains('show');
    const promoOpacity = promoShown ? parseFloat(getComputedStyle(promoEl).opacity) : 0;
    if (!promoShown || !(promoOpacity > 0.05)) {
      guardOn = false;
      s.setTextGuard(0, false);
      return;
    }
    const pr = promoEl.getBoundingClientRect();
    if (!pr.width || !pr.height) {
      guardOn = false;
      s.setTextGuard(0, false);
      return;
    }
    const sp = engine.screenFromWorld(s.plane.position, _screen);
    const inLeft = sp.x < pr.right + 280 && sp.y > pr.top - 240 && sp.y < pr.bottom + 300;
    if (!inLeft) {
      guardOn = false;
      s.setTextGuard(0, false);
      return;
    }
    const capShown = !!captionEl && captionEl.classList.contains('show');
    const ar = active ? plaqueEls.find((p) => p.dataset.campaign === active.id)?.getBoundingClientRect() : null;
    const leftPlaqueBelow = !!ar && ar.left + ar.width / 2 < window.innerWidth / 2 && ar.top > pr.top;
    const above = leftPlaqueBelow || capShown;
    const vh = window.innerHeight || 900;
    const targetY = above
      ? Math.max(86, pr.top - 128)
      : Math.min(vh - 150, pr.bottom + 210);
    guardOn = true;
    guardY = targetY;
    s.setTextGuard(targetY, true);
  }

  function clearTextGuard() {
    guardOn = false;
    guardAt = -1;
    sign()?.setTextGuard?.(0, false);
  }

  function openPage(id) {
    if (pageOpen) return;
    const c = campaignById(id);
    if (!c) return;
    if (app.mode !== 'dive') return;
    saved = {
      progress: app.progress,
      target: app.progressTarget,
      scrollY: window.scrollY,
      depth: app.depth,
      cameraDepth: app.cameraDepth,
    };
    pageOpen = true;
    lastFocus = document.activeElement;
    pages.dataset.page = c.id;
    pages.classList.add('is-open');
    pages.setAttribute('aria-hidden', 'false');
    layer.setAttribute('aria-hidden', 'true');
    pageEls.forEach((el) => {
      const on = el.dataset.page === c.id;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-hidden', on ? 'false' : 'true');
    });
    document.body.classList.add('campaign-open');
    document.body.classList.remove('campaign-plaque-active', 'campaign-plaque--tackle', 'campaign-plaque--brand');
    setAvoidance(0, 0);
    ctx.scroll?.lock(true);
    if (scrollEl) scrollEl.scrollTop = 0;
    app.progressTarget = app.progress;
    requestAnimationFrame(() => closeBtn?.focus({ preventScroll: true }));
    app.bus.emit('campaign:open', { id: c.id, progress: saved.progress });
  }

  function closePage({ restore = true, silent = false } = {}) {
    if (!pageOpen) return;
    pageOpen = false;
    pages.classList.remove('is-open');
    pages.setAttribute('aria-hidden', 'true');
    layer.setAttribute('aria-hidden', 'false');
    pageEls.forEach((el) => {
      el.classList.remove('is-active');
      el.setAttribute('aria-hidden', 'true');
    });
    document.body.classList.remove('campaign-open');
    if (restore && app.mode === 'dive' && saved) {
      ctx.scroll?.lock(false);
      ctx.scroll?.setProgress(saved.progress, true);
      ctx.rig?.snapProgress?.(saved.progress);
      app.progress = saved.progress;
      app.progressTarget = saved.progress;
      app.cameraDepth = Math.max(0, -(engine.camera?.position?.y ?? 0));
      app.depth = saved.depth;
      suppressUntil = app.time + 0.9;
    }
    saved = null;
    setAvoidance(0, 0);
    // Re-show the plaque only after the close fade + cooldown.
    if (lastFocus && typeof lastFocus.focus === 'function') {
      try { lastFocus.focus({ preventScroll: true }); } catch (e) { /* noop */ }
    }
    lastFocus = null;
    if (!silent) app.bus.emit('campaign:close');
  }

  // Plaque click → page. Delegated so the markup can be regenerated safely.
  layer.addEventListener('click', (e) => {
    const el = e.target.closest('.campaign-plaque');
    if (!el || !el.classList.contains('is-active')) return;
    openPage(el.dataset.campaign);
  });

  // Close buttons, footer buttons and the dark margin.
  pages.addEventListener('click', (e) => {
    if (!pageOpen) return;
    if (e.target.closest('[data-close]')) { closePage(); return; }
    if (e.target === pages || e.target.classList.contains('cp-scroll') || e.target.classList.contains('cp-scrim')) closePage();
  });

  const onKey = (e) => {
    if (!pageOpen) return;
    if (e.code === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closePage();
    }
  };
  window.addEventListener('keydown', onKey, true);

  app.bus.on('mode', (mode) => {
    if (mode !== 'dive' && pageOpen) closePage({ restore: false, silent: true });
    if (mode !== 'dive') {
      setActive(null);
      setAvoidance(0, 0);
    }
  });

  function update(dt) {
    if (!enabled) {
      setActive(null);
      setAvoidance(0, 0);
      updateTextGuard();
      document.body.classList.remove('campaign-plaque-active', 'campaign-plaque--tackle', 'campaign-plaque--brand');
      return;
    }
    if (pageOpen) {
      setAvoidance(0, 0);
      clearTextGuard();
      return;
    }
    if (app.mode !== 'dive') {
      setActive(null);
      setAvoidance(0, 0);
      clearTextGuard();
      if (document.body.classList.contains('campaign-plaque-active')) {
        document.body.classList.remove('campaign-plaque-active', 'campaign-plaque--tackle', 'campaign-plaque--brand');
      }
      return;
    }

    const suppressed = app.time < suppressUntil;
    const next = suppressed ? null : campaignAt(app.progress);
    setActive(next);

    if (!active) {
      setAvoidance(0, 0);
      updateTextGuard();
      return;
    }

    // Screen-space proximity between the plaque plate and the 3D logo.
    if (app.time - measureAt > 0.1) {
      measureAt = app.time;
      const el = plaqueEls.find((p) => p.dataset.campaign === active.id);
      lastNear = measureNearness(el);
    }
    if (!triggered) {
      if (lastNear < 400 || app.time - activeSince > 1.0) triggered = true;
    }
    setAvoidance(triggered ? 1 : 0, -active.side);
    updateTextGuard();
  }

  return {
    layer,
    pages,
    get active() { return active; },
    get pageOpen() { return pageOpen; },
    isPageOpen() { return pageOpen; },
    setEnabled(v) {
      enabled = !!v;
      if (!enabled) {
        if (pageOpen) closePage({ restore: false, silent: true });
        setActive(null);
        setAvoidance(0, 0);
        document.body.classList.remove('campaign-plaque-active', 'campaign-plaque--tackle', 'campaign-plaque--brand');
      }
    },
    open: openPage,
    close: closePage,
    setProgress() {},
    update,
    reset() {
      if (pageOpen) closePage({ restore: false, silent: true });
      setActive(null);
      suppressUntil = 0;
      clearTextGuard();
      setAvoidance(0, 0);
      document.body.classList.remove('campaign-open', 'campaign-plaque-active', 'campaign-plaque--tackle', 'campaign-plaque--brand');
    },
    debugInfo() {
      const el = active ? plaqueEls.find((p) => p.dataset.campaign === active.id) : null;
      const r = el ? el.getBoundingClientRect() : null;
      const s = sign()?.plane ? engine.screenFromWorld(sign().plane.position, _screen) : null;
      return {
        active: active?.id || null,
        side: active?.side ?? 0,
        pageOpen,
        triggered,
        avoid: sign()?.getAvoidance?.() ?? 0,
        near: Number.isFinite(lastNear) ? Math.round(lastNear) : null,
        textGuard: sign()?.getTextGuard?.() ?? null,
        guard: { on: guardOn, y: Math.round(guardY) },
        progress: +app.progress.toFixed(4),
        suppress: Math.max(0, +(suppressUntil - app.time).toFixed(2)),
        plaque: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null,
        logo: s ? [Math.round(s.x), Math.round(s.y)] : null,
        body: document.body.className,
      };
    },
  };
}

