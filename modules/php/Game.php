<?php
/**
 *------
 * BGA framework: Gregory Isabelli & Emmanuel Colin & BoardGameArena
 * Scoop implementation
 * -----
 */
declare(strict_types=1);

namespace Bga\Games\Scoop;

use Bga\GameFramework\Components\Deck;
use Bga\Games\Scoop\States\RoundSetup;
use Bga\GameFramework\UserException;

class Game extends \Bga\GameFramework\Table
{
    public const OPTION_DECK_COUNT = 100;

    public Deck $cards;

    public function __construct()
    {
        parent::__construct();

        $this->initGameStateLabels([
            'round_number' => 10,
            'starter_player_id' => 11,
            'went_out_player_id' => 12,
            'in_final_turns' => 13,
        ]);

        $this->cards = $this->bga->deckFactory->createDeck('card');

        $this->bga->notify->addDecorator(function (string $message, array $args) {
            if (isset($args['player_id']) && !isset($args['player_name']) && str_contains($message, '${player_name}')) {
                $args['player_name'] = $this->getPlayerNameById($args['player_id']);
            }

            return $args;
        });
    }

    public function getGameProgression(): int
    {
        $round = (int) $this->getGameStateValue('round_number');
        $numRounds = $this->getPlayersNumber();

        if ($numRounds === 0) {
            return 0;
        }

        return (int) floor((($round - 1) / $numRounds) * 100);
    }

    public function upgradeTableDb($from_version): void
    {
    }

    protected function getAllDatas(int $currentPlayerId): array
    {
        $players = $this->getCollectionFromDb(
            "SELECT `player_id` AS `id`, `player_score` AS `score`, `player_name` AS `name`, `player_color` AS `color` FROM `player`"
        );

        $playerIds = array_map('intval', array_keys($players));
        $handCounts = [];
        $cardCounts = [];
        $tableSlots = [];

        foreach ($playerIds as $playerId) {
            $handCounts[$playerId] = $this->cards->countCardsInLocation('hand', $playerId);
            $cardCounts[$playerId] = $this->getPlayerCardCount($playerId);
            $tableSlots[$playerId] = $this->getTableSlotsForPlayer($playerId, $currentPlayerId);
        }

        $middleCards = $this->getMiddleCards();
        $topGroup = Cards::getTopGroup($middleCards);

        $result = [
            'players' => $players,
            'round' => (int) $this->getGameStateValue('round_number'),
            'numRounds' => count($players),
            'starterPlayerId' => (int) $this->getGameStateValue('starter_player_id'),
            'wentOutPlayerId' => (int) $this->getGameStateValue('went_out_player_id'),
            'inFinalTurns' => (int) $this->getGameStateValue('in_final_turns') === 1,
            'deckCount' => $this->getDeckCount(),
            'handCounts' => $handCounts,
            'cardCounts' => $cardCounts,
            'tableSlots' => $tableSlots,
            'middle' => array_map([$this, 'enrichCard'], $middleCards),
            'middleCount' => count($middleCards),
            'middleTopRank' => $topGroup['rank'],
            'middleTopCount' => $topGroup['count'],
            'myHand' => Cards::sortByRank(array_map([$this, 'enrichCard'], $this->cards->getCardsInLocation('hand', $currentPlayerId))),
        ];

        return $result;
    }

    public function getPublicCardCounts(): array
    {
        $counts = [];
        foreach (array_keys($this->loadPlayersBasicInfos()) as $playerId) {
            $counts[(int) $playerId] = $this->getPlayerCardCount((int) $playerId);
        }

        return $counts;
    }

    public function getPublicHandCounts(): array
    {
        $counts = [];
        foreach (array_keys($this->loadPlayersBasicInfos()) as $playerId) {
            $pid = (int) $playerId;
            $counts[$pid] = $this->cards->countCardsInLocation('hand', $pid);
        }

        return $counts;
    }

    public function getPublicTableSlots(): array
    {
        $slots = [];
        foreach (array_keys($this->loadPlayersBasicInfos()) as $playerId) {
            $pid = (int) $playerId;
            $slots[$pid] = $this->getTableSlotsForPlayer($pid, 0);
        }

        return $slots;
    }

