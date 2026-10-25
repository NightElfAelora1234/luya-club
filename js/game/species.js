// Fallback species table + fight-style inference for the fishing sim.
//
// The shared fish system owns js/data/species.js and will eventually provide
// ctx.fish.species. Until that lands (and defensively afterwards) the fishing
// sim runs on this local table, using exactly the same Species shape as
// CONTRACT.md §2.1 so switching between the two is invisible to the sim.

export const FALLBACK_SPECIES = [
  {
    id: 'yellowfin',
    nameCn: '黄鳍金枪鱼',
    nameEn: 'YELLOWFIN TUNA',
    latin: 'Thunnus albacares',
    zones: ['surface', 'sunlit'],
    sizeCm: [65, 142],
    weightKg: [4.5, 42],
    lureTypes: ['minnow', 'popper', 'jig', 'pencil'],
    fight: { power: 0.88, speed: 0.96, stamina: 0.82 },
    lineRunner: true,
    runPower: 1,
    colors: { back: 0x1c3346, side: 0xb9c9c9, belly: 0xe8e4d4, fin: 0xf0c04a, accent: 0xd9a86c },
    rarity: 'uncommon',
    description: '它从深蓝里射上来的时候，海面会先安静半秒。',
    schoolSize: [3, 9],
    fighter: true,
  },
  {
    id: 'bigeye',
    nameCn: '大眼金枪鱼',
    nameEn: 'BIGEYE TUNA',
    latin: 'Thunnus obesus',
    zones: ['sunlit', 'twilight'],
    sizeCm: [55, 180],
    weightKg: [3.2, 86],
    lureTypes: ['jig', 'minnow', 'soft'],
    fight: { power: 0.95, speed: 0.78, stamina: 0.96 },
    lineRunner: true,
    runPower: 0.95,
    colors: { back: 0x101d30, side: 0xb9a768, belly: 0xe4ddc6, fin: 0xd8b544, accent: 0xf0cf5a },
    rarity: 'rare',
    conservation: { status: 'VU', label: '易危', mustRelease: true, note: '保护物种 · 必须放流' },
    description: '大眼金枪鱼在更深的水层巡游；易危物种，钓获后必须放流。',
    schoolSize: [2, 6],
    fighter: true,
  },
  {
    id: 'cobia',
    nameCn: '军曹鱼',
    nameEn: 'COBIA',
    latin: 'Rachycentron canadum',
    zones: ['surface', 'sunlit'],
    sizeCm: [55, 118],
    weightKg: [3.2, 26],
    lureTypes: ['minnow', 'popper', 'jig', 'soft', 'pencil'],
    fight: { power: 0.74, speed: 0.58, stamina: 0.94 },
    lineRunner: true,
    runPower: 0.8,
    colors: { back: 0x2a2a24, side: 0x5d5f52, belly: 0xd6d1bb, fin: 0x3a3327, accent: 0xb08a4f },
    rarity: 'common',
    description: '把肩膀交给海，剩下的时间它只做一件事：往下走。',
    schoolSize: [1, 3],
    fighter: true,
  },
  {
    id: 'mahi',
    nameCn: '鲯鳅',
    nameEn: 'MAHI-MAHI',
    latin: 'Coryphaena hippurus',
    zones: ['surface', 'sunlit'],
    sizeCm: [48, 96],
    weightKg: [1.6, 12],
    lureTypes: ['minnow', 'popper', 'pencil', 'jig'],
    fight: { power: 0.62, speed: 0.88, stamina: 0.55 },
    lineRunner: true,
    runPower: 0.85,
    colors: { back: 0x2c6a5e, side: 0xd6b53f, belly: 0xf0dfae, fin: 0x2f8fbe, accent: 0xf2c74d },
    rarity: 'common',
    description: '金色的一闪，然后整片海面都被它搅碎。',
    schoolSize: [2, 6],
    fighter: true,
  },
  {
    id: 'snapper',
    nameCn: '红鳍笛鲷',
    nameEn: 'RED SNAPPER',
    latin: 'Lutjanus erythropterus',
    zones: ['sunlit', 'twilight'],
    sizeCm: [32, 72],
    weightKg: [0.8, 6.4],
    lureTypes: ['minnow', 'soft', 'jig'],
    fight: { power: 0.54, speed: 0.46, stamina: 0.5 },
    colors: { back: 0x8e3f38, side: 0xd08472, belly: 0xefdcc4, fin: 0xc4594a, accent: 0xe4b47c },
    rarity: 'common',
    description: '礁石的影子动了一下，那是一顿饭刚刚抬头。',
    schoolSize: [3, 8],
    fighter: true,
  },
  {
    id: 'grouper',
    nameCn: '鞍带石斑鱼',
    nameEn: 'GIANT GROUPER',
    latin: 'Epinephelus lanceolatus',
    zones: ['twilight', 'floor'],
    sizeCm: [58, 148],
    weightKg: [4, 38],
    lureTypes: ['jig', 'soft'],
    fight: { power: 0.94, speed: 0.28, stamina: 0.96 },
    colors: { back: 0x5b5a48, side: 0x8b8468, belly: 0xd4caa9, fin: 0x6a6148, accent: 0xc2a26b },
    rarity: 'uncommon',
    description: '它不跑。它只是回到洞里，把整条钓竿也一起带走。',
    schoolSize: [1, 2],
    fighter: true,
  },
  {
    id: 'lionfish',
    nameCn: '狮子鱼',
    nameEn: 'LIONFISH',
    latin: 'Pterois volitans',
    zones: ['sunlit', 'twilight'],
    sizeCm: [18, 38],
    weightKg: [0.25, 1.4],
    lureTypes: ['soft', 'minnow'],
    fight: { power: 0.18, speed: 0.14, stamina: 0.28 },
    colors: { back: 0x8e3a27, side: 0xc97252, belly: 0xead8c2, fin: 0xb14e35, accent: 0xe8dcc8 },
    rarity: 'common',
    description: '羽毛一样的鳍在水里慢慢张开，像一封不该拆开的信。',
    schoolSize: [1, 2],
    fighter: true,
  },
  {
    id: 'hairtail',
    nameCn: '带鱼',
    nameEn: 'HAIRTAIL',
    latin: 'Trichiurus lepturus',
    zones: ['twilight', 'deep'],
    sizeCm: [48, 118],
    weightKg: [0.4, 2.6],
    lureTypes: ['jig', 'minnow'],
    fight: { power: 0.36, speed: 0.66, stamina: 0.42 },
    colors: { back: 0x8f9ca4, side: 0xc7d2d4, belly: 0xeff2ef, fin: 0x9aa8ae, accent: 0xd8e0de },
    rarity: 'uncommon',
    description: '一整条月光被拉出水面，扭动，然后熄灭。',
    schoolSize: [4, 10],
    fighter: true,
  },
  {
    id: 'parrotfish',
    nameCn: '鹦嘴鱼',
    nameEn: 'PARROTFISH',
    latin: 'Scarus ghobban',
    zones: ['sunlit'],
    sizeCm: [26, 56],
    weightKg: [0.5, 3.2],
    lureTypes: ['soft', 'minnow'],
    fight: { power: 0.42, speed: 0.4, stamina: 0.44 },
    colors: { back: 0x2f6f5b, side: 0x5fb2a1, belly: 0xe3d3aa, fin: 0xc46a5a, accent: 0xf0c98d },
    rarity: 'common',
    description: '它把珊瑚嚼成沙，也把一整片午后嚼得很慢。',
    schoolSize: [2, 5],
    fighter: true,
  },
  {
    id: 'scad',
    nameCn: '蓝圆鲹',
    nameEn: 'ROUND SCAD',
    latin: 'Decapterus maruadsi',
    zones: ['surface', 'sunlit'],
    sizeCm: [16, 34],
    weightKg: [0.12, 0.8],
    lureTypes: ['minnow', 'pencil', 'soft'],
    fight: { power: 0.3, speed: 0.7, stamina: 0.26 },
    colors: { back: 0x2a5368, side: 0x9fb5b8, belly: 0xe9ece2, fin: 0xa8b7b4, accent: 0xd9c48c },
    rarity: 'common',
    description: '水面先起了一阵细碎的雷，然后它们才出现。',
    schoolSize: [12, 30],
    fighter: true,
  },
];

