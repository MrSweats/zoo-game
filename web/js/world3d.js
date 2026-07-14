'use strict';
// All three.js rendering. Consumes plain sim state each frame; owns meshes.

import * as THREE from '../lib/three.module.min.js';
import {
  RAR, AI_DEFS, WORLD, RD_MIN, RD_MAX, ROAD_W, BASES, BASE_HALF,
  penPos, TURRET_OFF, VAULT_OFF, vinfo, mulberry32,
} from './data.js';
import { turretRange } from './sim.js';

export let renderer, scene, camera;
let rnd = Math.random; // replaced with the room's seeded PRNG in buildTerrain

export function initScene(container) {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setClearColor(0x9fd9ff);
  container.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x9fd9ff, 34, 74);
  camera = new THREE.PerspectiveCamera(50, 2, 0.1, 200);
  scene.add(new THREE.HemisphereLight(0xcfeaff, 0x5aa04a, 1.05));
  const sun = new THREE.DirectionalLight(0xfff2cc, 1.5);
  sun.position.set(24, 36, 14);
  scene.add(sun);
  const onResize = () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', onResize);
  onResize();
  return renderer.domElement;
}

// ── Sprite helpers ───────────────────────────────────────────
function makeSprite(draw, scale = 2, w = 128, h = 128) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'));
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false,
  }));
  s.scale.set(scale, scale * h / w, 1);
  return s;
}
export function emojiSprite(emoji, scale = 2, label = null, sub = null) {
  return makeSprite((g) => {
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '84px serif'; g.fillText(emoji, 64, label ? 52 : 64);
    if (sub) { g.font = '40px serif'; g.fillText(sub, 100, 30); }
    if (label) {
      g.font = 'bold 21px sans-serif'; g.lineWidth = 5;
      g.strokeStyle = 'rgba(0,0,0,.75)'; g.fillStyle = '#fff';
      g.strokeText(label, 64, 114); g.fillText(label, 64, 114);
    }
  }, scale);
}
function blobShadow(r = 0.55, op = 0.28) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 18),
    new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: op, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.02;
  return m;
}
function flatRing(r, color, op = 0.6, inner = 0.72) {
  const m = new THREE.Mesh(new THREE.RingGeometry(r * inner, r, 30),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.04;
  return m;
}

// ── Static world ─────────────────────────────────────────────
export function buildTerrain(seed) {
  rnd = mulberry32(seed); // identical world for every player in the room
  const ponds = [];
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD + 60, WORLD + 60),
    new THREE.MeshLambertMaterial({ color: 0x79c04f }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(WORLD / 2, 0, WORLD / 2);
  scene.add(ground);
  for (let i = 0; i < 60; i++) {
    const p = new THREE.Mesh(new THREE.CircleGeometry(1 + rnd() * 2.4, 14),
      new THREE.MeshLambertMaterial({ color: rnd() < 0.5 ? 0x71b748 : 0x82ca58 }));
    p.rotation.x = -Math.PI / 2; p.position.set(rnd() * WORLD, 0.01, rnd() * WORLD);
    scene.add(p);
  }
  const roadMat = new THREE.MeshLambertMaterial({ color: 0xd9b98c });
  const mkRoad = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), roadMat);
    m.position.set(x, 0.03, z); scene.add(m);
  };
  const len = RD_MAX - RD_MIN + ROAD_W;
  mkRoad(len, ROAD_W, (RD_MIN + RD_MAX) / 2, RD_MIN); mkRoad(len, ROAD_W, (RD_MIN + RD_MAX) / 2, RD_MAX);
  mkRoad(ROAD_W, len, RD_MIN, (RD_MIN + RD_MAX) / 2); mkRoad(ROAD_W, len, RD_MAX, (RD_MIN + RD_MAX) / 2);
  let n = 0;
  while (n < 4) {
    const x = 6 + rnd() * (WORLD - 12), z = 6 + rnd() * (WORLD - 12);
    if (Math.abs(x - RD_MIN) < 3 || Math.abs(x - RD_MAX) < 3 || Math.abs(z - RD_MIN) < 3 || Math.abs(z - RD_MAX) < 3) continue;
    if (BASES.some((b) => Math.hypot(b.x - x, b.z - z) < BASE_HALF + 3)) continue;
    const r = 1.6 + rnd() * 1.2;
    const w = new THREE.Mesh(new THREE.CircleGeometry(r, 22), new THREE.MeshLambertMaterial({ color: 0x4aa3df }));
    w.rotation.x = -Math.PI / 2; w.position.set(x, 0.02, z); scene.add(w);
    ponds.push({ x, z, r }); n++;
  }
  const trunkM = new THREE.MeshLambertMaterial({ color: 0x8a5a2b });
  const leafM = [0x2f8f3e, 0x3aa04a, 0x27753a].map((c) => new THREE.MeshLambertMaterial({ color: c }));
  const rockM = new THREE.MeshLambertMaterial({ color: 0x9aa0a6 });
  for (let i = 0; i < 90; i++) {
    const x = 1 + rnd() * (WORLD - 2), z = 1 + rnd() * (WORLD - 2);
    const onRoad = (Math.abs(x - RD_MIN) < 2.2 || Math.abs(x - RD_MAX) < 2.2 || Math.abs(z - RD_MIN) < 2.2 || Math.abs(z - RD_MAX) < 2.2)
      && x > RD_MIN - 2.2 && x < RD_MAX + 2.2 && z > RD_MIN - 2.2 && z < RD_MAX + 2.2;
    if (onRoad) continue;
    if (BASES.some((b) => Math.hypot(b.x - x, b.z - z) < BASE_HALF + 1.4)) continue;
    if (ponds.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + 1.2)) continue;
    const kind = rnd();
    if (kind < 0.62) {
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.9, 7), trunkM);
      trunk.position.y = 0.45;
      const s = 0.8 + rnd() * 0.9;
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.85 * s, 1.7 * s, 8), leafM[(rnd() * 3) | 0]);
      leaf.position.y = 0.9 + 0.85 * s;
      g.add(trunk, leaf); g.position.set(x, 0, z); scene.add(g);
    } else if (kind < 0.8) {
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.32 + rnd() * 0.3), rockM);
      m.position.set(x, 0.25, z); m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3); scene.add(m);
    } else {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.3 + rnd() * 0.25, 8, 6),
        new THREE.MeshLambertMaterial({ color: rnd() < 0.6 ? 0x3aa04a : (rnd() < 0.5 ? 0xff8fc0 : 0xffe08a) }));
      m.position.set(x, 0.24, z); scene.add(m);
    }
  }
  return ponds;
}

