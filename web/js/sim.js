'use strict';
// The authoritative game simulation. Pure logic, no DOM/three.js — it runs
// in solo play, on the multiplayer host, and headless in Node tests.
//
// All mutations flow through tick() and action(). Events (log lines,
// banners, sounds) are collected per tick and drained by the caller.

import {
  RAR, AI_DEFS, BASES, BASE_HALF, START_PENS, MAX_PENS, WORLD,
  penPos, TURRET_OFF, VAULT_OFF, shopCost, shopCan,
  rollSpecies, rollVariant, aValue, aLabel, score, levelOf, clamp, dist, sellPrice,
} from './data.js';

export const SPEED = 6.2;               // base walk speed (u/s)
export const SPRINT_MULT = 1.55;
export const STAM_MAX = 100, STAM_DRAIN = 26, STAM_REGEN = 18;
const AI_SPEED = 4.4;
const NET_RANGE = 2.1;
const GRAB_RANGE = 1.7;
const SECURE_RANGE = 4.2;
const TOUCH_RANGE = 1.0;
const MAX_SPAWNS = 15;
const WANTED_MAX = 5, WANTED_DECAY_MS = 60e3;
const STUN_MS = 1700, LOOSE_MS = 30e3;
const TURRET_CHARGE_MS = 1100, TURRET_CD_MS = 2600;
const turretRange = (lvl) => 3.4 + lvl * 1.3;

let seq = 1;

export function makePlayer(zooIdx, { name, avatar, isAI, id }) {
  const b = BASES[zooIdx];
  return {
    id: id || `ai${zooIdx}`, zoo: zooIdx, name, avatar, isAI: !!isAI,
    x: b.x, z: b.z + 3.2, vx: 0, vz: 0, sprint: false, moving: false,
    stamina: STAM_MAX, coins: 40, xp: 0,
    pens: START_PENS, vaultSlots: 0, turret: 0, alarm: false,
    gear: { net: false, boots: false, pack: false },
    animals: [],                     // {emoji,name,rarity,variant,vault}
    carrying: null,                  // {animal, fromZoo|null}
    wanted: 0, wantedT: 0, stunUntil: 0,
    // AI brain
    tx: b.x, tz: b.z + 3.2, mission: null, chase: null, nextThink: 0, nextSteal: 0,
    // turret runtime
    tTarget: null, tFireAt: 0, tCd: 0,
  };
}

export function newSim(humans /* [{id,name,avatar,zoo?}] */) {
  const sim = {
    players: [], spawns: [], merchant: null,
    nextSpawnAt: 0, nextMythAt: Date.now() + 240e3 + Math.random() * 300e3,
    nextMerchantAt: Date.now() + 150e3 + Math.random() * 200e3,
    events: [], sfx: [],
  };
  const taken = new Set(humans.map((h) => h.zoo).filter((z) => z !== undefined));
  let ai = 0;
  for (let i = 0; i < 8; i++) {
    const human = humans.find((h) => (h.zoo === i) || (h.zoo === undefined && !taken.has(i) && !sim.players.some((p) => p.id === h.id) && humans.indexOf(h) === i));
    if (human) { sim.players.push(makePlayer(i, { ...human, isAI: false })); taken.add(i); }
    else sim.players.push(makePlayer(i, { ...AI_DEFS[ai++], isAI: true }));
  }
  // everyone starts with one common resident
  for (const p of sim.players) {
    const s = rollSpecies(Math.random, 'common');
    p.animals.push({ ...s, variant: null, vault: false });
  }
  return sim;
}

function emit(sim, html, opts = {}) { sim.events.push({ html, ...opts }); }
export function drainEvents(sim) { const e = sim.events; sim.events = []; return e; }
export function drainSfx(sim) { const s = sim.sfx; sim.sfx = []; return s; }

// ── Collision ────────────────────────────────────────────────
// ponds are provided by the renderer's terrain gen; sim keeps a copy.
export function setPonds(sim, ponds) { sim.ponds = ponds; }
export function blocked(sim, x, z) {
  if (x < 1.2 || z < 1.2 || x > WORLD - 1.2 || z > WORLD - 1.2) return true;
  for (const p of sim.ponds || []) if (dist(p.x, p.z, x, z) < p.r + 0.45) return true;
  for (const b of BASES) if (dist(b.x, b.z - 1.2, x, z) < 1.4) return true; // clubhouse building
  return false;
}
export function tryMove(sim, o, dx, dz) {
  if (!blocked(sim, o.x + dx, o.z)) o.x += dx;
  if (!blocked(sim, o.x, o.z + dz)) o.z += dz;
}

