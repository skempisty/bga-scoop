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
        this.isActive = false;
    }

    onEnteringState(args, isCurrentPlayerActive) {
        this.selectedCardIds.clear();
        this.selectedBlindSlot = null;
        this.isActive = !!isCurrentPlayerActive;
        this.args = args;
        this.game.renderBoard();
        this.game.updateSelectionUi();
        this.updateActionButtons(args);

        if (args.inFinalTurns) {
            this.bga.statusBar.setTitle(isCurrentPlayerActive
                ? _('${you} — final turns')
                : _('${actplayer} — final turns'));
        } else if (isCurrentPlayerActive) {
            this.bga.statusBar.setTitle(_('${you} must play, pick up, or play face-down'));
        } else {
            this.bga.statusBar.setTitle(_('${actplayer} is playing'));
        }

        this.bga.statusBar.removeActionButtons();
        if (isCurrentPlayerActive) {
            this.bga.statusBar.addActionButton(_('Play selected'), () => this.onPlaySelected(), { color: 'primary' });
            this.bga.statusBar.addActionButton(_('Pick up pile'), () => this.onPickUp(), {
                color: 'secondary',
                disabled: !args.canPickUp,
            });
            this.bga.statusBar.addActionButton(_('Play face-down'), () => this.onPlayBlind(), {
                color: 'alert',
                disabled: true,
                id: 'scoop-btn-blind',
            });
            this.bga.statusBar.addActionButton(_('Clear'), () => this.clearSelection(), { color: 'secondary' });
        }
    }

    onLeavingState() {
        this.isActive = false;
        this.selectedCardIds.clear();
        this.selectedBlindSlot = null;
        this.bga.statusBar.removeActionButtons();
    }

    updateActionButtons(args) {
        const canBlind = this.selectedBlindSlot !== null;
        const statusBlind = document.getElementById('scoop-btn-blind');
        if (statusBlind) {
            statusBlind.disabled = !canBlind;
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
        if (!this.isActive) {
            return;
        }

        if (this.selectedBlindSlot !== null) {
            if (source !== 'hand' && source !== 'table_up') {
                return;
            }
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
        if (!this.isActive) {
            return;
        }
        if (this.args && !(this.args.blindSlots || []).includes(slot)) {
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
        // Always send the key — empty arrays can be dropped by the request layer
        this.bga.actions.performAction('actPlayBlind', {
            slot: this.selectedBlindSlot,
            extra_card_ids: this.selectedCardIds.size > 0 ? [...this.selectedCardIds] : [],
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

    getCurrentPlayerId() {
        return this.bga.gameui?.player_id ?? this.bga.player_id ?? this.currentPlayerId;
    }

    setup(gamedatas) {
        this.gamedatas = gamedatas;
        this.currentPlayerId = this.getCurrentPlayerId();
        this.board = this.cloneBoardFromGamedatas(gamedatas);

        this.bga.gameArea.getElement().insertAdjacentHTML('beforeend', `
            <div id="scoop-table">
                <div id="scoop-round-banner"></div>
                <div id="scoop-arena">
                    <div id="scoop-middle-zone">
                        <div id="scoop-middle-label">${_('Pile')}</div>
                        <div id="scoop-middle-pile"></div>
                    </div>
                </div>
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
        const handCounts = {};
        Object.entries(gamedatas.handCounts || {}).forEach(([id, count]) => {
            handCounts[id] = Number(count);
        });

        return {
            round: Number(gamedatas.round),
            numRounds: Number(gamedatas.numRounds),
            inFinalTurns: !!gamedatas.inFinalTurns,
            middle: [...(gamedatas.middle || [])],
            middleCount: Number(gamedatas.middleCount || 0),
            myHand: [...(gamedatas.myHand || [])],
            handCounts,
            tableSlots: JSON.parse(JSON.stringify(gamedatas.tableSlots || {})),
            players: { ...gamedatas.players },
        };
    }

    sortHand(cards) {
        // Weakest on the left, strongest (10s) on the right
        const strength = (type) => {
            const idx = RANK_ORDER.indexOf(type);
            return idx === -1 ? 0 : RANK_ORDER.length - idx;
        };
        return [...cards].sort((a, b) => strength(a.type) - strength(b.type) || a.id - b.id);
    }

    findCard(cardId) {
        if (!this.board) {
            return null;
        }
        const id = Number(cardId);
        const inHand = this.board.myHand.find(c => Number(c.id) === id);
        if (inHand) {
            return inHand;
        }
        for (const pile of this.board.middle) {
            if (Number(pile.id) === id) {
                return pile;
            }
        }
        for (const playerId of Object.keys(this.board.tableSlots)) {
            for (const slot of this.board.tableSlots[playerId]) {
                if (slot.up && Number(slot.up.id) === id) {
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
        this.updateSelectionUi();
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
            pile.style.width = '72px';
            pile.innerHTML = `<div class="scoop-empty-pile">${_('Empty')}</div>`;
            return;
        }

        const peek = 20;
        const cardWidth = 72;
        this.board.middle.forEach((card, index) => {
            const el = this.createCardElement(card, 'middle');
            el.classList.add('scoop-pile-card');
            el.style.left = `${index * peek}px`;
            el.style.zIndex = String(index + 1);
            pile.appendChild(el);
        });
        pile.style.width = `${cardWidth + (this.board.middle.length - 1) * peek}px`;
    }

    orderedPlayerIdsAroundTable() {
        const me = Number(this.getCurrentPlayerId());
        const ids = Object.keys(this.board.tableSlots).map(Number);
        if (!ids.includes(me)) {
            return ids.sort((a, b) => a - b);
        }

        // Seat order by player id, rotated so current viewer is first (bottom)
        const sorted = [...ids].sort((a, b) => a - b);
        const myIndex = sorted.indexOf(me);
        return [...sorted.slice(myIndex), ...sorted.slice(0, myIndex)];
    }

    renderPlayers() {
        const arena = document.getElementById('scoop-arena');
        if (!arena) {
            return;
        }

        arena.querySelectorAll('.scoop-player-zone').forEach(el => el.remove());

        const me = Number(this.getCurrentPlayerId());
        const playerIds = this.orderedPlayerIdsAroundTable();
        const count = playerIds.length;
        const rect = arena.getBoundingClientRect();
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        const radiusX = Math.min(rect.width * 0.38, 280);
        const radiusY = Math.min(rect.height * 0.36, 180);

        playerIds.forEach((playerId, index) => {
            const player = this.board.players[playerId] || this.board.players[String(playerId)];
            if (!player) {
                return;
            }
            const isMe = Number(playerId) === me;
            const slots = this.board.tableSlots[playerId] || this.board.tableSlots[String(playerId)] || [];
            const handCount = Number(this.board.handCounts[playerId] ?? this.board.handCounts[String(playerId)] ?? 0);
            const tableCount = slots.filter(s => s.hasDown || s.up).length;

            // i=0 at bottom; then clockwise
            const angle = (2 * Math.PI * index) / count;
            const x = cx + radiusX * Math.sin(angle);
            const y = cy + radiusY * Math.cos(angle);

            const zone = document.createElement('div');
            zone.className = 'scoop-player-zone' + (isMe ? ' scoop-player-me' : '');
            zone.id = `scoop-player-${playerId}`;
            zone.style.left = `${x}px`;
            zone.style.top = `${y}px`;

            zone.innerHTML = `
                <div class="scoop-player-name" style="color:#${player.color}">${player.name}${isMe ? ' (' + _('you') + ')' : ''}</div>
                <div class="scoop-player-meta">${_('Hand')}: ${handCount} · ${_('Table')}: ${tableCount}</div>
                <div class="scoop-slots"></div>
            `;

            const slotsEl = zone.querySelector('.scoop-slots');
            slots.forEach(slot => {
                const slotEl = document.createElement('div');
                slotEl.className = 'scoop-slot';
                slotEl.dataset.slot = String(slot.slot);

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

            arena.appendChild(zone);
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
            const zone = document.querySelector('.scoop-player-me');
            if (zone) {
                const slotEl = zone.querySelector(`.scoop-slot[data-slot="${this.playerTurn.selectedBlindSlot}"]`);
                const back = slotEl?.querySelector('.scoop-blind-target');
                if (back) {
                    back.classList.add('scoop-blind-selected');
                }
            }
        }
    }

    removeCardsFromPlayer(cardIds, playerId) {
        const ids = cardIds.map(Number);
        if (Number(playerId) === Number(this.getCurrentPlayerId())) {
            this.board.myHand = this.board.myHand.filter(c => !ids.includes(Number(c.id)));
        }

        const slots = this.board.tableSlots[playerId] || this.board.tableSlots[String(playerId)];
        if (slots) {
            slots.forEach(slot => {
                if (slot.up && ids.includes(Number(slot.up.id))) {
                    slot.up = null;
                }
            });
        }
    }

    setupNotifications() {
        this.bga.notifications.setupPromiseNotifications();
    }

    async notif_roundStarted(args) {
        this.board.round = Number(args.round);
        this.board.inFinalTurns = !!args.inFinalTurns;
        this.board.middle = args.middle || [];
        const handCounts = {};
        Object.entries(args.handCounts || {}).forEach(([id, count]) => {
            handCounts[id] = Number(count);
        });
        this.board.handCounts = handCounts;
        this.board.tableSlots = JSON.parse(JSON.stringify(args.tableSlots || {}));
        this.renderBoard();
    }

    async notif_handUpdated(args) {
        this.board.myHand = [...args.cards];
        const me = this.getCurrentPlayerId();
        if (me) {
            this.board.handCounts[me] = args.cards.length;
            this.board.handCounts[String(me)] = args.cards.length;
        }
        this.renderHand();
        this.updateSelectionUi();
    }

    async notif_cardsPlayed(args) {
        const playerId = args.player_id;
        const cardIds = args.card_ids;
        this.removeCardsFromPlayer(cardIds, playerId);
        args.cards.forEach(card => this.board.middle.push(card));
        this.recountHand(playerId);
        this.renderBoard();
    }

    async notif_blindPlayed(args) {
        const playerId = args.player_id;
        const cardIds = args.cards.map(c => c.id);

        if (Number(playerId) === Number(this.getCurrentPlayerId())) {
            this.board.myHand = this.board.myHand.filter(c => !cardIds.map(Number).includes(Number(c.id)));
        }

        const slots = this.board.tableSlots[playerId] || this.board.tableSlots[String(playerId)];
        if (slots) {
            const slot = slots.find(s => Number(s.slot) === Number(args.slot));
            if (slot) {
                slot.hasDown = false;
                slot.up = null;
            }
            args.cards.slice(1).forEach(card => {
                const upSlot = slots.find(s => s.up && Number(s.up.id) === Number(card.id));
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
        const count = Number(args.card_count);
        this.board.middle = [];
        const key = this.board.handCounts[playerId] !== undefined ? playerId : String(playerId);
        this.board.handCounts[key] = Number(this.board.handCounts[key] || 0) + count;
        this.renderBoard();
    }

    async notif_playerWentOut(args) {
        this.board.inFinalTurns = true;
        this.renderBoard();
    }

    async notif_roundEnded(args) {
        this.board.round = Number(args.round);
        Object.entries(args.players).forEach(([id, player]) => {
            if (this.board.players[id]) {
                this.board.players[id].score = player.score;
            }
        });
        this.updateScores();
    }

    recountHand(playerId) {
        if (Number(playerId) === Number(this.getCurrentPlayerId())) {
            this.board.handCounts[playerId] = this.board.myHand.length;
            this.board.handCounts[String(playerId)] = this.board.myHand.length;
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
