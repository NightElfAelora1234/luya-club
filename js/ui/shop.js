// 路亚俱乐部 · ROD ATELIER — editorial rod-shop overlay.
// Owned by the shop module. Pure DOM + CSS; the 3D rack lives in js/world/shop.js.

/**
 * Concept rods. Fictional premium props — not real products.
 * `color` / `accent` are CSS strings (also accepted by THREE.Color) so the
 * fishing scene can reuse them directly.
 */
export const RODS = [
  {
    id: 'reef-fang-68ml',
    index: '01',
    name: '礁牙',
    nameEn: 'REEF FANG',
    model: '68ML',
    fullName: '礁牙 68ML',
    brand: 'LUYA ATELIER',
    lengthM: 2.03,
    power: 'ML',
    powerCn: '中轻',
    action: 'FAST',
    actionCn: '中快',
    lureWeight: '5–21g',
    price: 1680,
    tagline: '贴着礁盘走，短竿的耐心。',
    color: '#2f8079',
    accent: '#7cc7b3',
    palette: { blank: '#2a5f57', wrap: '#7fd8c0', grip: '#d9c8a5', metal: '#c99f66', knob: '#242624', tip: '#ffe0ae' },
    visual: { lean: 0.075, yaw: -0.14 },
  },
  {
    id: 'southerly-76m',
    index: '02',
    name: '南风',
    nameEn: 'SOUTHERLY',
    model: '76M',
    fullName: '南风 76M',
    brand: 'LUYA ATELIER',
    lengthM: 2.29,
    power: 'M',
    powerCn: '中等',
    action: 'FAST',
    actionCn: '快',
    lureWeight: '7–28g',
    price: 1980,
    tagline: '南风起时，把饵送到更远一点。',
    color: '#c7b48c',
    accent: '#d07a54',
    palette: { blank: '#d4bf92', wrap: '#c96e4a', grip: '#4a4238', metal: '#c3ccca', knob: '#222321', tip: '#fff0cf' },
    visual: { lean: 0.09, yaw: 0.07 },
  },
  {
    id: 'kuroshio-82mh',
    index: '03',
    name: '黑潮',
    nameEn: 'KUROSHIO',
    model: '82MH',
    fullName: '黑潮 82MH',
    brand: 'LUYA ATELIER',
    lengthM: 2.49,
    power: 'MH',
    powerCn: '中重',
    action: 'MED-FAST',
    actionCn: '中快',
    lureWeight: '10–40g',
    price: 2480,
    tagline: '潮墙外侧，中重的骨头。',
    color: '#26282a',
    accent: '#b87a4e',
    palette: { blank: '#333b3d', wrap: '#c97f46', grip: '#343432', metal: '#c39a6a', knob: '#1b1a18', tip: '#ffd39b' },
    visual: { lean: 0.1, yaw: 0.2 },
  },
  {
    id: 'last-light-66l',
    index: '04',
    name: '落日',
    nameEn: 'LAST LIGHT',
    model: '66L',
    fullName: '落日 66L',
    brand: 'LUYA ATELIER',
    lengthM: 1.98,
    power: 'L',
    powerCn: '轻',
    action: 'MODERATE',
    actionCn: '中调',
    lureWeight: '3–12g',
    price: 1480,
    tagline: '最后一束光，落在轻饵上。',
    color: '#9c5138',
    accent: '#e3b072',
    palette: { blank: '#b85c39', wrap: '#e8d3a4', grip: '#6b634c', metal: '#aeb7b9', knob: '#26221c', tip: '#ffe9c2' },
    visual: { lean: 0.065, yaw: -0.1 },
  },
  {
    id: 'abyssal-80h',
    index: '05',
    name: '深蓝',
    nameEn: 'ABYSSAL',
    model: '80H',
    fullName: '深蓝 80H',
    brand: 'LUYA ATELIER',
    lengthM: 2.44,
    power: 'H',
    powerCn: '重',
    action: 'FAST',
    actionCn: '快',
    lureWeight: '14–50g',
    price: 2880,
    tagline: '向下压，和深水说话。',
    color: '#2b3b5c',
    accent: '#5fd0c8',
    palette: { blank: '#2b4169', wrap: '#63d6cc', grip: '#2a2e33', metal: '#bccbd5', knob: '#161a20', tip: '#d8fffb' },
    visual: { lean: 0.085, yaw: 0.15 },
  },
];

export function formatPrice(v) {
  return `¥${Number(v).toLocaleString('en-US')}`;
}