    protected function setupNewGame($players, $options = [])
    {
        $gameinfos = $this->getGameinfos();
        $default_colors = $gameinfos['player_colors'];
        $query_values = [];

        foreach ($players as $player_id => $player) {
            $query_values[] = vsprintf("(%s, '%s', '%s')", [
                $player_id,
                array_shift($default_colors),
                addslashes($player['player_name']),
            ]);
        }

        static::DbQuery(
            sprintf(
                "INSERT INTO `player` (`player_id`, `player_color`, `player_name`) VALUES %s",
                implode(',', $query_values)
            )
        );

        $this->reattributeColorsBasedOnPreferences($players, $gameinfos['player_colors']);
        $this->reloadPlayersBasicInfos();

        $playerIds = array_map('intval', array_keys($players));
        $this->setGameStateValue('round_number', 1);
        $this->setGameStateValue('starter_player_id', $playerIds[0]);
        $this->setGameStateValue('went_out_player_id', 0);
        $this->setGameStateValue('in_final_turns', 0);

        $this->createSourceDecks();

        return RoundSetup::class;
    }

    public function getDeckCount(): int
    {
        return $this->bga->tableOptions->get(self::OPTION_DECK_COUNT) ?? 2;
    }

    public function sourceLocation(int $deckIndex): string
    {
        return 'source' . $deckIndex;
    }

    public function createSourceDecks(): void
    {
        $deckCount = $this->getDeckCount();

        for ($deckIndex = 0; $deckIndex < $deckCount; $deckIndex++) {
            $cardDefs = [];
            foreach (Cards::SUITS as $suitIndex => $suit) {
                foreach (Cards::RANKS as $rank) {
                    $cardDefs[] = [
                        'type' => $rank,
                        'type_arg' => Cards::encodeTypeArg($deckIndex, $suitIndex),
                        'nbr' => 1,
                    ];
                }
            }
            $this->cards->createCards($cardDefs, $this->sourceLocation($deckIndex));
        }
    }

    public function resetCardsToSource(): void
    {
        $locations = ['hand', 'table_up', 'table_down', 'middle', 'discard'];
        for ($deckIndex = 0; $deckIndex < $this->getDeckCount(); $deckIndex++) {
            $locations[] = $this->sourceLocation($deckIndex);
        }

        foreach ($locations as $location) {
            $cards = $this->cards->getCardsInLocation($location);
            foreach ($cards as $card) {
                $deckIdx = Cards::cardDeckIndex($card);
                $this->cards->moveCard((int) $card['id'], $this->sourceLocation($deckIdx));
            }
        }
    }

    public function pickFromSourceDeck(int $deckIndex, int $count, int $playerId): void
    {
        $location = $this->sourceLocation($deckIndex);
        $this->cards->pickCardsForLocation($count, $location, 'hand', $playerId);
    }

    public function setupRound(): void
    {
        $deckCount = $this->getDeckCount();
        $playerIds = array_map('intval', array_keys($this->loadPlayersBasicInfos()));

        $this->resetCardsToSource();

        for ($deckIndex = 0; $deckIndex < $deckCount; $deckIndex++) {
            $this->cards->shuffle($this->sourceLocation($deckIndex));
        }

        $this->setGameStateValue('went_out_player_id', 0);
        $this->setGameStateValue('in_final_turns', 0);

        foreach ($playerIds as $playerIndex => $playerId) {
            $split = Cards::balancedDealSplit(Cards::HAND_SIZE, $deckCount, $playerIndex);

            for ($deckIndex = 0; $deckIndex < $deckCount; $deckIndex++) {
                if ($split[$deckIndex] > 0) {
                    $this->pickFromSourceDeck($deckIndex, $split[$deckIndex], $playerId);
                }
            }

            $this->setupPlayerTable($playerId);
        }

        $round = (int) $this->getGameStateValue('round_number');
        $this->bga->notify->all('roundStarted', clienttranslate('Round ${round} begins'), [
            'round' => $round,
            'starterPlayerId' => (int) $this->getGameStateValue('starter_player_id'),
            'handCounts' => $this->getPublicHandCounts(),
            'cardCounts' => $this->getPublicCardCounts(),
            'tableSlots' => $this->getPublicTableSlots(),
            'middle' => [],
            'inFinalTurns' => false,
        ]);

        foreach ($playerIds as $playerId) {
            $hand = Cards::sortByRank(array_map([$this, 'enrichCard'], $this->cards->getCardsInLocation('hand', $playerId)));
            $this->bga->notify->player($playerId, 'handUpdated', clienttranslate('New hand dealt'), [
                'cards' => $hand,
            ]);
        }
    }

