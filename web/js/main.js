'use strict';
// Entry: input, HUD, panels, game modes (solo / MP host / MP guest).

import * as D from './data.js';
import * as Sim from './sim.js';
import * as W from './world3d.js';
import * as Net from './net.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const NET_LOCAL = params.get('net') === 'local';
const SAVE_KEY = 'zooworld-3d-v2';

let mode = 'solo';        // 'solo' | 'host' | 'guest'
let sim = null;           // authoritative sim (solo/host) or view-state (guest)
let myIdx = 0;
let net = null;
let roomCode = null;
let started = false;

// ── Audio ────────────────────────────────────────────────────
let AC = null, muted = false;
function beep(f, d = 0.09, t = 'square', v = 0.045) {
  if (muted) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = t; o.frequency.value = f; g.gain.value = v;
    o.connect(g); g.connect(AC.destination); o.start();
    g.gain.exponentialRampToValueAtTime(1e-4, AC.currentTime + d); o.stop(AC.currentTime + d);
  } catch (e) {}
}
const SFX = {
  coin: () => beep(880, .06, 'sine'),
  good: () => { beep(660, .1); setTimeout(() => beep(990, .12), 90); },
  great: () => { beep(660, .08); setTimeout(() => beep(880, .08), 80); setTimeout(() => beep(1320, .16), 160); },
  bad: () => beep(170, .2, 'sawtooth'),
  alert: () => { beep(520, .1); setTimeout(() => beep(390, .15), 110); },
  zap: () => { beep(1100, .05, 'sawtooth', .06); setTimeout(() => beep(220, .18, 'sawtooth', .06), 50); },
  step: () => beep(140, .03, 'sine', .015),
};
function playSfx(list) { for (const s of list) SFX[s]?.(); }

// ── Log / banner / toast ─────────────────────────────────────
const logLines = [];
function showEvents(events) {
  for (const e of events) {
    logLines.unshift(e); if (logLines.length > 60) logLines.pop();
    $('ticker').innerHTML = e.html;
    if (e.important) showBanner(e.html);
  }
  if (events.length && openPanel === 'log') renderPanel('log');
}
let bannerT = null;
function showBanner(html) {
  const b = $('banner'); b.innerHTML = html; b.style.display = 'block';
  clearTimeout(bannerT); bannerT = setTimeout(() => b.style.display = 'none', 5200);
}
let toastT = null;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.style.display = 'block';
  clearTimeout(toastT); toastT = setTimeout(() => t.style.display = 'none', 1800);
}

// ── Save / load (solo only) ──────────────────────────────────
function save() {
  if (mode !== 'solo' || !sim) return;
  try {
    const { events, sfx, ponds, ...rest } = sim;
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...rest, lastSeen: Date.now() }));
  } catch (e) {}
}
function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    s.events = []; s.sfx = [];
    return s;
  } catch (e) { return null; }
}
function applyOffline(s) {
  const away = Math.min(Date.now() - (s.lastSeen || Date.now()), 8 * 3600e3);
  if (away > 60e3) {
    const me = s.players[myIdx];
    const earned = Math.floor(D.score(me.animals) / 60 * (away / 1000));
    me.coins += earned;
    if (earned > 0) showEvents([{ html: `💤 While you were away, your zoo earned <b>${earned} 🪙</b>.`, important: true }]);
  }
  const t = Date.now();
  s.nextSpawnAt = Math.min(s.nextSpawnAt, t + 4e3);
  s.nextMythAt = Math.min(s.nextMythAt || t + 3e5, t + 300e3);
  s.nextMerchantAt = Math.min(s.nextMerchantAt || t + 2e5, t + 200e3);
  for (const p of s.players) { p.stunUntil = 0; p.tTarget = null; if (p.isAI) { p.chase = null; p.nextThink = 0; } }
}

// ── Input ────────────────────────────────────────────────────
const joyEl = $('joy'), knob = $('joy-knob');
let joy = { active: false, id: null, cx: 0, cy: 0, vx: 0, vy: 0 };
let wantSprint = false;
const keys = {};
addEventListener('keydown', (e) => keys[e.key.toLowerCase()] = true);
addEventListener('keyup', (e) => keys[e.key.toLowerCase()] = false);