/** Contract rod spec handed to app.actions.enterFishing(). */
export function toRodSpec(rod) {
  return {
    id: rod.id,
    name: rod.fullName,
    brand: rod.brand,
    lengthM: rod.lengthM,
    power: rod.power,
    action: rod.action,
    lureWeight: rod.lureWeight,
    tagline: rod.tagline,
    price: rod.price,
    color: rod.color,
    accent: rod.accent,
    // friendly extras (not required by the contract)
    nameCn: rod.name,
    nameEn: rod.nameEn,
    model: rod.model,
    actionCn: rod.actionCn,
    powerCn: rod.powerCn,
  };
}

const SPEC_LINE = (r) =>
  `${r.lengthM.toFixed(2)} M <i>·</i> ${r.power} <i>·</i> ${r.actionCn} ${r.action} <i>·</i> ${r.lureWeight.toUpperCase()}`;

function cardMarkup(r, i) {
  return `
    <button class="rod-card pe" type="button" role="option" data-index="${i}"
      style="--rod-accent:${r.accent};--rod-color:${r.color}"
      aria-selected="false" aria-label="${r.name} ${r.model}，${r.lengthM.toFixed(2)} 米，${formatPrice(r.price)}">
      <span class="rod-idx" aria-hidden="true">${r.index}</span>
      <span class="rod-main">
        <span class="rod-nameline">
          <span class="rod-name">${r.name}<em>${r.nameEn}</em></span>
          <span class="rod-model">${r.model}</span>
        </span>
        <span class="rod-specs">${SPEC_LINE(r)}</span>
      </span>
      <span class="rod-price">${formatPrice(r.price)}</span>
    </button>`;
}

function buildMarkup() {
  const cards = RODS.map(cardMarkup).join('');
  return `
  <div class="shop-stage">
    <div class="shop-scrim" aria-hidden="true"></div>
    <div class="shop-glowline" aria-hidden="true"></div>

    <div class="shop-panel">
      <div class="shop-reveal shop-kicker" style="--d:0ms">
        <span class="shop-kicker-main">LUYA CLUB <i>·</i> ROD ATELIER</span>
        <span class="shop-kicker-rule" aria-hidden="true"></span>
        <span class="shop-count"><b id="shopSelIndex">02</b><i>/</i>05</span>
      </div>

      <h2 class="shop-reveal shop-title" style="--d:70ms">
        <span>为南海，</span>
        <span class="title-offset">选一支竿</span>
      </h2>

      <p class="shop-reveal shop-copy" style="--d:140ms">
        五支概念样竿，五种读海的方式。<br>
        南风起时，挑一支与你合拍的调性。
      </p>

      <div class="shop-reveal rod-list" id="shopRodList" role="listbox"
        aria-label="概念样竿" style="--d:210ms">
        ${cards}
      </div>

      <div class="shop-reveal rod-detail" id="shopDetail" style="--d:260ms" aria-live="polite">
        <span class="detail-rule" aria-hidden="true"></span>
        <span class="detail-name" id="shopDetailName">南风 76M</span>
        <span class="detail-tag" id="shopDetailTag">南风起时，把饵送到更远一点。</span>
      </div>

      <div class="shop-reveal shop-actions" style="--d:320ms">
        <button class="shop-cta pe" type="button" id="shopTestCast">
          <span class="cta-text">
            <span class="cta-cn">试钓</span>
            <span class="cta-en">TEST CAST</span>
          </span>
          <span class="cta-arrow" aria-hidden="true">→</span>
        </button>
        <button class="shop-again pe" type="button" id="shopDiveAgain">
          <span class="again-top">重新下潜</span>
          <span class="again-bot">DIVE AGAIN <i aria-hidden="true">↓</i></span>
        </button>
      </div>

      <div class="shop-reveal shop-note" style="--d:380ms">
        <span class="note-dot" aria-hidden="true"></span>
        概念样竿 · 非市售型号
        <em>CONCEPT RODS — NOT FOR SALE</em>
      </div>
    </div>

    <div class="shop-coord" aria-hidden="true">
      <span class="coord-rule"></span>
      <span class="coord-main">18°11′N &nbsp;109°42′E</span>
      <span class="coord-sub">SOUTH CHINA SEA <i>·</i> 竿阵 / ROD ATELIER</span>
    </div>

    <div class="shop-side" aria-hidden="true">
      <span>EST. 2026</span>
      <span class="side-rule"></span>
      <span>05 RODS</span>
    </div>
  </div>`;
}