    public function setupPlayerTable(int $playerId): void
    {
        $handCards = array_values($this->cards->getCardsInLocation('hand', $playerId));
        $handIds = array_map(fn($c) => (int) $c['id'], $handCards);

        for ($slot = 0; $slot < Cards::TABLE_SLOTS; $slot++) {
            if (!isset($handIds[$slot])) {
                break;
            }
            $this->cards->moveCard($handIds[$slot], 'table_down', Cards::slotArg($playerId, $slot));
        }

        $remaining = array_values($this->cards->getCardsInLocation('hand', $playerId));
        $remainingIds = array_map(fn($c) => (int) $c['id'], $remaining);

        for ($slot = 0; $slot < Cards::TABLE_SLOTS; $slot++) {
            if (!isset($remainingIds[$slot])) {
                break;
            }
            $this->cards->moveCard($remainingIds[$slot], 'table_up', Cards::slotArg($playerId, $slot));
        }
    }

    public function scoreRoundAndAdvance(): bool
    {
        $roundScores = [];
        $playerIds = array_map('intval', array_keys($this->loadPlayersBasicInfos()));

        foreach ($playerIds as $playerId) {
            $remaining = array_values(array_merge(
                $this->cards->getCardsInLocation('hand', $playerId),
                $this->getPlayerTableCards($playerId),
            ));
            $points = Cards::scoreCards($remaining);
            $roundScores[$playerId] = [
                'points' => $points,
                'cards' => $remaining,
            ];

            if ($points > 0) {
                $this->bga->playerScore->inc($playerId, $points);
            }
        }

        $this->bga->notify->all('roundEnded', clienttranslate('Round ${round} ends'), [
            'round' => (int) $this->getGameStateValue('round_number'),
            'roundScores' => array_map(fn(array $entry) => $entry['points'], $roundScores),
            'players' => $this->getCollectionFromDb(
                "SELECT `player_id` AS `id`, `player_score` AS `score` FROM `player`"
            ),
        ]);

        foreach ($roundScores as $playerId => $entry) {
            $points = $entry['points'];
            if ($points === 0) {
                $this->bga->notify->all('roundScore', clienttranslate('${player_name} scores 0'), [
                    'player_id' => (int) $playerId,
                    'points' => 0,
                ]);
                continue;
            }

            $labels = array_map(fn(array $card) => Cards::formatCardLabel($card), $entry['cards']);
            $this->bga->notify->all(
                'roundScore',
                clienttranslate('${player_name} scores ${points}: ${cards_label}'),
                [
                    'player_id' => (int) $playerId,
                    'points' => $points,
                    'cards_label' => implode(', ', $labels),
                ]
            );
        }

        $round = (int) $this->getGameStateValue('round_number');
        if ($round >= count($playerIds)) {
            return true;
        }

        $this->setGameStateValue('round_number', $round + 1);

        $starterId = (int) $this->getGameStateValue('starter_player_id');
        $nextTable = $this->getNextPlayerTable();
        $this->setGameStateValue('starter_player_id', $nextTable[$starterId]);

        return false;
    }

    public function getMiddleCards(): array
    {
        $cards = array_values($this->cards->getCardsInLocation('middle'));
        usort(
            $cards,
            fn(array $a, array $b) => ((int) $a['location_arg']) <=> ((int) $b['location_arg'])
        );

        return $cards;
    }

    public function getPlayerTableCards(int $playerId): array
    {
        $cards = [];
        for ($slot = 0; $slot < Cards::TABLE_SLOTS; $slot++) {
            $arg = Cards::slotArg($playerId, $slot);
            $down = $this->cards->getCardsInLocation('table_down', $arg);
            $up = $this->cards->getCardsInLocation('table_up', $arg);
            $cards = array_merge($cards, $down, $up);
        }

        return $cards;
    }

