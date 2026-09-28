// Deterministic math helpers.
// Only IEEE-754 basic operations (+, -, *, /) are used, which are correctly
// rounded on every compliant JS engine. Math.sin/Math.cos are implementation
// approximated in the ECMAScript spec and may differ between browsers, so they
// must never feed the physics simulation.

const PI = 3.141592653589793;
const TENTH_DEG_TO_RAD = PI / 1800;

// Taylor series around 0, valid for |x| <= ~1.6 rad (we only use |angle| <= 90 deg).
function sinRad(x) {
  const x2 = x * x;
  // Horner form up to x^17
  let r = 1 / 355687428096000; // 1/17!
  r = r * -x2 + 1 / 1307674368000; // 1/15!
  r = r * -x2 + 1 / 6227020800; // 1/13!
  r = r * -x2 + 1 / 39916800; // 1/11!
  r = r * -x2 + 1 / 362880; // 1/9!
  r = r * -x2 + 1 / 5040; // 1/7!
  r = r * -x2 + 1 / 120; // 1/5!
  r = r * -x2 + 1 / 6; // 1/3!
  r = r * -x2 + 1;
  return r * x;
}

function cosRad(x) {
  const x2 = x * x;
  let r = 1 / 6402373705728000; // 1/18!
  r = r * -x2 + 1 / 20922789888000; // 1/16!
  r = r * -x2 + 1 / 87178291200; // 1/14!
  r = r * -x2 + 1 / 479001600; // 1/12!
  r = r * -x2 + 1 / 3628800; // 1/10!
  r = r * -x2 + 1 / 40320; // 1/8!
  r = r * -x2 + 1 / 720; // 1/6!
  r = r * -x2 + 1 / 24; // 1/4!
  r = r * -x2 + 1 / 2; // 1/2!
  r = r * -x2 + 1;
  return r;
}

// Angles are integers in tenths of a degree (e.g. 452 = 45.2 deg).
export function sinTenth(t) {
  if (!Number.isInteger(t) || t < -900 || t > 900) throw new Error('angle out of range: ' + t);
  return sinRad(t * TENTH_DEG_TO_RAD);
}

export function cosTenth(t) {
  if (!Number.isInteger(t) || t < -900 || t > 900) throw new Error('angle out of range: ' + t);
  return cosRad(t * TENTH_DEG_TO_RAD);
}

// FNV-1a over 32-bit words, produces a 32-bit unsigned hash.
export function fnv1a32(words, h = 0x811c9dc5) {
  for (let i = 0; i < words.length; i++) {
    let w = words[i];
    for (let k = 0; k < 4; k++) {
      h ^= w & 0xff;
      h = Math.imul(h, 0x01000193) >>> 0;
      w >>>= 8;
    }
  }
  return h >>> 0;
}

export function hex32(h) {
  return (h >>> 0).toString(16).padStart(8, '0');
}
