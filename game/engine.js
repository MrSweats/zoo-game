'use strict';

const animals = require('./animals');
const world = require('./world');

// ── Tuning ──────────────────────────────────────────────────
const MAX_ENERGY = 10;
const ENERGY_REGEN_MS = 30 * 60 * 1000;        // 1 energy / 30 min
const COST = { move: 1, capture: 2, steal: 5 };
const INCOME_CAP_HOURS = 24;                   // offline income cap
const SPAWN_INTERVAL_MS = 20 * 60 * 1000;      // ~3 ambient spawns / hour
const MAX_SPAWNS = 12;
const SPAWN_TTL_MS = 24 * 60 * 60 * 1000;      // animals wander off after a day
const MYTHICAL_TTL_MS = 48 * 60 * 60 * 1000;
const STEP_ENCOUNTER_CHANCE = 0.08;            // wild encounter per road step
const FLEE_CHANCE = 0.5;                       // on failed capture
const STEAL_FAIL_LOCKOUT_MS = 6 * 60 * 60 * 1000;
const STEAL_SUCCESS_COOLDOWN_MS = 3 * 60 * 60 * 1000;
const MAX_SECURITY = 5;

const SHOP = [
  { key: 'guard', emoji: '🛡️', name: 'Security upgrade', desc: '-8% heist success against you per level (max 5)', cost: (p) => 50 * (p.security + 1) },
  { key: 'net', emoji: '🕸️', name: 'Capture net', desc: '+10% capture chance (permanent)', cost: () => 150 },
  { key: 'tranq', emoji: '💉', name: 'Tranq darts', desc: '+10% capture chance (permanent, stacks with net)', cost: () => 400 },
  { key: 'energy', emoji: '⚡', name: 'Energy drink', desc: 'refill energy to full', cost: () => 25 },
];

const STARTERS = animals.speciesByRarity('common');

// ── State helpers ───────────────────────────────────────────

function newWorldState(worldNum, issueNumber, seed, now) {
  return {
    world: worldNum,
    issue: issueNumber,
    seed,
    createdAt: now,
    lastSpawnTs: now,
    spawns: [],
    nextSpawnId: 1,
    players: {},
  };
}

function level(p) {
  return 1 + Math.floor(Math.sqrt(p.xp / 10));
}

function collectionScore(p) {
  return p.animals.reduce((sum, a) => sum + animals.animalValue(a), 0);
}

// Lazily regenerate energy and accrue visitor income since the last action.
function settlePlayer(p, now) {
  if (p.energy < MAX_ENERGY) {
    const gained = Math.floor((now - p.energyTs) / ENERGY_REGEN_MS);
    if (gained > 0) {
      p.energy = Math.min(MAX_ENERGY, p.energy + gained);
      p.energyTs = p.energy >= MAX_ENERGY ? now : p.energyTs + gained * ENERGY_REGEN_MS;
    }
  } else {
    p.energyTs = now;
  }
  const hours = Math.min((now - p.coinsTs) / 3600000, INCOME_CAP_HOURS);
  if (hours > 0) {
    p.coins += collectionScore(p) * hours;
    p.coinsTs = now;
  }
}

function spendEnergy(p, amount, now) {
  if (p.energy === MAX_ENERGY) p.energyTs = now; // regen clock starts when leaving full
  p.energy -= amount;
}

// Ambient spawns: wild animals appear on the map over time and eventually
// wander off. Returns announcements for mythical arrivals.
function tickSpawns(state, now, rand) {
  const events = [];
  state.spawns = state.spawns.filter((s) => {
    const ttl = s.rarity === 'mythical' ? MYTHICAL_TTL_MS : SPAWN_TTL_MS;
    return now - s.spawnedAt < ttl;
  });
  const grid = world.buildTerrain(state.seed);
  let due = Math.floor((now - state.lastSpawnTs) / SPAWN_INTERVAL_MS);
  if (due > 0) state.lastSpawnTs += due * SPAWN_INTERVAL_MS;
  due = Math.min(due, MAX_SPAWNS - state.spawns.length);
  for (let i = 0; i < due; i++) {
    const taken = new Set(state.spawns.map((s) => `${s.r},${s.c}`));
    const tile = world.randomSpawnTile(grid, rand, taken);
    if (!tile) break;
    const sp = spawnAnimal(state, tile.r, tile.c, now, rand);
    if (sp.rarity === 'mythical') events.push(sp);
  }
  return events;
}

