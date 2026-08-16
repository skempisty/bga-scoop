/**
 * Scoop — BGA client UI
 */

const SUIT_SYMBOLS = ['♠', '♥', '♦', '♣'];
const SUIT_CODES = ['S', 'H', 'D', 'C'];
const RANK_ORDER = ['10', 'K', 'Q', 'J', '9', '8', '7', '6', '5', '4', '3', '2', 'A'];
const RANK_POINTS = {
    A: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, J: 10, Q: 10, K: 10, 10: 20,
};
const PILE_PEEK = 22;
const PILE_ROW_GAP = 8;

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
        this.game.clearFlipAnnounce();
        this.game.renderBoard();
        this.game.updateSelectionUi();

        if (args.inFinalTurns) {
            this.bga.statusBar.setTitle(isCurrentPlayerActive
                ? _('${you} — final turns')
                : _('${actplayer} — final turns'));
        } else if (isCurrentPlayerActive) {
            this.bga.statusBar.setTitle(_('${you} must play cards or pick up the pile'));
        } else {
            this.bga.statusBar.setTitle(_('${actplayer} is playing'));
        }

        this.bga.statusBar.removeActionButtons();
        if (isCurrentPlayerActive) {
            this.bga.statusBar.addActionButton(_('Play selected'), () => this.onPlaySelected(), {
                color: 'primary',
                id: 'scoop-btn-play',
                disabled: true,
            });
            this.bga.statusBar.addActionButton(_('Pick up pile'), () => this.onPickUp(), {
                color: 'secondary',
                disabled: !args.canPickUp,
            });
            this.bga.statusBar.addActionButton(_('Clear'), () => this.clearSelection(), { color: 'secondary' });
            this.updateActionButtons(args);
        }
    }

    onLeavingState() {
        this.isActive = false;
        this.selectedCardIds.clear();
        this.selectedBlindSlot = null;
        this.bga.statusBar.removeActionButtons();
    }

    updateActionButtons(args) {
        const hasPlay = this.selectedBlindSlot !== null || this.selectedCardIds.size > 0;
        const playBtn = document.getElementById('scoop-btn-play');
        if (playBtn) {
            playBtn.disabled = !this.isActive || !hasPlay;
        }

        if (!this.isActive) {
            return;
        }

        if (this.selectedBlindSlot !== null) {
            this.bga.statusBar.setTitle(
                _('${you} selected a face-down card — Play to reveal it')
            );
        } else if (this.selectedCardIds.size > 0) {
            this.bga.statusBar.setTitle(_('${you} — play the selected cards, or pick up'));
        } else if (args?.inFinalTurns) {
            this.bga.statusBar.setTitle(_('${you} — final turns'));
        } else {
            this.bga.statusBar.setTitle(_('${you} must play cards or pick up the pile'));
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

        const playableIds = this.args?.playableCardIds;
        if (playableIds && !playableIds.map(Number).includes(Number(cardId))) {
            return;
        }

        // Face-down selection is exclusive — matching extras come after reveal.
        if (this.selectedBlindSlot !== null) {
            this.selectedBlindSlot = null;
        }

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
            // Reveal first; matching extras are offered after the card is shown
            this.selectedBlindSlot = slot;
            this.selectedCardIds.clear();
        }

        this.game.updateSelectionUi();
        if (this.args) {
            this.updateActionButtons(this.args);
        }
    }

    onPlaySelected() {
        if (this.selectedBlindSlot !== null) {
            this.bga.actions.performAction('actPlayBlind', {
                slot: this.selectedBlindSlot,
            });
            return;
        }

        const cardIds = [...this.selectedCardIds];
        if (cardIds.length === 0) {
            return;
        }
        this.bga.actions.performAction('actPlayCards', { card_ids: cardIds });
    }

    onPickUp() {
        this.bga.actions.performAction('actPickUp', {});
    }
}

class AddMatching {
    constructor(game, bga) {
        this.game = game;
        this.bga = bga;
        this.selectedCardIds = new Set();
        this.isActive = false;
    }

    onEnteringState(args, isCurrentPlayerActive) {
        this.selectedCardIds.clear();
        this.isActive = !!isCurrentPlayerActive;
        this.args = args;
        this.game.renderBoard();
        this.game.updateSelectionUi();

        const rank = args.revealedRank || '?';
        if (isCurrentPlayerActive) {
            this.bga.statusBar.setTitle(
                _('${you} revealed ${rank} — add matching cards or continue')
                    .replace('${rank}', rank)
            );
        } else {
            this.bga.statusBar.setTitle(
                _('${actplayer} may add matching ${rank}s')
                    .replace('${rank}', rank)
            );
        }

        this.bga.statusBar.removeActionButtons();
        if (isCurrentPlayerActive) {
            this.bga.statusBar.addActionButton(_('Add selected'), () => this.onAddSelected(), {
                color: 'primary',
                id: 'scoop-btn-add-matching',
                disabled: true,
            });
            this.bga.statusBar.addActionButton(_('Continue'), () => this.onDone(), {
                color: 'secondary',
            });
            this.bga.statusBar.addActionButton(_('Clear'), () => this.clearSelection(), {
                color: 'secondary',
            });
            this.updateActionButtons();
        }
    }

    onLeavingState() {
        this.isActive = false;
        this.selectedCardIds.clear();
        this.bga.statusBar.removeActionButtons();
    }

    updateActionButtons() {
        const addBtn = document.getElementById('scoop-btn-add-matching');
        if (addBtn) {
            addBtn.disabled = !this.isActive || this.selectedCardIds.size === 0;
        }

        if (!this.isActive || !this.args) {
            return;
        }

        const rank = this.args.revealedRank || '?';
        if (this.selectedCardIds.size > 0) {
            this.bga.statusBar.setTitle(
                _('${you} — add the selected ${rank}s, or Continue without adding')
                    .replace('${rank}', rank)
            );
        } else {
            this.bga.statusBar.setTitle(
                _('${you} revealed ${rank} — add matching cards or continue')
                    .replace('${rank}', rank)
            );
        }
    }

