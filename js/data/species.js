// ─────────────────────────────────────────────────────────────────────────────
// 南海 · South China Sea species catalogue  (owner: fish)
// Shared with the fishing simulation (ctx.fish.species) and consumed by the
// procedural fish geometry/material builders in js/world/fish/.
//
// Species objects carry EXACTLY the fields promised in CONTRACT.md §2.1.
// Geometric / shader authoring parameters live in FORMS (keyed by species id)
// so gameplay data never depends on how a fish is modelled.
// ─────────────────────────────────────────────────────────────────────────────

/** @typedef {{
 *   id:string, nameCn:string, nameEn:string, latin:string,
 *   zones:string[], sizeCm:[number,number], weightKg:[number,number],
 *   lureTypes:string[], fight:{power:number,speed:number,stamina:number},
 *   colors:{back:number,side:number,belly:number,fin:number,accent:number},
 *   rarity:'common'|'uncommon'|'rare', description:string,
 *   schoolSize:[number,number], fighter:boolean
 * }} Species */

/** @type {Species[]} */
export const SPECIES = [
  {
    id: 'yellowfin-tuna',
    nameCn: '黄鳍金枪鱼',
    nameEn: 'Yellowfin Tuna',
    latin: 'Thunnus albacares',
    zones: ['surface', 'sunlit'],
    sizeCm: [45, 155],
    weightKg: [1.6, 58],
    lureTypes: ['jig', 'minnow', 'popper'],
    fight: { power: 0.92, speed: 0.86, stamina: 0.94 },
    lineRunner: true,
    runPower: 1.0,
    colors: { back: 0x0f2238, side: 0xd0b268, belly: 0xe8e0c8, fin: 0xf3c53c, accent: 0xffd44f },
    rarity: 'rare',
    conservation: { status: 'LC', label: '无危' },
    description: '金枪鱼从不真正停下，它的一生都在追逐下一道涌流。',
    schoolSize: [4, 9],
    fighter: true,
  },
  {
    id: 'bigeye-tuna',
    nameCn: '大眼金枪鱼',
    nameEn: 'Bigeye Tuna',
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
    nameEn: 'Cobia',
    latin: 'Rachycentron canadum',
    zones: ['sunlit', 'twilight'],
    sizeCm: [50, 145],
    weightKg: [2, 42],
    lureTypes: ['jig', 'minnow', 'soft'],
    fight: { power: 0.85, speed: 0.58, stamina: 0.82 },
    lineRunner: true,
    runPower: 0.8,
    colors: { back: 0x2b2720, side: 0x9a815c, belly: 0xd8ccb0, fin: 0x6b573c, accent: 0xe2cb97 },
    rarity: 'uncommon',
    description: '礁石边最沉的影子，常常贴着船舷打量你。',
    schoolSize: [2, 5],
    fighter: true,
  },
  {
    id: 'mahi-mahi',
    nameCn: '鲯鳅',
    nameEn: 'Mahi-mahi',
    latin: 'Coryphaena hippurus',
    zones: ['surface'],
    sizeCm: [45, 115],
    weightKg: [1, 13],
    lureTypes: ['minnow', 'popper', 'pencil'],
    fight: { power: 0.8, speed: 0.96, stamina: 0.7 },
    lineRunner: true,
    runPower: 0.85,
    colors: { back: 0x145a50, side: 0x2fa46f, belly: 0xe8c94e, fin: 0x3b8fc9, accent: 0x66d4f2 },
    rarity: 'uncommon',
    description: '海面上最艳的一道蓝绿闪电，被钓起之后仍不肯收起颜色。',
    schoolSize: [2, 6],
    fighter: true,
  },
  {
    id: 'red-snapper',
    nameCn: '红鳍笛鲷',
    nameEn: 'Red Snapper',
    latin: 'Lutjanus erythropterus',
    zones: ['twilight', 'deep'],
    sizeCm: [25, 78],
    weightKg: [0.5, 6.4],
    lureTypes: ['jig', 'soft', 'minnow'],
    fight: { power: 0.6, speed: 0.55, stamina: 0.66 },
    colors: { back: 0x80242b, side: 0xdd5238, belly: 0xefb694, fin: 0xe34d34, accent: 0xffd9ad },
    rarity: 'common',
    description: '暮光带里的红鲷，鳞片像被最后一缕夕阳浸过一遍。',
    schoolSize: [6, 14],
    fighter: true,
  },
  {
    id: 'giant-grouper',
    nameCn: '鞍带石斑鱼',
    nameEn: 'Giant Grouper',
    latin: 'Epinephelus lanceolatus',
    zones: ['twilight', 'deep', 'floor'],
    sizeCm: [60, 220],
    weightKg: [4, 180],
    lureTypes: ['jig', 'soft'],
    fight: { power: 1.0, speed: 0.34, stamina: 0.98 },
    colors: { back: 0x302a1f, side: 0x8a7353, belly: 0xc8b693, fin: 0x5a4a34, accent: 0xc9a86b },
    rarity: 'rare',
    conservation: { status: 'DD', label: '数据缺乏', advisoryRelease: true, note: '大型礁栖鱼 · 建议放流' },
    description: '鞍带石斑在礁洞里等了很多年，只为一个不够谨慎的猎物。',
    schoolSize: [1, 2],
    fighter: true,
  },
  {
    id: 'parrotfish',
    nameCn: '鹦嘴鱼',
    nameEn: 'Parrotfish',
    latin: 'Scarus ghobban',
    zones: ['sunlit', 'twilight'],
    sizeCm: [20, 62],
    weightKg: [0.3, 3.6],
    lureTypes: ['soft', 'minnow'],
    fight: { power: 0.55, speed: 0.5, stamina: 0.55 },
    colors: { back: 0x22726a, side: 0x38ad90, belly: 0xe8cf92, fin: 0xf7a85c, accent: 0xffc882 },
    rarity: 'common',
    conservation: { status: 'LC', label: '无危', advisoryRelease: true, note: '珊瑚礁偶捕 · 建议放流' },
    description: '鹦嘴鱼啃食珊瑚，最后把整座礁石嚼成细白的沙。',
    schoolSize: [4, 10],
    fighter: true,
  },
  {
    id: 'lionfish',
    nameCn: '狮子鱼',
    nameEn: 'Lionfish',
    latin: 'Pterois volitans',
    zones: ['deep'],
    sizeCm: [12, 38],
    weightKg: [0.2, 1.1],
    lureTypes: ['soft', 'jig'],
    fight: { power: 0.3, speed: 0.3, stamina: 0.32 },
    colors: { back: 0x802a1c, side: 0xd4552f, belly: 0xf2e2c8, fin: 0xf5cf9f, accent: 0xffeccd },
    rarity: 'uncommon',
    description: '狮子鱼把每一根鳍条都当作警告，缓慢地、优雅地靠近。',
    schoolSize: [1, 3],
    fighter: true,
  },
  {
    id: 'hairtail',
    nameCn: '带鱼',
    nameEn: 'Largehead Hairtail',
    latin: 'Trichiurus lepturus',
    zones: ['deep'],
    sizeCm: [50, 132],
    weightKg: [0.3, 2.3],
    lureTypes: ['jig', 'minnow'],
    fight: { power: 0.5, speed: 0.66, stamina: 0.44 },
    colors: { back: 0x5c6a70, side: 0xc6d1d4, belly: 0xdde6e7, fin: 0xb9c9cd, accent: 0xe4f0f0 },
    rarity: 'common',
    description: '带鱼像一条被海放逐的银线，在无光的深处直立着漂。',
    schoolSize: [4, 9],
    fighter: true,
  },
  {
    id: 'scad',
    nameCn: '蓝圆鲹',
    nameEn: 'Scad',
    latin: 'Decapterus maruadsi',
    zones: ['sunlit', 'twilight'],
    sizeCm: [12, 32],
    weightKg: [0.1, 0.5],
    lureTypes: ['minnow', 'jig'],
    fight: { power: 0.3, speed: 0.62, stamina: 0.24 },
    colors: { back: 0x1a4463, side: 0xb9ced7, belly: 0xe4ecee, fin: 0xb3c4c9, accent: 0xebd27c },
    rarity: 'common',
    description: '蓝圆鲹聚成一颗移动的金属球，光在鳞面上碎成无数点。',
    schoolSize: [24, 60],
    fighter: false,
  },
];