// ── Carrying ─────────────────────────────────────────────────
export function carrySpeedMult(p) {
  if (!p.carrying) return 1;
  const base = RAR[p.carrying.animal.rarity].speed;
  return p.gear.pack ? base + (1 - base) * 0.4 : base;
}
export function moveSpeed(p) {
  let s = SPEED * (p.gear.boots ? 1.12 : 1) * carrySpeedMult(p);
  if (p.sprint && p.stamina > 0) s *= SPRINT_MULT;
  return s;
}
function dropCarried(sim, p, reason) {
  if (!p.carrying) return;
  const a = p.carrying.animal;
  sim.spawns.push({
    id: seq++, emoji: a.emoji, name: a.name, rarity: a.rarity, variant: a.variant,
    x: p.x, z: p.z, tx: p.x, tz: p.z, born: Date.now(),
    loose: true, looseUntil: Date.now() + LOOSE_MS, wt: 0, fleeUntil: 0,
  });
  p.carrying = null;
  emit(sim, `💥 <b>${p.name}</b> dropped ${aLabel(a)} (${reason}) — it's running loose, anyone can net it!`, { important: !p.isAI });
  sim.sfx.push('bad');
}

// ── Spawning ─────────────────────────────────────────────────
function spawnAnimal(sim, tier) {
  if (sim.spawns.length >= MAX_SPAWNS && !tier) return null;
  let x, z, tries = 0;
  do { x = 3 + Math.random() * (WORLD - 6); z = 3 + Math.random() * (WORLD - 6); tries++; }
  while (tries < 80 && ((sim.ponds || []).some((p) => dist(p.x, p.z, x, z) < p.r + 1)
    || BASES.some((b) => dist(b.x, b.z, x, z) < BASE_HALF + 1.5)));
  if (tries >= 80) return null;
  const s = rollSpecies(Math.random, tier);
  const a = { id: seq++, emoji: s.emoji, name: s.name, rarity: s.rarity, variant: null,
    x, z, tx: x, tz: z, born: Date.now(), wt: 0, loose: false, looseUntil: 0, fleeUntil: 0 };
  sim.spawns.push(a);
  if (a.rarity === 'mythical') { emit(sim, `🚨 <b>A wild ${a.emoji} ${a.name} has appeared!</b> Race for it!`, { important: true }); sim.sfx.push('alert'); }
  else if (a.rarity === 'legendary') emit(sim, `👀 A ${a.emoji} <b>${a.name}</b> (Legendary) was spotted in the wild...`);
  return a;
}

function tickSpawns(sim, now) {
  if (now > sim.nextSpawnAt) { sim.nextSpawnAt = now + 6500 + Math.random() * 5500; spawnAnimal(sim); }
  if (now > sim.nextMythAt) { sim.nextMythAt = now + 300e3 + Math.random() * 360e3; spawnAnimal(sim, 'mythical'); }
  // merchant
  if (!sim.merchant && now > sim.nextMerchantAt) {
    const side = (Math.random() * 4) | 0, t = 7 + Math.random() * (35 - 7);
    const [x, z] = side === 0 ? [t, 7] : side === 1 ? [t, 35] : side === 2 ? [7, t] : [35, t];
    const tier = Math.random() < 0.55 ? 'rare' : Math.random() < 0.75 ? 'epic' : 'legendary';
    const s = rollSpecies(Math.random, tier);
    const animal = { ...s, variant: rollVariant() };
    sim.merchant = { x, z, until: now + 95e3, animal, price: aValue(animal) * 8 };
    emit(sim, `🧙 <b>A traveling merchant appeared on the road!</b> Selling ${aLabel(animal)} for ${sim.merchant.price} 🪙 — first come, first served.`, { important: true });
    sim.sfx.push('alert');
  }
  if (sim.merchant && now > sim.merchant.until) {
    emit(sim, `🧙 The merchant packed up and left.`); sim.merchant = null;
    sim.nextMerchantAt = now + 240e3 + Math.random() * 240e3;
  }
  for (let i = sim.spawns.length - 1; i >= 0; i--) {
    const sp = sim.spawns[i];
    if (sp.loose && now > sp.looseUntil) { sp.loose = false; }
    if (!sp.loose && now - sp.born > (sp.rarity === 'mythical' ? 150e3 : 110e3)) { sim.spawns.splice(i, 1); continue; }
    // flee from nearby players (skittish by rarity); loose animals zigzag fast
    let nearest = null, nd = 1e9;
    for (const p of sim.players) { const d = dist(p.x, p.z, sp.x, sp.z); if (d < nd) { nd = d; nearest = p; } }
    const skittishR = sp.loose ? 3.5 : { common: 0, uncommon: 0, rare: 2.2, epic: 2.8, legendary: 3.4, mythical: 4 }[sp.rarity];
    if (nearest && nd < skittishR && nd > 0.01) {
      const away = 1 / nd;
      sp.tx = clamp(sp.x + (sp.x - nearest.x) * away * 4, 2, WORLD - 2);
      sp.tz = clamp(sp.z + (sp.z - nearest.z) * away * 4, 2, WORLD - 2);
      sp.fleeUntil = now + 900;
    } else if (now > sp.wt) {
      sp.wt = now + 1400 + Math.random() * 2400;
      const nx = sp.x + (Math.random() * 2 - 1) * 1.8, nz = sp.z + (Math.random() * 2 - 1) * 1.8;
      if (!blocked(sim, nx, nz)) { sp.tx = nx; sp.tz = nz; }
    }
    const d = dist(sp.tx, sp.tz, sp.x, sp.z);
    if (d > 0.08) {
      const spd = (sp.fleeUntil > now ? 3.4 : sp.loose ? 2.6 : 0.9) / 60;
      sp.x += (sp.tx - sp.x) / d * spd * 2.2; sp.z += (sp.tz - sp.z) / d * spd * 2.2;
    }
  }
}

