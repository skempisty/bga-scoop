/**
 * Scoop — BGA client UI
 */

const SUIT_SYMBOLS = ['♠', '♥', '♦', '♣'];
const SUIT_COLORS = ['black', 'red', 'red', 'black'];
const RANK_ORDER = ['10', 'K', 'Q', 'J', '9', '8', '7', '6', '5', '4', '3', '2', 'A'];

class PlayerTurn {
    constructor(game, bga) {
        this.game = game;
        this.bga = bga;
        this.selectedCardIds = new Set();
        this.selectedBlindSlot = null;
    }

    onEnteringState(args, isCurrentPlayerActive) {
        this.selectedCardIds.clear();
        this.selectedBlindSlot = null;
        this.game.renderBoard();
        this.game.updateSelectionUi();

        const roundLabel = _('Round ${round} of ${total}')
            .replace('${round}', args.round)
            .replace('${total}', args.numRounds);

        if (args.inFinalTurns) {
            this.bga.statusBar.setTitle(isCurrentPlayerActive
                ? _('${you} — final turns — ${round}')
                : _('${actplayer} — final turns — ${round}'));
        } else if (isCurrentPlayerActive) {
            this.bga.statusBar.setTitle(_('${you} must play, pick up, or play face-down — ${round}')
                .replace('${round}', roundLabel));
        } else {
            this.bga.statusBar.setTitle(_('${actplayer} is playing — ${round}')
                .replace('${round}', roundLabel));
        }

        if (isCurrentPlayerActive) {
            this.args = args;
            this.game.playBtn = this.bga.statusBar.addActionButton(_('Play selected'), () => this.onPlaySelected(), { color: 'primary' });
            this.game.pickupBtn = this.bga.statusBar.addActionButton(_('Pick up pile'), () => this.onPickUp(), { color: 'secondary' });
            this.game.blindBtn = this.bga.statusBar.addActionButton(_('Play face-down'), () => this.onPlayBlind(), { color: 'alert' });
            this.game.clearBtn = this.bga.statusBar.addActionButton(_('Clear selection'), () => this.clearSelection(), { color: 'secondary' });
            this.updateActionButtons(args);
        }
    }

    onLeavingState() {
        this.selectedCardIds.clear();
        this.selectedBlindSlot = null;
    }

    updateActionButtons(args) {
        const hasSelection = this.selectedCardIds.size > 0;
        const canPickUp = args.canPickUp;
        const canBlind = this.selectedBlindSlot !== null;

        if (this.game.playBtn) {
            this.game.playBtn.disabled = !hasSelection || canBlind;
        }
        if (this.game.pickupBtn) {
            this.game.pickupBtn.disabled = !canPickUp;
        }
        if (this.game.blindBtn) {
            this.game.blindBtn.disabled = !canBlind;
        }
    }

    clearSelection() {
        this.selectedCardIds.clear();
        this.selectedBlindSlot = null;
        this.game.updateSelectionUi();
        if (this.args) {
            this.updateActionButtons(this.args);
        }
    }

    onCardClick(cardId, source) {
        if (this.selectedBlindSlot !== null && source !== 'hand' && source !== 'table_up') {
            return;
        }

        if (this.selectedBlindSlot !== null) {
            if (this.selectedCardIds.has(cardId)) {
                this.selectedCardIds.delete(cardId);
            } else {
                this.selectedCardIds.add(cardId);
            }
        } else {
            const card = this.game.findCard(cardId);
            if (!card) {
                return;
            }

            if (this.selectedCardIds.size === 0) {
                this.selectedCardIds.add(cardId);
            } else {
                const first = this.game.findCard([...this.selectedCardIds][0]);
                if (first && first.type === card.type) {
                    if (this.selectedCardIds.has(cardId)) {
                        this.selectedCardIds.delete(cardId);
                    } else {
                        this.selectedCardIds.add(cardId);
                    }
                } else {
                    this.selectedCardIds.clear();
                    this.selectedCardIds.add(cardId);
                }
            }
        }

        this.game.updateSelectionUi();
        if (this.args) {
            this.updateActionButtons(this.args);
        }
    }