function bindCanvasInput(canvas) {
  canvas.addEventListener('pointerdown', (e) => {
    if (joy.active) return;
    joy = { active: true, id: e.pointerId, cx: e.clientX, cy: e.clientY, vx: 0, vy: 0 };
    joyEl.style.display = 'block';
    joyEl.style.left = (e.clientX - 60) + 'px'; joyEl.style.top = (e.clientY - 60) + 'px';
    knob.style.transform = 'translate(-50%,-50%)';
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!joy.active || e.pointerId !== joy.id) return;
    let dx = e.clientX - joy.cx, dy = e.clientY - joy.cy;
    const d = Math.hypot(dx, dy), max = 48;
    if (d > max) { dx = dx / d * max; dy = dy / d * max; }
    joy.vx = dx / max; joy.vy = dy / max;
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  });
  const end = (e) => { if (e.pointerId === joy.id) { joy = { active: false, id: null, vx: 0, vy: 0 }; joyEl.style.display = 'none'; } };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
}
$('sprintbtn').addEventListener('pointerdown', () => wantSprint = true);
$('sprintbtn').addEventListener('pointerup', () => wantSprint = false);
$('sprintbtn').addEventListener('pointercancel', () => wantSprint = false);

let stepAcc = 0;
function applyInput(dt) {
  const me = sim.players[myIdx];
  if (Date.now() < me.stunUntil) { me.moving = false; me.vx = me.vz = 0; return; }
  let dx = joy.vx, dz = joy.vy;
  if (keys.w || keys.arrowup) dz -= 1;
  if (keys.s || keys.arrowdown) dz += 1;
  if (keys.a || keys.arrowleft) dx -= 1;
  if (keys.d || keys.arrowright) dx += 1;
  const l = Math.hypot(dx, dz);
  const moving = l > 0.12;
  const sprint = (wantSprint || keys.shift) && me.stamina > 1 && moving;
  me.sprint = sprint;
  // stamina
  if (sprint) me.stamina = Math.max(0, me.stamina - Sim.STAM_DRAIN * dt);
  else me.stamina = Math.min(Sim.STAM_MAX, me.stamina + Sim.STAM_REGEN * dt * (moving ? 0.6 : 1));
  // momentum: velocity eases toward target
  const spd = Sim.moveSpeed(me);
  const tvx = moving ? dx / Math.max(l, 1) * spd : 0;
  const tvz = moving ? dz / Math.max(l, 1) * spd : 0;
  const k = 1 - Math.exp(-11 * dt);
  me.vx += (tvx - me.vx) * k; me.vz += (tvz - me.vz) * k;
  me.moving = Math.hypot(me.vx, me.vz) > 0.4;
  Sim.tryMove(sim, me, me.vx * dt, me.vz * dt);
  // footsteps
  if (me.moving) {
    stepAcc += dt * (sprint ? 5.4 : 3.4);
    if (stepAcc >= 1) { stepAcc -= 1; SFX.step(); }
  }
}

// ── HUD ──────────────────────────────────────────────────────
function updateHud() {
  const me = sim.players[myIdx];
  $('hud-coins').textContent = D.fmt(me.coins);
  $('hud-level').textContent = D.levelOf(me.xp);
  $('hud-pens').textContent = `${me.animals.length}/${me.pens}`;
  $('hud-wanted').textContent = me.wanted > 0 ? '🚨'.repeat(Math.min(me.wanted, 5)) : '';
  $('stamfill').style.width = (me.stamina / Sim.STAM_MAX * 100) + '%';
  const c = $('carrychip');
  if (me.carrying) {
    c.style.display = 'block';
    c.innerHTML = `🥅 Carrying <b>${D.aLabel(me.carrying.animal)}</b> — take it home!`;
  } else c.style.display = 'none';
}