// ── Actions (called for humans via input, for AI via brain) ──
export function actNet(sim, p) {
  if (p.carrying || Date.now() < p.stunUntil) return { ok: false, msg: 'Hands full!' };
  let target = null, best = NET_RANGE;
  for (const sp of sim.spawns) { const d = dist(p.x, p.z, sp.x, sp.z); if (d < best) { best = d; target = sp; } }
  if (!target) return { ok: false, msg: 'Nothing in net range' };
  let chance = RAR[target.rarity].chance + (p.gear.net ? 0.10 : 0) + Math.min(0.10, (levelOf(p.xp) - 1) * 0.01);
  if (p.sprint) chance -= 0.08;
  chance = clamp(chance, 0.05, 0.97);
  if (Math.random() < chance) {
    sim.spawns.splice(sim.spawns.indexOf(target), 1);
    const animal = { emoji: target.emoji, name: target.name, rarity: target.rarity,
      variant: target.variant || rollVariant(), vault: false };
    p.carrying = { animal, fromZoo: null };
    sim.sfx.push('good');
    if (target.rarity === 'mythical')
      emit(sim, `👑 <b>${p.name} netted the mythical ${target.emoji} ${target.name}!</b> Now they have to carry it home...`, { important: true });
    return { ok: true, caught: animal, chance };
  }
  target.fleeUntil = Date.now() + 2600;
  if (!p.isAI) sim.sfx.push('bad');
  return { ok: false, fled: true, chance, msg: `The ${target.emoji} ${target.name} dodged your net!` };
}

export function actGrab(sim, p) {
  if (p.carrying || Date.now() < p.stunUntil) return { ok: false, msg: 'Hands full!' };
  for (const owner of sim.players) {
    if (owner === p) continue;
    for (let i = 0; i < owner.animals.length; i++) {
      const a = owner.animals[i];
      if (a.vault) continue;
      const pp = penPos(owner.zoo, i);
      if (dist(p.x, p.z, pp.x, pp.z) < GRAB_RANGE) {
        owner.animals.splice(i, 1);
        p.carrying = { animal: { ...a, vault: false }, fromZoo: owner.zoo };
        p.wanted = Math.min(WANTED_MAX, p.wanted + 1); p.wantedT = Date.now();
        sim.sfx.push('alert');
        if (owner.alarm)
          emit(sim, `🔔 <b>ALARM at ${owner.name}'s zoo!</b> ${p.name} grabbed ${aLabel(a)} and is making a run for it!`, { important: true });
        else // no alarm bell = you find out from the logs, later. Buy the bell.
          emit(sim, `😈 <b>${p.name}</b> grabbed ${aLabel(a)} from ${owner.name}'s pens!`);
        // owner AI drops everything to defend
        if (owner.isAI) { owner.chase = p.id; owner.mission = null; }
        return { ok: true, animal: a, from: owner.name };
      }
    }
  }
  return { ok: false, msg: 'No animal in reach' };
}

