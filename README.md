# 🦁 ZooWorld

A 3D multiplayer zoo-tycoon action game that runs entirely on GitHub Pages — no server, no accounts.

## ▶️ Play it now

**https://mrsweats.github.io/zoo-game/** — landscape mobile game. Touch anywhere and a joystick appears under your finger (WASD + Shift on desktop).

## The game

You run one of 8 zoo compounds around a ring road, against AI zookeepers — or your friends.

- 🥅 **Net & carry** — swing your butterfly net at wild animals, then carry the catch home on your back. Nothing is yours until it's secured in a pen. Rarer animals are slower to haul.
- 😈 **Grab & run heists** — walk into a rival's base, see every animal in its pen, grab the exact one you want, and RUN. The owner can tackle you; turrets zap you; dropped animals run loose for anyone to claim.
- 🗼 **Base defense** — buy a turret (visible range ring, 3 levels), an alarm bell, and vault slots that make chosen animals unstealable.
- 🏠 **Pen cap** — every animal needs a pen (6 to start, max 16). Full pens force choices: sell, release, or expand.
- 🚨 **Wanted level** — thieving raises your notoriety; turrets everywhere start targeting you until it cools off.
- 🧙 **Traveling merchant** — appears at random road spots selling exotics. First come, first served — and yes, you carry the purchase home.
- ✨ Rarity tiers up to Mythical (🐉🦄🐲🦑, world-announced), plus Shiny ✨ / Golden 🌟 special editions.
- 💨 Sprint with stamina, momentum movement, dust trails, offline coin earnings, autosave (solo).

## 🌐 Multiplayer

Tap **🌐 → Host a world** and share the 4-letter room code; up to 7 friends join from the same page. Connections are peer-to-peer (WebRTC via PeerJS) — the host's device is the authoritative server, AI runs the empty zoos, and MP worlds are separate from your solo save. Keep the host's tab open.

## Development

```bash
node <serve web/ over http>            # ES modules require http, not file://
# sim unit tests (pure logic, no browser):
#   see game logic in web/js/sim.js — testable headlessly in Node
```

- `web/js/data.js` — species, rarities, shop, world geometry constants
- `web/js/sim.js` — authoritative game simulation (pure logic, host-runnable)
- `web/js/world3d.js` — three.js renderer (terrain, bases, entities, effects)
- `web/js/net.js` — multiplayer transports (PeerJS + BroadcastChannel for tests)
- `web/js/main.js` — input, HUD, panels, solo/host/guest wiring
- `web/lib/` — vendored three.js and PeerJS
- `.github/workflows/pages.yml` — deploys `web/` to GitHub Pages on every push to `main`

Legacy modes from earlier iterations: the issue-comment multiplayer game (`game/`, `.github/workflows/zoo-world.yml`) still works — comment `/join` on any issue.

See [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) for design history.