    public function getPlayerCardCount(int $playerId): int
    {
        return $this->cards->countCardsInLocation('hand', $playerId)
            + count($this->getPlayerTableCards($playerId));
    }

    public function playerHasNoCards(int $playerId): bool
    {
        return $this->getPlayerCardCount($playerId) === 0;
    }

    public function handlePlayerWentOut(int $playerId): void
    {
        if ((int) $this->getGameStateValue('went_out_player_id') !== 0) {
            return;
        }

        $this->setGameStateValue('went_out_player_id', $playerId);
        $this->setGameStateValue('in_final_turns', 1);

        $this->bga->notify->all('playerWentOut', clienttranslate('${player_name} is out! Everyone gets one last turn.'), [
            'player_id' => $playerId,
        ]);
    }

    public function enrichCard(array $card): array
    {
        return [
            'id' => (int) $card['id'],
            'type' => $card['type'],
            'type_arg' => (int) $card['type_arg'],
            'suit' => Cards::SUITS[Cards::cardSuitIndex($card)],
            'suitIndex' => Cards::cardSuitIndex($card),
            'label' => Cards::formatCardLabel($card),
            'strength' => Cards::rankStrength($card['type']),
            'points' => Cards::rankPoints($card['type']),
        ];
    }

    public function getTableSlotsForPlayer(int $playerId, int $viewerId): array
    {
        $slots = [];

        for ($slot = 0; $slot < Cards::TABLE_SLOTS; $slot++) {
            $arg = Cards::slotArg($playerId, $slot);
            $downCards = array_values($this->cards->getCardsInLocation('table_down', $arg));
            $upCards = array_values($this->cards->getCardsInLocation('table_up', $arg));

            $slotData = [
                'slot' => $slot,
                'hasDown' => count($downCards) > 0,
                'up' => null,
            ];

            if (count($upCards) > 0) {
                $slotData['up'] = $this->enrichCard($upCards[0]);
            }

            $slots[] = $slotData;
        }

        return $slots;
    }

    public function getPlayableCardsForPlayer(int $playerId): array
    {
        $middle = $this->getMiddleCards();
        $topGroup = Cards::getTopGroup($middle);
        $middleEmpty = $middle === [];
        $playable = [];

        $handCards = $this->cards->getCardsInLocation('hand', $playerId);
        foreach ($handCards as $card) {
            $rank = Cards::cardRank($card);
            if (Cards::canPlayRankOnMiddle($rank, $topGroup['rank'], $middleEmpty)) {
                $playable[(int) $card['id']] = $this->enrichCard($card);
            }
        }

        for ($slot = 0; $slot < Cards::TABLE_SLOTS; $slot++) {
            $arg = Cards::slotArg($playerId, $slot);
            $upCards = array_values($this->cards->getCardsInLocation('table_up', $arg));
            if (count($upCards) === 0) {
                continue;
            }
            $card = $upCards[0];
            $rank = Cards::cardRank($card);
            if (Cards::canPlayRankOnMiddle($rank, $topGroup['rank'], $middleEmpty)) {
                $playable[(int) $card['id']] = $this->enrichCard($card);
            }
        }

        return $playable;
    }

    public function getBlindableSlots(int $playerId): array
    {
        $slots = [];
        for ($slot = 0; $slot < Cards::TABLE_SLOTS; $slot++) {
            $arg = Cards::slotArg($playerId, $slot);
            $hasDown = $this->cards->countCardsInLocation('table_down', $arg) > 0;
            $hasUp = $this->cards->countCardsInLocation('table_up', $arg) > 0;
            if ($hasDown && !$hasUp) {
                $slots[] = $slot;
            }
        }

        return $slots;
    }