export function actSecure(sim, p) {
  if (!p.carrying) return { ok: false, msg: 'Not carrying anything' };
  const b = BASES[p.zoo];
  if (dist(p.x, p.z, b.x, b.z) > SECURE_RANGE) return { ok: false, msg: 'Get to your own pens!' };
  if (p.animals.length >= p.pens) return { ok: false, full: true, msg: 'Pens full! Sell or release something (🏛️ panel), or buy a pen.' };
  const { animal, fromZoo } = p.carrying;
  p.animals.push(animal); p.carrying = null;
  const stolen = fromZoo !== null;
  p.xp += stolen ? 5 : RAR[animal.rarity].xp;
  sim.sfx.push(animal.variant || animal.rarity === 'mythical' ? 'great' : 'good');
  emit(sim, stolen
    ? `🏠 <b>${p.name}</b> secured the stolen ${aLabel(animal)}. The perfect crime.`
    : `🎊 <b>${p.name}</b> secured ${aLabel(animal)}${animal.variant ? ` — a ${aLabel(animal).includes('Golden') ? 'GOLDEN' : 'SHINY'} edition!` : ''}!`,
    { important: !p.isAI && (stolen || !!animal.variant || animal.rarity === 'mythical') });
  return { ok: true };
}

export function actBuyMerchant(sim, p) {
  const m = sim.merchant;
  if (!m) return { ok: false, msg: 'No merchant around' };
  if (dist(p.x, p.z, m.x, m.z) > 2.2) return { ok: false, msg: 'Walk to the merchant' };
  if (p.carrying) return { ok: false, msg: 'Hands full!' };
  if (p.coins < m.price) return { ok: false, msg: `You need ${m.price} 🪙` };
  p.coins -= m.price;
  p.carrying = { animal: { ...m.animal, vault: false }, fromZoo: null };
  emit(sim, `🧙 <b>${p.name}</b> bought ${aLabel(m.animal)} from the merchant!`, { important: false });
  sim.merchant = null; sim.nextMerchantAt = Date.now() + 240e3 + Math.random() * 240e3;
  sim.sfx.push('coin');
  return { ok: true };
}

export function actDrop(sim, p) { if (p.carrying) dropCarried(sim, p, 'dropped it'); return { ok: true }; }

export function actSell(sim, p, idx) {
  const a = p.animals[idx];
  if (!a) return { ok: false };
  if (p.animals.filter(Boolean).length <= 1) return { ok: false, msg: 'Keep at least one animal!' };
  p.animals.splice(idx, 1);
  p.coins += sellPrice(a);
  sim.sfx.push('coin');
  return { ok: true, coins: sellPrice(a) };
}
export function actRelease(sim, p, idx) {
  const a = p.animals[idx];
  if (!a) return { ok: false };
  p.animals.splice(idx, 1);
  const b = BASES[p.zoo];
  sim.spawns.push({ id: seq++, emoji: a.emoji, name: a.name, rarity: a.rarity, variant: a.variant,
    x: b.x, z: b.z + BASE_HALF + 1, tx: b.x, tz: b.z + BASE_HALF + 2, born: Date.now(), wt: 0, loose: false, looseUntil: 0, fleeUntil: 0 });
  return { ok: true };
}
export function actVault(sim, p, idx) {
  const a = p.animals[idx];
  if (!a) return { ok: false };
  if (a.vault) { a.vault = false; return { ok: true, vault: false }; }
  const used = p.animals.filter((x) => x.vault).length;
  if (used >= p.vaultSlots) return { ok: false, msg: 'No free vault slots (buy more in 🏪)' };
  a.vault = true;
  return { ok: true, vault: true };
}
export function actBuy(sim, p, key) {
  if (!shopCan(key, p)) return { ok: false, msg: 'Maxed out' };
  const cost = shopCost(key, p);
  if (p.coins < cost) return { ok: false, msg: `Need ${cost} 🪙` };
  p.coins -= cost;
  if (key === 'pen') p.pens++;
  else if (key === 'turret') p.turret++;
  else if (key === 'alarm') p.alarm = true;
  else if (key === 'vault') p.vaultSlots++;
  else p.gear[key] = true;
  sim.sfx.push('coin');
  return { ok: true, cost };
}

