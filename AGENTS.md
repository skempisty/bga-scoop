# Agent notes — Scoop (BGA)

BGA Studio game on the **new GameFramework** (PHP 8 state classes, `Deck`, ES6 client). Namespace: `Bga\Games\Scoop`. Self-published (`publisher_bgg_id: 4`); no BGG id.

## What to edit

| Live code | Do not treat as live |
|---|---|
| `modules/php/Game.php`, `Cards.php`, `States/*.php` | Putting unused files in `img/` (root of `img/` is **preloaded** for every client) |
| `modules/js/Game.js`, `scoop.css` | Introducing a TS/SCSS compile step unless the user asks — the client is hand-edited JS/CSS |
| `gameinfos.jsonc`, `gameoptions.jsonc`, `stats.jsonc`, `dbmodel.sql` | BGA box/banner/title in this repo — those go through Studio **Game Metadata Manager**, not `img/` |

`misc/` is studio-only notes and drafts. `misc/metadata/scoop-cover-fan-goldfix.png` is **README art only**, not in-game and not GMM. Cover concept: scooping hands + fan, gold 10 on top, Kings → Queen → Jack behind it. No ice-cream branding.

Never commit `.vscode/sftp.json`.

## Rules (implement against these)

- **2–6 players.** Rounds = player count. **Lowest** `player_score` wins (`EndScore` uses `reverseScore: true`).
- Deal **19** cards each: 11 hand, 4 `table_up`, 4 `table_down`. Hand sort: **10, K, Q, J, 9…A**.
- Play same-rank group, strength **≤** pile top (empty pile: any). Strength: A lowest … K … **10 highest**.
- **Scoop** (pile → `discard`, extra play): any **10**, or top rank reaches **exactly 4**. Over-complete is illegal.
- **Pickup** (pile → hand, extra play) if you cannot/will not play.
- Blind from an uncovered face-down slot; illegal reveal → pickup. After a legal blind, `AddMatching` may add same-rank from hand / face-up (cap so the top group does not exceed 4).
- Empty all zones → went out; others get one more turn; round ends when play would return to that player.
- Points on leftover cards: A=1, 2–9=face, J/Q/K=10, **10=20**. Score is **penalties** (positive totals).

Deck option id **100**: 2/3/4 decks, default 3.

## Architecture

```
setupNewGame → RoundSetup → PlayerTurn ⇄ AddMatching
                    ↑              ↓
              RoundAdvance    NextPlayer
                    ↑              ↓
            RoundEndConfirm ← EndRound  → (last round) EndScore
```

Client mirrors PHP states as classes in `Game.js` (`PlayerTurn`, `AddMatching`, `RoundEndConfirm`) plus `export class Game`. Notifications: `roundStarted`, `handUpdated`, `cardsPlayed`, `blindPlayed`, `scoop`, `pickup`, `playerWentOut`, `roundEnded`, `roundScore`, `playerReady`.

**Cards:** `card_type` = rank string (`'10'`, `'K'`, …). `card_type_arg` = `deckIndex * 4 + suitIndex` (suits: spade, heart, diamond, club). Locations: `sourceN`, `hand`, `table_up` / `table_down` (location_arg encodes player+slot via `Cards::slotArg`), `middle`, `discard`.

Globals (`initGameStateLabels`): `round_number` 10, `starter_player_id` 11, `went_out_player_id` 12, `in_final_turns` 13. Do not reuse those ids for states (AddMatching is 20).

## UI conventions

- Table: dark green felt (`img/table_felt.png`). Card faces: public-domain French/English pattern, `img/card-{S\|H\|D\|C}-{rank}.png` (120×168). Backs: `img/card_back.png`.
- Tens: Balatro-style gold foil in CSS — stock `#e8c547`, multiply so pips stay black/red, 135° overlay bands. Do not restyle tens as cream stock.
- Keep `img/` filenames free of spaces/parentheses. Prefer not adding subfolders BGA will not deploy.

## How to verify

After Studio deploy, run [`misc/STUDIO_SMOKE.md`](misc/STUDIO_SMOKE.md). Refresh (F5) must restore public/private visibility and the round-end overlay.