// action + drop buttons
const actionBtn = $('actionbtn');
let currentAction = null;
function updateActionButton() {
  const me = sim.players[myIdx];
  const act = Sim.availableAction(sim, me);
  currentAction = act;
  if (act) {
    $('ab-emoji').textContent = act.emoji || '❔';
    $('ab-label').textContent = act.label;
    actionBtn.style.display = 'block';
  } else actionBtn.style.display = 'none';
  $('dropbtn').style.display = me.carrying && !act ? 'block' : 'none';
}
function act(kind, arg) {
  const me = sim.players[myIdx];
  if (mode === 'guest') { net.broadcast({ t: 'act', kind, arg }); return; }
  const r = Sim.doAction(sim, me, kind, arg);
  if (r && !r.ok && r.msg) toast(r.msg);
  if (r && r.ok && kind === 'net') toast(`Got it! 🥅`);
  if (r && !r.ok && r.fled) toast(r.msg);
  if (r && r.full) { openSidePanel('zoo'); }
  afterAction();
}
function afterAction() {
  updateHud();
  if (openPanel) renderPanel(openPanel);
  if (mode === 'solo') save();
}
actionBtn.addEventListener('click', () => { if (currentAction) act(currentAction.kind); });
$('dropbtn').addEventListener('click', () => act('drop'));

// ── Side panel ───────────────────────────────────────────────
const spEl = $('sidepanel');
let openPanel = null;
function openSidePanel(which) {
  openPanel = which; renderPanel(which); spEl.classList.add('open');
  document.querySelectorAll('#menu [data-panel]').forEach((x) => x.classList.toggle('active', x.dataset.panel === which));
}
function closeSidePanel() {
  openPanel = null; spEl.classList.remove('open');
  document.querySelectorAll('#menu [data-panel]').forEach((x) => x.classList.remove('active'));
}
function renderPanel(which) {
  const me = sim.players[myIdx];
  const body = $('sp-body'), title = $('sp-title');
  if (which === 'zoo') {
    title.textContent = `🏛️ Your pens — ${me.animals.length}/${me.pens} · score ${D.score(me.animals)}`;
    const vaultUsed = me.animals.filter((a) => a.vault).length;
    body.innerHTML = `<div class="sub" style="margin-bottom:8px">🔒 Vault: ${vaultUsed}/${me.vaultSlots} · animals earn 🪙 only when penned</div>` +
      me.animals.map((a, i) => {
        const v = D.vinfo(a.variant);
        return `<div class="card" style="border-color:${a.vault ? 'var(--gold)' : D.RAR[a.rarity].color}">
          <div class="big">${v ? v.badge : ''}${a.emoji}${a.vault ? '🔒' : ''}</div>
          <div class="grow"><div class="title">${v ? v.label + ' ' : ''}${a.name}</div>
          <div class="sub">${D.RAR[a.rarity].label} · ${D.aValue(a)} 🪙/min</div></div>
          <div style="display:flex;flex-direction:column;gap:4px">
            <button class="buy" data-act="sell" data-i="${i}">Sell ${D.sellPrice(a)}🪙</button>
            <button class="buy alt" data-act="vault" data-i="${i}">${a.vault ? 'Unvault' : '🔒 Vault'}</button>
          </div></div>`;
      }).join('') || '<div class="sub">No animals — go net some!</div>';
  } else if (which === 'shop') {
    title.textContent = `🏪 Shop — ${D.fmt(me.coins)} 🪙`;
    body.innerHTML = D.SHOP.map((it) => {
      const can = D.shopCan(it.key, me), cost = can ? D.shopCost(it.key, me) : null;
      const owned = it.key === 'pen' ? ` (${me.pens})` : it.key === 'turret' ? ` (lv ${me.turret})` : it.key === 'vault' ? ` (${me.vaultSlots})` : '';
      return `<div class="card"><div class="big">${it.emoji}</div><div class="grow">
        <div class="title">${it.name}${owned}</div><div class="sub">${it.desc}</div></div>
        <button class="buy" data-act="buy" data-key="${it.key}" ${!can || me.coins < cost ? 'disabled' : ''}>${can ? cost + ' 🪙' : 'MAX'}</button></div>`;
    }).join('');
  } else if (which === 'rivals') {
    title.textContent = '🏆 Leaderboard';
    const rows = sim.players.map((p, i) => ({ p, i, sc: D.score(p.animals) })).sort((a, b) => b.sc - a.sc);
    const medals = ['🥇', '🥈', '🥉'];
    body.innerHTML = rows.map((r, rank) => `
      <div class="card" ${r.i === myIdx ? 'style="border-color:var(--gold)"' : ''}>
        <div class="big">${medals[rank] || (rank + 1) + '.'}</div><div class="big">${r.p.avatar}</div>
        <div class="grow"><div class="title">${r.p.name}${r.i === myIdx ? ' ⭐' : ''}${r.p.isAI ? '' : ' 👤'}</div>
        <div class="sub">${r.p.animals.length} animals · 🗼lv${r.p.turret} · ${r.p.wanted ? '🚨'.repeat(r.p.wanted) : 'clean'}</div></div>
        <div class="title" style="color:var(--gold)">${D.fmt(r.sc)} pts</div></div>`).join('');
  } else if (which === 'log') {
    title.textContent = '📜 World events';
    body.innerHTML = logLines.map((l) => `<div class="logrow">${l.html}</div>`).join('') || '<div class="logrow">Nothing yet.</div>';
  } else if (which === 'mp') {
    title.textContent = '🌐 Play with friends';
    if (mode === 'solo' && !net) {
      body.innerHTML = `
        <div class="sub" style="margin-bottom:10px">Play in the same world as up to 7 friends. One of you hosts; the rest join with the room code. (MP worlds are separate from your solo save.)</div>
        <button class="buy wide" id="mp-host">🎪 Host a world</button>
        <div style="display:flex;gap:8px;margin-top:10px">
          <input id="mp-code" placeholder="CODE" maxlength="4" style="flex:1;background:#2f4732;border:2px solid var(--line);border-radius:10px;color:var(--text);font-weight:800;font-size:16px;text-transform:uppercase;padding:10px;text-align:center;letter-spacing:4px">
          <button class="buy" id="mp-join">Join</button>
        </div>
        <div class="sub" id="mp-status" style="margin-top:10px"></div>`;
      $('mp-host').addEventListener('click', startHost);
      $('mp-join').addEventListener('click', () => startJoin($('mp-code').value.trim().toUpperCase()));
    } else {
      const humans = sim.players.filter((p) => !p.isAI);
      body.innerHTML = `
        <div class="card"><div class="big">🎟️</div><div class="grow">
          <div class="title">Room code: <span style="color:var(--gold);letter-spacing:3px">${roomCode}</span></div>
          <div class="sub">${mode === 'host' ? 'You are hosting — keep this tab open!' : 'Connected to host'}</div></div></div>
        <div class="sub" style="margin:8px 0">Players in world:</div>` +
        humans.map((p) => `<div class="card"><div class="big">${p.avatar}</div><div class="grow"><div class="title">${p.name}</div><div class="sub">Zoo ${p.zoo + 1}</div></div></div>`).join('') +
        `<button class="buy wide danger" id="mp-leave" style="margin-top:10px">Leave world</button>`;
      $('mp-leave').addEventListener('click', () => location.href = location.pathname);
    }
  }
  body.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
    const kind = b.dataset.act;
    act(kind, kind === 'buy' ? b.dataset.key : +b.dataset.i);
    setTimeout(() => openPanel && renderPanel(openPanel), 60);
  }));
}
$('menu').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.panel) {
    if (openPanel === b.dataset.panel) closeSidePanel();
    else openSidePanel(b.dataset.panel);
  }
});
$('sp-close').addEventListener('click', closeSidePanel);
$('btn-sound').addEventListener('click', (e) => { muted = !muted; e.target.textContent = muted ? '🔇' : '🔊'; });
let hardPaused = false;
$('btn-pause').addEventListener('click', (e) => { hardPaused = !hardPaused; e.target.textContent = hardPaused ? '▶️' : '⏸'; });
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

