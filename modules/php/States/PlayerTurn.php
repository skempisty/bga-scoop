<?php

declare(strict_types=1);

namespace Bga\Games\Scoop\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\Actions\Types\IntArrayParam;
use Bga\GameFramework\UserException;
use Bga\Games\Scoop\Cards;
use Bga\Games\Scoop\Game;

class PlayerTurn extends GameState
{
    public function __construct(
        protected Game $game,
    ) {
        parent::__construct($game,
            id: 10,
            type: StateType::ACTIVE_PLAYER,
        );
    }

    public function getArgs(): array
    {
        $playerId = (int) $this->game->getActivePlayerId();
        $playable = $this->game->getPlayableCardsForPlayer($playerId);
        $middle = $this->game->getMiddleCards();
        $topGroup = Cards::getTopGroup($middle);

        return [
            'playableCardIds' => array_keys($playable),
            'playableCards' => array_values($playable),
            'blindSlots' => $this->game->getBlindableSlots($playerId),
            'canPickUp' => count($middle) > 0,
            'middleCount' => count($middle),
            'middleTopRank' => $topGroup['rank'],
            'middleTopCount' => $topGroup['count'],
            'inFinalTurns' => (int) $this->game->getGameStateValue('in_final_turns') === 1,
            'round' => (int) $this->game->getGameStateValue('round_number'),
            'numRounds' => $this->game->getPlayersNumber(),
        ];
    }

    /**
     * @param int[] $card_ids
     */
    #[PossibleAction]
    public function actPlayCards(
        #[IntArrayParam(min: 1, max: 4)] array $card_ids,
        int $activePlayerId,
        array $args,
    ) {
        $cards = $this->game->validatePlayCards($activePlayerId, $card_ids);
        $topGroupBefore = Cards::getTopGroup($this->game->getMiddleCards());
        $this->game->moveCardsToMiddle($cards);

        $result = $this->game->finalizePlay($activePlayerId, $cards, $topGroupBefore);

        if ($result['stay']) {
            return self::class;
        }

        return NextPlayer::class;
    }

    #[PossibleAction]
    public function actPickUp(int $activePlayerId)
    {
        $middle = $this->game->getMiddleCards();
        if ($middle === []) {
            throw new UserException(clienttranslate('There is nothing to pick up'));
        }

        $this->game->pickUpMiddleToPlayer($activePlayerId);

        return self::class;
    }

    /**
     * @param int[] $extra_card_ids
     */
    #[PossibleAction]
    public function actPlayBlind(
        int $slot,
        #[IntArrayParam(min: 0, max: 3)] array $extra_card_ids,
        int $activePlayerId,
        array $args,
    ) {
        $blindSlots = $this->game->getBlindableSlots($activePlayerId);
        if (!in_array($slot, $blindSlots, true)) {
            throw new UserException(clienttranslate('You cannot play from that face-down slot'));
        }

        $downCard = $this->game->getDownCard($activePlayerId, $slot);
        if ($downCard === null) {
            throw new UserException(clienttranslate('No face-down card in that slot'));
        }

        $revealedRank = Cards::cardRank($downCard);
        $extra_card_ids = array_values(array_unique(array_map('intval', $extra_card_ids)));

        $extraCards = [];
        foreach ($extra_card_ids as $cardId) {
            $card = $this->game->getCardFromPlayerSources($activePlayerId, $cardId);
            if ($card === null) {
                throw new UserException(clienttranslate('Invalid extra card selection'));
            }
            if (Cards::cardRank($card) !== $revealedRank) {
                throw new UserException(clienttranslate('Extra cards must match the revealed rank'));
            }
            $extraCards[] = $card;
        }

        $allCards = array_merge([$downCard], $extraCards);
        $middle = $this->game->getMiddleCards();
        $topGroupBefore = Cards::getTopGroup($middle);
        $middleEmpty = $middle === [];
        $illegalBlind = !Cards::canPlayRankOnMiddle($revealedRank, $topGroupBefore['rank'], $middleEmpty);

        $effectiveTopCount = ($topGroupBefore['rank'] === $revealedRank) ? $topGroupBefore['count'] : 0;
        $availableSameRank = 1 + $this->game->countAvailableCardsOfRank($activePlayerId, $revealedRank, true);
        $maxPlay = Cards::maxPlayCountWithoutOverComplete($effectiveTopCount, $availableSameRank);
        if (count($allCards) > $maxPlay) {
            throw new UserException(clienttranslate('You cannot play more than four of the same rank on the pile'));
        }

        $this->game->cards->moveCard((int) $downCard['id'], 'middle', 0);
        foreach ($extraCards as $card) {
            $this->game->cards->insertCardOnExtremePosition((int) $card['id'], 'middle', true);
        }

        $this->bga->notify->all('blindPlayed', clienttranslate('${player_name} plays a face-down card: ${cards_label}'), [
            'player_id' => $activePlayerId,
            'slot' => $slot,
            'cards' => array_map([$this->game, 'enrichCard'], $allCards),
            'cards_label' => implode(', ', array_map(fn($c) => Cards::formatCardLabel($c), $allCards)),
            'illegal' => $illegalBlind,
        ]);

        $result = $this->game->finalizePlay(
            $activePlayerId,
            $allCards,
            $topGroupBefore,
            notifyPlay: false,
            fromBlindFailure: $illegalBlind,
        );

        if ($result['stay']) {
            return self::class;
        }

        return NextPlayer::class;
    }

    public function zombie(int $playerId)
    {
        $args = $this->getArgs();

        if ($args['canPickUp']) {
            return $this->actPickUp($playerId);
        }

        if ($args['playableCardIds'] !== []) {
            $cardId = $args['playableCardIds'][0];

            return $this->actPlayCards([$cardId], $playerId, $args);
        }

        return NextPlayer::class;
    }
}