export function createShopUI({ onSelect, onHover, onTestCast, onDiveAgain } = {}) {
  const el = document.getElementById('shop');
  if (!el) throw new Error('[shop] #shop missing');
  el.innerHTML = buildMarkup();

  const panel = el.querySelector('.shop-panel');
  const list = el.querySelector('#shopRodList');
  const cards = [...el.querySelectorAll('.rod-card')];
  const cta = el.querySelector('#shopTestCast');
  const again = el.querySelector('#shopDiveAgain');
  const selIndex = el.querySelector('#shopSelIndex');
  const detailName = el.querySelector('#shopDetailName');
  const detailTag = el.querySelector('#shopDetailTag');

  let selected = 1;
  let hovered = -1;
  let visible = false;
  let overPanel = false;
  let detailTimer = 0;

  function paintCards() {
    cards.forEach((card, i) => {
      const on = i === selected;
      const hov = i === hovered;
      card.classList.toggle('is-selected', on);
      card.classList.toggle('is-hover', hov && !on);
      card.setAttribute('aria-selected', on ? 'true' : 'false');
      card.tabIndex = on ? 0 : -1;
    });
  }

  function paintIndex() {
    const rod = RODS[selected];
    selIndex.textContent = rod.index;
  }

  function updateDetail() {
    const rod = RODS[selected];
    const detail = el.querySelector('#shopDetail');
    clearTimeout(detailTimer);
    detail.classList.add('is-swapping');
    detailTimer = setTimeout(() => {
      detailName.textContent = rod.fullName;
      detailTag.textContent = rod.tagline;
      detail.classList.remove('is-swapping');
    }, 120);
  }

  function setSelected(i, { notify = false } = {}) {
    const n = Math.max(0, Math.min(RODS.length - 1, i | 0));
    if (n === selected) return;
    selected = n;
    paintCards();
    paintIndex();
    updateDetail();
    // keep the active card in view on the horizontal mobile strip
    const card = cards[selected];
    if (card && list.scrollWidth > list.clientWidth + 4) {
      card.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }
    if (notify) onSelect?.(selected, RODS[selected]);
  }

  function setHovered(i) {
    const n = Number.isInteger(i) ? i : -1;
    if (n === hovered) return;
    hovered = n;
    paintCards();
  }

  cards.forEach((card, i) => {
    card.addEventListener('pointerenter', () => {
      setHovered(i);
      onHover?.(i, RODS[i]);
    });
    card.addEventListener('pointerleave', () => {
      setHovered(-1);
      onHover?.(null);
    });
    card.addEventListener('focus', () => { setHovered(i); onHover?.(i, RODS[i]); });
    card.addEventListener('blur', () => { setHovered(-1); onHover?.(null); });
    card.addEventListener('click', () => {
      setSelected(i, { notify: true });
    });
  });

  // Keyboard: arrows move selection while the rod strip has focus.
  list.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowDown' || e.code === 'ArrowRight') {
      e.preventDefault();
      const next = Math.min(RODS.length - 1, selected + 1);
      if (next !== selected) {
        setSelected(next, { notify: true });
        cards[next].focus();
      }
    } else if (e.code === 'ArrowUp' || e.code === 'ArrowLeft') {
      e.preventDefault();
      const next = Math.max(0, selected - 1);
      if (next !== selected) {
        setSelected(next, { notify: true });
        cards[next].focus();
      }
    }
  });

  cta.addEventListener('click', () => onTestCast?.(RODS[selected]));
  again.addEventListener('click', () => onDiveAgain?.());

  // The 3D canvas still receives window pointer events under the panel; this
  // flag lets the scene suppress rod picking while the pointer is over UI.
  panel.addEventListener('pointerenter', () => {
    overPanel = true;
    setHovered(-1);
    onHover?.(null);
  });
  panel.addEventListener('pointerleave', () => { overPanel = false; });

  paintCards();
  paintIndex();
  detailName.textContent = RODS[selected].fullName;
  detailTag.textContent = RODS[selected].tagline;

  return {
    get selected() { return selected; },
    get visible() { return visible; },
    isOverPanel() { return overPanel; },
    setSelected,
    setHovered,
    refresh: paintCards,
    show() {
      visible = true;
      el.classList.add('active');
      el.setAttribute('aria-hidden', 'false');
      setHovered(-1);
      paintCards();
      paintIndex();
      // keep the selected rod visible on narrow (horizontal strip) layouts
      requestAnimationFrame(() => {
        const card = cards[selected];
        if (card && list.scrollWidth > list.clientWidth + 4) {
          card.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'auto' });
        }
      });
    },
    hide() {
      visible = false;
      el.classList.remove('active');
      el.setAttribute('aria-hidden', 'true');
      setHovered(-1);
    },
    destroy() {
      clearTimeout(detailTimer);
    },
  };
}
