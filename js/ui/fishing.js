// 路亚俱乐部 · fishing HUD & panels — round 4
//
// Only mouse left / movement, wheel and Space are advertised. The HUD shows the
// cast charge meter, the 120 m spool, and the directional sweep QTE (big arrow +
// gauge + Space glyph). Gear / leader / bag are opened by clicking their cards.
// All interactive nodes carry .fis-click so the fishing sim ignores world drags
// that start on the UI.

import { LURE_TYPES, LEADERS } from '../data/lures.js';
import { FISH_GUIDE } from '../data/fish-guide.js';

const $ = (sel, root = document) => root.querySelector(sel);

function hex(n) {
  return `#${(n >>> 0).toString(16).padStart(6, '0')}`;
}
function pad2(n) { return String(n).padStart(2, '0'); }

const TEMPLATE = /* html */`
<div class="fis-wrap" id="fisWrap">
  <header class="fis-top">
    <div class="fis-ident">
      <span class="fis-eyebrow">LUYA CLUB · SOUTH CHINA SEA</span>
      <div class="fis-rod">
        <span class="fis-rod-brand" id="fisRodBrand">LUYA CLUB</span>
        <b class="fis-rod-name" id="fisRodName">礁牙 68ML</b>
        <em class="fis-rod-spec" id="fisRodSpec">1.98 M · ML · FAST</em>
      </div>
      <div class="fis-species-line" id="fisSpeciesLine" aria-live="polite"></div>
    </div>
    <div class="fis-topright">
      <div class="fis-equipbar">
        <button class="fis-chip fis-click" id="fisLureChip" type="button" aria-label="更换拟饵">
          <span class="fis-chip-k">LURE <i>拟饵</i></span>
          <span class="fis-chip-v"><i class="fis-dot" id="fisLureDot"></i><b id="fisLureName">米诺</b><em id="fisLureBand">0.5–2.8 M</em></span>
        </button>
        <button class="fis-chip fis-click" id="fisLeaderChip" type="button" aria-label="更换前导">
          <span class="fis-chip-k">LEADER <i>前导</i></span>
          <span class="fis-chip-v"><b id="fisLeaderName">16 LB</b><em id="fisLeaderKg">7.3 KG</em></span>
        </button>
        <button class="fis-bagbtn fis-click" id="fisBagBtn" type="button" aria-label="打开鱼护">
          <span class="fis-bagbtn-k">鱼护 <em>BAG</em></span>
          <span class="fis-bagbtn-v">(<b id="fisBagCountBtn">0</b>)</span>
        </button>
        <button class="fis-ghost fis-click" id="fisGearBtn" type="button">装备</button>
        <button class="fis-sound fis-click" id="fisSoundBtn" type="button" aria-label="声音开关" aria-pressed="false"><i class="fis-sound-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path class="wave" d="M16 8.6a5 5 0 0 1 0 6.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></i><span id="fisSoundLabel">声音 OFF</span></button>
      </div>
      <button class="fis-back fis-click" id="fisBack" type="button">返回竿阵</button>
    </div>
  </header>

  <div class="fis-center">
    <div class="fis-bitebar" id="fisBiteBar" aria-hidden="true"><i></i></div>
    <div class="fis-charge" id="fisCharge" aria-hidden="true">
      <div class="fis-charge-head">
        <span>蓄力 <em>CHARGE</em></span>
        <b id="fisChargeDist">10 M</b>
      </div>
      <div class="fis-charge-track"><i id="fisChargeBar"></i><s id="fisChargeMax"></s></div>
      <div class="fis-charge-sub" id="fisChargeSub">松开空格抛竿 · 线杯 200 M</div>
    </div>
    <div class="fis-prompt" id="fisPrompt" aria-live="polite">
      <span class="fis-prompt-en" id="fisPromptEn">CHARGE &amp; CAST</span>
      <b class="fis-prompt-cn" id="fisPromptCn">按住空格蓄力 · 松开抛竿</b>
      <span class="fis-prompt-sub" id="fisPromptSub">鼠标拖拽摆竿 · 空格刺鱼</span>
    </div>
    <div class="fis-toast" id="fisToast" role="status"></div>
  </div>

  <div class="fis-verdict" id="fisVerdict" aria-live="assertive"></div>

  <div class="fis-arrow" id="fisArrow" aria-hidden="true">
    <i class="fis-arrow-glyph" id="fisArrowGlyph">→</i>
    <span class="fis-arrow-label" id="fisArrowLabel">向右抽竿</span>
  </div>

  <aside class="fis-fishcam" id="fisFishCam" aria-hidden="true">
    <div class="fis-fishcam-head"><span>HOOKED FISH <i>上鱼</i></span><b id="fisFishCamDist">0 M</b></div>
    <div class="fis-fishcam-stage" id="fisFishCamStage"></div>
    <div class="fis-fishcam-foot"><i class="fis-live-dot"></i>LIVE · 自动收线</div>
  </aside>

  <section class="fis-qte" id="fisQte" aria-hidden="true">
    <div class="fis-qte-main">
      <div class="fis-qte-head">
        <span class="fis-qte-label"><b id="fisQteRound">第 1 / 4 轮</b></span>
        <span class="fis-qte-zone" id="fisQteState">向右抽竿</span>
      </div>
      <div class="fis-qte-prompt" id="fisQtePrompt">移动鼠标 → 充满后按空格</div>
      <div class="fis-sweep">
        <div class="fis-sweep-track" id="fisSweepTrack">
          <i id="fisSweepFill"></i>
          <s class="fis-sweep-spark" id="fisSweepSpark"></s>
          <span class="fis-sweep-ticks"></span>
        </div>
        <div class="fis-sweep-space" id="fisSweepSpace"><kbd>SPACE</kbd><span>刺鱼</span></div>
      </div>
      <div class="fis-fight-info">
        <span>距离 <b id="fisFishDist">0</b><em>M</em></span>
        <span>出线 <b id="fisLineOutFight">0</b><em>M</em></span>
        <span>余线 <b id="fisSpool">200</b><em>M</em></span>
        <span class="fis-auto" id="fisAutoReel">自动收线 ON</span>
      </div>
      <div class="fis-qte-foot">
        <div class="fis-qte-nodes" id="fisQteNodes"></div>
        <div class="fis-qte-hint" id="fisQteHint">向箭头方向抽竿 · 充满后按空格</div>
      </div>
    </div>
    <div class="fis-qte-progressrow">
      <div class="fis-qte-progresslabel"><span>上鱼进度 <em>PROGRESS</em></span><b id="fisQteProgress">0%</b></div>
      <div class="fis-qte-bar" id="fisQteBarTrack">
        <i id="fisQteBar"><s class="fis-qte-spark"></s></i>
        <span class="fis-qte-lock" id="fisQteLock"><i class="fis-lock-icon"></i><b>它太有力了 · 继续抽竿</b></span>
      </div>
    </div>
  </section>

  <section class="fis-net" id="fisNet" aria-hidden="true">
    <div class="fis-net-prompt">点击虚线圈内 · 抄鱼</div>
    <div class="fis-net-sub">移动鼠标到鱼上 · 左键点击虚线圈内</div>
    <div class="fis-net-state" id="fisNetState">瞄准鱼 · 松手</div>
  </section>
  <div class="fis-net-guide" id="fisNetGuide" aria-hidden="true"><i></i><em>抄网</em></div>

  <div class="fis-cluster">
    <div class="fis-telemetry">
      <div class="fis-stat"><span class="k">LINE OUT <i>出线</i></span><b class="v" id="fisLineOut">00.0</b><span class="u">/ <i id="fisLineMax">200</i> M</span></div>
      <div class="fis-stat"><span class="k">SPOOL <i>余线</i></span><b class="v" id="fisSpoolLeft">200</b><span class="u">M</span></div>
      <div class="fis-stat"><span class="k">LURE DEPTH <i>水层</i></span><b class="v" id="fisDepthV">0.0</b><span class="u">M</span></div>
      <div class="fis-stat"><span class="k">LINE SPEED <i>线速</i></span><b class="v" id="fisSpeedV">0.0</b><span class="u">M/S</span></div>
    </div>
  </div>

  <div class="fis-line-run" id="fisLineRun">
    <b>鱼在拉线 · 不要操作</b>
    <span>LINE RUN</span>
    <em id="fisLineRunRemain">2.4 S</em>
  </div>
  <div class="fis-gear-risk" id="fisGearRisk">装备吃紧 · 大型鱼建议 H 竿 / 30 LB 前导</div>
  <div class="fis-hints">
    <div class="fis-hint"><span>收线 / 放线<em>WHEEL</em></span><kbd>滚轮</kbd></div>
    <div class="fis-hint"><span>蓄力抛竿<em>CHARGE</em></span><kbd>空格</kbd></div>
    <div class="fis-hint"><span>空格刺鱼<em>STRIKE</em></span><kbd>空格</kbd></div>
    <div class="fis-hint"><span>装备 / 鱼护<em>CLICK</em></span><kbd>卡片</kbd></div>
  </div>

  <div class="fis-gear" id="fisGear" aria-hidden="true">
    <div class="fis-gear-scrim fis-click" data-close-gear></div>
    <section class="fis-gear-panel" role="dialog" aria-label="装备">
      <header class="fis-gear-head">
        <div>
          <span class="fis-eyebrow">TACKLE · 装备</span>
          <h2>换一支饵<br>换一种海。</h2>
        </div>
        <button class="fis-close fis-click" type="button" data-close-gear>关闭</button>
      </header>
      <div class="fis-gear-scroll">
        <section class="fis-gear-block">
          <div class="fis-block-head"><span>LURE · 拟饵</span><em>SWAP LURE</em></div>
          <div class="fis-lure-list" id="fisLureList"></div>
        </section>
        <section class="fis-gear-block">
          <div class="fis-block-head"><span>LEADER · 碳氟前导</span><em>SWAP LEADER</em></div>
          <div class="fis-leader-list" id="fisLeaderList"></div>
        </section>
        <p class="fis-gear-note">前导只决定线号与强度。滚轮收放线，按住空格蓄力抛竿——整套操作只有鼠标、滚轮和空格。</p>
      </div>
    </section>
  </div>

  <section class="fis-bag" id="fisBag" aria-hidden="true">
    <div class="fis-bag-panel" role="dialog" aria-label="鱼护">
      <header class="fis-bag-head">
        <div class="fis-bag-title">
          <span class="fis-eyebrow" id="fisBagEyebrow">CREEL · 鱼护</span>
          <h2 id="fisBagTitle">今天带回来的<br>那几条鱼。</h2>
          <div class="fis-bag-meta" id="fisBagMeta"><b id="fisBagCount">0</b> 尾 · <b id="fisBagKg">0.0</b> KG · 本次会话</div>
        </div>
        <button class="fis-close fis-click" id="fisBagClose" type="button">关闭</button>
      </header>
      <div class="fis-bag-tabs" id="fisBagTabs">
        <button class="fis-bag-tab active fis-click" type="button" data-bag-tab="bag">鱼护 <em>CREEL</em></button>
        <button class="fis-bag-tab fis-click" type="button" data-bag-tab="guide">图鉴 <em>GUIDE</em></button>
      </div>
      <div class="fis-bag-body">
        <div class="fis-bag-list" id="fisBagList"></div>
        <div class="fis-bag-stage" id="fisBagStage">
          <div class="fis-bag-empty" id="fisBagEmpty">鱼护还是空的<em>钓到的鱼会留在这里</em></div>
          <div class="fis-bag-info" id="fisBagInfo">
            <b id="fisBagName">—</b>
            <i id="fisBagLatin"></i>
            <div class="fis-bag-stats">
              <span>体长 <b id="fisBagLen">—</b><em>CM</em></span>
              <span>体重 <b id="fisBagWeight">—</b><em>KG</em></span>
            </div>
            <small>拖动旋转 · DRAG TO ROTATE</small>
          </div>
        </div>
      </div>
      <div class="fis-guide" id="fisGuide" aria-hidden="true"></div>
    </div>
  </section>

  <div class="fis-catch" id="fisCatch" aria-hidden="true">
    <div class="fis-catch-card" role="dialog" aria-label="渔获">
      <span class="fis-eyebrow" id="fisCatchIndex">CATCH · 01</span>
      <h2 id="fisCatchName">黄鳍金枪鱼</h2>
      <div class="fis-catch-en" id="fisCatchEn">YELLOWFIN TUNA</div>
      <div class="fis-catch-latin" id="fisCatchLatin">Thunnus albacares</div>
      <div class="fis-catch-advisory" id="fisCatchAdvisory"></div>
      <div class="fis-catch-rule"></div>
      <div class="fis-catch-stats" id="fisCatchStats"></div>
      <div class="fis-protect" id="fisProtect"></div>
      <div class="fis-catch-actions">
        <button class="fis-btn ghost fis-click" type="button" data-catch="release">放流 <span>RELEASE</span></button>
        <button class="fis-btn brass fis-click" type="button" data-catch="keep">收入鱼护 <span>KEEP</span></button>
      </div>
      <p class="fis-catch-foot" id="fisCatchFoot">南海 · 18°11′N 109°42′E · 收入鱼护后点击鱼护卡片查看</p>
    </div>
  </div>

  <div class="fis-touch" id="fisTouch">
    <button class="fis-touch-btn fis-click" id="fisTouchReel" type="button" aria-label="收线"><b>收</b><span>收线</span></button>
    <button class="fis-touch-btn fis-click" id="fisTouchFeed" type="button" aria-label="放线"><b>放</b><span>放线</span></button>
    <button class="fis-touch-btn cast fis-click" id="fisTouchCast" type="button" aria-label="蓄力抛竿"><b>CAST</b><span>按住蓄力</span></button>
    <button class="fis-touch-btn qte fis-click" id="fisTouchQte" type="button" aria-label="空格刺鱼"><b>SPACE</b><span>刺鱼</span></button>
  </div>

  <div class="fis-flash" id="fisFlash" aria-hidden="true"></div>
</div>
`;

