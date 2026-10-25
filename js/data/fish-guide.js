// 南海 · South China Sea fish guide (round 6)
//
// Researched by the Lead. `mustRelease` species cannot be kept or used as live
// catch; `advisoryRelease` species can be kept but the card suggests release.
// Non-catchable species are guide-only (humphead wrasse, leopard coral grouper,
// Japanese Spanish mackerel, giant trevally) and never enter the fishing pool.
// `gear` is the recommended rod power / leader / lure shown on each guide card.

export const FISH_GUIDE = [
  {
    id: 'yellowfin-tuna',
    nameCn: '黄鳍金枪鱼',
    nameEn: 'Yellowfin Tuna',
    latin: 'Thunnus albacares',
    status: 'LC',
    statusLabel: '无危',
    depth: '0–40 M',
    methods: ['JIG', 'MINNOW', 'POPPER'],
    size: '45–155 CM',
    gear: { rod: 'M/MH', lb: 20, lure: '米诺 · 铅笔' },
    note: '表层高速巡游，追流与鸟群。',
  },
  {
    id: 'bigeye-tuna',
    nameCn: '大眼金枪鱼',
    nameEn: 'Bigeye Tuna',
    latin: 'Thunnus obesus',
    status: 'VU',
    statusLabel: '易危',
    mustRelease: true,
    depth: '20–120 M',
    methods: ['JIG', 'MINNOW'],
    size: '50–180 CM',
    gear: { rod: 'H', lb: 30, lure: '铁板' },
    note: '深水金枪鱼；易危物种，钓获必须放流。',
  },
  {
    id: 'mahi-mahi',
    nameCn: '鲯鳅',
    nameEn: 'Mahi-mahi',
    latin: 'Coryphaena hippurus',
    status: 'LC',
    statusLabel: '无危',
    depth: '0–20 M',
    methods: ['MINNOW', 'POPPER', 'PENCIL'],
    size: '45–115 CM',
    gear: { rod: 'M', lb: 16, lure: '米诺 · 铅笔' },
    note: '漂浮物与马尾藻下的高速猎手。',
  },
  {
    id: 'giant-trevally',
    nameCn: '珍鲹',
    nameEn: 'Giant Trevally',
    latin: 'Caranx ignobilis',
    status: 'LC',
    statusLabel: '无危',
    depth: '0–30 M',
    methods: ['POPPER', 'JIG'],
    size: '40–150 CM',
    gear: { rod: 'MH', lb: 30, lure: '波爬' },
    note: '礁缘伏击，水面炸水极具爆发力。',
  },
  {
    id: 'cobia',
    nameCn: '军曹鱼',
    nameEn: 'Cobia',
    latin: 'Rachycentron canadum',
    status: 'LC',
    statusLabel: '无危',
    depth: '5–60 M',
    methods: ['JIG', 'MINNOW', 'SOFT'],
    size: '50–145 CM',
    gear: { rod: 'M/MH', lb: 20, lure: '铁板 · 软虫' },
    note: '贴着船舷打量你的礁边影子。',
  },
  {
    id: 'red-snapper',
    nameCn: '红鳍笛鲷',
    nameEn: 'Red Snapper',
    latin: 'Lutjanus erythropterus',
    status: 'LC',
    statusLabel: '无危',
    depth: '20–90 M',
    methods: ['JIG', 'SOFT', 'MINNOW'],
    size: '25–78 CM',
    gear: { rod: 'ML/M', lb: 12, lure: '软虫' },
    note: '暮光带礁栖，底层慢跳与铁板都有效。',
  },
  {
    id: 'giant-grouper',
    nameCn: '鞍带石斑鱼',
    nameEn: 'Giant Grouper',
    latin: 'Epinephelus lanceolatus',
    status: 'DD',
    statusLabel: '数据缺乏',
    advisoryRelease: true,
    depth: '20–100 M',
    methods: ['JIG', 'SOFT'],
    size: '60–220 CM',
    gear: { rod: 'H', lb: 30, lure: '铁板 · 软虫' },
    note: '大型礁栖鱼，种群数据缺乏。',
  },
  {
    id: 'leopard-coral-grouper',
    nameCn: '豹纹鳃棘鲈',
    nameEn: 'Leopard Coral Grouper',
    latin: 'Plectropomus leopardus',
    status: 'LC',
    statusLabel: '无危',
    depth: '10–60 M',
    methods: ['JIG', 'SOFT'],
    size: '30–80 CM',
    gear: { rod: 'M', lb: 20, lure: '软虫' },
    note: '珊瑚礁经典目标鱼，底跳与慢摇。',
  },
  {
    id: 'japanese-spanish-mackerel',
    nameCn: '日本马鲛',
    nameEn: 'Japanese Spanish Mackerel',
    latin: 'Scomberomorus niphonius',
    status: 'LC',
    statusLabel: '无危',
    depth: '0–30 M',
    methods: ['MINNOW', 'PENCIL'],
    size: '35–100 CM',
    gear: { rod: 'M', lb: 20, lure: '米诺' },
    note: '沿岸表层快速巡游，追小饵。',
  },
  {
    id: 'hairtail',
    nameCn: '带鱼',
    nameEn: 'Largehead Hairtail',
    latin: 'Trichiurus lepturus',
    status: 'LC',
    statusLabel: '无危',
    depth: '20–120 M',
    methods: ['JIG', 'MINNOW'],
    size: '50–130 CM',
    gear: { rod: 'ML', lb: 12, lure: '铁板' },
    note: '夜间上浮，银白色长身；咬口轻。',
  },
  {
    id: 'parrotfish',
    nameCn: '鹦嘴鱼',
    nameEn: 'Parrotfish',
    latin: 'Scarus ghobban',
    status: 'LC',
    statusLabel: '无危',
    advisoryRelease: true,
    depth: '2–30 M',
    methods: ['SOFT', 'MINNOW'],
    size: '20–62 CM',
    gear: { rod: 'L', lb: 12, lure: '软虫' },
    note: '珊瑚礁偶捕；非主要目标。',
  },
  {
    id: 'humphead-wrasse',
    nameCn: '波纹唇鱼',
    nameEn: 'Humphead Wrasse',
    latin: 'Cheilinus undulatus',
    status: 'EN',
    statusLabel: '濒危',
    mustRelease: true,
    cites: 'CITES II',
    depth: '2–60 M',
    methods: ['非路亚目标'],
    size: '60–200 CM',
    gear: { rod: 'H', lb: 30, lure: '非路亚' },
    note: '濒危 / CITES II；保护物种，禁止钓捕与留护。',
  },
];

export const GUIDE_BY_ID = new Map(FISH_GUIDE.map((g) => [g.id, g]));

export function guideFor(id) {
  return GUIDE_BY_ID.get(String(id || '')) || null;
}

export function isProtectedSpecies(species) {
  if (!species) return false;
  if (species.conservation?.mustRelease) return true;
  const g = guideFor(species.id || species.sourceId);
  return !!g?.mustRelease;
}

export function advisoryFor(species) {
  if (!species) return false;
  if (species.conservation?.advisoryRelease) return true;
  const g = guideFor(species.id || species.sourceId);
  return !!g?.advisoryRelease;
}
