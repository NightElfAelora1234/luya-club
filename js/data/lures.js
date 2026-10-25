// 路亚俱乐部 · 拟饵与前导数据
// Owned by the fishing module. Pure data: no DOM, no three.js, no side effects.
//
// Depth convention: `band` is in metres BELOW the surface, [shallow, deep].
// `sink` is the free-fall rate (m/s); `lift` is the rise rate at full retrieve
// speed (m/s). `speed` is the retrieving window in m/s that the lure was built
// to hunt at. `twitch` lures respond to rod-tip twitches as well as line speed.

export const LURE_TYPES = [
  {
    id: 'minnow',
    nameCn: '米诺',
    nameEn: 'MINNOW',
    latin: 'Suspending Minnow',
    code: 'M-95',
    lengthCm: 9.5,
    weightG: 12,
    band: [0.5, 2.8],
    sink: 0.34,
    lift: 0.72,
    speed: [0.6, 1.6],
    twitch: false,
    color: 0x9fb4ad,
    accent: 0x244340,
    belly: 0xe3ddc8,
    hooks: '2 × 三本钩',
    species: ['yellowfin', 'mahi', 'snapper', 'cobia', 'scad'],
    desc: '抽停之间，模仿一尾受伤的小鱼；南海表层的通用语言。',
    hint: '匀速慢收 0.8–1.4 M/S，保持 1–2 米水层',
    targets: '金枪 · 鲯鳅 · 笛鲷',
  },
  {
    id: 'popper',
    nameCn: '波爬',
    nameEn: 'POPPER',
    latin: 'Cup-Face Popper',
    code: 'P-75',
    lengthCm: 7.5,
    weightG: 14,
    band: [0.0, 0.35],
    sink: 0.02,
    lift: 1.1,
    speed: [0.35, 1.1],
    twitch: true,
    color: 0xefe4cc,
    accent: 0xd4623c,
    belly: 0xf7f1e2,
    hooks: '2 × 三本钩',
    species: ['mahi', 'yellowfin', 'cobia'],
    desc: '杯口推开水花，替一条跃出水面的饵鱼发出邀请。',
    hint: '抽—停—抽 · 水面炸水后停顿半秒',
    targets: '鲯鳅 · 金枪 · 军曹',
  },
  {
    id: 'jig',
    nameCn: '铁板',
    nameEn: 'JIG',
    latin: 'Slow-Fall Metal Jig',
    code: 'J-65',
    lengthCm: 6.5,
    weightG: 60,
    band: [4.0, 18.0],
    sink: 1.75,
    lift: 2.1,
    speed: [1.2, 2.8],
    twitch: false,
    color: 0xb8c2c6,
    accent: 0x7f4b2a,
    belly: 0xd9e2e2,
    hooks: '前钩 + 尾钩',
    species: ['grouper', 'yellowfin', 'cobia'],
    desc: '靠重量穿过光层，像一尾失去方向的小鱼急速坠落。',
    hint: '让它落 6–10 秒，再急抽 2–3 圈',
    targets: '石斑 · 金枪 · 军曹',
  },
  {
    id: 'soft',
    nameCn: '软虫',
    nameEn: 'SOFT PLASTIC',
    latin: 'Paddle-Tail on Jighead',
    code: 'S-120',
    lengthCm: 12.0,
    weightG: 7,
    band: [1.5, 9.0],
    sink: 0.78,
    lift: 0.82,
    speed: [0.2, 0.9],
    twitch: false,
    color: 0x5f8c6b,
    accent: 0x23322b,
    belly: 0x9bb79a,
    hooks: '1 × 铅头钩',
    species: ['grouper', 'snapper', 'lionfish', 'cobia'],
    desc: '铅头带着软尾贴着礁石爬行，几乎不在水里制造声音。',
    hint: '贴底慢拖 0.3–0.6 M/S，触底后轻挑',
    targets: '石斑 · 笛鲷 · 狮子鱼',
  },
  {
    id: 'pencil',
    nameCn: '铅笔',
    nameEn: 'PENCIL',
    latin: 'Walk-the-Dog Pencil',
    code: 'P-100',
    lengthCm: 10.0,
    weightG: 16,
    band: [0.0, 0.4],
    sink: 0.03,
    lift: 1.4,
    speed: [0.8, 1.8],
    twitch: true,
    color: 0xcdc6a9,
    accent: 0x8f3932,
    belly: 0xeee6d1,
    hooks: '2 × 三本钩',
    species: ['mahi', 'yellowfin', 'cobia', 'scad'],
    desc: '左一下、右一下，在水面写出一条之字形的逃路。',
    hint: '连续抽动 · 走狗步 0.8–1.6 M/S',
    targets: '鲯鳅 · 金枪 · 军曹',
  },
];

export const LURE_BY_ID = Object.fromEntries(LURE_TYPES.map((l) => [l.id, l]));

// ---------------------------------------------------------------------------
// Leaders — fluorocarbon, the only thing between the braid and the fish.
// `strengthKg` is a nominal break strength; the sim builds a 0..1 break
// threshold from it and degrades that threshold with `wear`.
// ---------------------------------------------------------------------------

