# 🦁 ZooWorld

A multiplayer zoo-collecting game played **entirely through GitHub issue comments** — perfect for the GitHub mobile app. Build your zoo, explore a ring-road world, capture rare animals, and steal from your rivals.

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
2. Go to **Actions → 🦁 ZooWorld → Run workflow**. This opens the *ZooWorld #1* issue.
3. Share the issue link — anyone who can comment can play. That's it: no server, no hosting; the world state lives in [`data/`](data/) and every turn is a commit.

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