// ── Turrets ──────────────────────────────────────────────────
function tickTurrets(sim, now) {
  for (const owner of sim.players) {
    if (!owner.turret) { owner.tTarget = null; continue; }
    const b = BASES[owner.zoo];
    const tp = { x: b.x + TURRET_OFF.x, z: b.z + TURRET_OFF.z };
    const range = turretRange(owner.turret);
    if (now < owner.tCd) { owner.tTarget = null; continue; }
    // pick target: intruder carrying OUR animal beats any wanted intruder
    let target = null;
    for (const p of sim.players) {
      if (p === owner || now < p.stunUntil) continue;
      if (dist(p.x, p.z, tp.x, tp.z) > range) continue;
      if (p.carrying && p.carrying.fromZoo === owner.zoo) { target = p; break; }
      if (p.wanted > 0 && !target) target = p;
    }
    if (!target) { owner.tTarget = null; continue; }
    if (owner.tTarget !== target.id) { owner.tTarget = target.id; owner.tFireAt = now + TURRET_CHARGE_MS; }
    else if (now >= owner.tFireAt) {
      target.stunUntil = now + STUN_MS;
      dropCarried(sim, target, `zapped by ${owner.name}'s turret 🗼`);
      // knockback out of the base
      const kx = target.x - b.x, kz = target.z - b.z, kd = Math.hypot(kx, kz) || 1;
      tryMove(sim, target, kx / kd * 2.2, kz / kd * 2.2);
      owner.tCd = now + TURRET_CD_MS; owner.tTarget = null;
      sim.sfx.push('zap');
      if (!target.isAI) emit(sim, `⚡ <b>You got zapped by ${owner.name}'s turret!</b>`, { important: true });
    }
  }
}

// ── Owner-contact defense + wanted decay ─────────────────────
function tickJustice(sim, now) {
  for (const thief of sim.players) {
    if (!thief.carrying || thief.carrying.fromZoo === null) continue;
    const owner = sim.players[thief.carrying.fromZoo];
    if (owner && now >= owner.stunUntil && dist(owner.x, owner.z, thief.x, thief.z) < TOUCH_RANGE) {
      thief.stunUntil = now + STUN_MS;
      dropCarried(sim, thief, `tackled by ${owner.name}`);
      if (owner.isAI) owner.chase = null;
    }
  }
  for (const p of sim.players) {
    if (p.wanted > 0 && now - p.wantedT > WANTED_DECAY_MS) { p.wanted--; p.wantedT = now; }
  }
}

// ── AI brains ────────────────────────────────────────────────
function tickAI(sim, dt, now) {
  for (const p of sim.players) {
    if (!p.isAI || now < p.stunUntil) continue;
    // defend: chase the thief who has our animal
    if (p.chase) {
      const thief = sim.players.find((q) => q.id === p.chase);
      if (!thief || !thief.carrying || thief.carrying.fromZoo !== p.zoo) p.chase = null;
      else { p.tx = thief.x; p.tz = thief.z; }
    }
    if (!p.chase && now > p.nextThink) {
      p.nextThink = now + 900 + Math.random() * 900;
      if (p.carrying) { // head home
        const b = BASES[p.zoo]; p.tx = b.x; p.tz = b.z + 2.5;
      } else if (p.mission && p.mission.kind === 'steal') {
        const victim = sim.players[p.mission.victim];
        const i = victim.animals.findIndex((a) => !a.vault);
        if (i === -1) p.mission = null;
        else { const pp = penPos(victim.zoo, i); p.tx = pp.x; p.tz = pp.z; }
      } else if (now > p.nextSteal && Math.random() < 0.25) {
        const victims = sim.players.filter((q) => q !== p && q.animals.some((a) => !a.vault));
        if (victims.length) p.mission = { kind: 'steal', victim: victims[(Math.random() * victims.length) | 0].zoo };
      } else {
        // hunt nearest worthwhile spawn
        let target = null, best = 1e9;
        for (const sp of sim.spawns) {
          const d = dist(sp.x, sp.z, p.x, p.z) - RAR[sp.rarity].value * 0.25;
          if (d < best) { best = d; target = sp; }
        }
        if (target && Math.random() < 0.8) { p.tx = target.x; p.tz = target.z; }
        else { p.tx = 3 + Math.random() * (WORLD - 6); p.tz = 3 + Math.random() * (WORLD - 6); }
      }
    }
    // move
    const d = dist(p.tx, p.tz, p.x, p.z);
    p.moving = d > 0.35;
    if (p.moving) {
      const spd = AI_SPEED * carrySpeedMult(p) * (p.chase ? 1.35 : 1) * dt;
      tryMove(sim, p, (p.tx - p.x) / d * spd, (p.tz - p.z) / d * spd);
    }
    // act on arrival
    if (p.carrying) {
      const b = BASES[p.zoo];
      if (dist(p.x, p.z, b.x, b.z) < SECURE_RANGE - 1) {
        if (p.animals.length >= p.pens) { // AI sells its cheapest to make room
          let ci = -1, cv = 1e9;
          p.animals.forEach((a, i) => { if (!a.vault && aValue(a) < cv) { cv = aValue(a); ci = i; } });
          if (ci >= 0) actSell(sim, p, ci);
        }
        actSecure(sim, p);
        p.mission = null; p.nextSteal = now + 120e3 + Math.random() * 240e3;
      }
    } else if (p.mission && p.mission.kind === 'steal') {
      if (dist(p.x, p.z, p.tx, p.tz) < GRAB_RANGE - 0.4) { actGrab(sim, p); p.mission = null; }
    } else if (now > p.nextCap || true) {
      // try netting anything adjacent
      for (const sp of sim.spawns) {
        if (dist(sp.x, sp.z, p.x, p.z) < 1.1) { actNet(sim, p); break; }
      }
    }
    // AI buys defenses/pens occasionally
    if (Math.random() < 0.002) {
      for (const key of ['pen', 'turret', 'alarm', 'vault']) {
        if (shopCan(key, p) && p.coins >= shopCost(key, p) * 1.5) { actBuy(sim, p, key); break; }
      }
    }
  }
}

