'use strict';

// Animal roster — emoji-first so every species renders natively on the map
// and in collections, including in the GitHub mobile app.
//
// value  = coins/hour this animal adds to your zoo's visitor income (also its score)
// xp     = experience awarded for capturing it
// weight = relative spawn frequency within its rarity tier

const RARITIES = {
  common:    { label: 'Common',    chance: 0.90, value: 1,   xp: 1 },
  uncommon:  { label: 'Uncommon',  chance: 0.72, value: 3,   xp: 3 },
  rare:      { label: 'Rare',      chance: 0.52, value: 8,   xp: 8 },
  epic:      { label: 'Epic',      chance: 0.34, value: 20,  xp: 20 },
  legendary: { label: 'Legendary', chance: 0.18, value: 50,  xp: 50 },
  mythical:  { label: 'MYTHICAL',  chance: 0.10, value: 150, xp: 120 },
};

// How often each tier appears when a wild animal spawns.
const SPAWN_TABLE = [
  ['common',    0.46],
  ['uncommon',  0.27],
  ['rare',      0.16],
  ['epic',      0.08],
  ['legendary', 0.027],
  ['mythical',  0.003],
];

// Special editions — rolled on every successful capture.
const VARIANTS = [
  { key: 'golden', label: 'Golden', badge: '🌟', chance: 0.01, mult: 20 },
  { key: 'shiny',  label: 'Shiny',  badge: '✨', chance: 0.04, mult: 5 },
];

const SPECIES = [
  // ── Common ────────────────────────────────────────────────
  ['🐇', 'Rabbit', 'common'], ['🐿️', 'Squirrel', 'common'],
  ['🐀', 'Rat', 'common'], ['🐁', 'Mouse', 'common'],
  ['🐓', 'Rooster', 'common'], ['🐤', 'Chick', 'common'],
  ['🦆', 'Duck', 'common'], ['🐸', 'Frog', 'common'],
  ['🐌', 'Snail', 'common'], ['🐝', 'Bee', 'common'],
  ['🐖', 'Pig', 'common'], ['🐑', 'Sheep', 'common'],
  ['🐐', 'Goat', 'common'], ['🐄', 'Cow', 'common'],
  ['🐈', 'Cat', 'common'], ['🕊️', 'Dove', 'common'],
  // ── Uncommon ──────────────────────────────────────────────
  ['🦊', 'Fox', 'uncommon'], ['🦝', 'Raccoon', 'uncommon'],
  ['🦔', 'Hedgehog', 'uncommon'], ['🦇', 'Bat', 'uncommon'],
  ['🦉', 'Owl', 'uncommon'], ['🦅', 'Eagle', 'uncommon'],
  ['🦢', 'Swan', 'uncommon'], ['🦜', 'Parrot', 'uncommon'],
  ['🐢', 'Turtle', 'uncommon'], ['🐍', 'Snake', 'uncommon'],
  ['🦎', 'Lizard', 'uncommon'], ['🐠', 'Tropical Fish', 'uncommon'],
  ['🦀', 'Crab', 'uncommon'], ['🐙', 'Octopus', 'uncommon'],
  ['🦌', 'Deer', 'uncommon'], ['🐗', 'Boar', 'uncommon'],
  ['🦃', 'Turkey', 'uncommon'], ['🦚', 'Peacock', 'uncommon'],
  // ── Rare ──────────────────────────────────────────────────
  ['🐺', 'Wolf', 'rare'], ['🐆', 'Leopard', 'rare'],
  ['🐊', 'Crocodile', 'rare'], ['🦈', 'Shark', 'rare'],
  ['🐬', 'Dolphin', 'rare'], ['🦭', 'Seal', 'rare'],
  ['🐧', 'Penguin', 'rare'], ['🦩', 'Flamingo', 'rare'],
  ['🦥', 'Sloth', 'rare'], ['🦦', 'Otter', 'rare'],
  ['🦨', 'Skunk', 'rare'], ['🦡', 'Badger', 'rare'],
  ['🐫', 'Camel', 'rare'], ['🦙', 'Llama', 'rare'],
  ['🦘', 'Kangaroo', 'rare'], ['🐒', 'Monkey', 'rare'],
  // ── Epic ──────────────────────────────────────────────────
  ['🦁', 'Lion', 'epic'], ['🐯', 'Tiger', 'epic'],
  ['🐻', 'Bear', 'epic'], ['🐻‍❄️', 'Polar Bear', 'epic'],
  ['🦍', 'Gorilla', 'epic'], ['🦧', 'Orangutan', 'epic'],
  ['🐘', 'Elephant', 'epic'], ['🦏', 'Rhino', 'epic'],
  ['🦛', 'Hippo', 'epic'], ['🦒', 'Giraffe', 'epic'],
  ['🦓', 'Zebra', 'epic'], ['🐼', 'Panda', 'epic'],
  ['🐋', 'Whale', 'epic'],
  // ── Legendary (the extinct hall) ──────────────────────────
  ['🦕', 'Brontosaurus', 'legendary'], ['🦖', 'T-Rex', 'legendary'],
  ['🦤', 'Dodo', 'legendary'], ['🦣', 'Mammoth', 'legendary'],
  // ── Mythical ──────────────────────────────────────────────
  ['🐉', 'Dragon', 'mythical'], ['🦄', 'Unicorn', 'mythical'],
  ['🐲', 'Drake', 'mythical'], ['🦑', 'Kraken', 'mythical'],
].map(([emoji, name, rarity]) => ({ emoji, name, rarity }));

function speciesByRarity(rarity) {
  return SPECIES.filter((s) => s.rarity === rarity);
}

function rollRarity(rand) {
  let roll = rand();
  for (const [rarity, p] of SPAWN_TABLE) {
    if (roll < p) return rarity;
    roll -= p;
  }
  return 'common';
}

function rollSpecies(rand) {
  const pool = speciesByRarity(rollRarity(rand));
  return pool[Math.floor(rand() * pool.length)];
}

function rollVariant(rand) {
  const roll = rand();
  let acc = 0;
  for (const v of VARIANTS) {
    acc += v.chance;
    if (roll < acc) return v.key;
  }
  return null;
}

function variantInfo(key) {
  return VARIANTS.find((v) => v.key === key) || null;
}

function animalValue(animal) {
  const base = RARITIES[animal.rarity].value;
  const v = variantInfo(animal.variant);
  return base * (v ? v.mult : 1);
}

function animalLabel(animal) {
  const v = variantInfo(animal.variant);
  return `${v ? v.badge : ''}${animal.emoji} ${v ? v.label + ' ' : ''}${animal.name}`;
}

module.exports = {
  RARITIES, SPECIES, VARIANTS,
  speciesByRarity, rollRarity, rollSpecies, rollVariant,
  variantInfo, animalValue, animalLabel,
};