    clearSelection() {
        this.selectedCardIds.clear();
        this.game.updateSelectionUi();
        this.updateActionButtons();
    }

    onCardClick(cardId, source) {
        if (!this.isActive) {
            return;
        }
        if (source !== 'hand' && source !== 'table_up') {
            return;
        }

        const allowed = this.args?.matchableCardIds || [];
        if (!allowed.map(Number).includes(Number(cardId))) {
            return;
        }

        const maxAdd = Number(this.args?.maxAdd || 0);
        if (this.selectedCardIds.has(cardId)) {
            this.selectedCardIds.delete(cardId);
        } else if (this.selectedCardIds.size < maxAdd) {
            this.selectedCardIds.add(cardId);
        }

        this.game.updateSelectionUi();
        this.updateActionButtons();
    }

    onAddSelected() {
        const cardIds = [...this.selectedCardIds];
        if (cardIds.length === 0) {
            return;
        }
        this.bga.actions.performAction('actAddMatching', { card_ids: cardIds });
    }

    onDone() {
        this.bga.actions.performAction('actDoneMatching', {});
    }
}

class RoundEndConfirm {
    constructor(game, bga) {
        this.game = game;
        this.bga = bga;
        this.isActive = false;
    }

    onEnteringState(args, isCurrentPlayerActive) {
        this.args = args;
        this.game.roundEndArgs = args;
        this.game.roundEndReadyIds = new Set((args?.readyPlayerIds || []).map(Number));
        this.game.showRoundEndOverlay(args);
        this.onPlayerActivationChange(args, isCurrentPlayerActive);
    }

    onLeavingState() {
        this.isActive = false;
        this.bga.statusBar.removeActionButtons();
        this.game.hideRoundEndOverlay();
    }

    onPlayerActivationChange(args, isCurrentPlayerActive) {
        const spectator = this.game.isSpectator();
        this.isActive = !!isCurrentPlayerActive && !spectator;
        this.args = args || this.args;
        this.bga.statusBar.removeActionButtons();

        const gameOver = !!this.args?.gameOver;
        if (spectator) {
            this.bga.statusBar.setTitle(
                gameOver
                    ? _('Players are reviewing remaining cards')
                    : _('Players must ready up for the next round')
            );
        } else if (this.isActive) {
            this.bga.statusBar.setTitle(
                gameOver
                    ? _('${you} — review remaining cards, then continue')
                    : _('${you} — review remaining cards, then ready up')
            );
            this.bga.statusBar.addActionButton(
                gameOver ? _('Continue') : _('Ready'),
                () => this.onReady(),
                { color: 'primary', id: 'scoop-btn-ready' }
            );
        } else {
            this.bga.statusBar.setTitle(
                gameOver
                    ? _('Waiting for other players to continue')
                    : _('Waiting for other players to ready up')
            );
        }

        this.game.setRoundEndCanReady(this.isActive);
    }

    onReady() {
        if (!this.isActive) {
            return;
        }
        this.isActive = false;
        this.game.setRoundEndCanReady(false);
        this.bga.actions.performAction('actReady', {}).catch(() => {
            this.isActive = true;
            this.game.setRoundEndCanReady(true);
        });
    }
}

export class Game {
    constructor(bga) {
        this.bga = bga;
        this.playerTurn = new PlayerTurn(this, bga);
        this.addMatching = new AddMatching(this, bga);
        this.roundEndConfirm = new RoundEndConfirm(this, bga);
        this.bga.states.register('PlayerTurn', this.playerTurn);
        this.bga.states.register('AddMatching', this.addMatching);
        this.bga.states.register('RoundEndConfirm', this.roundEndConfirm);

        this.gamedatas = null;
        this.board = null;
        this.currentPlayerId = null;
        this._flipAnnounce = null;
        this.roundEndArgs = null;
        this.roundEndReadyIds = new Set();
        this.roundEndCanReady = false;
    }

    getSelectionController() {
        if (this.addMatching?.isActive) {
            return this.addMatching;
        }
        return this.playerTurn;
    }

    getCurrentPlayerId() {
        return this.bga.gameui?.player_id ?? this.bga.player_id ?? this.currentPlayerId;
    }

    isSpectator() {
        return !!(this.bga.players?.isCurrentPlayerSpectator?.() || this.bga.gameui?.isSpectator);
    }

    getActivePlayerId() {
        return this.bga.players?.getActivePlayerId?.()
            ?? this.bga.gameui?.getActivePlayerId?.()
            ?? this.gamedatas?.gamestate?.active_player
            ?? null;
    }

    onPlayableCardClick(cardId, source) {
        this.getSelectionController().onCardClick(cardId, source);
    }