// ── Multiplayer: host ────────────────────────────────────────
const guestSeats = new Map(); // peerId -> slot
async function startHost() {
  roomCode = (params.get('mphost') || Net.makeRoomCode()).toUpperCase();
  $('mp-status') && ($('mp-status').textContent = 'Opening room...');
  try {
    net = await Net.hostRoom(roomCode, {
      onPeerJoin() {},
      onPeerLeave(id) {
        const slot = guestSeats.get(id);
        if (slot !== undefined) {
          const old = sim.players[slot];
          const ai = Sim.makePlayer(slot, { ...D.AI_DEFS[slot % D.AI_DEFS.length], isAI: true });
          ai.animals = old.animals; ai.coins = old.coins; ai.pens = old.pens;
          ai.turret = old.turret; ai.alarm = old.alarm; ai.vaultSlots = old.vaultSlots;
          sim.players[slot] = ai;
          guestSeats.delete(id);
          showEvents([{ html: `👋 <b>${old.name}</b> left — their zoo is AI-run now.` }]);
          W.setBaseOwner(slot, ai.name, false);
        }
      },
      onMessage(id, msg) {
        if (msg.t === 'hello') {
          let slot = sim.players.findIndex((p) => p.isAI);
          if (slot === -1) { net.send(id, { t: 'full' }); return; }
          const p = Sim.makePlayer(slot, { id, name: (msg.name || 'Friend').slice(0, 10), avatar: D.HUMAN_AVATARS[slot], isAI: false });
          p.animals = sim.players[slot].animals; // inherit the AI zoo's residents
          sim.players[slot] = p;
          guestSeats.set(id, slot);
          net.send(id, { t: 'welcome', slot, seed: sim.seed, snap: snapshot() });
          showEvents([{ html: `🎉 <b>${p.name}</b> joined the world (Zoo ${slot + 1})!`, important: true }]);
          W.setBaseOwner(slot, p.name, false);
          return;
        }
        const slot = guestSeats.get(id);
        if (slot === undefined) return;
        const p = sim.players[slot];
        if (msg.t === 'pos') {
          if (!Sim.blocked(sim, msg.x, msg.z)) { p.x = msg.x; p.z = msg.z; }
          p.moving = !!msg.moving; p.sprint = !!msg.sprint;
        } else if (msg.t === 'act') {
          const r = Sim.doAction(sim, p, msg.kind, msg.arg);
          if (r && !r.ok && r.msg) net.send(id, { t: 'res', msg: r.msg });
          if (r && r.ok && msg.kind === 'net') net.send(id, { t: 'res', msg: 'Got it! 🥅' });
        }
      },
    }, NET_LOCAL);
    mode = 'host';
    showBanner(`🎪 <b>Hosting room ${roomCode}</b> — friends can join with the code!`);
    if (openPanel === 'mp') renderPanel('mp');
  } catch (e) {
    toast('Could not open a room: ' + (e.message || e.type || e));
  }
}
function snapshot() {
  return {
    players: sim.players, spawns: sim.spawns, merchant: sim.merchant,
  };
}

