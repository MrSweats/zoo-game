'use strict';

// World map: a 13x13 grid with a ring road (monopoly-board style) and the
// 8 zoos evenly spaced around it. Wilderness fills the inside and outside
// of the ring. Terrain is generated deterministically from the world seed,
// so only the seed is stored in the state file.

const SIZE = 13;
const RING_MIN = 2;
const RING_MAX = 10;

// Zoos 1-8, clockwise from the top-left corner of the ring.
const ZOO_TILES = [
  { zoo: 1, r: 2, c: 2 }, { zoo: 2, r: 2, c: 6 }, { zoo: 3, r: 2, c: 10 },
  { zoo: 4, r: 6, c: 10 }, { zoo: 5, r: 10, c: 10 }, { zoo: 6, r: 10, c: 6 },
  { zoo: 7, r: 10, c: 2 }, { zoo: 8, r: 6, c: 2 },
];

const ZOO_EMOJI = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣'];

const TILE = { GRASS: 'grass', ROAD: 'road', WATER: 'water', ZOO: 'zoo' };

// Deterministic PRNG so terrain regenerates identically from the seed.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isRoad(r, c) {
  const onBand = (v) => v >= RING_MIN && v <= RING_MAX;
  return (
    ((r === RING_MIN || r === RING_MAX) && onBand(c)) ||
    ((c === RING_MIN || c === RING_MAX) && onBand(r))
  );
}

function zooAt(r, c) {
  return ZOO_TILES.find((z) => z.r === r && z.c === c) || null;
}

// Returns a SIZE x SIZE grid of { type, deco } tiles.
function buildTerrain(seed) {
  const rand = mulberry32(seed);
  const decor = ['🌲', '🌳', '🌴', '🌵', '🌾', '🌸'];
  const grid = [];
  for (let r = 0; r < SIZE; r++) {
    const row = [];
    for (let c = 0; c < SIZE; c++) {
      if (zooAt(r, c)) row.push({ type: TILE.ZOO });
      else if (isRoad(r, c)) row.push({ type: TILE.ROAD });
      else {
        const deco = rand() < 0.28 ? decor[Math.floor(rand() * decor.length)] : null;
        row.push({ type: TILE.GRASS, deco });
      }
    }
    grid.push(row);
  }
  // A few ponds in the inner wilderness (impassable, adds routing choices).
  let ponds = 0;
  while (ponds < 3) {
    const r = 3 + Math.floor(rand() * 7);
    const c = 3 + Math.floor(rand() * 7);
    if (grid[r][c].type === TILE.GRASS) { grid[r][c] = { type: TILE.WATER }; ponds++; }
  }
  return grid;
}

function isPassable(grid, r, c) {
  if (r < 0 || c < 0 || r >= SIZE || c >= SIZE) return false;
  return grid[r][c].type !== TILE.WATER;
}

// Any passable non-zoo tile — used for placing wild animal spawns.
function randomSpawnTile(grid, rand, taken) {
  for (let tries = 0; tries < 200; tries++) {
    const r = Math.floor(rand() * SIZE);
    const c = Math.floor(rand() * SIZE);
    const t = grid[r][c].type;
    if ((t === TILE.GRASS || t === TILE.ROAD) && !taken.has(`${r},${c}`)) return { r, c };
  }
  return null;
}

// Render the world as an emoji grid. `actor` (a login) is drawn as 📍,
// other players as 🧍. Priority: actor > other player > spawn > zoo > terrain.
function renderMap(grid, state, actorLogin) {
  const spawnAt = new Map(state.spawns.map((s) => [`${s.r},${s.c}`, s]));
  const playersAt = new Map();
  for (const [login, p] of Object.entries(state.players)) {
    const key = `${p.r},${p.c}`;
    if (!playersAt.has(key)) playersAt.set(key, []);
    playersAt.get(key).push(login);
  }
  const lines = [];
  for (let r = 0; r < SIZE; r++) {
    let line = '';
    for (let c = 0; c < SIZE; c++) {
      const key = `${r},${c}`;
      const here = playersAt.get(key) || [];
      if (actorLogin && here.includes(actorLogin)) line += '📍';
      else if (here.length > 0) line += '🧍';
      else if (spawnAt.has(key)) line += spawnAt.get(key).emoji;
      else {
        const tile = grid[r][c];
        if (tile.type === TILE.ZOO) line += ZOO_EMOJI[zooAt(r, c).zoo - 1];
        else if (tile.type === TILE.ROAD) line += '🟫';
        else if (tile.type === TILE.WATER) line += '🟦';
        else line += tile.deco || '🟩';
      }
    }
    lines.push(line);
  }
  return lines.join('\n');
}

module.exports = {
  SIZE, TILE, ZOO_TILES, ZOO_EMOJI,
  mulberry32, buildTerrain, isRoad, zooAt, isPassable, randomSpawnTile, renderMap,
};
