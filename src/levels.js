// Level layouts. Every layout is a side profile (z = distance from the
// launcher, y = height) extruded along x, so the same layout can be played
// with the 3D-behind camera and the 2.5D-side camera.
// y/z values are body centers; w = size along x, h = height, d = depth along z.
import { CAGE_SIZE } from './sim.js';

const W = 1.4;
const GAP = 0.002; // tiny gap so stacked bodies do not start interpenetrating

const pillar = (z, yb, h = 1.8, d = 0.5) => ({ y: yb + h / 2 + GAP, z, w: W, h, d });
const plank = (z, yb, len = 2.4, t = 0.3) => ({ y: yb + t / 2 + GAP, z, w: W, h: t, d: len });
const cube = (z, yb, s = 0.5) => ({ y: yb + s / 2 + GAP, z, w: W, h: s, d: s });
const ped = (z, h, d = 1.2, w = 2.0) => ({ y: h / 2, z, w, h, d });
const cage = (z, yb) => ({ y: yb + CAGE_SIZE / 2 + GAP, z });

export const LEVELS = [
  {
    id: 1, name: 'İlk atış', hint: 'Buz kafese doğrudan vur.',
    speed: 14, shots: 3,
    statics: [ped(4, 1.0)],
    blocks: [],
    cages: [cage(4, 1.0)],
  },
  {
    id: 2, name: 'Devrilen kule', hint: 'Kuleyi devir; düşen kafes kırılır.',
    speed: 14, shots: 2,
    statics: [],
    blocks: [pillar(4, 0, 2.0, 0.7)],
    cages: [cage(4, 2.0)],
  },
  {
    id: 3, name: 'İki kule', hint: 'Biri diğerini devirebilir.',
    speed: 14, shots: 2,
    statics: [],
    blocks: [pillar(3, 0, 2.4, 0.8), pillar(5.4, 0, 2.4, 0.8)],
    cages: [cage(3, 2.4), cage(5.4, 2.4)],
  },
  {
    id: 4, name: 'Duvarın ardında', hint: 'Kafes duvarın arkasında.',
    speed: 14, shots: 3,
    statics: [ped(4.4, 0.6)],
    blocks: [cube(2, 0, 1.0), cube(2, 1.0, 1.0)],
    cages: [cage(4.4, 0.6)],
  },
  {
    id: 5, name: 'Kilit taşı', hint: 'Rafı taşıyan sütunu bul.',
    speed: 14, shots: 2,
    statics: [ped(6.1, 2.2, 0.8, 1.6)],
    blocks: [pillar(3.8, 0, 2.2, 0.7), plank(5.0, 2.2, 3.2, 0.3), cube(6.2, 2.5, 0.6)],
    cages: [cage(4.2, 2.5)],
  },
  {
    id: 6, name: 'Ağır çatı', hint: 'Çatı kafesi koruyor.',
    speed: 14, shots: 3,
    statics: [ped(5.0, 0.3, 1.2, 1.6)],
    blocks: [pillar(4.1, 0, 1.6, 0.5), pillar(5.9, 0, 1.6, 0.5), plank(5.0, 1.6, 2.6, 0.45)],
    cages: [cage(5.0, 0.3)],
  },
  {
    id: 7, name: 'Üç derinlik', hint: 'Yakın, orta, uzak.',
    speed: 14, shots: 4,
    statics: [ped(1.0, 0.5), ped(5.5, 1.2), ped(9.5, 1.0)],
    blocks: [cube(4.6, 0, 0.8)],
    cages: [cage(1.0, 0.5), cage(5.5, 1.2), cage(9.5, 1.0)],
  },
  {
    id: 8, name: 'Büyük kale', hint: 'Zincirleme çöküşü dene.',
    speed: 14, shots: 3,
    statics: [],
    blocks: [
      cube(0.6, 0, 0.7), cube(0.6, 0.7, 0.7),
      pillar(2.0, 0, 1.6), pillar(3.2, 0, 1.6), plank(2.6, 1.6, 1.8), cube(1.95, 1.9), cube(3.25, 1.9),
      pillar(4.4, 0, 1.6), pillar(5.6, 0, 1.6), plank(5.0, 1.6, 1.8), cube(4.35, 1.9), cube(5.65, 1.9),
      pillar(6.8, 0, 2.2), pillar(8.0, 0, 2.2), plank(7.4, 2.2, 1.8), cube(6.75, 2.5), cube(8.05, 2.5),
    ],
    cages: [cage(2.6, 1.9), cage(5.0, 1.9), cage(7.4, 2.5)],
  },
];