    onBlindSlotClick(slot) {
        if (this.addMatching?.isActive) {
            return;
        }
        this.playerTurn.onBlindSlotClick(slot);
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
                        <div id="scoop-middle-top" class="scoop-middle-top-empty" aria-live="polite"></div>
                    </div>
                    <div id="scoop-banner-overlay" class="scoop-banner-hidden" aria-hidden="true"></div>
                </div>
                <div id="scoop-hand-zone">
                    <div id="scoop-hand-header">
                        <div id="scoop-hand-label">${_('Your hand')}</div>
                        <div id="scoop-hand-score" aria-live="polite"></div>
                    </div>
                    <div id="scoop-hand"></div>
                </div>
                <div id="scoop-round-end-overlay" class="scoop-round-end-hidden" aria-hidden="true"></div>
            </div>
        `);

        this.renderBoard();
        this.observeArenaResize();
        this.setupNotifications();
    }

    observeArenaResize() {
        const arena = document.getElementById('scoop-arena');
        if (!arena || typeof ResizeObserver === 'undefined') {
            return;
        }
        this._arenaResizeObserver = new ResizeObserver(() => {
            if (this._renderingMiddle || this._pileResizeRaf) {
                return;
            }
            this._pileResizeRaf = requestAnimationFrame(() => {
                this._pileResizeRaf = null;
                this.renderMiddle();
            });
        });
        this._arenaResizeObserver.observe(arena);
    }

    cloneBoardFromGamedatas(gamedatas) {
        const handCounts = {};
        Object.entries(gamedatas.handCounts || {}).forEach(([id, count]) => {
            handCounts[id] = Number(count);
        });
        const cardCounts = {};
        Object.entries(gamedatas.cardCounts || {}).forEach(([id, count]) => {
            cardCounts[id] = Number(count);
        });

        return {
            round: Number(gamedatas.round),
            numRounds: Number(gamedatas.numRounds),
            inFinalTurns: !!gamedatas.inFinalTurns,
            middle: [...(gamedatas.middle || [])],
            middleCount: Number(gamedatas.middleCount || 0),
            myHand: [...(gamedatas.myHand || [])],
            handCounts,
            cardCounts,
            tableSlots: JSON.parse(JSON.stringify(gamedatas.tableSlots || {})),
            players: { ...gamedatas.players },
            playerorder: (gamedatas.playerorder || []).map(Number),
        };
    }

    applyCountSnapshots(args) {
        if (args.handCounts) {
            const handCounts = {};
            Object.entries(args.handCounts).forEach(([id, count]) => {
                handCounts[id] = Number(count);
            });
            this.board.handCounts = handCounts;
        }
        if (args.cardCounts) {
            const cardCounts = {};
            Object.entries(args.cardCounts).forEach(([id, count]) => {
                cardCounts[id] = Number(count);
            });
            this.board.cardCounts = cardCounts;
        }
        if (args.tableSlots) {
            this.board.tableSlots = JSON.parse(JSON.stringify(args.tableSlots));
        }
    }

    countTableCards(slots) {
        return (slots || []).reduce((n, slot) => n + (slot.hasDown ? 1 : 0) + (slot.up ? 1 : 0), 0);
    }

    getPlayerTotalCards(playerId) {
        if (this.board.cardCounts) {
            const direct = this.board.cardCounts[playerId] ?? this.board.cardCounts[String(playerId)];
            if (direct !== undefined) {
                return Number(direct);
            }
        }
        const handCount = Number(this.board.handCounts[playerId] ?? this.board.handCounts[String(playerId)] ?? 0);
        const slots = this.board.tableSlots[playerId] || this.board.tableSlots[String(playerId)] || [];
        return handCount + this.countTableCards(slots);
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

        this.renderPlayers();
        this.renderMiddle();
        this.renderHand();
        this.updateHandScore();
        this.updateSelectionUi();
    }

    getMiddleTopGroup() {
        const middle = this.board?.middle || [];
        if (middle.length === 0) {
            return { rank: null, count: 0 };
        }

        const rank = String(middle[middle.length - 1].type);
        let count = 0;
        for (let i = middle.length - 1; i >= 0; i--) {
            if (String(middle[i].type) !== rank) {
                break;
            }
            count++;
        }
        return { rank, count };
    }

    rankDisplayName(rank, plural) {
        const singular = {
            A: _('Ace'),
            2: _('Two'),
            3: _('Three'),
            4: _('Four'),
            5: _('Five'),
            6: _('Six'),
            7: _('Seven'),
            8: _('Eight'),
            9: _('Nine'),
            10: _('Ten'),
            J: _('Jack'),
            Q: _('Queen'),
            K: _('King'),
        };
        const plurals = {
            A: _('Aces'),
            2: _('Twos'),
            3: _('Threes'),
            4: _('Fours'),
            5: _('Fives'),
            6: _('Sixes'),
            7: _('Sevens'),
            8: _('Eights'),
            9: _('Nines'),
            10: _('Tens'),
            J: _('Jacks'),
            Q: _('Queens'),
            K: _('Kings'),
        };
        const names = plural ? plurals : singular;
        return names[rank] || String(rank);
    }

    renderMiddleTopLabel() {
        const el = document.getElementById('scoop-middle-top');
        if (!el) {
            return;
        }

        if (this._flipAnnounce?.rank) {
            const rankName = this.rankDisplayName(this._flipAnnounce.rank, false);
            const usesAn = this._flipAnnounce.rank === 'A' || this._flipAnnounce.rank === '8';
            const template = usesAn
                ? _('Flipped an ${rank}')
                : _('Flipped a ${rank}');
            const label = template.replace('${rank}', rankName);
            if (el.classList.contains('scoop-middle-top-flip') && el.getAttribute('aria-label') === label) {
                return;
            }
            el.classList.remove('scoop-middle-top-empty');
            el.classList.add('scoop-middle-top-flip');
            el.innerHTML = `<span class="scoop-flip-announce${this._flipAnnounce.animate ? ' scoop-flip-announce-in' : ''}">${template
                .replace('${rank}', `<span class="scoop-middle-top-rank">${rankName}</span>`)}</span>`;
            el.setAttribute('aria-label', label);
            return;
        }

        el.classList.remove('scoop-middle-top-flip');

        const { rank, count } = this.getMiddleTopGroup();
        if (!rank || count < 1) {
            el.innerHTML = '';
            el.classList.add('scoop-middle-top-empty');
            el.removeAttribute('aria-label');
            return;
        }

        const rankName = this.rankDisplayName(rank, count !== 1);
        el.classList.remove('scoop-middle-top-empty');
        el.innerHTML = _('${count} ${rank}')
            .replace('${count}', `<span class="scoop-middle-top-count">${count}</span>`)
            .replace('${rank}', `<span class="scoop-middle-top-rank">${rankName}</span>`);
        el.setAttribute('aria-label', `${count} ${rankName}`);
    }

    pileMatchesBoard(pile) {
        const existing = [...pile.querySelectorAll('.scoop-card')].map(el => String(el.dataset.cardId));
        const next = (this.board.middle || []).map(card => String(card.id));
        return existing.length === next.length && existing.every((id, i) => id === next[i]);
    }

    layoutPile(pile) {
        const cardEl = pile.querySelector('.scoop-card');
        const cardWidth = cardEl?.offsetWidth || 72;
        const cardHeight = cardEl?.offsetHeight || 100;
        const zone = document.getElementById('scoop-middle-zone');
        const available = Math.max(zone?.clientWidth || 0, cardWidth);
        const n = this.board.middle.length;
        const cardsPerRow = Math.max(1, 1 + Math.floor((available - cardWidth) / PILE_PEEK));
        const rows = Math.ceil(n / cardsPerRow);
        const cols = Math.min(n, cardsPerRow);

        [...pile.children].forEach((el, index) => {
            const row = Math.floor(index / cardsPerRow);
            const col = index % cardsPerRow;
            el.style.left = `${col * PILE_PEEK}px`;
            el.style.top = `${row * (cardHeight + PILE_ROW_GAP)}px`;
            el.style.zIndex = String(index + 1);
        });

        pile.style.width = `${cardWidth + Math.max(0, cols - 1) * PILE_PEEK}px`;
        pile.style.height = `${rows * cardHeight + Math.max(0, rows - 1) * PILE_ROW_GAP}px`;
    }

    renderMiddle() {
        if (!this.board || this._renderingMiddle) {
            return;
        }
        const pile = document.getElementById('scoop-middle-pile');
        if (!pile) {
            return;
        }

        this._renderingMiddle = true;
        try {
            if (this.board.middle.length === 0) {
                pile.style.width = '72px';
                pile.style.height = '100px';
                pile.innerHTML = `<div class="scoop-empty-pile">${_('Empty')}</div>`;
                this.renderMiddleTopLabel();
                return;
            }

            if (!this.pileMatchesBoard(pile)) {
                pile.innerHTML = '';
                this.board.middle.forEach((card, index) => {
                    const el = this.createCardElement(card, 'middle');
                    el.classList.add('scoop-pile-card');
                    el.style.zIndex = String(index + 1);
                    if (this._flipAnnounce && Number(card.id) === Number(this._flipAnnounce.cardId)) {
                        el.classList.add('scoop-card-just-flipped');
                        if (this._flipAnnounce.animate) {
                            el.classList.add('scoop-card-just-flipped-in');
                        }
                    }
                    pile.appendChild(el);
                });
            }

            this.layoutPile(pile);
            this.renderMiddleTopLabel();
        } finally {
            this._renderingMiddle = false;
        }
    }

    orderedPlayerIdsAroundTable() {
        const me = Number(this.getCurrentPlayerId());
        const slotIds = Object.keys(this.board.tableSlots).map(Number);

        const fromOrder = (this.board.playerorder || this.gamedatas?.playerorder || [])
            .map(Number)
            .filter(id => slotIds.includes(id));

        let ids;
        if (fromOrder.length === slotIds.length && fromOrder.length > 0) {
            ids = fromOrder;
        } else {
            ids = [...slotIds].sort((a, b) => {
                const pa = this.board.players[a] || this.board.players[String(a)] || {};
                const pb = this.board.players[b] || this.board.players[String(b)] || {};
                return Number(pa.player_no ?? a) - Number(pb.player_no ?? b);
            });
        }

        const myIndex = ids.indexOf(me);
        if (myIndex <= 0) {
            return ids;
        }
        return [...ids.slice(myIndex), ...ids.slice(0, myIndex)];
    }

    playerSeatNames(count) {
        const layouts = {
            1: ['bottom'],
            2: ['bottom', 'top'],
            3: ['bottom', 'tl', 'tr'],
            4: ['bottom', 'left', 'top', 'right'],
            5: ['bottom', 'left', 'tl', 'tr', 'right'],
            6: ['bottom', 'left', 'tl', 'top', 'tr', 'right'],
        };
        return layouts[count] || layouts[6];
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
        const seats = this.playerSeatNames(count);
        arena.dataset.playerCount = String(count);

        playerIds.forEach((playerId, index) => {
            const player = this.board.players[playerId] || this.board.players[String(playerId)];
            if (!player) {
                return;
            }
            const isMe = Number(playerId) === me;
            const isActive = Number(playerId) === Number(this.getActivePlayerId());
            const slots = this.board.tableSlots[playerId] || this.board.tableSlots[String(playerId)] || [];
            const totalCards = this.getPlayerTotalCards(playerId);
            const seat = seats[index] || 'bottom';

            const zone = document.createElement('div');
            zone.className = `scoop-player-zone scoop-seat-${seat}`
                + (isMe ? ' scoop-player-me' : '')
                + (isActive ? ' scoop-player-active' : '');
            zone.id = `scoop-player-${playerId}`;
            zone.dataset.seat = seat;
            if (isActive) {
                zone.setAttribute('aria-current', 'true');
            }

            zone.innerHTML = `
                <div class="scoop-player-panel">
                    <div class="scoop-player-name" style="color:#${player.color}">${player.name}${isMe ? ' (' + _('you') + ')' : ''}</div>
                    <div class="scoop-player-meta">${_('Cards')}: ${totalCards}</div>
                    <div class="scoop-slots"></div>
                </div>
            `;

            const slotsEl = zone.querySelector('.scoop-slots');
            slots.forEach(slot => {
                const slotEl = document.createElement('div');
                slotEl.className = 'scoop-slot';
                slotEl.dataset.slot = String(slot.slot);

                if (slot.up) {
                    const cardEl = this.createCardElement(slot.up, 'table_up');
                    if (isMe) {
                        cardEl.addEventListener('click', () => this.onPlayableCardClick(slot.up.id, 'table_up'));
                    }
                    slotEl.appendChild(cardEl);
                } else if (slot.hasDown) {
                    const back = this.createCardBackElement();
                    back.classList.add('scoop-blind-target');
                    if (isMe) {
                        back.addEventListener('click', () => this.onBlindSlotClick(slot.slot));
                    }
                    slotEl.appendChild(back);
                } else {
                    slotEl.classList.add('scoop-slot-empty');
                }

                slotsEl.appendChild(slotEl);
            });

            arena.appendChild(zone);
        });

        this.updateHandTurnHighlight();
    }

    updateHandTurnHighlight() {
        const hand = document.getElementById('scoop-hand');
        if (!hand) {
            return;
        }
        const me = Number(this.getCurrentPlayerId());
        const active = Number(this.getActivePlayerId());
        hand.classList.toggle('scoop-hand-active', !!active && me === active);
    }

    renderHand() {
        const hand = document.getElementById('scoop-hand');
        if (!hand) {
            return;
        }
        this.updateHandTurnHighlight();
        hand.innerHTML = '';

        const sorted = this.sortHand(this.board.myHand);
        sorted.forEach(card => {
            const el = this.createCardElement(card, 'hand');
            el.addEventListener('click', () => this.onPlayableCardClick(card.id, 'hand'));
            hand.appendChild(el);
        });

        this.updateHandScore();
    }

    cardPoints(card) {
        if (!card) {
            return 0;
        }
        if (card.points != null && card.points !== '') {
            return Number(card.points);
        }
        return RANK_POINTS[card.type] ?? 0;
    }

    myTableSlots() {
        const me = this.getCurrentPlayerId();
        return this.board?.tableSlots?.[me] || this.board?.tableSlots?.[String(me)] || [];
    }

    updateHandScore() {
        const el = document.getElementById('scoop-hand-score');
        if (!el || !this.board) {
            return;
        }

        const slots = this.myTableSlots();
        let visible = 0;
        (this.board.myHand || []).forEach(card => {
            visible += this.cardPoints(card);
        });
        slots.forEach(slot => {
            if (slot.up) {
                visible += this.cardPoints(slot.up);
            }
        });
        const hasHidden = slots.some(slot => slot.hasDown);

        el.textContent = hasHidden
            ? _('Hand Score: ${points} + ?').replace('${points}', String(visible))
            : _('Hand Score: ${points}').replace('${points}', String(visible));
    }

    createCardElement(card, location) {
        const el = document.createElement('div');
        el.className = 'scoop-card scoop-card-face';
        el.dataset.cardId = card.id;
        el.dataset.location = location;
        el.dataset.rank = card.type;

        const suitIndex = card.suitIndex ?? 0;
        const suitCode = SUIT_CODES[suitIndex] || 'S';
        const rank = String(card.type);
        const themeUrl = (typeof g_gamethemeurl !== 'undefined' ? g_gamethemeurl : '');
        const artUrl = `${themeUrl}img/card-${suitCode}-${rank}.png`;

        el.classList.add(`scoop-suit-${suitIndex}`);
        el.style.backgroundImage = `url('${artUrl}')`;
        el.setAttribute('title', `${rank}${SUIT_SYMBOLS[suitIndex] || ''}`);
        el.setAttribute('aria-label', `${rank}${SUIT_SYMBOLS[suitIndex] || ''}`);

        return el;
    }

    createCardBackElement() {
        const el = document.createElement('div');
        el.className = 'scoop-card scoop-card-back';
        return el;
    }

    appendCardPoints(el, card) {
        const pts = this.cardPoints(card);
        const badge = document.createElement('span');
        badge.className = 'scoop-card-points';
        badge.textContent = `+${pts}`;
        el.appendChild(badge);
        return el;
    }

    roundEndPlayerEntry(playerId, args = this.roundEndArgs) {
        if (!args?.playerCards) {
            return null;
        }
        return args.playerCards[playerId] || args.playerCards[String(playerId)] || null;
    }

    roundEndPlayerIds() {
        const args = this.roundEndArgs;
        if (!args?.playerCards) {
            return [];
        }
        const me = Number(this.getCurrentPlayerId());
        const ids = this.orderedPlayerIdsAroundTable().filter(id => this.roundEndPlayerEntry(id, args));
        const extra = Object.keys(args.playerCards).map(Number).filter(id => !ids.includes(id));
        const all = [...ids, ...extra];
        if (this.isSpectator() || !all.includes(me)) {
            return all;
        }
        return [me, ...all.filter(id => id !== me)];
    }

    showRoundEndOverlay(args) {
        if (!args?.playerCards) {
            return;
        }
        this.roundEndArgs = args;
        const overlay = document.getElementById('scoop-round-end-overlay');
        if (!overlay) {
            return;
        }

        const alreadyOpen = !overlay.classList.contains('scoop-round-end-hidden');
        overlay.classList.remove('scoop-round-end-hidden');
        overlay.setAttribute('aria-hidden', 'false');

        if (!alreadyOpen || !overlay.querySelector('.scoop-round-end-panel')) {
            this.buildRoundEndOverlay();
        } else {
            this.updateRoundEndOverlayMeta();
        }
    }

    hideRoundEndOverlay() {
        const overlay = document.getElementById('scoop-round-end-overlay');
        if (overlay) {
            overlay.classList.add('scoop-round-end-hidden');
            overlay.setAttribute('aria-hidden', 'true');
            overlay.innerHTML = '';
        }
        this.roundEndArgs = null;
        this.roundEndReadyIds = new Set();
        this.roundEndCanReady = false;
    }

    setRoundEndCanReady(canReady) {
        this.roundEndCanReady = !!canReady;
        this.updateRoundEndOverlayMeta();
    }

    markRoundEndReady(playerId) {
        this.roundEndReadyIds = this.roundEndReadyIds || new Set();
        this.roundEndReadyIds.add(Number(playerId));
        this.updateRoundEndOverlayMeta();
    }

    buildRoundEndOverlay() {
        const overlay = document.getElementById('scoop-round-end-overlay');
        const args = this.roundEndArgs;
        if (!overlay || !args) {
            return;
        }

        overlay.innerHTML = '';

        const backdrop = document.createElement('div');
        backdrop.className = 'scoop-round-end-backdrop';
        overlay.appendChild(backdrop);

        const panel = document.createElement('div');
        panel.className = 'scoop-round-end-panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-labelledby', 'scoop-round-end-title');

        const kicker = document.createElement('div');
        kicker.className = 'scoop-round-end-kicker';
        kicker.id = 'scoop-round-end-title';
        const kickerText = args.gameOver ? _('GAME OVER') : _('ROUND OVER');
        kickerText.split('').forEach((letter, i) => {
            const span = document.createElement('span');
            span.textContent = letter === ' ' ? '\u00a0' : letter;
            span.style.animationDelay = `${i * 40}ms`;
            kicker.appendChild(span);
        });
        panel.appendChild(kicker);

        const sub = document.createElement('div');
        sub.className = 'scoop-round-end-sub';
        sub.textContent = _('Round ${round} of ${total}')
            .replace('${round}', String(args.round))
            .replace('${total}', String(args.numRounds));
        panel.appendChild(sub);

        const playerIds = this.roundEndPlayerIds();
        const me = Number(this.getCurrentPlayerId());
        const spectator = this.isSpectator();
        const heroId = spectator ? null : playerIds.find(id => id === me) ?? null;

        if (heroId != null) {
            panel.appendChild(this.buildRoundEndHero(heroId, args));
        }

        const rivals = playerIds.filter(id => id !== heroId);
        if (rivals.length > 0) {
            const list = document.createElement('div');
            list.className = spectator
                ? 'scoop-round-end-rivals scoop-round-end-rivals-grid'
                : 'scoop-round-end-rivals';
            rivals.forEach(playerId => {
                list.appendChild(this.buildRoundEndRival(playerId, args, { compact: true }));
            });
            panel.appendChild(list);
        }

        const actions = document.createElement('div');
        actions.className = 'scoop-round-end-actions';
        actions.id = 'scoop-round-end-actions';
        panel.appendChild(actions);

        overlay.appendChild(panel);
        this.updateRoundEndOverlayMeta();
    }

    buildRoundEndHero(playerId, args) {
        const entry = this.roundEndPlayerEntry(playerId, args);
        const wrap = document.createElement('div');
        wrap.className = 'scoop-round-end-hero';

        const head = document.createElement('div');
        head.className = 'scoop-round-end-hero-head';

        const name = document.createElement('div');
        name.className = 'scoop-round-end-hero-name';
        name.textContent = entry?.wentOut
            ? _('You went out — no penalty')
            : _('Your remaining cards');
        head.appendChild(name);

        const points = document.createElement('div');
        points.className = 'scoop-round-end-hero-points';
        points.textContent = `+${entry?.points ?? 0}`;
        head.appendChild(points);

        const stamp = document.createElement('div');
        stamp.className = 'scoop-round-end-stamp';
        stamp.dataset.readyStamp = String(playerId);
        head.appendChild(stamp);
        wrap.appendChild(head);

        const groups = document.createElement('div');
        groups.className = 'scoop-round-end-groups';
        const cardCount = this.appendRoundEndCardGroups(groups, entry, { size: 'hero' });
        if (cardCount === 0) {
            const empty = document.createElement('div');
            empty.className = 'scoop-round-end-clean';
            empty.textContent = _('Clean sweep');
            groups.appendChild(empty);
        }
        wrap.appendChild(groups);

        return wrap;
    }

    buildRoundEndRival(playerId, args, { compact = true } = {}) {
        const entry = this.roundEndPlayerEntry(playerId, args);
        const player = this.board?.players?.[playerId] || this.board?.players?.[String(playerId)] || {};
        const wrap = document.createElement('div');
        wrap.className = 'scoop-round-end-rival' + (compact ? '' : ' scoop-round-end-rival-full');
        wrap.dataset.playerId = String(playerId);

        const head = document.createElement('div');
        head.className = 'scoop-round-end-rival-head';

        const name = document.createElement('div');
        name.className = 'scoop-round-end-rival-name';
        if (player.color) {
            name.style.color = `#${player.color}`;
        }
        name.textContent = player.name || String(playerId);
        head.appendChild(name);

