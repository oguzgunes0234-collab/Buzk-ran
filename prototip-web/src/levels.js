// v4 levels, designed for the 3D camera behind the launcher: structures spread
// across the width (x) instead of lining up in depth. x > 0 is on the LEFT of
// the screen (camera looks along +z). Each new element is introduced alone
// before it is combined with others.
import { CAGE_SIZE, TOTEM, NEST } from './sim.js';

const GAP = 0.002; // tiny gap so stacked bodies do not start interpenetrating

const box = (x, z, yb, w, h, d, mat = 'wood') => ({ x, y: yb + h / 2 + GAP, z, w, h, d, mat });
const pillar = (x, z, yb, h = 1.8, s = 0.55, mat = 'wood') => box(x, z, yb, s, h, s, mat);
const plankX = (x, z, yb, len = 2.0, t = 0.3, dep = 0.8, mat = 'wood') => box(x, z, yb, len, t, dep, mat);
const ped = (x, z, h, w = 1.2, d = 1.2) => ({ x, y: h / 2, z, w, h, d });
const cage = (x, z, yb) => ({ x, y: yb + CAGE_SIZE / 2 + GAP, z });
const totem = (x, z, yb, mat) => ({ x, y: yb + TOTEM.h / 2 + GAP, z, ...(mat ? { mat } : {}) });
const nest = (x, z, yb) => ({ x, y: yb + NEST.h / 2 + GAP, z });
// three cages side by side on one pedestal, optionally behind a low ice wall
const cageRow = (x, z, sp, wall) => ({
  statics: [ped(x, z, 0.6, 2 * sp + 1.0, 1.2)],
  blocks: wall ? [box(x, z - 0.9, 0, 2 * sp + 1.0, 0.9, 0.3, 'ice')] : [],
  cages: [cage(x + sp, z, 0.6), cage(x, z, 0.6), cage(x - sp, z, 0.6)],
});
const row9 = cageRow(-1.8, 6, 0.95, false);
const row10 = cageRow(-1.8, 6.2, 0.95, true);

export const LEVELS = [
  {
    id: 1, name: 'İlk atış', hint: 'Halkayı kafese getir ve bırak.', teaches: 'nişan',
    speed: 14, ammo: ['normal', 'normal', 'normal'],
    statics: [ped(0, 4, 1.0)],
    blocks: [],
    cages: [cage(0, 4, 1.0)],
  },
  {
    id: 2, name: 'Devrilen kule', hint: 'Kuleyi devir; düşen kafes kırılır.', teaches: 'devirme',
    speed: 14, ammo: ['normal', 'normal'],
    blocks: [pillar(0, 4.5, 0, 2.0, 0.65)],
    cages: [cage(0, 4.5, 2.0)],
  },
  {
    id: 3, name: 'Sağ ve sol', hint: 'Sağa-sola sürükleyerek yönü değiştir.', teaches: 'yön',
    speed: 14, ammo: ['normal', 'normal', 'normal'],
    statics: [ped(1.8, 4, 0.8), ped(-1.8, 5.5, 1.3)],
    cages: [cage(1.8, 4, 0.8), cage(-1.8, 5.5, 1.3)],
  },
  {
    id: 4, name: 'Kırılgan buz', hint: 'Açık mavi buz bloklar sert bir darbeyle kırılır.', teaches: 'kırılgan buz',
    speed: 14, ammo: ['normal', 'normal', 'normal'],
    statics: [ped(0, 5.2, 0.9)],
    blocks: [box(0, 3.6, 0, 1.8, 0.8, 0.35, 'ice'), box(0, 3.6, 0.8, 1.8, 0.8, 0.35, 'ice')],
    cages: [cage(0, 5.2, 0.9)],
  },
  {
    id: 5, name: 'Ağır gülle', hint: 'Taş blok ağırdır. Ağır gülleyi seç ve taşı it.', teaches: 'ağır gülle, taş',
    speed: 14, ammo: ['heavy', 'normal'],
    statics: [ped(0, 5.2, 0.8)],
    blocks: [box(0, 3.8, 0, 1.4, 1.3, 1.0, 'stone')],
    cages: [cage(0, 5.2, 0.8)],
  },
  {
    id: 6, name: 'Köz', hint: 'Köz ilk değdiği yerde patlar; halka patlama alanını gösterir.', teaches: 'patlama',
    speed: 14, ammo: ['ember', 'normal', 'normal'],
    statics: [ped(0, 6, 0.6, 3.2, 1.2)],
    blocks: [box(0, 5.1, 0, 3.2, 0.9, 0.3, 'ice')],
    cages: [cage(1.0, 6, 0.6), cage(0, 6, 0.6), cage(-1.0, 6, 0.6)],
  },
  {
    id: 7, name: 'Totemler', hint: 'Mor buz totemlerini devir.', teaches: 'devirme hedefi',
    speed: 14, ammo: ['normal', 'normal', 'normal'],
    statics: [ped(1.4, 5, 0.5), ped(-1.4, 6, 0.5)],
    totems: [totem(1.4, 5, 0.5), totem(-1.4, 6, 0.5)],
  },
  {
    id: 8, name: 'Yuvayı koru', hint: 'Yumurtalı yuvaya zarar verme. Köz yakında patlarsa yuva da kırılır.', teaches: 'koruma hedefi',
    speed: 14, ammo: ['normal', 'normal', 'ember'],
    statics: [ped(0, 6.2, 1.3)],
    cages: [cage(0, 6.2, 1.3)],
    nests: [nest(0, 4.2, 0)],
  },
  {
    // v4.1: the stone totem can only be tipped by the heavy ball (bot: 0 hits
    // with normal or ember), so the heavy ball is needed; for the cage row the
    // ember is much wider than two normal shots, but not strictly needed.
    id: 9, name: 'Karışık', hint: 'Gri taş totemi yalnız Ağır gülle devirir. Kafes sırasına en iyisi Köz.', teaches: 'taş totem, birleşim',
    speed: 14, ammo: ['normal', 'heavy', 'ember'],
    statics: [ped(2.0, 4.8, 0.5, 1.6, 1.6), ...row9.statics],
    blocks: [...row9.blocks],
    cages: row9.cages,
    totems: [totem(2.0, 4.8, 0.5, 'stone')],
  },
  {
    // v4.1: heavy for the stone totem, ember (best) for the cage row, a normal
    // for the tower; the nest sits in front of the tower, so heavy or ember
    // shots to the left side put it at risk.
    id: 10, name: 'Büyük kale', hint: 'Taş totem Ağır ister. Yuvanın yakınında Ağır ve Köz tehlikeli.', teaches: 'birleşim',
    speed: 14, ammo: ['normal', 'normal', 'heavy', 'ember'],
    statics: [ped(0, 4.4, 0.5, 1.4, 1.4), ...row10.statics],
    blocks: [
      pillar(2.6, 5.6, 0, 1.8), pillar(1.8, 5.6, 0, 1.8), plankX(2.2, 5.6, 1.8, 1.4, 0.3, 0.8),
      ...row10.blocks,
    ],
    cages: [cage(2.2, 5.6, 2.1), ...row10.cages],
    totems: [totem(0, 4.4, 0.5, 'stone')],
    nests: [nest(2.2, 3.9, 0)],
  },
];