export function createFishingUI() {
  const el = document.getElementById('fishing');
  const ui = {
    hooks: {},
    mounted: false,
  };
  let nodes = null;
  let mountedRoot = null;
  let toastTimer = 0;
  let flashTimer = 0;
  let pulseTimer = 0;
  let promptFlashTimer = 0;
  let verdictTimer = 0;
  let rowTimer = 0;
  let hudHidden = false;
  let touchVisible = false;
  let last = {};
  let stateName = '';
  let qteSig = '';
  let bagSignature = '';

  function cache() {
    const root = mountedRoot;
    nodes = {
      root,
      wrap: $('#fisWrap', root),
      rodBrand: $('#fisRodBrand', root),
      rodName: $('#fisRodName', root),
      rodSpec: $('#fisRodSpec', root),
      speciesLine: $('#fisSpeciesLine', root),
      lineOut: $('#fisLineOut', root),
      lineMax: $('#fisLineMax', root),
      spoolLeft: $('#fisSpoolLeft', root),
      depth: $('#fisDepthV', root),
      speed: $('#fisSpeedV', root),
      lureDot: $('#fisLureDot', root),
      lureName: $('#fisLureName', root),
      lureBand: $('#fisLureBand', root),
      leaderName: $('#fisLeaderName', root),
      leaderKg: $('#fisLeaderKg', root),
      hookLure: $('#fisLureChip', root),
      hookLeader: $('#fisLeaderChip', root),
      gearBtn: $('#fisGearBtn', root),
      soundBtn: $('#fisSoundBtn', root),
      soundLabel: $('#fisSoundLabel', root),
      bagBtn: $('#fisBagBtn', root),
      bagCountBtn: $('#fisBagCountBtn', root),
      prompt: $('#fisPrompt', root),
      promptEn: $('#fisPromptEn', root),
      promptCn: $('#fisPromptCn', root),
      promptSub: $('#fisPromptSub', root),
      biteBar: $('#fisBiteBar', root),
      biteBarFill: $('#fisBiteBar i', root),
      charge: $('#fisCharge', root),
      chargeDist: $('#fisChargeDist', root),
      chargeBar: $('#fisChargeBar', root),
      chargeSub: $('#fisChargeSub', root),
      toast: $('#fisToast', root),
      qte: $('#fisQte', root),
      qteRound: $('#fisQteRound', root),
      qteProgress: $('#fisQteProgress', root),
      lineRun: $('#fisLineRun', root),
      lineRunRemain: $('#fisLineRunRemain', root),
      gearRisk: $('#fisGearRisk', root),
      qteState: $('#fisQteState', root),
      qtePrompt: $('#fisQtePrompt', root),
      sweepTrack: $('#fisSweepTrack', root),
      sweepFill: $('#fisSweepFill', root),
      sweepSpark: $('#fisSweepSpark', root),
      sweepSpace: $('#fisSweepSpace', root),
      qteNodes: $('#fisQteNodes', root),
      qteBar: $('#fisQteBar', root),
      qteBarTrack: $('#fisQteBarTrack', root),
      qteLock: $('#fisQteLock', root),
      qteHint: $('#fisQteHint', root),
      fishDist: $('#fisFishDist', root),
      lineOutFight: $('#fisLineOutFight', root),
      spool: $('#fisSpool', root),
      autoReel: $('#fisAutoReel', root),
      arrow: $('#fisArrow', root),
      fishCam: $('#fisFishCam', root),
      fishCamDist: $('#fisFishCamDist', root),
      fishCamStage: $('#fisFishCamStage', root),
      arrowGlyph: $('#fisArrowGlyph', root),
      arrowLabel: $('#fisArrowLabel', root),
      verdict: $('#fisVerdict', root),
      net: $('#fisNet', root),
      netState: $('#fisNetState', root),
      netGuide: $('#fisNetGuide', root),
      gear: $('#fisGear', root),
      lureList: $('#fisLureList', root),
      leaderList: $('#fisLeaderList', root),
      bag: $('#fisBag', root),
      bagClose: $('#fisBagClose', root),
      bagList: $('#fisBagList', root),
      bagTabs: $('#fisBagTabs', root),
      bagEyebrow: $('#fisBagEyebrow', root),
      bagTitle: $('#fisBagTitle', root),
      bagMeta: $('#fisBagMeta', root),
      guide: $('#fisGuide', root),
      gearScroll: $('.fis-gear-scroll', root),
      bagStage: $('#fisBagStage', root),
      bagEmpty: $('#fisBagEmpty', root),
      bagInfo: $('#fisBagInfo', root),
      bagName: $('#fisBagName', root),
      bagLatin: $('#fisBagLatin', root),
      bagLen: $('#fisBagLen', root),
      bagWeight: $('#fisBagWeight', root),
      bagCount: $('#fisBagCount', root),
      bagKg: $('#fisBagKg', root),
      catch: $('#fisCatch', root),
      catchIndex: $('#fisCatchIndex', root),
      catchName: $('#fisCatchName', root),
      catchEn: $('#fisCatchEn', root),
      catchLatin: $('#fisCatchLatin', root),
      catchStats: $('#fisCatchStats', root),
      protect: $('#fisProtect', root),
      catchFoot: $('#fisCatchFoot', root),
      catchAdvisory: $('#fisCatchAdvisory', root),
      touch: $('#fisTouch', root),
      touchReel: $('#fisTouchReel', root),
      touchFeed: $('#fisTouchFeed', root),
      touchCast: $('#fisTouchCast', root),
      touchQte: $('#fisTouchQte', root),
      back: $('#fisBack', root),
      flash: $('#fisFlash', root),
    };
  }

  function setText(node, key, value) {
    if (!node) return;
    if (last[key] === value) return;
    last[key] = value;
    node.textContent = value;
  }

  // -----------------------------------------------------------------------
  // gear content (no leader durability in round 4)
  // -----------------------------------------------------------------------
  function buildLureRows() {
    const list = nodes.lureList;
    list.innerHTML = '';
    for (const lure of LURE_TYPES) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'fis-lure-row fis-click';
      row.dataset.lure = lure.id;
      row.innerHTML = `
        <span class="fis-swatch" style="--sw:${hex(lure.color)};--ac:${hex(lure.accent)}"></span>
        <span class="fis-lure-main">
          <b>${lure.nameCn} <em>${lure.nameEn}</em></b>
          <span class="fis-lure-spec">${lure.lengthCm.toFixed(1)} CM · ${lure.weightG} G · ${lure.band[0].toFixed(1)}–${lure.band[1].toFixed(1)} M</span>
          <span class="fis-lure-action">${lure.hint}</span>
          <span class="fis-lure-target">${lure.targets}</span>
        </span>
        <span class="fis-lure-code">${lure.code}</span>`;
      row.addEventListener('click', () => ui.hooks?.onSwapLure?.(lure.id));
      list.appendChild(row);
    }
  }

  function buildLeaderRows() {
    const list = nodes.leaderList;
    list.innerHTML = '';
    for (const leader of LEADERS) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'fis-leader-row fis-click';
      row.dataset.leader = leader.id;
      row.innerHTML = `
        <span class="fis-leader-main">
          <span class="fis-leader-top"><b>${leader.nameCn} <em>FLUOROCARBON</em></b>
            <span class="fis-leader-num">${leader.diameterMm.toFixed(2)} MM · ${leader.strengthKg.toFixed(1)} KG</span></span>
          <span class="fis-leader-foot"><em>${leader.note}</em><span class="fis-leader-pick">选择 <i>SELECT</i></span></span>
        </span>`;
      row.addEventListener('click', () => ui.hooks?.onSwapLeader?.(leader.id));
      list.appendChild(row);
    }
  }

  function paintLeaderRows(selectedId) {
    for (const row of nodes.leaderList.querySelectorAll('.fis-leader-row')) {
      row.classList.toggle('selected', row.dataset.leader === selectedId);
    }
  }

  // -----------------------------------------------------------------------
  // mount / unmount
  // -----------------------------------------------------------------------
  function mount(init) {
    if (!el) return;
    ui.mounted = true;
    hudHidden = false;
    last = {};
    stateName = '';
    qteSig = '';
    bagSignature = '';
    el.classList.add('active');
    el.setAttribute('aria-hidden', 'false');
    el.innerHTML = TEMPLATE;
    mountedRoot = el;
    cache();
    buildLureRows();
    buildLeaderRows();
    buildGuide();
    bindBagTabs();
    paintLeaderRows(init.leader?.id);
    setEquipment(init);
    setBagCount(init.bagCount || 0);
    nodes.wrap.classList.toggle('touch', touchVisible);
    bindUi();
  }

  function unmount() {
    if (!el) return;
    clearTimeout(toastTimer);
    clearTimeout(flashTimer);
    clearTimeout(pulseTimer);
    clearTimeout(promptFlashTimer);
    clearTimeout(verdictTimer);
    clearTimeout(rowTimer);
    toastTimer = flashTimer = pulseTimer = promptFlashTimer = verdictTimer = rowTimer = 0;
    ui.mounted = false;
    el.classList.remove('active');
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '';
    mountedRoot = null;
    nodes = null;
    last = {};
    stateName = '';
    qteSig = '';
    bagSignature = '';
  }

  function bindUi() {
    nodes.hookLure?.addEventListener('click', () => ui.hooks?.onOpenGear?.());
    nodes.hookLeader?.addEventListener('click', () => ui.hooks?.onOpenGear?.());
    nodes.gearBtn?.addEventListener('click', () => ui.hooks?.onOpenGear?.());
    nodes.soundBtn?.addEventListener('click', () => {
      const on = ui.hooks?.onToggleSound?.();
      setSound(!!on);
    });
    nodes.bagBtn?.addEventListener('click', () => ui.hooks?.onOpenBag?.());
    nodes.back?.addEventListener('click', () => ui.hooks?.onExit?.());
    nodes.bagClose?.addEventListener('click', () => ui.hooks?.onCloseBag?.());
    for (const btn of mountedRoot.querySelectorAll('[data-close-gear]')) {
      btn.addEventListener('click', () => ui.hooks?.onCloseGear?.());
    }
    for (const btn of mountedRoot.querySelectorAll('[data-catch]')) {
      btn.addEventListener('click', () => {
        ui.hooks?.onCatch?.(btn.dataset.catch);
        btn.blur?.();
      });
    }
    // Space is the QTE confirm; the panel also accepts a tap (mobile fallback)
    nodes.qte?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      ui.hooks?.onQteConfirm?.();
    });
    bindHold(nodes.touchReel, (down) => ui.hooks?.onReel?.(down));
    bindHold(nodes.touchFeed, (down) => ui.hooks?.onFeed?.(down));
    bindHold(nodes.touchCast, (down) => ui.hooks?.onCastHold?.(down));
    nodes.touchCast?.addEventListener('click', () => {
      // a tap (not a hold) is still a short cast; the hold path already fired
      ui.hooks?.onCastTap?.();
    });
    nodes.touchQte?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      ui.hooks?.onQteConfirm?.();
    });
    nodes.gearScroll?.addEventListener('wheel', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const step = e.deltaMode === 1 ? e.deltaY * 18 : e.deltaY;
      nodes.gearScroll.scrollTop += step;
    }, { passive: false });
    bindBagDrag();
  }

  function bindHold(node, cb) {
    if (!node) return;
    const down = (e) => {
      e.preventDefault();
      node.classList.add('active');
      cb(true);
      try { node.setPointerCapture?.(e.pointerId); } catch (err) { /* noop */ }
    };
    const up = (e) => {
      e?.preventDefault?.();
      node.classList.remove('active');
      cb(false);
    };
    node.addEventListener('pointerdown', down);
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
    node.addEventListener('pointerleave', up);
    node.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  function bindBagDrag() {
    const stage = nodes.bagStage;
    if (!stage) return;
    let dragging = false;
    let lastX = 0;
    stage.addEventListener('pointerdown', (e) => {
      if (!ui.mounted) return;
      dragging = true;
      lastX = e.clientX;
      stage.classList.add('dragging');
      try { stage.setPointerCapture?.(e.pointerId); } catch (err) { /* noop */ }
      ui.hooks?.onBagDrag?.(0, true);
      e.preventDefault();
    });
    stage.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      ui.hooks?.onBagDrag?.(dx, true);
    });
    const up = () => {
      if (!dragging) return;
      dragging = false;
      stage.classList.remove('dragging');
      ui.hooks?.onBagDrag?.(0, false);
    };
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
    stage.addEventListener('pointerleave', up);
  }

  // -----------------------------------------------------------------------
  // public API
  // -----------------------------------------------------------------------
  function setEquipment(eq) {
    if (!ui.mounted || !nodes || !eq) return;
    const rod = eq.rodSpec;
    if (rod) {
      setText(nodes.rodBrand, 'rodBrand', rod.brand || 'LUYA CLUB');
      setText(nodes.rodName, 'rodName', rod.name || '测试竿');
      setText(nodes.rodSpec, 'rodSpec',
        `${Number(rod.lengthM || 2.1).toFixed(2)} M · ${rod.power || 'ML'} · ${rod.action || 'FAST'} · ${rod.lureWeight || '3–15 G'}`);
    }
    const lure = LURE_TYPES.find((l) => l.id === eq.lureId) || LURE_TYPES[0];
    if (lure) {
      setText(nodes.lureName, 'lureName', lure.nameCn);
      setText(nodes.lureBand, 'lureBand', `${lure.band[0].toFixed(1)}–${lure.band[1].toFixed(1)} M`);
      if (nodes.lureDot) {
        nodes.lureDot.style.background = hex(lure.color);
        nodes.lureDot.style.boxShadow = `0 0 0 1px ${hex(lure.accent)} inset, 0 0 14px ${hex(lure.accent)}55`;
      }
      for (const row of nodes.lureList.querySelectorAll('.fis-lure-row')) {
        row.classList.toggle('selected', row.dataset.lure === lure.id);
      }
    }
    const leader = LEADERS.find((l) => l.id === eq.leaderId) || LEADERS[0];
    if (leader) {
      setText(nodes.leaderName, 'leaderName', leader.nameCn);
      setText(nodes.leaderKg, 'leaderKg', `${leader.strengthKg.toFixed(1)} KG`);
    }
    paintLeaderRows(eq.leaderId);
  }

  function buildGuide() {
    if (!nodes?.guide) return;
    nodes.guide.innerHTML = FISH_GUIDE.map((g) => {
      const badge = `<span class="fis-guide-badge ${String(g.status || 'LC').toLowerCase()}">${g.status || 'LC'} · ${g.statusLabel || ''}</span>`;
      const rule = g.mustRelease
        ? '<em class="fis-guide-rule">保护物种 · 必须放流</em>'
        : (g.advisoryRelease ? '<em class="fis-guide-rule soft">建议放流</em>' : '');
      return `<article class="fis-guide-card${g.mustRelease ? ' protected' : ''}">
        <div class="fis-guide-top"><b>${g.nameCn}</b><span class="fis-guide-badges">${badge}</span></div>
        <i>${g.nameEn} · ${g.latin}</i>
        <div class="fis-guide-meta"><span>${g.depth}</span><span>${g.size}</span></div>
        <div class="fis-guide-methods">${(g.methods || []).map((m) => `<s>${m}</s>`).join('')}</div>
        ${g.gear ? `<div class="fis-guide-gear"><span>推荐装备</span><b>${g.gear.rod}</b><i>${g.gear.lb} LB</i><em>${g.gear.lure}</em></div>` : ''}
        ${g.cites ? `<span class="fis-guide-cites">${g.cites}</span>` : ''}
        <p>${g.note || ''}</p>
        ${rule}
      </article>`;
    }).join('');
  }

  let bagMetaState = { count: 0, kg: 0 };
  function renderBagMeta() {
    if (!nodes?.bagMeta) return;
    if (nodes.bag.classList.contains('tab-guide')) {
      nodes.bagMeta.textContent = `${FISH_GUIDE.length} 种 · 南海 · 保护等级标注`;
    } else {
      nodes.bagMeta.innerHTML = `<b>${bagMetaState.count}</b> 尾 · <b>${bagMetaState.kg.toFixed(1)}</b> KG · 本次会话`;
    }
  }

  function setBagTab(tab = 'bag') {
    if (!nodes) return;
    const next = tab === 'guide' ? 'guide' : 'bag';
    nodes.bag.classList.toggle('tab-guide', next === 'guide');
    nodes.guide?.setAttribute('aria-hidden', next === 'guide' ? 'false' : 'true');
    for (const b of nodes.bagTabs?.querySelectorAll('[data-bag-tab]') || []) {
      b.classList.toggle('active', b.dataset.bagTab === next);
    }
    if (nodes.bagEyebrow) nodes.bagEyebrow.textContent = next === 'guide' ? 'GUIDE · 图鉴' : 'CREEL · 鱼护';
    if (nodes.bagTitle) {
      nodes.bagTitle.innerHTML = next === 'guide'
        ? '南海鱼种<br>识别图鉴。'
        : '今天带回来的<br>那几条鱼。';
    }
    renderBagMeta();
    if (next === 'guide') nodes.guide?.scrollTo?.({ top: 0 });
  }

  function bindBagTabs() {
    for (const b of nodes.bagTabs?.querySelectorAll('[data-bag-tab]') || []) {
      b.addEventListener('click', () => setBagTab(b.dataset.bagTab));
    }
  }

  function setSound(on) {
    if (!nodes) return;
    nodes.soundBtn?.classList.toggle('on', !!on);
    setText(nodes.soundLabel, 'soundLabel', on ? '声音 ON' : '声音 OFF');
    if (nodes.soundBtn) nodes.soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    return !!on;
  }

  function setGearOpen(open, eq) {
    if (!ui.mounted || !nodes) return;
    if (eq) setEquipment(eq);
    nodes.gear.classList.toggle('open', !!open);
    nodes.wrap.classList.toggle('gear-open', !!open);
    nodes.gear.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open) paintLeaderRows(eq?.leaderId);
  }

  function setBagCount(n) {
    if (!nodes) return;
    const text = String(Math.max(0, n | 0));
    setText(nodes.bagCountBtn, 'bagCountBtn', text);
    setText(nodes.bagCount, 'bagCount', text);
    nodes.bagBtn?.classList.toggle('has', (n | 0) > 0);
  }

  // -----------------------------------------------------------------------
  // fish bag
  // -----------------------------------------------------------------------
  function setBagOpen(open, payload) {
    if (!ui.mounted || !nodes) return;
    nodes.bag.classList.toggle('open', !!open);
    nodes.wrap.classList.toggle('bag-open', !!open);
    nodes.bag.setAttribute('aria-hidden', open ? 'false' : 'true');
    setBagTab('bag');
    if (!open) {
      nodes.wrap.classList.remove('bag-drag');
      return;
    }
    if (!payload) return;
    setBagCount(payload.items?.length || 0);
    setText(nodes.bagKg, 'bagKg', Number(payload.totalKg || 0).toFixed(1));
    bagMetaState = { count: payload.items?.length || 0, kg: Number(payload.totalKg || 0) };
    renderBagMeta();
    buildBagList(payload.items || [], payload.selected | 0);
    const hasFish = (payload.items || []).length > 0;
    nodes.bagEmpty.classList.toggle('show', !hasFish);
    nodes.bagInfo.classList.toggle('show', hasFish);
    nodes.bagStage.classList.toggle('empty', !hasFish);
    if (payload.canvas) {
      if (payload.canvas.parentElement !== nodes.bagStage) {
        nodes.bagStage.insertBefore(payload.canvas, nodes.bagEmpty);
      }
      payload.canvas.style.display = '';
    }
    if (hasFish) {
      const item = payload.items[payload.selected | 0] || payload.items[0];
      applyBagItem(payload.selected | 0, item);
    }
    ui.blurFocus?.();
  }

  function buildBagList(items, selected) {
    if (!nodes?.bagList) return;
    const sig = items.map((it) => `${it.nameCn}:${it.lengthCm}`).join('|');
    if (sig !== bagSignature) {
      bagSignature = sig;
      nodes.bagList.innerHTML = '';
      items.forEach((item, i) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'fis-bag-row fis-click';
        row.dataset.index = String(i);
        row.innerHTML = `
          <span class="fis-bag-index">${pad2(i + 1)}</span>
          <span class="fis-bag-rowmain">
            <b>${item.nameCn}</b>
            <span>${Number(item.lengthCm).toFixed(1)} CM · ${Number(item.weightKg).toFixed(2)} KG</span>
          </span>
          <span class="fis-bag-dot" style="--c:${hex(item.accent)};--s:${hex(item.side)}"></span>`;
        row.addEventListener('click', () => ui.hooks?.onBagSelect?.(i));
        nodes.bagList.appendChild(row);
      });
    }
    for (const row of nodes.bagList.querySelectorAll('.fis-bag-row')) {
      row.classList.toggle('selected', Number(row.dataset.index) === selected);
    }
  }

  let currentBagIndex = 0;
  function applyBagItem(index, item) {
    if (!item) return;
    currentBagIndex = index | 0;
    setText(nodes.bagName, 'bagName', item.nameCn || '—');
    setText(nodes.bagLatin, 'bagLatin', item.latin || '');
    setText(nodes.bagLen, 'bagLen', Number(item.lengthCm || 0).toFixed(1));
    setText(nodes.bagWeight, 'bagWeight', Number(item.weightKg || 0).toFixed(2));
  }

  function setBagSelection(index, item) {
    if (!ui.mounted || !nodes) return;
    for (const row of nodes.bagList.querySelectorAll('.fis-bag-row')) {
      row.classList.toggle('selected', Number(row.dataset.index) === (index | 0));
    }
    applyBagItem(index | 0, item);
  }

  // -----------------------------------------------------------------------
  // QTE panel (directional sweeps)
  // -----------------------------------------------------------------------
  function setQteRound(round, st) {
    if (!ui.mounted || !nodes) return;
    qteSig = '';
    if (st) {
      const total = Math.max(1, st.rounds || 8);
      const planned = Math.max(1, st.baseRounds || total);
      setText(nodes.qteRound, 'qteRound', `第 ${pad2(round)} / ${pad2(total)} 轮${total > planned ? ' · 加时' : ''}`);
    }
  }

  function buildQteNodes(q) {
    const active = q.active;
    const sig = `${q.rounds}|${q.results.join(',')}|${q.round}|${active}`;
    if (sig === qteSig) return;
    qteSig = sig;
    const total = Math.max(1, q.rounds || 8);
    nodes.qteNodes.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const node = document.createElement('i');
      const result = q.results[i];
      node.className = `fis-qte-node${result === 'hit' ? ' hit' : result === 'miss' ? ' miss' : ''}`
        + `${i + 1 === q.round && active ? ' current' : ''}`;
      nodes.qteNodes.appendChild(node);
    }
  }

  function updateQte(q) {
    if (!q || !nodes) return;
    const show = !!q.active;
    nodes.qte.classList.toggle('show', show);
    nodes.qte.setAttribute('aria-hidden', show ? 'false' : 'true');
    nodes.arrow.classList.toggle('show', show && !q.qteDone);
    const showCam = show && !q.qteDone;
    nodes.fishCam?.classList.toggle('show', showCam);
    nodes.fishCam?.setAttribute('aria-hidden', showCam ? 'false' : 'true');
    if (!show) return;
    if (showCam) setText(nodes.fishCamDist, 'fishCamDist', `${Math.round(q.fishDist || 0)} M`);

    const locked = !!q.locked;
    const dir = q.dir > 0 ? 1 : -1;
    nodes.qte.classList.toggle('locked', locked);
    nodes.qte.classList.toggle('ready', !!q.ready);
    nodes.arrow.classList.toggle('left', dir < 0);
    nodes.arrow.classList.toggle('right', dir > 0);
    nodes.arrow.classList.toggle('ready', !!q.ready);
    nodes.arrow.classList.toggle('locked', locked);
    setText(nodes.arrowGlyph, 'arrowGlyph', dir < 0 ? '←' : '→');
    setText(nodes.arrowLabel, 'arrowLabel',
      q.qteDone ? '收线中' : locked ? '它太有力了 · 继续抽竿' : q.ready ? '空格 · 刺鱼' : dir < 0 ? '向左抽竿' : '向右抽竿');

    const sweep = Math.max(0, Math.min(1, q.sweep || 0));
    if (nodes.sweepFill) nodes.sweepFill.style.width = `${(sweep * 100).toFixed(1)}%`;
    if (nodes.sweepSpark) nodes.sweepSpark.style.left = `${(sweep * 100).toFixed(1)}%`;
    if (nodes.sweepTrack) {
      nodes.sweepTrack.classList.toggle('left', dir < 0);
      nodes.sweepTrack.classList.toggle('ready', !!q.ready);
    }
    nodes.sweepSpace?.classList.toggle('show', !!q.ready && !locked);
    setText(nodes.qteState, 'qteState',
      q.qteDone ? '收线中' : locked ? '它太有力了' : q.ready ? '按空格刺鱼' : (dir < 0 ? '← 向左抽竿' : '向右抽竿 →'));
    setText(nodes.qtePrompt, 'qtePrompt',
      q.qteDone ? '收线中'
        : locked ? '继续抽竿'
          : q.ready ? '空格 · 刺鱼'
            : dir < 0 ? '← 抽竿' : '抽竿 →');

    const pct = Math.round((q.progress || 0) * 100);
    setText(nodes.qteProgress, 'qteProgress', `${pct}%`);
    if (nodes.qteBar) nodes.qteBar.style.width = `${pct}%`;
    buildQteNodes(q);

    setText(nodes.fishDist, 'fishDist', Math.round(q.fishDist || 0));
    setText(nodes.lineOutFight, 'lineOutFight', Math.round(q.lineOut || 0));
    setText(nodes.spool, 'spool', Math.round(q.spoolLeft ?? 120));
    setText(nodes.autoReel, 'autoReel', q.qteDone ? '收线中 IN' : (q.autoReel === false ? '自动收线 OFF' : '自动收线 ON'));
    nodes.autoReel?.classList.toggle('on', !!q.autoReel && !q.qteDone && !locked);
    nodes.qteBarTrack?.classList.toggle('locked', locked);

    const hint = locked
      ? '继续抽竿 / 空格 · 它会松口'
      : q.qteDone
        ? '自动收线中 · 准备抄网'
        : q.ready
          ? '空格刺鱼'
          : `充满后空格 · ${Math.round(q.timeLeft || 0)} S`;
    setText(nodes.qteHint, 'qteHint', hint);
  }

  function impact(kind, st, why) {
    if (!nodes) return;
    if (kind === 'lock') {
      flashEvent('lock');
      showVerdict((st && st.verdict) || '顶住！', 'lock');
      return;
    }
    if (kind === 'escape') {
      flashEvent('slack');
      showVerdict('鱼脱钩游走了', 'escape');
      return;
    }
    flashEvent(kind === 'hit' ? 'hit' : 'miss');
    if (kind === 'hit') {
      showVerdict((st && st.verdict) || '刺中！', 'hit');
      nodes.wrap.classList.remove('shake-hit');
      void nodes.wrap.offsetWidth;
      nodes.wrap.classList.add('shake-hit');
      clearTimeout(rowTimer);
      rowTimer = setTimeout(() => nodes?.wrap?.classList.remove('shake-hit'), 300);
    } else {
      showVerdict((st && st.verdict) || '跑了！', 'miss');
      nodes.wrap.classList.add('flash-miss');
      clearTimeout(rowTimer);
      rowTimer = setTimeout(() => nodes?.wrap?.classList.remove('flash-miss'), 380);
    }
  }

  function showVerdict(text, kind) {
    if (!nodes?.verdict) return;
    clearTimeout(verdictTimer);
    nodes.verdict.textContent = text;
    nodes.verdict.className = `fis-verdict ${kind}`;
    void nodes.verdict.offsetWidth;
    nodes.verdict.classList.add('show');
    verdictTimer = setTimeout(() => {
      if (nodes?.verdict) nodes.verdict.classList.remove('show');
    }, 900);
  }

  // -----------------------------------------------------------------------
  // netting
  // -----------------------------------------------------------------------
  function updateNet(netInfo) {
    if (!nodes) return;
    const show = !!netInfo?.active;
    nodes.net.classList.toggle('show', show);
    nodes.net.setAttribute('aria-hidden', show ? 'false' : 'true');
    if (show) {
      const stateText = netInfo.scooping ? '抄住了！' : (netInfo.overlap ? '点击 · 抄鱼' : '圈内点击 · 抄鱼');
      setText(nodes.netState, 'netState', stateText);
      nodes.net.classList.toggle('overlap', !!netInfo.overlap);
    }
    const guide = nodes.netGuide;
    if (!guide) return;
    const visible = show && netInfo?.fishVisible && !netInfo.scooping;
    guide.classList.toggle('show', !!visible);
    if (visible) {
      const r = Math.max(56, Number(netInfo.guideRadius) || 96);
      guide.style.width = `${r * 2}px`;
      guide.style.height = `${r * 2}px`;
      guide.style.transform = `translate3d(${(netInfo.fishX - r).toFixed(1)}px, ${(netInfo.fishY - r).toFixed(1)}px, 0)`;
      guide.classList.toggle('over', !!netInfo.overlap);
    }
  }

  // -----------------------------------------------------------------------
  // catch card
  // -----------------------------------------------------------------------
  function showCatch(info, catches, kept, bagN) {
    if (!ui.mounted || !nodes) return;
    const s = info.species;
    setText(nodes.catchIndex, 'catchIndex', `CATCH · ${pad2(catches || 1)} · ${info.lengthCm >= 80 ? 'TROPHY' : 'KEEP OR RELEASE'}`);
    setText(nodes.catchName, 'catchName', s.nameCn);
    setText(nodes.catchEn, 'catchEn', s.nameEn);
    setText(nodes.catchLatin, 'catchLatin', s.latin);
    const cons = info.conservation || info.species?.conservation || FISH_GUIDE.find((x) => x.id === info.species?.id) || null;
    const mustRelease = !!(cons?.mustRelease);
    const advisory = !!(cons?.advisoryRelease);
    nodes.catchStats.innerHTML = `
      <div class="fis-cstat"><span>体长 <i>LENGTH</i></span><b>${Number(info.lengthCm).toFixed(1)}</b><em>CM</em></div>
      <div class="fis-cstat"><span>体重 <i>WEIGHT</i></span><b>${Number(info.weightKg).toFixed(2)}</b><em>KG</em></div>
      <div class="fis-cstat"><span>拟饵 <i>LURE</i></span><b class="txt">${info.lure.nameCn}</b><em>${info.lure.nameEn}</em></div>
      <div class="fis-cstat"><span>前导 <i>LEADER</i></span><b class="txt">${info.leader.nameCn}</b><em>${info.leader.strengthKg?.toFixed(1) ?? ''} KG</em></div>`;
    nodes.catch.classList.toggle('protected', mustRelease);
    nodes.catch.classList.toggle('advisory', !mustRelease && advisory);
    if (nodes.catchFoot) {
      nodes.catchFoot.textContent = mustRelease
        ? '保护物种 · 必须放流 · 不可收入鱼护'
        : (advisory ? '建议放流 · 把它还给海' : '南海 · 18°11′N 109°42′E · 收入鱼护后点击鱼护卡片查看');
    }
    if (nodes.protect) {
      nodes.protect.className = 'fis-protect' + (mustRelease ? ' must' : advisory ? ' soft' : '');
      nodes.protect.textContent = mustRelease
        ? `保护物种 · 必须放流${cons?.status ? ' · ' + cons.status : ''}${cons?.cites ? ' · ' + cons.cites : ''}`
        : (advisory ? `建议放流 · ${cons?.note || '大型 / 偶捕物种'}` : '');
    }
    if (nodes.catchAdvisory) {
      const advText = mustRelease
        ? `${cons?.status ? cons.status + ' · ' : ''}保护物种 · 必须放流${cons?.cites ? ' · ' + cons.cites : ''}`
        : (advisory ? `${cons?.status ? cons.status + ' · ' : ''}建议放流 · ${cons?.note || '大型 / 偶捕物种'}` : '');
      nodes.catchAdvisory.textContent = advText;
      nodes.catchAdvisory.className = 'fis-catch-advisory' + (advText ? ' show ' + (mustRelease ? 'must' : 'soft') : '');
    }
    const keepBtn = nodes.catch.querySelector('[data-catch="keep"]');
    if (keepBtn) {
      keepBtn.disabled = mustRelease;
      keepBtn.style.display = mustRelease ? 'none' : '';
    }
    nodes.catch.classList.add('show');
    nodes.wrap.classList.add('catch-open');
    nodes.catch.setAttribute('aria-hidden', 'false');
  }

  function hideCatch() {
    if (!nodes) return;
    nodes.catch.classList.remove('show', 'protected', 'advisory');
    if (nodes.protect) nodes.protect.textContent = '';
    if (nodes.catchFoot) nodes.catchFoot.textContent = '南海 · 18°11′N 109°42′E · 收入鱼护后点击鱼护卡片查看';
    if (nodes.catchAdvisory) { nodes.catchAdvisory.textContent = ''; nodes.catchAdvisory.className = 'fis-catch-advisory'; }
    const keepBtn = nodes.catch.querySelector('[data-catch="keep"]');
    if (keepBtn) { keepBtn.disabled = false; keepBtn.style.display = ''; }
    nodes.wrap.classList.remove('catch-open');
    nodes.catch.setAttribute('aria-hidden', 'true');
  }

  function note(text, kind = 'info', ms = 2600) {
    if (!nodes || !nodes.toast) return;
    clearTimeout(toastTimer);
    if (!text) {
      nodes.toast.classList.remove('show');
      nodes.toast.textContent = '';
      return;
    }
    nodes.toast.textContent = text;
    nodes.toast.className = `fis-toast show ${kind}`;
    toastTimer = setTimeout(() => {
      if (nodes?.toast) nodes.toast.classList.remove('show');
    }, ms);
  }

  function promptFlash(kind) {
    if (!nodes?.prompt) return;
    clearTimeout(promptFlashTimer);
    nodes.prompt.classList.remove('pulse');
    if (!kind) return;
    void nodes.prompt.offsetWidth;
    nodes.prompt.classList.add('pulse', kind);
    promptFlashTimer = setTimeout(() => nodes?.prompt?.classList.remove('pulse', kind), 850);
  }

  function flashEvent(kind) {
    if (!nodes?.flash) return;
    clearTimeout(flashTimer);
    nodes.flash.className = `fis-flash show ${kind || ''}`;
    flashTimer = setTimeout(() => {
      if (nodes?.flash) nodes.flash.className = 'fis-flash';
    }, kind === 'catch' ? 800 : kind === 'hit' ? 360 : 320);
  }

  function pulseGearRow(kind, id) {
    if (!nodes) return;
    const sel = kind === 'lure' ? `.fis-lure-row[data-lure="${id}"]` : `.fis-leader-row[data-leader="${id}"]`;
    const row = nodes.root.querySelector(sel);
    if (!row) return;
    clearTimeout(pulseTimer);
    nodes.root.querySelectorAll('.pulse-row').forEach((r) => r.classList.remove('pulse-row'));
    row.classList.add('pulse-row');
    pulseTimer = setTimeout(() => row.classList.remove('pulse-row'), 900);
  }

  function toggleHud() {
    hudHidden = !hudHidden;
    nodes?.wrap?.classList.toggle('hud-off', hudHidden);
    return hudHidden;
  }

  function setTouchVisible(v) {
    touchVisible = !!v;
    nodes?.wrap?.classList.toggle('touch', touchVisible);
  }

  function blurFocus() {
    if (document.activeElement && document.activeElement !== document.body) {
      try { document.activeElement.blur(); } catch (e) { /* noop */ }
    }
  }

  // -----------------------------------------------------------------------
  // prewarm: paint every panel once behind the loader
  // -----------------------------------------------------------------------
  let prewarmSeq = 0;
  const PREWARM_SPECIES = { nameCn: '黄鳍金枪鱼', nameEn: 'YELLOWFIN TUNA', latin: 'Thunnus albacares' };
  const PREWARM_CATCH = {
    species: PREWARM_SPECIES,
    lengthCm: 96.2,
    weightKg: 9.05,
    lure: LURE_TYPES[0],
    leader: LEADERS[0],
  };
  const PREWARM_ITEM = {
    nameCn: '黄鳍金枪鱼', nameEn: 'YELLOWFIN TUNA', latin: 'Thunnus albacares',
    lengthCm: 96.2, weightKg: 9.05, accent: 0xd9a86c, side: 0x8fa3a1,
  };

  function updateQteForPrewarm(locked) {
    prewarmSeq += 1;
    updateQte({
      active: true,
      phase: locked ? 'break' : 'round',
      round: 2,
      rounds: 4,
      progress: locked ? 0.62 : 0.35,
      results: ['hit'],
      hits: 1,
      misses: 0,
      dir: -1,
      sweep: locked ? 0.2 : 0.62,
      ready: !locked,
      locked,
      lockT: locked ? 0.4 : 0,
      lockDur: 1.6,
      timeLeft: 4.2,
      timeoutMs: 7000,
      fishDist: 18,
      lineOut: 22,
      spoolLeft: 98,
      autoReel: true,
      qteDone: false,
      verdict: locked ? '顶住！' : '刺中！',
      verdictKind: locked ? 'lock' : 'hit',
    });
  }

  function mountFishCam(canvas) {
    if (!canvas || !nodes?.fishCamStage) return;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    if (canvas.parentElement !== nodes.fishCamStage) nodes.fishCamStage.appendChild(canvas);
    nodes.fishCamStage.classList.add('ready');
  }

  function prewarmShow() {
    if (!ui.mounted || !nodes) return;
    try {
      // charge meter
      nodes.charge.classList.add('show');
      nodes.charge.setAttribute('aria-hidden', 'false');
      nodes.chargeBar.style.width = '55%';
      setText(nodes.chargeDist, 'chargePrewarm', '72 M');
      nodes.fishCam?.classList.add('show');
      nodes.fishCam?.setAttribute('aria-hidden', 'false');
      setText(nodes.fishCamDist, 'fishCamPrewarm', '82 M');
      // QTE round + lock
      updateQteForPrewarm(false);
      showVerdict('刺中！', 'hit');
      impact('hit', { verdict: '刺中！' });
      updateQteForPrewarm(true);
      nodes.arrow.classList.add('show', 'left', 'locked');
      flashEvent('hit');
      flashEvent('miss');
      flashEvent('lock');
      nodes.net.classList.add('show');
      nodes.netGuide.classList.add('show', 'over');
      showCatch(PREWARM_CATCH, 1, 0, 0);
      setGearOpen(true, {
        lureId: 'minnow', leaderId: 'fc16',
        rodSpec: { brand: 'LUYA CLUB', name: '礁牙 68ML', lengthM: 2.1, power: 'ML', action: 'FAST', lureWeight: '3–15 G' },
      });
      setBagOpen(true, { items: [PREWARM_ITEM], selected: 0, totalKg: 9.05, canvas: null, size: 480 });
      setBagTab('guide');
      void nodes.guide?.offsetWidth;
      setBagTab('bag');
      for (const n of [nodes.qte, nodes.catch, nodes.bag, nodes.gear, nodes.net, nodes.charge, nodes.arrow]) {
        if (n) void n.offsetWidth;
      }
    } catch (err) {
      console.warn('[fishing] ui prewarm failed', err?.message || err);
    }
  }

  function prewarmHide() {
    if (!nodes) return;
    updateQte({ active: false });
    nodes.catch.classList.remove('show');
    nodes.catch.setAttribute('aria-hidden', 'true');
    setGearOpen(false, null);
    setBagOpen(false, null);
    nodes.net.classList.remove('show');
    nodes.net.setAttribute('aria-hidden', 'true');
    nodes.netGuide.classList.remove('show', 'over');
    nodes.charge.classList.remove('show');
    nodes.charge.setAttribute('aria-hidden', 'true');
    nodes.arrow.classList.remove('show', 'left', 'right', 'ready', 'locked');
    nodes.fishCam?.classList.remove('show');
    nodes.fishCam?.setAttribute('aria-hidden', 'true');
    nodes.flash.className = 'fis-flash';
    nodes.verdict.classList.remove('show');
    nodes.wrap.classList.remove('catch-open');
    clearTimeout(toastTimer);
    clearTimeout(verdictTimer);
    clearTimeout(flashTimer);
    if (nodes.toast) nodes.toast.classList.remove('show');
  }

  // -----------------------------------------------------------------------
  // per-frame HUD
  // -----------------------------------------------------------------------
  function update(info) {
    if (!ui.mounted || !nodes) return;
    const wrap = nodes.wrap;
    if (stateName !== info.state) {
      stateName = info.state;
      wrap.dataset.state = info.state;
      nodes.biteBar.classList.toggle('show', info.state === 'bite');
      nodes.charge.classList.toggle('show', !!info.charging);
      nodes.charge.setAttribute('aria-hidden', info.charging ? 'false' : 'true');
    }

    // prompts
    setText(nodes.promptCn, 'promptCn', info.promptCn || '');
    const en = info.promptEn || '';
    if (last.promptEn !== en) {
      last.promptEn = en;
      nodes.promptEn.textContent = en;
      nodes.prompt.className = `fis-prompt${info.bite ? ' bite' : ''}`;
    } else if (info.bite) {
      nodes.prompt.classList.add('bite');
    } else {
      nodes.prompt.classList.remove('bite');
    }
    setText(nodes.promptSub, 'promptSub', info.bite
      ? `空格刺鱼 · 还剩 ${Number(info.biteRemain || 0).toFixed(1)} S`
      : (info.promptSub || ''));
    const runShow = !!info.lineRun;
    nodes.lineRun?.classList.toggle('show', runShow);
    if (nodes.lineRunRemain && info.lineRun) {
      nodes.lineRunRemain.textContent = `${Number(info.lineRun.remain || 0).toFixed(1)} S`;
    }
    nodes.gearRisk?.classList.toggle('show', !!info.gearRisk);
    wrap.classList.toggle('line-run', runShow);

    // charge meter
    if (nodes.charge) {
      const show = !!info.charging;
      nodes.charge.classList.toggle('show', show);
      nodes.charge.setAttribute('aria-hidden', show ? 'false' : 'true');
      if (show) {
        const c = Math.max(0, Math.min(1, info.charge || 0));
        nodes.chargeBar.style.width = `${(c * 100).toFixed(1)}%`;
        setText(nodes.chargeDist, 'chargeDist', `${Math.round(info.castCharge || 10)} M`);
        setText(nodes.chargeSub, 'chargeSub', `松开空格抛竿 · 线杯 ${Math.round(info.spoolLeft ?? 200)} M`);
      }
    }

    // telemetry
    setText(nodes.lineOut, 'lineOut', info.lineOut > 0.05 ? Number(info.lineOut).toFixed(1) : '00.0');
    setText(nodes.lineMax, 'lineMax', String(Math.round(info.spoolMax || 120)));
    setText(nodes.spoolLeft, 'spoolLeft', String(Math.round(info.spoolLeft ?? 120)));
    setText(nodes.depth, 'depth', Number(info.depth || 0).toFixed(1));
    setText(nodes.speed, 'speed', Number(info.speed || 0).toFixed(1));
    const speciesLine = info.state === 'fighting' && info.species
      ? `${info.species.nameCn} · ${info.species.nameEn} — ON`
      : (info.state === 'bite' ? '咬口 · 空格刺鱼' : '');
    setText(nodes.speciesLine, 'speciesLine', speciesLine);
    nodes.speciesLine.classList.toggle('show', !!speciesLine);

    // chips (no wear)
    const lure = info.lure;
    if (lure) {
      nodes.hookLure?.classList.remove('bait');
      last.dotBait = '';
      setText(nodes.lureName, 'lureName2', lure.nameCn);
      setText(nodes.lureBand, 'lureBand2', `${lure.band[0].toFixed(1)}–${lure.band[1].toFixed(1)} M`);
      if (nodes.lureDot && last.dotLure !== lure.id) {
        last.dotLure = lure.id;
        nodes.lureDot.style.background = hex(lure.color);
        nodes.lureDot.style.boxShadow = `0 0 0 1px ${hex(lure.accent)} inset, 0 0 14px ${hex(lure.accent)}55`;
      }
    }
    if (info.leader) {
      setText(nodes.leaderName, 'leaderName2', info.leader.nameCn);
      setText(nodes.leaderKg, 'leaderKg2', `${info.leader.strengthKg.toFixed(1)} KG`);
    }
    setBagCount(info.bagCount || 0);

    // bite countdown
    if (info.bite && nodes.biteBarFill) {
      nodes.biteBarFill.style.transform = `scaleX(${(1 - clamp01(info.biteProgress || 0)).toFixed(3)})`;
    }

    setSound(!!info.soundOn);
    updateQte(info.qte);
    updateNet(info.net);
    wrap.classList.toggle('touch', touchVisible);
  }

  Object.assign(ui, {
    mount,
    unmount,
    setEquipment,
    setGearOpen,
    setQteRound,
    setBagCount,
    setBagOpen,
    setBagSelection,
    showCatch,
    hideCatch,
    note,
    promptFlash,
    flashEvent,
    impact,
    showVerdict,
    pulseGearRow,
    toggleHud,
    setTouchVisible,
    blurFocus,
    update,
    mountFishCam,
    setSound,
    prewarmShow,
    prewarmHide,
    get hudHidden() { return hudHidden; },
  });
  return ui;
}

function clamp01(v) { return Math.max(0, Math.min(1, Number(v) || 0)); }
