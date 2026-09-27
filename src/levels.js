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
const totem = (x, z, yb) => ({ x, y: yb + TOTEM.h / 2 + GAP, z });
const nest = (x, z, yb) => ({ x, y: yb + NEST.h / 2 + GAP, z });

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
    id: 9, name: 'Karışık', hint: 'Her mermiyi doğru hedefe sakla.', teaches: 'birleşim',
    speed: 14, ammo: ['normal', 'heavy', 'ember'],
    statics: [ped(-1.9, 6.2, 0.5)],
    blocks: [
      box(1.9, 5, 0, 0.9, 0.9, 0.9, 'ice'),
      pillar(0.45, 5.5, 0, 1.6), pillar(-0.45, 5.5, 0, 1.6), plankX(0, 5.5, 1.6, 1.5, 0.3, 0.8),
      box(-1.9, 4.8, 0, 1.0, 1.2, 0.8, 'stone'),
    ],
    cages: [cage(0, 5.5, 1.9), cage(-1.9, 6.2, 0.5)],
    totems: [totem(1.9, 5, 0.9)],
  },
  {
    id: 10, name: 'Büyük kale', hint: 'Kafesleri kurtar, totemi devir, yuvayı koru.', teaches: 'birleşim',
    speed: 14, ammo: ['normal', 'normal', 'heavy', 'ember'],
    statics: [ped(0, 6.5, 1.0, 1.0, 1.0)],
    blocks: [
      box(0, 3.2, 0, 3.0, 0.7, 0.35, 'ice'),
      pillar(2.1, 5, 0, 1.8), pillar(1.3, 5, 0, 1.8), plankX(1.7, 5, 1.8, 1.4, 0.3, 0.8),
      pillar(-2.1, 5, 0, 1.8), pillar(-1.3, 5, 0, 1.8), plankX(-1.7, 5, 1.8, 1.4, 0.3, 0.8),
    ],
    cages: [cage(1.7, 5, 2.1), cage(-1.7, 5, 2.1), cage(0, 6.5, 1.0)],
    totems: [totem(0.9, 7.9, 0)],
    nests: [nest(2.8, 3.6, 0)],
  },
];