// ---------------------------------------------------------------------------
// Fight choreography per style. `runEvery` / `runDur` are seconds. During a
// run the fish pulls harder and takes line; during the rest it comes in.
// ---------------------------------------------------------------------------

export const FIGHT_STYLES = {
  run: {
    label: '急速冲刺',
    runEvery: [1.5, 2.4], runDur: [0.65, 1.15],
    runPull: 1.75, runOut: 1.3, restPull: 0.55,
    splash: 0.9, lateral: 0.7, jump: false, shake: 0.12,
  },
  bulldog: {
    label: '沉稳顶底',
    runEvery: [3.4, 5.0], runDur: [1.6, 2.4],
    runPull: 1.25, runOut: 0.4, restPull: 0.66,
    splash: 0.35, lateral: 0.15, jump: false, shake: 0.4,
  },
  jump: {
    label: '跃水甩头',
    runEvery: [2.1, 3.4], runDur: [0.6, 1.0],
    runPull: 1.18, runOut: 0.95, restPull: 0.62,
    splash: 1.0, lateral: 0.9, jump: true, shake: 0.22,
  },
  burst: {
    label: '短促爆发',
    runEvery: [2.2, 3.6], runDur: [0.42, 0.8],
    runPull: 1.36, runOut: 0.85, restPull: 0.58,
    splash: 0.55, lateral: 0.55, jump: false, shake: 0.18,
  },
  surge: {
    label: '长程拖拽',
    runEvery: [2.8, 4.2], runDur: [2.0, 3.2],
    runPull: 1.22, runOut: 1.0, restPull: 0.82,
    splash: 0.5, lateral: 0.45, jump: false, shake: 0.2,
  },
  wiggle: {
    label: '横向摆尾',
    runEvery: [1.5, 2.5], runDur: [0.6, 1.0],
    runPull: 1.02, runOut: 0.7, restPull: 0.5,
    splash: 0.45, lateral: 1.15, jump: false, shake: 0.15,
  },
  light: {
    label: '轻微挣扎',
    runEvery: [3.8, 5.6], runDur: [0.45, 0.85],
    runPull: 0.68, runOut: 0.3, restPull: 0.42,
    splash: 0.3, lateral: 0.4, jump: false, shake: 0.1,
  },
};

