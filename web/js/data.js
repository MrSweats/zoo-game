'use strict';
// Shared data: species, rarities, shop, world geometry. No dependencies —
// imported by both the sim (runs headless in tests) and the renderer.

export const RAR = {
  common:    { label: 'Common',    color: '#b9c6b3', hex: 0xb9c6b3, chance: 0.92, value: 1,   xp: 1,   speed: 0.92 },
  uncommon:  { label: 'Uncommon',  color: '#7ed957', hex: 0x7ed957, chance: 0.78, value: 3,   xp: 3,   speed: 0.88 },
  rare:      { label: 'Rare',      color: '#6ec6ff', hex: 0x6ec6ff, chance: 0.62, value: 8,   xp: 8,   speed: 0.82 },
  epic:      { label: 'Epic',      color: '#c792ea', hex: 0xc792ea, chance: 0.46, value: 20,  xp: 20,  speed: 0.74 },
  legendary: { label: 'Legendary', color: '#ffd166', hex: 0xffd166, chance: 0.30, value: 50,  xp: 50,  speed: 0.66 },
  mythical:  { label: 'MYTHICAL',  color: '#ff6b6b', hex: 0xff6b6b, chance: 0.18, value: 150, xp: 120, speed: 0.58 },
};
// speed = your walk-speed multiplier while carrying it home. Big prize, slow getaway.

export const SPAWN_TABLE = [
  ['common', .44], ['uncommon', .27], ['rare', .17], ['epic', .085], ['legendary', .03], ['mythical', .005],
];
export const VARIANTS = [
  { key: 'golden', label: 'Golden', badge: '🌟', chance: 0.01, mult: 20 },
  { key: 'shiny',  label: 'Shiny',  badge: '✨', chance: 0.04, mult: 5 },
];
export const SPECIES = [
  ['🐇','Rabbit','common'],['🐿️','Squirrel','common'],['🐀','Rat','common'],['🐁','Mouse','common'],
  ['🐓','Rooster','common'],['🐤','Chick','common'],['🦆','Duck','common'],['🐸','Frog','common'],
  ['🐌','Snail','common'],['🐝','Bee','common'],['🐖','Pig','common'],['🐑','Sheep','common'],
  ['🐐','Goat','common'],['🐄','Cow','common'],['🐈','Cat','common'],['🕊️','Dove','common'],
  ['🦊','Fox','uncommon'],['🦝','Raccoon','uncommon'],['🦔','Hedgehog','uncommon'],['🦇','Bat','uncommon'],
  ['🦉','Owl','uncommon'],['🦅','Eagle','uncommon'],['🦢','Swan','uncommon'],['🦜','Parrot','uncommon'],
  ['🐢','Turtle','uncommon'],['🐍','Snake','uncommon'],['🦎','Lizard','uncommon'],['🐠','Tropical Fish','uncommon'],
  ['🦀','Crab','uncommon'],['🐙','Octopus','uncommon'],['🦌','Deer','uncommon'],['🐗','Boar','uncommon'],
  ['🦃','Turkey','uncommon'],['🦚','Peacock','uncommon'],
  ['🐺','Wolf','rare'],['🐆','Leopard','rare'],['🐊','Crocodile','rare'],['🦈','Shark','rare'],
  ['🐬','Dolphin','rare'],['🦭','Seal','rare'],['🐧','Penguin','rare'],['🦩','Flamingo','rare'],
  ['🦥','Sloth','rare'],['🦦','Otter','rare'],['🦨','Skunk','rare'],['🦡','Badger','rare'],
  ['🐫','Camel','rare'],['🦙','Llama','rare'],['🦘','Kangaroo','rare'],['🐒','Monkey','rare'],
  ['🦁','Lion','epic'],['🐯','Tiger','epic'],['🐻','Bear','epic'],['🐨','Koala','epic'],
  ['🦍','Gorilla','epic'],['🦧','Orangutan','epic'],['🐘','Elephant','epic'],['🦏','Rhino','epic'],
  ['🦛','Hippo','epic'],['🦒','Giraffe','epic'],['🦓','Zebra','epic'],['🐼','Panda','epic'],['🐋','Whale','epic'],
  ['🦕','Brontosaurus','legendary'],['🦖','T-Rex','legendary'],['🦤','Dodo','legendary'],['🦣','Mammoth','legendary'],
  ['🐉','Dragon','mythical'],['🦄','Unicorn','mythical'],['🐲','Drake','mythical'],['🦑','Kraken','mythical'],
].map(([emoji, name, rarity]) => ({ emoji, name, rarity }));

