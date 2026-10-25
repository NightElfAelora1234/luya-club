// Round-6 descent campaign — data + progress ranges.
// Everything here is generic concept copy: no real brand, manufacturer,
// region, product or price. Fork-friendly: change the strings and the two
// pages re-skin without touching the interaction code.

export const CAMPAIGNS = [
  {
    id: 'tackle',
    index: '01',
    side: -1,                // left edge, below the CAST BEYOND copy; logo stays right
    from: 0.128,
    to: 0.206,
    kicker: 'TACKLE PROGRAM',
    kickerCn: '装备系统',
    title: 'Four parts,',
    titleAccent: 'one language.',
    cn: '四个部件，一套语言。',
    desc: '竿、线、轮、饵。不是四件商品，是一条完整的抛投链路。',
    action: '查看产品页',
    actionEn: 'VIEW TACKLE',
    page: {
      eyebrow: 'TACKLE / 装备系统',
      pageNo: '01',
      title: 'Four parts,',
      titleAccent: 'one language.',
      cn: '四个部件，一套语言。',
      intro:
        '从竿梢到拟饵，我们把一次抛投拆成四个可以独立替换的部件。' +
        '它们共享同一套重量、节奏与手感；换掉其中一个，剩下的仍然成立。',
      note: '概念规格 · 通用参数 · 无任何真实品牌、厂商或地区标识',
      categories: [
        {
          no: '01', en: 'RODS', cn: '竿', kind: 'rod',
          lead: '把重量放在该在的位置。',
          specs: [
            ['LENGTH', '2.03–2.49 m'],
            ['POWER', 'ML–H'],
            ['LURE', '5–50 g'],
            ['PIECES', '2'],
          ],
          copy: '连续锥度，导环沿受力线排布。从近岸轻投到深场重饵，握感保持同一套节奏。',
        },
        {
          no: '02', en: 'LINES', cn: '线', kind: 'line',
          lead: '让每一次发力都被听见。',
          specs: [
            ['PE', '0.6–2.0'],
            ['STRANDS', '8'],
            ['LENGTH', '150–300 m'],
            ['STRETCH', 'LOW'],
          ],
          copy: '八股编织，低延展，前段顺滑。盐水中保持稳定的结节强度与出线噪音。',
        },
        {
          no: '03', en: 'REELS', cn: '轮', kind: 'reel',
          lead: '稳定，是唯一的炫耀。',
          specs: [
            ['SIZE', '1000–5000'],
            ['GEAR', '5.2:1–7.1:1'],
            ['DRAG', '5–12 kg'],
            ['BEARINGS', '9+1'],
          ],
          copy: '密封刹车，均匀出线。从轻量微物到近海重障，收线的第一圈与最后一圈同速。',
        },
        {
          no: '04', en: 'LURES', cn: '饵', kind: 'lure',
          lead: '五种动作，五种读水方式。',
          specs: [
            ['WEIGHT', '5–80 g'],
            ['ACTIONS', '5'],
            ['TYPE', 'SINK / FLOAT'],
            ['HOOK', 'TREBLE'],
          ],
          copy: '米诺、波爬、铁板、软虫、铅笔。按水层与流速选择，而不是按颜色。',
        },
      ],
      series: [
        { no: '01', en: 'OPEN WATER', cn: '开放水域', length: '6′8″–7′6″', power: 'ML–M', lure: '5–28 g', use: '近岸与开阔水面' },
        { no: '02', en: 'COASTAL', cn: '岸线', length: '7′6″–8′2″', power: 'M–MH', lure: '7–40 g', use: '礁盘、岬角与逆风' },
        { no: '03', en: 'DEEP', cn: '深场', length: '8′0″–8′2″', power: 'H', lure: '14–80 g', use: '深场与重障碍' },
      ],
    },
  },
  {
    id: 'brand',
    index: '02',
    side: -1,                // left edge; the logo is left of frame in this band
    from: 0.452,
    to: 0.585,
    kicker: 'BRAND PROGRAM',
    kickerCn: '品牌手册',
    title: 'Make room',
    titleAccent: 'for the water.',
    cn: '把位置，让给水。',
    desc: '一份关于轻、远与归还的品牌手记。',
    action: '打开品牌页',
    actionEn: 'VIEW BRAND',
    page: {
      eyebrow: 'BRAND / 品牌手册',
      pageNo: '02',
      title: 'Make room',
      titleAccent: 'for the water.',
      cn: '把位置，让给水。',
      intro:
        '我们不做征服水域的工具。我们把装备做得更轻、更远，然后在该放手的时候放手。' +
        '好的设计应该退后一步，让水本身成为主角。',
      quote: '好的装备不抢走水的注意力。它只是把你送到更接近水的地方。',
      quoteBy: 'OPEN WATER NOTES · 01',
      principles: [
        { no: '01', en: 'LIGHTNESS', cn: '轻', copy: '减少多余的重量与结构。让竿梢先于语言说话，让手腕记住节奏。' },
        { no: '02', en: 'REACH', cn: '远', copy: '远不是距离，是更长的滞空、更慢的收线、更清楚的判断。' },
        { no: '03', en: 'GIVE BACK', cn: '归还', copy: '放流、让位、克制。每一次把鱼放回水里，都是把位置还给水。' },
      ],
      notes: [
        '开放水域没有围栏。我们只在被允许的地方抛投，在不该留下痕迹的地方离开。',
        '可维修、可替换、可被重新命名。这套装备语言属于任何一个愿意重新开始的人。',
      ],
      caption: 'CAMPAIGN FRAME 01 · OPEN WATER / CONCEPT 2026',
    },
  },
];

export function campaignAt(progress) {
  if (!Number.isFinite(progress)) return null;
  for (let i = 0; i < CAMPAIGNS.length; i++) {
    const c = CAMPAIGNS[i];
    if (progress >= c.from && progress <= c.to) return c;
  }
  return null;
}

/** True while one of the two interactive plaques occupies the dive frame. */
export function inCampaignBand(progress) {
  return campaignAt(progress) !== null;
}