    /**
     * @param int[] $cardIds
     * @return array{stay: bool, next: bool}
     */
    public function finalizePlay(
        int $playerId,
        array $playedCards,
        array $topGroupBefore,
        bool $notifyPlay = true,
        bool $fromBlindFailure = false,
    ): array {
        $rank = Cards::cardRank($playedCards[0]);
        $cardIds = array_map(fn($c) => (int) $c['id'], $playedCards);

        if ($notifyPlay) {
            $labels = array_map(fn($c) => Cards::formatCardLabel($c), $playedCards);
            $this->bga->notify->all('cardsPlayed', clienttranslate('${player_name} plays ${cards_label}'), [
                'player_id' => $playerId,
                'card_ids' => $cardIds,
                'cards' => array_map([$this, 'enrichCard'], $playedCards),
                'cards_label' => implode(', ', $labels),
                'cardCounts' => $this->getPublicCardCounts(),
                'handCounts' => $this->getPublicHandCounts(),
                'tableSlots' => $this->getPublicTableSlots(),
            ]);
        }

        if ($fromBlindFailure) {
            $this->pickUpMiddleToPlayer($playerId);

            return ['stay' => true, 'next' => false];
        }

        // Scoop if tens were played, or the contiguous top group is now exactly 4
        $topAfter = Cards::getTopGroup($this->getMiddleCards());
        $scooped = ($rank === '10')
            || ($topAfter['rank'] === $rank && $topAfter['count'] === 4);

        if ($scooped) {
            $this->scoopMiddle($playerId);

            return ['stay' => true, 'next' => false];
        }

        if ($this->playerHasNoCards($playerId)) {
            $this->handlePlayerWentOut($playerId);
        }

        return ['stay' => false, 'next' => true];
    }

    public function scoopMiddle(int $playerId): void
    {
        $middleIds = array_map(fn($c) => (int) $c['id'], $this->getMiddleCards());
        if ($middleIds !== []) {
            $this->cards->moveCards($middleIds, 'discard', 0);
        }

        $this->bga->notify->all('scoop', clienttranslate('${player_name} scoops the pile!'), [
            'player_id' => $playerId,
        ]);
    }

    public function pickUpMiddleToPlayer(int $playerId): void
    {
        $middle = $this->getMiddleCards();
        $middleIds = array_map(fn($c) => (int) $c['id'], $middle);
        $pickedCount = count($middleIds);

        if ($middleIds !== []) {
            $this->cards->moveCards($middleIds, 'hand', $playerId);
        }

        $this->bga->notify->all('pickup', clienttranslate('${player_name} picks up the pile'), [
            'player_id' => $playerId,
            'card_count' => $pickedCount,
            'cardCounts' => $this->getPublicCardCounts(),
            'handCounts' => $this->getPublicHandCounts(),
            'tableSlots' => $this->getPublicTableSlots(),
        ]);

        if ($pickedCount > 0) {
            $fullHand = Cards::sortByRank(array_map(
                [$this, 'enrichCard'],
                $this->cards->getCardsInLocation('hand', $playerId)
            ));
            $this->bga->notify->player($playerId, 'handUpdated', clienttranslate('You picked up ${n} cards'), [
                'cards' => $fullHand,
                'n' => $pickedCount,
            ]);
        }
    }

    /**
     * @param int[] $cardIds
     */
    public function validatePlayCards(int $playerId, array $cardIds): array
    {
        if ($cardIds === []) {
            throw new UserException(clienttranslate('You must select at least one card'));
        }

        $cardIds = array_values(array_unique(array_map('intval', $cardIds)));
        $cards = [];
        $ranks = [];

        foreach ($cardIds as $cardId) {
            $card = $this->getCardFromPlayerSources($playerId, $cardId);
            if ($card === null) {
                throw new UserException(clienttranslate('Invalid card selection'));
            }
            $cards[] = $card;
            $ranks[] = Cards::cardRank($card);
        }

        if (count(array_unique($ranks)) !== 1) {
            throw new UserException(clienttranslate('All played cards must be the same rank'));
        }

        $rank = $ranks[0];
        $middle = $this->getMiddleCards();
        $topGroup = Cards::getTopGroup($middle);
        $middleEmpty = $middle === [];

        if (!Cards::canPlayRankOnMiddle($rank, $topGroup['rank'], $middleEmpty)) {
            throw new UserException(clienttranslate('That rank is too high to play on the pile'));
        }

        $availableSameRank = $this->countAvailableCardsOfRank($playerId, $rank, true);
        if (count($cardIds) > $availableSameRank) {
            throw new UserException(clienttranslate('You do not have that many cards of this rank'));
        }

        $topGroupCountForRank = ($topGroup['rank'] === $rank) ? $topGroup['count'] : 0;
        $maxPlay = Cards::maxPlayCountWithoutOverComplete($topGroupCountForRank, $availableSameRank);
        if (count($cardIds) > $maxPlay) {
            throw new UserException(clienttranslate('You cannot play more than four of the same rank on the pile'));
        }

        return $cards;
    }