// ── Bases: fences, clubhouse, pens grid, turret pad, vault ───
const baseVisuals = []; // per base: {penGroup, penSig, turretGroup, rangeRing, beam, sign}
export function buildBases(playerMeta /* [{name, roof, isMe}] */) {
  const fenceM = new THREE.MeshLambertMaterial({ color: 0xf5f0e6 });
  const wallM = new THREE.MeshLambertMaterial({ color: 0xf2e2c4 });
  const penM = new THREE.MeshLambertMaterial({ color: 0xb08d57 });
  for (let i = 0; i < 8; i++) {
    const b = BASES[i], g = new THREE.Group();
    const meta = playerMeta[i];
    // clubhouse
    const house = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.3, 1.7), wallM);
    house.position.set(0, 0.65, -1.2);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.75, 1.1, 4), new THREE.MeshLambertMaterial({ color: meta.roof }));
    roof.position.set(0, 1.85, -1.2); roof.rotation.y = Math.PI / 4;
    g.add(house, roof);
    // perimeter fence with gaps at each side's middle
    const H = BASE_HALF;
    for (const [sx, sz, w, d] of [[0, -H, 2 * H, 0.14], [0, H, 2 * H, 0.14], [-H, 0, 0.14, 2 * H], [H, 0, 0.14, 2 * H]]) {
      // two segments per side leaving a 1.8u gate gap
      const along = w > d ? 'x' : 'z';
      const segLen = (2 * H - 1.8) / 2;
      for (const sgn of [-1, 1]) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(along === 'x' ? segLen : 0.14, 0.7, along === 'z' ? segLen : 0.14), fenceM);
        f.position.set(sx + (along === 'x' ? sgn * (segLen / 2 + 0.9) : 0), 0.35, sz + (along === 'z' ? sgn * (segLen / 2 + 0.9) : 0));
        g.add(f);
      }
    }
    // pen pads (16 slots, drawn dim; occupied ones get sprites)
    for (let s = 0; s < 16; s++) {
      const pp = penPos(i, s);
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.05, 0.78), penM);
      pad.position.set(pp.x - b.x, 0.03, pp.z - b.z);
      g.add(pad);
    }
    // vault pad
    const vault = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.4, 1.0),
      new THREE.MeshLambertMaterial({ color: 0xd4af37 }));
    vault.position.set(VAULT_OFF.x, 0.2, VAULT_OFF.z);
    g.add(vault);
    const vaultIcon = emojiSprite('🔒', 0.9);
    vaultIcon.position.set(VAULT_OFF.x, 0.9, VAULT_OFF.z);
    g.add(vaultIcon);
    // sign
    const sign = emojiSprite(meta.isMe ? '⭐' : '🚩', 2.3, meta.isMe ? 'YOUR ZOO' : meta.name + "'s zoo");
    sign.position.y = 3.5;
    g.add(sign);
    g.position.set(b.x, 0, b.z);
    scene.add(g);
    // turret (hidden until built)
    const tg = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 1.5, 8),
      new THREE.MeshLambertMaterial({ color: 0x777f8a }));
    pole.position.y = 0.75;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8),
      new THREE.MeshLambertMaterial({ color: 0xff6b6b }));
    head.position.y = 1.65;
    tg.add(pole, head);
    tg.position.set(b.x + TURRET_OFF.x, 0, b.z + TURRET_OFF.z);
    tg.visible = false;
    scene.add(tg);
    const rangeRing = flatRing(1, 0xff6b6b, 0.22, 0.94);
    rangeRing.position.set(b.x + TURRET_OFF.x, 0.05, b.z + TURRET_OFF.z);
    rangeRing.visible = false;
    scene.add(rangeRing);
    const beamGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const beam = new THREE.Line(beamGeo, new THREE.LineBasicMaterial({ color: 0xffe08a }));
    beam.visible = false;
    scene.add(beam);
    baseVisuals.push({ g, penGroup: new THREE.Group(), penSig: '', turretGroup: tg, rangeRing, beam, head, sign });
    scene.add(baseVisuals[i].penGroup);
  }
}