    onBlindSlotClick(slot) {
        if (this.args && !this.args.blindSlots.includes(slot)) {
            return;
        }

        if (this.selectedBlindSlot === slot) {
            this.selectedBlindSlot = null;
            this.selectedCardIds.clear();
        } else {
            this.selectedBlindSlot = slot;
            this.selectedCardIds.clear();
        }

        this.game.updateSelectionUi();
        if (this.args) {
            this.updateActionButtons(this.args);
        }
    }

    onPlaySelected() {
        const cardIds = [...this.selectedCardIds];
        if (cardIds.length === 0) {
            return;
        }

        this.bga.actions.performAction('actPlayCards', { card_ids: cardIds });
    }

    onPickUp() {
        this.bga.actions.performAction('actPickUp', {});
    }

    onPlayBlind() {
        if (this.selectedBlindSlot === null) {
            return;
        }

        this.bga.actions.performAction('actPlayBlind', {
            slot: this.selectedBlindSlot,
            extra_card_ids: [...this.selectedCardIds],
        });
    }
}

export class Game {
    constructor(bga) {
        this.bga = bga;
        this.playerTurn = new PlayerTurn(this, bga);
        this.bga.states.register('PlayerTurn', this.playerTurn);

        this.gamedatas = null;
        this.board = null;
        this.currentPlayerId = null;
    }

    setup(gamedatas) {
        this.gamedatas = gamedatas;
        this.currentPlayerId = this.bga.player_id;
        this.board = this.cloneBoardFromGamedatas(gamedatas);

        this.bga.gameArea.getElement().insertAdjacentHTML('beforeend', `
            <div id="scoop-table">
                <div id="scoop-round-banner"></div>
                <div id="scoop-middle-zone">
                    <div id="scoop-middle-label">${_('Pile')}</div>
                    <div id="scoop-middle-pile"></div>
                </div>
                <div id="scoop-players"></div>
                <div id="scoop-hand-zone">
                    <div id="scoop-hand-label">${_('Your hand')}</div>
                    <div id="scoop-hand"></div>
                </div>
            </div>
        `);

        Object.values(gamedatas.players).forEach(player => {
            this.bga.playerPanels.getElement(player.id).insertAdjacentHTML('beforeend', `
                <div class="scoop-panel-score">${_('Score')}: <span id="scoop-score-${player.id}">${player.score}</span></div>
            `);
        });

        this.renderBoard();
        this.setupNotifications();
    }

    cloneBoardFromGamedatas(gamedatas) {
        return {
            round: gamedatas.round,
            numRounds: gamedatas.numRounds,
            inFinalTurns: gamedatas.inFinalTurns,
            middle: [...(gamedatas.middle || [])],
            middleCount: gamedatas.middleCount,
            myHand: [...(gamedatas.myHand || [])],
            handCounts: { ...gamedatas.handCounts },
            tableSlots: JSON.parse(JSON.stringify(gamedatas.tableSlots || {})),
            players: { ...gamedatas.players },
        };
    }

    sortHand(cards) {
        const strength = (type) => {
            const idx = RANK_ORDER.indexOf(type);
            return idx === -1 ? 0 : RANK_ORDER.length - idx;
        };
        return [...cards].sort((a, b) => strength(b.type) - strength(a.type) || a.id - b.id);
    }

    findCard(cardId) {
        if (!this.board) {
            return null;
        }
        const inHand = this.board.myHand.find(c => c.id === cardId);
        if (inHand) {
            return inHand;
        }
        for (const pile of this.board.middle) {
            if (pile.id === cardId) {
                return pile;
            }
        }
        for (const playerId of Object.keys(this.board.tableSlots)) {
            for (const slot of this.board.tableSlots[playerId]) {
                if (slot.up && slot.up.id === cardId) {
                    return slot.up;
                }
            }
        }
        return null;
    }

    renderBoard() {
        if (!this.board) {
            return;
        }

        const banner = document.getElementById('scoop-round-banner');
        if (banner) {
            let text = _('Round ${round} of ${total}')
                .replace('${round}', this.board.round)
                .replace('${total}', this.board.numRounds);
            if (this.board.inFinalTurns) {
                text += ' — ' + _('Final turns');
            }
            banner.textContent = text;
        }

        this.renderMiddle();
        this.renderPlayers();
        this.renderHand();
        this.updateScores();
    }

    updateScores() {
        Object.values(this.board.players).forEach(player => {
            const el = document.getElementById(`scoop-score-${player.id}`);
            if (el) {
                el.textContent = player.score;
            }
        });
    }