    public function getCardFromPlayerSources(int $playerId, int $cardId): ?array
    {
        $hand = $this->cards->getCardsInLocation('hand', $playerId);
        foreach ($hand as $card) {
            if ((int) $card['id'] === $cardId) {
                return $card;
            }
        }

        for ($slot = 0; $slot < Cards::TABLE_SLOTS; $slot++) {
            $arg = Cards::slotArg($playerId, $slot);
            $up = array_values($this->cards->getCardsInLocation('table_up', $arg));
            foreach ($up as $card) {
                if ((int) $card['id'] === $cardId) {
                    return $card;
                }
            }
        }

        return null;
    }

    public function countAvailableCardsOfRank(int $playerId, string $rank, bool $includeFaceUp = true): int
    {
        $count = 0;
        foreach ($this->cards->getCardsInLocation('hand', $playerId) as $card) {
            if (Cards::cardRank($card) === $rank) {
                $count++;
            }
        }

        if ($includeFaceUp) {
            for ($slot = 0; $slot < Cards::TABLE_SLOTS; $slot++) {
                $arg = Cards::slotArg($playerId, $slot);
                $up = array_values($this->cards->getCardsInLocation('table_up', $arg));
                if (count($up) > 0 && Cards::cardRank($up[0]) === $rank) {
                    $count++;
                }
            }
        }

        return $count;
    }

    /**
     * Cards the active player may still add after a revealed face-down play.
     *
     * @return array{rank: string, topCount: int, maxAdd: int, cardIds: int[], cards: array}
     */
    public function getMatchingAddInfo(int $playerId): array
    {
        $topGroup = Cards::getTopGroup($this->getMiddleCards());
        $rank = $topGroup['rank'] ?? '';
        $topCount = (int) ($topGroup['count'] ?? 0);

        if ($rank === '' || $topCount < 1) {
            return [
                'rank' => $rank,
                'topCount' => $topCount,
                'maxAdd' => 0,
                'cardIds' => [],
                'cards' => [],
            ];
        }

        $cards = [];
        $cardIds = [];

        foreach ($this->cards->getCardsInLocation('hand', $playerId) as $card) {
            if (Cards::cardRank($card) === $rank) {
                $enriched = $this->enrichCard($card);
                $cards[] = $enriched;
                $cardIds[] = (int) $card['id'];
            }
        }

        for ($slot = 0; $slot < Cards::TABLE_SLOTS; $slot++) {
            $arg = Cards::slotArg($playerId, $slot);
            $up = array_values($this->cards->getCardsInLocation('table_up', $arg));
            if (count($up) > 0 && Cards::cardRank($up[0]) === $rank) {
                $enriched = $this->enrichCard($up[0]);
                $cards[] = $enriched;
                $cardIds[] = (int) $up[0]['id'];
            }
        }

        $maxAdd = Cards::maxPlayCountWithoutOverComplete($topCount, count($cardIds));

        return [
            'rank' => $rank,
            'topCount' => $topCount,
            'maxAdd' => $maxAdd,
            'cardIds' => $cardIds,
            'cards' => $cards,
        ];
    }

    public function getDownCard(int $playerId, int $slot): ?array
    {
        $arg = Cards::slotArg($playerId, $slot);
        $down = array_values($this->cards->getCardsInLocation('table_down', $arg));

        return count($down) > 0 ? $down[0] : null;
    }

    public function moveCardsToMiddle(array $cards): void
    {
        foreach ($cards as $card) {
            $this->cards->insertCardOnExtremePosition((int) $card['id'], 'middle', true);
        }
    }

    public function debug_goToState(int $state = 3): void
    {
        $this->gamestate->jumpToState($state);
    }
}