// ── Multiplayer: guest ───────────────────────────────────────
function startJoin(code) {
  if (!code || code.length < 4) { toast('Enter the 4-letter room code'); return; }
  location.href = `${location.pathname}?mpjoin=${code}${NET_LOCAL ? '&net=local' : ''}&name=${encodeURIComponent(params.get('name') || 'Friend')}`;
}
async function bootGuest(code) {
  $('loading').style.display = 'flex';
  $('loading-msg').textContent = `Joining room ${code}...`;
  try {
    let welcomed = false;
    net = await Net.joinRoom(code, {
      onMessage(_id, msg) {
        if (msg.t === 'welcome' && !welcomed) {
          welcomed = true;
          myIdx = msg.slot; roomCode = code; mode = 'guest';
          sim = { players: msg.snap.players, spawns: msg.snap.spawns, merchant: msg.snap.merchant, events: [], sfx: [], seed: msg.seed };
          startWorld(msg.seed);
          $('loading').style.display = 'none';
          showBanner(`🎉 Joined <b>room ${code}</b> — you run Zoo ${myIdx + 1}!`);
        } else if (msg.t === 'snap' && welcomed) {
          applySnap(msg);
        } else if (msg.t === 'res') {
          toast(msg.msg);
        } else if (msg.t === 'full') {
          $('loading-msg').textContent = 'That world is full (8/8).';
        }
      },
      onClosed() {
        showBanner('🔌 <b>Host left.</b> Back to the menu...');
        setTimeout(() => location.href = location.pathname, 2500);
      },
    }, NET_LOCAL);
    net.broadcast({ t: 'hello', name: (params.get('name') || 'Friend').slice(0, 10) });
    setTimeout(() => { if (!welcomed) { $('loading-msg').textContent = 'No answer from that room 😕 — check the code and that the host is in-game.'; } }, 13000);
  } catch (e) {
    $('loading-msg').textContent = 'Connection failed: ' + (e.message || e.type || e);
  }
}
function applySnap(msg) {
  const meLocal = sim.players[myIdx];
  msg.players.forEach((np, i) => {
    if (i === myIdx) {
      // authoritative for everything EXCEPT my position/kinematics
      const { x, z, vx, vz, moving, sprint, stamina } = meLocal;
      Object.assign(meLocal, np, { x, z, vx, vz, moving, sprint, stamina });
    } else {
      const old = sim.players[i];
      np._sx = old ? old.x : np.x; np._sz = old ? old.z : np.z; // smooth from
      np._st = 0;
      sim.players[i] = np;
    }
  });
  sim.spawns = msg.spawns; sim.merchant = msg.merchant;
  if (msg.events?.length) showEvents(msg.events);
  if (msg.sfx?.length) playSfx(msg.sfx);
}
function smoothOthers(dt) {
  sim.players.forEach((p, i) => {
    if (i === myIdx || p._sx === undefined) return;
    p._st = Math.min(1, (p._st || 0) + dt * 8);
    p.x = p._sx + (p.x - p._sx) * p._st;
    p.z = p._sz + (p.z - p._sz) * p._st;
    if (p._st >= 1) { delete p._sx; delete p._sz; }
  });
}