function spawnAnimal(state, r, c, now, rand) {
  const species = animals.rollSpecies(rand);
  const sp = { id: state.nextSpawnId++, emoji: species.emoji, name: species.name, rarity: species.rarity, r, c, spawnedAt: now };
  state.spawns.push(sp);
  return sp;
}

// ── Command handling ────────────────────────────────────────
//
// Every handler returns { reply, announce?, worldFull?, changed }.
//   reply    — markdown posted as a comment in the world issue
//   announce — extra world-wide announcement (mythical spawns, heists)
//   worldFull— /join found no free zoo; caller spins up the next world

function handleCommand(state, login, raw, now, rand) {
  const parts = raw.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);
  const p = state.players[login];
  if (p) settlePlayer(p, now);
  const announceEvents = tickSpawns(state, now, rand);

  let res;
  switch (cmd) {
    case '/join': res = doJoin(state, login, now, rand); break;
    case '/move': res = requirePlayer(p, () => doMove(state, p, login, args, now, rand)); break;
    case '/capture': case '/catch': res = requirePlayer(p, () => doCapture(state, p, login, now, rand)); break;
    case '/steal': res = requirePlayer(p, () => doSteal(state, p, login, args, now, rand)); break;
    case '/zoo': res = doZooView(state, login, args); break;
    case '/shop': res = { reply: shopText(p) }; break;
    case '/buy': res = requirePlayer(p, () => doBuy(p, args, now)); break;
    case '/map': res = { reply: state.players[login] ? '' : 'You are spectating — comment `/join` to claim a zoo!' }; break;
    case '/me': case '/stats': res = requirePlayer(p, () => ({ reply: statsText(state, p, login) })); break;
    case '/top': case '/leaderboard': res = { reply: leaderboardText(state) }; break;
    case '/help': res = { reply: helpText() }; break;
    default: return null; // not a game command — stay silent
  }
  if (!res) return null;

  const mythicals = announceEvents.map((sp) =>
    `🚨 **A wild ${sp.emoji} ${sp.name} (${animals.RARITIES[sp.rarity].label}) has appeared at (${sp.r},${sp.c})!** ` +
    `First zookeeper to reach it can attempt a capture... ${mentionAll(state)}`);
  if (mythicals.length) res.announce = [...(res.announce || []), ...mythicals];

  // Every reply carries the map + the actor's status bar so the phone
  // screen always shows the full game state.
  const grid = world.buildTerrain(state.seed);
  const showMap = !res.noMap;
  const header = `## 🌍 ZooWorld #${state.world}`;
  const mapBlock = showMap ? `\n\n${world.renderMap(grid, state, login)}` : '';
  const status = state.players[login] ? `\n\n${statusBar(state.players[login], login)}` : '';
  res.reply = `${header}${mapBlock}${status}${res.reply ? `\n\n${res.reply}` : ''}`;
  res.changed = true;
  return res;
}

function requirePlayer(p, fn) {
  if (!p) return { reply: "You haven't joined this world yet — comment `/join` to claim one of the 8 zoos!", noMap: true };
  return fn();
}