export const LEADERS = [
  {
    id: 'fc12',
    lb: 12,
    strengthKg: 5.4,
    diameterMm: 0.26,
    nameCn: '12 LB',
    nameEn: 'FLUOROCARBON · 12 LB',
    color: 0xe4ede6,
    note: '轻口 · 高咬口率 / 低容错',
  },
  {
    id: 'fc16',
    lb: 16,
    strengthKg: 7.3,
    diameterMm: 0.30,
    nameCn: '16 LB',
    nameEn: 'FLUOROCARBON · 16 LB',
    color: 0xdfe9e2,
    note: '均衡 · 礁区常规配置',
  },
  {
    id: 'fc20',
    lb: 20,
    strengthKg: 9.1,
    diameterMm: 0.35,
    nameCn: '20 LB',
    nameEn: 'FLUOROCARBON · 20 LB',
    color: 0xd9e5de,
    note: '耐磨 · 石斑与军曹',
  },
  {
    id: 'fc30',
    lb: 30,
    strengthKg: 13.6,
    diameterMm: 0.43,
    nameCn: '30 LB',
    nameEn: 'FLUOROCARBON · 30 LB',
    color: 0xd3e0da,
    note: '重装 · 大物与礁洞',
  },
];

export const LEADER_BY_ID = Object.fromEntries(LEADERS.map((l) => [l.id, l]));

export const LEADER_MAX_WEAR = 1;

// Base tension (0..1) at which a brand-new leader lets go. Wear multiplies it
// down toward 0.45, so a badly abraded 12 lb can pop in the green zone.
export function leaderBreakThreshold(leader, wear = 0) {
  const lb = leader?.lb ?? 16;
  const base = 0.68 + ((lb - 12) / 18) * 0.24;
  const fatigue = 1 - Math.min(1, Math.max(0, wear)) * 0.47;
  return base * fatigue;
}

// A leader's visible / physical diameter scale relative to 16 lb.
export function leaderGauge(leader) {
  return (leader?.diameterMm ?? 0.3) / 0.3;
}

// ---------------------------------------------------------------------------
// Rod specs — the shop hands us a vendor-agnostic rodSpec. Be forgiving.
// ---------------------------------------------------------------------------

const POWER_SCALE = {
  UL: 0.62, L: 0.78, ML: 0.94, M: 1.1, MH: 1.26, H: 1.42, XH: 1.6,
};
const ROD_SAFE_KG = { UL: 3, L: 5, ML: 9, M: 18, MH: 35, H: 60, XH: 85 };
const ROD_LURE_MAX_G = { UL: 7, L: 12, ML: 21, M: 30, MH: 45, H: 70, XH: 100 };
const ROD_CAST_FACTOR = { UL: 0.72, L: 0.85, ML: 1, M: 1.05, MH: 1.1, H: 1.12, XH: 1.15 };
const ROD_MAX_CAST = { UL: 60, L: 82, ML: 120, M: 120, MH: 120, H: 120, XH: 120 };

export function rodProfile(rodSpec = {}) {
  const rawPower = String(rodSpec.power ?? 'ML').toUpperCase().replace(/[^A-Z]/g, '');
  const power = POWER_SCALE[rawPower] ?? 1.0;
  const lengthM = Number(rodSpec.lengthM) || (rodSpec.length ? parseFloat(rodSpec.length) : 2.1) || 2.1;
  const lengthK = Math.min(1.18, Math.max(0.85, lengthM / 2.1));
  const castBase = 12.5 + power * 6.2 + (lengthK - 1) * 4;
  return {
    id: rodSpec.id || 'default',
    name: rodSpec.name || rodSpec.nameCn || '测试竿',
    brand: rodSpec.brand || 'LUYA CLUB',
    lengthM,
    power: rawPower || 'ML',
    action: rodSpec.action || 'FAST',
    lureWeight: rodSpec.lureWeight || '3–15 G',
    color: rodSpec.color ?? 0x1b2b30,
    accent: rodSpec.accent ?? 0xd9a86c,
    powerScale: power,
    castDistance: castBase,
    safeKg: ROD_SAFE_KG[rawPower] ?? 9,
    lureMaxG: ROD_LURE_MAX_G[rawPower] ?? 21,
    castFactor: ROD_CAST_FACTOR[rawPower] ?? 1,
    maxCastM: ROD_MAX_CAST[rawPower] ?? 120,
    // stronger rod = slightly more control in a long run
    fightControl: 0.8 + power * 0.2,
    // heavier lures fly a little shorter, everything casts a little further
    // with a longer rod; the player still gets a meaningful spread.
    castDistanceFor(lure) {
      const w = lure?.weightG ?? 12;
      const over = Math.max(0, w - (ROD_LURE_MAX_G[rawPower] ?? 21));
      return Math.max(8, castBase - (w - 20) * 0.055 - over * 0.45);
    },
  };
}

// Wind / sweep response used by the visual rig; kept here so the sim and the
// HUD agree on how lively a rod is.
export function rodSweepGain(rodSpec = {}) {
  const p = String(rodSpec.action ?? 'FAST').toUpperCase();
  if (p.includes('SLOW') || p.includes('MODERATE')) return 0.9;
  if (p.includes('FAST')) return 1.0;
  return 0.95;
}