// Swap a base's floating sign when a human joins/leaves that zoo.
export function setBaseOwner(i, name, isMe) {
  const bv = baseVisuals[i];
  if (!bv) return;
  bv.g.remove(bv.sign);
  bv.sign = emojiSprite(isMe ? '⭐' : '🚩', 2.3, isMe ? 'YOUR ZOO' : name + "'s zoo");
  bv.sign.position.y = 3.5;
  bv.g.add(bv.sign);
}

// ── Dynamic entities ─────────────────────────────────────────
const playerVis = [];   // {g, spr, carrySpr, stunSpr}
export function buildPlayers(players) {
  for (const p of players) {
    const g = new THREE.Group();
    const spr = emojiSprite(p.avatar, 1.95, p.name);
    spr.position.y = 1.15;
    g.add(spr, blobShadow(0.55));
    if (!p.isAI) g.add(flatRing(0.85, 0xffd166, 0.8));
    scene.add(g);
    playerVis.push({ g, spr, carrySpr: null, carryKey: '', stunSpr: null });
  }
}

const spawnVis = new Map();
function spawnKey(sp) { return `${sp.emoji}|${sp.loose ? 1 : 0}`; }
function addSpawnVis(sp) {
  const g = new THREE.Group();
  const spr = emojiSprite(sp.emoji, sp.rarity === 'mythical' ? 2.5 : 1.75);
  spr.position.y = 1.0;
  g.add(spr, blobShadow(0.5));
  if (sp.rarity !== 'common') g.add(flatRing(0.8, RAR[sp.rarity].hex, 0.75));
  if (sp.loose) g.add(flatRing(1.05, 0xffffff, 0.65));
  scene.add(g);
  spawnVis.set(sp.id, { g, spr, key: spawnKey(sp) });
}