        const points = document.createElement('div');
        points.className = 'scoop-round-end-rival-points';
        points.textContent = entry?.wentOut
            ? _('Out  +0')
            : `+${entry?.points ?? 0}`;
        head.appendChild(points);

        const stamp = document.createElement('div');
        stamp.className = 'scoop-round-end-stamp';
        stamp.dataset.readyStamp = String(playerId);
        head.appendChild(stamp);
        wrap.appendChild(head);

        const groups = document.createElement('div');
        groups.className = 'scoop-round-end-groups';
        this.appendRoundEndCardGroups(groups, entry, { size: compact ? 'sm' : 'md' });
        wrap.appendChild(groups);

        return wrap;
    }

    appendRoundEndCardGroups(container, entry, { size = 'hero' } = {}) {
        if (!entry) {
            return 0;
        }
        let index = 0;
        index = this.appendRoundEndGroup(container, _('Face-down'), entry.tableDown || [], {
            revealed: true,
            size,
            startIndex: index,
            sort: false,
        });
        index = this.appendRoundEndGroup(container, _('Face-up'), entry.tableUp || [], {
            size,
            startIndex: index,
            sort: false,
        });
        index = this.appendRoundEndGroup(container, _('Hand'), entry.hand || [], {
            size,
            startIndex: index,
            sort: true,
        });
        return index;
    }

    appendRoundEndGroup(container, label, cards, { revealed = false, size = 'hero', startIndex = 0, sort = false } = {}) {
        if (!cards || cards.length === 0) {
            return startIndex;
        }
        const group = document.createElement('div');
        group.className = 'scoop-round-end-group';

        const caption = document.createElement('div');
        caption.className = 'scoop-round-end-group-label';
        caption.textContent = label;
        group.appendChild(caption);

        const row = document.createElement('div');
        row.className = 'scoop-round-end-cards' + (size === 'sm' ? ' scoop-round-end-cards-sm' : '');
        const list = sort ? this.sortHand(cards) : cards;
        list.forEach((card, i) => {
            const el = this.createCardElement(card, 'reveal');
            el.classList.add('scoop-round-end-card');
            if (size === 'sm') {
                el.classList.add('scoop-round-end-card-sm');
            }
            if (revealed) {
                el.classList.add('scoop-card-just-flipped');
            }
            el.style.animationDelay = `${(startIndex + i) * 45}ms`;
            this.appendCardPoints(el, card);
            row.appendChild(el);
        });
        group.appendChild(row);
        container.appendChild(group);
        return startIndex + list.length;
    }

    updateRoundEndOverlayMeta() {
        const overlay = document.getElementById('scoop-round-end-overlay');
        const args = this.roundEndArgs;
        if (!overlay || !args || overlay.classList.contains('scoop-round-end-hidden')) {
            return;
        }

        const readyIds = this.roundEndReadyIds || new Set();
        overlay.querySelectorAll('[data-ready-stamp]').forEach(el => {
            const id = Number(el.dataset.readyStamp);
            el.textContent = readyIds.has(id) ? _('Ready') : '';
            el.classList.toggle('scoop-round-end-stamp-on', readyIds.has(id));
        });

        const me = Number(this.getCurrentPlayerId());
        const actions = overlay.querySelector('#scoop-round-end-actions');
        if (!actions) {
            return;
        }
        actions.innerHTML = '';

        const waitingIds = this.roundEndPlayerIds().filter(id => !readyIds.has(id));
        const spectator = this.isSpectator();

        if (this.roundEndCanReady && !spectator) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'scoop-round-end-ready-btn';
            btn.id = 'scoop-round-end-ready';
            btn.textContent = args.gameOver ? _('Continue') : _('Ready');
            btn.addEventListener('click', () => this.roundEndConfirm?.onReady());
            actions.appendChild(btn);
        } else if (!spectator && readyIds.has(me)) {
            const mine = document.createElement('div');
            mine.className = 'scoop-round-end-you-ready';
            mine.textContent = _('You are ready');
            actions.appendChild(mine);
        }

        if (waitingIds.length > 0 && (readyIds.has(me) || spectator || !this.roundEndCanReady)) {
            const wait = document.createElement('div');
            wait.className = 'scoop-round-end-wait';
            const names = waitingIds.map(id => {
                const player = this.board?.players?.[id] || this.board?.players?.[String(id)] || {};
                return player.name || String(id);
            });
            wait.textContent = _('Waiting for ${players}')
                .replace('${players}', names.join(', '));
            actions.appendChild(wait);
        }
    }

    updateSelectionUi() {
        document.querySelectorAll('.scoop-card').forEach(el => {
            el.classList.remove('scoop-selected');
            el.classList.remove('scoop-dimmed');
            el.classList.remove('scoop-steel');
        });
        document.querySelectorAll('.scoop-blind-target').forEach(el => {
            el.classList.remove('scoop-blind-selected');
        });

        const controller = this.getSelectionController();
        const selected = controller?.selectedCardIds;
        if (selected) {
            selected.forEach(id => {
                const el = document.querySelector(`.scoop-card[data-card-id="${id}"]`);
                if (el) {
                    el.classList.add('scoop-selected');
                }
            });
        }

        const myFaces = document.querySelectorAll(
            '#scoop-hand .scoop-card-face, .scoop-player-me .scoop-card-face'
        );

        if (this.addMatching?.isActive && this.addMatching.args?.matchableCardIds) {
            const allowed = new Set(this.addMatching.args.matchableCardIds.map(Number));
            myFaces.forEach(el => {
                if (el.classList.contains('scoop-selected')) {
                    return;
                }
                if (!allowed.has(Number(el.dataset.cardId))) {
                    el.classList.add('scoop-steel');
                }
            });
        } else if (this.playerTurn?.isActive) {
            const playableIds = this.playerTurn.args?.playableCardIds;
            if (playableIds) {
                const playable = new Set(playableIds.map(Number));
                myFaces.forEach(el => {
                    if (el.classList.contains('scoop-selected')) {
                        return;
                    }
                    if (!playable.has(Number(el.dataset.cardId))) {
                        el.classList.add('scoop-steel');
                    }
                });
            }

            if (selected && selected.size > 0) {
                const first = this.findCard([...selected][0]);
                const rank = first ? String(first.type) : '';
                if (rank) {
                    myFaces.forEach(el => {
                        if (el.classList.contains('scoop-selected') || el.classList.contains('scoop-steel')) {
                            return;
                        }
                        if (el.dataset.rank !== rank) {
                            el.classList.add('scoop-dimmed');
                        }
                    });
                }
            }
        }

        if (this.playerTurn.selectedBlindSlot !== null && this.playerTurn.isActive) {
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

    setFlipAnnounce(card) {
        if (!card) {
            this._flipAnnounce = null;
            return;
        }
        this._flipAnnounce = {
            cardId: Number(card.id),
            rank: String(card.type),
            animate: true,
        };
    }

    markFlipAnnounceSettled() {
        if (this._flipAnnounce) {
            this._flipAnnounce.animate = false;
        }
    }

    clearFlipAnnounce() {
        this._flipAnnounce = null;
    }

    async pauseForReveal(ms = 2500) {
        const ui = this.bga?.gameui;
        if (typeof ui?.wait === 'function') {
            await ui.wait(ms);
            return;
        }
        if (typeof ui?.bgaAnimationsActive === 'function' && !ui.bgaAnimationsActive()) {
            return;
        }
        await new Promise(resolve => setTimeout(resolve, ms));
    }

    setupNotifications() {
        this.bga.notifications.setupPromiseNotifications();
    }

    async notif_roundStarted(args) {
        this.hideRoundEndOverlay();
        this.board.round = Number(args.round);
        this.board.inFinalTurns = !!args.inFinalTurns;
        this.board.middle = args.middle || [];
        this.applyCountSnapshots(args);
        this.renderBoard();
    }

    async notif_handUpdated(args) {
        this.board.myHand = [...args.cards];
        const me = this.getCurrentPlayerId();
        if (me) {
            this.board.handCounts[me] = args.cards.length;
            this.board.handCounts[String(me)] = args.cards.length;
            // Keep total in sync: hand size + current table cards
            const slots = this.board.tableSlots[me] || this.board.tableSlots[String(me)] || [];
            const total = args.cards.length + this.countTableCards(slots);
            this.board.cardCounts = this.board.cardCounts || {};
            this.board.cardCounts[me] = total;
            this.board.cardCounts[String(me)] = total;
        }
        this.renderHand();
        this.renderPlayers();
        this.updateHandScore();
        this.updateSelectionUi();
    }

    async notif_cardsPlayed(args) {
        const playerId = args.player_id;
        const cardIds = (args.card_ids || []).map(Number);
        if (Number(playerId) === Number(this.getCurrentPlayerId())) {
            this.board.myHand = this.board.myHand.filter(c => !cardIds.includes(Number(c.id)));
        }
        args.cards.forEach(card => this.board.middle.push(card));
        this.applyCountSnapshots(args);
        this.clearFlipAnnounce();
        this.renderBoard();
    }

    async notif_blindPlayed(args) {
        const playerId = args.player_id;
        const cardIds = args.cards.map(c => c.id);

        if (Number(playerId) === Number(this.getCurrentPlayerId())) {
            this.board.myHand = this.board.myHand.filter(c => !cardIds.map(Number).includes(Number(c.id)));
        }

        if (!args.tableSlots) {
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
        }

        args.cards.forEach(card => this.board.middle.push(card));
        this.applyCountSnapshots(args);
        this.setFlipAnnounce(args.cards[0]);
        this.renderBoard();
        this.markFlipAnnounceSettled();
        const mayAddMatching = args.mayAddMatching === true
            || args.mayAddMatching === 1
            || args.mayAddMatching === '1';
        if (!mayAddMatching) {
            await this.pauseForReveal(2500);
        }
    }

    async notif_scoop(args) {
        this.board.middle = [];
        this.clearFlipAnnounce();
        this.showScoopFlash();
        this.renderBoard();
    }

    async notif_pickup(args) {
        this.board.middle = [];
        this.applyCountSnapshots(args);
        this.clearFlipAnnounce();
        this.renderBoard();
    }

    async notif_playerWentOut(args) {
        this.board.inFinalTurns = true;
        this.renderBoard();
    }

    async notif_roundEnded(args) {
        this.board.round = Number(args.round);
        Object.entries(args.players || {}).forEach(([id, player]) => {
            if (this.board.players[id]) {
                this.board.players[id].score = player.score;
            }
        });
        this.roundEndReadyIds = new Set();
        if (args.playerCards) {
            this.showRoundEndOverlay({
                round: args.round,
                numRounds: args.numRounds ?? this.board.numRounds,
                gameOver: !!args.gameOver,
                wentOutPlayerId: args.wentOutPlayerId,
                playerCards: args.playerCards,
                readyPlayerIds: [],
            });
        }
    }

    async notif_roundScore(args) {
        // Log-only: round scoring breakdown appears in the game log.
    }

    async notif_playerReady(args) {
        this.markRoundEndReady(args.player_id);
    }

    showScoopFlash() {
        const overlay = document.getElementById('scoop-banner-overlay');
        if (!overlay) {
            return;
        }

        if (this._scoopFlashTimer) {
            clearTimeout(this._scoopFlashTimer);
        }

        overlay.innerHTML = `
            <div class="scoop-banner-backdrop"></div>
            <div class="scoop-banner-text" role="status">${_('SCOOP!')}</div>
        `;
        overlay.classList.remove('scoop-banner-hidden');

        // Retrigger CSS animations if scoop happens twice quickly
        const text = overlay.querySelector('.scoop-banner-text');
        const backdrop = overlay.querySelector('.scoop-banner-backdrop');
        void text.offsetWidth;
        void backdrop.offsetWidth;

        this._scoopFlashTimer = setTimeout(() => {
            overlay.classList.add('scoop-banner-hidden');
            overlay.innerHTML = '';
            this._scoopFlashTimer = null;
        }, 1100);
    }
}
