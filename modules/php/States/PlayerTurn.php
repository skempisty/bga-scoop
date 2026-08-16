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
            description: clienttranslate('${actplayer} must play cards or pick up the pile'),
            descriptionMyTurn: clienttranslate('${you} must play cards or pick up the pile'),
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

    #[PossibleAction]
    public function actPlayBlind(
        int $slot,
        int $activePlayerId = 0,
        array $args = [],
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
        $middle = $this->game->getMiddleCards();
        $topGroupBefore = Cards::getTopGroup($middle);
        $middleEmpty = $middle === [];
        $illegalBlind = !Cards::canPlayRankOnMiddle($revealedRank, $topGroupBefore['rank'], $middleEmpty);

        $this->game->cards->insertCardOnExtremePosition((int) $downCard['id'], 'middle', true);

        $topAfter = Cards::getTopGroup($this->game->getMiddleCards());
        $scooped = !$illegalBlind && (
            ($revealedRank === '10')
            || ($topAfter['rank'] === $revealedRank && $topAfter['count'] === 4)
        );
        $mayAddMatching = !$illegalBlind && !$scooped
            && $this->game->getMatchingAddInfo($activePlayerId)['maxAdd'] > 0;

        $this->bga->notify->all('blindPlayed', clienttranslate('${player_name} plays a face-down card: ${cards_label}'), [
            'player_id' => $activePlayerId,
            'slot' => $slot,
            'cards' => [$this->game->enrichCard($downCard)],
            'cards_label' => Cards::formatCardLabel($downCard),
            'illegal' => $illegalBlind,
            'mayAddMatching' => $mayAddMatching,
            'cardCounts' => $this->game->getPublicCardCounts(),
            'handCounts' => $this->game->getPublicHandCounts(),
            'tableSlots' => $this->game->getPublicTableSlots(),
        ]);

        if ($illegalBlind) {
            $this->game->pickUpMiddleToPlayer($activePlayerId);

            return self::class;
        }

        if ($scooped) {
            $this->game->scoopMiddle($activePlayerId);

            if ($this->game->playerHasNoCards($activePlayerId)) {
                $this->game->handlePlayerWentOut($activePlayerId);

                return NextPlayer::class;
            }

            return self::class;
        }

        if ($mayAddMatching) {
            return AddMatching::class;
        }

        if ($this->game->playerHasNoCards($activePlayerId)) {
            $this->game->handlePlayerWentOut($activePlayerId);
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
