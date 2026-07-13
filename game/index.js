'use strict';

// Entry point, run by the GitHub Actions workflow.
//
//   issue_comment  -> parse the command, advance the world, reply in-thread
//   workflow_dispatch -> bootstrap the next world (creates its game issue)
//
// State lives in data/: one JSON file per world plus a registry that maps
// issue numbers to worlds. The workflow commits whatever this script writes.

const fs = require('fs');
const path = require('path');
const engine = require('./engine');
const world = require('./world');
const gh = require('./github');

const DATA_DIR = path.join(__dirname, '..', 'data');
const REGISTRY = path.join(DATA_DIR, 'registry.json');

function loadJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function saveJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n');
}

function worldFile(n) {
  return path.join(DATA_DIR, 'worlds', `world-${n}.json`);
}

function worldIssueBody(n) {
  return `Welcome to **ZooWorld #${n}** — an 8-player zoo-tycoon world played entirely in this comment thread. 🦁

**Comment \`/join\` below to claim one of the 8 zoos.** Then \`/help\` shows every command.

- 🥾 Explore the ring road, capture wild animals (👀 rarity tiers, ✨🌟 special editions, 🚨 mythicals)
- 🥷 Walk to a rival's zoo and \`/steal\` from their collection
- 🪙 Your zoo earns visitor income — spend it on 🛡️ security and capture gear
- ⚡ Energy regenerates over time, so check in from your phone during the day

*Powered by GitHub Actions — every command gets a reply with the live world map.*`;
}

async function createWorld(registry, now) {
  const n = registry.nextWorld;
  const seed = (now ^ (n * 2654435761)) >>> 0;
  const issue = await gh.createIssue(`🌍 ZooWorld #${n} — comment /join to play!`, worldIssueBody(n));
  const state = engine.newWorldState(n, issue.number, seed, now);
  saveJson(worldFile(n), state);
  registry.worlds.push({ world: n, issue: issue.number });
  registry.nextWorld = n + 1;
  saveJson(REGISTRY, registry);
  return { state, issueNumber: issue.number };
}

async function main() {
  const eventName = process.env.GITHUB_EVENT_NAME;
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const registry = loadJson(REGISTRY, { worlds: [], nextWorld: 1 });
  const now = Date.now();

  if (eventName === 'workflow_dispatch') {
    const { issueNumber, state } = await createWorld(registry, now);
    console.log(`Created ZooWorld #${state.world} in issue #${issueNumber}`);
    return;
  }

  if (eventName !== 'issue_comment' || event.action !== 'created') return;
  const comment = event.comment;
  const issueNumber = event.issue.number;
  if (!comment || comment.user.type === 'Bot') return;          // never react to ourselves
  const body = (comment.body || '').trim();
  if (!body.startsWith('/')) return;
  const login = comment.user.login;

  const entry = registry.worlds.find((w) => w.issue === issueNumber);
  if (!entry) {
    // /join works from ANY issue: find (or bootstrap) an open world and put
    // the player straight in — so the game is fully startable from a phone.
    const isJoin = /^\/(join|play)\b/i.test(body);
    const isHelp = /^\/help\b/i.test(body);
    if (!isJoin && !isHelp) return;
    let open = findOpenWorld(registry);
    if (!isJoin) {
      const hint = open
        ? `Comment \`/join\` in issue #${open.issue} to play — or right here and I'll seat you.`
        : 'Comment `/join` right here and I\'ll open the first world for you!';
      await gh.postComment(issueNumber, `🦁 **This repo is a ZooWorld game!** ${hint}`);
      return;
    }
    let openState = open ? loadJson(worldFile(open.world), null) : null;
    if (!openState) {
      const created = await createWorld(registry, now);
      open = { world: created.state.world, issue: created.issueNumber };
      openState = created.state;
    }
    const joinRes = engine.handleCommand(openState, login, '/join', now, Math.random);
    saveJson(worldFile(open.world), openState);
    if (joinRes) await gh.postComment(open.issue, joinRes.reply);
    if (open.issue !== issueNumber) {
      await gh.postComment(issueNumber,
        `🎟️ You're in, @${login}! Your zoo is in **ZooWorld #${open.world}** — play in issue #${open.issue}.`);
    }
    return;
  }

  const state = loadJson(worldFile(entry.world), null);
  if (!state) { console.log(`Missing state file for world ${entry.world}`); return; }

  const rand = Math.random;
  const result = engine.handleCommand(state, login, body, now, rand);
  if (!result) return; // unrecognized command — stay quiet

  if (result.worldFull) {
    // Matchmaking: this world is full, spin up the next one and re-join there.
    let open = findOpenWorld(registry, entry.world);
    let openState = open ? loadJson(worldFile(open.world), null) : null;
    if (!openState || Object.keys(openState.players).length >= 8) {
      const created = await createWorld(registry, now);
      open = { world: created.state.world, issue: created.issueNumber };
      openState = created.state;
    }
    const joinRes = engine.handleCommand(openState, login, '/join', now, rand);
    saveJson(worldFile(open.world), openState);
    await gh.postComment(entry.issue,
      `🈵 ZooWorld #${entry.world} already has 8 zookeepers, @${login} — you've been placed in **ZooWorld #${open.world}** (issue #${open.issue}). See you there!`);
    if (joinRes) await gh.postComment(open.issue, joinRes.reply);
    return;
  }

  saveJson(worldFile(entry.world), state);
  await gh.postComment(entry.issue, result.reply);
  for (const announcement of result.announce || []) {
    await gh.postComment(entry.issue, announcement);
  }
}

function findOpenWorld(registry, excludeWorld) {
  for (const w of registry.worlds) {
    if (w.world === excludeWorld) continue;
    const state = loadJson(worldFile(w.world), null);
    if (state && Object.keys(state.players).length < 8) return w;
  }
  return null;
}

main().catch((err) => { console.error(err); process.exit(1); });
