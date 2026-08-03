# Scoop — Studio smoke checklist

Run these in BGA Studio after deploying. Start a fresh table for each major scenario.

## Setup

- [ ] Game loads with 3 players, 2 decks (default option)
- [ ] Each player has 4 face-down + 4 face-up slots + 11 cards in hand (19 total)
- [ ] Hand is sorted with 10s first (then K, Q, J, …, A)
- [ ] Round banner shows "Round 1 of 3"
- [ ] Table felt + card art visible

## Balanced deal (3 decks)

- [ ] Create table with 3 decks; verify deal completes (6+6+7 per player internally)

## Core play

- [ ] Play single card on empty pile
- [ ] Play multiple same-rank cards from hand + face-up mix
- [ ] Reject illegal higher rank (not 10)
- [ ] Play 10 on any top card → scoop, same player acts again
- [ ] Play to complete 4 of top rank → scoop
- [ ] Reject over-complete (e.g. 3 on pile + 2 of same rank)

## Pick up

- [ ] Pick up non-empty pile → cards to hand, same player again

## Face-down

- [ ] Play blind from uncovered slot
- [ ] Add matching extras from hand/face-up with blind play
- [ ] Illegal blind (too high) → pick up pile, play again
- [ ] Blind 10 or 4-of-kind → scoop

## Going out & final turns

- [ ] Player empties all zones → "went out" notification, final turns flag
- [ ] Each other player gets exactly one more turn
- [ ] Round ends when turn would return to player who went out

## Scoring & rounds

- [ ] Round scores: A=1, 2–9 face, J/Q/K=10, 10=20 on remaining cards
- [ ] `player_score` increases by penalty points (positive totals)
- [ ] Starter rotates each round
- [ ] After N rounds (N = player count) → game end, lowest score wins

## Zombie

- [ ] Zombie player picks up if pile exists, else plays a legal card

## Refresh

- [ ] F5 mid-game restores correct public/private card visibility