function doJoin(state, login, now, rand) {
  if (state.players[login]) {
    return { reply: `You already run Zoo ${world.ZOO_EMOJI[state.players[login].zoo - 1]} in this world! Try \`/map\` or \`/help\`.` };
  }
  const takenZoos = new Set(Object.values(state.players).map((q) => q.zoo));
  const open = world.ZOO_TILES.filter((z) => !takenZoos.has(z.zoo));
  if (open.length === 0) return { worldFull: true, reply: '' };

  const slot = open[Math.floor(rand() * open.length)];
  const starter = STARTERS[Math.floor(rand() * STARTERS.length)];
  state.players[login] = {
    zoo: slot.zoo, r: slot.r, c: slot.c,
    energy: MAX_ENERGY, energyTs: now,
    coins: 20, coinsTs: now,
    xp: 0, security: 0,
    gear: { net: false, tranq: false },
    animals: [{ emoji: starter.emoji, name: starter.name, rarity: starter.rarity, variant: null, caughtAt: now }],
    stealLockUntil: 0, stealCooldownUntil: 0,
    joinedAt: now,
  };
  return {
    reply: `🎉 Welcome, @${login}! You now run **Zoo ${world.ZOO_EMOJI[slot.zoo - 1]}** and a friendly ${starter.emoji} **${starter.name}** is your first resident.\n` +
      `Explore the ring road with \`/move n s e w\`, catch what you find with \`/capture\`, and keep an eye on your neighbors... (\`/help\` for everything)`,
  };
}

const DIRS = { n: [-1, 0], s: [1, 0], e: [0, 1], w: [0, -1] };
const DIR_WORDS = { north: 'n', south: 's', east: 'e', west: 'w', up: 'n', down: 's', right: 'e', left: 'w' };

function parseSteps(args) {
  const steps = [];
  for (const tok of args) {
    const t = tok.toLowerCase();
    if (DIR_WORDS[t]) steps.push(DIR_WORDS[t]);
    else if (/^[nsew]+$/.test(t)) steps.push(...t.split(''));
    else return null;
  }
  return steps;
}

function doMove(state, p, login, args, now, rand) {
  const steps = parseSteps(args);
  if (!steps || steps.length === 0) {
    return { reply: 'Tell me where to go: `/move n`, `/move north`, or chain steps like `/move n n e` / `/move nne`.', noMap: true };
  }
  const grid = world.buildTerrain(state.seed);
  const notes = [];
  let moved = 0;
  for (const d of steps) {
    if (p.energy < COST.move) { notes.push('⚡ Out of energy — it regenerates 1 every 30 min.'); break; }
    const [dr, dc] = DIRS[d];
    const nr = p.r + dr, nc = p.c + dc;
    if (!world.isPassable(grid, nr, nc)) { notes.push(`🚧 Blocked heading **${d.toUpperCase()}** — stopped there.`); break; }
    spendEnergy(p, COST.move, now);
    p.r = nr; p.c = nc;
    moved++;
    // Wild encounter: an animal can jump out right onto your tile.
    const tileFree = !state.spawns.some((s) => s.r === nr && s.c === nc);
    const isZooTile = !!world.zooAt(nr, nc);
    if (tileFree && !isZooTile && state.spawns.length < MAX_SPAWNS && rand() < STEP_ENCOUNTER_CHANCE) {
      const sp = spawnAnimal(state, nr, nc, now, rand);
      notes.push(`👀 A wild ${sp.emoji} **${sp.name}** (${animals.RARITIES[sp.rarity].label}) jumped out right in front of you! \`/capture\` it!`);
      break; // an encounter interrupts the journey
    }
  }
  const here = describeTile(state, grid, p);
  return { reply: `🥾 Moved **${moved}** step${moved === 1 ? '' : 's'} to (${p.r},${p.c}). ${here}${notes.length ? '\n' + notes.join('\n') : ''}` };
}

function describeTile(state, grid, p) {
  const spawn = state.spawns.find((s) => s.r === p.r && s.c === p.c);
  if (spawn) return `There's a wild ${spawn.emoji} **${spawn.name}** here — \`/capture\`!`;
  const zoo = world.zooAt(p.r, p.c);
  if (zoo) {
    const owner = Object.entries(state.players).find(([, q]) => q.zoo === zoo.zoo);
    if (owner) return `You're at **Zoo ${world.ZOO_EMOJI[zoo.zoo - 1]}** (@${owner[0]}'s turf${owner[1].security ? `, 🛡️×${owner[1].security}` : ''}). Feeling bold? \`/steal ${zoo.zoo}\``;
    return `You're at unclaimed **Zoo ${world.ZOO_EMOJI[zoo.zoo - 1]}**.`;
  }
  return '';
}