const STYLE_BY_ID = {
  yellowfin: 'run',
  cobia: 'surge',
  mahi: 'jump',
  snapper: 'burst',
  grouper: 'bulldog',
  lionfish: 'light',
  hairtail: 'wiggle',
  parrotfish: 'burst',
  scad: 'run',
};

const STYLE_KEYWORDS = [
  [/tuna|yellowfin|金枪/i, 'run'],
  [/cobia|军曹/i, 'surge'],
  [/mahi|dolphin|鲯鳅|鬼头刀/i, 'jump'],
  [/snapper|笛鲷|鲷/i, 'burst'],
  [/grouper|石斑/i, 'bulldog'],
  [/lion|狮子/i, 'light'],
  [/hairtail|带鱼/i, 'wiggle'],
  [/parrot|鹦嘴/i, 'burst'],
  [/scad|圆鲹|鲹/i, 'run'],
];

export function fightStyleFor(species) {
  if (!species) return FIGHT_STYLES.run;
  if (species.fightStyle && FIGHT_STYLES[species.fightStyle]) return FIGHT_STYLES[species.fightStyle];
  const id = `${species.id || ''} ${species.nameCn || ''} ${species.nameEn || ''}`;
  for (const [re, style] of STYLE_KEYWORDS) if (re.test(id)) return FIGHT_STYLES[style];
  const speed = species.fight?.speed ?? 0.5;
  if (speed > 0.8) return FIGHT_STYLES.run;
  if (speed < 0.3) return FIGHT_STYLES.bulldog;
  return FIGHT_STYLES.burst;
}

export function styleIdFor(species) {
  const s = fightStyleFor(species);
  return Object.keys(FIGHT_STYLES).find((k) => FIGHT_STYLES[k] === s) || 'burst';
}

// ---------------------------------------------------------------------------
// Normalisation: the real fish module may add fields, omit optional ones, or
// use slightly different naming. Keep the sim alive no matter what.
// ---------------------------------------------------------------------------