    renderMiddle() {
        const pile = document.getElementById('scoop-middle-pile');
        if (!pile) {
            return;
        }
        pile.innerHTML = '';

        if (this.board.middle.length === 0) {
            pile.innerHTML = `<div class="scoop-empty-pile">${_('Empty')}</div>`;
            return;
        }

        const top = this.board.middle[this.board.middle.length - 1];
        pile.appendChild(this.createCardElement(top, 'middle'));
        if (this.board.middle.length > 1) {
            const count = document.createElement('div');
            count.className = 'scoop-pile-count';
            count.textContent = String(this.board.middle.length);
            pile.appendChild(count);
        }
    }

    renderPlayers() {
        const container = document.getElementById('scoop-players');
        if (!container) {
            return;
        }
        container.innerHTML = '';

        const playerIds = Object.keys(this.board.tableSlots).map(Number);
        playerIds.sort((a, b) => {
            if (a === this.currentPlayerId) {
                return -1;
            }
            if (b === this.currentPlayerId) {
                return 1;
            }
            return a - b;
        });

        playerIds.forEach(playerId => {
            const player = this.board.players[playerId] || this.board.players[String(playerId)];
            const isMe = playerId === this.currentPlayerId;
            const slots = this.board.tableSlots[playerId] || this.board.tableSlots[String(playerId)] || [];
            const handCount = this.board.handCounts[playerId] || 0;

            const zone = document.createElement('div');
            zone.className = 'scoop-player-zone' + (isMe ? ' scoop-player-me' : '');
            zone.id = `scoop-player-${playerId}`;

            zone.innerHTML = `
                <div class="scoop-player-name" style="color:#${player.color}">${player.name}${isMe ? ' (' + _('you') + ')' : ''}</div>
                <div class="scoop-player-meta">${_('Cards')}: ${handCount + slots.filter(s => s.hasDown || s.up).length}</div>
                <div class="scoop-slots"></div>
            `;

            const slotsEl = zone.querySelector('.scoop-slots');
            slots.forEach(slot => {
                const slotEl = document.createElement('div');
                slotEl.className = 'scoop-slot';

                if (slot.up) {
                    const cardEl = this.createCardElement(slot.up, 'table_up');
                    if (isMe) {
                        cardEl.addEventListener('click', () => this.playerTurn.onCardClick(slot.up.id, 'table_up'));
                    }
                    slotEl.appendChild(cardEl);
                } else if (slot.hasDown) {
                    const back = this.createCardBackElement();
                    back.classList.add('scoop-blind-target');
                    if (isMe) {
                        back.addEventListener('click', () => this.playerTurn.onBlindSlotClick(slot.slot));
                    }
                    slotEl.appendChild(back);
                } else {
                    slotEl.classList.add('scoop-slot-empty');
                }

                slotsEl.appendChild(slotEl);
            });

            container.appendChild(zone);
        });
    }

    renderHand() {
        const hand = document.getElementById('scoop-hand');
        if (!hand) {
            return;
        }
        hand.innerHTML = '';

        const sorted = this.sortHand(this.board.myHand);
        sorted.forEach(card => {
            const el = this.createCardElement(card, 'hand');
            el.addEventListener('click', () => this.playerTurn.onCardClick(card.id, 'hand'));
            hand.appendChild(el);
        });
    }

    createCardElement(card, location) {
        const el = document.createElement('div');
        el.className = 'scoop-card scoop-card-face';
        el.dataset.cardId = card.id;
        el.dataset.location = location;

        const suitIndex = card.suitIndex ?? 0;
        const color = SUIT_COLORS[suitIndex];
        const symbol = SUIT_SYMBOLS[suitIndex];

        el.innerHTML = `
            <div class="scoop-card-corner scoop-card-tl" style="color:${color}">${card.type}<span>${symbol}</span></div>
            <div class="scoop-card-center" style="color:${color}">${card.type}<span>${symbol}</span></div>
            <div class="scoop-card-corner scoop-card-br" style="color:${color}">${card.type}<span>${symbol}</span></div>
        `;

        return el;
    }

    createCardBackElement() {
        const el = document.createElement('div');
        el.className = 'scoop-card scoop-card-back';
        return el;
    }