function doCapture(state, p, login, now, rand) {
  const idx = state.spawns.findIndex((s) => s.r === p.r && s.c === p.c);
  if (idx === -1) return { reply: 'No wild animal on this tile. Roam the map — animals show up as their emoji.' };
  if (p.energy < COST.capture) return { reply: `⚡ Capturing costs ${COST.capture} energy and you have ${p.energy}. It regenerates 1 every 30 min.` };
  const sp = state.spawns[idx];
  spendEnergy(p, COST.capture, now);

  let chance = animals.RARITIES[sp.rarity].chance;
  if (p.gear.net) chance += 0.10;
  if (p.gear.tranq) chance += 0.10;
  chance = Math.min(chance, 0.97);

  if (rand() < chance) {
    state.spawns.splice(idx, 1);
    const variant = animals.rollVariant(rand);
    const caught = { emoji: sp.emoji, name: sp.name, rarity: sp.rarity, variant, caughtAt: now };
    p.animals.push(caught);
    p.xp += animals.RARITIES[sp.rarity].xp;
    const vi = animals.variantInfo(variant);
    const editionNote = vi ? `\n${vi.badge} **IT'S A ${vi.label.toUpperCase()} EDITION!** Worth ${vi.mult}× a normal ${sp.name} — rivals will want it...` : '';
    const announce = sp.rarity === 'mythical'
      ? [`👑 **@${login} captured the mythical ${sp.emoji} ${sp.name}!** ${mentionAll(state, login)}`]
      : undefined;
    return {
      reply: `🎊 Caught **${animals.animalLabel(caught)}** (${animals.RARITIES[sp.rarity].label})! It's settling into your zoo. +${animals.RARITIES[sp.rarity].xp} XP${editionNote}`,
      announce,
    };
  }
  const fled = rand() < FLEE_CHANCE;
  if (fled) state.spawns.splice(idx, 1);
  return { reply: `💨 The ${sp.emoji} **${sp.name}** slipped away${fled ? ' and fled into the wild!' : ", but it's still here — try again!"} (capture odds were ${Math.round(chance * 100)}%)` };
}

function doSteal(state, p, login, args, now, rand) {
  const targetZoo = parseInt(args[0], 10);
  if (!targetZoo || targetZoo < 1 || targetZoo > 8) return { reply: 'Pick a target: `/steal 3` robs Zoo 3️⃣. You must be standing on their zoo tile.', noMap: true };
  const entry = Object.entries(state.players).find(([, q]) => q.zoo === targetZoo);
  if (!entry) return { reply: `Zoo ${world.ZOO_EMOJI[targetZoo - 1]} is unclaimed — nothing to steal.` };
  const [victimLogin, victim] = entry;
  if (victimLogin === login) return { reply: 'Stealing from yourself? Your accountant says no.' };
  const tile = world.ZOO_TILES[targetZoo - 1];
  if (p.r !== tile.r || p.c !== tile.c) return { reply: `You need to be standing at Zoo ${world.ZOO_EMOJI[targetZoo - 1]} (${tile.r},${tile.c}) to attempt a heist. You're at (${p.r},${p.c}).` };
  if (now < p.stealLockUntil) return { reply: `🚔 You were caught recently — zoo security knows your face. Lockout ends in ${fmtDuration(p.stealLockUntil - now)}.` };
  if (now < p.stealCooldownUntil) return { reply: `🕶️ Too soon after your last heist — lay low for ${fmtDuration(p.stealCooldownUntil - now)}.` };
  if (victim.animals.length === 0) return { reply: `@${victimLogin}'s zoo is empty. There's nothing worth taking.` };
  if (p.energy < COST.steal) return { reply: `⚡ A heist takes ${COST.steal} energy and you have ${p.energy}.` };

  settlePlayer(victim, now);
  spendEnergy(p, COST.steal, now);
  const chance = Math.min(0.85, Math.max(0.10, 0.55 + 0.04 * level(p) - 0.08 * victim.security));

  if (rand() < chance) {
    const loot = victim.animals.splice(Math.floor(rand() * victim.animals.length), 1)[0];
    loot.caughtAt = now;
    p.animals.push(loot);
    p.stealCooldownUntil = now + STEAL_SUCCESS_COOLDOWN_MS;
    return {
      reply: `🥷 **HEIST SUCCESSFUL!** You slipped past security (${Math.round(chance * 100)}% odds) and made off with **${animals.animalLabel(loot)}**!`,
      announce: [`🚨 @${victimLogin} — **your ${animals.animalLabel(loot)} was just stolen by @${login}!** Beef up security with \`/buy guard\`, or plan your revenge...`],
    };
  }
  p.stealLockUntil = now + STEAL_FAIL_LOCKOUT_MS;
  return {
    reply: `🚨 **BUSTED!** ${victim.security ? `Security (🛡️×${victim.security}) caught you red-handed` : 'A night guard caught you red-handed'} (${Math.round(chance * 100)}% odds). You're locked out of heists for 6 hours.`,
    announce: [`😅 @${victimLogin} — @${login} just tried to rob your zoo and **got caught**. Your animals are safe.`],
  };
}

