# ZooWorld — Game Design

Design decisions locked in with the game's creator (2026-07). Each choice below
was picked from alternatives; this is the record of what the game *is*.

## Platform

Played through GitHub issue comments so it works great in the GitHub mobile
app. One pinned issue per world is the game thread: players type commands
(`/move`, `/capture`, `/steal 3`) as comments, a GitHub Actions workflow
processes each one, commits the new state to `data/`, and replies with the
updated world. No hosting, no database — the repo is the game server.

- **Controls**: comment commands in a single world issue.
- **Display**: emoji-grid map in every bot reply (renders natively on mobile).
- **Alerts**: heist victims and mythical spawns are @mentioned — GitHub
  mobile push-notifies mentions, so it behaves like real game notifications.

## World

- **Map**: 13×13 grid. A ring road (monopoly-board style) with the **8 zoos**
  evenly spaced around it (corners + edge midpoints), wilderness inside and
  outside, a few impassable ponds. Terrain generated deterministically from
  the world seed.
- **Worlds & matchmaking**: each world holds exactly 8 players. `/join` on a
  full world auto-creates the next world issue and places you there.
- **Goal**: endless sandbox. No season resets — the flex is your collection
  and the live `/top` leaderboard.

## Pacing — energy

- 10 max energy, +1 every 30 minutes (lazily computed, no cron).
- Costs: move 1/step · capture 2 · steal 5.
- ⚡ Energy drink (25 🪙) refills instantly.

## Collection

- ~70 real species chosen for having native emoji, in 6 tiers:
  Common (1) → Uncommon (3) → Rare (8) → Epic (20) → Legendary (50, the
  extinct hall: 🦕🦖🦤🦣) → **Mythical (150: 🐉🦄🐲🦑)**.
- **Ambient spawns**: ~3 wild animals/hour appear at random passable tiles
  (cap 12 on the map, despawn after 24h). Everyone sees them on the map —
  racing to a rare spawn is the core PvE tension.
- **Encounters**: each move step has an 8% chance a wild animal jumps onto
  your tile.
- **Capture odds** by tier: 90 / 72 / 52 / 34 / 18 / 10 %, +10% each for
  🕸️ net and 💉 tranq gear (cap 97%). On failure, 50% chance the animal
  flees the map.
- **Special editions**, rolled per successful capture: ✨ Shiny (4%, 5×
  value) and 🌟 Golden (1%, 20× value).
- **Mythical spawns and captures are world-announced** with everyone
  @mentioned.

## Stealing — risk/reward heists

- Must be standing on the target zoo's tile (positioning matters; robbing
  the zoo across the ring is an expedition).
- Success chance: `55% + 4%·(your level) − 8%·(their security)`,
  clamped 10–85%.
- **Success**: a random animal from their collection transfers to yours;
  3h cooldown before your next heist. Victim is @mentioned.
- **Failure**: "busted" — 6h heist lockout, victim @mentioned, your shame
  is public in the thread.
- Defense: 🛡️ security upgrades (max ×5), cost scales 50·(level+1).

## Economy

- Passive visitor income: your collection score (sum of animal values,
  edition multipliers included) accrues as 🪙/hour, capped at 24h offline.
- Shop: 🛡️ guard (50+), 🕸️ net (150), 💉 tranq (400), ⚡ energy (25).
- New players start with 20 🪙 and one random common starter animal.

## Progression

- XP per capture equals the tier's value (mythical 120).
- Level = 1 + ⌊√(XP/10)⌋ — levels boost heist success.

## Engineering notes

- Dependency-free Node 18+; state in `data/worlds/world-N.json` +
  `data/registry.json` (issue → world mapping).
- The workflow uses a global concurrency group so turns are processed
  strictly one at a time — no state races; pushes retry with rebase.
- Time-based systems (energy, income, spawns) are all lazily evaluated on
  each action, so the game needs no scheduled jobs.
- The bot ignores comments from bots (loop protection) and non-`/` comments
  (the workflow's `if` filter avoids wasted runs).