let slug = 0;
export function normalizeSpecies(raw, index = 0) {
  const id = String(raw?.id || raw?.nameEn || raw?.nameCn || `fish-${slug++}`)
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `fish-${index}`;
  const fight = raw?.fight || {};
  const colors = raw?.colors || {};
  const size = Array.isArray(raw?.sizeCm) ? raw.sizeCm : [30, 60];
  const weight = Array.isArray(raw?.weightKg) ? raw.weightKg : [1, 5];
  return {
    id,
    sourceId: raw?.id != null ? String(raw.id) : undefined,
    nameCn: raw?.nameCn || raw?.name || '未命名',
    nameEn: raw?.nameEn || raw?.english || String(id).toUpperCase(),
    latin: raw?.latin || raw?.scientific || '',
    zones: Array.isArray(raw?.zones) ? raw.zones : ['sunlit'],
    sizeCm: [Number(size[0]) || 20, Number(size[1]) || 60],
    weightKg: [Number(weight[0]) || 0.3, Number(weight[1]) || 3],
    lureTypes: Array.isArray(raw?.lureTypes) && raw.lureTypes.length
      ? raw.lureTypes
      : ['minnow', 'popper', 'jig', 'soft', 'pencil'],
    fight: {
      power: clamp01(fight.power ?? 0.5),
      speed: clamp01(fight.speed ?? 0.5),
      stamina: clamp01(fight.stamina ?? 0.5),
    },
    colors: {
      back: colors.back ?? 0x2c4147,
      side: colors.side ?? 0x8fa3a1,
      belly: colors.belly ?? 0xe4ddc9,
      fin: colors.fin ?? 0x5a6a66,
      accent: colors.accent ?? 0xd9a86c,
    },
    rarity: raw?.rarity || 'common',
    description: raw?.description || '',
    schoolSize: Array.isArray(raw?.schoolSize) ? raw.schoolSize : [1, 3],
    fighter: raw?.fighter !== false,
    lineRunner: raw?.lineRunner === true,
    runPower: raw?.runPower == null ? null : Number(raw.runPower),
    fightStyle: raw?.fightStyle,
    conservation: raw?.conservation || null,
  };
}

function clamp01(v) {
  return Math.max(0, Math.min(1, Number(v) || 0));
}

const RARITY_WEIGHT = { common: 1, uncommon: 0.55, rare: 0.22 };

// Score how willing a species is to eat this lure at this depth. Returns
// { species, weight }. No allocation in the hot loop beyond the array itself.
export function scoreSpecies(species, lure, depthM = 1) {
  if (!species || species.fighter === false) return 0;
  let w = RARITY_WEIGHT[species.rarity] ?? 0.7;
  const affinity = lure.species || [];
  if (species.lureTypes?.includes(lure.id)) w *= 2.6;
  if (affinity.includes(species.id)) w *= 1.9;
  const [shallow, deep] = lure.band;
  if (depthM >= shallow - 0.6 && depthM <= deep + 0.8) w *= 1.35;
  else w *= 0.26;
  return w;
}

export function pickSpecies(speciesList, lure, depthM, rng = Math.random) {
  let total = 0;
  const weights = [];
  for (let i = 0; i < speciesList.length; i++) {
    const w = scoreSpecies(speciesList[i], lure, depthM);
    weights.push(w);
    total += w;
  }
  if (total <= 0) return speciesList[0] || null;
  let r = rng() * total;
  for (let i = 0; i < speciesList.length; i++) {
    r -= weights[i];
    if (r <= 0) return speciesList[i];
  }
  return speciesList[speciesList.length - 1];
}

// Length biased slightly below the middle of the range, weight derived from a
// cube-ish length ratio so a 90% length fish is a genuinely memorable fish.
export function rollSizeWeight(species, rng = Math.random) {
  const t = Math.pow(rng(), 1.35) * 0.82 + rng() * 0.18;
  const [l0, l1] = species.sizeCm;
  const [w0, w1] = species.weightKg;
  const lengthCm = l0 + (l1 - l0) * Math.min(1, t);
  const ratio = (lengthCm - l0) / Math.max(1e-3, l1 - l0);
  const weightKg = w0 + (w1 - w0) * Math.pow(ratio, 2.65);
  return {
    lengthCm: Math.round(lengthCm * 10) / 10,
    weightKg: Math.round(weightKg * 100) / 100,
  };
}

export function availableSpecies(fishSystem) {
  const list = Array.isArray(fishSystem?.species) ? fishSystem.species : [];
  const usable = list.filter(Boolean).map(normalizeSpecies);
  if (usable.length >= 4) return { list: usable, source: 'shared' };
  return {
    list: FALLBACK_SPECIES.map(normalizeSpecies),
    source: usable.length ? 'mixed' : 'fallback',
    sharedCount: usable.length,
    merged: usable.length ? usable : null,
  };
}

// Prefer the shared ecology when it is real, but never let it shrink the pool
// below a playable six.
export function buildSpeciesPool(fishSystem) {
  const shared = Array.isArray(fishSystem?.species) ? fishSystem.species : [];
  const usable = shared.filter(Boolean).map(normalizeSpecies);
  const local = FALLBACK_SPECIES.map(normalizeSpecies);
  if (usable.length >= 6) return { list: usable, source: 'shared' };
  const byId = new Map(local.map((s) => [s.id, s]));
  for (const s of usable) {
    // shared data wins on a name collision, but fill in missing fight styles
    byId.set(s.id, { ...(byId.get(s.id) || {}), ...s });
  }
  return {
    list: [...byId.values()],
    source: usable.length ? 'mixed' : 'fallback',
  };
}
