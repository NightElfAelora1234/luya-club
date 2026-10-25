// Open-source campaign copy shown while the sign follows the dive.
// Replace these strings when re-skinning the site for another manufacturer.
// Deliberately generic: no real brand, region, product or price.

export const PROMOS = [
  {
    from: 0.105, to: 0.195, index: '01',
    kicker: 'OPEN WATER CAMPAIGN',
    title: 'CAST BEYOND',
    cn: '抛向更远',
    sub: 'LIGHT · DISTANCE · CONTROL',
  },
  {
    from: 0.275, to: 0.385, index: '02',
    kicker: 'SALTWATER SERIES',
    title: 'BUILT FOR OPEN WATER',
    cn: '为开放水域而生',
    sub: 'CURRENT · PRESSURE · TIME',
  },
  {
    from: 0.465, to: 0.585, index: '03',
    kicker: 'FOR THE DEEP',
    title: 'PRESSURE MAKES FORM',
    cn: '深场，见真章',
    sub: '60–120 M · CONCEPT PLATFORM',
  },
  {
    from: 0.655, to: 0.775, index: '04',
    kicker: 'OPEN WATER PROGRAM',
    title: 'MADE TO BE RE-BRANDED',
    cn: '为品牌而留白',
    sub: 'A WHITE-LABEL CAMPAIGN FRAME',
  },
  {
    from: 0.835, to: 0.925, index: '05',
    kicker: 'CONCEPT CAMPAIGN',
    title: 'YOUR WATER. YOUR RULES.',
    cn: '你的水域，你定义',
    sub: 'PLACEHOLDER COPY · 可替换文案',
  },
];

export function promoAt(progress) {
  for (let i = 0; i < PROMOS.length; i++) {
    const item = PROMOS[i];
    if (progress >= item.from && progress <= item.to) return item;
  }
  return null;
}