export const AI_DEFS = [
  { name: 'Mabel', avatar: '👵', roof: 0xe86a6a }, { name: 'Ravi',  avatar: '👳', roof: 0x6a9de8 },
  { name: 'Zara',  avatar: '🧕', roof: 0x9d6ae8 }, { name: 'Bruno', avatar: '🧔', roof: 0x6ae8b2 },
  { name: 'Suki',  avatar: '👧', roof: 0xe86ac8 }, { name: 'Otto',  avatar: '👴', roof: 0xe8b26a },
  { name: 'Nadia', avatar: '👩', roof: 0x6ae8e0 }, { name: 'Kofi',  avatar: '🧑', roof: 0xa8e86a },
];
export const HUMAN_AVATARS = ['🤠','🥷','🧙','👸','🦸','🕵️','👮','🧛'];

// ── World geometry: 1 tile = 2u, 21x21 tiles ────────────────
export const U = 2, WORLD = 21 * U;
export const RD_MIN = 3.5 * U, RD_MAX = 17.5 * U, ROAD_W = 2.4;
export const BASES = [ [3,3],[3,10],[3,17],[10,17],[17,17],[17,10],[17,3],[10,3] ]
  .map(([r, c]) => ({ x: c * U + 1, z: r * U + 1 }));
export const BASE_HALF = 4.1;                 // fence half-size
export const MAX_PENS = 16, START_PENS = 6;

// Pen slots: two rows of 8 inside the fence, south half.
export function penPos(zooIdx, slot) {
  const b = BASES[zooIdx];
  const col = slot % 8, row = (slot / 8) | 0;
  return { x: b.x - 3.15 + col * 0.9, z: b.z + 1.5 + row * 1.15 };
}
export const TURRET_OFF = { x: 2.9, z: -2.6 };  // turret pad, relative to base center
export const VAULT_OFF = { x: -2.9, z: -2.6 };  // vault pen, relative to base center

export const SHOP = [
  { key: 'pen',    emoji: '🚧', name: 'Extra pen',       desc: 'One more animal slot (max 16)' },
  { key: 'turret', emoji: '🗼', name: 'Defense turret',  desc: 'Zaps thieves in its radius — they drop the loot (3 levels)' },
  { key: 'alarm',  emoji: '🔔', name: 'Alarm bell',      desc: 'Instant alert + thief marked when your pens are robbed' },
  { key: 'vault',  emoji: '🔒', name: 'Vault slot',      desc: 'Protect one chosen animal — it can never be stolen (max 3)' },
  { key: 'net',    emoji: '🥅', name: 'Bigger net',      desc: '+10% catch chance (permanent)' },
  { key: 'boots',  emoji: '👟', name: 'Running boots',   desc: '+12% move speed (permanent)' },
  { key: 'pack',   emoji: '🎒', name: 'Padded backpack', desc: 'Carrying slows you 40% less (permanent)' },
];
export function shopCost(key, p) {
  switch (key) {
    case 'pen':    return Math.round(100 * Math.pow(1.55, p.pens - START_PENS));
    case 'turret': return [150, 400, 900][p.turret] ?? Infinity;
    case 'alarm':  return 120;
    case 'vault':  return [300, 800, 2000][p.vaultSlots] ?? Infinity;
    case 'net':    return 200;
    case 'boots':  return 250;
    case 'pack':   return 350;
  }
}
export function shopCan(key, p) {
  switch (key) {
    case 'pen':    return p.pens < MAX_PENS;
    case 'turret': return p.turret < 3;
    case 'alarm':  return !p.alarm;
    case 'vault':  return p.vaultSlots < 3;
    case 'net':    return !p.gear.net;
    case 'boots':  return !p.gear.boots;
    case 'pack':   return !p.gear.pack;
  }
}

// ── Helpers ──────────────────────────────────────────────────
export function rollRarity(rnd = Math.random) {
  let x = rnd();
  for (const [k, p] of SPAWN_TABLE) { if (x < p) return k; x -= p; }
  return 'common';
}
export function rollSpecies(rnd = Math.random, tier = null) {
  const t = tier || rollRarity(rnd);
  const pool = SPECIES.filter((s) => s.rarity === t);
  return pool[(rnd() * pool.length) | 0];
}
export function rollVariant(rnd = Math.random) {
  const x = rnd(); let a = 0;
  for (const v of VARIANTS) { a += v.chance; if (x < a) return v.key; }
  return null;
}
export const vinfo = (k) => VARIANTS.find((v) => v.key === k) || null;
export const aValue = (a) => { const v = vinfo(a.variant); return RAR[a.rarity].value * (v ? v.mult : 1); };
export const aLabel = (a) => { const v = vinfo(a.variant); return `${v ? v.badge : ''}${a.emoji} ${v ? v.label + ' ' : ''}${a.name}`; };
export const sellPrice = (a) => aValue(a) * 10;
export const score = (list) => list.reduce((s, a) => s + aValue(a), 0);
export const levelOf = (xp) => 1 + Math.floor(Math.sqrt(xp / 10));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const fmt = (n) => n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(Math.floor(n));
export const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
// Deterministic PRNG — terrain must be identical for every player in a room.
export function mulberry32(a) {
  a = a >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