export const SPECIES_BY_ID = new Map(SPECIES.map((s) => [s.id, s]));

export function getSpecies(id) {
  return SPECIES_BY_ID.get(id) || null;
}

// Which lure works on which species (fishing UI helper).
export function speciesForLure(lureType) {
  return SPECIES.filter((s) => s.fighter && s.lureTypes.includes(lureType));
}

// ─────────────────────────────────────────────────────────────────────────────
// FORMS — procedural anatomy. All linear measures are fractions of fork length.
// z on the built mesh runs from +0.5 (nose) to −0.5 (caudal base); t = 0 (nose)
// … 1 (tail base). Fins reference t.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * body.depth   max body depth / length
 * body.width   max body width / length
 * body.peak    t of maximum girth
 * body.headPow 1 = sharp wedge nose, <1 = long slow taper, >1 = abrupt head
 * body.tailPow how fast the body narrows toward the peduncle
 * body.noseGirth / peduncle : girth retained at t=0 / t=1 (0..1 of max girth)
 * body.section  2 = ellipse, >2 = slab-sided (compressed fish)
 * body.headBulge extra girth around the head (hairtail forehead, grouper jaw)
 */
export const FORMS = {
  'yellowfin-tuna': {
    body: { depth: 0.305, width: 0.285, peak: 0.34, headPow: 0.5, tailPow: 1.15, noseGirth: 0.075, peduncle: 0.2, section: 2.02, bellyBias: 0.006, headRise: 0.004, headBulge: 0.06, headSlope: 0.032, cheek: 0.06, cheekCenter: 0.15, cheekWidth: 0.09 },
    eye: { size: 0.02, t: 0.135, y: 0.036, bulge: 1.3 },
    gill: { t: 0.195, width: 0.022, plate: 1.7 },
    mouth: { t: 0.035, size: 1.15, open: 0.34, jaw: 0.35 },
    fins: {
      dorsal: { t: [0.2, 0.63], height: 0.17, sweep: 0.55, style: 'sickle', rays: 13 },
      dorsal2: { t: [0.63, 0.72], height: 0.055, sweep: 0.4, rays: 8 },
      anal: { t: [0.57, 0.72], height: 0.062, sweep: 0.4, rays: 8 },
      pectoral: { t: 0.26, len: 0.33, spread: 0.72, down: 0.3, shape: 'sickle', rays: 11 },
      pelvic: { t: 0.29, len: 0.09, spread: 0.6 },
      caudal: { type: 'lunate', span: 0.38, len: 0.34, bow: 0.012, fork: 0.28, rays: 17 },
      finlets: { count: 7, t: [0.655, 0.87], height: 0.042, rows: 2 },
    },
    pattern: 1, irid: 0.5, rough: 0.3, metal: 0.38, scale: [28, 46], glow: 0.2, detail: 1.0, wet: 0.55, finRays: 13,
    swim: { speed: 7.2, amp: 0.05, wave: 4.9 },
    bubbles: 0.18,
  },
  cobia: {
    body: { depth: 0.27, width: 0.24, peak: 0.35, headPow: 0.46, tailPow: 1.28, noseGirth: 0.085, peduncle: 0.24, section: 2.12, bellyBias: 0.005, headRise: 0.006, headBulge: 0.05, headSlope: 0.038, cheek: 0.08, cheekCenter: 0.14, cheekWidth: 0.1 },
    eye: { size: 0.021, t: 0.14, y: 0.036, bulge: 1.22 },
    gill: { t: 0.2, width: 0.022, plate: 1.6 },
    mouth: { t: 0.04, size: 1.55, open: 0.4, jaw: 0.5 },
    fins: {
      dorsal: { t: [0.16, 0.7], height: 0.09, sweep: 0.45, style: 'long', rays: 13 },
      anal: { t: [0.54, 0.76], height: 0.072, sweep: 0.45, rays: 11 },
      pectoral: { t: 0.27, len: 0.235, spread: 0.7, down: 0.4, shape: 'round', rays: 10 },
      pelvic: { t: 0.3, len: 0.085, spread: 0.5 },
      caudal: { type: 'rounded', span: 0.33, len: 0.26, bow: 0.008, fork: 0.5, rays: 15 },
    },
    pattern: 9, irid: 0.22, rough: 0.4, metal: 0.2, scale: [22, 50], glow: 0.16, detail: 1.0, wet: 0.45, finRays: 13,
    swim: { speed: 5.6, amp: 0.052, wave: 4.1 },
    bubbles: 0.08,
  },
  'mahi-mahi': {
    body: { depth: 0.3, width: 0.215, peak: 0.36, headPow: 0.9, tailPow: 1.3, noseGirth: 0.3, peduncle: 0.16, section: 2.25, bellyBias: 0.008, headRise: 0.012, headBulge: 0.055, headSlope: 0.075, cheek: 0.07, cheekCenter: 0.13, cheekWidth: 0.09 },
    eye: { size: 0.022, t: 0.125, y: 0.036, bulge: 1.25 },
    gill: { t: 0.205, width: 0.024, plate: 1.7 },
    mouth: { t: 0.045, size: 1.65, open: 0.45, jaw: 0.55 },
    fins: {
      dorsal: { t: [0.1, 0.66], height: 0.34, sweep: 0.5, style: 'sail', rays: 17 },
      anal: { t: [0.54, 0.7], height: 0.14, sweep: 0.5, style: 'sail', rays: 11 },
      pectoral: { t: 0.28, len: 0.27, spread: 0.8, down: 0.55, shape: 'sickle', rays: 11 },
      pelvic: { t: 0.27, len: 0.18, spread: 0.5, style: 'long' },
      caudal: { type: 'forked', span: 0.36, len: 0.3, bow: 0.014, fork: 0.42, rays: 15 },
    },
    pattern: 2, irid: 0.66, rough: 0.26, metal: 0.4, scale: [30, 42], glow: 0.26, detail: 1.0, wet: 0.62, finRays: 17,
    swim: { speed: 8.0, amp: 0.055, wave: 4.4 },
    bubbles: 0.06,
  },
  'red-snapper': {
    body: { depth: 0.43, width: 0.235, peak: 0.4, headPow: 0.58, tailPow: 1.35, noseGirth: 0.12, peduncle: 0.2, section: 2.28, bellyBias: 0.012, headRise: 0.014, headBulge: 0.05, headSlope: 0.062, cheek: 0.075, cheekCenter: 0.14, cheekWidth: 0.09 },
    eye: { size: 0.024, t: 0.13, y: 0.042, bulge: 1.28 },
    gill: { t: 0.205, width: 0.024, plate: 1.8 },
    mouth: { t: 0.045, size: 1.35, open: 0.42, jaw: 0.6 },
    fins: {
      dorsal: { t: [0.17, 0.69], height: 0.155, sweep: 0.35, style: 'notched', rays: 13 },
      anal: { t: [0.58, 0.75], height: 0.1, sweep: 0.35, style: 'notched', rays: 10 },
      pectoral: { t: 0.28, len: 0.235, spread: 0.65, down: 0.45, shape: 'round', rays: 10 },
      pelvic: { t: 0.32, len: 0.115, spread: 0.55 },
      caudal: { type: 'forked', span: 0.4, len: 0.28, bow: 0.01, fork: 0.5, rays: 15 },
    },
    pattern: 3, irid: 0.34, rough: 0.33, metal: 0.28, scale: [26, 52], glow: 0.22, detail: 1.0, wet: 0.5, finRays: 13,
    swim: { speed: 5.0, amp: 0.045, wave: 4.0 },
    bubbles: 0.04,
  },
  'giant-grouper': {
    body: { depth: 0.35, width: 0.3, peak: 0.36, headPow: 0.66, tailPow: 1.3, noseGirth: 0.2, peduncle: 0.17, section: 1.95, bellyBias: 0.012, headRise: 0.026, headBulge: 0.13, headBulgeCenter: 0.08, headBulgeWidth: 0.16, headSlope: 0.12, cheek: 0.09, cheekCenter: 0.15, cheekWidth: 0.1 },
    eye: { size: 0.024, t: 0.12, y: 0.04, bulge: 1.15 },
    gill: { t: 0.21, width: 0.032, plate: 2.1 },
    mouth: { t: 0.055, size: 3.2, open: 0.78, jaw: 1.15 },
    fins: {
      dorsal: { t: [0.16, 0.74], height: 0.095, sweep: 0.32, style: 'notched', rays: 12 },
      anal: { t: [0.6, 0.82], height: 0.08, sweep: 0.32, rays: 9 },
      pectoral: { t: 0.28, len: 0.245, spread: 0.7, down: 0.5, shape: 'round', rays: 11 },
      pelvic: { t: 0.31, len: 0.095, spread: 0.55 },
      caudal: { type: 'rounded', span: 0.26, len: 0.18, bow: 0.006, fork: 0.86, rays: 15 },
    },
    pattern: 4, irid: 0.12, rough: 0.54, metal: 0.12, scale: [36, 70], glow: 0.16, detail: 1.0, wet: 0.4, finRays: 12,
    swim: { speed: 3.4, amp: 0.04, wave: 3.4 },
    bubbles: 0.05,
  },
  parrotfish: {
    body: { depth: 0.4, width: 0.245, peak: 0.4, headPow: 0.62, tailPow: 1.28, noseGirth: 0.19, peduncle: 0.2, section: 2.28, bellyBias: 0.014, headRise: 0.018, headBulge: 0.06, headSlope: 0.055, cheek: 0.075, cheekCenter: 0.14, cheekWidth: 0.09 },
    eye: { size: 0.022, t: 0.13, y: 0.041, bulge: 1.18 },
    gill: { t: 0.205, width: 0.024, plate: 1.6 },
    mouth: { t: 0.04, size: 1.3, open: 0.55, jaw: 0.9 },
    fins: {
      dorsal: { t: [0.2, 0.66], height: 0.13, sweep: 0.3, style: 'long', rays: 12 },
      anal: { t: [0.6, 0.75], height: 0.11, sweep: 0.3, rays: 10 },
      pectoral: { t: 0.29, len: 0.25, spread: 0.75, down: 0.4, shape: 'fan', rays: 11 },
      pelvic: { t: 0.31, len: 0.105, spread: 0.6 },
      caudal: { type: 'fan', span: 0.37, len: 0.25, bow: 0.01, fork: 0.85, rays: 15 },
    },
    pattern: 5, irid: 0.52, rough: 0.28, metal: 0.34, scale: [22, 44], glow: 0.22, detail: 1.0, wet: 0.55, finRays: 12,
    swim: { speed: 5.2, amp: 0.045, wave: 4.2 },
    bubbles: 0.05,
  },
  lionfish: {
    body: { depth: 0.24, width: 0.17, peak: 0.36, headPow: 0.62, tailPow: 1.45, noseGirth: 0.14, peduncle: 0.16, section: 2.12, bellyBias: 0.012, headRise: 0.02, headBulge: 0.1, headSlope: 0.05, cheek: 0.07, cheekCenter: 0.15, cheekWidth: 0.09 },
    eye: { size: 0.024, t: 0.125, y: 0.032, bulge: 1.3 },
    gill: { t: 0.2, width: 0.026, plate: 1.6 },
    mouth: { t: 0.045, size: 1.8, open: 0.5, jaw: 0.7 },
    fins: {
      dorsal: { t: [0.17, 0.52], height: 0.065, sweep: 0.4, style: 'long', rays: 11 },
      anal: { t: [0.56, 0.7], height: 0.085, sweep: 0.45, rays: 9 },
      pectoral: { t: 0.3, len: 0.52, spread: 1.95, down: 0.12, shape: 'fan', rays: 15, big: true },
      pelvic: { t: 0.31, len: 0.34, spread: 0.9, style: 'spine' },
      caudal: { type: 'fan', span: 0.4, len: 0.23, bow: 0.012, fork: 0.9, rays: 15 },
      spines: { count: 16, t: [0.16, 0.56], len: 0.52, lean: 0.55, width: 0.009 },
    },
    pattern: 6, irid: 0.3, rough: 0.32, metal: 0.22, scale: [20, 36], glow: 0.36, detail: 1.0, wet: 0.45, finRays: 15,
    swim: { speed: 4.4, amp: 0.04, wave: 4.0 },
    bubbles: 0.06,
  },
  hairtail: {
    body: { depth: 0.115, width: 0.085, peak: 0.3, headPow: 0.42, tailPow: 2.05, noseGirth: 0.16, peduncle: 0.06, section: 2.0, bellyBias: 0.002, headRise: 0.01, headBulge: 0.5, headBulgeCenter: 0.07, headBulgeWidth: 0.09, headSlope: 0.02, cheek: 0.03, cheekCenter: 0.1, cheekWidth: 0.08 },
    eye: { size: 0.017, t: 0.13, y: 0.02, bulge: 1.05 },
    gill: { t: 0.24, width: 0.028, plate: 1.3 },
    mouth: { t: 0.05, size: 2.5, open: 0.62, jaw: 0.8 },
    fins: {
      dorsal: { t: [0.14, 0.6], height: 0.055, sweep: 0.3, style: 'ribbon', rays: 9 },
      anal: { t: [0.42, 0.6], height: 0.045, sweep: 0.3, rays: 8 },
      pectoral: { t: 0.27, len: 0.075, spread: 0.55, down: 0.35, shape: 'round', rays: 7 },
      pelvic: null,
      caudal: { type: 'none' },
    },
    pattern: 7, irid: 0.6, rough: 0.26, metal: 0.44, scale: [24, 58], glow: 0.22, detail: 1.0, wet: 0.6, finRays: 9,
    swim: { speed: 4.2, amp: 0.12, ampY: 0.05, wave: 2.4 },
    bubbles: 0.07,
    upright: 0.42,
  },
  scad: {
    body: { depth: 0.3, width: 0.17, peak: 0.36, headPow: 0.5, tailPow: 1.25, noseGirth: 0.075, peduncle: 0.22, section: 2.06, bellyBias: 0.004, headRise: 0.004, headBulge: 0.03, headSlope: 0.03, cheek: 0.04, cheekCenter: 0.15, cheekWidth: 0.09 },
    eye: { size: 0.025, t: 0.13, y: 0.03, bulge: 1.3 },
    gill: { t: 0.2, width: 0.022, plate: 1.6 },
    mouth: { t: 0.04, size: 1.3, open: 0.4, jaw: 0.4 },
    fins: {
      dorsal: { t: [0.28, 0.54], height: 0.085, sweep: 0.35, style: 'sickle', rays: 11 },
      dorsal2: { t: [0.58, 0.67], height: 0.048, sweep: 0.3, rays: 7 },
      anal: { t: [0.58, 0.71], height: 0.052, sweep: 0.3, rays: 7 },
      pectoral: { t: 0.27, len: 0.17, spread: 0.55, down: 0.4, shape: 'sickle', rays: 9 },
      pelvic: { t: 0.33, len: 0.07, spread: 0.5 },
      caudal: { type: 'forked', span: 0.39, len: 0.28, bow: 0.008, fork: 0.48, rays: 15 },
    },
    pattern: 8, irid: 0.7, rough: 0.27, metal: 0.44, scale: [22, 48], glow: 0.2, detail: 0.7, wet: 0.62, finRays: 11,
    swim: { speed: 8.4, amp: 0.045, wave: 4.6 },
    bubbles: 0.02,
  },
};

// Bigeye reuses the yellowfin geometry with its own species/material data.
FORMS['bigeye-tuna'] = FORMS['yellowfin-tuna'];

export function getForm(id) {
  return FORMS[id] || FORMS['yellowfin-tuna'];
}
