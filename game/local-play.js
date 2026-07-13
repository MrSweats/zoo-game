'use strict';

// Local sandbox for the engine — no GitHub needed. Used for development
// and quick smoke tests:
//
//   node game/local-play.js                     # scripted demo game
//   node game/local-play.js alice "/move n n"   # one-off command against .local-state.json
//
// The scripted demo drives every command path (join, move, capture, steal,
// shop, views) with a seeded RNG and asserts the invariants that matter.

const fs = require('fs');
const path = require('path');
const engine = require('./engine');
const world = require('./world');

const STATE_FILE = path.join(__dirname, '..', '.local-state.json');

function seededRand(seed) {
  return world.mulberry32(seed);
}

function play(state, login, cmd, now, rand) {
  const res = engine.handleCommand(state, login, cmd, now, rand);
  console.log(`\n${'─'.repeat(60)}\n@${login}: ${cmd}\n${'─'.repeat(60)}`);
  if (!res) { console.log('(no response — not a game command)'); return null; }
  console.log(res.reply);
  for (const a of res.announce || []) console.log(`\n[ANNOUNCE] ${a}`);
  return res;
}

function assert(cond, msg) {
  if (!cond) { console.error(`\n❌ ASSERTION FAILED: ${msg}`); process.exit(1); }
  console.log(`✔ ${msg}`);
}

function scriptedDemo() {
  const rand = seededRand(42);
  let now = Date.UTC(2026, 0, 1);
  const state = engine.newWorldState(1, 100, 1234, now);

  // 1) Two players join
  play(state, 'alice', '/join', now, rand);
  play(state, 'bob', '/join', now, rand);
  assert(Object.keys(state.players).length === 2, 'two players joined');
  assert(state.players.alice.animals.length === 1, 'alice got a starter animal');
  assert(state.players.alice.zoo !== state.players.bob.zoo, 'players got different zoos');

  // 2) Help / map / stats render
  play(state, 'alice', '/help', now, rand);
  play(state, 'alice', '/map', now, rand);
  play(state, 'alice', '/me', now, rand);

  // 3) Movement along the ring road, with energy costs
  now += 60 * 1000;
  const before = { ...state.players.alice };
  const moveRes = play(state, 'alice', '/move e e e', now, rand);
  assert(state.players.alice.energy < before.energy, 'movement spends energy');
  assert(moveRes.reply.includes('📍'), 'reply includes actor status bar');

  // 4) Force a capture: drop a spawn on alice's tile
  now += 60 * 1000;
  const a = state.players.alice;
  state.spawns.push({ id: 999, emoji: '🦊', name: 'Fox', rarity: 'uncommon', r: a.r, c: a.c, spawnedAt: now });
  let captures = a.animals.length;
  for (let i = 0; i < 6 && a.animals.length === captures; i++) {
    if (!state.spawns.some((s) => s.r === a.r && s.c === a.c)) {
      state.spawns.push({ id: 1000 + i, emoji: '🦊', name: 'Fox', rarity: 'uncommon', r: a.r, c: a.c, spawnedAt: now });
    }
    a.energy = 10;
    play(state, 'alice', '/capture', now, rand);
  }
  assert(a.animals.length > captures, 'alice captured a wild animal');
  assert(a.xp > 0, 'capture granted XP');

  // 5) Energy regen: jump 2 hours ahead
  a.energy = 0; a.energyTs = now;
  now += 2 * 60 * 60 * 1000;
  play(state, 'alice', '/me', now, rand);
  assert(a.energy === 4, `energy regenerated to 4 after 2h (got ${a.energy})`);

  // 6) Coins accrue from collection score
  const coinsBefore = a.coins;
  now += 5 * 60 * 60 * 1000;
  play(state, 'alice', '/me', now, rand);
  assert(a.coins > coinsBefore, 'visitor income accrued over time');

  // 7) Shop: buy an energy refill
  a.coins = 500; a.energy = 1;
  play(state, 'alice', '/buy energy', now, rand);
  assert(a.energy === engine.MAX_ENERGY, 'energy drink refills energy');
  play(state, 'bob', '/buy guard', now, rand);
  // bob starts with 20 coins; guard costs 50 — should fail
  assert(state.players.bob.security === 0, 'guard purchase fails without coins');

  // 8) Heist: teleport alice to bob's zoo and rob him
  const bobTile = world.ZOO_TILES[state.players.bob.zoo - 1];
  a.r = bobTile.r; a.c = bobTile.c; a.energy = 10;
  state.players.bob.animals.push({ emoji: '🐼', name: 'Panda', rarity: 'epic', variant: null, caughtAt: now });
  const bobAnimalsBefore = state.players.bob.animals.length;
  let heisted = false;
  for (let i = 0; i < 8 && !heisted; i++) {
    a.energy = 10; a.stealLockUntil = 0; a.stealCooldownUntil = 0;
    const res = play(state, 'alice', `/steal ${state.players.bob.zoo}`, now, rand);
    assert(res.announce && res.announce.length > 0, 'heist attempt notifies the victim');
    heisted = state.players.bob.animals.length < bobAnimalsBefore;
    now += 1000;
  }
  assert(heisted, 'a heist eventually succeeded and transferred an animal');

  // 9) Steal guard rails
  const selfRes = play(state, 'alice', `/steal ${a.zoo}`, now, rand);
  assert(selfRes.reply.includes('accountant'), 'cannot steal from yourself');

  // 10) Views
  play(state, 'alice', `/zoo ${state.players.bob.zoo}`, now, rand);
  play(state, 'alice', '/top', now, rand);

  // 11) World fills up -> 9th join reports worldFull
  for (const name of ['carol', 'dan', 'erin', 'frank', 'grace', 'heidi']) {
    play(state, name, '/join', now, rand);
  }
  assert(Object.keys(state.players).length === 8, 'world holds exactly 8 players');
  const ninth = engine.handleCommand(state, 'ivan', '/join', now, rand);
  assert(ninth.worldFull === true, '9th player triggers matchmaking to a new world');

  // 12) Ambient spawns appear over time
  now += 6 * 60 * 60 * 1000;
  play(state, 'alice', '/map', now, rand);
  assert(state.spawns.length > 0, 'ambient spawns populate the map over time');

  console.log('\n✅ All demo assertions passed.\n');
}

const [, , login, cmd] = process.argv;
if (login && cmd) {
  const state = fs.existsSync(STATE_FILE)
    ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
    : engine.newWorldState(1, 100, 1234, Date.now());
  play(state, login, cmd, Date.now(), Math.random);
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
} else {
  scriptedDemo();
}