function doZooView(state, login, args) {
  let targetLogin = login;
  if (args[0]) {
    const num = parseInt(args[0], 10);
    if (num >= 1 && num <= 8) {
      const entry = Object.entries(state.players).find(([, q]) => q.zoo === num);
      if (!entry) return { reply: `Zoo ${world.ZOO_EMOJI[num - 1]} is unclaimed.`, noMap: true };
      targetLogin = entry[0];
    } else targetLogin = args[0].replace(/^@/, '');
  }
  const p = state.players[targetLogin];
  if (!p) return { reply: `@${targetLogin} isn't a zookeeper in this world.`, noMap: true };
  const sorted = [...p.animals].sort((a, b) => animals.animalValue(b) - animals.animalValue(a));
  const lines = sorted.slice(0, 30).map((a) => `- ${animals.animalLabel(a)} · ${animals.RARITIES[a.rarity].label} · ${animals.animalValue(a)} 🪙/hr`);
  const extra = sorted.length > 30 ? `\n...and ${sorted.length - 30} more` : '';
  return {
    reply: `### 🏛️ Zoo ${world.ZOO_EMOJI[p.zoo - 1]} — @${targetLogin}\n` +
      `**${p.animals.length}** animals · score **${collectionScore(p)}** · 🛡️ security ×${p.security} · Lv ${level(p)}\n\n${lines.join('\n')}${extra}`,
    noMap: true,
  };
}

function doBuy(p, args, now) {
  const item = SHOP.find((i) => i.key === (args[0] || '').toLowerCase());
  if (!item) return { reply: `Unknown item. ${shopText(p)}`, noMap: true };
  if (item.key === 'guard' && p.security >= MAX_SECURITY) return { reply: '🛡️ Your security is already maxed out (×5).', noMap: true };
  if (item.key === 'net' && p.gear.net) return { reply: '🕸️ You already own a capture net.', noMap: true };
  if (item.key === 'tranq' && p.gear.tranq) return { reply: '💉 You already own tranq darts.', noMap: true };
  if (item.key === 'energy' && p.energy >= MAX_ENERGY) return { reply: '⚡ Your energy is already full.', noMap: true };
  const cost = item.cost(p);
  if (p.coins < cost) return { reply: `You need ${cost} 🪙 for ${item.emoji} ${item.name} but have ${Math.floor(p.coins)} 🪙. Rarer animals bring more visitors (and coins).`, noMap: true };
  p.coins -= cost;
  if (item.key === 'guard') p.security++;
  else if (item.key === 'net') p.gear.net = true;
  else if (item.key === 'tranq') p.gear.tranq = true;
  else if (item.key === 'energy') { p.energy = MAX_ENERGY; p.energyTs = now; }
  return { reply: `✅ Bought ${item.emoji} **${item.name}** for ${cost} 🪙.${item.key === 'guard' ? ` Security is now ×${p.security}.` : ''}`, noMap: true };
}