let merchantVis = null;
// dust particles
const dust = [];
export function initDust() {
  for (let i = 0; i < 18; i++) {
    const s = makeSprite((g) => {
      g.fillStyle = 'rgba(222,205,170,.8)';
      g.beginPath(); g.arc(64, 64, 46, 0, 7); g.fill();
    }, 0.3);
    s.visible = false;
    scene.add(s);
    dust.push({ s, life: 0, vx: 0, vy: 0, vz: 0 });
  }
}
let dustIdx = 0, dustAcc = 0;
function puffDust(x, z, dt, strong) {
  dustAcc += dt * (strong ? 26 : 12);
  while (dustAcc >= 1) {
    dustAcc -= 1;
    const d = dust[dustIdx++ % dust.length];
    d.s.visible = true; d.life = 0.5;
    d.s.position.set(x + (rnd() - 0.5) * 0.4, 0.15, z + (rnd() - 0.5) * 0.4);
    d.vx = (rnd() - 0.5) * 0.8; d.vy = 0.8 + rnd() * 0.5; d.vz = (rnd() - 0.5) * 0.8;
    d.s.material.opacity = 0.75;
  }
}

// One call per frame: reconcile every dynamic visual with sim state.
export function syncDynamic(sim, myIdx, dt, ts) {
  const now = Date.now();
  // players
  sim.players.forEach((p, i) => {
    const v = playerVis[i];
    v.g.position.set(p.x, 0, p.z);
    const bob = p.moving ? Math.abs(Math.sin(ts / (p.sprint ? 85 : 115))) * (p.sprint ? 0.2 : 0.15) : Math.sin(ts / 600) * 0.05;
    v.spr.position.y = 1.15 + bob;
    v.spr.material.rotation = p.moving ? Math.sin(ts / 140) * 0.06 : 0;
    if (p.moving && (p.sprint || p.isAI && p.chase)) puffDust(p.x, p.z, dt, p.sprint);
    // carried animal on back
    const ck = p.carrying ? p.carrying.animal.emoji : '';
    if (ck !== v.carryKey) {
      if (v.carrySpr) { v.g.remove(v.carrySpr); v.carrySpr = null; }
      if (ck) {
        v.carrySpr = emojiSprite(ck, 1.15, null, '🥅');
        v.carrySpr.position.y = 2.35;
        v.g.add(v.carrySpr);
      }
      v.carryKey = ck;
    }
    if (v.carrySpr) v.carrySpr.position.y = 2.35 + Math.sin(ts / 180) * 0.08;
    // stun stars
    const stunned = now < p.stunUntil;
    if (stunned && !v.stunSpr) { v.stunSpr = emojiSprite('💫', 1.0); v.stunSpr.position.y = 2.0; v.g.add(v.stunSpr); }
    if (!stunned && v.stunSpr) { v.g.remove(v.stunSpr); v.stunSpr = null; }
    if (v.stunSpr) v.stunSpr.material.rotation = ts / 150;
  });
  // spawns
  const liveIds = new Set();
  for (const sp of sim.spawns) {
    liveIds.add(sp.id);
    let v = spawnVis.get(sp.id);
    if (v && v.key !== spawnKey(sp)) { scene.remove(v.g); spawnVis.delete(sp.id); v = null; }
    if (!v) { addSpawnVis(sp); v = spawnVis.get(sp.id); }
    v.g.position.set(sp.x, 0, sp.z);
    v.spr.position.y = 1.0 + Math.abs(Math.sin(ts / (sp.loose || sp.fleeUntil > now ? 130 : 240) + sp.id)) * 0.15;
  }
  for (const [id, v] of spawnVis) if (!liveIds.has(id)) { scene.remove(v.g); spawnVis.delete(id); }
  // merchant
  if (sim.merchant && !merchantVis) {
    const g = new THREE.Group();
    const spr = emojiSprite('🧙', 2.2, 'MERCHANT');
    spr.position.y = 1.3;
    g.add(spr, blobShadow(0.6), flatRing(1.0, 0xffd166, 0.8));
    scene.add(g);
    merchantVis = g;
  }
  if (merchantVis) {
    if (!sim.merchant) { scene.remove(merchantVis); merchantVis = null; }
    else {
      merchantVis.position.set(sim.merchant.x, 0, sim.merchant.z);
      merchantVis.children[0].position.y = 1.3 + Math.sin(ts / 400) * 0.1;
    }
  }
  // pens + turrets per base
  sim.players.forEach((p, i) => {
    const bv = baseVisuals[i];
    const sig = p.animals.map((a) => a.emoji + (a.variant || '') + (a.vault ? 'V' : '')).join(',');
    if (sig !== bv.penSig) {
      bv.penSig = sig;
      scene.remove(bv.penGroup);
      bv.penGroup = new THREE.Group();
      p.animals.forEach((a, s) => {
        const pp = penPos(i, s);
        const v = vinfo(a.variant);
        const spr = emojiSprite(a.emoji, 0.95, null, a.vault ? '🔒' : v ? v.badge : null);
        spr.position.set(pp.x, 0.55, pp.z);
        bv.penGroup.add(spr);
      });
      scene.add(bv.penGroup);
    }
    // subtle pen idle bob
    bv.penGroup.children.forEach((c, s) => { c.position.y = 0.55 + Math.abs(Math.sin(ts / 300 + s * 1.3)) * 0.06; });
    const hasT = p.turret > 0;
    bv.turretGroup.visible = hasT;
    bv.rangeRing.visible = hasT;
    if (hasT) {
      const r = turretRange(p.turret);
      bv.rangeRing.scale.set(r, r, 1);
      bv.head.material.color.setHex(p.tTarget ? 0xffe08a : 0xff6b6b);
      const target = p.tTarget ? sim.players.find((q) => q.id === p.tTarget) : null;
      bv.beam.visible = !!target;
      if (target) {
        const pos = bv.beam.geometry.attributes.position.array;
        pos[0] = bv.turretGroup.position.x; pos[1] = 1.65; pos[2] = bv.turretGroup.position.z;
        pos[3] = target.x; pos[4] = 1.0; pos[5] = target.z;
        bv.beam.geometry.attributes.position.needsUpdate = true;
      }
    } else bv.beam.visible = false;
  });
  // dust decay
  for (const d of dust) {
    if (!d.s.visible) continue;
    d.life -= dt;
    if (d.life <= 0) { d.s.visible = false; continue; }
    d.s.position.x += d.vx * dt; d.s.position.y += d.vy * dt; d.s.position.z += d.vz * dt;
    d.s.material.opacity = d.life * 1.5;
  }
}

// chase camera with sprint lookahead
const camPos = new THREE.Vector3(), camTarget = new THREE.Vector3();
export function updateCamera(me, dt) {
  const ahead = me.moving ? 1.4 : 0;
  camPos.set(me.x + me.vx * ahead * 0.15, 12.5, me.z + 9.5 + me.vz * ahead * 0.1);
  camera.position.lerp(camPos, 1 - Math.pow(0.002, dt));
  camTarget.set(me.x, 0.9, me.z);
  camera.lookAt(camTarget);
}
export function render() { renderer.render(scene, camera); }