// ── Economy ──────────────────────────────────────────────────
function tickEconomy(sim, dt) {
  for (const p of sim.players) {
    p._carry = (p._carry || 0) + score(p.animals) / 60 * dt;
    if (p._carry >= 1) { const a = Math.floor(p._carry); p._carry -= a; p.coins += a; }
  }
}

// ── Master tick ──────────────────────────────────────────────
export function tick(sim, dt) {
  const now = Date.now();
  tickSpawns(sim, now);
  tickAI(sim, dt, now);
  tickTurrets(sim, now);
  tickJustice(sim, now);
  tickEconomy(sim, dt);
}

// What can this player do right now? (drives the action button)
export function availableAction(sim, p) {
  const now = Date.now();
  if (now < p.stunUntil) return { kind: 'stunned', label: `😵 ${Math.ceil((p.stunUntil - now) / 1000)}s` };
  if (p.carrying) {
    const b = BASES[p.zoo];
    if (dist(p.x, p.z, b.x, b.z) <= SECURE_RANGE)
      return p.animals.length < p.pens
        ? { kind: 'secure', label: 'Secure', emoji: '🏠' }
        : { kind: 'pensfull', label: 'Pens full!', emoji: '🚧' };
    return null; // carrying: main button hidden, drop button shows separately
  }
  if (sim.merchant && dist(p.x, p.z, sim.merchant.x, sim.merchant.z) < 2.2)
    return { kind: 'merchant', label: `${sim.merchant.price} 🪙`, emoji: '🧙' };
  for (const sp of sim.spawns)
    if (dist(p.x, p.z, sp.x, sp.z) < NET_RANGE) return { kind: 'net', label: 'Swing!', emoji: '🥅' };
  for (const owner of sim.players) {
    if (owner === p) continue;
    for (let i = 0; i < owner.animals.length; i++) {
      if (owner.animals[i].vault) continue;
      const pp = penPos(owner.zoo, i);
      if (dist(p.x, p.z, pp.x, pp.z) < GRAB_RANGE) return { kind: 'grab', label: 'Grab!', emoji: '😈' };
    }
  }
  return null;
}

export function doAction(sim, p, kind, arg) {
  switch (kind) {
    case 'net': return actNet(sim, p);
    case 'grab': return actGrab(sim, p);
    case 'secure': case 'pensfull': return actSecure(sim, p);
    case 'merchant': return actBuyMerchant(sim, p);
    case 'drop': return actDrop(sim, p);
    case 'sell': return actSell(sim, p, arg);
    case 'release': return actRelease(sim, p, arg);
    case 'vault': return actVault(sim, p, arg);
    case 'buy': return actBuy(sim, p, arg);
  }
  return { ok: false };
}

export { turretRange };