// ── Text blocks ─────────────────────────────────────────────

function statusBar(p, login) {
  return `📍 **@${login}** · Zoo ${world.ZOO_EMOJI[p.zoo - 1]} · (${p.r},${p.c}) · ⚡ ${p.energy}/${MAX_ENERGY} · 🪙 ${Math.floor(p.coins)} · Lv ${level(p)} · 🛡️×${p.security}`;
}

function statsText(state, p, login) {
  const gear = [p.gear.net && '🕸️ net', p.gear.tranq && '💉 tranq'].filter(Boolean).join(', ') || 'none';
  const counts = {};
  for (const a of p.animals) counts[a.rarity] = (counts[a.rarity] || 0) + 1;
  const byRarity = Object.entries(animals.RARITIES)
    .filter(([k]) => counts[k]).map(([k, v]) => `${v.label} ×${counts[k]}`).join(' · ') || 'no animals yet';
  return `### 📊 Your stats\n` +
    `Collection: **${p.animals.length}** animals (${byRarity})\n` +
    `Income: **${collectionScore(p)} 🪙/hr** · Gear: ${gear} · XP: ${p.xp}\n` +
    `Heists: ${heistStatus(p)}`;
}

function heistStatus(p) {
  const now = p.coinsTs; // settled to "now" by settlePlayer
  if (now < p.stealLockUntil) return `🚔 locked out ${fmtDuration(p.stealLockUntil - now)}`;
  if (now < p.stealCooldownUntil) return `🕶️ cooling down ${fmtDuration(p.stealCooldownUntil - now)}`;
  return '🥷 ready';
}

function leaderboardText(state) {
  const rows = Object.entries(state.players)
    .map(([login, p]) => ({ login, p, score: collectionScore(p) }))
    .sort((a, b) => b.score - a.score);
  if (rows.length === 0) return 'No zookeepers yet — `/join` to be the first!';
  const medals = ['🥇', '🥈', '🥉'];
  return `### 🏆 Leaderboard\n` + rows.map((r, i) =>
    `${medals[i] || `${i + 1}.`} Zoo ${world.ZOO_EMOJI[r.p.zoo - 1]} @${r.login} — **${r.score}** pts · ${r.p.animals.length} animals`).join('\n');
}

function shopText(p) {
  const coins = p ? `You have **${Math.floor(p.coins)} 🪙**.\n\n` : '';
  return `### 🏪 Shop\n${coins}` + SHOP.map((i) =>
    `- \`/buy ${i.key}\` — ${i.emoji} **${i.name}** (${p ? i.cost(p) : i.cost({ security: 0 })} 🪙): ${i.desc}`).join('\n');
}

function helpText() {
  return `### 📖 How to play ZooWorld
Comment a command; the game replies with the updated world.

| Command | What it does | ⚡ |
|---|---|---|
| \`/join\` | Claim one of the 8 zoos in this world | — |
| \`/map\` | Show the world map | — |
| \`/move n s e w\` | Walk the ring road (chain steps: \`/move nne\`) | 1/step |
| \`/capture\` | Catch the wild animal on your tile | 2 |
| \`/steal <1-8>\` | Heist a rival zoo (stand on their tile first!) | 5 |
| \`/zoo [n or @user]\` | Inspect a collection | — |
| \`/shop\` · \`/buy <item>\` | Spend visitor income on gear & security | — |
| \`/me\` | Your stats | — |
| \`/top\` | Leaderboard | — |

⚡ regenerates 1 every 30 min (max ${MAX_ENERGY}). 🪙 accrue automatically — rarer animals draw more visitors.
Watch for ✨ Shiny and 🌟 Golden special editions, and for 🚨 mythical spawns (🐉🦄🐲🦑)!`;
}

function mentionAll(state, except) {
  return Object.keys(state.players).filter((l) => l !== except).map((l) => `@${l}`).join(' ');
}

function fmtDuration(ms) {
  const m = Math.ceil(ms / 60000);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

module.exports = { newWorldState, handleCommand, collectionScore, level, MAX_ENERGY };
