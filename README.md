# 🦁 ZooWorld

A zoo-collecting game: explore a ring-road world with 8 zoos, capture rare animals and special editions, and steal from rival zoos.

## ▶️ Play it now

**https://mrsweats.github.io/zoo-game/** — works great on your phone. Hold anywhere to walk, catch animals, rob the 7 AI zookeepers, and defend your own zoo. Progress saves automatically on your device.

The game lives in [`web/index.html`](web/index.html) (single file, no dependencies) and deploys to GitHub Pages automatically on every push to `main`.

---

## Bonus mode: play by GitHub issue comments

The same world also exists as a **real 8-player multiplayer game played entirely through GitHub issue comments** — perfect for playing with friends via the GitHub mobile app.

```
🟩🟩🌲🌾🟩🌵🟩🟩🟩🌴🟩
🟩1️⃣🟫🟫🟫2️⃣🟫🟫🟫3️⃣🟩
🐐🟫🐖🌲🟩🟩🌾🐓🟩🟫🟩
🟩🟫🟩🟩🟦🌳🟩🌸🟩🟫🟩
🟩8️⃣🟩🌳🌵🟩🟩🟩📍4️⃣🌸
🟩🟫🟩🟩🟩🟩🌸🟦🟦🟫🟩
🌳🟫🟩🌾🟩🌴🐸🟩🐯🟫🟩
🦊7️⃣🟫🟫🟫6️⃣🟫🟫🟫5️⃣🟩
🟩🟩🌳🟩🟩🐈🌳🟩🟩🟩🟩
```

## How to play

1. Find an open **🌍 ZooWorld** issue in this repo (or ask for one to be created).
2. Comment **`/join`** — you get one of the 8 zoos on the ring road and a starter animal.
3. Play by commenting; the game bot replies with the live world map:

| Command | What it does | ⚡ cost |
|---|---|---|
| `/join` | Claim one of the 8 zoos in this world | — |
| `/map` | Show the world map | — |
| `/move n s e w` | Walk the world (chain steps: `/move nne`) | 1/step |
| `/capture` | Catch the wild animal on your tile | 2 |
| `/steal <1-8>` | Heist a rival zoo — walk to their tile first! | 5 |
| `/zoo [n or @user]` | Inspect any collection | — |
| `/shop` / `/buy <item>` | Spend visitor income on gear & security | — |
| `/me` | Your stats | — |
| `/top` | Leaderboard | — |
| `/help` | All of the above, in-game | — |

## The game

- **⚡ Energy** — you have 10; it regenerates 1 every 30 minutes. Moving costs 1, capturing 2, heists 5. Check in a few times a day from your phone.
- **🐾 Collection** — ~70 real animal species across 6 rarity tiers, from 🐇 Common to 🦖 Legendary. Wild animals appear on the map — race your neighbors to them.
- **✨ Special editions** — every capture can roll **Shiny ✨ (5× value)** or **Golden 🌟 (20× value)**.
- **🚨 Mythicals** — 🐉🦄🐲🦑 spawn extremely rarely and the whole world gets @mentioned. First to reach one can try to capture it.
- **🥷 Heists** — stand on a rival's zoo tile and `/steal`. Success depends on your level vs their 🛡️ security. Get caught and you're locked out for 6 hours — and the victim is notified either way.
- **🪙 Economy** — your zoo passively earns coins from visitors based on how rare your collection is. Spend on 🛡️ security upgrades, 🕸️ nets, 💉 tranq darts, or ⚡ energy refills.
- **🌍 Worlds** — each world holds 8 players. `/join` a full world and matchmaking places you in the next one automatically.

## Setup (repo owner)

1. Merge this to the default branch and make sure **Actions are enabled**.
2. Open any issue and comment **`/join`** — the game bootstraps itself: it creates the *ZooWorld #1* issue and seats you there. (Running **Actions → 🦁 ZooWorld → Run workflow** also works.)
3. Share the world issue link — anyone who can comment can play. That's it: no server, no hosting; the world state lives in [`data/`](data/) and every turn is a commit.

## Development

Everything is dependency-free Node (18+):

```bash
node game/local-play.js                    # scripted demo game + assertions
node game/local-play.js alice "/move nne"  # play locally against .local-state.json
```

- `game/engine.js` — rules: commands, energy, captures, heists, economy
- `game/world.js` — 13×13 ring-road map generation + emoji rendering
- `game/animals.js` — species roster, rarities, special editions
- `game/index.js` — GitHub Actions entry point
- `.github/workflows/zoo-world.yml` — the game loop (one queued run per comment)

See [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) for the full design.