    updateSelectionUi() {
        document.querySelectorAll('.scoop-card').forEach(el => {
            el.classList.remove('scoop-selected');
        });
        document.querySelectorAll('.scoop-blind-target').forEach(el => {
            el.classList.remove('scoop-blind-selected');
        });

        this.playerTurn.selectedCardIds.forEach(id => {
            const el = document.querySelector(`.scoop-card[data-card-id="${id}"]`);
            if (el) {
                el.classList.add('scoop-selected');
            }
        });

        if (this.playerTurn.selectedBlindSlot !== null) {
            const zones = document.querySelectorAll('.scoop-player-me .scoop-slot');
            const slotEl = zones[this.playerTurn.selectedBlindSlot];
            if (slotEl) {
                const back = slotEl.querySelector('.scoop-blind-target');
                if (back) {
                    back.classList.add('scoop-blind-selected');
                }
            }
        }
    }

    removeCardsFromPlayer(cardIds, playerId) {
        if (playerId === this.currentPlayerId) {
            this.board.myHand = this.board.myHand.filter(c => !cardIds.includes(c.id));
        }

        const slots = this.board.tableSlots[playerId];
        if (slots) {
            slots.forEach(slot => {
                if (slot.up && cardIds.includes(slot.up.id)) {
                    slot.up = null;
                }
                if (cardIds.some(id => {
                    const downMatch = slot.hasDown && !slot.up;
                    return downMatch;
                })) {
                    // handled per notification
                }
            });
        }
    }

    setupNotifications() {
        this.bga.notifications.setupPromiseNotifications();
    }

    async notif_roundStarted(args) {
        this.board.round = args.round;
        this.board.inFinalTurns = args.inFinalTurns || false;
        this.board.middle = args.middle || [];
        this.board.handCounts = { ...args.handCounts };
        this.board.tableSlots = JSON.parse(JSON.stringify(args.tableSlots || {}));
        this.renderBoard();
    }

    async notif_handUpdated(args) {
        this.board.myHand = [...args.cards];
        if (this.currentPlayerId) {
            this.board.handCounts[this.currentPlayerId] = args.cards.length;
        }
        this.renderHand();
        this.updateSelectionUi();
    }

    async notif_cardsPlayed(args) {
        const playerId = args.player_id;
        const cardIds = args.card_ids;

        this.removeCardsFromPlayer(cardIds, playerId);
        args.cards.forEach(card => this.board.middle.push(card));
        this.board.handCounts[playerId] = (this.board.handCounts[playerId] || 0);
        this.recountHand(playerId);
        this.renderBoard();
    }

    async notif_blindPlayed(args) {
        const playerId = args.player_id;
        const cardIds = args.cards.map(c => c.id);

        if (playerId === this.currentPlayerId) {
            this.board.myHand = this.board.myHand.filter(c => !cardIds.includes(c.id));
        }

        const slots = this.board.tableSlots[playerId];
        if (slots) {
            const slot = slots.find(s => s.slot === args.slot);
            if (slot) {
                slot.hasDown = false;
                slot.up = null;
            }
            args.cards.slice(1).forEach(card => {
                const upSlot = slots.find(s => s.up && s.up.id === card.id);
                if (upSlot) {
                    upSlot.up = null;
                }
            });
        }

        args.cards.forEach(card => this.board.middle.push(card));
        this.recountHand(playerId);
        this.renderBoard();
    }

    async notif_scoop(args) {
        this.board.middle = [];
        this.showScoopFlash();
        this.renderBoard();
    }

    async notif_pickup(args) {
        const playerId = args.player_id;
        const count = args.card_count;
        this.board.middle = [];
        this.board.handCounts[playerId] = (this.board.handCounts[playerId] || 0) + count;
        this.renderBoard();
    }

    async notif_playerWentOut(args) {
        this.board.inFinalTurns = true;
        this.renderBoard();
    }

    async notif_roundEnded(args) {
        this.board.round = args.round;
        Object.entries(args.players).forEach(([id, player]) => {
            this.board.players[id].score = player.score;
        });
        this.updateScores();
    }

    recountHand(playerId) {
        if (playerId === this.currentPlayerId) {
            this.board.handCounts[playerId] = this.board.myHand.length;
        }
    }

    showScoopFlash() {
        const pile = document.getElementById('scoop-middle-pile');
        if (!pile) {
            return;
        }
        pile.classList.add('scoop-scoop-flash');
        setTimeout(() => pile.classList.remove('scoop-scoop-flash'), 600);
    }
}