// ── World boot ───────────────────────────────────────────────
function startWorld(seed) {
  const canvas = W.initScene($('game'));
  bindCanvasInput(canvas);
  const ponds = W.buildTerrain(seed);
  Sim.setPonds(sim, ponds);
  let aiN = 0;
  W.buildBases(sim.players.map((p, i) => ({
    name: p.name, isMe: i === myIdx,
    roof: i === myIdx ? 0xffd166 : D.AI_DEFS[(p.isAI ? aiN++ : i) % D.AI_DEFS.length].roof,
  })));
  W.buildPlayers(sim.players);
  W.initDust();
  started = true;
  requestAnimationFrame(loop);
}

// ── Main loop ────────────────────────────────────────────────
let last = 0, snapT = 0, posT = 0, saveT = 0, hudT = 0;
function loop(ts) {
  requestAnimationFrame(loop);
  const dt = Math.min((ts - last) / 1000, 0.05); last = ts;
  if (!sim || document.hidden) return;
  if (!hardPaused) {
    applyInput(dt);
    if (mode !== 'guest') {
      Sim.tick(sim, dt);
      const ev = Sim.drainEvents(sim), sfx = Sim.drainSfx(sim);
      showEvents(ev); playSfx(sfx);
      if (mode === 'host' && net) {
        snapT += dt;
        if (snapT > 0.12) { snapT = 0; net.broadcast({ t: 'snap', ...snapshot(), events: ev, sfx }); }
        else if (ev.length || sfx.length) net.broadcast({ t: 'snap', ...snapshot(), events: ev, sfx });
      }
    } else {
      smoothOthers(dt);
      posT += dt;
      if (posT > 0.1 && net) {
        posT = 0;
        const me = sim.players[myIdx];
        net.broadcast({ t: 'pos', x: me.x, z: me.z, moving: me.moving, sprint: me.sprint });
      }
    }
  }
  hudT += dt;
  if (hudT > 0.15) { hudT = 0; updateHud(); updateActionButton(); }
  W.syncDynamic(sim, myIdx, dt, ts);
  W.updateCamera(sim.players[myIdx], dt);
  W.render();
  if (mode === 'solo') { saveT += dt; if (saveT > 5) { saveT = 0; save(); } }
}

// ── Boot ─────────────────────────────────────────────────────
async function boot() {
  const joinCode = params.get('mpjoin');
  if (joinCode) { await bootGuest(joinCode.toUpperCase()); return; }
  const saved = load();
  if (saved && !params.get('fresh')) {
    sim = saved; applyOffline(sim);
  } else {
    sim = Sim.newSim([{ id: 'me', name: params.get('name') || 'You', avatar: '🤠' }]);
    sim.seed = (Math.random() * 1e9) | 0;
    showBanner('🌄 <b>Welcome to ZooWorld!</b> Net animals 🥅, carry them home 🏠, rob rivals 😈 — and defend your pens 🗼.');
  }
  myIdx = 0;
  startWorld(sim.seed);
  if (params.get('mphost')) startHost();
}
window.GAME = {
  get sim() { return sim; }, get myIdx() { return myIdx; }, get mode() { return mode; },
  Sim, D,
  reset: () => { localStorage.removeItem(SAVE_KEY); location.href = location.pathname; },
};
boot();
